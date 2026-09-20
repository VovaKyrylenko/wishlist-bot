import * as cheerio from "cheerio";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export interface LinkPreview {
  title: string | null;
  imageUrl: string | null;
  price: string | null;
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
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
      await res.body?.cancel();
      return null;
    }

    return { html: await readCapped(res), finalUrl: current };
  }

  return null;
}

/** Reads at most {@link MAX_BYTES}, so a huge or endless response cannot OOM us. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

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
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

const CURRENCY = "(?:₴|грн|UAH|\\$|USD|€|EUR|zł|PLN)";
/** Thousands separators in the wild: space, non-breaking space, narrow nbsp, dot, comma. */
const SEPARATOR = "[ \\u00A0\\u202F.,]";
const AMOUNT = `\\d{1,3}(?:${SEPARATOR}\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?`;
const PRICE_NEAR_CURRENCY = new RegExp(`(?:(${AMOUNT})\\s*${CURRENCY})|(?:${CURRENCY}\\s*(${AMOUNT}))`, "i");

/**
 * Rejects matches that are obviously not prices. Scanning the whole page for
 * "number next to a currency sign" used to label items with a copyright year
 * or a phone-number fragment.
 */
function plausiblePrice(raw: string): boolean {
  const numeric = Number(
    raw
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(/,(\d{1,2})$/, ".$1")
      .replace(/[^\d.]/g, ""),
  );
  return Number.isFinite(numeric) && numeric > 0 && numeric < 100_000_000;
}

/** Structured data beats guessing: most shops ship a Product/Offer JSON-LD blob. */
function priceFromJsonLd($: cheerio.CheerioAPI): string | null {
  const nodes = $('script[type="application/ld+json"]').toArray();

  for (const node of nodes) {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(node).text());
    } catch {
      continue;
    }

    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const value = queue.shift();
      if (Array.isArray(value)) {
        queue.push(...value);
        continue;
      }
      if (!value || typeof value !== "object") continue;

      const record = value as Record<string, unknown>;
      const offers = record.offers;
      if (offers) queue.push(offers);

      const price = record.price ?? record.lowPrice;
      if (typeof price === "string" || typeof price === "number") {
        const currency = typeof record.priceCurrency === "string" ? record.priceCurrency : "";
        const text = `${price}`.trim();
        if (plausiblePrice(text)) return currency ? `${text} ${currency}` : text;
      }

      for (const nested of Object.values(record)) {
        if (nested && typeof nested === "object") queue.push(nested);
      }
    }
  }

  return null;
}

/**
 * Best-effort OpenGraph/meta scraper. Many stores block bots or hide price
 * behind JS, so every field is optional — the caller falls back to manual
 * entry when title is missing.
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

  return parseLinkPreview(fetched.html, fetched.finalUrl);
}

/** Split out from the fetch so the extraction rules can be exercised directly. */
export function parseLinkPreview(html: string, finalUrl: URL): LinkPreview | null {
  const $ = cheerio.load(html);

  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content")?.trim() ||
    $(`meta[name="${name}"]`).attr("content")?.trim() ||
    null;

  const title = meta("og:title") ?? ($("title").first().text().trim() || null);
  const store = meta("og:site_name") ?? finalUrl.hostname.replace(/^www\./, "");

  // og:image is routinely a site-relative path, which Telegram cannot fetch —
  // the photo silently vanished from the card instead of just working.
  const rawImage = meta("og:image") ?? meta("twitter:image");
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const absolute = new URL(rawImage, finalUrl);
      if (absolute.protocol === "http:" || absolute.protocol === "https:") {
        imageUrl = absolute.toString();
      }
    } catch {
      // Unparseable image URL — the card is fine without a picture.
    }
  }

  const currency = meta("product:price:currency") ?? meta("og:price:currency");
  const metaAmount =
    meta("product:price:amount") ??
    meta("og:price:amount") ??
    $('[itemprop="price"]').attr("content")?.trim() ??
    null;

  let price: string | null = null;
  if (metaAmount && plausiblePrice(metaAmount)) {
    price = currency ? `${metaAmount} ${currency}` : metaAmount;
  }
  price ??= priceFromJsonLd($);

  if (!price) {
    // Last resort, and deliberately narrow: only nodes that call themselves a
    // price, never the whole document.
    const candidates = $('[class*="price" i], [id*="price" i], [itemprop="price"]').slice(0, 20).toArray();
    for (const node of candidates) {
      const match = PRICE_NEAR_CURRENCY.exec($(node).text().replace(/\s+/g, " "));
      const amount = match?.[1] ?? match?.[2];
      if (match && amount && plausiblePrice(amount)) {
        price = match[0].trim();
        break;
      }
    }
  }

  if (!title && !imageUrl && !price) return null;

  return { title, imageUrl, price, store };
}
