import { tg } from "../telegram";

// Авторизация: два пути.
//  • Внутри Telegram Mini App → подпись initData (X-Telegram-Init-Data).
//  • PWA (на экране «Домой», вне Telegram) → device-токен в localStorage (Authorization: Bearer).
// Токен выдаёт бот-команда /applink (печатает его владельцу), вставляется один раз.

const TOKEN_KEY = "pwa_token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string): void {
  try { localStorage.setItem(TOKEN_KEY, t.trim()); } catch { /* приватный режим */ }
}
export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

/** Есть ли подпись Telegram (запущены как Mini App). */
export function isTelegram(): boolean {
  return !!tg()?.initData;
}

/** Заголовки авторизации для fetch: initData (если в Telegram) + Bearer (если есть токен). */
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const init = tg()?.initData;
  if (init) h["X-Telegram-Init-Data"] = init;
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Нужен экран ввода токена: не в Telegram И токена ещё нет. */
export function needsAuth(): boolean {
  return !isTelegram() && !getToken();
}
