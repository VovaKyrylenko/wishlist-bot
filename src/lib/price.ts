// Reading a price the way a person does.
//
// A shop can write the same 12999 hryvnia as "12 999 ₴", "12.999,00 UAH",
// "₴12,999", "від 12 999 грн" or "12999.00" in a JSON-LD field. Storing that
// raw meant the gift card showed whatever the site happened to use, and
// nothing downstream could tell 12 999 from 12.999.
//
// So parsing is split in two: recognise the currency, then read the amount —
// and print it back in one canonical Ukrainian form.

/**
 * The separator heuristic, borrowed from scrapinghub/price-parser: the last
 * "." or "," is a decimal point when 1, 2 or 4+ digits follow it, and a
 * thousands separator when exactly 3 do. That single rule is what tells
 * "12.99" (twelve ninety-nine) from "12.999" (twelve thousand) without
 * knowing the site's locale.
 */
const DECIMAL_TAIL = /^\d+$/;

/** Every space a price can be padded or grouped with, including the thin ones. */
const SPACES = /[\s\u00A0\u202F\u2009\u2007']/g;

/** ISO 4217 for everything a Ukrainian shopper realistically pastes. */
const CURRENCY_TOKENS: [token: string, iso: string][] = [
  // Longest first: "nz$" has to win over "$", "грн." over "грн".
  ["nz$", "NZD"], ["ca$", "CAD"], ["au$", "AUD"], ["us$", "USD"], ["hk$", "HKD"], ["sg$", "SGD"],
  ["c$", "CAD"], ["a$", "AUD"],
  ["₴", "UAH"], ["$", "USD"], ["€", "EUR"], ["£", "GBP"], ["₽", "RUB"], ["¥", "JPY"],
  ["₩", "KRW"], ["₪", "ILS"], ["₺", "TRY"], ["zł", "PLN"], ["kč", "CZK"],
  ["uah", "UAH"], ["usd", "USD"], ["eur", "EUR"], ["gbp", "GBP"], ["pln", "PLN"],
  ["rub", "RUB"], ["jpy", "JPY"], ["cny", "CNY"], ["krw", "KRW"], ["ils", "ILS"],
  ["try", "TRY"], ["czk", "CZK"], ["chf", "CHF"], ["sek", "SEK"], ["nok", "NOK"],
  ["dkk", "DKK"], ["cad", "CAD"], ["aud", "AUD"], ["nzd", "NZD"], ["huf", "HUF"],
  ["ron", "RON"], ["bgn", "BGN"], ["kzt", "KZT"], ["mdl", "MDL"], ["inr", "INR"],
  // The words people actually type, in both spellings that reach a Ukrainian bot.
  ["гривень", "UAH"], ["гривні", "UAH"], ["гривня", "UAH"], ["гривен", "UAH"],
  ["грн.", "UAH"], ["грн", "UAH"],
  ["доларів", "USD"], ["долар", "USD"], ["доллар", "USD"], ["дол.", "USD"], ["дол", "USD"],
  ["євро", "EUR"], ["евро", "EUR"],
  ["злотих", "PLN"], ["злотий", "PLN"],
  ["рублів", "RUB"], ["руб.", "RUB"], ["руб", "RUB"],
];

/** Letters need a boundary check; "€" inside a word is still "€". */
const LETTER = /\p{L}/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CURRENCY_RE = new RegExp(
  CURRENCY_TOKENS.map(([token]) => escapeRegExp(token)).join("|"),
  "giu",
);

const TOKEN_TO_ISO = new Map(CURRENCY_TOKENS.map(([token, iso]) => [token, iso]));

export interface ParsedPrice {
  /** Always a plain number: 12999, 22.9. */
  amount: number;
  /** ISO 4217, or null when the text carried no recognisable currency. */
  currency: string | null;
}

/**
 * Reads the number itself. Returns null for anything that is not one, so a
 * caller can keep looking rather than storing a phone number as a price.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(SPACES, "");
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;

  const lastSeparator = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  const tail = lastSeparator === -1 ? "" : cleaned.slice(lastSeparator + 1);
  const isDecimal =
    lastSeparator > 0 &&
    DECIMAL_TAIL.test(tail) &&
    (tail.length <= 2 || tail.length >= 4);

  const value = isDecimal
    ? Number(`${cleaned.slice(0, lastSeparator).replace(/[.,]/g, "")}.${tail}`)
    : Number(cleaned.replace(/[.,]/g, ""));

  return Number.isFinite(value) ? value : null;
}

/**
 * Rejects what is numerically a price but obviously is not one on a shop page:
 * zero, and figures far past anything a gift costs. Scanning a page for
 * "digits near a currency sign" otherwise labels a gift with a copyright year
 * or a fragment of a phone number.
 */
export function isPlausibleAmount(amount: number): boolean {
  return amount > 0 && amount < 100_000_000;
}

/** Every currency mention in `text`, with its position. */
function findCurrencies(text: string): { iso: string; start: number; end: number }[] {
  const found: { iso: string; start: number; end: number }[] = [];
  CURRENCY_RE.lastIndex = 0;
  for (let match = CURRENCY_RE.exec(text); match; match = CURRENCY_RE.exec(text)) {
    const token = match[0].toLowerCase();
    const iso = TOKEN_TO_ISO.get(token);
    if (!iso) continue;

    // "грн" inside "гривнякрн" is not a currency; "12€" is.
    if (LETTER.test(token)) {
      const before = text[match.index - 1];
      const after = text[match.index + token.length];
      if ((before && LETTER.test(before)) || (after && LETTER.test(after))) continue;
    }
    found.push({ iso, start: match.index, end: match.index + match[0].length });
  }
  return found;
}

/** All number-shaped runs in `text`, with their positions. */
function findNumbers(text: string): { raw: string; start: number; end: number }[] {
  const found: { raw: string; start: number; end: number }[] = [];
  const pattern = /\d[\d\s\u00A0\u202F\u2009']*(?:[.,]\d+)*/gu;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const raw = match[0].replace(/[\s\u00A0\u202F\u2009',.]+$/u, "");
    if (raw) found.push({ raw, start: match.index, end: match.index + raw.length });
  }
  return found;
}

/**
 * Every number a text states, read exactly as `parsePrice` reads one — so a
 * number found here and a price parsed there can be compared as equals.
 */
export function amountsIn(text: string): number[] {
  const amounts = new Set<number>();
  for (const { raw } of findNumbers(text)) {
    const amount = parseAmount(raw);
    if (amount !== null) amounts.add(amount);
  }
  return [...amounts];
}

export interface ParseOptions {
  /**
   * Only accept a number that sits next to a currency. Used for the DOM
   * fallback, where a bare number in a `<div class="price-block">` is as
   * likely to be a rating or an item count as a price.
   */
  requireCurrency?: boolean;
}

/** How far a number may sit from its currency and still belong to it. */
const CURRENCY_GAP = 4;

/**
 * Pulls a price out of free text: "від 12 999 ₴", "₴12,999.00", "22,90 €".
 *
 * When several numbers sit next to a currency the smallest wins, because both
 * cases where that happens want the same answer: a struck-through old price
 * beside the new one ("15 999 ₴ 12 999 ₴") and a range across variants
 * ("2 199 — 3 499 ₴") should show what the gift can be had for today.
 */
export function parsePrice(text: string, options: ParseOptions = {}): ParsedPrice | null {
  if (!text) return null;
  const normalized = text.replace(/\u00A0|\u202F|\u2009/g, " ");

  const currencies = findCurrencies(normalized);
  if (currencies.length === 0 && options.requireCurrency) return null;

  const numbers = findNumbers(normalized);
  if (numbers.length === 0) return null;

  /** Distance to the nearest currency token, ignoring ones a number overlaps. */
  const gapTo = (n: { start: number; end: number }) => {
    const gaps = currencies
      .map((c) => (n.end <= c.start ? c.start - n.end : n.start - c.end))
      .filter((gap) => gap >= 0);
    return gaps.length > 0 ? Math.min(...gaps) : Number.POSITIVE_INFINITY;
  };

  let candidates = numbers;
  if (currencies.length > 0) {
    const attached = numbers.filter((n) => gapTo(n) <= CURRENCY_GAP);
    // Nothing sat near the currency at all — the match was noise, not a price.
    if (attached.length === 0 && options.requireCurrency) return null;
    if (attached.length > 0) {
      // "2 199 — 3 499 ₴" prices one gift, and only the upper bound touches the
      // currency. A dash and nothing else between two numbers makes it a range,
      // so the lower bound counts too — while "99 ₴ - 12 999 ₴" (delivery next
      // to a price) does not, because a currency sits in between.
      candidates = numbers.filter(
        (n) =>
          attached.includes(n) ||
          attached.some((a) =>
            /^[\s–—-]+$/u.test(
              n.end <= a.start ? normalized.slice(n.end, a.start) : normalized.slice(a.end, n.start),
            ),
          ),
      );
    }
  }

  let best: ParsedPrice | null = null;
  for (const candidate of candidates) {
    const amount = parseAmount(candidate.raw);
    if (amount === null || !isPlausibleAmount(amount)) continue;
    if (best && amount >= best.amount) continue;

    // Each number takes the currency nearest to it, so a page mixing "$" and
    // "₴" cannot label a hryvnia figure as dollars.
    const nearest = currencies
      .map((c) => ({
        iso: c.iso,
        gap: candidate.end <= c.start ? c.start - candidate.end : candidate.start - c.end,
      }))
      .filter((entry) => entry.gap >= 0)
      .sort((a, b) => a.gap - b.gap)[0];
    best = { amount, currency: nearest?.iso ?? null };
  }

  return best;
}

/**
 * One canonical way to show a price, whatever the shop wrote: "12 999 ₴",
 * "22,90 €", "1 250 $". Cents are printed only when there are any, because
 * "12 999,00 ₴" is noise on a gift card.
 */
export function formatPrice(price: ParsedPrice): string {
  const hasCents = !Number.isInteger(price.amount);
  const digits = hasCents ? 2 : 0;

  if (price.currency) {
    try {
      return new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: price.currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(price.amount);
    } catch {
      // An ISO code Intl does not know — still better than the raw string.
    }
  }

  const number = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(price.amount);
  return price.currency ? `${number} ${price.currency}` : number;
}

/** Parse and print in one step; null when `text` holds no usable price. */
export function normalizePriceText(text: string, options?: ParseOptions): string | null {
  const parsed = parsePrice(text, options);
  return parsed ? formatPrice(parsed) : null;
}

export interface StructuredPrice {
  /** Canonical display text — what the user actually sees on the card. */
  text: string;
  amount: number;
  currency: string | null;
}

/**
 * Reads free text into both halves at once: the canonical text a screen
 * shows and the plain number a database column can hold. Used everywhere a
 * price is set — scraped, typed by hand, or copied from an old gift — so
 * `priceAmount`/`priceCurrency` are never a step behind what `price` says.
 * Returns null for text with no usable number ("домовимось", "уточнюйте"),
 * which the caller then stores as free text with no structured half.
 */
export function structurePrice(text: string, options?: ParseOptions): StructuredPrice | null {
  const parsed = parsePrice(text, options);
  return parsed ? { text: formatPrice(parsed), amount: parsed.amount, currency: parsed.currency } : null;
}
