const LIST_PREFIX = "list_";
const RES_PREFIX = "res_";

export function encodeListPayload(slug: string): string {
  return `${LIST_PREFIX}${slug}`;
}

export function encodeReservationPayload(reservationId: string): string {
  return `${RES_PREFIX}${reservationId}`;
}

export type StartPayload =
  | { type: "list"; slug: string }
  | { type: "reservation"; reservationId: string }
  | { type: "none" };

export function parseStartPayload(payload: string | undefined): StartPayload {
  if (!payload) return { type: "none" };
  if (payload.startsWith(LIST_PREFIX)) {
    return { type: "list", slug: payload.slice(LIST_PREFIX.length) };
  }
  if (payload.startsWith(RES_PREFIX)) {
    return { type: "reservation", reservationId: payload.slice(RES_PREFIX.length) };
  }
  return { type: "none" };
}

export function buildListDeepLink(botUsername: string, slug: string): string {
  return `https://t.me/${botUsername}?start=${encodeListPayload(slug)}`;
}
