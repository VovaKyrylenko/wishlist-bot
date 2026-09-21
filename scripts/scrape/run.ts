// Що саме бот витягує з чужої сторінки.
//
// Кожна фікстура — це розмітка, яку реально ставлять магазини: JSON-LD із
// Rozetka-подібним заголовком, старий OpenCart на мікроданих, Shopify з самим
// OpenGraph, сторінка без розмітки взагалі та ще й у windows-1251. Перевіряємо
// не «не впало», а що саме людина побачить у картці подарунка.

import { parseLinkPreview, decodeHtml, cleanTitle } from "../../src/lib/scrape.js";
import {
  applyGiftName,
  pageTextForModel,
  readAnswer,
  suggestGiftName,
  type GiftNameSuggestion,
} from "../../src/lib/gift-name.js";
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
group("назва від моделі: сторінки, де розмітка бреше");
{
  const named = (html: string, href: string, suggestion: GiftNameSuggestion | null) => {
    const finalUrl = url(href);
    const parsed = parseLinkPreview(html, finalUrl)!;
    return applyGiftName(parsed, suggestion, finalUrl.hostname);
  };

  const say = (name: string | null): GiftNameSuggestion => ({ name, price: null });

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

// 14. Чия ціна перемагає і що робиться з вигадками моделі.
group("назва від моделі: межі довіри");
{
  const card = {
    title: "Головна",
    imageUrl: null,
    price: "12 999 ₴",
    priceAmount: 12999,
    priceCurrency: "UAH",
    store: "ROZETKA",
  };

  const withModelPrice = applyGiftName(
    card,
    { name: "Навушники Sony", price: { text: "9 999 ₴", amount: 9999, currency: "UAH" } },
    "rozetka.com.ua",
  );
  check("ціна з розмітки сильніша за ціну моделі", withModelPrice.price, "12 999 ₴");
  check("сума з розмітки лишається", withModelPrice.priceAmount, 12999);

  const noMarkupPrice = applyGiftName(
    { ...card, price: null, priceAmount: null, priceCurrency: null },
    { name: "Навушники Sony", price: { text: "9 999 ₴", amount: 9999, currency: "UAH" } },
    "rozetka.com.ua",
  );
  check("без ціни в розмітці береться ціна моделі", noMarkupPrice.price, "9 999 ₴");
  check("без ціни в розмітці береться сума моделі", noMarkupPrice.priceAmount, 9999);

  check("порожня назва від моделі = товару немає", applyGiftName(card, { name: null, price: null }, "rozetka.com.ua").title, null);
}

// 15. Відповідь моделі — це текст із чужої сторінки, а не істина.
group("розбір відповіді моделі");
{
  check("звичайна відповідь", readAnswer('{"name":"Кейп з тканини букле","price":"2400","currency":"UAH"}')!.name, "Кейп з тканини букле");
  check(
    "markdown-огорожа знімається",
    readAnswer('```json\n{"name":"Термокружка Stanley","price":null,"currency":null}\n```')!.name,
    "Термокружка Stanley",
  );
  check("лапки навколо всієї назви знімаються", readAnswer('{"name":"«Кейп букле»","price":null,"currency":null}')!.name, "Кейп букле");
  check("порожня назва — це null", readAnswer('{"name":"","price":null,"currency":null}')!.name, null);
  check("не JSON — нічого", readAnswer("на жаль, не можу"), null);

  // Ціна моделі йде тим самим парсером: «грн» стає UAH, вигляд канонічний.
  const price = readAnswer('{"name":"Кейп","price":"2 400","currency":"грн"}')!.price;
  check("ціна моделі канонізується", price?.text, "2 400 ₴");
  check("валюта моделі за ISO", price?.currency, "UAH");

  // Неправдоподібна сума відкидається, а не показується.
  check("нуль — не ціна", readAnswer('{"name":"Кейп","price":"0","currency":"UAH"}')!.price, null);
  check("сума завбільшки з телефон відкидається", readAnswer('{"name":"Кейп","price":"380671234567","currency":"UAH"}')!.price, null);
  check("ціна без числа відкидається", readAnswer('{"name":"Кейп","price":"договірна","currency":null}')!.price, null);
}

// 16. Що саме надсилається моделі й коли не надсилається нічого.
group("текст сторінки для моделі");
{
  const html = `<html><head><style>.a{color:red}</style><script>var x = "Купи зараз";</script></head>
    <body><h1>Кейп букле</h1><p>2 400 грн</p><noscript>увімкни JS</noscript></body></html>`;
  const text = pageTextForModel(html);
  check("скрипти не потрапляють у текст", text.includes("var x"), false);
  check("стилі не потрапляють у текст", text.includes("color:red"), false);
  check("noscript не потрапляє у текст", text.includes("увімкни JS"), false);
  check("товар у тексті є", text.includes("Кейп букле"), true);
  check("ціна в тексті є", text.includes("2 400 грн"), true);
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

  const suggestion = await suggestGiftName("Кейп з тканини букле, 2 400 грн", { hostname: "shop.ua" });
  check("без ключа відповіді немає", suggestion, null);
  check("без ключа мережі немає", calls, 0);

  globalThis.fetch = realFetch;
  if (key !== undefined) process.env.AI_GATEWAY_API_KEY = key;
}

if (failures.length === 0) {
  console.log("\nУсі перевірки пройдено\n");
} else {
  console.log(`\nПровалено ${failures.length}:`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log("");
}
process.exit(failures.length === 0 ? 0 : 1);
