import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { generateSlug } from "../lib/ids.js";
import { buildListDeepLink } from "../lib/deeplink.js";
import { escapeHtml, formatDate, PRIVACY_LABEL } from "../lib/format.js";
import { computeAvailability } from "../lib/availability.js";
import { notifyGuestListArchived, notifyGuestListDeleted } from "../lib/notify.js";
import { checkWishlistAccess } from "../lib/access.js";
import { renderWishlistManagement } from "./items.js";
import { t } from "../text.js";

function parseSkippable(raw: string): string | null {
  const v = raw.trim();
  return v === t.common.skip || v.length === 0 ? null : v;
}

function parseUaDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Used only inside createWishlistConversation, where no wishlist id exists yet. */
function privacyKeyboardForCreate(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.buttons.privacySurprise, "privacy:SURPRISE")
    .row()
    .text(t.buttons.privacyOpen, "privacy:OPEN");
}

function privacyKeyboardForEdit(wishlistId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.buttons.privacySurprise, `wl:privacy:set:${wishlistId}:SURPRISE`)
    .row()
    .text(t.buttons.privacyOpen, `wl:privacy:set:${wishlistId}:OPEN`);
}

const assertAccess = checkWishlistAccess;

export async function showMyWishlists(ctx: MyContext) {
  const user = await upsertUserFromCtx(ctx);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wishlists = await prisma.wishlist.findMany({
    where: { OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }] },
    include: {
      items: {
        where: { status: "ACTIVE" },
        include: { reservations: { where: { status: "ACTIVE" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (wishlists.length === 0) {
    await ctx.reply(t.wishlist.noneYet);
    return;
  }

  await ctx.reply(t.wishlist.yourLists(wishlists.length));

  for (const wl of wishlists) {
    let full = 0;
    let partial = 0;
    for (const item of wl.items) {
      const a = computeAvailability(item.quantity, item.reservations);
      if (a.isFull) full++;
      else if (a.isPartial) partial++;
    }

    const lines = [
      `${wl.status === "ARCHIVED" ? "📦" : "🎁"} <b>${escapeHtml(wl.title)}</b>`,
      wl.eventDate ? `📅 ${formatDate(wl.eventDate)}` : null,
      t.wishlist.itemCount(wl.items.length),
      full > 0 ? t.wishlist.fullyReservedCount(full) : null,
      partial > 0 ? t.wishlist.partiallyReservedCount(partial) : null,
      wl.status === "ARCHIVED" ? t.wishlist.archivedTag : null,
    ].filter((l) => l !== null);

    const kb = new InlineKeyboard().text(t.buttons.open, `wl:open:${wl.id}`);
    if (wl.status === "ACTIVE") kb.text(t.buttons.share, `wl:share:${wl.id}`);
    kb.row().text(t.buttons.settings, `wl:settings:${wl.id}`);

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function createWishlistConversation(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply(t.wishlist.askTitle);
  const title = await conversation.form.text();

  await ctx.reply(t.wishlist.askDescription);
  const description = parseSkippable(await conversation.form.text());

  await ctx.reply(t.wishlist.askDate);
  let eventDate: Date | null = null;
  const dateRaw = parseSkippable(await conversation.form.text());
  if (dateRaw) {
    eventDate = parseUaDate(dateRaw);
    if (!eventDate) await ctx.reply(t.wishlist.dateNotRecognizedContinuing);
  }

  await ctx.reply(t.wishlist.askPrivacy, { reply_markup: privacyKeyboardForCreate() });
  const privacyCtx = await conversation.waitForCallbackQuery(["privacy:SURPRISE", "privacy:OPEN"]);
  await privacyCtx.answerCallbackQuery();
  const privacyMode = privacyCtx.callbackQuery.data === "privacy:OPEN" ? "OPEN" : "SURPRISE";

  const user = await conversation.external((c) => upsertUserFromCtx(c));
  const slug = await conversation.external(() => generateSlug());
  const wishlist = await conversation.external(() =>
    prisma.wishlist.create({
      data: { title, description, eventDate, privacyMode, slug, ownerId: user.id },
    }),
  );
  const me = await conversation.external((c) => c.api.getMe());
  const link = buildListDeepLink(me.username, wishlist.slug);

  await ctx.reply(t.wishlist.created(escapeHtml(title), link), {
    reply_markup: new InlineKeyboard()
      .text(t.buttons.addItem, `item:add:${wishlist.id}`)
      .row()
      .text(t.buttons.menuMyLists, "wl:list"),
  });
}

async function showSettings(ctx: MyContext, wishlistId: string) {
  const access = await assertAccess(ctx, wishlistId, true);
  if (!access) return;
  const { wishlist } = access;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const lines = [
    t.wishlist.settingsTitle(escapeHtml(wishlist.title)),
    "",
    wishlist.description ? escapeHtml(wishlist.description) : t.wishlist.noDescription,
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : t.wishlist.noDate,
    PRIVACY_LABEL[wishlist.privacyMode],
  ];

  const kb = new InlineKeyboard()
    .text(t.buttons.editTitle, `wl:field:title:${wishlist.id}`)
    .text(t.buttons.editDescription, `wl:field:description:${wishlist.id}`)
    .row()
    .text(t.buttons.editDate, `wl:field:eventDate:${wishlist.id}`)
    .text(t.buttons.privacy, `wl:privacy:${wishlist.id}`)
    .row()
    .text(t.buttons.addEditor, `wl:addeditor:${wishlist.id}`)
    .row();

  if (wishlist.status === "ACTIVE") {
    kb.text(t.buttons.archive, `wl:archive:${wishlist.id}`).text(t.buttons.duplicate, `wl:duplicate:${wishlist.id}`);
  } else {
    kb.text(t.buttons.unarchive, `wl:unarchive:${wishlist.id}`).text(t.buttons.duplicate, `wl:duplicate:${wishlist.id}`);
  }
  kb.row().text(t.buttons.deleteList, `wl:delete:${wishlist.id}`);
  kb.row().text(t.buttons.backToList, `wl:open:${wishlist.id}`);

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
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
    await ctx.reply(t.wishlist.askNewTitle);
    const title = await conversation.form.text();
    await conversation.external(() => prisma.wishlist.update({ where: { id: wishlistId }, data: { title } }));
    await ctx.reply(t.wishlist.titleUpdated);
  } else if (field === "description") {
    await ctx.reply(t.wishlist.askNewDescription);
    const description = parseSkippable(await conversation.form.text());
    await conversation.external(() =>
      prisma.wishlist.update({ where: { id: wishlistId }, data: { description } }),
    );
    await ctx.reply(t.wishlist.descriptionUpdated);
  } else {
    await ctx.reply(t.wishlist.askNewDate);
    const raw = parseSkippable(await conversation.form.text());
    let eventDate: Date | null = null;
    if (raw) {
      eventDate = parseUaDate(raw);
      if (!eventDate) {
        await ctx.reply(t.wishlist.dateNotRecognizedRetry);
        return;
      }
    }
    await conversation.external(() => prisma.wishlist.update({ where: { id: wishlistId }, data: { eventDate } }));
    await ctx.reply(t.wishlist.dateUpdated);
  }

  await showSettings(ctx, wishlistId);
}

export async function addEditorConversation(conversation: MyConversation, ctx: MyContext, wishlistId: string) {
  const access = await conversation.external((c) => assertAccess(c, wishlistId, true));
  if (!access) return;

  await ctx.reply(t.wishlist.askEditorUsername);
  const raw = await conversation.form.text();
  const username = raw.trim().replace(/^@/, "");

  const chat = await conversation.external(async (c) => {
    try {
      return await c.api.getChat(`@${username}`);
    } catch {
      return null;
    }
  });

  if (!chat || !("id" in chat)) {
    await ctx.reply(t.wishlist.editorNotFound);
    return;
  }

  const editorUser = await conversation.external(() =>
    prisma.user.upsert({
      where: { telegramId: String(chat.id) },
      create: {
        telegramId: String(chat.id),
        username: "username" in chat ? (chat.username ?? null) : null,
        firstName: "first_name" in chat ? (chat.first_name ?? null) : null,
        lastName: "last_name" in chat ? (chat.last_name ?? null) : null,
      },
      update: {},
    }),
  );

  await conversation.external(() =>
    prisma.wishlistEditor.upsert({
      where: { wishlistId_userId: { wishlistId, userId: editorUser.id } },
      create: { wishlistId, userId: editorUser.id },
      update: {},
    }),
  );

  await ctx.reply(t.wishlist.editorAdded(username));
  await showSettings(ctx, wishlistId);
}

export function registerWishlists(bot: Bot<MyContext>) {
  bot.callbackQuery("wl:list", showMyWishlists);

  bot.callbackQuery(/^wl:settings:([^:]+)$/, async (ctx) => {
    await showSettings(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:open:([^:]+)$/, async (ctx) => {
    await renderWishlistManagement(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:share:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    const me = await ctx.api.getMe();
    const link = buildListDeepLink(me.username, access.wishlist.slug);
    const text = t.wishlist.shareMessage(access.wishlist.title, link);
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard().switchInline(t.buttons.sendToFriend, text),
    });
  });

  bot.callbackQuery(/^wl:field:(title|description|eventDate):([^:]+)$/, async (ctx) => {
    const field = ctx.match[1] as "title" | "description" | "eventDate";
    const wishlistId = ctx.match[2];
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("editWishlistField", wishlistId, field);
  });

  bot.callbackQuery(/^wl:privacy:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply(t.wishlist.askPrivacyMode, {
      reply_markup: privacyKeyboardForEdit(access.wishlist.id),
    });
  });

  bot.callbackQuery(/^wl:privacy:set:([^:]+):(SURPRISE|OPEN)$/, async (ctx) => {
    const wishlistId = ctx.match[1];
    const mode = ctx.match[2] as "SURPRISE" | "OPEN";
    const access = await assertAccess(ctx, wishlistId, true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await prisma.wishlist.update({ where: { id: wishlistId }, data: { privacyMode: mode } });
    await ctx.reply(t.wishlist.privacyUpdated(PRIVACY_LABEL[mode]));
    await showSettings(ctx, wishlistId);
  });

  bot.callbackQuery(/^wl:addeditor:([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("addEditor", ctx.match[1]);
  });

  bot.callbackQuery(/^wl:archive:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply(t.wishlist.confirmArchive(access.wishlist.title), {
      reply_markup: new InlineKeyboard()
        .text(t.buttons.confirmArchive, `wl:archive:confirm:${access.wishlist.id}`)
        .text(t.buttons.cancel, `wl:settings:${access.wishlist.id}`),
    });
  });

  bot.callbackQuery(/^wl:archive:confirm:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const wishlist = await prisma.wishlist.update({
      where: { id: access.wishlist.id },
      data: { status: "ARCHIVED" },
    });

    const activeReservations = await prisma.reservation.findMany({
      where: { status: "ACTIVE", item: { wishlistId: wishlist.id } },
      include: { guest: true },
      distinct: ["guestId"],
    });
    for (const r of activeReservations) {
      await notifyGuestListArchived(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: wishlist.title,
      });
    }

    await ctx.reply(t.wishlist.archived);
    await showSettings(ctx, wishlist.id);
  });

  bot.callbackQuery(/^wl:unarchive:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await prisma.wishlist.update({ where: { id: access.wishlist.id }, data: { status: "ACTIVE" } });
    await ctx.reply(t.wishlist.unarchived);
    await showSettings(ctx, access.wishlist.id);
  });

  bot.callbackQuery(/^wl:duplicate:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const items = await prisma.wishlistItem.findMany({
      where: { wishlistId: access.wishlist.id, status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    const slug = generateSlug();
    const copy = await prisma.wishlist.create({
      data: {
        title: `${access.wishlist.title} (копія)`,
        description: access.wishlist.description,
        eventDate: null,
        privacyMode: access.wishlist.privacyMode,
        slug,
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

    const me = await ctx.api.getMe();
    const link = buildListDeepLink(me.username, copy.slug);
    await ctx.reply(t.wishlist.duplicated(copy.title, items.length, link), {
      reply_markup: new InlineKeyboard().text(t.buttons.settings, `wl:settings:${copy.id}`),
    });
  });

  bot.callbackQuery(/^wl:delete:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservationsCount = await prisma.reservation.count({
      where: { status: "ACTIVE", item: { wishlistId: access.wishlist.id } },
    });

    const warning =
      activeReservationsCount > 0 ? t.wishlist.deleteActiveReservationsWarning(activeReservationsCount) : "";

    await ctx.reply(t.wishlist.confirmDelete(access.wishlist.title, warning), {
      reply_markup: new InlineKeyboard()
        .text(t.buttons.confirmDelete, `wl:delete:confirm:${access.wishlist.id}`)
        .text(t.buttons.cancel, `wl:settings:${access.wishlist.id}`),
    });
  });

  bot.callbackQuery(/^wl:delete:confirm:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservations = await prisma.reservation.findMany({
      where: { status: "ACTIVE", item: { wishlistId: access.wishlist.id } },
      include: { guest: true, item: true },
      distinct: ["guestId"],
    });

    const title = access.wishlist.title;
    await prisma.wishlist.delete({ where: { id: access.wishlist.id } });

    for (const r of activeReservations) {
      await notifyGuestListDeleted(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: title,
      });
    }

    await ctx.reply(t.wishlist.deleted(title));
  });
}
