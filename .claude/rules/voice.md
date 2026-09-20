---
paths:
  - "src/**"
  - "api/**"
  - "scripts/flows/**"
  - "docs/**"
---

# Product voice — everything a user of the bot reads

The redesign (`docs/UX-REDESIGN.md` §8.3) removed every word a person has to learn. They do
not come back, not even in comments about user-facing text. One test decides any new
term: **would a grandmother understand it?** If not, replace it. (Constraint C1.)

## Vocabulary — mandatory

| Never | Always | Why |
|---|---|---|
| вішліст | **список** (in headings: «список бажань») | anglicism; an older person does not know it |
| бажання, item | **подарунок** | guest and owner speak one word |
| бронювання, забронювати | **«Я подарую»** (action), **обіцянка** (thing) | «бронь» is hotel language |
| придбано | **куплено** | shorter, spoken |
| Мої бронювання | **🎗 Я дарую** | the section is named by intent, not mechanics |
| Чужі списки | **Списки друзів** | «чужі» sounds distant |
| підписка, підписатися | **стежити 🔔 / не стежити** | a verb is clearer than a noun |
| редактор | **співавтор** | «редактор» is a profession, «співавтор» is a relationship |
| архів, архівувати | **завершити список**, «Завершені» | the event has passed; it was not "filed away" |
| приватність, режим | **режим сюрпризу: увімкнено/вимкнено** | one switch instead of two "modes" |
| ротація посилання | **закрити старе посилання** | describes the consequence |
| пріоритет | **«Дуже хочу / Хочу / Було б приємно»** | the technical label is gone |

## Text rules (UX-REDESIGN §14)

1. First line is the point. Everything critical sits in the first 40 characters.
2. A button names its result: «Так, відпустити подарунок», never «ОК». At most 24 characters, a verb.
3. One message, one thought. Over 6 lines: split or shorten.
4. **No jokes and no 💜 in errors and confirmations.** Warmth stays, but not when someone is losing something.
5. Consequence before action: a confirmation says what changes and for whom.
6. Numbers and dates the human way: «через 5 днів», «завтра», never «2026-08-15».
7. Status is an icon **and** a word together («✅ вже дарують»), never an emoji alone.

## Tone: «Дружній друзяка»

The bot writes like a good friend helping organise gifts — not an official service, not a
stand-up comedian.

- Address the user as «ти». No «Ви», no bureaucratese.
- Warm but short: one joke or warm touch per message, two at most. Humour never hides the point or slows the user down.
- Direct. «Готово!», not «Операцію виконано успішно». «Не знайшов такий список 😕», not «Даний елемент не знайдено».
- Empathy in errors: admit it like a person («Хм, не знайшов…») and never blame the user.

| Neutral | Friendly |
|---|---|
| Список не знайдено. Можливо, посилання застаріло. | Хм, не знайшов такий список 😕 Може, посилання застаріло? |
| ✅ Додано «Sony WH-1000XM6» до списку. | ✅ Додав «Sony WH-1000XM6» до списку. Гарний вибір! 💜 |

## Visual style: purple + hearts + dots

- **💜 is the brand accent**: greetings, warm confirmations, goodbyes. At most once per message.
- **🟣 marks a list item or a highlighted statistic**, instead of a bare dash.
- **✨ is a "something new" moment**: list created, first gift added, list copied.
- **Functional emoji stay untouched**: ✅ 🗑 📅 🔗 🔔 🔕 ⚙️ 🏁 🎁 ⚠️ ↩️ 🔥 💭 🤫 🤝 🎗 💨 carry a specific meaning. Style emoji (💜 🟣 ✨) are added on top of them, never instead.
- **Priority «Хочу» has no icon.** It is the default nobody chose; an icon would sit on every row and 🔥 would have nothing to stand out against.
- **Buttons are the exception**: short and functional, no decorative emoji. People scan buttons in a fraction of a second.
- Do not overload. A short message (alert, one-line confirmation) gets one emoji in total.

## People's names — nominative only

Ukrainian would want the genitive («список **Марти**»), but a name is exactly where the naive
rule fails: «Марта» → «Марти», «Ілля» → «Іллі», «Дмитро» → «Дмитра», and then the exceptions
begin. A wrong form of someone's name hurts more than a slightly dry construction, so build
the sentence so the name stays as it is.

| ✗ | ✓ |
|---|---|
| `Список бажань Марта` | `🎂 День народження` / `Список бажань · Марта` |
| `Список Марта › Навушники` | `🎂 День народження › Навушники` |

Where the name naturally stands in the nominative it is used freely: «Марта не побачить, що саме ти вибрав 🤫».

## Where it lives in code

All bot copy is in `src/text.ts`, the single source of truth for every message a user sees.
Change tone or style there only; `src/features/*` contains no text literals (constraint C2).
Word lists that match incoming input (small talk in `src/features/entry.ts`) are data, not copy.

Success, error and undo are **not separate messages**. They are the `notice` line of the
screen that is shown anyway (`ScreenOptions` in `src/features/home.ts`), with the next-step
buttons underneath. Do not write toast-style texts.
