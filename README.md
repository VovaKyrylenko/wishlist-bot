# Wishlist Bot

[![CI](https://github.com/VovaKyrylenko/wishlist-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/VovaKyrylenko/wishlist-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Максимально простий Telegram-бот для створення та поширення вішлістів. Жодної реєстрації, окремого сайту чи складного інтерфейсу — усе відбувається прямо в Telegram.

## Стек

- **Node.js + TypeScript** (без фреймворку)
- **[grammY](https://grammy.dev)** — Telegram Bot API, включно з `@grammyjs/conversations` для покрокових діалогів (створення списку, додавання товару, бронювання тощо)
- **Prisma 7 + Neon Postgres** — дані та стан розмов/сесій (щоб bot переживав холодні старти serverless-функції)
- **Vercel** — деплой вебхука як serverless-функції (`api/webhook.ts`)

## Структура проєкту

```
api/webhook.ts          Vercel serverless-функція — приймає Telegram-вебхук
prisma/schema.prisma     Модель даних (User, Wishlist, WishlistItem, Reservation, Subscription, ...)
src/bot.ts               Збірка grammY Bot: сесії, conversations, реєстрація фіч
src/context.ts           Типи контексту/сесії
src/db.ts                Prisma-клієнт (Neon driver adapter)
src/lib/                 Утиліти: доступ до вішліста, форматування, deep links, OG-скрапінг, сповіщення
src/features/
  menu.ts                Головне меню, /start, обробка deep-link payload
  wishlists.ts           Створення/список/налаштування/архів/копія/редактори вішліста
  items.ts               Додавання (посилання/вручну), редагування, пріоритет, кількість, порядок, видалення
  guest.ts                Перегляд списку гостем + фільтри
  reservations.ts         Бронювання, «Мої бронювання», скасування/зміна кількості
  subscriptions.ts        Підписки на оновлення списку
scripts/
  dev-polling.ts         Локальний запуск через long polling (без вебхука)
  set-webhook.ts         Реєструє вебхук на задеплоєному URL
  delete-webhook.ts      Знімає вебхук (щоб повернутись до polling)
```

## Налаштування

### 1. Створіть бота у BotFather

У Telegram напишіть [@BotFather](https://t.me/BotFather) → `/newbot`, дайте ім'я та юзернейм. Скопіюйте виданий токен.

### 2. Змінні середовища

Скопіюйте `.env.example` → `.env` (для локальної розробки) і заповніть:

```
BOT_TOKEN=       # токен з BotFather
WEBHOOK_SECRET=  # будь-який випадковий рядок — захищає /api/webhook від чужих запитів
WEBHOOK_URL=     # https://<ваш-проєкт>.vercel.app/api/webhook (потрібен лише для set-webhook)
DATABASE_URL=            # Neon, пул-з'єднання
DATABASE_URL_UNPOOLED=   # Neon, пряме з'єднання (для міграцій)
```

`DATABASE_URL` / `DATABASE_URL_UNPOOLED` уже підтягнуті автоматично, якщо проєкт залінкований з Vercel і підключена інтеграція Neon (`vercel env pull .env.local`, потім скопіюйте в `.env`).

### 3. Встановлення та база даних

```bash
npm install                # також запускає prisma generate (postinstall)
npm run prisma:migrate     # застосувати схему до Neon (лише при першому запуску / зміні schema.prisma)
```

### 4. Локальний запуск (long polling, без деплою)

```bash
npm run dev
```

Це найпростіший спосіб перевірити бота — жодного публічного URL не потрібно. Скрипт сам знімає вебхук перед стартом polling.

### 5. Продакшн-деплой на Vercel (вебхук)

```bash
vercel deploy --prod
```

Переконайтесь, що `BOT_TOKEN`, `WEBHOOK_SECRET`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED` додані в Vercel (Project Settings → Environment Variables — Neon-змінні вже мають бути там після підключення інтеграції).

Після деплою зареєструйте вебхук (один раз, або щоразу як змінюється домен):

```bash
WEBHOOK_URL=https://<ваш-проєкт>.vercel.app/api/webhook npm run webhook:set
```

Щоб повернутись до локального polling пізніше — `npm run webhook:delete`.

## Основний сценарій

1. Власник натискає «➕ Створити вішліст», вводить назву (опис/дату/приватність — опційно).
2. Надсилає посилання на товар — бот сам витягує назву/фото/ціну, або тисне «✍️ Ввести вручну».
3. Бот генерує посилання виду `https://t.me/<bot>?start=list_<slug>`.
4. Власник ділиться посиланням із друзями.
5. Гість відкриває список, тисне «🎁 Забронювати», обирає кількість.
6. Якщо це перше бронювання гостя — одноразовий антиспам-крок: поділитися контактом Telegram (не реєстрація, лише захист від ботів).
7. Після підтвердження товар стає частково/повністю недоступним, власник отримує сповіщення (деталі — залежно від режиму приватності: «Сюрприз» чи «Відкритий»).
8. Гість може будь-коли скасувати чи змінити бронювання в розділі «🎁 Мої бронювання».

## Нотатки з архітектури

- **Сесії та conversations зберігаються в Postgres** (`BotSession` модель) — це обов'язково для вебхука на Vercel, бо кожен виклик функції може потрапити на новий, «холодний» інстанс без пам'яті попередніх кроків діалогу.
- **Antispam-бронювання**: перше бронювання кожного гостя вимагає поділитися контактом Telegram через нативну кнопку `request_contact` — це неможливо підробити без реального акаунта, тому працює як легкий бар'єр проти масового спам-бронювання без повної реєстрації. Наступні бронювання цього гостя проходять без цього кроку.
- **Приватність бронювань** (`privacyMode` на вішлісті): `SURPRISE` — власник бачить лише агреговану кількість заброньованого; `OPEN` — власник бачить, хто і що саме забронював.

## Contributing

PR та issues вітаються — див. [CONTRIBUTING.md](CONTRIBUTING.md) для налаштування середовища, стилю коду та того, які зміни відповідають філософії проєкту. Учасники мають дотримуватись [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Про вразливості безпеки — див. [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
