import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Wishlist, WishlistEditor } from "../../generated/prisma/client.js";
import type { MyContext } from "../context.js";
import type { CurrentUser } from "./users.js";

// Boundary (deliberate): this file proves lookupList's decision table - who is
// owner, co-author or stranger - against a fake that models the one query it
// makes. It does NOT prove that handlers pass `{ owner: true }` to requireList
// or that the real query is shaped right; only `npm run verify:flows` sees that.

type Row = Wishlist & { editors: WishlistEditor[] };
type FindUnique = (args: { where: { id: string }; include?: { editors?: boolean } }) => Promise<Row | null>;

const state = vi.hoisted(() => ({ rows: new Map<string, unknown>(), user: undefined as unknown }));

// The fake honours `include` like Prisma does: without `editors: true` the
// relation is simply absent, so dropping the include breaks the co-author case
// instead of passing unnoticed. Extra options (e.g. relationLoadStrategy) are ignored.
vi.mock("../db.js", () => ({
  prisma: {
    wishlist: {
      findUnique: (async ({ where, include }) => {
        const row = state.rows.get(where.id) as Row | undefined;
        if (!row) return null;
        const { editors, ...rest } = row;
        return (include?.editors ? { ...rest, editors } : rest) as Row;
      }) satisfies FindUnique,
    },
  },
}));
vi.mock("./users.js", () => ({ currentUser: async () => state.user }));

import { lookupList } from "./access.js";

const now = new Date("2026-01-01T00:00:00Z");
const user = (id: string) => ({ id, previousSeenAt: now }) as CurrentUser;
const wishlist = (ownerId: string, editorIds: string[] = []): Row => ({
  id: "w1", slug: "slug", title: "Birthday", description: null, eventDate: null,
  privacyMode: "SURPRISE", status: "ACTIVE", createdAt: now, updatedAt: now,
  notifyOwner: true, editorInviteToken: null, reminderSentAt: null, ownerId,
  editors: editorIds.map((userId, i) => ({ id: `e${i}`, wishlistId: "w1", userId, addedAt: now })),
});
const lookup = (id = "w1") => lookupList({} as MyContext, id);

beforeEach(() => {
  state.rows.clear();
  state.user = user("me");
});

describe("lookupList", () => {
  it("reports a missing list as gone", async () => {
    expect(await lookup("nope")).toEqual({ ok: false, reason: "gone" });
  });

  it("turns a stranger away", async () => {
    state.rows.set("w1", wishlist("someone-else", ["another"]));
    expect(await lookup()).toEqual({ ok: false, reason: "denied" });
  });

  it("makes the owner an owner", async () => {
    state.rows.set("w1", wishlist("me"));
    expect(await lookup()).toMatchObject({ ok: true, access: { role: "owner", isOwner: true, canEditGifts: true } });
  });

  it("makes a listed editor a co-author, who is not the owner", async () => {
    state.rows.set("w1", wishlist("someone-else", ["x", "me"]));
    expect(await lookup()).toMatchObject({ ok: true, access: { role: "coAuthor", isOwner: false, canEditGifts: true } });
  });

  it("lets the owner win when also listed as an editor", async () => {
    state.rows.set("w1", wishlist("me", ["me"]));
    expect(await lookup()).toMatchObject({ ok: true, access: { role: "owner", isOwner: true } });
  });

  it("hands back the list and the user it decided about", async () => {
    const row = wishlist("me");
    state.rows.set("w1", row);
    const found = await lookup();
    expect(found.ok && found.access.wishlist.id).toBe("w1");
    expect(found.ok && found.access.user.id).toBe("me");
  });
});
