import type { Priority, PrivacyMode, ReservationStatus } from "../../generated/prisma/enums.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: "🔥 Дуже хочу",
  NORMAL: "⭐ Хочу",
  LOW: "💭 Було б приємно",
};

export const PRIORITY_ICON: Record<Priority, string> = {
  HIGH: "🔥",
  NORMAL: "⭐",
  LOW: "💭",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

export const PRIVACY_LABEL: Record<PrivacyMode, string> = {
  SURPRISE: "🎁 Сюрприз (не бачу, хто і що забронював)",
  OPEN: "👀 Відкритий (бачу всі бронювання)",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  ACTIVE: "заброньовано",
  CANCELLED: "скасовано",
  PURCHASED: "придбано",
};

export function formatDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatGuestName(user: { firstName: string | null; lastName: string | null; username: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return "Гість";
}
