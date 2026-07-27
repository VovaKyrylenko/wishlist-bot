import { Keyboard } from "grammy";

export const MENU_CREATE = "➕ Створити вішліст";
export const MENU_LISTS = "📋 Мої вішлісти";
export const MENU_RESERVATIONS = "🎁 Мої бронювання";
export const MENU_SUBSCRIPTIONS = "🔔 Підписки";
export const MENU_SETTINGS = "⚙️ Налаштування";

export function mainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU_CREATE)
    .text(MENU_LISTS)
    .row()
    .text(MENU_RESERVATIONS)
    .text(MENU_SUBSCRIPTIONS)
    .row()
    .text(MENU_SETTINGS)
    .resized();
}
