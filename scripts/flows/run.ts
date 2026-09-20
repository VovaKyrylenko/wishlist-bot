// Exercises the bot end to end against a staging database.
//
//   DATABASE_URL=<staging> pnpm run verify:flows
//
// Nothing reaches Telegram: every outgoing API call is intercepted in
// scripts/flows/harness.ts. The database, however, is real and gets wiped
// between suites, so the harness refuses to start unless the connection points
// at a database whose name contains "staging".

import "dotenv/config";
import { failures, prisma } from "./harness.js";
import { run as core } from "./core.js";
import { run as edges } from "./edges.js";

const suites: [string, () => Promise<void>][] = [
  ["Критичний шлях", core],
  ["Небезпечні дії та відновлення", edges],
];

try {
  for (const [name, suite] of suites) {
    console.log(`\n\n╔══════════════════════════════════════════════════════════╗`);
    console.log(`║  ${name}`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);
    await suite();
  }
} finally {
  await prisma.$disconnect();
}

if (failures.length > 0) {
  console.log(`\n❌ Провалено ${failures.length}:\n  · ${failures.join("\n  · ")}`);
  process.exit(1);
}
console.log("\n✅ Усі перевірки пройдено");
