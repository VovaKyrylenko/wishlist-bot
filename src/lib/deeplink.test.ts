import { describe, expect, it } from "vitest";
import {
  buildEditorInviteLink,
  buildListDeepLink,
  encodeEditorPayload,
  encodeListPayload,
  encodeReservationPayload,
  parseStartPayload,
} from "./deeplink.js";

// Links that were already shared live in chats forever, so the wire format is
// pinned with literals. A round trip alone would still pass if a prefix were
// renamed in both directions at once.
describe("parseStartPayload - links already in the wild", () => {
  it.each([
    ["list_abc123", { type: "list", slug: "abc123" }],
    ["res_r-42", { type: "reservation", reservationId: "r-42" }],
    ["ed_tok3n", { type: "editor", token: "tok3n" }],
  ])("%s", (payload, expected) => {
    expect(parseStartPayload(payload)).toEqual(expected);
  });

  it("keeps a prefix-looking tail inside the value", () => {
    expect(parseStartPayload("list_res_abc")).toEqual({ type: "list", slug: "res_abc" });
  });

  it.each([undefined, "", "hello", "List_abc", "listabc", "x_list_abc"])(
    "treats %j as no payload",
    (payload) => {
      expect(parseStartPayload(payload)).toEqual({ type: "none" });
    },
  );
});

describe("encoding", () => {
  it("writes the documented prefixes", () => {
    expect(encodeListPayload("abc")).toBe("list_abc");
    expect(encodeReservationPayload("abc")).toBe("res_abc");
    expect(encodeEditorPayload("abc")).toBe("ed_abc");
  });

  it("builds t.me links Telegram will open", () => {
    expect(buildListDeepLink("wish_bot", "abc")).toBe("https://t.me/wish_bot?start=list_abc");
    expect(buildEditorInviteLink("wish_bot", "tok")).toBe("https://t.me/wish_bot?start=ed_tok");
  });

  it("round-trips, as a supplement to the literals above", () => {
    for (const value of ["a", "abc123", "x".repeat(40), "res_inside", "ed_inside", "a-b_c"]) {
      expect(parseStartPayload(encodeListPayload(value))).toEqual({ type: "list", slug: value });
      expect(parseStartPayload(encodeReservationPayload(value))).toEqual({ type: "reservation", reservationId: value });
      expect(parseStartPayload(encodeEditorPayload(value))).toEqual({ type: "editor", token: value });
    }
  });
});
