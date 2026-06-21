import { useState } from "react";
import { getMe } from "../api";
import { setToken, clearToken } from "../lib/auth";

// Экран входа для PWA (вне Telegram): вставить device-токен из бот-команды /applink.
// Проверяем токен запросом /me; успех → перезагрузка (приложение стартует уже авторизованным).
export function TokenGate() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");

  async function submit() {
    const t = value.trim();
    if (!t || state === "checking") return;
    setState("checking");
    setToken(t);
    try {
      await getMe();              // валидация токена на бэке (authHeaders уже шлёт Bearer)
      window.location.reload();   // ок → перезапуск, дальше needsAuth()=false
    } catch {
      clearToken();
      setState("error");
    }
  }

  return (
    <div className="token-gate">
      <div className="token-gate-card">
        <div className="token-gate-title">Planner</div>
        <div className="token-gate-sub">
          Вставь токен входа. Получить его — команда <b>/applink</b> у бота.
        </div>
        <input
          className="token-gate-input"
          type="password"
          inputMode="text"
          autoComplete="off"
          placeholder="Токен входа"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (state === "error") setState("idle"); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        {state === "error" && <div className="token-gate-err">Неверный токен. Проверь /applink.</div>}
        <button className="btn token-gate-btn" onClick={submit} disabled={state === "checking" || !value.trim()}>
          {state === "checking" ? "Проверяю…" : "Войти"}
        </button>
      </div>
    </div>
  );
}
