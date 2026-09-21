// Що саме бот витягує з чужої сторінки.
//
// Кожна фікстура — це розмітка, яку реально ставлять магазини: JSON-LD із
// Rozetka-подібним заголовком, старий OpenCart на мікроданих, Shopify з самим
// OpenGraph, сторінка без розмітки взагалі та ще й у windows-1251. Перевіряємо
// не «не впало», а що саме людина побачить у картці подарунка.

import { parseLinkPreview, decodeHtml, cleanTitle } from "../../src/lib/scrape.js";
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

if (failures.length === 0) {
  console.log("\nУсі перевірки пройдено\n");
} else {
  console.log(`\nПровалено ${failures.length}:`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log("");
}
process.exit(failures.length === 0 ? 0 : 1);
