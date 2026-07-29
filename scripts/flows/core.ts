// The critical path, screen by screen: onboarding → first gift → sharing, and
// a guest's whole journey from a link to a promise. Each assertion names the
// rule from docs/UX-REDESIGN.md that it holds the product to.

import {
  check,
  dmTo,
  lastMessage,
  mark,
  prisma,
  reset,
  send,
  sendPhoto,
  sent,
  show,
  since,
  tap,
  user,
} from "./harness.js";

export async function run() {
  await reset();

  const owner = user(111, "Марта");
  const guest = user(222, "Олег");

  const last = () => sent[sent.length - 1];
  const text = () => last().text;
  const buttons = () => last().buttons.flat().join(" | ");

  // ── O1 Онбординг ─────────────────────────────────────────────────────────
  let m = mark();
  await send(owner, "/start");
  show("O1  /start — новий користувач", since(m));
  check("анкор-підказка приходить один раз", since(m).some((s) => s.text.includes("Головна")));
  check("онбординг — одне речення + одна кнопка", buttons() === "➕ Створити список");
  check("жодного меню з розділами", !text().includes("Мої"));

  // ── O2 Створення списку ──────────────────────────────────────────────────
  m = mark();
  await tap(owner, "wl:new");
  show("O2  ➕ Створити список", since(m));
  check("пресети закривають типові випадки", buttons().includes("🎂 День народження"));

  m = mark();
  await tap(owner, "wl:preset:0");
  show("O2b пресет «День народження»", since(m));
  check("список створено одним тапом", text().includes("створено"));
  check("веде до наступної дії — вводу", text().includes("надішли мені посилання"));
  check("екран відредаговано на місці", last().method === "editMessageText");

  const list = await prisma.wishlist.findFirst({ where: { owner: { telegramId: "111" } } });
  if (!list) throw new Error("list not created");

  // ── F3 Розумний ввід ─────────────────────────────────────────────────────
  m = mark();
  await send(owner, "Навушники Sony WH-1000XM6");
  show("F3  довільний текст поза діалогом", since(m));
  check("бот не мовчить на довільний текст", since(m).length > 0);
  check("пропонує додати як подарунок", text().includes("як подарунок"));
  check("є чесне «ні»", buttons().includes("Ні, це не подарунок"));

  m = mark();
  await tap(owner, "dr:show");
  show("F2  превʼю-картка до збереження", since(m));
  check("картку можна правити ДО збереження", buttons().includes("✏️ Змінити щось"));
  check("головна дія — додати", last().buttons[0][0] === "✅ Додати");

  m = mark();
  await tap(owner, "dr:save");
  show("F2  успіх", since(m));
  check("успіх — повний екран, не toast", text().includes("перший подарунок"));
  check("успіх пропонує наступний крок", buttons().includes("➕ Ще один"));

  // ── O5 Фото як подарунок ─────────────────────────────────────────────────
  m = mark();
  await sendPhoto(owner, "Худі оверсайз");
  show("O5  фото з підписом", since(m));
  check("фото стає карткою подарунка", last().photo === "PHOTO_FILE_ID");
  await tap(owner, "dr:save");
  check("фото-подарунок збережено", text().includes("Худі"));

  // ── §21.1 Ввічливість не стає подарунком ─────────────────────────────────
  m = mark();
  await send(owner, "дякую!");
  show("§21.1 ввічливість", since(m));
  check("«дякую» не пропонується як подарунок", !text().includes("як подарунок"));
  check("замість мовчання — Головна", text().includes("Головна"));

  // ── F2 Третій подарунок піднімає «Поділитися» ────────────────────────────
  await send(owner, "Термос Stanley");
  await tap(owner, "dr:show");
  m = mark();
  await tap(owner, "dr:save");
  show("F2  третій подарунок", since(m));
  check("після 3-го «Поділитися» стає першою", last().buttons[0][0] === "📤 Поділитися");

  // ── S2 Головна ───────────────────────────────────────────────────────────
  m = mark();
  await send(owner, "🏠 Головна");
  show("S2  Головна з анкора", since(m));
  check("Головна показує списки", text().includes("Твої списки"));
  check("подарунки полічені", text().includes("3 подарунки"));

  // ── R5 Авто-відновлення старої кнопки ────────────────────────────────────
  const live = lastMessage.get(owner.id)!.id;
  m = mark();
  await tap(owner, `wl:open:${list.id}:0`, live - 6);
  show("R5  тап по старому повідомленню", since(m));
  check("старе повідомлення не редагується", since(m).every((s) => s.messageId !== live - 6));
  check("свіжий екран унизу чату", since(m).some((s) => s.method === "sendMessage"));
  check("жодного «кнопка застаріла»", !since(m).some((s) => s.text.includes("застаріл")));

  // ── S3 Мій список, режим сюрпризу ────────────────────────────────────────
  m = mark();
  await tap(owner, `wl:open:${list.id}:0`);
  show("S3  Мій список", since(m));
  check("заголовок каже, де ти", text().includes("День народження"));
  check("режим сюрпризу — дефолт, деталей нема", !text().includes("заброньовано"));

  // ── G1 Гість за deep-link ────────────────────────────────────────────────
  m = mark();
  await send(guest, `/start list_${list.slug}`);
  show("G1  гість відкриває посилання", since(m, guest.id));
  const showcase = since(m, guest.id).at(-1)!;
  check("нуль проміжних екранів — одразу вітрина", showcase.text.includes("Список бажань"));
  check("видно, чий список", showcase.text.includes("Марта"));
  check("обіцянка сюрпризу проговорена", showcase.text.includes("не побачить"));
  check("жодного запиту телефону", !showcase.text.includes("контакт"));

  const gift = await prisma.wishlistItem.findFirst({
    where: { wishlistId: list.id, title: { contains: "Навушники" } },
  });
  if (!gift) throw new Error("gift missing");

  m = mark();
  await tap(guest, `g:item:${gift.id}:a:0`);
  show("S5a подарунок гостя", since(m, guest.id));
  check(
    "головна дія — «Я подарую це»",
    since(m, guest.id).at(-1)!.buttons.flat().includes("🎁 Я подарую це"),
  );

  // ── G3 Обіцянка в один тап ───────────────────────────────────────────────
  m = mark();
  await tap(guest, `g:take:${gift.id}:a:0`);
  show("G3  обіцянка + сповіщення власнику", since(m));
  const promised = since(m, guest.id).at(-1)!;
  check("миттєвий успіх без підтверджень", promised.text.includes("Домовились"));
  check("гостю обіцяно анонімність", promised.text.includes("не дізнається"));
  check("undo просто тут", promised.buttons.flat().includes("↩️ Передумав"));

  const ownerDm = dmTo(owner.id, m);
  check("власник отримав сповіщення", Boolean(ownerDm));
  check("сюрприз не зламано: без назви подарунка", !ownerDm?.text.includes("Навушники"), ownerDm?.text);

  // ── §8.4 Власник усе ще нічого не бачить ─────────────────────────────────
  m = mark();
  await tap(owner, `it:open:${gift.id}:0`);
  show("S4  подарунок очима власника (сюрприз)", since(m, owner.id));
  check("жодного натяку, хто обрав", !text().includes("Олег"));
  check("жодного лічильника обіцянок", !text().includes("Обрали"));

  // ── S8 Я дарую ───────────────────────────────────────────────────────────
  m = mark();
  await tap(guest, "res:list:0");
  show("S8  Я дарую", since(m, guest.id));
  check("згруповано за списком", text().includes("День народження"));
  check("статус словами, не лише емодзі", text().includes("обіцяно"));

  // ── R5 Невідомий callback зі старого деплою ──────────────────────────────
  m = mark();
  await tap(guest, "totally:unknown:button");
  show("R5  невідомий callback", since(m, guest.id));
  check("мовчазне відновлення на Головну", text().includes("Головна"));
  check("без докорів користувачу", !text().includes("застаріл"));

  m = mark();
  await tap(owner, "menu:settings");
  show("legacy  menu:settings → Про мене", since(m, owner.id));
  check("стара кнопка веде в новий розділ", text().includes("Про мене"));

  // ── §9.1 Анкор як безпечний вихід ────────────────────────────────────────
  await tap(owner, `it:add:${list.id}`);
  m = mark();
  await send(owner, "🏠 Головна");
  show("§9.1  анкор посеред справи", since(m, owner.id));
  check("явне повідомлення про скасування", text().includes("Скасував"));
  check("і одразу Головна", text().includes("Твої списки"));
}
