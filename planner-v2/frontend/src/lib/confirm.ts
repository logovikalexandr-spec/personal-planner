import { tg } from "../telegram";
import { isTelegram } from "./auth";

// Подтверждение действия. ВНУТРИ Telegram — нативный showConfirm (window.confirm в TG WebView не
// работает). В PWA/браузере SDK всё равно отдаёт объект WebApp с методом showConfirm, НО колбэк там
// не вызывается (нет Telegram-клиента) → действие «висит». Поэтому гейт по isTelegram() (есть initData),
// а не по наличию метода; вне Telegram — обычный window.confirm.
export function confirmDialog(message: string): Promise<boolean> {
  if (isTelegram()) {
    const t = tg() as unknown as { showConfirm?: (m: string, cb: (ok: boolean) => void) => void } | undefined;
    if (t?.showConfirm) return new Promise((resolve) => t.showConfirm!(message, (ok) => resolve(!!ok)));
  }
  return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : true);
}
