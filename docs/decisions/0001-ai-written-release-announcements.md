# 0001: Release announcements are written by Claude and posted to a Telegram channel

Status: accepted
Date: 2026-09-20

## Context

Every merge to `main` becomes a tagged release (`.github/workflows/kit-release.yml`,
computed from Conventional Commits). The owner wants a public Telegram channel where each
release is announced to the bot's users, written by an AI from the release notes, without
a person in the loop. This is a personal project with no client to answer to.

The kit's catalog entry T67 says the opposite for client work: post release notes verbatim
and never let a model paraphrase autonomously, because a paraphrase can state something the
notes do not say. That rationale is real; it is weaker here because the audience is the
owner's own users and no contract rides on the wording.

## Decision

After a release is created, `scripts/announce-release.ts` asks Claude to write 2-5 short
Ukrainian lines from the generated release notes and posts them, plus a link to the release,
to the channel named by `ANNOUNCE_CHAT_ID`. The mitigations below are part of the decision,
not extras:

- The prompt allows only facts present in the notes, forbids internal changes, and asks for
  the exact answer `SKIP` when nothing is visible to a user.
- The text must pass a code check before posting: not empty, at most 1200 characters, and
  none of the vocabulary banned by `.claude/rules/voice.md`. Failing any check means no
  post, never a retry with a weaker rule.
- The post always links to the release notes, so a reader can check the AI's wording.
- The first release ever is not announced (its notes are the whole history).
- Missing secrets or any error in this step end as a warning; the release stays valid.
- Secrets: `ANTHROPIC_API_KEY`, `ANNOUNCE_BOT_TOKEN`, `ANNOUNCE_CHAT_ID`, set by the owner
  in the repository settings. Repository variable `ANNOUNCE_DRY_RUN=1` logs the text
  instead of posting it.

## Alternatives considered

- **Post the generated release notes verbatim (T67).** Accurate, but they are commit
  subjects: English and technical, exactly what the product's vocabulary rules forbid users
  from seeing.
- **Draft with AI, a human approves before posting.** Removes the accepted risk below, at
  the cost of a step the owner does not want to do per release. Available later by
  running the workflow with `ANNOUNCE_DRY_RUN=1` and posting by hand.

## Consequences

- Users hear about changes in the bot's own voice without anyone writing it.
- **Accepted risk:** the model may still mislead within the allowed vocabulary (overstate a
  fix, describe a change as more visible than it is). The banned-word check and the release
  link reduce this; they do not remove it. Revisit if a wrong announcement is ever posted.
- Each release costs one small model call.
- Squash-merge PR titles are the raw material: a vague title gives a vague announcement.

## Supersedes

## Superseded by
