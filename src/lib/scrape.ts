import * as cheerio from "cheerio";

export interface LinkPreview {
  title: string | null;
  imageUrl: string | null;
  price: string | null;
  store: string | null;
}

const PRICE_PATTERN = /(\d[\d\s.,]{1,12}\d|\d)\s?(₴|грн|\$|usd|eur|€)/i;

/**
 * Best-effort OpenGraph/meta scraper. Many stores block bots or hide price
 * behind JS, so every field is optional — the caller falls back to manual
 * entry when title is missing.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WishlistBot/1.0; +https://t.me)",
        Accept: "text/html",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ??
    $(`meta[name="${name}"]`).attr("content") ??
    null;

  const title = meta("og:title") ?? ($("title").first().text().trim() || null);
  const imageUrl = meta("og:image");
  const store = meta("og:site_name") ?? new URL(url).hostname.replace(/^www\./, "");

  let price =
    meta("product:price:amount") ??
    meta("og:price:amount") ??
    $('[itemprop="price"]').attr("content") ??
    null;

  if (!price) {
    const bodyText = $("body").text();
    const match = bodyText.match(PRICE_PATTERN);
    if (match) price = match[0].trim();
  }

  if (!title && !imageUrl && !price) return null;

  return { title, imageUrl, price, store };
}
