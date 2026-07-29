// The paths where mistakes are expensive: destructive actions, undo, the
// surprise contract under a mode switch, co-authors, and anything that sends a
// message to a second person.

import {
  check,
  dmTo,
  mark,
  prisma,
  reset,
  send,
  sent,
  show,
  since,
  tap,
  user,
} from "./harness.js";

export async function run() {
  await reset();

  const owner = user(311, "Дмитро");
  const guest = user(322, "Ірина");
  const mate = user(333, "Оксана");

  const last = () => sent[sent.length - 1];
  const text = () => last().text;
  const seen = (who: number, from: number) => since(from, who).at(-1)!;
  const listOf = (id: string) => prisma.wishlist.findUnique({ where: { id } });

  // Setup: an owner with a list and two gifts.
  await send(owner, "/start");
  await tap(owner, "wl:new");
  await tap(owner, "wl:preset:0");
  const list = (await prisma.wishlist.findFirst({ where: { owner: { telegramId: "311" } } }))!;
  for (const title of ["Kindle Paperwhite", "Плед"]) {
    await send(owner, title);
    await tap(owner, "dr:show");
    await tap(owner, "dr:save");
  }
  const kindle = (await prisma.wishlistItem.findFirst({ where: { title: { contains: "Kindle" } } }))!;

  // ── O13 Дата природною мовою ─────────────────────────────────────────────
  let m = mark();
  await tap(owner, `wl:set:${list.id}`);
  await tap(owner, `wl:date:${list.id}`);
  await send(owner, "25 грудня");
  show("O13 дата природною мовою", since(m).slice(-1));
  check("дату розпізнано і показано словами", text().includes("25 грудня"));
  check("підтвердження — рядком на екрані", text().includes("Зберіг"));

  m = mark();
  await tap(owner, `wl:date:${list.id}`);
  await send(owner, "коли завгодно");
  show("дата не розпізнана", since(m).slice(-1));
  check("перепитує, а не здається", text().includes("Не зрозумів дату"));
  check("і одразу дає приклади", text().includes("15 серпня"));

  // Walking away from a question must disarm it, or the next unrelated message
  // gets swallowed as its answer.
  await tap(owner, `wl:set:${list.id}`);
  check(
    "покинуте питання знімається",
    (await prisma.user.findFirst({ where: { telegramId: "311" } }))!.pendingAction === null,
  );

  // ── O13 Сюрприз вимикається лише через попередження ──────────────────────
  m = mark();
  await tap(owner, `wl:surprise:${list.id}`);
  show("O13 вимкнення сюрпризу", since(m));
  check("попереджає про наслідок для друзів", text().includes("Друзям"));
  check("не вимикає одразу", (await listOf(list.id))!.privacyMode === "SURPRISE");
  await tap(owner, `wl:surpriseoff:${list.id}`);
  check("після підтвердження — вимкнено", (await listOf(list.id))!.privacyMode === "OPEN");

  m = mark();
  await send(guest, `/start list_${list.slug}`);
  show("§8.4 вітрина з вимкненим сюрпризом", since(m, guest.id).slice(-1));
  check("гостя чесно попереджено до вибору", seen(guest.id, m).text.includes("сюрприз вимкнено"));

  await tap(owner, `wl:surprise:${list.id}`);
  check("сюрприз вмикається без підтвердження", (await listOf(list.id))!.privacyMode === "SURPRISE");

  // ── G5 Обіцянка → куплено → відкат ───────────────────────────────────────
  await tap(guest, `g:take:${kindle.id}:a:0`);
  const promise = (await prisma.reservation.findFirst({ where: { itemId: kindle.id } }))!;

  m = mark();
  await tap(guest, `res:bought:${promise.id}`);
  show("G5 «Я вже купив»", since(m));
  check("миттєво, без підтвердження", seen(guest.id, m).text.includes("куплено"));
  check("сказано, що подарунок лишається за тобою", seen(guest.id, m).text.includes("лишається за тобою"));
  const boughtDm = dmTo(owner.id, m);
  check("власнику — «щось куплено», без назви", Boolean(boughtDm) && !boughtDm!.text.includes("Kindle"), boughtDm?.text);

  m = mark();
  await tap(guest, `res:unbought:${promise.id}`);
  show("G5 відкат «куплено»", since(m, guest.id).slice(-1));
  check("відкат питає, бо власник уже знає", seen(guest.id, m).text.includes("Продовжити?"));
  await tap(guest, `res:unboughtgo:${promise.id}`);

  // ── G6 Відпустити ────────────────────────────────────────────────────────
  m = mark();
  await tap(guest, `res:free:${promise.id}`);
  show("G6 відпустити — підтвердження", since(m, guest.id).slice(-1));
  check("описує наслідок для інших", seen(guest.id, m).text.includes("зможе взяти хтось інший"));
  await tap(guest, `res:freego:${promise.id}`);
  check("обіцянку відпущено", (await prisma.reservation.findUnique({ where: { id: promise.id } }))!.status === "CANCELLED");
  check(
    "подарунок знову вільний",
    (await prisma.reservation.count({
      where: { itemId: kindle.id, status: { in: ["ACTIVE", "PURCHASED"] } },
    })) === 0,
  );

  // ── R9 Видалення подарунка з обіцянкою ───────────────────────────────────
  await tap(guest, `g:take:${kindle.id}:a:0`);

  m = mark();
  await tap(owner, `it:del:${kindle.id}:0`);
  show("R9 видалення обіцяного подарунка", since(m, owner.id).slice(-1));
  check("зачіпає інших → питає", seen(owner.id, m).text.includes("пообіцяли"));

  m = mark();
  await tap(owner, `it:delgo:${kindle.id}:0`);
  show("R9 видалено + undo + DM гостю", since(m));
  check("undo прямо в екрані", seen(owner.id, m).buttons.flat().includes("↩️ Повернути"));
  const removedDm = dmTo(guest.id, m);
  check("гостя попереджено", Boolean(removedDm) && removedDm!.text.includes("скасована"), removedDm?.text);

  m = mark();
  await tap(owner, `it:undel:${kindle.id}`);
  show("R9 повернення", since(m));
  check("подарунок повернувся", (await prisma.wishlistItem.findUnique({ where: { id: kindle.id } }))!.status === "ACTIVE");
  check(
    "обіцянка гостя теж повернулась",
    (await prisma.reservation.count({ where: { itemId: kindle.id, status: "ACTIVE" } })) === 1,
  );
  const restoredDm = dmTo(guest.id, m);
  check("гостю сказано, що обіцянка знову діє", Boolean(restoredDm) && restoredDm!.text.includes("знову діє"), restoredDm?.text);

  // ── O16 Співавтор ────────────────────────────────────────────────────────
  m = mark();
  await tap(owner, `wl:co:${list.id}:0`);
  await tap(owner, `wl:coinvite:${list.id}`);
  show("O16 запрошення співавтора", since(m, owner.id).slice(-1));
  const token = (await listOf(list.id))!.editorInviteToken!;
  check("сказано, що запрошення одноразове", seen(owner.id, m).text.includes("одноразове"));

  m = mark();
  await send(mate, `/start ed_${token}`);
  show("O16 запрошений вирішує сам", since(m, mate.id).slice(-1));
  check("спершу питає, а не впускає мовчки", seen(mate.id, m).buttons.flat().includes("Приєднатися"));
  check("сказано, хто запрошує", seen(mate.id, m).text.includes("Дмитро"));

  m = mark();
  await tap(mate, `wl:join:${token}`);
  show("O16 співавтор усередині", since(m));
  check("співавтор бачить список", seen(mate.id, m).text.includes("День народження"));
  check("і рядок про свою роль", seen(mate.id, m).text.includes("Ти співавтор"));
  check("без кнопки-обманки «Про список»", !seen(mate.id, m).buttons.flat().includes("⚙️ Про список"));
  check("власнику повідомили", Boolean(dmTo(owner.id, m)));
  check("токен згорів", (await listOf(list.id))!.editorInviteToken === null);

  m = mark();
  await tap(mate, `wl:set:${list.id}`);
  show("§9.10 співавтор і налаштування", since(m, mate.id).slice(-1));
  check("замість відмови — пояснення", seen(mate.id, m).text.includes("змінює власник"));

  // ── O14 Завершення ───────────────────────────────────────────────────────
  m = mark();
  await tap(owner, `wl:fin:${list.id}`);
  show("O14 завершення", since(m, owner.id).slice(-1));
  check("описує наслідок", seen(owner.id, m).text.includes("більше не зможуть"));

  m = mark();
  await tap(owner, `wl:fingo:${list.id}`);
  show("O14 завершено", since(m));
  check("список їде в «Завершені»", seen(owner.id, m).text.includes("Завершені"));
  check("гостя з обіцянкою повідомлено", Boolean(dmTo(guest.id, m)));
  check("є «Використати знову»", seen(owner.id, m).buttons.flat().includes("🔄 Використати знову"));

  m = mark();
  await send(guest, `/start list_${list.slug}`);
  show("G8 гість відкриває завершений список", since(m, guest.id).slice(-1));
  check("перегляд працює", seen(guest.id, m).text.includes("Kindle"));
  check("але обіцянок не приймає", seen(guest.id, m).text.includes("завершено"));

  // ── O15 Використати знову ────────────────────────────────────────────────
  m = mark();
  await tap(owner, `wl:reuse:${list.id}`);
  show("O15 копія", since(m, owner.id).slice(-1));
  const copy = (await prisma.wishlist.findFirst({ where: { ownerId: list.ownerId, status: "ACTIVE" } }))!;
  check("копія активна", copy.id !== list.id);
  check("дата скинута", copy.eventDate === null);
  check("обіцянки не скопійовані", (await prisma.reservation.count({ where: { item: { wishlistId: copy.id } } })) === 0);
  check("подарунки перенесені", (await prisma.wishlistItem.count({ where: { wishlistId: copy.id } })) === 2);

  // ── R9 Двокрокове видалення списку ───────────────────────────────────────
  m = mark();
  await tap(owner, `wl:del:${list.id}`);
  show("R9 видалення списку, крок 1", since(m, owner.id).slice(-1));
  check("прямо сказано, що незворотно", seen(owner.id, m).text.includes("неможливо"));

  m = mark();
  await tap(owner, `wl:del2:${list.id}`);
  show("R9 крок 2", since(m, owner.id).slice(-1));
  check(
    "кнопка називає наслідок",
    seen(owner.id, m).buttons.flat().some((b) => b.includes("Так, видалити список і")),
  );

  m = mark();
  await tap(owner, `wl:delgo:${list.id}`);
  check("список видалено", (await listOf(list.id)) === null);
  check("гостя повідомлено", Boolean(dmTo(guest.id, m)));
  check("власник опинився на Головній", seen(owner.id, m).text.includes("Головна"));

  // ── R2 Чернетка переживає паузу ──────────────────────────────────────────
  m = mark();
  await send(owner, "Кавомолка");
  await send(owner, "/start");
  show("R2 незавершена дія", since(m, owner.id).slice(-1));
  check("бот сам пропонує продовжити", seen(owner.id, m).text.includes("Продовжити?"));
  check("і дає почати заново", seen(owner.id, m).buttons.flat().includes("Почати заново"));
}
