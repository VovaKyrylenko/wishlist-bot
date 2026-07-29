const LIST_PREFIX = "list_";
const RES_PREFIX = "res_";
const EDITOR_PREFIX = "ed_";

export function encodeListPayload(slug: string): string {
  return `${LIST_PREFIX}${slug}`;
}

export function encodeReservationPayload(reservationId: string): string {
  return `${RES_PREFIX}${reservationId}`;
}

export function encodeEditorPayload(token: string): string {
  return `${EDITOR_PREFIX}${token}`;
}

export type StartPayload =
  | { type: "list"; slug: string }
  | { type: "reservation"; reservationId: string }
  | { type: "editor"; token: string }
  | { type: "none" };

export function parseStartPayload(payload: string | undefined): StartPayload {
  if (!payload) return { type: "none" };
  if (payload.startsWith(LIST_PREFIX)) {
    return { type: "list", slug: payload.slice(LIST_PREFIX.length) };
  }
  if (payload.startsWith(RES_PREFIX)) {
    return { type: "reservation", reservationId: payload.slice(RES_PREFIX.length) };
  }
  if (payload.startsWith(EDITOR_PREFIX)) {
    return { type: "editor", token: payload.slice(EDITOR_PREFIX.length) };
  }
  return { type: "none" };
}

export function buildListDeepLink(botUsername: string, slug: string): string {
  return `https://t.me/${botUsername}?start=${encodeListPayload(slug)}`;
}

/**
 * Editor access is granted by following this link, so the invitee opts in
 * themselves instead of silently acquiring write access to someone's list.
 */
export function buildEditorInviteLink(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${encodeEditorPayload(token)}`;
}
