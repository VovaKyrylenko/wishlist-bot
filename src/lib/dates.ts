// Parsing for the one date the bot ever asks for: when the event happens.
//
// The original parser accepted `ДД.ММ.РРРР` and nothing else, so "25 грудня"
// or "завтра" — the way people actually answer "коли подія?" — bounced off it.

/** Genitive first ("12 серпня"), since that is how a date is spoken. */
const MONTHS: readonly string[][] = [
  ["січня", "січень"],
  ["лютого", "лютий"],
  ["березня", "березень"],
  ["квітня", "квітень"],
  ["травня", "травень"],
  ["червня", "червень"],
  ["липня", "липень"],
  ["серпня", "серпень"],
  ["вересня", "вересень"],
  ["жовтня", "жовтень"],
  ["листопада", "листопад"],
  ["грудня", "грудень"],
];

/** Dates live as UTC midnight — they are calendar days, not instants. */
function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  // Rejects overflow like 31.02.2026, which Date would silently roll forward.
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null;
  return date;
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * When the year is left out, people mean the next time that day comes around
 * — "8 березня" in April is next March, not five weeks ago.
 */
function nextOccurrence(month: number, day: number): Date | null {
  const today = todayUtc();
  const thisYear = utcDate(today.getUTCFullYear(), month, day);
  if (thisYear && thisYear.getTime() >= today.getTime()) return thisYear;
  return utcDate(today.getUTCFullYear() + 1, month, day);
}

function monthFromName(name: string): number | null {
  const normalized = name.toLowerCase();
  // "л" is equally лютий and липень; demand enough letters to disambiguate.
  if (normalized.length < 4) return null;
  for (let i = 0; i < MONTHS.length; i++) {
    // Match on stem so "груд", "грудні" and "грудня" all land on December.
    if (MONTHS[i].some((form) => form.startsWith(normalized) || normalized.startsWith(form.slice(0, 4)))) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Accepts `ДД.ММ.РРРР`, `ДД.ММ`, `12 серпня [2026]`, and the obvious relative
 * words. Returns null when nothing matches, so the caller can re-ask.
 */
export function parseEventDate(raw: string): Date | null {
  const input = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const today = todayUtc();

  const relative: Record<string, number> = {
    "сьогодні": 0,
    "завтра": 1,
    "післязавтра": 2,
  };
  if (input in relative) {
    return new Date(today.getTime() + relative[input] * 86_400_000);
  }

  const numeric = /^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?$/.exec(input);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (!numeric[3]) return nextOccurrence(month, day);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    return utcDate(year, month, day);
  }

  const spelled = /^(\d{1,2}) ([а-яіїєґ']+)(?: (\d{4}))?$/.exec(input);
  if (spelled) {
    const day = Number(spelled[1]);
    const month = monthFromName(spelled[2]);
    if (month === null) return null;
    if (!spelled[3]) return nextOccurrence(month, day);
    return utcDate(Number(spelled[3]), month, day);
  }

  return null;
}

export function isPast(date: Date): boolean {
  return date.getTime() < todayUtc().getTime();
}

/** Whole days from today until `date`; negative once it has passed. */
export function daysUntil(date: Date): number {
  return Math.round((date.getTime() - todayUtc().getTime()) / 86_400_000);
}
