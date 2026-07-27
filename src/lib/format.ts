import type { Priority } from "../../generated/prisma/enums.js";
import { t } from "../text.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const PRIORITY_ICON = t.labels.priorityIcon;

export const PRIORITY_ORDER: Record<Priority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

export const PRIVACY_LABEL = t.labels.privacy;

export const RESERVATION_STATUS_LABEL = t.labels.reservationStatus;

export function formatDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatGuestName(user: { firstName: string | null; lastName: string | null; username: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return t.common.guestFallbackName;
}
