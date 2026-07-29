// Every user-facing string the bot sends lives here — one place to read,
// tweak the tone of, or eventually translate. Feature files should not
// contain string literals meant for the user; they import `t` instead.
//
// Tone of voice + visual style are documented in CLAUDE.md ("Дружній
// друзяка" + фіолетовий/сердечка/крапки) — read that before editing copy.

/**
 * Ukrainian needs three plural forms, so "1 бажань" reads as broken to a
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

const gifts = (n: number) => `${n} ${plural(n, "бажання", "бажання", "бажань")}`;

export const t = {
  common: {
    cancelled: "Ок, скасовано 🙂",
    nothingToCancel: "Та нема чого скасовувати 🙂 Ось меню:",
    notFoundAlert: "Не знайшов такий список 😕",
    noAccessAlert: "Це не для тебе — доступу нема 🙅",
    guestFallbackName: "Гість",
    finishStepFirst: "Спершу заверши цей крок — або тисни «Скасувати» 🙂",
    textPlease: "Мені потрібен текст 🙂 Напиши словами або тисни «Скасувати».",
    integerPlease: "Потрібне ціле число, наприклад 1 🙂",
    tapNumberHint: "Тисни номер, щоб відкрити.",
    buttonExpired: "Ця кнопка вже застаріла 🙂 Відкрий розділ заново через меню.",
    tooLong: (max: number) => `Трохи задовго 🙂 Спробуй вкластися в ${max} символів.`,
  },

  // Button labels stay short and functional — no decorative emoji beyond
  // what's already meaningful (see CLAUDE.md: "Кнопки — виняток").
  buttons: {
    menuCreate: "➕ Створити вішліст",
    menuMyLists: "📋 Мої вішлісти",
    menuMyReservations: "🎁 Мої бронювання",
    menuSubscriptions: "👀 Чужі списки",
    menuSettings: "⚙️ Налаштування",

    skip: "Пропустити",
    cancel: "Скасувати",
    back: "⬅️ Назад",
    backToLists: "⬅️ Мої вішлісти",
    backToList: "⬅️ До списку",
    backToReservations: "⬅️ До бронювань",

    share: "📤 Поділитися",
    settings: "⚙️ Налаштування",
    sendToFriend: "Надіслати другу",

    editTitle: "✏️ Назва",
    editDescription: "📝 Опис",
    editDate: "📅 Дата",
    privacy: "🔒 Приватність",
    editors: "👥 Редактори",
    inviteEditor: "Створити запрошення",
    revokeInvite: "Скасувати запрошення",
    notifyOn: "🔔 Сповіщення: увімкнені",
    notifyOff: "🔕 Сповіщення: вимкнені",
    rotateLink: "🔗 Оновити посилання",
    confirmRotateLink: "Так, оновити",
    archive: "📦 Архівувати",
    unarchive: "♻️ Розархівувати",
    duplicate: "📄 Копія",
    deleteList: "🗑 Видалити список",
    confirmArchive: "Так, архівувати",
    confirmDelete: "Все одно видалити",

    addItem: "➕ Додати бажання",
    saveItem: "✅ Зберегти",
    editItem: "✏️ Редагувати",
    priority: "📌 Пріоритет",
    quantity: "🔢 Кількість",
    moveUp: "⬆️ Вище",
    moveDown: "⬇️ Нижче",
    moveTop: "⏫ На початок",
    deleteItem: "🗑 Видалити",
    openLink: "🔗 Відкрити посилання",
    fieldTitle: "Назва",
    fieldUrl: "Посилання",
    fieldPrice: "Ціна",
    fieldStore: "Магазин",
    fieldComment: "Коментар",

    priorityHigh: "🔥 Дуже хочу",
    priorityNormal: "⭐ Хочу",
    priorityLow: "💭 Було б приємно",
    privacySurprise: "🎁 Сюрприз",
    privacyOpen: "👀 Відкритий",

    subscribe: "🔔 Підписатися",
    unsubscribe: "🔕 Відписатися",
    reserve: "🎁 Забронювати",
    filterAll: "Усі",
    filterAvailable: "Доступні",
    filterReserved: "Заброньовані",

    confirmReservation: "✅ Підтвердити",
    cancelReservation: "Скасувати бронювання",
    changeQuantity: "🔢 Змінити кількість",
    markPurchased: "✅ Уже придбав",
    confirmPurchased: "Так, придбав",
    undoPurchased: "↩️ Повернути в активні",
    openProduct: "🔗 Відкрити товар",
    confirmCancel: "Так, скасувати",
    no: "Ні",
    shareContact: "📱 Поділитися контактом",
    view: "Переглянути",

    deleteMyData: "🗑 Видалити мої дані",
    confirmDeleteMyData: "Так, видалити все",
    howItWorks: "❓ Як це працює",
    backToSettings: "⬅️ До налаштувань",
  },

  labels: {
    priorityIcon: {
      HIGH: "🔥",
      NORMAL: "⭐",
      LOW: "💭",
    },
    privacy: {
      SURPRISE: "🎁 Сюрприз — не бачу, хто і що бронює",
      OPEN: "👀 Відкритий — бачу всі бронювання",
    },
    reservationStatus: {
      ACTIVE: "заброньовано",
      CANCELLED: "скасовано",
      PURCHASED: "придбано",
    },
  },

  menu: {
    welcome: [
      "💜 Привіт! Я — Друзяка-бот 🎁",
      "",
      "Допоможу зібрати список бажань і розказати про нього друзям — без незручностей на кшталт «а що тобі подарувати?».",
      "",
      "Жодної реєстрації, жодних складнощів. Усе тут, у Telegram.",
    ].join("\n"),
    mainMenu: "Ось меню:",
    help: [
      "🎁 <b>Як це працює</b>",
      "",
      "🟣 Створюєш вішліст і кидаєш у нього посилання на товари — я сам витягну назву, фото й ціну.",
      "🟣 Ділишся посиланням з друзями.",
      "🟣 Вони бронюють подарунки, щоб не задублювати одне одного.",
      "🟣 Ти бачиш, скільки вже розібрали — а якщо список у режимі «Сюрприз», то лише кількість, без деталей 🤫",
      "",
      "<b>Команди</b>",
      "/menu — головне меню",
      "/cancel — вийти з поточного кроку",
      "/help — оця підказка",
      "",
      "Приватність і сповіщення налаштовуються окремо для кожного списку: відкрий список → «Налаштування» 💜",
    ].join("\n"),
    commandStart: "Почати спочатку",
    commandMenu: "Головне меню",
    commandHelp: "Як це працює",
    commandCancel: "Скасувати поточний крок",

    settingsHeader: "⚙️ Налаштування",
    settingsTelegramId: (id: string) => `🟣 Твій Telegram ID: <code>${id}</code>`,
    settingsUsername: (username: string) => `🟣 Юзернейм: @${username}`,
    settingsStats: (lists: number, reservations: number) =>
      `🟣 Вішлістів: ${lists} · бронювань: ${reservations}`,
    settingsHint:
      "Приватність і сповіщення налаштовуються окремо для кожного списку — відкрий список → «Налаштування» 💜",
    settingsDataNote: (hasPhone: boolean) =>
      hasPhone
        ? "🟣 Твій номер збережений для одноразової перевірки при бронюванні. Його бачить лише власник списку, який ти забронював, і лише в режимі «Відкритий»."
        : "🟣 Номер телефону не збережений.",

    confirmDeleteMyData: [
      "Видалити всі твої дані?",
      "",
      "Зникнуть назавжди:",
      "🟣 усі твої вішлісти разом із бажаннями",
      "🟣 усі твої бронювання (власники отримають сповіщення)",
      "🟣 підписки, історія переглядів і збережений номер",
      "",
      "Це незворотно.",
    ].join("\n"),
    dataDeleted: "Готово — усе видалено. Було приємно 💜 Якщо колись повернешся, тисни /start.",

    editorInviteAccepted: (title: string) =>
      `✨ Тепер ти можеш редагувати список «${title}» — він з'явився у розділі «📋 Мої вішлісти».`,
    editorInviteInvalid: "Це запрошення вже недійсне 😕 Попроси власника створити нове.",
    editorInviteOwn: "Це ж твій власний список 🙂",
  },

  wishlist: {
    noneYet: "У тебе ще немає жодного вішліста. Тисни «➕ Створити вішліст» — і почнемо! ✨",
    yourLists: (count: number) => `📋 <b>Твої вішлісти (${count})</b>`,
    listRow: (index: number, icon: string, title: string) => `${index}. ${icon} <b>${title}</b>`,
    listRowMeta: (parts: string[]) => `    ${parts.join(" · ")}`,
    itemCount: gifts,
    reservedCount: (count: number) => `🟣 ${count} заброньовано`,
    archivedTag: "в архіві",

    askTitle: "Як назвемо список? (наприклад: «День народження Володимира»)",
    created: (link: string) =>
      [
        "✨ Готово, список створено!",
        "",
        "Ось посилання для друзів:",
        link,
        "",
        "Тепер додай перше бажання 💜",
      ].join("\n"),

    settingsTitle: (title: string) => `⚙️ <b>Налаштування «${title}»</b>`,
    noDescription: "Опису поки нема",
    noDate: "Дата поки не вказана",

    askNewTitle: "Яка нова назва?",
    titleUpdated: "Назву оновлено ✅",
    askNewDescription: "Новий опис? Пиши — або тисни «Пропустити», щоб прибрати його зовсім.",
    descriptionUpdated: "Опис оновлено ✅",
    askNewDate: [
      "Коли подія?",
      "",
      "Розумію по-різному: «12.08.2026», «12.08», «25 грудня», «завтра».",
      "Тисни «Пропустити», щоб прибрати дату.",
    ].join("\n"),
    dateUpdated: "Дату оновлено ✅",
    dateNotRecognized:
      "Хм, не розпізнав дату 😕 Спробуй так: «12.08.2026», «12.08», «25 грудня» або «завтра».",
    datePastNotice: "📅 Дата вже минула — нагадування по ній не надсилатиму.",

    editorsTitle: (title: string) => `👥 <b>Редактори «${title}»</b>`,
    noEditors: "Поки що нікого — редагуєш тільки ти.",
    editorRow: (index: number, name: string) => `${index}. 🟣 ${name}`,
    editorsHint: "Тисни номер, щоб прибрати доступ.",
    editorRemoved: (name: string) => `Прибрав доступ для ${name}.`,
    inviteCreated: (link: string) =>
      [
        "👥 Ось запрошення в редактори:",
        "",
        link,
        "",
        "Кидай його тій людині — доступ вона отримає, щойно тисне посилання. Запрошення одноразове.",
      ].join("\n"),
    inviteRevoked: "Запрошення скасовано.",
    inviteActive: "🟣 Є активне запрошення в редактори.",

    notifyOwnerLine: (enabled: boolean) =>
      enabled ? "🔔 Сповіщення про бронювання: увімкнені" : "🔕 Сповіщення про бронювання: вимкнені",
    notifyOwnerUpdated: "Налаштування сповіщень оновлено ✅",

    confirmRotateLink:
      "Оновити посилання на список?\n\n⚠️ Старе перестане працювати — усі, кому ти його вже кидав, більше не відкриють список.",
    linkRotated: (link: string) => `🔗 Готово, ось нове посилання:\n\n${link}`,

    askPrivacyMode: "Обери режим приватності:",
    privacyUpdated: "Режим приватності оновлено ✅",

    confirmArchive: (title: string) =>
      `Архівувати «${title}»?\n\nСписок більше не прийматиме нових бронювань, але залишиться у тебе.`,
    archived: "📦 Готово, список в архіві.",
    unarchived: "♻️ Список знову активний!",

    duplicated: (itemCount: number, link: string) =>
      `✨ Копію створено (${gifts(itemCount)}, без бронювань і підписників).\n\n${link}`,

    confirmDelete: (title: string, warning: string) =>
      `Видалити список «${title}» назавжди?${warning}`,
    deleteActiveReservationsWarning: (count: number) =>
      `\n\n⚠️ У списку є ${count} активних бронювань. Гості отримають сповіщення про видалення.`,
    deleted: (title: string) => `🗑 Список «${title}» видалено.`,

    shareHeader: "📤 Ось посилання — кидай друзям:",
    shareEmptyWarning:
      "⚠️ У списку поки жодного бажання — друзі побачать порожньо. Може, спершу додаси щось? 🙂",
    shareMessage: (title: string, link: string) =>
      [
        `🎁 Мій вішліст «${title}»`,
        "",
        "Тут можна глянути побажання і забронювати подарунок, щоб не дублювались:",
        "",
        link,
      ].join("\n"),
  },

  item: {
    empty: "Поки що порожньо. Тисни «➕ Додати бажання» — і почнемо ✨",
    tapNumberHint: "Тисни номер, щоб відкрити бажання.",
    itemRow: (index: number, icon: string, title: string) => `${index}. ${icon} <b>${title}</b>`,
    itemRowMeta: (parts: string[]) => `    ${parts.join(" · ")}`,
    shortFullyReserved: "✅ заброньовано",
    shortPartial: (reserved: number, needed: number) => `🟣 ${reserved} з ${needed}`,
    shortNeeded: (needed: number) => `потрібно ${needed}`,

    fullyReserved: "✅ Уже заброньовано",
    availabilityDetail: (needed: number, reserved: number, available: number) =>
      `🟣 Потрібно: ${needed}\n🟣 Заброньовано: ${reserved}\n🟣 Залишилось: ${available}`,
    availableStatus: (needed: number) => `🟣 Потрібно: ${needed}\n🟣 Статус: доступно`,
    reservedByHeader: "Хто бронює:",
    reservedByRow: (name: string, quantity: number, status: string) =>
      `🟣 ${name} — ${quantity} шт (${status})`,
    reservedByContact: (contact: string) => `    ${contact}`,
    /** Owner-facing, SURPRISE mode: the whole point is not knowing. */
    surpriseHidden: "🤫 Режим «Сюрприз» — не показую, що вже розібрали.",

    askLinkOrTitle:
      "Кидай посилання на товар — я сам спробую витягнути назву, фото й ціну.\n\nАбо просто напиши, що це за подарунок.",
    lookingUpLink: "🔎 Хвилинку, дивлюся що там...",
    previewFound: "Ось що знайшов:",
    previewNotFound: "Сам не розпізнав товар за посиланням — напиши назву, будь ласка:",
    previewHint: "Зберігаю як 1 шт із пріоритетом «⭐ Хочу» — усе інше можна змінити будь-коли.",
    previewPrice: (price: string) => `Ціна: ${price}`,
    previewStore: (store: string) => `Магазин: ${store}`,
    added: (title: string) => `✅ Додав «${title}» до списку. Гарний вибір! 💜`,

    notFoundAlert: "Не знайшов цей подарунок 😕",
    askWhatToEdit: "Що будемо міняти?",
    fieldPrompt: {
      title: "Нова назва?",
      url: "Нове посилання. Тисни «Пропустити», щоб прибрати його.",
      price: "Нова ціна. Тисни «Пропустити», щоб прибрати її.",
      store: "Новий магазин. Тисни «Пропустити», щоб прибрати його.",
      comment: "Новий коментар — колір, розмір, усе що важливо. Тисни «Пропустити», щоб прибрати.",
    },
    updated: "Оновлено ✅",
    askQuantity: "Скільки штук потрібно? Просто число.",
    quantityAlreadyReserved: (reserved: number) =>
      `Уже заброньовано ${reserved} од. — менше поставити не вийде. Спробуй ще раз.`,
    quantityMinOne: "Має бути хоча б 1. Спробуй ще раз.",
    quantityUpdated: "Кількість оновлено ✅",

    askPriority: "Наскільки сильно хочеш цей подарунок?",
    priorityUpdated: "Пріоритет оновлено ✅",

    confirmDelete: (title: string, warning: string) => `Видалити «${title}»?${warning}`,
    deleteReservedWarning: (count: number) =>
      `\n\n⚠️ Цей подарунок уже забронювали (${count}). Гості отримають сповіщення, а бронювання стануть скасованими.`,
    deleted: "🗑 Бажання видалено.",
    movedToTop: "⏫ Тепер на початку списку.",
  },

  guest: {
    listNotFound: "Хм, не знайшов такий список 😕 Може, посилання застаріло?",
    archivedNotice: "📦 Список закрито власником — нові бронювання не приймаються.",
    tapNumberHint: "Тисни номер, щоб глянути подарунок.",
    empty: "Тут поки що порожньо 🤷",
    emptyForFilter: "За цим фільтром нічого нема 🤷",
    subscribedHint: "🔔 Ти підписаний — напишу, коли з'явиться щось нове.",
  },

  reservation: {
    itemGone: "Цей подарунок уже кудись зник.",
    listClosed: "Цей список закрив власник — бронювання недоступне.",
    alreadyFull: "На жаль, це вже повністю заброньовано 😕",
    askQuantity: "Скільки штук бронюємо?",
    allAvailable: (count: number) => `Усе, що є (${count})`,
    askContact:
      "Щоб захистити список від спаму, поділись, будь ласка, своїм контактом Telegram (це не реєстрація — лише одноразова перевірка, більше не знадобиться).",
    askContactRetry: "Тисни кнопку «📱 Поділитися контактом» унизу, щоб продовжити 🙂",
    contactThanks: "Дякую! 💜 Наступні бронювання будуть без цього кроку.",
    summary: (title: string, quantity: number, contact: string) =>
      [
        "<b>Перевіримо:</b>",
        "",
        `🎁 ${title}`,
        `🟣 Кількість: ${quantity}`,
        `🟣 Твій контакт для власника: ${contact}`,
      ].join("\n"),
    confirmed: (title: string) => `✅ Готово, «${title}» заброньовано! 💜`,
    itemGoneAtConfirm: "Ой, цей подарунок уже недоступний.",
    raceLost: "От халепа — цю кількість щойно розібрали. Спробуй менше.",

    noneYet: "У тебе поки немає активних бронювань. Відкрий чийсь список за посиланням — і обери подарунок 🎁",
    yourReservations: (count: number) => `🎁 <b>Твої бронювання (${count})</b>`,
    reservationRow: (index: number, title: string) => `${index}. <b>${title}</b>`,
    reservationRowMeta: (parts: string[]) => `    ${parts.join(" · ")}`,
    fromList: (title: string) => `зі списку «${title}»`,
    quantityShort: (quantity: number) => `${quantity} шт`,
    quantityLine: (quantity: number) => `🟣 Кількість: ${quantity}`,
    statusLine: (label: string) => `🟣 Статус: ${label}`,

    noLongerActive: "Це бронювання вже неактивне.",
    askNewQuantity: (max: number) => `Скільки штук бронюємо? Максимум ${max}.`,
    quantityMinOne: "Має бути хоча б 1. Спробуй ще раз.",
    quantityExceedsMax: (max: number) => `Максимум ${max}. Спробуй ще раз.`,
    quantityUpdated: "Кількість оновлено ✅",

    notFoundAlert: "Бронювання не знайдено",
    notActiveAlert: "Бронювання вже неактивне",
    confirmCancel: (title: string) => `Скасувати бронювання «${title}»?`,
    cancelled: "↩️ Бронювання скасовано.",

    confirmPurchased: (title: string) =>
      `Позначити «${title}» як придбане?\n\nПодарунок залишиться за тобою — інші його не заброньують.`,
    markedPurchased: "✅ Позначено як придбано. Ти молодець! 💜",
    purchasedUndone: "↩️ Повернув у активні бронювання.",

    selfReserveAlert: "Це твій власний список 🙂 Бронювати в себе не треба.",
    contactNotYours:
      "Це чийсь чужий контакт 🙂 Тисни саме кнопку «📱 Поділитися контактом» — вона надішле твій власний.",
    mergedIntoExisting: (total: number) =>
      `Ти вже бронював цей подарунок — просто збільшив кількість до ${total} 🙂`,
  },

  subscription: {
    noneYet:
      "Ти ще не відкривав чужих списків. Щойно друг кине тобі посилання — список збережеться тут, щоб не шукати його в переписці 🙂",
    yourSubscriptions: (count: number) => `👀 <b>Чужі списки (${count})</b>`,
    subscriptionRow: (index: number, title: string, suffix: string) => `${index}. 🎁 <b>${title}</b>${suffix}`,
    archivedSuffix: " — в архіві",
    subscribedSuffix: " 🔔",
    subscribedToast: "Підписано 🔔",
    unsubscribedToast: "Відписано 🔕",
    listHint: "🔔 — списки, з яких приходять оновлення.",
  },

  notify: {
    ownerNewReservationSurprise: (list: string) => `✅ У твоєму вішлісті «${list}» з'явилося нове бронювання 💜`,
    ownerNewReservationOpen: (
      list: string,
      item: string,
      quantity: number,
      guest: string,
      contact: string | null,
    ) =>
      [
        `✅ Нове бронювання у «${list}»`,
        "",
        `🎁 ${item}`,
        `🟣 Кількість: ${quantity}`,
        `🟣 Бронює: ${guest}`,
        contact ? `🟣 Контакт: ${contact}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    ownerCancelledSurprise: (list: string) => `↩️ У «${list}» хтось скасував бронювання.`,
    ownerCancelledOpen: (list: string, item: string) => `↩️ Скасовано бронювання у «${list}»\n\n🎁 ${item}`,
    ownerPurchasedSurprise: (list: string) =>
      `🎁 Один із подарунків у «${list}» уже куплено. Деталей не кажу — сюрприз 🤫`,
    ownerPurchasedOpen: (list: string, item: string, guest: string) =>
      `🎁 Подарунок із «${list}» уже куплено!\n\n🎁 ${item}\n🟣 Придбав(ла): ${guest}`,
    editorJoined: (list: string, editor: string) =>
      `👥 ${editor} приєднався(лась) до редагування «${list}» 💜`,

    /**
     * One digest instead of a ping per gift: filling a fresh list in one
     * evening used to fire twenty separate notifications at every subscriber.
     */
    newItemsDigest: (list: string, count: number) =>
      `🔔 У «${list}» ${count === 1 ? "з'явилося нове бажання" : `з'явилося нових бажань: ${count}`} ✨`,
    itemAvailableAgain: (list: string, item: string) => `🔔 У «${list}» знову доступний подарунок:\n\n🎁 ${item}`,

    eventReminderGuest: (list: string, days: number, link: string) =>
      [
        `📅 Нагадую: подія «${list}» вже ${days === 1 ? "завтра" : `через ${days} дн.`}`,
        "",
        "Якщо ще не обрав подарунок — саме час:",
        link,
      ].join("\n"),
    eventReminderOwner: (list: string, days: number) =>
      `📅 Подія «${list}» ${days === 1 ? "вже завтра" : `через ${days} дн.`} — саме час нагадати друзям про список 💜`,
    itemRemoved: (list: string, item: string) =>
      `⚠️ Власник видалив «${item}» зі списку «${list}», де було твоє бронювання. Його скасовано.`,
    itemRemovedPurchased: (list: string, item: string) =>
      `⚠️ Власник прибрав «${item}» зі списку «${list}». Твоя позначка «придбано» збережена — знайдеш її в «🎁 Мої бронювання».`,
    listDeleted: (list: string) => `🗑 Власник видалив список «${list}». Твоє бронювання там більше не активне.`,
    listArchived: (list: string) => `📦 Список «${list}» закрито власником. Нові бронювання більше не приймаються.`,
  },
};
