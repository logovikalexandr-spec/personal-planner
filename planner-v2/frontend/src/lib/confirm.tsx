import { useEffect, useState } from "react";
import { tg } from "../telegram";
import { isTelegram } from "./auth";

// Подтверждение действия.
//  • В Telegram — нативный showConfirm (там он рисует системный диалог).
//  • В PWA/браузере — кастомный модал ConfirmHost в стиле приложения (window.confirm уродлив, а
//    showConfirm-заглушка SDK вне Telegram не зовёт колбэк). Фолбэк на window.confirm — если хост не смонтирован.

type ConfirmReq = {
  title: string;
  body?: string;
  confirmText: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
};

let pushReq: ((r: ConfirmReq) => void) | null = null;

export function confirmDialog(
  title: string,
  opts: { body?: string; confirmText?: string; danger?: boolean } = {},
): Promise<boolean> {
  const { body, confirmText = "Удалить", danger = true } = opts;
  if (isTelegram()) {
    const t = tg() as unknown as { showConfirm?: (m: string, cb: (ok: boolean) => void) => void } | undefined;
    if (t?.showConfirm) {
      const msg = [title, body].filter(Boolean).join("\n");
      return new Promise((resolve) => t.showConfirm!(msg, (ok) => resolve(!!ok)));
    }
  }
  if (pushReq) {
    return new Promise((resolve) => pushReq!({ title, body, confirmText, danger, resolve }));
  }
  const msg = [title, body].filter(Boolean).join("\n");
  return Promise.resolve(typeof window !== "undefined" ? window.confirm(msg) : true);
}

/** Монтируется один раз в корне — рендерит кастомный confirm-модал поверх всего. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    pushReq = (r) => setReq(r);
    return () => { pushReq = null; };
  }, []);
  if (!req) return null;
  const done = (v: boolean) => { req.resolve(v); setReq(null); };
  return (
    <div className="confirm-backdrop" onClick={() => done(false)}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{req.title}</div>
        {req.body && <div className="confirm-body">{req.body}</div>}
        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={() => done(false)}>Отмена</button>
          <button className={`confirm-btn ${req.danger ? "danger" : "primary"}`} onClick={() => done(true)}>
            {req.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
