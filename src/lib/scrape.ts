// Reading a product page the way a shop meant it to be read.
//
// Shops describe the same product in up to four places, and they disagree:
// JSON-LD is the cleanest (ISO currency, dot decimals, no site name glued to
// the title), microdata is next, OpenGraph is written for social previews, and
// the visible DOM is a last resort full of struck-through old prices. So every
// field is taken from the best source that has it, and only falls through when
// that source is silent — never "whatever matched first".
//
// The prize is a card the user does not have to fix: the right name, the right
// price, in one currency format.

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { formatPrice, isPlausibleAmount, parseAmount, parsePrice, type ParsedPrice } from "./price.js";
import { applyGiftName, pageTextForModel, suggestGiftName } from "./gift-name.js";

export interface LinkPreview {
  title: string | null;
  imageUrl: string | null;
  /** Canonical and localised: "12 999 ₴", never "12999.00". */
  price: string | null;
  /** The same price as a plain number, when the source gave one — null for
   * whatever the DOM fallback could not pin down to an actual figure. */
  priceAmount: number | null;
  priceCurrency: string | null;
  store: string | null;
}

const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
/** Plenty for a `<head>`; a product page that needs more is not worth the memory. */
const MAX_BYTES = 2 * 1024 * 1024;

/** The eight 16-bit groups of an IPv6 literal, or null if it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0]; // drop a zone id (fe80::1%eth0)
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail, ...extra] = text.split("::");
  if (extra.length > 0) return null;
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - front.length - back.length;
  const groups = [...front, ...Array<string>(Math.max(fill, 0)).fill("0"), ...back].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Anything a user pastes gets fetched by our server, so a link is really a
 * request to make the bot's backend talk to an address of the sender's
 * choosing. Loopback, link-local (cloud metadata!) and private ranges are the
 * ones that turn that into a way to read things only the server can see.
 */
function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (version === 6) {
    // Compare numbers, never text: the URL parser rewrites [::ffff:10.0.0.1] to
    // ::ffff:a00:1, and no string pattern spells every form of one address.
    const g = ipv6Groups(ip);
    if (!g) return true; // cannot read it, so do not trust it
    if (g.slice(0, 6).every((x) => x === 0)) return true; // ::/96, includes :: and ::1
    if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local, fe80::/10
    if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local, fc00::/7
    // Prefixes that carry an IPv4 address in the last 32 bits (or, for 6to4, in
    // bits 16-47) smuggle the IPv4 ranges above back in.
    const low = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
    const embedded =
      (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) || // ::ffff:0:0/96 IPv4-mapped
      (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) || // ::ffff:0:0:0/96 SIIT
      (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)); // 64:ff9b::/96 NAT64
    if (embedded) return isBlockedAddress(low);
    if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48, local-use NAT64
    if (g[0] === 0x2002) return isBlockedAddress([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255].join(".")); // 6to4
    return false;
  }

  return true;
}

/** Rejects anything that is not a public http(s) endpoint. */
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new Error(`blocked address: ${host}`);
    return;
  }

  // Resolving every candidate address closes the "public name, private A
  // record" trick. A determined rebinding attack could still race the second
  // lookup fetch() does, but that buys an attacker nothing we don't already
  // hand out: the page body goes only to the user who pasted the link.
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0) throw new Error(`cannot resolve: ${host}`);
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) throw new Error(`blocked address: ${address}`);
  }
}

/**
 * Follows redirects by hand so that every hop is re-validated — `redirect:
 * "follow"` would happily land on a public URL that bounces to
 * 169.254.169.254.
 */
async function fetchHtml(startUrl: string): Promise<{ html: string; finalUrl: URL } | null> {
  let current = new URL(startUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);

    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WishlistBot/1.0; +https://t.me)",
        Accept: "text/html,application/xhtml+xml",
        // Ukrainian shops serve a Russian or English title otherwise, and the
        // gift ends up in a language the user did not paste.
        "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.6",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      await res.body?.cancel();
      current = new URL(location, current);
      continue;
    }

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      await res.body?.cancel();
      return null;
    }

    const bytes = await readCapped(res);
    return { html: decodeHtml(bytes, contentType), finalUrl: current };
  }

  return null;
}

/** Reads at most {@link MAX_BYTES}, so a huge or endless response cannot OOM us. */
async function readCapped(res: Response): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Plenty of Ukrainian shops still serve windows-1251. Decoding those bytes as
 * UTF-8 turns every product name into "Íàóøíèêè" — the gift got added with a
 * title of pure noise, and nothing downstream could tell it had gone wrong.
 */
export function decodeHtml(bytes: Buffer, contentType = ""): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  // The meta tag is only readable once something has been decoded, and every
  // encoding worth sniffing here agrees with latin1 on ASCII.
  const head = bytes.subarray(0, 4096).toString("latin1");
  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];

  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label — try the next candidate.
    }
  }
  return bytes.toString("utf-8");
}

// ── Структуровані дані ─────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Json;
    // ImageObject, Brand and friends all keep the useful bit under one of these.
    return firstString(record.url ?? record.name ?? record["@id"]);
  }
  return null;
}

/** schema.org types, lowercased and stripped of their namespace URL. */
function typesOf(node: Json): string[] {
  const raw = node["@type"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(/[/#]/).pop()!.toLowerCase());
}

/** Every object in a JSON-LD document, `@graph` and nesting included. */
function flattenJsonLd(root: unknown): Json[] {
  const out: Json[] = [];
  const queue: unknown[] = [root];
  // Shops have shipped documents that reference themselves; a seen-set keeps
  // that from spinning forever.
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    out.push(value as Json);
    queue.push(...Object.values(value as Json));
  }
  return out;
}

function readJsonLd($: cheerio.CheerioAPI): Json[] {
  const nodes: Json[] = [];
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    // Some CMSes wrap the payload in a CDATA section or HTML comments.
    const raw = $(script)
      .text()
      .replace(/^\s*<!\[CDATA\[/, "")
      .replace(/\]\]>\s*$/, "")
      .trim();
    if (!raw) continue;
    try {
      nodes.push(...flattenJsonLd(JSON.parse(raw)));
    } catch {
      // One malformed blob must not cost us the others.
    }
  }
  return nodes;
}

/** The price of a single Offer / AggregateOffer node, if it states one. */
function offerPrice(node: Json): ParsedPrice | null {
  const currency = firstString(node.priceCurrency ?? node.priceCurrencyCode);
  const specification = node.priceSpecification;
  const rawPrice =
    node.price ??
    node.lowPrice ??
    (specification && typeof specification === "object"
      ? ((specification as Json).price ?? (specification as Json).lowPrice)
      : undefined);

  const text = firstString(rawPrice);
  if (!text) return null;

  // schema.org asks for "1234.56", but plenty of shops still ship "1 234,56 ₴"
  // in this field, so it goes through the same reader as visible text.
  const amount = parseAmount(text) ?? parsePrice(text)?.amount ?? null;
  if (amount === null || !isPlausibleAmount(amount)) return null;

  const iso = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  return { amount, currency: iso ?? parsePrice(text)?.currency ?? null };
}

interface StructuredProduct {
  title: string | null;
  image: string | null;
  price: ParsedPrice | null;
  brand: string | null;
  store: string | null;
}

/**
 * The product as its own page describes it. Offers are searched inside the
 * Product node first — a page also carrying an Organization or a BreadcrumbList
 * must not have its price read off some unrelated node.
 */
function fromJsonLd(nodes: Json[]): StructuredProduct {
  const products = nodes.filter((node) => typesOf(node).includes("product"));
  const product = products[0];

  let price: ParsedPrice | null = null;
  const offerNodes = product ? flattenJsonLd(product.offers) : [];
  for (const offer of offerNodes.length > 0 ? offerNodes : nodes) {
    const types = typesOf(offer);
    // Without a Product to anchor to, only trust nodes that call themselves offers.
    if (offerNodes.length === 0 && !types.some((type) => type.endsWith("offer"))) continue;
    const candidate = offerPrice(offer);
    if (!candidate) continue;
    // Variants: the honest headline is what the gift can be had for.
    if (!price || candidate.amount < price.amount) price = candidate;
  }

  const organisation = nodes.find((node) =>
    typesOf(node).some((type) => type === "organization" || type === "onlinestore" || type === "website"),
  );

  return {
    title: product ? firstString(product.name) : null,
    image: product ? firstString(product.image) : null,
    price,
    brand: product ? firstString(product.brand) : null,
    store: organisation ? firstString(organisation.name) : null,
  };
}

/** The value an `itemprop` carries, which depends on the tag it sits on. */
function microdataValue($: cheerio.CheerioAPI, element: AnyNode): string | null {
  const $el = $(element);
  const tag = "tagName" in element ? String(element.tagName).toLowerCase() : "";
  if (tag === "meta") return $el.attr("content")?.trim() || null;
  if (tag === "img") return $el.attr("src")?.trim() || null;
  if (tag === "a" || tag === "link") return $el.attr("href")?.trim() || null;
  return $el.attr("content")?.trim() || $el.text().trim() || null;
}

function fromMicrodata($: cheerio.CheerioAPI): StructuredProduct {
  const scope = $('[itemtype*="schema.org/Product" i]').first();
  const scoped = scope.length > 0;

  const prop = (name: string): string | null => {
    const selector = `[itemprop="${name}" i]`;
    const element = (scoped ? scope.find(selector) : $(selector)).get(0);
    return element ? microdataValue($, element) : null;
  };

  const amountText = prop("price");
  const currency = prop("priceCurrency");
  let price: ParsedPrice | null = null;
  if (amountText) {
    const amount = parseAmount(amountText) ?? parsePrice(amountText)?.amount ?? null;
    if (amount !== null && isPlausibleAmount(amount)) {
      price = {
        amount,
        currency:
          currency && /^[A-Za-z]{3}$/.test(currency)
            ? currency.toUpperCase()
            : (parsePrice(amountText)?.currency ?? null),
      };
    }
  }

  return {
    // Outside a Product scope an `itemprop="name"` is as likely to belong to
    // the shop's own Organization markup as to the gift.
    title: scoped ? prop("name") : null,
    image: prop("image"),
    price,
    brand: prop("brand"),
    store: null,
  };
}

// ── Видимий DOM: остання надія ─────────────────────────────────────────────

/** Nodes that advertise themselves as a price. */
const PRICE_SELECTOR = [
  '[itemprop="price"]',
  '[class*="price" i]',
  '[id*="price" i]',
  '[data-testid*="price" i]',
  '[data-qa*="price" i]',
].join(", ");

/** …and the ones that are a price the shop is no longer asking for. */
const STALE_PRICE = /old|was|prev|before|strike|through|crossed|compare|discount|regular|list-price/i;
/** Text that means the number belongs to something other than the gift. */
const NOT_A_PRICE = /достав|шипинг|shipping|delivery|міс\.|\/міс|кредит|розстроч|бонус|cashback|кешбек|економія|знижк/i;

function fromDom($: cheerio.CheerioAPI): ParsedPrice | null {
  const candidates = $(PRICE_SELECTOR).toArray().slice(0, 40);

  for (const element of candidates) {
    const $el = $(element);

    // A wrapper holding both the old and the new price reads as one run of
    // text; the leaf that actually contains the number is the honest one.
    if ($el.find(PRICE_SELECTOR).length > 0) continue;

    const marker = `${$el.attr("class") ?? ""} ${$el.attr("id") ?? ""}`;
    if (STALE_PRICE.test(marker)) continue;
    if ($el.closest("del, s, strike").length > 0) continue;
    if ($el.parents().toArray().some((parent) => STALE_PRICE.test($(parent).attr("class") ?? ""))) continue;

    const text = $el.text().replace(/\s+/g, " ").trim();
    if (!text || NOT_A_PRICE.test(text)) continue;

    // A bare number in a "price-block" is as likely to be a rating or an item
    // count, so down here the currency has to be spelled out.
    const price = parsePrice(text, { requireCurrency: true });
    if (price) return price;
  }
  return null;
}

// ── Назва ──────────────────────────────────────────────────────────────────

/**
 * Separators a shop glues its own name on with. A bare "-" is left alone —
 * product codes are full of them ("WH-1000XM6") — but a spaced " - " is fair
 * game. "ᐉ" and "•" are here because Ukrainian shops decorate titles with them
 * by the thousand.
 */
const TITLE_SEPARATORS = "|·•●▪►▷ᐉ»—–";
const TITLE_TAIL = new RegExp(
  `\\s*[${TITLE_SEPARATORS}]\\s*[^${TITLE_SEPARATORS}]*$|\\s+-\\s+[^-]*$|\\s+::\\s*[^:]*$`,
  "u",
);
/** Decoration and SEO verbs that lead a title and say nothing about the gift. */
const TITLE_LEAD = new RegExp(`^[\\s${TITLE_SEPARATORS}★☆✅<>]+`, "u");
const TITLE_LEAD_VERB = /^\s*(?:купити|купить|buy|замовити|заказать|придбати)\s+/iu;
/**
 * A tail is filler when it talks about the page rather than the thing: "ᐉ
 * Сковорода Krauff • Краща ціна в Києві • Купити в Епіцентр" is three quarters
 * noise, and all of it used to end up as the gift's name.
 */
const TITLE_SEO_TAIL =
  /(?:купити|купить|придбати|замовити|заказать|ціна|цена|цены|ціни|відгуки|отзывы|характеристики|доставка|недорого|інтернет[- ]?магазин|интернет[- ]?магазин|офіційн|buy|price|reviews?|online|shop|store)/iu;

/**
 * Turns "Купити Навушники Sony WH-1000XM6 — інтернет-магазин ROZETKA" into
 * "Навушники Sony WH-1000XM6". Only tails that name the shop are dropped, so a
 * product whose name genuinely contains a dash keeps it.
 */
export function cleanTitle(raw: string, store: string | null, hostname: string): string {
  let title = raw.replace(/\s+/g, " ").trim().replace(TITLE_LEAD, "");

  const brandWords = [store, hostname.replace(/^www\./, "").split(".")[0]]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase())
    .filter((value) => value.length >= 3);

  // Several passes: "Навушники • Краща ціна • ROZETKA" is two tails deep, and
  // the shop name is only the outer one.
  for (let pass = 0; pass < 3; pass++) {
    const tail = TITLE_TAIL.exec(title);
    if (!tail) break;
    const tailText = tail[0];
    const namesShop = brandWords.some((word) => tailText.toLowerCase().includes(word));
    if (!namesShop && !TITLE_SEO_TAIL.test(tailText)) break;
    const stripped = title.slice(0, tail.index).trim();
    // A page whose whole title is the shop name still needs a title.
    if (!stripped) break;
    title = stripped;
  }

  return title.replace(TITLE_LEAD_VERB, "").trim() || raw.trim();
}

/** Puts the maker in front when the name alone would not identify the gift. */
function withBrand(title: string, brand: string | null): string {
  if (!brand) return title;
  const clean = brand.trim();
  if (!clean || clean.length > 40) return title;
  return title.toLowerCase().includes(clean.toLowerCase()) ? title : `${clean} ${title}`;
}

// ── Складання картки ───────────────────────────────────────────────────────

/**
 * Best-effort scraper. Many stores block bots or render the price with JS, so
 * every field is optional — the caller asks the user for a name when the title
 * is missing.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  let fetched: { html: string; finalUrl: URL } | null;
  try {
    fetched = await fetchHtml(url);
  } catch (err) {
    console.warn("scrape: refused or failed to fetch", url, err instanceof Error ? err.message : err);
    return null;
  }
  if (!fetched) return null;

  // Розмітка дає факти, модель дає назву (ADR 0002). Порожня картка теж іде
  // до моделі: сторінка без жодної розмітки — саме той випадок, де правилам
  // нема за що вхопитися, а в тексті товар названо словами.
  const parsed = parseLinkPreview(fetched.html, fetched.finalUrl) ?? emptyPreview(fetched.finalUrl);
  const suggestion = await suggestGiftName(pageTextForModel(fetched.html), {
    store: parsed.store,
    hostname: fetched.finalUrl.hostname,
  });
  const preview = applyGiftName(parsed, suggestion, fetched.finalUrl.hostname);

  return preview.title || preview.imageUrl || preview.price ? preview : null;
}

function emptyPreview(finalUrl: URL): LinkPreview {
  return {
    title: null,
    imageUrl: null,
    price: null,
    priceAmount: null,
    priceCurrency: null,
    store: finalUrl.hostname.replace(/^www\./, ""),
  };
}

/** Split out from the fetch so the extraction rules can be exercised directly. */
export function parseLinkPreview(html: string, finalUrl: URL): LinkPreview | null {
  const $ = cheerio.load(html);

  const meta = (name: string) =>
    $(`meta[property="${name}" i]`).attr("content")?.trim() ||
    $(`meta[name="${name}" i]`).attr("content")?.trim() ||
    null;

  const jsonLd = fromJsonLd(readJsonLd($));
  const microdata = fromMicrodata($);

  const store =
    meta("og:site_name") ?? jsonLd.store ?? finalUrl.hostname.replace(/^www\./, "");

  // Title, best source first. og:title is written for a social card and often
  // carries the shop name; the structured name never does.
  const rawTitle =
    jsonLd.title ??
    microdata.title ??
    meta("og:title") ??
    meta("twitter:title") ??
    ($("h1").first().text().trim() || $("title").first().text().trim() || null);

  const title = rawTitle
    ? withBrand(cleanTitle(rawTitle, store, finalUrl.hostname), jsonLd.brand ?? microdata.brand)
    : null;

  const rawImage =
    jsonLd.image ??
    meta("og:image:secure_url") ??
    meta("og:image") ??
    meta("twitter:image") ??
    microdata.image ??
    $('link[rel="image_src"]').attr("href")?.trim() ??
    null;
  const imageUrl = resolveImage(rawImage, finalUrl);

  // Meta price tags come from the same template as the visible price but
  // without the struck-through neighbour, so they outrank the DOM.
  const metaPrice = readMetaPrice(meta);
  const price = jsonLd.price ?? microdata.price ?? metaPrice ?? fromDom($);

  if (!title && !imageUrl && !price) return null;

  return {
    title,
    imageUrl,
    price: price ? formatPrice(price) : null,
    priceAmount: price?.amount ?? null,
    priceCurrency: price?.currency ?? null,
    store,
  };
}

function readMetaPrice(meta: (name: string) => string | null): ParsedPrice | null {
  const amountText =
    meta("product:price:amount") ??
    meta("og:price:amount") ??
    meta("product:price") ??
    meta("twitter:data1");
  if (!amountText) return null;

  const amount = parseAmount(amountText) ?? parsePrice(amountText)?.amount ?? null;
  if (amount === null || !isPlausibleAmount(amount)) return null;

  const currencyText = meta("product:price:currency") ?? meta("og:price:currency");
  const iso = currencyText && /^[A-Za-z]{3}$/.test(currencyText.trim())
    ? currencyText.trim().toUpperCase()
    : null;

  return { amount, currency: iso ?? parsePrice(amountText)?.currency ?? null };
}

/**
 * og:image is routinely a site-relative path, which Telegram cannot fetch —
 * the photo silently vanished from the card instead of just working. SVG and
 * data URIs go the same way, so they are dropped rather than shown broken.
 */
function resolveImage(raw: string | null, finalUrl: URL): string | null {
  if (!raw) return null;
  try {
    const absolute = new URL(raw, finalUrl);
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return null;
    if (/\.svgz?($|\?)/i.test(absolute.pathname)) return null;
    return absolute.toString();
  } catch {
    return null;
  }
}
