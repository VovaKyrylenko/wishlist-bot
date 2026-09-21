import type { Priority } from "../../generated/prisma/enums.js";
import { daysUntil, todayUtc } from "./dates.js";
import { t } from "../text.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * True for a URL Telegram will accept in an inline button. A gift's `url` has
 * to pass this before it is stored: one invalid `kb.url(...)` makes Telegram
 * reject the whole keyboard and the screen silently fails to render — the one
 * thing this bot promises never to do.
 */
export function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Accepts what a person actually pastes: a full address, or a bare
 * "rozetka.com.ua/..." that only needs its protocol back. Returns null when
 * the text is not a link at all, so the caller can re-ask instead of storing
 * something that would break the gift's screen.
 */
export function normalizeUrl(text: string): string | null {
  const candidate = text.trim();
  if (!candidate || /\s/.test(candidate)) return null;
  if (isHttpUrl(candidate)) return candidate;
  if (!candidate.startsWith("http") && isHttpUrl(`https://${candidate}`)) {
    return `https://${candidate}`;
  }
  return null;
}

export const PRIORITY_ICON = t.labels.priorityIcon;
export const PRIORITY_NAME = t.labels.priorityName;

export const PRIORITY_ORDER: Record<Priority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

const DAY_MONTH = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "15 серпня" for this year, "15 серпня 2027 р." when the year matters.
 * Spelling the year out on every date made every header longer for no gain —
 * an event is almost always within the next few months.
 */
export function formatDate(date: Date): string {
  const sameYear = date.getUTCFullYear() === todayUtc().getUTCFullYear();
  return (sameYear ? DAY_MONTH : DAY_MONTH_YEAR).format(date);
}

/**
 * How far away the event is, in the words a person would use. Returns null
 * when "далеко" is not worth saying (more than a season out), so headers stay
 * short — §14.8.
 */
export function formatRelativeDate(date: Date): string | null {
  const days = daysUntil(date);
  if (days < 0) return "вже минула";
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days === 2) return "післязавтра";
  if (days <= 90) return `через ${t.plural.days(days)}`;
  return null;
}

export function formatGuestName(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return t.common.guestFallbackName;
}

/**
 * The owner's first name is what a guest reads at the top of a showcase
 * ("Список бажань Марти"), so a surname would only make the header longer.
 */
export function formatOwnerName(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string {
  if (user.firstName?.trim()) return user.firstName.trim();
  return formatGuestName(user);
}
