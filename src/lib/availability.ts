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

/** `activeReservations` must already be filtered to status = ACTIVE. */
export function computeAvailability(
  quantity: number,
  activeReservations: ReservationLike[],
): ItemAvailability {
  const reserved = activeReservations.reduce((sum, r) => sum + r.quantity, 0);
  const available = Math.max(quantity - reserved, 0);
  return {
    needed: quantity,
    reserved,
    available,
    isFull: available === 0,
    isPartial: reserved > 0 && available > 0,
  };
}
