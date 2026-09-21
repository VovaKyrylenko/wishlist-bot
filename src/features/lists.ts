// The owner's side of a list: the list screen itself, sharing, "Про список",
// co-authors, finishing and deleting.
//
// Two rules shape every screen here. The surprise contract (§8.4) decides what
// the owner is allowed to see about promises — never who, never what, and a
// count only when there are enough gifts that the count is not itself a
// spoiler. And a co-author sees exactly this screen minus the dangerous
// actions, with a line saying so, rather than buttons that refuse them.

import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser } from "../lib/users.js";
import { lookupList, type ListAccess } from "../lib/access.js";
import { generateSlug } from "../lib/ids.js";
import { buildEditorInviteLink, buildListDeepLink } from "../lib/deeplink.js";
import { computeAvailability, holdingReservations } from "../lib/availability.js";
import {
  escapeHtml,
  formatDate,
  formatGuestName,
  formatOwnerName,
  formatRelativeDate,
  PRIORITY_ICON,
} from "../lib/format.js";
import { isPast, parseEventDate } from "../lib/dates.js";
import { clearPending, type Pending } from "../lib/pending.js";
import { ask } from "../lib/prompt.js";
import { getDraft, hasContent, updateDraft } from "../lib/drafts.js";
import { notifyGuestListFinished, notifyGuestListDeleted, notifyOwnerCoAuthorJoined } from "../lib/notify.js";
import {
  ack,
  addIndexButtons,
  addPagerRow,
  block,
  blocks,
  paginate,
  renderScreen,
  truncate,
} from "../lib/screen.js";
import { listIcon, renderHome, withUndo, type ScreenOptions } from "./home.js";
import { t } from "../text.js";

/** Two lines per gift, so a page still fits comfortably on a phone screen. */
const GIFTS_PER_PAGE = 8;
const CO_AUTHORS_PER_PAGE = 10;
/**
 * Below this many gifts even "друзі обрали 2" points straight at what was
 * taken, so the pulse drops the number entirely (§8.4).
 */
const PULSE_MIN_GIFTS = 4;

const PRESETS = [
  { label: t.buttons.presetBirthday, title: "🎂 День народження" },
  { label: t.buttons.presetNewYear, title: "🎄 Новий рік" },
  { label: t.buttons.presetWedding, title: "💍 Весілля" },
];

/**
 * Loads a list for an action, or renders the honest fallback and returns null.
 * Failure never ends in an alert the user has to dismiss to find out where
 * they are — it ends on a screen with a next step.
 */
export async function requireList(
  ctx: MyContext,
  wishlistId: string,
  options: { owner?: boolean } = {},
): Promise<ListAccess | null> {
  const found = await lookupList(ctx, wishlistId);
  if (!found.ok) {
    await renderHome(ctx, 0, {
      notice: found.reason === "gone" ? t.common.listGone : t.common.noAccessAlert,
    });
    return null;
  }
  if (options.owner && !found.access.isOwner) {
    await renderList(ctx, wishlistId, 0, { notice: t.list.aboutReadOnly });
    return null;
  }
  return found.access;
}

// ── S3 · Мій список ────────────────────────────────────────────────────────

export async function renderList(
  ctx: MyContext,
  wishlistId: string,
  page = 0,
  options: ScreenOptions = {},
) {
  const access = await requireList(ctx, wishlistId);
  if (!access) return;
  const { wishlist, isOwner } = access;

  const gifts = await prisma.wishlistItem.findMany({
    where: { wishlistId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    include: { reservations: { where: holdingReservations } },
  });

  const finished = wishlist.status === "ARCHIVED";
  const surprise = wishlist.privacyMode === "SURPRISE";
  const chosen = gifts.filter((g) => computeAvailability(g.quantity, g.reservations).reserved > 0).length;
  const paged = paginate(gifts, page, GIFTS_PER_PAGE);

  const header = block(
    t.list.header(listIcon(wishlist.title, finished), escapeHtml(wishlist.title)),
    wishlist.eventDate
      ? t.list.dateLine(formatDate(wishlist.eventDate), formatRelativeDate(wishlist.eventDate))
      : null,
    wishlist.description ? escapeHtml(wishlist.description) : null,
  );

  const status = block(
    finished ? t.list.finishedNotice : null,
    !isOwner ? t.list.coAuthorNotice : null,
    pulseLine(surprise, chosen, gifts.length),
  );

  const body =
    gifts.length === 0
      ? finished
        ? t.list.emptyFinished
        : t.list.empty
      : block(
          ...paged.slice.flatMap((gift, i) => {
            const meta = [
              gift.price ? escapeHtml(gift.price) : null,
              surprise ? null : shortAvailability(gift.quantity, gift.reservations),
            ].filter((v): v is string => Boolean(v));
            const rows = [
              t.list.giftRow(
                paged.offset + i + 1,
                PRIORITY_ICON[gift.priority],
                escapeHtml(truncate(gift.title, 60)),
              ),
            ];
            if (meta.length > 0) rows.push(t.list.giftRowMeta(meta));
            return rows;
          }),
        );

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (gift) => `it:open:${gift.id}:${paged.page}`);
  addPagerRow(kb, paged, (p) => `wl:open:${wishlistId}:${p}`);

  if (!finished) {
    kb.row().text(t.buttons.addGift, `it:add:${wishlistId}`);
    const secondary = kb.row().text(t.buttons.share, `wl:share:${wishlistId}`);
    if (isOwner) secondary.text(t.buttons.aboutList, `wl:set:${wishlistId}`);
    if (!surprise && chosen > 0) kb.row().text(t.buttons.whoGivesWhat, `wl:who:${wishlistId}`);
  } else if (isOwner) {
    kb.row().text(t.buttons.reuseList, `wl:reuse:${wishlistId}`);
    kb.row().text(t.buttons.reopenList, `wl:reopen:${wishlistId}`);
  }
  kb.row().text(t.buttons.backHome, "home");

  await renderScreen(ctx, {
    text: blocks(
      options.notice ?? null,
      header,
      status,
      body,
      gifts.length > 0 ? t.list.tapGiftHint : null,
    ),
    keyboard: withUndo(kb, options),
  });
}

/**
 * What the owner is allowed to feel about their own list. Enough to know it is
 * working, never enough to know what is coming.
 */
function pulseLine(surprise: boolean, chosen: number, total: number): string | null {
  if (chosen === 0) return null;
  if (!surprise) return t.list.pulseOpen(chosen, total);
  return total >= PULSE_MIN_GIFTS ? t.list.pulseChosen(chosen, total) : t.list.pulseAlive;
}

/** The short status next to a gift — only ever shown with the surprise off. */
export function shortAvailability(quantity: number, reservations: { quantity: number }[]): string {
  const a = computeAvailability(quantity, reservations);
  if (a.isFull) return t.labels.taken;
  if (a.reserved > 0) return t.labels.partly(a.available, a.needed);
  return quantity > 1 ? `${quantity} шт` : "";
}

// ── Створення списку ───────────────────────────────────────────────────────

/**
 * O2 — one question, and presets that answer it for most people in a single
 * tap. The description, date and surprise mode all have workable defaults and
 * live in "Про список"; asking for them up front put four prompts between a
 * person and their first gift.
 */
async function renderNewListScreen(ctx: MyContext) {
  const kb = new InlineKeyboard();
  PRESETS.forEach((preset, i) => kb.text(preset.label, `wl:preset:${i}`).row());
  kb.text(t.buttons.presetCustom, "wl:custom").row();
  kb.text(t.buttons.backHome, "home");
  await renderScreen(ctx, { text: t.home.askListName, keyboard: kb });
}

async function createList(ctx: MyContext, title: string) {
  const user = await currentUser(ctx);
  const wishlist = await prisma.wishlist.create({
    data: { title: truncate(title, 80), slug: generateSlug(), ownerId: user.id },
  });
  await clearPending(ctx, user.id);

  // F3 — the gift someone pasted before they had any list rides straight into
  // the one they just created, instead of sitting orphaned in a draft until
  // the next plain message happens to surface it.
  const draft = await getDraft(user.id);
  if (draft && !draft.wishlistId && hasContent(draft)) {
    // Dynamic import: gifts.ts already imports renderList from this module.
    const { renderDraft, startGiftFromInput } = await import("./gifts.js");
    if (!draft.title && draft.url) {
      // The link was stored unscraped — run it through the normal preview path.
      await startGiftFromInput(ctx, { url: draft.url }, wishlist.id);
      return;
    }
    await updateDraft(user.id, { wishlistId: wishlist.id });
    if (!draft.title && draft.imageUrl) {
      await ask(ctx, "draft.title", { text: t.gift.askPhotoTitle, back: "dr:cancel" });
      return;
    }
    await renderDraft(ctx, { notice: t.list.created(escapeHtml(wishlist.title)) });
    return;
  }

  await renderList(ctx, wishlist.id, 0, {
    notice: t.list.created(escapeHtml(wishlist.title)),
  });
}

// ── S6 · Поширення ─────────────────────────────────────────────────────────

async function renderShare(ctx: MyContext, wishlistId: string, force = false) {
  const access = await requireList(ctx, wishlistId);
  if (!access) return;
  const { wishlist } = access;

  const gifts = await prisma.wishlistItem.findMany({
    where: { wishlistId, status: "ACTIVE" },
    include: { reservations: { where: holdingReservations } },
  });

  // Sharing a list with nothing in it wastes the one moment a friend actually
  // clicks through, so say so before they send it.
  if (gifts.length === 0 && !force) {
    await renderScreen(ctx, {
      text: blocks(t.list.shareHeader(escapeHtml(wishlist.title)), t.list.shareEmpty),
      keyboard: new InlineKeyboard()
        .text(t.buttons.addGift, `it:add:${wishlistId}`)
        .row()
        .text(t.buttons.shareAnyway, `wl:share:${wishlistId}:f`)
        .row()
        .text(t.buttons.back, `wl:open:${wishlistId}:0`),
    });
    return;
  }

  const owner = await prisma.user.findUnique({ where: { id: wishlist.ownerId } });
  const free = gifts.filter((g) => computeAvailability(g.quantity, g.reservations).available > 0).length;
  const link = buildListDeepLink(ctx.me.username, wishlist.slug);

  await renderScreen(ctx, {
    text: blocks(
      t.list.shareHeader(escapeHtml(wishlist.title)),
      block(
        t.list.sharePreviewHeader,
        "",
        t.list.sharePreview(
          escapeHtml(wishlist.title),
          escapeHtml(owner ? formatOwnerName(owner) : t.common.guestFallbackName),
          wishlist.eventDate ? formatDate(wishlist.eventDate) : null,
          t.list.shareFreeCount(free, gifts.length),
        ),
      ),
      block(t.list.shareLinkHeader, `<code>${escapeHtml(link)}</code>`),
    ),
    keyboard: new InlineKeyboard()
      .switchInline(t.buttons.sendToFriend, t.list.shareMessage(wishlist.title, link))
      .row()
      .text(t.buttons.inviteCoAuthor, `wl:co:${wishlistId}:0`)
      .row()
      .text(t.buttons.back, `wl:open:${wishlistId}:0`),
  });
}

// ── S7 · Про список ────────────────────────────────────────────────────────

async function renderAbout(ctx: MyContext, wishlistId: string, options: ScreenOptions = {}) {
  const access = await requireList(ctx, wishlistId, { owner: true });
  if (!access) return;
  const { wishlist } = access;

  const surprise = wishlist.privacyMode === "SURPRISE";
  const coAuthorCount = wishlist.editors.length;

  const kb = new InlineKeyboard()
    .text(t.buttons.editTitle, `wl:title:${wishlistId}`)
    .text(t.buttons.editDescription, `wl:desc:${wishlistId}`)
    .row()
    .text(t.buttons.editDate, `wl:date:${wishlistId}`)
    .row()
    .text(surprise ? t.buttons.surpriseOn : t.buttons.surpriseOff, `wl:surprise:${wishlistId}`)
    .row()
    .text(wishlist.notifyOwner ? t.buttons.notifyOn : t.buttons.notifyOff, `wl:notify:${wishlistId}`)
    .row()
    .text(t.buttons.coAuthors, `wl:co:${wishlistId}:0`)
    .row()
    .text(t.buttons.rotateLink, `wl:rot:${wishlistId}`)
    .row();

  // Destructive actions stand alone at the bottom, never beside "✏️" (§15.3).
  if (wishlist.status === "ACTIVE") kb.text(t.buttons.finishList, `wl:fin:${wishlistId}`).row();
  else kb.text(t.buttons.reopenList, `wl:reopen:${wishlistId}`).row();
  kb.text(t.buttons.deleteList, `wl:del:${wishlistId}`).row();
  kb.text(t.buttons.back, `wl:open:${wishlistId}:0`);

  await renderScreen(ctx, {
    text: blocks(
      options.notice ?? null,
      t.list.aboutHeader(escapeHtml(wishlist.title)),
      block(
        wishlist.description ? escapeHtml(wishlist.description) : t.list.aboutNoDescription,
        wishlist.eventDate
          ? t.list.aboutDate(
              formatDate(wishlist.eventDate),
              formatRelativeDate(wishlist.eventDate) ?? "",
            )
          : t.list.aboutNoDate,
        wishlist.eventDate && isPast(wishlist.eventDate) ? t.list.aboutDatePast : null,
      ),
      block(
        surprise ? t.list.aboutSurpriseOn : t.list.aboutSurpriseOff,
        wishlist.notifyOwner ? t.list.aboutNotifyOn : t.list.aboutNotifyOff,
        t.list.aboutCoAuthors(coAuthorCount),
        wishlist.editorInviteToken ? t.list.aboutInviteOpen : null,
      ),
    ),
    keyboard: kb,
  });
}

/** Reachable only with the surprise switched off — that is the whole contract. */
async function renderWhoGivesWhat(ctx: MyContext, wishlistId: string) {
  const access = await requireList(ctx, wishlistId, { owner: true });
  if (!access) return;
  const { wishlist } = access;

  if (wishlist.privacyMode === "SURPRISE") {
    await renderList(ctx, wishlistId, 0, { notice: t.list.aboutSurpriseOn });
    return;
  }

  const reservations = await prisma.reservation.findMany({
    where: { ...holdingReservations, item: { wishlistId, status: "ACTIVE" } },
    include: { item: true, guest: true },
    orderBy: { createdAt: "asc" },
  });

  await renderScreen(ctx, {
    text: blocks(
      t.list.promisesHeader(escapeHtml(wishlist.title)),
      reservations.length === 0
        ? t.list.promisesEmpty
        : block(
            ...reservations.map((r) =>
              t.list.promiseRow(
                escapeHtml(truncate(r.item.title, 60)),
                escapeHtml(r.contactSnapshot || formatGuestName(r.guest)),
                t.labels.promiseStatus[r.status],
              ),
            ),
          ),
    ),
    keyboard: new InlineKeyboard().text(t.buttons.back, `wl:open:${wishlistId}:0`),
  });
}

// ── Співавтори ─────────────────────────────────────────────────────────────

async function renderCoAuthors(
  ctx: MyContext,
  wishlistId: string,
  page = 0,
  options: ScreenOptions = {},
) {
  const access = await requireList(ctx, wishlistId, { owner: true });
  if (!access) return;
  const { wishlist } = access;

  const coAuthors = await prisma.wishlistEditor.findMany({
    where: { wishlistId },
    include: { user: true },
    orderBy: { addedAt: "asc" },
  });

  const paged = paginate(coAuthors, page, CO_AUTHORS_PER_PAGE);
  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (c) => `wl:corm:${wishlistId}:${c.userId}`);
  addPagerRow(kb, paged, (p) => `wl:co:${wishlistId}:${p}`);
  kb.row().text(
    wishlist.editorInviteToken ? t.buttons.revokeInvite : t.buttons.createInvite,
    `${wishlist.editorInviteToken ? "wl:corevoke" : "wl:coinvite"}:${wishlistId}`,
  );
  kb.row().text(t.buttons.back, `wl:set:${wishlistId}`);

  await renderScreen(ctx, {
    keyboard: withUndo(kb, options),
    text: blocks(
      options.notice ?? null,
      t.list.coAuthorsHeader(escapeHtml(wishlist.title)),
      t.list.coAuthorsIntro,
      coAuthors.length === 0
        ? t.list.coAuthorsEmpty
        : block(
            ...paged.slice.map((c, i) =>
              t.list.coAuthorRow(paged.offset + i + 1, escapeHtml(formatGuestName(c.user))),
            ),
            "",
            t.list.coAuthorsHint,
          ),
      wishlist.editorInviteToken
        ? t.list.inviteCreated(
            escapeHtml(wishlist.title),
            `<code>${escapeHtml(buildEditorInviteLink(ctx.me.username, wishlist.editorInviteToken))}</code>`,
          )
        : null,
    ),
  });
}

/**
 * Accepting an invite. The invitee confirms on a screen of their own first —
 * following a link should not silently hand someone write access to a list
 * they have not looked at.
 */
export async function renderInvite(ctx: MyContext, token: string) {
  const user = await currentUser(ctx);
  const wishlist = await prisma.wishlist.findUnique({
    where: { editorInviteToken: token },
    include: { owner: true },
  });

  if (!wishlist) {
    await renderHome(ctx, 0, { notice: t.list.inviteInvalid });
    return;
  }
  if (wishlist.ownerId === user.id) {
    await renderList(ctx, wishlist.id, 0, { notice: t.list.inviteOwn });
    return;
  }

  await renderScreen(ctx, {
    text: t.list.inviteMessage(
      escapeHtml(formatOwnerName(wishlist.owner)),
      escapeHtml(wishlist.title),
    ),
    keyboard: new InlineKeyboard()
      .text(t.buttons.joinAsCoAuthor, `wl:join:${token}`)
      .row()
      .text(t.buttons.backHome, "home"),
  });
}

async function acceptInvite(ctx: MyContext, token: string) {
  const user = await currentUser(ctx);
  const wishlist = await prisma.wishlist.findUnique({
    where: { editorInviteToken: token },
    include: { owner: true },
  });
  if (!wishlist) {
    await renderHome(ctx, 0, { notice: t.list.inviteInvalid });
    return;
  }
  if (wishlist.ownerId === user.id) {
    await renderList(ctx, wishlist.id, 0, { notice: t.list.inviteOwn });
    return;
  }

  // Single-use: the token is cleared the moment it is redeemed, so a forwarded
  // link cannot keep letting people in.
  await prisma.$transaction([
    prisma.wishlistEditor.upsert({
      where: { wishlistId_userId: { wishlistId: wishlist.id, userId: user.id } },
      create: { wishlistId: wishlist.id, userId: user.id },
      update: {},
    }),
    prisma.wishlist.update({ where: { id: wishlist.id }, data: { editorInviteToken: null } }),
  ]);

  await notifyOwnerCoAuthorJoined(ctx.api, {
    ownerTelegramId: wishlist.owner.telegramId,
    wishlistTitle: wishlist.title,
    name: formatGuestName(user),
  });
  await renderList(ctx, wishlist.id, 0, { notice: t.list.inviteAccepted(escapeHtml(wishlist.title)) });
}

// ── Відповіді на запитання про список ──────────────────────────────────────

/** Applies a text answer that belongs to a list. Returns false if it does not. */
export async function applyListAnswer(ctx: MyContext, pending: Pending, text: string): Promise<boolean> {
  const user = await currentUser(ctx);

  if (pending.action === "list.title") {
    await createList(ctx, text);
    return true;
  }
  // Only list questions are ours. A gift question carries a gift id, and
  // reading it as a list id below found no list, showed "list deleted" and
  // swallowed every saved-gift edit before gifts.ts ever saw it.
  if (!pending.action.startsWith("wl.") || !pending.id) return false;

  const access = await requireList(ctx, pending.id, { owner: true });
  if (!access) {
    await clearPending(ctx, user.id);
    return true;
  }

  if (pending.action === "wl.title") {
    const title = truncate(text, 80);
    await prisma.wishlist.update({ where: { id: pending.id }, data: { title } });
    await clearPending(ctx, user.id);
    await renderAbout(ctx, pending.id, { notice: t.list.titleUpdated(escapeHtml(title)) });
    return true;
  }

  if (pending.action === "wl.description") {
    await prisma.wishlist.update({ where: { id: pending.id }, data: { description: text } });
    await clearPending(ctx, user.id);
    await renderAbout(ctx, pending.id, { notice: t.list.descriptionUpdated });
    return true;
  }

  if (pending.action === "wl.date") {
    const eventDate = parseEventDate(text);
    if (!eventDate) {
      // Re-ask rather than give up: the parser understands several shapes and
      // the user probably reached for one it does not.
      await ask(ctx, "wl.date", {
        text: block(t.list.dateNotRecognized, "", t.list.askDate),
        back: `wl:set:${pending.id}`,
        skip: `wl:date:${pending.id}:skip`,
        id: pending.id,
      });
      return true;
    }
    // A new date deserves a fresh reminder, so clear the "already sent" mark.
    await prisma.wishlist.update({
      where: { id: pending.id },
      data: { eventDate, reminderSentAt: null },
    });
    await clearPending(ctx, user.id);
    await renderAbout(ctx, pending.id, {
      notice: block(
        t.list.dateUpdated(formatDate(eventDate)),
        isPast(eventDate) ? t.list.datePastNotice : null,
      ),
    });
    return true;
  }

  return false;
}

export function registerLists(bot: Bot<MyContext>) {
  bot.callbackQuery("wl:new", async (ctx) => {
    await renderNewListScreen(ctx);
  });

  bot.callbackQuery(/^wl:preset:(\d+)$/, async (ctx) => {
    const preset = PRESETS[Number(ctx.match[1])];
    if (!preset) {
      await renderNewListScreen(ctx);
      return;
    }
    await ack(ctx);
    await createList(ctx, preset.title);
  });

  bot.callbackQuery("wl:custom", async (ctx) => {
    await ask(ctx, "list.title", { text: t.home.askListNameCustom, back: "wl:new" });
  });

  bot.callbackQuery(/^wl:open:([^:]+):(\d+)$/, async (ctx) => {
    await renderList(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^wl:share:([^:]+)(:f)?$/, async (ctx) => {
    await renderShare(ctx, ctx.match[1], Boolean(ctx.match[2]));
  });

  bot.callbackQuery(/^wl:set:([^:]+)$/, async (ctx) => {
    await renderAbout(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:who:([^:]+)$/, async (ctx) => {
    await renderWhoGivesWhat(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:title:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    await ask(ctx, "wl.title", { text: t.list.askTitle, back: `wl:set:${ctx.match[1]}`, id: ctx.match[1] });
  });

  bot.callbackQuery(/^wl:desc:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    await ask(ctx, "wl.description", {
      text: t.list.askDescription,
      back: `wl:set:${ctx.match[1]}`,
      skip: `wl:desc:${ctx.match[1]}:skip`,
      id: ctx.match[1],
    });
  });

  bot.callbackQuery(/^wl:desc:([^:]+):skip$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await prisma.wishlist.update({ where: { id: ctx.match[1] }, data: { description: null } });
    await clearPending(ctx, access.user.id);
    await renderAbout(ctx, ctx.match[1], { notice: t.list.descriptionRemoved });
  });

  bot.callbackQuery(/^wl:date:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    await ask(ctx, "wl.date", {
      text: t.list.askDate,
      back: `wl:set:${ctx.match[1]}`,
      skip: `wl:date:${ctx.match[1]}:skip`,
      id: ctx.match[1],
    });
  });

  bot.callbackQuery(/^wl:date:([^:]+):skip$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await prisma.wishlist.update({
      where: { id: ctx.match[1] },
      data: { eventDate: null, reminderSentAt: null },
    });
    await clearPending(ctx, access.user.id);
    await renderAbout(ctx, ctx.match[1], { notice: t.list.dateRemoved });
  });

  // Turning the surprise off changes what other people were promised, so it is
  // the one toggle that asks first.
  bot.callbackQuery(/^wl:surprise:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;

    if (access.wishlist.privacyMode === "SURPRISE") {
      await renderScreen(ctx, {
        text: t.list.confirmSurpriseOff,
        keyboard: new InlineKeyboard()
          .text(t.buttons.confirmSurpriseOff, `wl:surpriseoff:${ctx.match[1]}`)
          .row()
          .text(t.buttons.no, `wl:set:${ctx.match[1]}`),
      });
      return;
    }
    await prisma.wishlist.update({ where: { id: ctx.match[1] }, data: { privacyMode: "SURPRISE" } });
    await renderAbout(ctx, ctx.match[1], { notice: t.list.surpriseTurnedOn });
  });

  bot.callbackQuery(/^wl:surpriseoff:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    await prisma.wishlist.update({ where: { id: ctx.match[1] }, data: { privacyMode: "OPEN" } });
    await renderAbout(ctx, ctx.match[1], { notice: t.list.surpriseTurnedOff });
  });

  bot.callbackQuery(/^wl:notify:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    const notifyOwner = !access.wishlist.notifyOwner;
    await prisma.wishlist.update({ where: { id: ctx.match[1] }, data: { notifyOwner } });
    await renderAbout(ctx, ctx.match[1], {
      notice: notifyOwner ? t.list.notifyUpdatedOn : t.list.notifyUpdatedOff,
    });
  });

  bot.callbackQuery(/^wl:rot:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    await renderScreen(ctx, {
      text: t.list.confirmRotateLink,
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmRotateLink, `wl:rotgo:${ctx.match[1]}`)
        .row()
        .text(t.buttons.no, `wl:set:${ctx.match[1]}`),
    });
  });

  // A leaked share link used to be permanent: the slug never changed, so the
  // only way to take a list back was to delete it.
  bot.callbackQuery(/^wl:rotgo:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    const updated = await prisma.wishlist.update({
      where: { id: ctx.match[1] },
      data: { slug: generateSlug() },
    });
    await renderAbout(ctx, updated.id, {
      notice: t.list.linkRotated(
        `<code>${escapeHtml(buildListDeepLink(ctx.me.username, updated.slug))}</code>`,
      ),
    });
  });

  bot.callbackQuery(/^wl:co:([^:]+):(\d+)$/, async (ctx) => {
    await renderCoAuthors(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^wl:coinvite:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await prisma.wishlist.update({
      where: { id: ctx.match[1] },
      data: { editorInviteToken: generateSlug(16) },
    });
    await renderCoAuthors(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:corevoke:([^:]+)$/, async (ctx) => {
    if (!(await requireList(ctx, ctx.match[1], { owner: true }))) return;
    await prisma.wishlist.update({ where: { id: ctx.match[1] }, data: { editorInviteToken: null } });
    await renderCoAuthors(ctx, ctx.match[1], 0, { notice: t.list.inviteRevoked });
  });

  // Removing a co-author is instant and undoable rather than confirmed: the
  // cost of a mistap is one more tap, and the "↩️" says so.
  bot.callbackQuery(/^wl:corm:([^:]+):([^:]+)$/, async (ctx) => {
    const [, wishlistId, userId] = ctx.match;
    if (!(await requireList(ctx, wishlistId, { owner: true }))) return;

    const removed = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.wishlistEditor.deleteMany({ where: { wishlistId, userId } });

    await renderCoAuthors(ctx, wishlistId, 0, {
      notice: t.list.coAuthorRemoved(
        escapeHtml(removed ? formatGuestName(removed) : t.common.guestFallbackName),
      ),
      undo: `wl:coundo:${wishlistId}:${userId}`,
    });
  });

  bot.callbackQuery(/^wl:coundo:([^:]+):([^:]+)$/, async (ctx) => {
    const [, wishlistId, userId] = ctx.match;
    if (!(await requireList(ctx, wishlistId, { owner: true }))) return;
    const restored = await prisma.user.findUnique({ where: { id: userId } });
    if (restored) {
      await prisma.wishlistEditor.upsert({
        where: { wishlistId_userId: { wishlistId, userId } },
        create: { wishlistId, userId },
        update: {},
      });
    }
    await renderCoAuthors(ctx, wishlistId, 0, {
      notice: restored ? t.list.coAuthorRestored(escapeHtml(formatGuestName(restored))) : undefined,
    });
  });

  bot.callbackQuery(/^wl:join:([^:]+)$/, async (ctx) => {
    await acceptInvite(ctx, ctx.match[1]);
  });

  // ── Завершення ───────────────────────────────────────────────────────────

  bot.callbackQuery(/^wl:fin:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await renderScreen(ctx, {
      text: t.list.confirmFinish(escapeHtml(access.wishlist.title)),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmFinishList, `wl:fingo:${ctx.match[1]}`)
        .row()
        .text(t.buttons.no, `wl:set:${ctx.match[1]}`),
    });
  });

  bot.callbackQuery(/^wl:fingo:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await ack(ctx);

    const wishlist = await prisma.wishlist.update({
      where: { id: ctx.match[1] },
      data: { status: "ARCHIVED" },
    });

    const affected = await prisma.reservation.findMany({
      where: { ...holdingReservations, item: { wishlistId: wishlist.id } },
      include: { guest: true },
      distinct: ["guestId"],
    });
    for (const r of affected) {
      await notifyGuestListFinished(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: wishlist.title,
      });
    }

    await renderList(ctx, wishlist.id, 0, { notice: t.list.finished(escapeHtml(wishlist.title)) });
  });

  bot.callbackQuery(/^wl:reopen:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await prisma.wishlist.update({ where: { id: ctx.match[1] }, data: { status: "ACTIVE" } });
    await renderList(ctx, ctx.match[1], 0, {
      notice: t.list.reopened(escapeHtml(access.wishlist.title)),
    });
  });

  /** O15 — the same list, next year, without last year's promises. */
  bot.callbackQuery(/^wl:reuse:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await ack(ctx);

    const gifts = await prisma.wishlistItem.findMany({
      where: { wishlistId: access.wishlist.id, status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    const copy = await prisma.wishlist.create({
      data: {
        title: truncate(access.wishlist.title, 80),
        description: access.wishlist.description,
        eventDate: null,
        privacyMode: access.wishlist.privacyMode,
        slug: generateSlug(),
        ownerId: access.wishlist.ownerId,
        items: {
          create: gifts.map((g) => ({
            title: g.title,
            url: g.url,
            imageUrl: g.imageUrl,
            price: g.price,
            priceAmount: g.priceAmount,
            priceCurrency: g.priceCurrency,
            store: g.store,
            comment: g.comment,
            priority: g.priority,
            quantity: g.quantity,
            sortOrder: g.sortOrder,
          })),
        },
      },
    });

    await renderList(ctx, copy.id, 0, {
      notice: t.list.reused(escapeHtml(copy.title), gifts.length),
    });
  });

  // ── Видалення (двокрокове, без undo — і про це сказано прямо) ────────────

  bot.callbackQuery(/^wl:del:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;

    const affected = await prisma.reservation.findMany({
      where: { ...holdingReservations, item: { wishlistId: access.wishlist.id } },
      distinct: ["guestId"],
      select: { guestId: true },
    });

    await renderScreen(ctx, {
      text: t.list.confirmDeleteStep1(
        escapeHtml(access.wishlist.title),
        affected.length > 0 ? t.list.deleteWarningPromises(affected.length) : null,
      ),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDeleteList, `wl:del2:${ctx.match[1]}`)
        .row()
        .text(t.buttons.no, `wl:set:${ctx.match[1]}`),
    });
  });

  bot.callbackQuery(/^wl:del2:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    const giftCount = await prisma.wishlistItem.count({
      where: { wishlistId: ctx.match[1], status: "ACTIVE" },
    });
    await renderScreen(ctx, {
      text: t.list.confirmDeleteStep2(escapeHtml(access.wishlist.title), giftCount),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDeleteListFinal(t.plural.gifts(giftCount)), `wl:delgo:${ctx.match[1]}`)
        .row()
        .text(t.buttons.no, `wl:set:${ctx.match[1]}`),
    });
  });

  bot.callbackQuery(/^wl:delgo:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1], { owner: true });
    if (!access) return;
    await ack(ctx);

    const affected = await prisma.reservation.findMany({
      where: { ...holdingReservations, item: { wishlistId: access.wishlist.id } },
      include: { guest: true },
      distinct: ["guestId"],
    });

    const title = access.wishlist.title;
    await prisma.wishlist.delete({ where: { id: access.wishlist.id } });

    for (const r of affected) {
      await notifyGuestListDeleted(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: title,
      });
    }

    await renderHome(ctx, 0, { notice: t.list.deleted(escapeHtml(title)) });
  });
}
