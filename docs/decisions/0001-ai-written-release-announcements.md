# 0001: Release announcements are written by Claude and posted to a Telegram channel

Status: accepted
Date: 2026-09-20

## Context

Every merge to `main` that contains a `feat`, `fix` or `perf` commit becomes a tagged
release. The owner wants a public Telegram channel where each release is announced to the
bot's users, written by an AI from the actual change, with no person in the loop. This is
a personal project with no client to answer to.

The kit's catalog entry T67 says the opposite for client work: post release notes verbatim
and never let a model paraphrase autonomously, because a paraphrase can state something the
notes do not say. That rationale is real; it is weaker here because the audience is the
owner's own users and no contract rides on the wording.

The owner already runs this in production in miss_zakarpattia (`release.yml`,
`announcement-preview.yml`, `scripts/release-notes.mjs`); this project reuses that design
and those secret names rather than inventing a second one.

## Decision

The pipeline is the one from miss_zakarpattia, adapted to a bot:

- `scripts/release/notes.ts` computes the next version from Conventional Commits since the
  last tag (from `package.json` if there is no tag), reads the real diff of the `feat`,
  `fix` and `perf` commits, and asks Claude (`anthropic/claude-sonnet-5` through the Vercel
  AI Gateway) for an English summary for the GitHub Release and up to three Ukrainian
  highlights for the channel.
- A range with only `chore`/`ci`/`docs`/`test` commits produces no release and no post.
- `.github/workflows/kit-release.yml` tags, publishes the release and posts the announcement
  with the Telegram Bot API in HTML mode. `announcement-preview.yml` renders the exact text
  into the job summary on every pull request, so it can be read before merging.
- Secrets, named exactly as in miss_zakarpattia: `AI_GATEWAY_API_KEY`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`. Without the Telegram secrets the release happens and the post is
  skipped with a notice.

What is decided by code, not by the model (this is what makes an unattended post safe enough):

- The place in the bot each highlight points to is chosen from a closed menu derived from the
  files the commit changed (`scripts/release/areas.ts`); the model picks an id and cannot
  invent one.
- Escaping and assembly (`scripts/release/message.ts`), the 4096-character limit, and the
  version number.
- A vocabulary check: every highlight is dropped if it uses a word `.claude/rules/voice.md`
  bans, and the final text is withheld if any survives. When nothing usable is left the post
  is a neutral "the bot was updated" line with the release link.
- The model's JSON is parsed defensively; anything that does not match the asked shape is
  discarded.

## Differences from miss_zakarpattia

- Tone is «ти» and the bot's vocabulary, not «ви» for a team; readers are the bot's users.
- A release the model judges to have nothing user-visible is tagged but not posted. The
  pageant team wants to hear about every release; the users of a bot do not.
- Places are described as taps in the chat ("🏠 Головна › Мій список"), not as URLs.
- The model is called with plain `fetch` on the AI Gateway's OpenAI-compatible endpoint,
  not the `ai` SDK with `zod`: two dependencies are not worth it for a CI-only script.
- GitHub-hosted runner (`ubuntu-latest`), as the rest of this repository's CI.

## Alternatives considered

- **Post the generated release notes verbatim (T67).** Accurate, but they are commit
  subjects: English and technical, exactly what the product's vocabulary rules forbid users
  from seeing.
- **Draft with AI, a human approves before posting.** Removes the accepted risk below, at
  the cost of a step the owner does not want to do per release. The preview workflow already
  gives a read-before-merge without blocking anything.

## Consequences

- Users hear about changes in the bot's own voice without anyone writing it.
- **Accepted risk:** the model may still mislead within the allowed vocabulary (overstate a
  fix, describe a change as more visible than it is). The banned-word check, the closed menu
  and the release link reduce this; they do not remove it. Revisit if a wrong announcement
  is ever posted.
- **Unverified against the real service:** the gateway call was tested against a local
  stand-in, not against the live gateway or Telegram, because no key and no channel existed
  when this was written. The first real post is the first real test; use the preview
  workflow (`workflow_dispatch` with a past range) to rehearse it.
- Each release costs two model calls.
- Squash-merge PR titles and their `feat`/`fix` prefixes are the raw material: a vague or
  mistyped title gives a vague or missing announcement.

## Supersedes

## Superseded by
