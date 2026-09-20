import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysUntil, isPast, parseEventDate, todayUtc } from "./dates.js";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

// Every case that reads the clock pins it: a suite that depends on the real
// date breaks on New Year's Eve and on 29 February.
function today(isoInstant: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoInstant));
}

afterEach(() => vi.useRealTimers());

describe("parseEventDate - dates with a year do not depend on the clock", () => {
  beforeEach(() => today("2026-04-10T12:00:00Z"));

  it.each([
    ["12.08.2026", "2026-08-12"],
    ["12-08-2026", "2026-08-12"],
    ["12/08/2026", "2026-08-12"],
    ["1.2.2027", "2027-02-01"],
    ["12.08.26", "2026-08-12"],
    ["12 серпня 2026", "2026-08-12"],
    ["  12   СЕРПНЯ  2026 ", "2026-08-12"],
    ["29.02.2028", "2028-02-29"],
  ])("%s -> %s", (raw, expected) => {
    expect(iso(parseEventDate(raw))).toBe(expected);
  });

  it.each(["31.02.2026", "29.02.2027", "32.01.2026", "12.13.2026", "0.5.2026", "скоро", "", "12 foo 2026", "12 лип 2026"])(
    "rejects %j so the caller can ask again",
    (raw) => {
      expect(parseEventDate(raw)).toBeNull();
    },
  );

  it("round-trips every calendar day of three years", () => {
    for (let ms = Date.UTC(2027, 0, 1); ms < Date.UTC(2030, 0, 1); ms += 86_400_000) {
      const d = new Date(ms);
      const raw = `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
      expect(parseEventDate(raw)?.getTime()).toBe(ms);
    }
  });
});

describe("parseEventDate - a missing year means the next time that day comes", () => {
  it("'8 березня' in April is next March, not five weeks ago", () => {
    today("2026-04-10T12:00:00Z");
    expect(iso(parseEventDate("8 березня"))).toBe("2027-03-08");
    expect(iso(parseEventDate("08.03"))).toBe("2027-03-08");
  });

  it("a day still ahead this year stays in this year, today included", () => {
    today("2026-04-10T12:00:00Z");
    expect(iso(parseEventDate("10 квітня"))).toBe("2026-04-10");
    expect(iso(parseEventDate("11 квітня"))).toBe("2026-04-11");
    expect(iso(parseEventDate("9 квітня"))).toBe("2027-04-09");
  });

  it("matches month stems and forms people actually type", () => {
    today("2026-04-10T12:00:00Z");
    for (const raw of ["25 грудня", "25 груд", "25 грудень"]) {
      expect(iso(parseEventDate(raw))).toBe("2026-12-25");
    }
  });

  it("rolls over the new year on its last evening", () => {
    today("2026-12-31T23:59:59Z");
    expect(iso(parseEventDate("31.12"))).toBe("2026-12-31");
    expect(iso(parseEventDate("1 січня"))).toBe("2027-01-01");
  });
});

describe("relative words, isPast and daysUntil", () => {
  beforeEach(() => today("2026-04-10T23:30:00Z"));

  it("resolve against the UTC calendar day", () => {
    expect(iso(parseEventDate("сьогодні"))).toBe("2026-04-10");
    expect(iso(parseEventDate("Завтра"))).toBe("2026-04-11");
    expect(iso(parseEventDate("післязавтра"))).toBe("2026-04-12");
    expect(iso(todayUtc())).toBe("2026-04-10");
  });

  it("today is not past, yesterday is", () => {
    expect(isPast(new Date(Date.UTC(2026, 3, 10)))).toBe(false);
    expect(isPast(new Date(Date.UTC(2026, 3, 9)))).toBe(true);
  });

  it("counts whole days, negative once passed", () => {
    expect(daysUntil(new Date(Date.UTC(2026, 3, 10)))).toBe(0);
    expect(daysUntil(new Date(Date.UTC(2026, 3, 15)))).toBe(5);
    expect(daysUntil(new Date(Date.UTC(2026, 3, 7)))).toBe(-3);
  });
});
