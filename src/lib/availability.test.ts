import { describe, expect, it } from "vitest";
import { ReservationStatus } from "../../generated/prisma/enums.js";
import { computeAvailability, HOLDING_STATUSES, holdingReservations } from "./availability.js";

// The product's central rule: nobody gives the same thing twice. These cases are
// golden on purpose - they restate the rule, not the implementation.
describe("which reservations hold a unit", () => {
  it("counts ACTIVE and PURCHASED, and only CANCELLED gives a unit back", () => {
    // Iterating the generated enum makes a newly added status fail here until
    // someone decides whether it holds a unit.
    const releasing = Object.values(ReservationStatus).filter((s) => !HOLDING_STATUSES.includes(s));
    expect(releasing).toEqual(["CANCELLED"]);
    expect(HOLDING_STATUSES).toContain("PURCHASED");
  });

  it("filters queries by the same list", () => {
    expect(holdingReservations).toEqual({ status: { in: HOLDING_STATUSES } });
  });
});

describe("computeAvailability", () => {
  it("is fully available with no reservations", () => {
    expect(computeAvailability(2, [])).toEqual({
      needed: 2, reserved: 0, available: 2, isFull: false, isPartial: false,
    });
  });

  it("is partial while some units are still free", () => {
    expect(computeAvailability(3, [{ quantity: 1 }])).toMatchObject({
      reserved: 1, available: 2, isFull: false, isPartial: true,
    });
  });

  it("is full, not partial, when every unit is held", () => {
    expect(computeAvailability(2, [{ quantity: 1 }, { quantity: 1 }])).toMatchObject({
      reserved: 2, available: 0, isFull: true, isPartial: false,
    });
  });

  it("never reports negative availability when over-reserved", () => {
    expect(computeAvailability(1, [{ quantity: 2 }])).toMatchObject({
      reserved: 2, available: 0, isFull: true, isPartial: false,
    });
  });
});
