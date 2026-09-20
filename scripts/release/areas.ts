// Maps the files a commit touched to the part of the bot a person would see change.
//
// The bot has no URLs to point at, so where the announcement in miss_zakarpattia links
// to a page, this one names a place in the chat: the path of buttons a user taps. The
// model is offered these as a closed menu and picks by id, so it can only ever point
// at a place the code already derived from a changed file; it cannot invent one.

export interface Area {
  label: string;
  /** What the user actually taps or sends, written in the bot's own words. */
  path: string;
}

export interface AreaCandidate extends Area {
  id: string;
}

const RULES: { test: RegExp; area: Area }[] = [
  { test: /^src\/features\/home\.ts$/, area: { label: "Головна, списки друзів, завершені", path: "🏠 Головна" } },
  { test: /^src\/features\/lists\.ts$/, area: { label: "Мій список: поширення, співавтори, завершення", path: "🏠 Головна › Мій список" } },
  { test: /^src\/features\/gifts\.ts$/, area: { label: "Екран подарунка", path: "🏠 Головна › Мій список › подарунок" } },
  { test: /^src\/features\/entry\.ts$/, area: { label: "Додавання подарунка (посилання, фото, назва)", path: "Надішли боту посилання, фото або назву" } },
  { test: /^src\/features\/showcase\.ts$/, area: { label: "Список, яким з тобою поділився друг", path: "Посилання на список від друга" } },
  { test: /^src\/features\/promises\.ts$/, area: { label: "Обіцянки подарунків", path: "🏠 Головна › 🎗 Я дарую" } },
  { test: /^src\/lib\/(scrape|price|availability)\.ts$/, area: { label: "Додавання подарунка за посиланням на товар", path: "Надішли боту посилання на товар" } },
  { test: /^src\/lib\/drafts\.ts$/, area: { label: "Незавершений подарунок", path: "Надішли боту посилання, фото або назву" } },
  { test: /^(src\/lib\/notify\.ts|api\/cron\.ts)$/, area: { label: "Сповіщення й дайджест", path: "Приходить у чат від бота" } },
];

/** Areas touched by the files, most-touched first, at most `limit`, with stable ids. */
export function areasForFiles(files: string[], limit: number): AreaCandidate[] {
  const counts = new Map<Area, number>();
  for (const file of files) {
    const rule = RULES.find((r) => r.test.test(file));
    if (rule) counts.set(rule.area, (counts.get(rule.area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([area], index) => ({ ...area, id: `s${index + 1}` }));
}
