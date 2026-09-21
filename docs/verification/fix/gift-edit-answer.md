# Verification — fix/gift-edit-answer

## Run 1 — saved-gift edits reach the database (2026-09-21)

VERDICT: PASS
CLAIM:   Editing any text field of a saved gift (✏️ Змінити → Назва / Ціна / Посилання / Магазин / Коментар / Кількість) saves it, and the list screen shows the new name afterwards.
METHOD:  `scripts/flows/run.ts` (the `verify:flows` suite) with a new S4 block that edits all six text fields and reopens the list. No staging database is configured, so the suite ran against a throwaway Postgres 16 in docker behind `ghcr.io/neondatabase/wsproxy`, with `neonConfig` pointed at the proxy by a preload script outside the repository. Database name `wishlist_staging`, migrations applied with `prisma migrate deploy`.
STEPS:
  1. Suite on the branch without the fix
     -> 12 failures: every field stayed unchanged, and after each answer the owner saw Головна with "Цей список більше не існує — власник його видалив."
  2. Suite with the fix in `applyListAnswer`
     -> all checks pass, both suites (`✅ Усі перевірки пройдено`).
  3. `tsc --noEmit`, `eslint .` (pre-commit hook)
     -> clean.
EVIDENCE: outputs above.
FINDINGS: Root cause: `applyListAnswer` runs before `applyGiftAnswer` and claimed every pending question that carried an id, reading the gift id of `gift.*` as a list id. A photo sent with a caption as the new gift photo was lost the same way; a photo without a caption was not affected. Not run against the real Neon staging database or Telegram.
