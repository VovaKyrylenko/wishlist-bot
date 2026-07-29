import type { ReservationStatus } from "../../generated/prisma/enums.js";

/**
 * A reservation occupies one of an item's units while it is ACTIVE *or*
 * PURCHASED. Counting only ACTIVE meant that the moment a guest honestly
 * tapped "✅ Уже придбав" the gift went back on the shelf and a second guest
 * could buy the very same thing — the exact duplicate this bot exists to
 * prevent. Only CANCELLED gives a unit back.
 *
 * Every availability query must filter on this list rather than on a bare
 * `status: "ACTIVE"`.
 */
export const HOLDING_STATUSES: ReservationStatus[] = ["ACTIVE", "PURCHASED"];

/** Prisma `where` fragment for reservations that still hold a unit. */
export const holdingReservations = { status: { in: HOLDING_STATUSES } };

export interface ReservationLike {
  quantity: number;
}

export interface ItemAvailability {
  needed: number;
  reserved: number;
  available: number;
  isFull: boolean;
  isPartial: boolean;
}

/** `heldReservations` must already be filtered to {@link HOLDING_STATUSES}. */
export function computeAvailability(
  quantity: number,
  heldReservations: ReservationLike[],
): ItemAvailability {
  const reserved = heldReservations.reduce((sum, r) => sum + r.quantity, 0);
  const available = Math.max(quantity - reserved, 0);
  return {
    needed: quantity,
    reserved,
    available,
    isFull: available === 0,
    isPartial: reserved > 0 && available > 0,
  };
}
