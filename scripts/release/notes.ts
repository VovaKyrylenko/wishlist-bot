// Computes the next version and prepares the release notes and the Telegram
// announcement from the conventional commits between the last tag and HEAD.
//
// Run by .github/workflows/kit-release.yml on every push to main, and by
// announcement-preview.yml on pull requests (which only render, never publish).
// It follows the pipeline of miss_zakarpattia's release-notes.mjs: the announcement is
// written from the real diff, and everything the reader can be misled by (places in the
// bot, escaping, vocabulary) is decided by code rather than by the model.
//
// Local dry run, prints every output instead of writing GITHUB_OUTPUT:
//   AI_GATEWAY_API_KEY=... pnpm exec tsx scripts/release/notes.ts
// Rehearse against an already-released range:
//   RELEASE_RANGE=v1.0.0..v1.1.0 AI_GATEWAY_API_KEY=... pnpm exec tsx scripts/release/notes.ts
//
// The model is called over the AI Gateway's OpenAI-compatible REST endpoint with plain
// fetch: a CI-only script is not worth two new dependencies (`ai`, `zod`) in a bot that
// deploys as a serverless function.

import { execSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { areasForFiles, type AreaCandidate } from "./areas.js";
import { telegramMessage, vetHighlights, bannedWord, type Highlight } from "./message.js";

const SKIP_TYPES = new Set(["chore", "ci", "docs", "test", "style", "build"]);
const TYPE_LABELS = { feat: "✨ New", fix: "🐛 Fixes", perf: "⚡ Performance" } as const;

const MODEL = "anthropic/claude-sonnet-5";
const GATEWAY = process.env.AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1";

// Only user-facing code is worth showing the model. src/text.ts goes first: it holds
// every label and message a person reads, so if the budget runs out it should cut
// helpers, not the copy the steps quote.
const DIFF_PATH_GROUPS = [
  ["src/text.ts", "src/features"],
  ["src/lib", "api"],
];
const DIFF_BUDGET_TOTAL = 60_000;
const DIFF_BUDGET_PER_COMMIT = 24_000;
const MAX_FILES_LISTED = 25;

interface Commit {
  hash: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  desc: string;
  body: string;
  files: string[];
  diff: string;
}

function sh(cmd: string): string {
  // Diffs comfortably exceed execSync's 1MB default buffer.
  return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function latestTag(): string | null {
  try {
    return sh("git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*'");
  } catch {
    return null;
  }
}

function parseSubject(subject: string) {
  const m = subject.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!m) return { type: "other", scope: null, breaking: false, desc: subject };
  return { type: m[1], scope: m[3] ?? null, breaking: Boolean(m[4]), desc: m[5] };
}

function bump(tag: string, kind: "major" | "minor" | "patch"): string {
  const [maj, min, pat] = tag.replace(/^v/, "").split(".").map(Number);
  if (kind === "major") return `v${maj + 1}.0.0`;
  if (kind === "minor") return `v${maj}.${min + 1}.0`;
  return `v${maj}.${min}.${pat + 1}`;
}

function section(title: string, items: Commit[]): string {
  if (items.length === 0) return "";
  const lines = items.map((c) => `- ${c.scope ? `**${c.scope}:** ` : ""}${c.desc}`);
  return `### ${title}\n${lines.join("\n")}\n`;
}

function setOutput(name: string, value: string): void {
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`\n--- ${name} ---\n${value}`);
    return;
  }
  const delimiter = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function collectCommits(range: string): Commit[] {
  const raw = sh(`git log ${range} --no-merges --pretty=format:%H%x1f%s%x1f%b%x1e`);
  const records = raw.split("\x1e").map((r) => r.trim()).filter(Boolean);
  return records.map((record) => {
    const [hash, subject, body = ""] = record.split("\x1f");
    const files = sh(`git show --no-renames --name-only --pretty=format: ${hash}`)
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    return { hash, body: body.trim(), files, diff: "", ...parseSubject(subject) };
  });
}

function commitDiff(hash: string, cap: number): string {
  let diff = "";
  for (const paths of DIFF_PATH_GROUPS) {
    if (diff.length >= cap) break;
    try {
      const part = sh(`git show ${hash} --unified=1 --no-color --no-renames --pretty=format: -- ${paths.join(" ")}`);
      if (part) diff += `${part}\n`;
    } catch {
      // A group that cannot be read must not cost the ones that can.
    }
  }
  return diff.length <= cap ? diff.trim() : `${diff.slice(0, cap)}\n... [diff truncated]`;
}

/** Shares one budget across the announced commits so a sprawling change cannot crowd the rest out. */
function attachDiffs(commits: Commit[]): void {
  const perCommit = Math.max(2000, Math.floor(DIFF_BUDGET_TOTAL / Math.max(commits.length, 1)));
  let remaining = DIFF_BUDGET_TOTAL;
  for (const commit of commits) {
    const cap = Math.min(perCommit, DIFF_BUDGET_PER_COMMIT, remaining);
    commit.diff = cap > 0 ? commitDiff(commit.hash, cap) : "";
    remaining -= commit.diff.length;
  }
}

function changeContext(commit: Commit): string {
  const areas = areasForFiles(commit.files, 5);
  const listed = commit.files.slice(0, MAX_FILES_LISTED);
  const overflow = commit.files.length - listed.length;
  return [
    `## ${commit.type}${commit.scope ? `(${commit.scope})` : ""}: ${commit.desc}`,
    commit.body ? `Commit notes: ${commit.body.slice(0, 600)}` : "",
    areas.length ? `Parts of the bot affected: ${areas.map((a) => `${a.label} (${a.path})`).join("; ")}` : "",
    `Files (${commit.files.length}): ${listed.join(", ")}${overflow > 0 ? `, +${overflow} more` : ""}`,
    commit.diff ? `Diff:\n${commit.diff}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function chat(system: string, user: string, maxTokens: number): Promise<string> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not set");
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI Gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

const SHARED_RULES =
  "You are given the real diff of each change. Read it and describe only what a person " +
  "using the bot would actually notice — a new button, a message that now says something " +
  "clearer, a step that stops losing what they typed. Ignore refactors, renames, types " +
  "and tests. Never mention file names, folders, function names, URLs or commit hashes. " +
  "Never invent anything the diff does not show.";

async function englishSummary(context: string, commits: Commit[]): Promise<string> {
  const fallback =
    "A new update has shipped with improvements:\n" + commits.map((c) => `— ${c.desc}`).join("\n");
  try {
    const text = await chat(
      "You write short, warm update announcements for the GitHub Release page of a Telegram " +
        "bot that helps people make gift lists and share them with friends. 3-6 sentences of " +
        "plain prose, no headings or bullet lists. Avoid dry technical jargon. " +
        SHARED_RULES,
      `Changes in this release:\n\n${context}\n\nWrite a short, friendly announcement.`,
      500,
    );
    return text || fallback;
  } catch (error) {
    console.error("[release-notes] summary failed, using fallback:", error);
    return fallback;
  }
}

const HIGHLIGHTS_SYSTEM =
  "Ти пишеш анонси оновлень Telegram-бота, у якому люди складають списки бажань і діляться " +
  "ними з друзями, щоб ніхто не подарував одне й те саме. Читачі — звичайні люди, серед " +
  "них літні: вони не знають, як бот влаштований. Тон теплий, як у доброго друга, " +
  "українською, на «ти». Максимум один жарт чи теплий штрих на весь текст, без емодзі 💜 " +
  "(заголовок його вже має). Жодного технічного жаргону (не кажи «рефактор», «API», " +
  "«коміт», «деплой», «баг», «фікс»). " +
  SHARED_RULES +
  " Слова, якими користуєшся: «список» (або «список бажань»), «подарунок», «Я подарую», " +
  "«обіцянка», «куплено», «співавтор», «режим сюрпризу», «стежити». Ніколи не вживай: " +
  "вішліст, бажання (про окремий подарунок), бронювання, забронювати, придбано, підписка, " +
  "редактор, архів, ротація, пріоритет. " +
  "Пиши як коротку інструкцію для людини, яка вперше чує про цю зміну й має нею " +
  "скористатися сьогодні: спершу поясни, як було раніше і чому це було незручно, потім " +
  "проведи покроково до результату. Шлях до потрібного місця підставляється автоматично " +
  "першим пунктом — не дублюй його, починай одразу з першої дії. Назви кнопок і полів " +
  "бери дослівно з діфу, особливо з src/text.ts; не вигадуй назв, яких там немає — краще " +
  "опиши крок без назви. Кожен пункт — одна зміна, яку людина побачить своїми очима. Якщо " +
  "зміну людина не помітить — не додавай пункт узагалі: краще один корисний пункт, ніж " +
  "перелік усього. Кілька дрібних правок одного екрана — один пункт. Дрібне виправлення, " +
  "до якого нема що тикати, лишай без кроків. areaId обирай ЛИШЕ зі списку кандидатів і " +
  "лише те місце, де людина реально побачить цю зміну; якщо жодне не підходить — null.\n\n" +
  "Відповідай ЛИШЕ одним JSON-об'єктом, без пояснень і без markdown-огорожі, такого вигляду:\n" +
  '{"items":[{"title":"до 70 символів, без крапки","context":"2-4 речення: як було й що ' +
  'тепер","steps":["3-7 кроків усередині екрана, або порожній масив"],"undo":"як скасувати, ' +
  'або null","areaId":"s1 або null"}]}\n' +
  "Максимум 3 пункти, найважливіший першим. Порожній масив items означає, що людина нічого " +
  "не помітить.";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Model output is untrusted: accept only the shape we asked for, drop the rest. */
export function parseHighlights(raw: string): Highlight[] {
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(json);
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error("no items array in model answer");
  return items
    .map((item): Highlight => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        title: asString(o.title).slice(0, 120),
        context: asString(o.context),
        steps: Array.isArray(o.steps) ? o.steps.map(asString).filter(Boolean).slice(0, 7) : [],
        undo: asString(o.undo) || null,
        areaId: asString(o.areaId) || null,
      };
    })
    .filter((item) => item.title)
    .slice(0, 3);
}

type Announcement = { kind: "highlights"; items: Highlight[] } | { kind: "nothing-visible" } | { kind: "fallback" };

async function telegramHighlights(context: string, areas: AreaCandidate[]): Promise<Announcement> {
  const menu =
    areas.length > 0
      ? areas.map((a) => `${a.id} — ${a.label} (${a.path})`).join("\n")
      : "(жодного — ці зміни не мають видимого місця, став areaId: null)";
  try {
    const raw = await chat(
      HIGHLIGHTS_SYSTEM,
      `Зміни цього релізу:\n\n${context}\n\nМісця, які можна вказати:\n${menu}\n\nСклади пункти анонсу.`,
      6000,
    );
    const items = parseHighlights(raw);
    if (items.length === 0) {
      console.log("[release-notes] Model found nothing user-visible in this release.");
      return { kind: "nothing-visible" };
    }
    const { kept, dropped } = vetHighlights(items);
    for (const d of dropped) console.warn(`[release-notes] dropped highlight ${d}`);
    return kept.length > 0 ? { kind: "highlights", items: kept } : { kind: "fallback" };
  } catch (error) {
    console.error("[release-notes] highlights failed, using fallback:", error);
    return { kind: "fallback" };
  }
}

async function main(): Promise<void> {
  const tag = latestTag();
  const range = process.env.RELEASE_RANGE || (tag ? `${tag}..HEAD` : "HEAD");
  const commits = collectCommits(range);

  const feats = commits.filter((c) => c.type === "feat");
  const fixes = commits.filter((c) => c.type === "fix");
  const perf = commits.filter((c) => c.type === "perf");
  const others = commits.filter((c) => !SKIP_TYPES.has(c.type) && !["feat", "fix", "perf"].includes(c.type));

  // Skipping keeps the channel quiet: chore/ci/docs commits are not news to its readers.
  const notable = [...feats, ...fixes, ...perf];
  if (notable.length === 0) {
    console.log("[release-notes] No feat/fix/perf commits since last tag — skipping release.");
    setOutput("skip", "true");
    return;
  }

  // "BREAKING CHANGE:" lives by convention in the body/footer, not the subject.
  const breaking = commits.some((c) => c.breaking || c.body.includes("BREAKING CHANGE"));
  let nextVersion: string;
  if (!tag) {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    nextVersion = `v${pkg.version}`;
  } else {
    nextVersion = bump(tag, breaking ? "major" : feats.length > 0 ? "minor" : "patch");
  }

  const technicalNotes = [
    section(TYPE_LABELS.feat, feats),
    section(TYPE_LABELS.fix, fixes),
    section(TYPE_LABELS.perf, perf),
    others.length
      ? `<details>\n<summary>⚙️ Technical changes</summary>\n\n${others.map((c) => `- ${c.type}: ${c.desc}`).join("\n")}\n\n</details>\n`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  attachDiffs(notable);
  const context = notable.map(changeContext).join("\n\n");
  const areas = areasForFiles(notable.flatMap((c) => c.files), 12);
  const [friendlyNotes, announcement] = await Promise.all([
    englishSummary(context, notable),
    telegramHighlights(context, areas),
  ]);

  const repo = process.env.GITHUB_REPOSITORY ?? "VovaKyrylenko/wishlist-bot";
  const releaseUrl = `https://github.com/${repo}/releases/tag/${nextVersion}`;

  // Unlike the pageant team, the channel's readers use the bot and not the code: a
  // release with nothing they can see is not posted, though it is still tagged.
  const highlights: Highlight[] =
    announcement.kind === "highlights"
      ? announcement.items
      : [
          {
            title: "Бот оновився",
            context: "Подробиці змін — за посиланням нижче.",
            steps: [],
            undo: null,
            areaId: null,
          },
        ];
  const telegramText = telegramMessage({ version: nextVersion, highlights, areas, releaseUrl });

  // Last line of defence: whatever path produced the text, it never leaves with banned vocabulary.
  const banned = bannedWord(telegramText);
  const announce = announcement.kind !== "nothing-visible" && !banned;
  if (banned) console.warn(`[release-notes] announcement withheld: contains "${banned}"`);

  setOutput("skip", "false");
  setOutput("version", nextVersion);
  setOutput("announce", announce ? "true" : "false");
  setOutput("technical_notes", technicalNotes);
  setOutput("friendly_notes", friendlyNotes);
  setOutput("telegram_text", telegramText);
}

// Import-safe so the parsing and vetting can be exercised without touching git or the network.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error("[release-notes] fatal:", error);
    process.exit(1);
  });
}
