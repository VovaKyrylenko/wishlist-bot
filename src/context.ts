import type { Context, SessionFlavor } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";

export interface SessionData {
  /** Default filter applied to the guest item browser: all | available | reserved. */
  guestFilter: "all" | "available" | "reserved";
}

export function initialSession(): SessionData {
  return { guestFilter: "all" };
}

export type MyContext = ConversationFlavor<Context & SessionFlavor<SessionData>>;
export type MyConversation = Conversation<MyContext, MyContext>;
