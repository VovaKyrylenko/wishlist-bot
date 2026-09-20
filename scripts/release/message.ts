// Builds the Telegram announcement out of model-written highlights and code-resolved
// places in the bot. Pure formatting and validation: no git, no network, no model. It
// is separate from notes.ts so the exact text the channel receives can be produced and
// checked without running the pipeline.

import type { AreaCandidate } from "./areas.js";

/** Telegram rejects messages over 4096 characters. */
const TELEGRAM_LIMIT = 4096;

export interface Highlight {
  title: string;
  context: string;
  steps: string[];
  undo: string | null;
  areaId: string | null;
}

// The vocabulary .claude/rules/voice.md bans, as stems so inflected forms are caught
// too. The prompt asks the model to avoid them; this check is what makes it a guarantee
// instead of a hope, because a channel post cannot be unsaid.
export const BANNED_STEMS = [
  "вішліст",
  "бронюв",
  "забронюв",
  "придбан",
  "підписк",
  "підписат",
  "редактор",
  "архів",
  "ротаці",
  "пріоритет",
];

export function bannedWord(text: string): string | null {
  const lower = text.toLowerCase();
  return BANNED_STEMS.find((stem) => lower.includes(stem)) ?? null;
}

function highlightText(item: Highlight): string {
  return [item.title, item.context, ...item.steps, item.undo ?? ""].join("\n");
}

/** Telegram's HTML parse mode needs exactly these three escaped. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightBlock(item: Highlight, areasById: Map<string, AreaCandidate>): string {
  const area = item.areaId ? areasById.get(item.areaId) : undefined;
  const steps = item.steps.map((step) => step.trim()).filter(Boolean);
  const lines = [`<b>${escapeHtml(item.title.trim())}</b>`];

  if (item.context.trim()) lines.push(escapeHtml(item.context.trim()));

  if (area) {
    if (steps.length > 0) {
      lines.push("", "<b>Як це зробити</b>", `1. ${escapeHtml(area.path)}`);
      steps.forEach((step, index) => lines.push(`${index + 2}. ${escapeHtml(step)}`));
    } else {
      lines.push(`↳ ${escapeHtml(area.path)}`);
    }
  }

  if (item.undo?.trim()) lines.push("", "<b>Якщо щось пішло не так</b>", escapeHtml(item.undo.trim()));

  return lines.join("\n");
}

export function telegramMessage(args: {
  version: string;
  highlights: Highlight[];
  areas: AreaCandidate[];
  releaseUrl: string;
}): string {
  const header = escapeHtml(`💜 Що нового в боті (${args.version})`);
  const footer =
    `<a href="${escapeHtml(args.releaseUrl)}">Усі зміни</a> — ` +
    escapeHtml("технічний опис для розробників, у звичайному користуванні він не потрібен.");
  const areasById = new Map(args.areas.map((area) => [area.id, area]));

  const compose = (items: Highlight[]) =>
    [header, ...items.map((item) => highlightBlock(item, areasById)), footer].join("\n\n");

  // Whole highlights give way before anything is cut mid-sentence; the header and the
  // release link always survive.
  const items = [...args.highlights];
  while (items.length > 1 && compose(items).length > TELEGRAM_LIMIT) items.pop();

  const message = compose(items);
  return message.length <= TELEGRAM_LIMIT ? message : `${message.slice(0, TELEGRAM_LIMIT - 1)}…`;
}

/** Keeps only highlights that pass the vocabulary check; reports what it dropped. */
export function vetHighlights(items: Highlight[]): { kept: Highlight[]; dropped: string[] } {
  const kept: Highlight[] = [];
  const dropped: string[] = [];
  for (const item of items) {
    const hit = bannedWord(highlightText(item));
    if (hit) dropped.push(`"${item.title}" (uses "${hit}")`);
    else kept.push(item);
  }
  return { kept, dropped };
}
