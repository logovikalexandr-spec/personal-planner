// Чистая математика pull-to-refresh-жеста (тестируемо отдельно от DOM/тача).

export const CLAIM_PX = 8; // сдвиг, после которого решаем «это PTR или скролл/свайп»
export const TRIGGER_PX = 56; // визуальный порог: отпустил дальше → обновляем
export const MAX_PULL = 96; // потолок видимого вытягивания (резинка)
const RESIST = 90; // постоянная резинки: больше → мягче вытягивание

export type PullDecision = "pending" | "pull" | "reject";

// Решение по первому значимому движению.
// dy>0 = палец вниз. PTR только при доминирующей вертикали-вниз.
export function decide(dx: number, dy: number): PullDecision {
  if (Math.abs(dx) <= CLAIM_PX && Math.abs(dy) <= CLAIM_PX) return "pending";
  if (dy <= 0) return "reject"; // вверх или вбок-вверх
  if (Math.abs(dx) > dy) return "reject"; // горизонталь доминирует (свайп ленты/удаления)
  return "pull";
}

// Сырое смещение пальца (вниз, px) → видимое вытягивание индикатора (резинка).
// Экспоненциальный подход к потолку: порог TRIGGER_PX (56) достигается за ~80px пальца.
export function pullVisual(dy: number): number {
  if (dy <= 0) return 0;
  return MAX_PULL * (1 - Math.exp(-dy / RESIST));
}

// Прогресс индикатора 0..1 (1 = достигнут порог запуска).
export function pullProgress(visual: number): number {
  return Math.max(0, Math.min(1, visual / TRIGGER_PX));
}

// Отпустили: запускать обновление?
export function shouldRefresh(visual: number): boolean {
  return visual >= TRIGGER_PX;
}
