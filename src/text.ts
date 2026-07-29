// Every user-facing string the bot sends lives here — one place to read,
// tweak the tone of, or eventually translate. Feature files should not
// contain string literals meant for the user; they import `t` instead.
//
// Tone of voice + visual style are documented in CLAUDE.md ("Дружній
// друзяка" + фіолетовий/сердечка/крапки) — read that before editing copy.
//
// Vocabulary (docs/UX-REDESIGN.md §8.3) is binding, not a suggestion. Nothing
// here says "вішліст", "бажання", "бронювання", "архів", "редактор" or
// "приватність": those are the words the redesign removed, and the one rule
// they all failed is "зрозуміє бабуся".
//
//   список · подарунок · я подарую / обіцянка · куплено · співавтор ·
//   завершити список · режим сюрпризу · стежити
//
// Writing rules that the strings below are held to (§14):
//   1. First line is the point; everything critical inside 40 characters.
//   2. A button names its result ("Так, відпустити подарунок"), never "ОК".
//   3. One message, one thought. Over six lines means split or cut.
//   4. Errors and confirmations get no jokes and no 💜.
//   5. Dates and numbers read the way people say them.

/**
 * Ukrainian needs three plural forms, so "1 подарунків" reads as broken to a
 * native speaker. Kept here rather than in lib/format.ts because that module
 * imports this one.
 */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const gifts = (n: number) => `${n} ${plural(n, "подарунок", "подарунки", "подарунків")}`;
const lists = (n: number) => `${n} ${plural(n, "список", "списки", "списків")}`;
const promises = (n: number) => `${n} ${plural(n, "обіцянка", "обіцянки", "обіцянок")}`;
const days = (n: number) => `${n} ${plural(n, "день", "дні", "днів")}`;
const people = (n: number) => `${n} ${plural(n, "людина", "людини", "людей")}`;

export const t = {
  plural: { gifts, lists, promises, days, people },

  common: {
    /** The anchor. It is the only reply-keyboard button that ever exists. */
    home: "🏠 Головна",
    /** Shown once, before a person's very first screen. */
    anchorHint: "Знизу з'явилася кнопка 🏠 <b>Головна</b> — вона працює завжди, навіть посеред справи 💜",

    tapNumber: "Тисни номер, щоб відкрити.",
    cancelled: "Ок, не роблю 🙂",
    /** Leaving a half-finished action by tapping the anchor. */
    stepDropped: "Скасував — нічого не збережено.",
    listGoneAlert: "Цього списку вже немає 😕",
    giftGoneAlert: "Цього подарунка вже немає 😕",
    noAccessAlert: "Цей список ведуть без тебе 🙂",
    guestFallbackName: "Хтось",
    /** Formula: what happened → what it means → what to do (§13). */
    internalError:
      "Щось пішло не так у мене 😔 Спробуй ще раз — усе, що ти зберігав раніше, ціле.",
    listGone: "Цей список більше не існує — власник його видалив.",
    giftGone: "Цього подарунка вже немає в списку.",
    linkDead:
      "Це посилання більше не діє 😕 Попроси того, хто його надіслав, поділитися списком ще раз.",
    tooLong: (max: number) => `Трохи задовго 🙂 Спробуй вкластися в ${max} символів.`,
    numberPlease: "Тут потрібне число — наприклад 2 🙂",
    textPlease: "Напиши це словами 🙂",
  },

  // Button labels stay short and functional — no decorative emoji beyond
  // what's already meaningful (CLAUDE.md: "Кнопки — виняток"), and every one
  // of them names what happens next (§15.2, ≤ 24 characters).
  buttons: {
    back: "⬅️ Назад",
    backHome: "⬅️ Головна",
    cancel: "Скасувати",
    no: "⬅️ Ні, назад",
    skip: "Пропустити",
    view: "Переглянути",

    // Home
    createList: "➕ Створити список",
    newList: "➕ Новий список",
    imGifting: "🎗 Я дарую",
    friendLists: "👀 Списки друзів",
    finishedLists: (count: number) => `🏁 Завершені (${count})`,
    aboutMe: "⚙️ Про мене",
    howItWorks: "❓ Як це працює",
    openList: "Відкрити список",

    // List presets
    presetBirthday: "🎂 День народження",
    presetNewYear: "🎄 Новий рік",
    presetWedding: "💍 Весілля",
    presetCustom: "✏️ Своя назва",

    // My list
    addGift: "➕ Додати подарунок",
    share: "📤 Поділитися",
    aboutList: "⚙️ Про список",
    whoGivesWhat: "👀 Хто що дарує",
    oneMore: "➕ Ще один",
    toList: "⬅️ До списку",

    // Gift editing
    edit: "✏️ Змінити",
    editSomething: "✏️ Змінити щось",
    save: "✅ Додати",
    fieldTitle: "Назва",
    fieldPrice: "Ціна",
    fieldPhoto: "Фото",
    fieldUrl: "Посилання",
    fieldStore: "Магазин",
    fieldComment: "Коментар",
    fieldQuantity: "Кількість",
    fieldPriority: "Наскільки хочу",
    removePhoto: "Прибрати фото",
    moveUp: "⬆️ Вище",
    moveDown: "⬇️ Нижче",
    moveTop: "⏫ Зробити першим",
    deleteGift: "🗑 Видалити",
    confirmDeleteGift: "Так, видалити подарунок",
    undoDelete: "↩️ Повернути",
    whereToBuy: "🔗 Де купити",

    priorityHigh: "🔥 Дуже хочу",
    priorityNormal: "⭐ Хочу",
    priorityLow: "💭 Було б приємно",

    // Draft
    continueDraft: "Продовжити",
    dropDraft: "Почати заново",
    addToList: (list: string) => `Так, у «${list}»`,
    addAsGiftShort: "Так, це подарунок",
    notAGift: "Ні, це не подарунок",

    // Sharing
    sendToFriend: "📨 Надіслати другу",
    inviteCoAuthor: "👥 Запросити співавтора",
    shareAnyway: "Все одно поділитися",

    // About list
    editTitle: "✏️ Назва",
    editDescription: "📝 Опис",
    editDate: "📅 Дата",
    surpriseOn: "🤫 Сюрприз: увімкнено",
    surpriseOff: "👀 Сюрприз: вимкнено",
    confirmSurpriseOff: "Так, вимкнути сюрприз",
    notifyOn: "🔔 Сповіщення: увімкнені",
    notifyOff: "🔕 Сповіщення: вимкнені",
    coAuthors: "👥 Співавтори",
    createInvite: "🔗 Запросити",
    revokeInvite: "Скасувати запрошення",
    joinAsCoAuthor: "Приєднатися",
    rotateLink: "🔗 Закрити старе посилання",
    confirmRotateLink: "Так, закрити старе",
    finishList: "🏁 Завершити список",
    confirmFinishList: "Так, завершити",
    reopenList: "↩️ Повернути в активні",
    reuseList: "🔄 Використати знову",
    deleteList: "🗑 Видалити список",
    confirmDeleteList: "Видалити список",
    confirmDeleteListFinal: (gifts: string) => `Так, видалити список і ${gifts}`,

    // Guest
    watch: "🔔 Стежити",
    unwatch: "🔕 Не стежити",
    watchIfFree: "🔔 Повідомити, якщо звільниться",
    hideTaken: "Сховати зайняті",
    showAll: "Показати всі",
    promise: "🎁 Я подарую це",
    promiseSome: (available: number, total: number) => `🎁 Я подарую (вільно ${available} з ${total})`,
    promiseOneMore: "➕1 ще",
    undoPromise: "↩️ Передумав",

    // Мої обіцянки
    markBought: "✅ Я вже купив",
    undoBought: "↩️ Ще не купив",
    confirmUndoBought: "Так, ще не купив",
    release: "💨 Відпустити подарунок",
    confirmRelease: "Так, відпустити",

    // Про мене
    deletePhone: "🗑 Видалити збережений номер",
    deleteMyData: "🗑 Видалити всі мої дані",
    confirmDeleteMyData: "Так, видалити все",
  },

  labels: {
    /**
     * "Хочу" is the default every gift starts on, so marking it would put an
     * icon on every row and leave 🔥 nothing to stand out against.
     */
    priorityIcon: { HIGH: "🔥", NORMAL: "", LOW: "💭" },
    priorityName: {
      HIGH: "дуже хочу",
      NORMAL: "хочу",
      LOW: "було б приємно",
    },
    /** The two words a guest ever needs. Never an emoji on its own (§15.4). */
    promiseStatus: {
      ACTIVE: "обіцяно",
      PURCHASED: "✅ куплено",
      CANCELLED: "відпущено",
    },
    taken: "✅ вже дарують",
    free: "вільний",
    partly: (available: number, total: number) => `вільно ${available} з ${total}`,
  },

  home: {
    /** S1 — one sentence of value, one button, zero vocabulary to learn. */
    onboarding: [
      "Привіт! 💜",
      "",
      "Я допоможу зібрати список бажань і поділитися ним з друзями — щоб подарунки не дублювались, а сюрпризи лишались сюрпризами 🤫",
    ].join("\n"),

    header: "🏠 <b>Головна</b>",
    myListsHeader: "🎁 <b>Твої списки</b>",
    listRow: (index: number, icon: string, title: string) =>
      `${index}. ${icon ? `${icon} ` : ""}<b>${title}</b>`,
    listRowMeta: (parts: string[]) => `    ${parts.join(" · ")}`,
    givingLine: (count: number) => `🎗 Ти даруєш: ${gifts(count)}`,
    friendListsLine: (count: number) => `👀 Списки друзів: ${count}`,
    tapListHint: "Тисни номер, щоб відкрити список.",

    // No header of their own: `renderHome` already printed one.
    empty: "Тут буде все твоє: списки, подарунки, обіцянки. Почнімо з першого списку!",
    emptyGuestOnly: "Своїх списків у тебе ще немає — але це діло однієї хвилини 🙂",

    finishedHeader: "🏁 <b>Завершені списки</b>",
    finishedHint: "Вони більше не приймають обіцянок, але все всередині ціле.",
    finishedEmpty: "Тут поки що порожньо — жоден список не завершено.",

    friendsHeader: (count: number) => `👀 <b>Списки друзів (${count})</b>`,
    friendsHint: "🔔 — списки, з яких приходять новини.",
    friendsEmpty: [
      "👀 <b>Списки друзів</b>",
      "",
      "Тут з'являться списки, які тобі скидали друзі — щоб не шукати їх у переписці.",
      "",
      "Просто відкрий чиєсь посилання — і список збережеться сюди 🙂",
    ].join("\n"),
    friendRow: (index: number, title: string, suffix: string) => `${index}. 🎁 <b>${title}</b>${suffix}`,
    friendRowFinished: " — завершено",
    friendRowWatching: " 🔔",

    askListName: [
      "Як назвати список?",
      "",
      "Наприклад: День народження 🎂",
    ].join("\n"),
    askListNameCustom: "Пиши назву — будь-яку, як тобі зручно 🙂",

    /** F6 — a return after a pause opens with news, not with a cold menu. */
    digestHeader: "З твого минулого візиту:",
    digestChosen: (list: string, count: number) =>
      `🎉 у «${list}» друзі обрали ${gifts(count)}`,
    digestEventSoon: (list: string, days: number) =>
      days === 0
        ? `📅 подія «${list}» вже сьогодні`
        : days === 1
          ? `📅 подія «${list}» вже завтра`
          : `📅 подія «${list}» вже через ${t.plural.days(days)}`,
    digestGuestPromise: (list: string) => `🎗 ти обіцяв подарунок у «${list}» — не забудь 🙂`,

    // ⚙️ Про мене
    aboutMeHeader: "⚙️ <b>Про мене</b>",
    aboutMeWho: (name: string) => `🟣 Ти: ${name}`,
    aboutMeStats: (listCount: number, promiseCount: number) =>
      `🟣 Твоїх списків: ${listCount} · обіцянок: ${promiseCount}`,
    aboutMePrivacyHeader: "<b>Що бачать інші</b>",
    aboutMePrivacy: [
      "🟣 Поки в списку увімкнено режим сюрпризу, власник не бачить ні що ти обрав, ні що ти взагалі щось обрав.",
      "🟣 Якщо власник вимкнув сюрприз — він бачить твоє ім'я і подарунок.",
      "🟣 Інші гості не бачать твого імені ніколи.",
    ].join("\n"),
    aboutMePhoneSaved:
      "🟣 У тебе збережений номер телефону — з часів, коли я його питав. Більше він не потрібен, можеш прибрати.",
    phoneDeleted: "Номер видалено — я його більше не зберігаю 💜",

    confirmDeleteMyData: [
      "Видалити всі твої дані?",
      "",
      "Зникнуть назавжди:",
      "🟣 усі твої списки разом із подарунками",
      "🟣 усі твої обіцянки (друзі побачать ці подарунки вільними)",
      "🟣 списки друзів, стеження і збережений номер",
      "",
      "Відновити буде неможливо.",
    ].join("\n"),
    dataDeleted: "Готово — усе видалено. Було приємно 💜 Якщо колись повернешся, тисни /start.",

    /** A cheat sheet, not a manual: if this is needed to create a list, the design failed (§15.10). */
    help: [
      "🎁 <b>Як це працює</b>",
      "",
      "🟣 <b>Свій список.</b> Створюєш його і кидаєш мені посилання, фото або просто назву — я зроблю картку подарунка.",
      "🟣 <b>Ділишся.</b> Одне посилання — друзі відкривають список без реєстрації.",
      "🟣 <b>Друзі обирають.</b> Тапають «Я подарую це», і подарунок стає зайнятим для інших — без дублікатів.",
      "🟣 <b>Сюрприз.</b> Поки він увімкнений, ти не бачиш, хто що дарує 🤫",
      "",
      "Усе твоє живе на 🏠 Головній — кнопка знизу працює завжди, навіть посеред справи.",
    ].join("\n"),

    commandStart: "Почати",
    commandHome: "Головна",
    commandHelp: "Як це працює",
  },

  list: {
    // ── S3 Мій список ────────────────────────────────────────────────────
    header: (icon: string, title: string) => `${icon ? `${icon} ` : ""}<b>${title}</b>`,
    dateLine: (date: string, relative: string | null) =>
      relative ? `📅 ${date} · ${relative}` : `📅 ${date}`,
    finishedNotice: "🏁 Список завершено — нових обіцянок він не приймає.",
    coAuthorNotice: "👥 Ти співавтор цього списку.",
    countLine: (count: number) => gifts(count),

    /** The pulse (§8.4): enough to feel the list is alive, never enough to spoil it. */
    pulseChosen: (chosen: number, total: number) =>
      `🎉 Друзі вже обрали ${chosen} з ${total} подарунків`,
    pulseAlive: "🎉 Список живий — друзі вже заглядають",
    pulseOpen: (chosen: number, total: number) => `👀 Обрано ${chosen} з ${total} подарунків`,

    empty: "Додай перший подарунок — просто надішли мені посилання, фото або назву 🙂",
    emptyFinished: "У цьому списку не було подарунків.",
    tapGiftHint: "Тисни номер, щоб відкрити подарунок.",
    giftRow: (index: number, icon: string, title: string) =>
      `${index}. ${icon ? `${icon} ` : ""}<b>${title}</b>`,
    giftRowMeta: (parts: string[]) => `    ${parts.join(" · ")}`,

    /** The empty-state line below already explains what to do next. */
    created: (title: string) => `✨ Список «${title}» створено!`,

    // ── S6 Поширення ─────────────────────────────────────────────────────
    shareHeader: (title: string) => `📤 <b>Поділитися «${title}»</b>`,
    sharePreviewHeader: "Ось що побачить друг:",
    sharePreview: (title: string, owner: string, date: string | null, gifts: string) =>
      [`🎁 <b>${title}</b>`, `Список бажань · ${owner}`, date ? `📅 ${date}` : null, gifts]
        .filter((line) => line !== null)
        .join("\n"),
    shareFreeCount: (free: number, total: number) => `${gifts(total)}, вільних — ${free}`,
    shareLinkHeader: "Посилання:",
    shareEmpty: [
      "Список поки порожній — друзі побачать пустку 🙂",
      "",
      "Може, спершу додаси хоч один подарунок?",
    ].join("\n"),
    /** The ready-made message that lands in the friend's chat. */
    shareMessage: (title: string, link: string) =>
      [
        `🎁 Мій список бажань «${title}»`,
        "",
        "Обери, що подарувати — інші побачать, що подарунок уже зайнятий, і не задублюють:",
        "",
        link,
      ].join("\n"),

    // ── S7 Про список ────────────────────────────────────────────────────
    aboutHeader: (title: string) => `⚙️ <b>Про список «${title}»</b>`,
    aboutDate: (date: string, relative: string) => `📅 Подія: ${date} · ${relative}`,
    aboutNoDate: "📅 Дата події не вказана",
    aboutDatePast: "📅 Дата вже минула — нагадувань по ній не буде.",
    aboutNoDescription: "📝 Опису поки нема",
    aboutSurpriseOn: "🤫 Режим сюрпризу увімкнено — ти не бачиш, хто що дарує",
    aboutSurpriseOff: "👀 Режим сюрпризу вимкнено — ти бачиш усі обіцянки",
    aboutNotifyOn: "🔔 Сповіщення про список: увімкнені",
    aboutNotifyOff: "🔕 Сповіщення про список: вимкнені",
    aboutCoAuthors: (count: number) =>
      count === 0 ? "👥 Ведеш список сам" : `👥 Співавторів: ${count}`,
    aboutInviteOpen: "🔗 Є відкрите запрошення для співавтора",
    aboutReadOnly: "👥 Ти співавтор — налаштування списку змінює власник.",

    askTitle: "Яка нова назва списку?",
    titleUpdated: (title: string) => `✅ Тепер список називається «${title}».`,
    askDescription: [
      "Що написати в описі?",
      "",
      "Наприклад: «Збираю на новосілля, дрібниці теж радують 🙂»",
      "Тисни «Пропустити», щоб прибрати опис зовсім.",
    ].join("\n"),
    descriptionUpdated: "✅ Опис оновлено.",
    descriptionRemoved: "✅ Опис прибрано.",
    askDate: [
      "Коли подія?",
      "",
      "Наприклад: «15 серпня», «12.08.2026» або «завтра».",
      "Тисни «Пропустити», щоб прибрати дату.",
    ].join("\n"),
    dateUpdated: (date: string) => `✅ Зберіг: ${date}.`,
    dateRemoved: "✅ Дату прибрано.",
    dateNotRecognized:
      "Не зрозумів дату 😕 Спробуй так: «15 серпня», «12.08.2026» або «завтра».",
    datePastNotice: "📅 Ця дата вже минула — нагадувань по ній не надсилатиму.",

    confirmSurpriseOff: [
      "Вимкнути режим сюрпризу?",
      "",
      "Ти побачиш, хто який подарунок обрав. Друзям на екрані списку буде видно, що сюрприз вимкнено — щоб ніхто не обіцяв подарунок, думаючи, що це таємниця.",
    ].join("\n"),
    surpriseTurnedOff: "👀 Сюрприз вимкнено — тепер ти бачиш, хто що дарує.",
    surpriseTurnedOn: "🤫 Сюрприз увімкнено — деталей обіцянок я тобі більше не показую.",
    notifyUpdatedOn: "🔔 Сповіщення про цей список увімкнено.",
    notifyUpdatedOff: "🔕 Сповіщення про цей список вимкнено.",

    confirmRotateLink: [
      "Закрити старе посилання?",
      "",
      "Усі, кому ти вже його надсилав, більше не відкриють список — доведеться поділитися новим.",
    ].join("\n"),
    linkRotated: (link: string) =>
      ["🔗 Готово — старе посилання більше не діє.", "", "Ось нове:", link].join("\n"),

    // Хто що дарує (only with the surprise switched off)
    promisesHeader: (title: string) => `👀 <b>Хто що дарує · «${title}»</b>`,
    promisesEmpty: "Поки що ніхто нічого не обрав.",
    promiseRow: (gift: string, guest: string, status: string) =>
      `🟣 <b>${gift}</b>\n    ${guest} · ${status}`,

    // ── Співавтори ───────────────────────────────────────────────────────
    coAuthorsHeader: (title: string) => `👥 <b>Співавтори «${title}»</b>`,
    coAuthorsIntro: "Співавтор може додавати й правити подарунки нарівні з тобою, але не може завершити чи видалити список.",
    coAuthorsEmpty: "Поки що ведеш список сам 🙂",
    coAuthorRow: (index: number, name: string) => `${index}. 🟣 ${name}`,
    coAuthorsHint: "Тисни номер, щоб прибрати співавтора.",
    coAuthorRemoved: (name: string) => `${name} більше не співавтор.`,
    coAuthorRestored: (name: string) => `${name} знову співавтор ✅`,
    inviteCreated: (title: string, link: string) =>
      [
        `👥 Ось запрошення в співавтори «${title}»:`,
        "",
        link,
        "",
        "Кидай його тій людині. Запрошення одноразове — щойно вона його відкриє, посилання перестане діяти.",
      ].join("\n"),
    inviteRevoked: "Запрошення скасовано.",
    inviteMessage: (name: string, title: string) =>
      `${name} запрошує тебе разом вести список «${title}».`,
    inviteAccepted: (title: string) =>
      [
        `✨ Готово — тепер ти співавтор списку «${title}».`,
        "",
        "Він з'явився на твоїй Головній. Додавай подарунки як у свій.",
      ].join("\n"),
    inviteInvalid:
      "Це запрошення вже недійсне 😕 Попроси автора списку надіслати нове.",
    inviteOwn: "Це ж твій власний список 🙂",

    // ── Завершення / копія / видалення ───────────────────────────────────
    confirmFinish: (title: string) =>
      [
        `Завершити список «${title}»?`,
        "",
        "Друзі більше не зможуть обіцяти подарунки. Список переїде в «Завершені» на Головній — усе всередині залишиться.",
      ].join("\n"),
    finished: (title: string) => `🏁 «${title}» завершено. Знайдеш його в «Завершені» на Головній.`,
    reopened: (title: string) => `↩️ «${title}» знову активний — обіцянки приймаються.`,
    reused: (title: string, count: number) =>
      [
        `✨ Створив копію: «${title}».`,
        "",
        `Переніс ${gifts(count)}, обіцянки друзів не копіював. Лишилось поставити нову дату 🙂`,
      ].join("\n"),

    confirmDeleteStep1: (title: string, warning: string | null) =>
      [`Видалити список «${title}»?`, warning, "", "Відновити буде неможливо."]
        .filter((line) => line !== null)
        .join("\n"),
    deleteWarningPromises: (count: number) =>
      `\n⚠️ ${people(count)} вже обрали тут подарунки — вони отримають сповіщення.`,
    confirmDeleteStep2: (title: string, giftCount: number) =>
      [
        `Точно видалити «${title}»?`,
        "",
        `Зникне сам список і ${gifts(giftCount)} у ньому. Це назавжди — кнопки «повернути» не буде.`,
      ].join("\n"),
    deleted: (title: string) => `🗑 Список «${title}» видалено.`,
  },

  gift: {
    // ── S4 Мій подарунок ─────────────────────────────────────────────────
    /** Every screen says where it is (§9.2). Two levels of path, never more. */
    path: (list: string, gift: string) => `${list} › <b>${gift}</b>`,
    quantityLine: (count: number) => `🟣 Потрібно: ${count} шт`,
    priorityLine: (label: string) => `🟣 Наскільки хочеш: ${label}`,
    commentLine: (comment: string) => `💬 ${comment}`,
    surpriseNote: "🤫 Хто це обрав — не показую, це ж сюрприз.",
    takenNote: (chosen: number, total: number) => `👀 Обрали: ${chosen} з ${total}`,

    // ── Додавання: превʼю-картка (draft) ─────────────────────────────────
    askInput: [
      "Кидай посилання на товар — я сам витягну назву, фото й ціну.",
      "",
      "Можна й простіше: надішли фото або просто напиши, що це за подарунок 🙂",
    ].join("\n"),
    lookingUp: "🔎 Дивлюся, що там…",
    lookingUpSlow: "🔎 Сайт відповідає повільно, ще секунду…",
    scrapeFailed: [
      "Не зміг відкрити цей сайт 😕",
      "",
      "Нічого страшного: напиши назву подарунка, а посилання я вже зберіг — фото й ціну додаси потім.",
    ].join("\n"),
    askPhotoTitle: "Гарне фото! Що це за подарунок?",
    previewHeader: (list: string) => `🎁 Новий подарунок у «${list}»`,
    previewNoTitle: "<i>без назви</i>",
    previewLine: (label: string, value: string) => `🟣 ${label}: ${value}`,
    previewHint: "Усе це можна змінити зараз або будь-коли потім.",
    previewNeedsTitle: "Спершу дай подарунку назву 🙂",

    askTitle: "Як назвати цей подарунок?",
    askPrice: [
      "Яка ціна?",
      "",
      "Наприклад: «12 999 ₴». Тисни «Пропустити», щоб прибрати ціну.",
    ].join("\n"),
    askUrl: [
      "Кидай посилання на товар.",
      "",
      "Тисни «Пропустити», щоб прибрати його.",
    ].join("\n"),
    askStore: "У якому магазині? Тисни «Пропустити», щоб прибрати.",
    askComment: [
      "Що важливо знати — колір, розмір, модель?",
      "",
      "Наприклад: «чорні, обов'язково з чохлом». Тисни «Пропустити», щоб прибрати коментар.",
    ].join("\n"),
    askPhoto: [
      "Надішли фото подарунка.",
      "",
      "Тисни «Пропустити», щоб залишити як є.",
    ].join("\n"),
    askQuantity: [
      "Скільки штук потрібно?",
      "",
      "Наприклад: 2. Якщо одна — так і напиши 1 🙂",
    ].join("\n"),
    askPriority: "Наскільки сильно хочеш цей подарунок?",
    photoPlease: "Це має бути фото 🙂 Надішли картинку або тисни «Пропустити».",
    photoRemoved: "✅ Фото прибрано.",
    quantityBelowPromised: (promised: number) =>
      `Друзі вже обіцяли ${promised} шт — менше поставити не вийде, бо чиясь обіцянка стала б недійсною.`,
    quantityMinOne: "Має бути хоча б 1 🙂",

    /** Success: result → where it lives now → next step (§13). */
    added: (title: string, list: string) => `✅ «${title}» у списку «${list}»!`,
    addedFirst: (title: string, list: string) =>
      [
        `✨ «${title}» — перший подарунок у «${list}»!`,
        "",
        "Додай ще кілька — і можна ділитися з друзями.",
      ].join("\n"),
    addedReadyToShare: (title: string, list: string) =>
      [`✅ «${title}» у списку «${list}»!`, "", "Список уже виглядає готовим 👌 Час поділитися?"].join("\n"),

    askWhatToEdit: "Що змінюємо?",
    updated: "✅ Зміну збережено.",
    priorityUpdated: (label: string) => `✅ Тепер це «${label}».`,
    quantityUpdated: (count: number) => `✅ Потрібно ${count} шт.`,
    movedTop: "⏫ Тепер на початку списку.",
    movedUp: "⬆️ Підняв вище.",
    movedDown: "⬇️ Опустив нижче.",

    confirmDelete: (title: string, promised: number) =>
      [
        `Видалити «${title}»?`,
        "",
        `⚠️ ${people(promised)} вже пообіцяли цей подарунок — їхні обіцянки скасуються, і я їх про це попереджу.`,
      ].join("\n"),
    deleted: (title: string) => `🗑 «${title}» прибрано зі списку.`,
    deletedUndoHint: "Передумав? Можна повернути.",
    restored: (title: string) => `↩️ «${title}» знову в списку.`,
    restoreTooLate: "Цей подарунок уже не повернути 😕 Але його можна додати заново.",

    // ── Розумний ввід (F3) ───────────────────────────────────────────────
    smartAskWhichList: "🎁 Додаю подарунок. У який список?",
    smartAskAddText: (text: string) => `Додати «${text}» як подарунок?`,
    smartNoLists: [
      "Схоже на подарунок! 🎁",
      "",
      "Тільки списку в тебе ще немає — створимо перший?",
    ].join("\n"),
    smartFallback: [
      "Я бот для списків бажань 🙂",
      "",
      "Кинь мені посилання, фото або назву подарунка — і я додам його в список. А ось твоя Головна:",
    ].join("\n"),
    smartDraftPending: (title: string | null) =>
      title
        ? `Ти не закінчив додавати «${title}». Продовжити?`
        : "Ти почав додавати подарунок. Продовжити?",
    draftDropped: "Ок, почнімо заново 🙂",
  },

  showcase: {
    // ── S5 Вітрина ───────────────────────────────────────────────────────
    //
    // The owner's name always appears in the nominative, never bent into a
    // possessive. Ukrainian would want the genitive here ("список Марти"), and
    // a name is exactly the word a naive rule gets wrong — «Марта» → «Марта»,
    // «Ілля» → «Іллі», «Дмитро» → «Дмитра». A separator sidesteps the whole
    // problem and reads perfectly naturally.
    header: (icon: string, title: string) => `${icon ? `${icon} ` : ""}<b>${title}</b>`,
    ownerLine: (owner: string) => `Список бажань · ${owner}`,
    dateLine: (date: string, relative: string) => `📅 ${date} · ${relative}`,
    surprisePromise: (owner: string) => `Обери подарунок — ${owner} не побачить, що саме ти вибрав 🤫`,
    openPromise: (owner: string) =>
      `⚠️ У цьому списку сюрприз вимкнено: ${owner} бачить, хто що обрав.`,
    finishedNotice: "🏁 Список завершено — обіцянки він більше не приймає.",
    tapGiftHint: "Тисни номер, щоб глянути подарунок.",
    freeCount: (free: number, total: number) => `${gifts(total)} · вільних: ${free}`,
    allTaken: "Усі подарунки вже розібрали 🎉",
    empty: (owner: string) =>
      `${owner} ще наповнює список. Хочеш — повідомлю, коли тут щось з'явиться 🔔`,
    hiddenTakenNote: (count: number) => `Сховано зайнятих: ${count}`,
    watchingHint: "🔔 Ти стежиш за списком — напишу, коли з'явиться щось нове.",
    watchOn: "Стежу за списком 🔔",
    watchOff: "Більше не стежу 🔕",

    // ── S5a Подарунок гостя ──────────────────────────────────────────────
    statusFree: "🟣 Статус: вільний",
    statusMine: (status: string) => `🤝 Це твоя обіцянка · ${status}`,
    statusPartly: (available: number, total: number) => `🟣 Вільно: ${available} з ${total}`,
    statusTaken: "✅ Цей подарунок уже дарують",
    takenHint: "Можна пошукати щось інше — або я повідомлю, якщо він звільниться.",

    // ── Обіцянка ─────────────────────────────────────────────────────────
    promised: (title: string, owner: string) =>
      [
        "Домовились! 🤝",
        "",
        `«${title}» — за тобою. ${owner} не дізнається 🤫`,
        "",
        "Знайдеш це в «🎗 Я дарую» на Головній.",
      ].join("\n"),
    promisedOpen: (title: string, owner: string) =>
      [
        "Домовились! 🤝",
        "",
        `«${title}» — за тобою.`,
        "",
        `У цьому списку сюрприз вимкнено, тож ${owner} побачить, що подарунок обрав саме ти.`,
      ].join("\n"),
    promisedMore: (title: string, mine: number) =>
      `🤝 Тепер за тобою ${mine} шт «${title}».`,
    promiseRaceLost: [
      "Ой, щойно цей подарунок узяв хтось інший 😔",
      "",
      "Ось що ще вільне:",
    ].join("\n"),
    promiseOwnList: "Це ж твій власний список 🙂 Обіцяти собі подарунки не треба.",
    promiseListFinished: "Список уже завершено — нових обіцянок він не приймає.",
    promiseUndone: (title: string) => `↩️ Відпустив «${title}» — подарунок знову вільний.`,
  },

  promise: {
    // ── S8 «Я дарую» ─────────────────────────────────────────────────────
    header: (count: number) => `🎗 <b>Ти даруєш ${gifts(count)}</b>`,
    groupHeader: (list: string, date: string | null) =>
      date ? `🎁 <b>${list}</b> · ${date}` : `🎁 <b>${list}</b>`,
    row: (index: number, title: string, status: string) => `${index}. ${title} — ${status}`,
    tapHint: "Тисни номер, щоб відкрити обіцянку.",
    empty: [
      "🎗 <b>Я дарую</b>",
      "",
      "Поки нічого. Коли друг поділиться списком і ти обереш подарунок — обіцянка житиме тут.",
      "",
      "Так ти не забудеш, що саме обіцяв 🙂",
    ].join("\n"),

    // ── S8a Моя обіцянка ─────────────────────────────────────────────────
    statusLine: (status: string) => `🟣 Статус: ${status}`,
    quantityLine: (count: number) => `🟣 Кількість: ${count} шт`,
    listGoneNote: "⚠️ Цього списку більше немає — але твоя позначка збережена.",
    giftGoneNote: "⚠️ Власник прибрав цей подарунок зі списку.",

    marked: (title: string) =>
      [`✅ Позначив: «${title}» куплено.`, "", "Подарунок лишається за тобою — інші його не візьмуть."].join("\n"),
    confirmUnbought: (title: string) =>
      `«${title}» знову стане «обіцяно, але не куплено». Продовжити?`,
    unbought: (title: string) => `↩️ «${title}» — знову просто обіцянка.`,

    confirmRelease: (title: string) =>
      [
        `Відпустити «${title}»?`,
        "",
        "Подарунок знову стане вільним — його зможе взяти хтось інший.",
      ].join("\n"),
    confirmReleaseBought: (title: string) =>
      [
        `Відпустити «${title}»?`,
        "",
        "Ти вже позначав цей подарунок купленим. Якщо відпустиш — його зможе взяти хтось інший, і вийде дублікат.",
      ].join("\n"),
    released: (title: string) => `💨 «${title}» знову вільний для інших.`,
  },

  notify: {
    // ── Власнику (усе глушиться тумблером сповіщень) ──────────────────────
    ownerPromiseSurprise: (list: string) =>
      `💜 У «${list}» друзі обрали ще один подарунок. Який саме — не кажу, сюрприз 🤫`,
    ownerPromiseOpen: (list: string, gift: string, guest: string, quantity: number) =>
      [
        `🎁 Новий подарунок обрано у «${list}»`,
        "",
        `🟣 ${gift}${quantity > 1 ? ` · ${quantity} шт` : ""}`,
        `🟣 Дарує: ${guest}`,
      ].join("\n"),
    ownerReleasedSurprise: (list: string) => `↩️ У «${list}» один подарунок знову вільний.`,
    ownerReleasedOpen: (list: string, gift: string) => `↩️ У «${list}» знову вільний: ${gift}`,
    ownerBoughtSurprise: (list: string) =>
      `🎁 Один із подарунків у «${list}» уже куплено. Деталей не кажу — сюрприз 🤫`,
    ownerBoughtOpen: (list: string, gift: string, guest: string) =>
      `🎁 Подарунок із «${list}» уже куплено!\n\n🟣 ${gift}\n🟣 Купив(ла): ${guest}`,
    ownerCoAuthorJoined: (list: string, name: string) =>
      `👥 ${name} приєднався(лась) до списку «${list}» — тепер ви ведете його разом 💜`,

    // ── Гостю: усе, що ламає його обіцянку ───────────────────────────────
    guestGiftRemoved: (list: string, gift: string) =>
      `⚠️ Власник прибрав «${gift}» зі списку «${list}». Твоя обіцянка скасована — обирати нічого не треба.`,
    guestGiftRemovedBought: (list: string, gift: string) =>
      `⚠️ Власник прибрав «${gift}» зі списку «${list}». Ти вже купив цей подарунок — позначку я зберіг, знайдеш її в «🎗 Я дарую».`,
    guestGiftRestored: (list: string, gift: string) =>
      `↩️ Власник повернув «${gift}» у список «${list}» — твоя обіцянка знову діє 🙂`,
    guestListFinished: (list: string) =>
      `🏁 Список «${list}» завершено. Твоя обіцянка лишається в силі — просто нових подарунків там уже не оберуть.`,
    guestListDeleted: (list: string) =>
      `🗑 Власник видалив список «${list}». Твоя обіцянка там більше не діє.`,

    // ── Тим, хто стежить ─────────────────────────────────────────────────
    newGiftsDigest: (list: string, count: number) =>
      count === 1
        ? `🔔 У «${list}» з'явився новий подарунок ✨`
        : `🔔 У «${list}» з'явилося нових подарунків: ${count} ✨`,
    giftFreeAgain: (list: string, gift: string) =>
      `🔔 У «${list}» знову вільний подарунок:\n\n🟣 ${gift}`,

    // ── Нагадування про подію ────────────────────────────────────────────
    eventReminderGuest: (list: string, days: number, link: string) =>
      [
        days === 1 ? `📅 «${list}» — вже завтра!` : `📅 «${list}» — вже через ${t.plural.days(days)}`,
        "",
        "Якщо ще не обрав подарунок — саме час:",
        link,
      ].join("\n"),
    eventReminderOwner: (list: string, days: number) =>
      days === 1
        ? `📅 «${list}» вже завтра — саме час нагадати друзям про список 💜`
        : `📅 «${list}» вже через ${t.plural.days(days)} — саме час нагадати друзям про список 💜`,
  },
};
