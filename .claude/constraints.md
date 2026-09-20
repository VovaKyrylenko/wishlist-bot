# Constraints

What the owner decided. Verbatim, not summarised.

The design cycle quotes this file into every agent prompt unchanged, and no agent may
close an objection by changing an entry here — an agent that thinks a constraint has to
give says so and escalates. Only the owner edits this file.

Each entry: an id that never changes, where it came from, the date, the answer in the
owner's own words, and the **knock-ons** — what this rules out elsewhere. The knock-ons
are the working half. "The repository is private" is a fact; "so GitHub Pages is
unavailable on the Free plan" is the part that stops a week of work being built on it.

> **Proxy-owner notice (2026-09-20).** No owner was available during onboarding. Every
> entry below is quoted from a document the owner wrote (`CLAUDE.md`, `README.md`), not
> from an interview. Any later "the owner decided" resting on this file carries that
> asterisk until the owner confirms or edits it.

- **C1** (CLAUDE.md, 2026-09-20) — "Перевірка на новий термін одна: **зрозуміє бабуся?** Не пройшов — заміняй." The banned vocabulary (вішліст, бажання/item, бронювання, підписка, редактор, архів, приватність/режим, пріоритет…) does not come back, "навіть у коментарях до користувацьких текстів".
  Knock-ons: a screen, button or notice that introduces a term a grandmother would have to learn is rejected by the design cycle regardless of how clean the code is; the GitHub description and package.json still say «вішлістів» and are in breach.

- **C2** (CLAUDE.md, 2026-09-20) — "Усі тексти бота централізовані в src/text.ts — єдине джерело правди для будь-якого повідомлення, яке бачить користувач… логіка у src/features/* не повинна містити текстових літералів."
  Knock-ons: copy changes touch only `src/text.ts`; success, error and undo are a `notice` line on the screen that is shown anyway, never a separate toast-style message. Input-matching word lists (e.g. small-talk detection in `src/features/entry.ts`) are data, not shown copy.

- **C3** (README.md, 2026-09-20) — "Жодної реєстрації, окремого сайту чи складного інтерфейсу — усе відбувається прямо в переписці."
  Knock-ons: no web UI, no accounts or passwords, no settings screens that need explaining. This is why the browser-UI catalog entries (`web` scope) are absent rather than violated, and why a hosted admin page would need an owner decision, not a design-cycle one.

- **C4** (README.md, 2026-09-20) — "Ввід завжди валідний. Посилання, фото чи назва, надіслані будь-де й будь-коли, — це «додати подарунок». Бот ніколи не мовчить."
  Knock-ons: input validation may never end in silence or a dead-end error; a stricter parser must degrade to a friendly question, and any "reject" path is a design-cycle blocker.

## Appended later

A constraint discovered mid-flight gets the next id, its own date, and a note on what
surfaced it. Never rewrite an old entry to match a new understanding: the current round
restarts against the updated file, and the history of what was believed when is what makes
a later decision auditable.
