import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { generateSlug } from "../lib/ids.js";
import { buildEditorInviteLink, buildListDeepLink } from "../lib/deeplink.js";
import { escapeHtml, formatDate, formatGuestName, PRIVACY_LABEL } from "../lib/format.js";
import { computeAvailability, holdingReservations } from "../lib/availability.js";
import { notifyGuestListArchived, notifyGuestListDeleted } from "../lib/notify.js";
import { checkWishlistAccess } from "../lib/access.js";
import { renderWishlistManagement } from "./items.js";
import { ack, addIndexButtons, addPagerRow, paginate, renderScreen, truncate } from "../lib/ui.js";
import { askText } from "../lib/convo.js";
import { isPast, parseEventDate } from "../lib/dates.js";
import { t } from "../text.js";

const LISTS_PER_PAGE = 6;
const EDITORS_PER_PAGE = 10;

function privacyKeyboard(wishlistId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.buttons.privacySurprise, `wl:privset:${wishlistId}:SURPRISE`)
    .row()
    .text(t.buttons.privacyOpen, `wl:privset:${wishlistId}:OPEN`)
    .row()
    .text(t.buttons.back, `wl:set:${wishlistId}`);
}

const assertAccess = checkWishlistAccess;

export async function showMyWishlists(ctx: MyContext, page = 0) {
  const user = await upsertUserFromCtx(ctx);

  const wishlists = await prisma.wishlist.findMany({
    where: { OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }] },
    include: {
      items: {
        where: { status: "ACTIVE" },
        include: { reservations: { where: holdingReservations } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (wishlists.length === 0) {
    await renderScreen(ctx, {
      text: t.wishlist.noneYet,
      keyboard: new InlineKeyboard().text(t.buttons.menuCreate, "wl:new"),
    });
    return;
  }

  const paged = paginate(wishlists, page, LISTS_PER_PAGE);

  const rows = paged.slice.flatMap((wl, i) => {
    const reserved = wl.items.filter(
      (item) => computeAvailability(item.quantity, item.reservations).reserved > 0,
    ).length;
    const meta = [
      wl.eventDate ? `📅 ${formatDate(wl.eventDate)}` : null,
      t.wishlist.itemCount(wl.items.length),
      // Even the overview count gives the surprise away, so SURPRISE lists
      // show gift totals only.
      reserved > 0 && wl.privacyMode !== "SURPRISE" ? t.wishlist.reservedCount(reserved) : null,
      wl.status === "ARCHIVED" ? t.wishlist.archivedTag : null,
    ].filter((v): v is string => v !== null);

    return [
      t.wishlist.listRow(
        paged.offset + i + 1,
        wl.status === "ARCHIVED" ? "📦" : "🎁",
        escapeHtml(truncate(wl.title, 60)),
      ),
      t.wishlist.listRowMeta(meta),
    ];
  });

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (wl) => `wl:open:${wl.id}:0`);
  addPagerRow(kb, paged, (p) => `wl:list:${p}`);
  kb.row().text(t.buttons.menuCreate, "wl:new");

  await renderScreen(ctx, {
    text: [t.wishlist.yourLists(wishlists.length), "", ...rows, "", t.common.tapNumberHint].join("\n"),
    keyboard: kb,
  });
}

/**
 * Creating a list is a single question. Description, date and privacy all have
 * workable defaults and live one tap away in ⚙️ Налаштування — asking for them
 * up front made four prompts stand between the user and their first gift.
 */
export async function createWishlistConversation(conversation: MyConversation, ctx: MyContext) {
  const title = await askText(conversation, ctx, t.wishlist.askTitle);

  const user = await conversation.external((c) => upsertUserFromCtx(c));
  const slug = await conversation.external(() => generateSlug());
  const wishlist = await conversation.external(() =>
    prisma.wishlist.create({ data: { title, slug, ownerId: user.id } }),
  );
  await ctx.reply(t.wishlist.created(buildListDeepLink(ctx.me.username, wishlist.slug)), {
    link_preview_options: { is_disabled: true },
  });
  await renderWishlistManagement(ctx, wishlist.id);
}

async function showSettings(ctx: MyContext, wishlistId: string) {
  const access = await assertAccess(ctx, wishlistId, true);
  if (!access) return;
  const { wishlist } = access;

  const lines = [
    t.wishlist.settingsTitle(escapeHtml(wishlist.title)),
    "",
    wishlist.description ? escapeHtml(wishlist.description) : t.wishlist.noDescription,
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : t.wishlist.noDate,
    wishlist.eventDate && isPast(wishlist.eventDate) ? t.wishlist.datePastNotice : null,
    PRIVACY_LABEL[wishlist.privacyMode],
    t.wishlist.notifyOwnerLine(wishlist.notifyOwner),
    wishlist.editorInviteToken ? t.wishlist.inviteActive : null,
  ].filter((l) => l !== null);

  const kb = new InlineKeyboard()
    .text(t.buttons.editTitle, `wl:field:title:${wishlist.id}`)
    .text(t.buttons.editDescription, `wl:field:description:${wishlist.id}`)
    .row()
    .text(t.buttons.editDate, `wl:field:eventDate:${wishlist.id}`)
    .text(t.buttons.privacy, `wl:priv:${wishlist.id}`)
    .row()
    .text(wishlist.notifyOwner ? t.buttons.notifyOn : t.buttons.notifyOff, `wl:notify:${wishlist.id}`)
    .row()
    .text(t.buttons.editors, `wl:ed:${wishlist.id}:0`)
    .text(t.buttons.rotateLink, `wl:rot:${wishlist.id}`)
    .row();

  kb.text(
    wishlist.status === "ACTIVE" ? t.buttons.archive : t.buttons.unarchive,
    wishlist.status === "ACTIVE" ? `wl:arch:${wishlist.id}` : `wl:unarch:${wishlist.id}`,
  ).text(t.buttons.duplicate, `wl:dup:${wishlist.id}`);
  kb.row().text(t.buttons.deleteList, `wl:del:${wishlist.id}`);
  kb.row().text(t.buttons.backToList, `wl:open:${wishlist.id}:0`);

  await renderScreen(ctx, { text: lines.join("\n"), keyboard: kb });
}

export async function editWishlistFieldConversation(
  conversation: MyConversation,
  ctx: MyContext,
  wishlistId: string,
  field: "title" | "description" | "eventDate",
) {
  const access = await conversation.external((c) => assertAccess(c, wishlistId, true));
  if (!access) return;

  if (field === "title") {
    const title = await askText(conversation, ctx, t.wishlist.askNewTitle);
    await conversation.external(() => prisma.wishlist.update({ where: { id: wishlistId }, data: { title } }));
    await ctx.reply(t.wishlist.titleUpdated);
  } else if (field === "description") {
    const description = await askText(conversation, ctx, t.wishlist.askNewDescription, { skippable: true });
    await conversation.external(() =>
      prisma.wishlist.update({ where: { id: wishlistId }, data: { description } }),
    );
    await ctx.reply(t.wishlist.descriptionUpdated);
  } else {
    let eventDate: Date | null = null;
    let prompt = t.wishlist.askNewDate;
    for (;;) {
      const raw = await askText(conversation, ctx, prompt, { skippable: true });
      if (raw === null) break;
      eventDate = parseEventDate(raw);
      if (eventDate) break;
      prompt = t.wishlist.dateNotRecognized;
    }
    await conversation.external(() =>
      prisma.wishlist.update({
        where: { id: wishlistId },
        // A new date deserves a fresh reminder, so clear the "already sent"
        // watermark the cron reads.
        data: { eventDate, reminderSentAt: null },
      }),
    );
    await ctx.reply(t.wishlist.dateUpdated);
    if (eventDate && isPast(eventDate)) await ctx.reply(t.wishlist.datePastNotice);
  }

  await showSettings(ctx, wishlistId);
}

/**
 * Editors are invited by link rather than by username. `getChat("@name")`
 * does not resolve ordinary users, so the old flow mostly answered "не
 * знайшов такого користувача" — and when it did work it handed someone
 * write access without ever asking them.
 */
async function showEditors(ctx: MyContext, wishlistId: string, page = 0) {
  const access = await assertAccess(ctx, wishlistId, true);
  if (!access) return;
  const { wishlist } = access;

  const editors = await prisma.wishlistEditor.findMany({
    where: { wishlistId },
    include: { user: true },
    orderBy: { addedAt: "asc" },
  });

  const paged = paginate(editors, page, EDITORS_PER_PAGE);
  const rows =
    editors.length === 0
      ? [t.wishlist.noEditors]
      : [
          ...paged.slice.map((e, i) =>
            t.wishlist.editorRow(paged.offset + i + 1, escapeHtml(formatGuestName(e.user))),
          ),
          "",
          t.wishlist.editorsHint,
        ];

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (e) => `wl:edrm:${wishlistId}:${e.id}`);
  addPagerRow(kb, paged, (p) => `wl:ed:${wishlistId}:${p}`);
  kb.row().text(
    wishlist.editorInviteToken ? t.buttons.revokeInvite : t.buttons.inviteEditor,
    `${wishlist.editorInviteToken ? "wl:edrevoke" : "wl:edinvite"}:${wishlistId}`,
  );
  kb.row().text(t.buttons.backToSettings, `wl:set:${wishlistId}`);

  await renderScreen(ctx, {
    text: [t.wishlist.editorsTitle(escapeHtml(wishlist.title)), "", ...rows].join("\n"),
    keyboard: kb,
  });
}

export function registerWishlists(bot: Bot<MyContext>) {
  bot.callbackQuery(/^wl:list:(\d+)$/, async (ctx) => {
    await showMyWishlists(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery("wl:new", async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("createWishlist");
  });

  bot.callbackQuery(/^wl:set:([^:]+)$/, async (ctx) => {
    await showSettings(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:open:([^:]+):(\d+)$/, async (ctx) => {
    await renderWishlistManagement(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^wl:share:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], false);
    if (!access) return;
    const link = buildListDeepLink(ctx.me.username, access.wishlist.slug);
    const shareText = t.wishlist.shareMessage(access.wishlist.title, link);

    // Sharing a list with nothing in it wastes the one moment a friend
    // actually clicks through, so say so before they send it.
    const itemCount = await prisma.wishlistItem.count({
      where: { wishlistId: access.wishlist.id, status: "ACTIVE" },
    });

    await renderScreen(ctx, {
      text: [t.wishlist.shareHeader, "", link, itemCount === 0 ? `\n${t.wishlist.shareEmptyWarning}` : ""]
        .filter(Boolean)
        .join("\n"),
      keyboard: new InlineKeyboard()
        .switchInline(t.buttons.sendToFriend, shareText)
        .row()
        .text(t.buttons.backToList, `wl:open:${access.wishlist.id}:0`),
    });
  });

  bot.callbackQuery(/^wl:field:(title|description|eventDate):([^:]+)$/, async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("editWishlistField", ctx.match[2], ctx.match[1] as "title");
  });

  bot.callbackQuery(/^wl:priv:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await renderScreen(ctx, {
      text: t.wishlist.askPrivacyMode,
      keyboard: privacyKeyboard(access.wishlist.id),
    });
  });

  bot.callbackQuery(/^wl:privset:([^:]+):(SURPRISE|OPEN)$/, async (ctx) => {
    const wishlistId = ctx.match[1];
    const access = await assertAccess(ctx, wishlistId, true);
    if (!access) return;
    await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { privacyMode: ctx.match[2] as "SURPRISE" | "OPEN" },
    });
    await ack(ctx, t.wishlist.privacyUpdated);
    await showSettings(ctx, wishlistId);
  });

  bot.callbackQuery(/^wl:notify:([^:]+)$/, async (ctx) => {
    const wishlistId = ctx.match[1];
    const access = await assertAccess(ctx, wishlistId, true);
    if (!access) return;
    await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { notifyOwner: !access.wishlist.notifyOwner },
    });
    await ack(ctx, t.wishlist.notifyOwnerUpdated);
    await showSettings(ctx, wishlistId);
  });

  bot.callbackQuery(/^wl:rot:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await renderScreen(ctx, {
      text: t.wishlist.confirmRotateLink,
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmRotateLink, `wl:rotgo:${access.wishlist.id}`)
        .text(t.buttons.cancel, `wl:set:${access.wishlist.id}`),
    });
  });

  // A leaked share link was permanent: the slug never changed, so the only
  // way to take a list back was to delete it.
  bot.callbackQuery(/^wl:rotgo:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    const updated = await prisma.wishlist.update({
      where: { id: access.wishlist.id },
      data: { slug: generateSlug() },
    });
    await ack(ctx);
    await ctx.reply(t.wishlist.linkRotated(buildListDeepLink(ctx.me.username, updated.slug)), {
      link_preview_options: { is_disabled: true },
    });
    await showSettings(ctx, updated.id);
  });

  bot.callbackQuery(/^wl:ed:([^:]+):(\d+)$/, async (ctx) => {
    await showEditors(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^wl:edinvite:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    const token = generateSlug(16);
    await prisma.wishlist.update({
      where: { id: access.wishlist.id },
      data: { editorInviteToken: token },
    });
    await ack(ctx);
    await ctx.reply(t.wishlist.inviteCreated(buildEditorInviteLink(ctx.me.username, token)), {
      link_preview_options: { is_disabled: true },
    });
    await showEditors(ctx, access.wishlist.id);
  });

  bot.callbackQuery(/^wl:edrevoke:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await prisma.wishlist.update({
      where: { id: access.wishlist.id },
      data: { editorInviteToken: null },
    });
    await ack(ctx, t.wishlist.inviteRevoked);
    await showEditors(ctx, access.wishlist.id);
  });

  bot.callbackQuery(/^wl:edrm:([^:]+):([^:]+)$/, async (ctx) => {
    const wishlistId = ctx.match[1];
    const access = await assertAccess(ctx, wishlistId, true);
    if (!access) return;

    const editor = await prisma.wishlistEditor.findUnique({
      where: { id: ctx.match[2] },
      include: { user: true },
    });
    if (!editor || editor.wishlistId !== wishlistId) {
      await ack(ctx, t.common.notFoundAlert);
      return;
    }

    await prisma.wishlistEditor.delete({ where: { id: editor.id } });
    await ack(ctx, t.wishlist.editorRemoved(formatGuestName(editor.user)));
    await showEditors(ctx, wishlistId);
  });

  bot.callbackQuery(/^wl:arch:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await renderScreen(ctx, {
      text: t.wishlist.confirmArchive(escapeHtml(access.wishlist.title)),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmArchive, `wl:archgo:${access.wishlist.id}`)
        .text(t.buttons.cancel, `wl:set:${access.wishlist.id}`),
    });
  });

  bot.callbackQuery(/^wl:archgo:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ack(ctx, t.wishlist.archived);

    const wishlist = await prisma.wishlist.update({
      where: { id: access.wishlist.id },
      data: { status: "ARCHIVED" },
    });

    const activeReservations = await prisma.reservation.findMany({
      where: { ...holdingReservations, item: { wishlistId: wishlist.id } },
      include: { guest: true },
      distinct: ["guestId"],
    });
    for (const r of activeReservations) {
      await notifyGuestListArchived(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: wishlist.title,
      });
    }

    await showSettings(ctx, wishlist.id);
  });

  bot.callbackQuery(/^wl:unarch:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await prisma.wishlist.update({ where: { id: access.wishlist.id }, data: { status: "ACTIVE" } });
    await ack(ctx, t.wishlist.unarchived);
    await showSettings(ctx, access.wishlist.id);
  });

  bot.callbackQuery(/^wl:dup:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ack(ctx);

    const items = await prisma.wishlistItem.findMany({
      where: { wishlistId: access.wishlist.id, status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    const copy = await prisma.wishlist.create({
      data: {
        title: `${access.wishlist.title} (копія)`,
        description: access.wishlist.description,
        eventDate: null,
        privacyMode: access.wishlist.privacyMode,
        slug: generateSlug(),
        ownerId: access.wishlist.ownerId,
        items: {
          create: items.map((i) => ({
            title: i.title,
            url: i.url,
            imageUrl: i.imageUrl,
            price: i.price,
            store: i.store,
            comment: i.comment,
            priority: i.priority,
            quantity: i.quantity,
            sortOrder: i.sortOrder,
          })),
        },
      },
    });

    await ctx.reply(t.wishlist.duplicated(items.length, buildListDeepLink(ctx.me.username, copy.slug)), {
      link_preview_options: { is_disabled: true },
    });
    await renderWishlistManagement(ctx, copy.id);
  });

  bot.callbackQuery(/^wl:del:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;

    const activeReservationsCount = await prisma.reservation.count({
      where: { ...holdingReservations, item: { wishlistId: access.wishlist.id } },
    });
    const warning =
      activeReservationsCount > 0 ? t.wishlist.deleteActiveReservationsWarning(activeReservationsCount) : "";

    await renderScreen(ctx, {
      text: t.wishlist.confirmDelete(escapeHtml(access.wishlist.title), warning),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDelete, `wl:delgo:${access.wishlist.id}`)
        .text(t.buttons.cancel, `wl:set:${access.wishlist.id}`),
    });
  });

  bot.callbackQuery(/^wl:delgo:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ack(ctx, t.wishlist.deleted(access.wishlist.title));

    const activeReservations = await prisma.reservation.findMany({
      where: { ...holdingReservations, item: { wishlistId: access.wishlist.id } },
      include: { guest: true },
      distinct: ["guestId"],
    });

    const title = access.wishlist.title;
    await prisma.wishlist.delete({ where: { id: access.wishlist.id } });

    for (const r of activeReservations) {
      await notifyGuestListDeleted(ctx.api, { guestTelegramId: r.guest.telegramId, wishlistTitle: title });
    }

    // The list is gone, so there is no screen to go back to — land on the
    // overview instead of leaving the user staring at a dead confirmation.
    await showMyWishlists(ctx);
  });
}
