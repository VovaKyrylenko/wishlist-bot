import type { Context } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";

export type GuestFilter = "all" | "available" | "reserved";

// There is deliberately no session: the one thing it ever held — the guest's
// last-used filter — leaked across wishlists, so a filter chosen on one
// friend's list quietly hid gifts on the next. Filter and page now travel in
// the callback data of the screen they belong to, which is where the rest of
// the navigation state already lives.
export type MyContext = ConversationFlavor<Context>;
export type MyConversation = Conversation<MyContext, MyContext>;
