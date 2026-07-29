// Drives the real bot with synthetic Telegram updates.
//
// Everything the bot sends is intercepted before it leaves the process, so a
// run reaches neither Telegram nor anyone's chat. What it does reach is the
// database, which is why `assertStaging()` refuses to do anything unless the
// connection points at a database with "staging" in its name. Prisma writes
// `public.` into every query it builds, so neither `search_path` nor a schema
// qualifier can fence a run off — only a separate database can.

import { getBot } from "../../src/bot.js";
import { prisma } from "../../src/db.js";

export interface Sent {
  chatId: number;
  messageId: number;
  method: string;
  text: string;
  buttons: string[][];
  photo?: string;
}

export const sent: Sent[] = [];
export const lastMessage = new Map<number, { id: number; photo: boolean }>();

let messageSeq = 1000;
let updateSeq = 1;

const bot = getBot();

bot.api.config.use(async (_prev, method, payload: Record<string, unknown>) => {
  if (method === "getMe") {
    return {
      ok: true,
      result: {
        id: 42,
        is_bot: true,
        first_name: "Wishlist",
        username: "wishlist_bot",
        can_join_groups: false,
        can_read_all_group_messages: false,
        supports_inline_queries: true,
      },
    } as never;
  }

  const chatId = Number(payload?.chat_id ?? 0);
  const markup = payload?.reply_markup as
    | { inline_keyboard?: { text: string }[][]; keyboard?: { text: string }[][] }
    | undefined;
  const buttons = (markup?.inline_keyboard ?? markup?.keyboard ?? []).map((row) =>
    row.map((b) => b.text),
  );

  if (method === "sendMessage" || method === "sendPhoto") {
    const messageId = ++messageSeq;
    lastMessage.set(chatId, { id: messageId, photo: method === "sendPhoto" });
    sent.push({
      chatId,
      messageId,
      method,
      text: String(payload.text ?? payload.caption ?? ""),
      buttons,
      photo: payload.photo as string | undefined,
    });
    return { ok: true, result: { message_id: messageId, date: 0, chat: { id: chatId } } } as never;
  }

  // Telegram refuses to turn a text message into a photo one and vice versa.
  // Reproducing that is what exercises the live screen's replace path.
  if (method === "editMessageText") {
    if (lastMessage.get(chatId)?.photo) {
      return {
        ok: false,
        error_code: 400,
        description: "Bad Request: there is no text in the message to edit",
      } as never;
    }
    sent.push({
      chatId,
      messageId: Number(payload.message_id),
      method,
      text: String(payload.text ?? ""),
      buttons,
    });
    return { ok: true, result: true } as never;
  }

  if (method === "editMessageMedia") {
    const target = lastMessage.get(chatId);
    if (target && !target.photo) {
      return {
        ok: false,
        error_code: 400,
        description: "Bad Request: message can't be edited",
      } as never;
    }
    const media = payload.media as { caption?: string; media?: string };
    sent.push({
      chatId,
      messageId: Number(payload.message_id),
      method,
      text: media?.caption ?? "",
      buttons,
      photo: media?.media,
    });
    return { ok: true, result: true } as never;
  }

  return { ok: true, result: true } as never;
});

await bot.init();

export function user(id: number, firstName: string) {
  return { id, is_bot: false, first_name: firstName, language_code: "uk" };
}

export type TestUser = ReturnType<typeof user>;

const chatOf = (from: TestUser) => ({ id: from.id, type: "private", first_name: from.first_name });

export async function send(from: TestUser, text: string) {
  // Telegram tags commands with a bot_command entity and grammY's command
  // filter requires it — without one, "/start" arrives as ordinary text.
  const command = /^\/[A-Za-z0-9_]+/.exec(text);
  await bot.handleUpdate({
    update_id: updateSeq++,
    message: {
      message_id: ++messageSeq,
      date: Math.floor(Date.now() / 1000),
      chat: chatOf(from),
      from,
      text,
      ...(command
        ? { entities: [{ type: "bot_command", offset: 0, length: command[0].length }] }
        : {}),
    },
  } as never);
}

export async function sendPhoto(from: TestUser, caption?: string) {
  await bot.handleUpdate({
    update_id: updateSeq++,
    message: {
      message_id: ++messageSeq,
      date: Math.floor(Date.now() / 1000),
      chat: chatOf(from),
      from,
      caption,
      photo: [{ file_id: "PHOTO_FILE_ID", file_unique_id: "u", width: 100, height: 100 }],
    },
  } as never);
}

/**
 * Taps a button. Defaults to the chat's newest message; pass `messageId` to
 * tap an older one, which is how the auto-restore rule gets exercised.
 */
export async function tap(from: TestUser, data: string, messageId?: number) {
  await bot.handleUpdate({
    update_id: updateSeq++,
    callback_query: {
      id: String(updateSeq),
      from,
      chat_instance: "1",
      data,
      message: {
        message_id: messageId ?? lastMessage.get(from.id)?.id ?? 0,
        date: Math.floor(Date.now() / 1000),
        chat: chatOf(from),
        text: "screen",
      },
    },
  } as never);
}

export const mark = () => sent.length;

/** Everything sent since a mark, optionally narrowed to one chat. */
export function since(from: number, chatId?: number): Sent[] {
  return sent.slice(from).filter((s) => chatId === undefined || s.chatId === chatId);
}

/** The last thing a chat received since a mark — used to assert DM contents. */
export const dmTo = (chatId: number, from: number) => since(from, chatId).at(-1);

export function show(label: string, rows: Sent[]) {
  console.log(`\n══════ ${label} ══════`);
  for (const r of rows) {
    console.log(`  [${r.method} → chat ${r.chatId}]${r.photo ? ` photo=${r.photo}` : ""}`);
    for (const line of r.text.split("\n")) console.log(`  │ ${line}`);
    for (const row of r.buttons) console.log(`  ⌷ ${row.join("  |  ")}`);
  }
}

export const failures: string[] = [];

export function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✅ ${name}`);
    return;
  }
  console.log(`  ❌ ${name} ${detail}`);
  failures.push(name);
}

/** The guard that should have been here before the very first run. */
export async function assertStaging(): Promise<void> {
  const [{ db }] = await prisma.$queryRawUnsafe<{ db: string }[]>(
    "select current_database()::text as db",
  );
  if (!db.includes("staging")) {
    throw new Error(
      `refusing to run against database "${db}" — point DATABASE_URL at a staging database`,
    );
  }
  console.log(`▶ database: ${db}`);
}

export async function reset(): Promise<void> {
  await assertStaging();
  await prisma.reservation.deleteMany({});
  await prisma.draft.deleteMany({});
  await prisma.wishlist.deleteMany({});
  await prisma.user.deleteMany({});
  sent.length = 0;
  lastMessage.clear();
}

export { prisma };
