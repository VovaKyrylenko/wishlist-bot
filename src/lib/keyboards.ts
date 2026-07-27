import { Keyboard } from "grammy";
import { t } from "../text.js";

export const MENU_CREATE = t.buttons.menuCreate;
export const MENU_LISTS = t.buttons.menuMyLists;
export const MENU_RESERVATIONS = t.buttons.menuMyReservations;
export const MENU_SUBSCRIPTIONS = t.buttons.menuSubscriptions;
export const MENU_SETTINGS = t.buttons.menuSettings;

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
