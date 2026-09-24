// Що саме бот витягує з чужої сторінки.
//
// Кожна фікстура — це розмітка, яку реально ставлять магазини: JSON-LD із
// Rozetka-подібним заголовком, старий OpenCart на мікроданих, Shopify з самим
// OpenGraph, сторінка без розмітки взагалі та ще й у windows-1251. Перевіряємо
// не «не впало», а що саме людина побачить у картці подарунка.

import { parseLinkPreview, decodeHtml, cleanTitle } from "../../src/lib/scrape.js";
import {
  applyGiftCard,
  buildPageContext,
  readAnswer,
  suggestGiftCard,
  type GiftCardSuggestion,
  type PageContext,
} from "../../src/lib/gift-card.js";
import { parsePrice, formatPrice, structurePrice } from "../../src/lib/price.js";

const failures: string[] = [];

/** Intl групує тисячі нерозривним пробілом — на екрані це той самий пробіл. */
const NBSP = new RegExp("[\\u00A0\\u202F\\u2009]", "g");
const plain = (value: unknown) =>
  typeof value === "string" ? value.replace(NBSP, " ") : value;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = plain(actual) === plain(expected);
  if (ok) {
    console.log(`  OK  ${name}`);
  } else {
    console.log(`  FAIL ${name}`);
    console.log(`       очікував: ${JSON.stringify(expected)}`);
    console.log(`       отримав:  ${JSON.stringify(actual)}`);
    failures.push(name);
  }
}

function group(title: string) {
  console.log(`\n== ${title}`);
}

/** cp1251 для фікстури: Node вміє лише декодувати, а нам треба зібрати байти. */
const CP1251_EXTRA: Record<string, number> = {
  "і": 0xb3, "І": 0xb2, "ї": 0xbf, "Ї": 0xaf, "є": 0xba, "Є": 0xaa,
  "ґ": 0xb4, "Ґ": 0xa5, "—": 0x97, "·": 0xb7,
};

function toCp1251(text: string): Buffer {
  return Buffer.from(
    [...text].map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 128) return code;
      if (CP1251_EXTRA[ch] !== undefined) return CP1251_EXTRA[ch];
      if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
      return 0x3f;
    }),
  );
}

const url = (href: string) => new URL(href);

// 1. JSON-LD, як у більшості великих магазинів.
group("JSON-LD Product + og:title із назвою магазину");
{
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Навушники Sony WH-1000XM6 Black",
    brand: { "@type": "Brand", name: "Sony" },
    image: ["https://content.rozetka.com.ua/goods/images/big/123.jpg"],
    offers: { "@type": "Offer", price: "12999", priceCurrency: "UAH", availability: "InStock" },
  });
  const html = `<!doctype html><html><head>
    <meta property="og:site_name" content="ROZETKA">
    <meta property="og:title" content="Купити Навушники Sony WH-1000XM6 Black — інтернет-магазин ROZETKA">
    <meta property="og:image" content="//content.rozetka.com.ua/goods/images/big/123.jpg">
    <script type="application/ld+json">${jsonLd}</script>
    </head><body><div class="product-price__big">12 999<span>₴</span></div></body></html>`;

  const preview = parseLinkPreview(html, url("https://rozetka.com.ua/p123/"))!;
  check("назва без «Купити» і без магазину", preview.title, "Навушники Sony WH-1000XM6 Black");
  check("ціна канонічна", preview.price, "12 999 ₴");
  check("структурована ціна: сума", preview.priceAmount, 12999);
  check("структурована ціна: валюта", preview.priceCurrency, "UAH");
  check("магазин", preview.store, "ROZETKA");
  check("фото абсолютне", preview.imageUrl, "https://content.rozetka.com.ua/goods/images/big/123.jpg");
}

// 2. Бренд, якого немає в назві.
group("JSON-LD: бренд додається до назви");
{
  const jsonLd = JSON.stringify({
    "@type": "Product",
    name: "WH-1000XM6",
    brand: "Sony",
    offers: { "@type": "Offer", price: 12999.0, priceCurrency: "UAH" },
  });
  const html = `<html><head><script type="application/ld+json">${jsonLd}</script></head><body></body></html>`;

  const preview = parseLinkPreview(html, url("https://shop.ua/x"))!;
  check("бренд попереду", preview.title, "Sony WH-1000XM6");
  check("ціла ціна без копійок", preview.price, "12 999 ₴");
}

// 3. @graph + AggregateOffer.
group("@graph з AggregateOffer (варіанти товару)");
{
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Comfy" },
      { "@type": "BreadcrumbList", itemListElement: [] },
      {
        "@type": "Product",
        name: "Кавоварка De'Longhi ECAM",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "18999.00",
          highPrice: "24999.00",
          priceCurrency: "UAH",
        },
      },
    ],
  });
  const html = `<html><head><script type="application/ld+json">${jsonLd}</script></head><body></body></html>`;

  const preview = parseLinkPreview(html, url("https://comfy.ua/x"))!;
  check("назва з Product, не з Organization", preview.title, "Кавоварка De'Longhi ECAM");
  check("показуємо нижню межу", preview.price, "18 999 ₴");
  check("структурована сума — нижня межа, не верхня", preview.priceAmount, 18999);
  check("магазин з Organization", preview.store, "Comfy");
}

// 4. Кілька Offer: беремо найдешевший.
group("масив Offer — найдешевший варіант");
{
  const jsonLd = JSON.stringify({
    "@type": "Product",
    name: "Футболка",
    offers: [
      { "@type": "Offer", price: "899", priceCurrency: "UAH" },
      { "@type": "Offer", price: "749", priceCurrency: "UAH" },
      { "@type": "Offer", price: "1099", priceCurrency: "UAH" },
    ],
  });
  const html = `<html><head><script type="application/ld+json">${jsonLd}</script></head><body></body></html>`;
  check("найдешевший варіант", parseLinkPreview(html, url("https://s.ua/x"))!.price, "749 ₴");
}

// 5. Мікродані (старі OpenCart / PrestaShop).
group("мікродані itemprop");
{
  const html = `<html><head><title>Чайник Bosch TWK — Мій Магазин</title>
    <meta property="og:site_name" content="Мій Магазин"></head>
    <body itemscope itemtype="http://schema.org/Product">
      <h1 itemprop="name">Чайник Bosch TWK 7203</h1>
      <img itemprop="image" src="/img/kettle.jpg">
      <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
        <meta itemprop="priceCurrency" content="UAH">
        <span itemprop="price" content="1899.00">1 899 грн</span>
      </div>
    </body></html>`;

  const preview = parseLinkPreview(html, url("https://myshop.com.ua/kettle"))!;
  check("назва з мікроданих", preview.title, "Чайник Bosch TWK 7203");
  check("ціна з content-атрибута", preview.price, "1 899 ₴");
  check("фото з відносного шляху", preview.imageUrl, "https://myshop.com.ua/img/kettle.jpg");
}

// 6. Тільки OpenGraph (Shopify).
group("тільки OpenGraph");
{
  const html = `<html><head>
    <meta property="og:title" content="Ceramic Mug | Nordic Store">
    <meta property="og:site_name" content="Nordic Store">
    <meta property="product:price:amount" content="24.90">
    <meta property="product:price:currency" content="EUR">
    <meta property="og:image" content="https://cdn.shop/mug.png">
    </head><body></body></html>`;

  const preview = parseLinkPreview(html, url("https://nordic.store/mug"))!;
  check("хвіст із назвою магазину прибрано", preview.title, "Ceramic Mug");
  check("євро з копійками", preview.price, "24,90 €");
}

// 7. Без розмітки: DOM зі старою ціною і доставкою.
group("без розмітки — DOM, стара ціна поруч");
{
  const html = `<html><head><title>Рюкзак Xiaomi</title></head><body>
      <h1>Рюкзак Xiaomi Mi Casual</h1>
      <div class="prices">
        <span class="price-old">1 299 ₴</span>
        <span class="price-new">899 ₴</span>
      </div>
      <div class="delivery-price">Доставка 79 ₴</div>
    </body></html>`;

  const preview = parseLinkPreview(html, url("https://bagshop.ua/mi"))!;
  check("назва з h1", preview.title, "Рюкзак Xiaomi Mi Casual");
  check("актуальна ціна, не стара і не доставка", preview.price, "899 ₴");
}

// 8. windows-1251.
group("windows-1251 без BOM");
{
  const source = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251">
    <title>Ковдра пухова</title></head>
    <body><h1>Ковдра пухова біла</h1><div class="price">2 450 грн</div></body></html>`;

  const decoded = decodeHtml(toCp1251(source), "text/html");
  const preview = parseLinkPreview(decoded, url("https://textile.ua/kovdra"))!;
  check("кирилиця не побилася", preview.title, "Ковдра пухова біла");
  check("ціна з тексту", preview.price, "2 450 ₴");
}

// 9. Поламаний JSON-LD не має ламати решту.
group("поламаний JSON-LD + робочий OpenGraph");
{
  const html = `<html><head>
    <script type="application/ld+json">{ "@type": "Product", name: НЕ JSON }</script>
    <meta property="og:title" content="Лампа настільна">
    <meta property="product:price:amount" content="750">
    <meta property="product:price:currency" content="UAH">
    </head><body></body></html>`;

  const preview = parseLinkPreview(html, url("https://light.ua/lamp"))!;
  check("впали назад на OpenGraph", preview.title, "Лампа настільна");
  check("ціна є", preview.price, "750 ₴");
}

// 10. Граничні випадки назви.
group("назва: що не можна ламати");
{
  check(
    "дефіс у моделі зберігається",
    cleanTitle("Навушники Sony WH-1000XM6", "ROZETKA", "rozetka.com.ua"),
    "Навушники Sony WH-1000XM6",
  );
  check(
    "хвіст без назви магазину не чіпаємо",
    cleanTitle("Кавоварка — червона", "Comfy", "comfy.ua"),
    "Кавоварка — червона",
  );
  check(
    "два хвости поспіль",
    cleanTitle("Ноутбук ASUS — купити в Києві — ROZETKA", "ROZETKA", "rozetka.com.ua"),
    "Ноутбук ASUS",
  );
  check(
    "заголовок із самої назви магазину лишається",
    cleanTitle("ROZETKA", "ROZETKA", "rozetka.com.ua"),
    "ROZETKA",
  );
  check(
    "магазин у домені, а не в og:site_name",
    cleanTitle("Термос Stanley | epicentrk", null, "epicentrk.ua"),
    "Термос Stanley",
  );
  // Справжній og:title з epicentrk.ua — три чверті рядка це SEO.
  check(
    "декоративний префікс і подвійний SEO-хвіст",
    cleanTitle(
      "ᐉ Сковорода для млинців Krauff Essen 24 см 25-45-241 • Краща ціна в Києві, Україні • Купити в Епіцентр",
      null,
      "epicentrk.ua",
    ),
    "Сковорода для млинців Krauff Essen 24 см 25-45-241",
  );
  check(
    "«ціна» всередині хвоста, а не на початку",
    cleanTitle("Ноутбук ASUS • Найкраща ціна в Україні", null, "shop.ua"),
    "Ноутбук ASUS",
  );
}

// 11. Валюти, які реально трапляються.
group("валюти");
{
  const money = (text: string) => {
    const parsed = parsePrice(text);
    return parsed ? formatPrice(parsed) : null;
  };
  check("гривня словом", money("2 450 грн"), "2 450 ₴");
  check("долар перед числом", money("$1,299.99"), "1 299,99 $");
  check("злотий", money("199,99 zł"), "199,99 zł");
  check("фунт", money("£45"), "45 £");
  check("ISO-код позаду", money("49.99 USD"), "49,99 $");
  check("акційна поруч зі старою", money("15 999 ₴ 12 999 ₴"), "12 999 ₴");
  check("не ціна, з вимогою валюти", parsePrice("Артикул 123456", { requireCurrency: true }), null);
}

// 11a. Ручне введення ціни — те, що зберігається в price/priceAmount/priceCurrency.
group("structurePrice — ручне введення ціни власником");
{
  const clean = structurePrice("2 450 грн")!;
  check("канонічний текст", clean.text, "2 450 ₴");
  check("сума", clean.amount, 2450);
  check("валюта", clean.currency, "UAH");

  // "від 12 999 ₴" читається як 12999 — "від" не заважає побачити число.
  check("«від» не заважає розпізнати суму", structurePrice("від 12 999 ₴")!.amount, 12999);

  // А от текст зовсім без числа — чесна ціна, просто без нього. Зберігається
  // як є, без структурованих полів, а не відкидається як помилка.
  check("без числа — не структурована", structurePrice("домовимось"), null);
  check("без числа — не структурована 2", structurePrice("ціна за домовленістю"), null);
}

// 12. Картинки, які Telegram не покаже.
group("фото");
{
  const withImage = (src: string) =>
    parseLinkPreview(
      `<html><head><meta property="og:title" content="X"><meta property="og:image" content="${src}"></head><body></body></html>`,
      url("https://shop.ua/p"),
    )!.imageUrl;

  check("protocol-relative добудовується", withImage("//cdn.shop.ua/a.jpg"), "https://cdn.shop.ua/a.jpg");
  check("svg відкидається", withImage("https://cdn.shop.ua/logo.svg"), null);
  check("data: відкидається", withImage("data:image/png;base64,iVBORw0KGgo="), null);
}

// 13. Назва від моделі — чотири реальні провали зі списку 2026-09-21 (#16).
group("картка від моделі: сторінки, де розмітка бреше");
{
  const named = (html: string, href: string, suggestion: GiftCardSuggestion | null) => {
    const finalUrl = url(href);
    const parsed = parseLinkPreview(html, finalUrl)!;
    return applyGiftCard(parsed, suggestion, finalUrl.hostname);
  };

  const say = (name: string | null): GiftCardSuggestion => ({
    name,
    price: null,
    description: null,
    imageUrl: null,
  });

  // 1-2. Магазин без розмітки товару: заголовок вкладки — назва сайту.
  const homeTitle = `<html><head><title>Головна</title></head>
    <body><h1>Головна</h1><p>Свічка соєва ручної роботи «Лаванда», 250 мл — 1 900 грн</p></body></html>`;
  check(
    "«Головна» замінюється назвою від моделі",
    named(homeTitle, "https://kvitka.com.ua/p/12", say("Свічка соєва «Лаванда», 250 мл")).title,
    "Свічка соєва «Лаванда», 250 мл",
  );
  check(
    "без моделі «Головна» не показується зовсім",
    named(homeTitle, "https://kvitka.com.ua/p/12", null).title,
    null,
  );

  // 8. Увесь заголовок — назва магазину.
  const shopName = `<html><head><meta property="og:site_name" content="Інтернет магазин кави">
    <title>Інтернет магазин кави</title></head><body>Кава в зернах Ефіопія Іргачеффе, 500 г</body></html>`;
  check(
    "назва магазину замінюється товаром",
    named(shopName, "https://kava.ua/item/77", say("Кава в зернах Ефіопія Іргачеффе, 500 г")).title,
    "Кава в зернах Ефіопія Іргачеффе, 500 г",
  );
  check("без моделі назва магазину не показується", named(shopName, "https://kava.ua/item/77", null).title, null);

  // 5-6. Instagram загортає підпис у свій шаблон; товар — усередині підпису.
  const instagram = `<html><head><meta property="og:title" content='УКРАЇНСЬКИЙ БРЕНД ОДЯГУ в Instagram: "NEW | Кейп з тканини букле, оверсайз"'>
    </head><body></body></html>`;
  check(
    "підпис Instagram замінюється товаром",
    named(instagram, "https://www.instagram.com/p/ABC/", say("Кейп з тканини букле")).title,
    "Кейп з тканини букле",
  );
  check(
    "без моделі шаблон Instagram не показується",
    named(instagram, "https://www.instagram.com/p/ABC/", null).title,
    null,
  );

  // Контроль: сторінка, яку правила й сьогодні читають правильно.
  const clean = `<html><head><meta property="og:site_name" content="ROZETKA">
    <title>Навушники Sony WH-1000XM6 Black — ROZETKA</title>
    <meta property="product:price:amount" content="12999">
    <meta property="product:price:currency" content="UAH"></head><body></body></html>`;
  const control = named(clean, "https://rozetka.com.ua/p123/", null);
  check("чиста розмітка без моделі не псується", control.title, "Навушники Sony WH-1000XM6 Black");
  check("чиста розмітка: ціна з розмітки", control.price, "12 999 ₴");
}

// 14. Що модель може змінити в картці, а що лишається з розмітки.
group("картка від моделі: межі довіри");
{
  const page: PageContext = {
    prompt: "",
    images: ["https://cdn.shop.ua/tablet.jpg"],
    prices: [
      { amount: 9499, currency: "UAH" },
      { amount: 8999, currency: "UAH" },
    ],
    hasText: true,
    numbers: [9499, 8999],
  };

  // Стара ціна поруч із новою: модель читає сторінку як людина й бере ту, за
  // якою купують сьогодні. Число мусить бути на сторінці — інакше не беремо.
  const chosen = readAnswer(
    '{"name":"Планшет Xiaomi Redmi Pad 2","price":"8999","currency":"UAH","description":"Планшет з 11-дюймовим екраном.","image":0}',
    page,
  )!;
  check("модель обирає актуальну ціну", chosen.price?.text, "8 999 ₴");
  check("фото береться зі списку кандидатів", chosen.imageUrl, "https://cdn.shop.ua/tablet.jpg");
  check("опис лишається людським реченням", chosen.description, "Планшет з 11-дюймовим екраном.");

  // Реальний випадок: на сторінці Allo модель назвала 6 999 ₴ там, де товар
  // коштує 8 999 ₴. Такої суми на сторінці немає — відкидаємо.
  const invented = readAnswer(
    '{"name":"Планшет","price":"6999","currency":"UAH","description":null,"image":null}',
    page,
  )!;
  check("вигадана ціна відкидається", invented.price, null);

  check(
    "неіснуючий номер фото відкидається",
    readAnswer('{"name":"A","price":null,"currency":null,"description":null,"image":7}', page)!.imageUrl,
    null,
  );

  const preview = {
    title: "Головна",
    imageUrl: "https://cdn.shop.ua/banner.jpg",
    price: "9 499 ₴",
    priceAmount: 9499,
    priceCurrency: "UAH",
    store: "allo.ua",
    description: null,
  };
  const merged = applyGiftCard(preview, chosen, "allo.ua");
  check("у картці ціна від моделі", merged.price, "8 999 ₴");
  check("у картці фото від моделі", merged.imageUrl, "https://cdn.shop.ua/tablet.jpg");
  check("у картці опис від моделі", Boolean(merged.description), true);

  const withoutModel = applyGiftCard(preview, null, "allo.ua");
  check("без моделі ціна лишається з розмітки", withoutModel.price, "9 499 ₴");
  check("без моделі опису немає", withoutModel.description, null);
}

// 15. Контекст, який отримує модель: факти, кандидати, текст навколо товару.
group("контекст для моделі");
{
  const html = `<html><head><meta property="og:title" content="Планшет"><script>var x = "Купи зараз";</script>
    <style>.a{color:red}</style></head><body>
    <nav>Каталог Кошик</nav>
    <h1>Планшет Xiaomi Redmi Pad 2</h1>
    <div>9 499 ₴</div><div>8 999 ₴</div><div>375 ₴/міс</div>
    <img src="/logo-60x72.png" alt="лого">
    <img src="https://cdn.allo.ua/tablet.webp" alt="Фото № 1">
    <p>Планшет з 11-дюймовим екраном.</p>
    <footer>© 2026</footer></body></html>`;
  const context = buildPageContext(html, url("https://allo.ua/p/1"), null);

  const amounts = context.prices.map((price) => price.amount);
  check("усі ціни сторінки — кандидати", amounts.includes(8999) && amounts.includes(9499), true);
  check("валюта запам'ятовується разом із сумою", context.prices.some((p) => p.amount === 8999 && p.currency === "UAH"), true);
  check("платіж у кредит теж видно моделі, з оточенням", context.prompt.includes("₴/міс"), true);
  check("мініатюри не пропонуються", context.images.some((i) => i.includes("60x72")), false);
  check("фото товару пропонується", context.images.includes("https://cdn.allo.ua/tablet.webp"), true);
  check("скрипти не йдуть у модель", context.prompt.includes("Купи зараз"), false);
  check("увесь текст сторінки йде в модель", context.prompt.includes("11-дюймовим"), true);
  // Раніше тут вирізалися nav/header/footer — і разом із ними зникала назва
  // товару на темах WordPress, де <h1> лежить усередині <header>.
  check("заголовок у <header> не губиться", buildPageContext(
    `<html><body><header><h1>Кейп з тканини букле</h1></header><p>Оверсайз</p></body></html>`,
    url("https://shop.ua/p"),
    null,
  ).prompt.includes("Кейп з тканини букле"), true);
}

// Без ключа модель не викликається взагалі: перевірка ходить у мережу рівно
// нуль разів, і саме це тут і доводиться.
group("без ключа — жодного виклику");
{
  const key = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;

  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("фікстури не ходять у мережу");
  }) as typeof fetch;

  // hasText: true, so this can only pass because the key is missing — not
  // because the empty-page gate below happened to stop the call first.
  const suggestion = await suggestGiftCard({
    prompt: "Кейп з тканини букле",
    images: [],
    prices: [],
    hasText: true,
    numbers: [],
  });
  check("без ключа відповіді немає", suggestion, null);
  check("без ключа мережі немає", calls, 0);

  globalThis.fetch = realFetch;
  if (key !== undefined) process.env.AI_GATEWAY_API_KEY = key;
}

// Порожня сторінка: з ключем модель однаково не викликається — читати нічого,
// а здогадку з самої адреси потім не відрізнити від факту (#20).
group("порожня сторінка — жодного виклику навіть з ключем");
{
  const key = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "fixture-key";

  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("фікстури не ходять у мережу");
  }) as typeof fetch;

  const empty = buildPageContext("<html><head><title>Makeup</title></head><body></body></html>", new URL("https://makeup.com.ua/ua/product/969935/"), null);
  const suggestion = await suggestGiftCard(empty);
  check("порожня сторінка: відповіді немає", suggestion, null);
  check("порожня сторінка: мережі немає", calls, 0);

  globalThis.fetch = realFetch;
  if (key === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = key;
}

if (failures.length === 0) {
  console.log("\nУсі перевірки пройдено\n");
} else {
  console.log(`\nПровалено ${failures.length}:`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log("");
}
process.exit(failures.length === 0 ? 0 : 1);
