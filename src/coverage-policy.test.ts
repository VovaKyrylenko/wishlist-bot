import { describe, expect, it } from "vitest";
import { missingFiles, policyFiles } from "../vitest.config.js";

// A threshold keyed by a path that no longer exists passes silently in Vitest,
// so a rename would quietly disarm the coverage floor. The config refuses to
// load in that case; this proves the check finds a missing file at all (a guard
// ships with a fixture showing it bites) and that today's list is intact.
describe("coverage policy", () => {
  it("finds a file that does not exist", () => {
    expect(missingFiles(["src/lib/dates.ts", "src/lib/no-such-file.ts"])).toEqual(["src/lib/no-such-file.ts"]);
  });

  it("names only files that exist, and covers the security-relevant ones", () => {
    expect(missingFiles(policyFiles)).toEqual([]);
    expect(policyFiles).toEqual(expect.arrayContaining(["src/lib/access.ts", "src/lib/deeplink.ts", "src/lib/availability.ts"]));
  });
});
