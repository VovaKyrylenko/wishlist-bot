// Every user-facing string the bot sends lives here — one place to read,
// tweak the tone of, or eventually translate. Feature files should not
// contain string literals meant for the user; they import `t` instead.
//
// Tone of voice + visual style are documented in CLAUDE.md ("Дружній
// друзяка" + фіолетовий/сердечка/крапки) — read that before editing copy.

const SKIP_HINT = "Немає? Тисни «-» — і рухаємось далі.";

export const t = {
  common: {
    skip: "-",
    skipHint: SKIP_HINT,
    cancelled: "Ок, скасовано 🙂",
    notFoundAlert: "Не знайшов такий список 😕",
    noAccessAlert: "Це не для тебе — доступу нема 🙅",
    guestFallbackName: "Гість",
  },

  // Button labels stay short and functional — no decorative emoji beyond
  // what's already meaningful (see CLAUDE.md: "Кнопки — виняток").
  buttons: {
    menuCreate: "➕ Створити вішліст",
    menuMyLists: "📋 Мої вішлісти",
    menuMyReservations: "🎁 Мої бронювання",
    menuSubscriptions: "🔔 Підписки",
    menuSettings: "⚙️ Налаштування",

    open: "Відкрити",
    share: "Поділитися",
    settings: "⚙️ Налаштування",
    backToList: "⬅️ Назад до списку",
    sendToFriend: "Надіслати другу",
    shareThisList: "📤 Поділитися списком",

    editTitle: "✏️ Змінити назву",
    editDescription: "📝 Змінити опис",
    editDate: "📅 Змінити дату",
    privacy: "🔒 Приватність",
    addEditor: "👥 Додати редактора",
    archive: "📦 Архівувати",
    unarchive: "♻️ Розархівувати",
    duplicate: "📄 Копія",
    deleteList: "🗑 Видалити список",
    confirmArchive: "Так, архівувати",
    confirmDelete: "Все одно видалити",
    cancel: "Скасувати",

    addItem: "➕ Додати бажання",
    manualEntry: "✍️ Ввести вручну",
    add: "Додати",
    edit: "Редагувати",
    editItem: "✏️ Редагувати",
    priority: "📌 Пріоритет",
    quantity: "🔢 Кількість",
    moveUp: "⬆️",
    moveDown: "⬇️",
    deleteItem: "🗑 Видалити",
    openLink: "🔗 Відкрити посилання",
    fieldTitle: "Назву",
    fieldUrl: "Посилання",
    fieldPrice: "Ціну",
    fieldStore: "Магазин",
    fieldComment: "Коментар",

    priorityHigh: "🔥 Дуже хочу",
    priorityNormal: "⭐ Хочу",
    priorityLow: "💭 Було б приємно",
    privacySurprise: "🎁 Сюрприз",
    privacyOpen: "👀 Відкритий",

    viewGifts: "🎁 Переглянути подарунки",
    subscribe: "🔔 Підписатися на оновлення",
    unsubscribe: "🔕 Відписатися",
    reserve: "🎁 Забронювати",
    filterAll: "Усі",
    filterAvailable: "Доступні",
    filterReserved: "Заброньовані",

    confirmReservation: "✅ Підтвердити бронювання",
    back: "Назад",
    viewMyReservations: "Переглянути мої бронювання",
    cancelReservation: "Скасувати бронювання",
    changeQuantity: "Змінити кількість",
    markPurchased: "Позначити як придбано",
    openProduct: "Відкрити товар",
    confirmCancel: "Так, скасувати",
    no: "Ні",
    shareContact: "📱 Поділитися контактом",
    view: "Переглянути",
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
    settingsHeader: "⚙️ Налаштування",
    settingsTelegramId: (id: string) => `Твій Telegram ID: ${id}`,
    settingsUsername: (username: string) => `Юзернейм: @${username}`,
    settingsHint:
      "Приватність і сповіщення налаштовуються окремо для кожного списку — відкрий список → «Налаштування» 💜",
  },

  wishlist: {
    noneYet: "У тебе ще немає жодного вішліста. Тисни «➕ Створити вішліст» — і почнемо! ✨",
    yourLists: (count: number) => `📋 Твої вішлісти (${count})`,
    itemCount: (count: number) => `${count} бажань`,
    fullyReservedCount: (count: number) => `🟣 ${count} повністю заброньовано`,
    partiallyReservedCount: (count: number) => `🟣 ${count} частково заброньовано`,
    archivedTag: "📦 У архіві",

    askTitle: "Як назвемо список? (наприклад: «День народження Володимира»)",
    askDescription: `Додай короткий опис (необов'язково). ${SKIP_HINT}`,
    askDate: `Коли подія? Формат ДД.ММ.РРРР (необов'язково). ${SKIP_HINT}`,
    dateNotRecognizedContinuing: "Не розібрав дату — ну і гаразд, їдемо далі без неї.",
    askPrivacy: "Хочеш бачити, хто що бронює? У режимі «Сюрприз» це залишиться таємницею навіть для тебе 🤫",
    created: (title: string, link: string) =>
      `✨ Список «${title}» готовий!\n\nОсь посилання для друзів:\n${link}\n\nНадішли його або одразу додай перше бажання 💜`,

    settingsTitle: (title: string) => `⚙️ Налаштування «${title}»`,
    noDescription: "(без опису)",
    noDate: "(дата поки не вказана)",

    askNewTitle: "Яка нова назва?",
    titleUpdated: "✅ Назву оновлено!",
    askNewDescription: `Новий опис? Пиши. Хочеш прибрати — надішли «-».`,
    descriptionUpdated: "✅ Опис оновлено!",
    askNewDate: "Нова дата у форматі ДД.ММ.РРРР. Щоб прибрати — надішли «-».",
    dateUpdated: "✅ Дату оновлено!",
    dateNotRecognizedRetry: "Хм, не розпізнав дату — спробуй ще раз у форматі ДД.ММ.РРРР.",

    askEditorUsername: "Кидай юзернейм у форматі @username (у людини має бути публічний юзернейм у Telegram).",
    editorNotFound: "Не знайшов такого користувача 😕 Перевір юзернейм і спробуй ще раз.",
    editorAdded: (username: string) => `✅ @${username} тепер теж може редагувати цей список 💜`,

    askPrivacyMode: "Обери режим приватності:",
    privacyUpdated: (label: string) => `✅ ${label}`,

    confirmArchive: (title: string) =>
      `Архівувати «${title}»? Список більше не прийматиме бронювань і сповіщень.`,
    archived: "📦 Готово, список в архіві.",
    unarchived: "♻️ Список знову активний!",

    duplicated: (title: string, itemCount: number, link: string) =>
      `✨ Копію «${title}» створено (${itemCount} бажань, без бронювань і підписників).\n\n${link}`,

    confirmDelete: (title: string, warning: string) => `Видалити список «${title}» назавжди?${warning}`,
    deleteActiveReservationsWarning: (count: number) =>
      `\n\n⚠️ У списку є ${count} активних бронювань. Гості отримають сповіщення про видалення.`,
    deleted: (title: string) => `🗑 Список «${title}» видалено.`,

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
    itemsHeader: (count: number) => `${count} бажань`,
    fullyReserved: "✅ Уже заброньовано",
    availabilityDetail: (needed: number, reserved: number, available: number) =>
      `🟣 Потрібно: ${needed}\n🟣 Заброньовано: ${reserved}\n🟣 Залишилось: ${available}`,
    availableStatus: (needed: number) => `🟣 Потрібно: ${needed}\n🟣 Статус: доступно`,

    askLinkOrManual:
      "Кидай посилання на товар — я сам спробую витягнути назву, фото й ціну.\n\nАбо тисни кнопку і заповни все руками.",
    askTitleManual: "Як називається товар?",
    lookingUpLink: "🔎 Хвилинку, дивлюся що там...",
    untitledFallback: "Без назви",
    previewPrice: (price: string) => `Ціна: ${price}`,
    previewStore: (store: string) => `Магазин: ${store}`,
    askCorrectTitle: "Введи правильну назву:",
    previewNotFound: "Не зміг сам розпізнати товар за посиланням. Введи назву руками:",
    askTitleAsText: "Введи назву товару текстом:",
    askUrlOptional: `Посилання на товар (необов'язково). ${SKIP_HINT}`,
    askPriceOptional: `Ціна (необов'язково). ${SKIP_HINT}`,
    askStoreOptional: `Магазин (необов'язково). ${SKIP_HINT}`,
    askQuantity: "Скільки штук потрібно? Просто число (наприклад, 1).",
    askQuantityInteger: "Потрібне ціле число, наприклад 1 🙂",
    quantityTooLow: "Має бути хоча б 1. Спробуй ще раз.",
    askCommentOptional: `Коментар (необов'язково — колір, розмір, усе що важливо). ${SKIP_HINT}`,
    askPriorityForNewItem: "Наскільки сильно хочеш цей подарунок?",
    added: (title: string) => `✅ Додав «${title}» до списку. Гарний вибір! 💜`,

    notFound: "Такого товару не знайшов.",
    notFoundAlert: "Товар не знайдено",
    askWhatToEdit: "Що будемо міняти?",
    fieldPrompt: {
      title: "Нова назва?",
      url: `Нове посилання. Прибрати — надішли «-».`,
      price: `Нова ціна. Прибрати — надішли «-».`,
      store: `Новий магазин. Прибрати — надішли «-».`,
      comment: `Новий коментар. Прибрати — надішли «-».`,
      quantity: "Скільки штук потрібно? Ціле число.",
    },
    updated: "✅ Оновлено!",
    askQuantityIntegerOnly: "Потрібне ціле число 🙂",
    quantityAlreadyReserved: (reserved: number) => `Уже заброньовано ${reserved} од. Менше не вийде.`,
    quantityMinOne: "Має бути хоча б 1.",
    quantityUpdated: "✅ Кількість оновлено!",

    askPriorityChange: "Наскільки сильно хочеш цей подарунок?",
    priorityUpdated: "✅ Пріоритет оновлено!",

    confirmDelete: (title: string, warning: string) => `Видалити «${title}»?${warning}`,
    deleteReservedWarning: (count: number) =>
      `\n\nЦей подарунок уже забронювали (${count}). Вони отримають сповіщення про видалення.`,
    deleted: (title: string) => `🗑 «${title}» видалено.`,
  },

  guest: {
    listNotFound: "Хм, не знайшов такий список 😕 Може, посилання застаріло?",
    archivedNotice: "\n📦 Список закрито власником — нові бронювання не приймаються.",
    shareThisListPrompt: "Поділитися цим списком:",
    listHeader: (title: string, count: number) => `🎁 ${title} — ${count} бажань`,
    empty: "Тут поки що порожньо 🤷",
  },

  reservation: {
    itemGone: "Цей подарунок уже кудись зник.",
    listClosed: "Цей список закрив власник — бронювання недоступне.",
    alreadyFull: "На жаль, це вже повністю заброньовано 😕",
    askQuantity: "Скільки штук бронюємо?",
    allAvailable: (count: number) => `Усе, що є (${count})`,
    askContact:
      "Щоб захистити список від спаму, поділись, будь ласка, своїм контактом Telegram (це не реєстрація — лише одноразова перевірка, більше не знадобиться).",
    askContactRetry: "Тисни кнопку «📱 Поділитися контактом», щоб продовжити 🙂",
    contactThanks: "Дякую! 💜 Наступні бронювання будуть без цього кроку.",
    summary: (title: string, quantity: number, contact: string) =>
      ["Бронюєш:", "", title, `Кількість: ${quantity}`, `Контакт: ${contact}`].join("\n"),
    confirmed: "✅ Готово, заброньовано! 💜",
    itemGoneAtConfirm: "Ой, цей подарунок уже недоступний.",
    raceLost: "От халепа — цю кількість щойно розібрали. Спробуй менше.",

    noneYet: "У тебе поки немає активних бронювань.",
    yourReservations: (count: number) => `🎁 Твої бронювання (${count})`,
    quantityLine: (quantity: number) => `Кількість: ${quantity}`,
    statusLine: (label: string) => `Статус: ${label}`,

    noLongerActive: "Це бронювання вже неактивне.",
    askNewQuantity: (max: number) => `Скільки штук бронюємо? (максимум ${max})`,
    askQuantityIntegerOnly: "Потрібне ціле число 🙂",
    quantityMinOne: "Має бути хоча б 1.",
    quantityExceedsMax: (max: number) => `Максимум ${max}. Спробуй ще раз.`,
    quantityUpdated: "✅ Кількість оновлено!",

    notFoundAlert: "Бронювання не знайдено",
    notActiveAlert: "Бронювання вже неактивне",
    confirmCancel: (title: string) => `Скасувати бронювання «${title}»?`,
    cancelled: "↩️ Бронювання скасовано.",
    markedPurchased: "✅ Позначено як придбано!",
  },

  subscription: {
    noneYet: "Ти поки ні на що не підписаний(а). Відкрий список за посиланням і тисни «🔔 Підписатися».",
    yourSubscriptions: (count: number) => `🔔 Твої підписки (${count})`,
    archivedSuffix: " (архів)",
    subscribedToast: "Підписано!",
    subscribedMessage: (title: string) => `🔔 Підписку на «${title}» оформлено 💜`,
    unsubscribedToast: "Відписано",
    unsubscribedMessage: "🔕 Підписку скасовано.",
  },

  notify: {
    ownerNewReservationSurprise: (list: string) => `✅ У твоєму вішлісті «${list}» з'явилося нове бронювання 💜`,
    ownerNewReservationOpen: (list: string, item: string, quantity: number, guest: string) =>
      `✅ Нове бронювання у «${list}»\n\n🎁 ${item}\nКількість: ${quantity}\nБронює: ${guest}`,
    ownerCancelledSurprise: (list: string) => `↩️ У «${list}» хтось скасував бронювання.`,
    ownerCancelledOpen: (list: string, item: string) => `↩️ Скасовано бронювання у «${list}»\n\n🎁 ${item}`,
    newItem: (list: string, item: string) => `🔔 У «${list}» з'явилося нове бажання:\n\n${item}`,
    itemAvailableAgain: (list: string, item: string) => `🔔 У «${list}» знову доступний подарунок:\n\n${item}`,
    itemRemoved: (list: string, item: string) =>
      `⚠️ Власник видалив «${item}» зі списку «${list}», де було твоє бронювання. Його скасовано.`,
    listDeleted: (list: string) => `🗑 Власник видалив список «${list}». Твоє бронювання там більше не активне.`,
    listArchived: (list: string) => `📦 Список «${list}» закрито власником. Нові бронювання більше не приймаються.`,
  },
};
