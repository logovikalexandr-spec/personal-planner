# Inline-создание задачи в ячейке + колонки наложений — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Тап/протяжка по пустой сетке таймлайна создаёт задачу инлайн (имя+время) вместо bottom-sheet; пересекающиеся блоки рисуются колонками (Apple).

**Architecture:** Чистые функции раскладки/времени выносим в `lib/timelineLayout.ts` (юнит-тесты vitest). DayTimeline применяет `layoutColumns` к рендеру и получает жест-создание на `.cal-hour` + draft-блок с инлайн-инпутом. Today держит draft-state, шлёт `createTask`, оптимистично заменяет draft на ответ. Контракт спеки: `docs/superpowers/specs/2026-06-09-inline-cell-create-deep-spec.md`.

**Tech Stack:** React 18 + TS + Vite, vitest (новое), Pointer Events, Telegram WebApp SDK.

---

## File Structure

- Create: `frontend/src/lib/timelineLayout.ts` — чистые функции (время↔пиксели, нормализация, payload, колонки).
- Create: `frontend/src/lib/timelineLayout.test.ts` — vitest.
- Create: `frontend/vitest.config.ts`.
- Modify: `frontend/package.json` — devDeps vitest + script `test`.
- Modify: `frontend/src/components/DayTimeline.tsx` — импорт чистых функций, рендер по колонкам, жест-создание, draft-блок.
- Modify: `frontend/src/screens/Today.tsx` — draft-state, onCreate → createTask, scroll-lock.
- Modify: `frontend/src/App.tsx` — убрать bottom-sheet по тапу часа (inline заменяет).
- Modify: `frontend/src/theme.css` — `.cal-draft*`, accessory-bar, saving/error, колоночная ширина.

---

## Task 0: Установить vitest (фронт без тест-раннера)

**Files:** Modify `frontend/package.json`; Create `frontend/vitest.config.ts`.

- [ ] **Step 1: Установить devDeps**

Run: `cd frontend && npm i -D vitest@^2 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6`
Expected: пакеты в devDependencies.

- [ ] **Step 2: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "jsdom", globals: true, include: ["src/**/*.test.{ts,tsx}"] },
});
```

- [ ] **Step 3: script test в package.json**

В `"scripts"` добавить: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 4: smoke-тест**

Create `frontend/src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => { it("works", () => expect(1 + 1).toBe(2)); });
```
Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Удалить smoke, commit**

```bash
rm src/lib/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(planner-v2): add vitest to frontend"
```

---

## Task 1: Чистые функции таймлайна (TDD)

**Files:** Create `frontend/src/lib/timelineLayout.ts`, `frontend/src/lib/timelineLayout.test.ts`.

Константы из DayTimeline переезжают сюда (потом DayTimeline импортирует), чтобы тесты били по одному источнику.

- [ ] **Step 1: Failing-тесты**

Create `frontend/src/lib/timelineLayout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pointerToMinutes, defaultRange, normalizeRange, hhmmss, createPayload, layoutColumns } from "./timelineLayout";

const snap = (m: number) => Math.round(m / 15) * 15;

describe("pointerToMinutes", () => {
  it("верх грида = offsetMin", () => {
    expect(pointerToMinutes(100, 100, 0, 300, 56 / 60)).toBeCloseTo(300);
  });
  it("учитывает scrollTop", () => {
    // 56px = 60мин; прокрутили на 56px → +60мин
    expect(pointerToMinutes(100, 100, 56, 300, 56 / 60)).toBeCloseTo(360);
  });
});

describe("defaultRange (тап)", () => {
  it("снап старта + 60мин", () => {
    expect(defaultRange(547, snap)).toEqual({ startMin: 540, endMin: 600 });
  });
});

describe("normalizeRange (протяжка)", () => {
  it("снап обоих концов", () => {
    expect(normalizeRange(544, 657, snap)).toEqual({ startMin: 540, endMin: 660 });
  });
  it("протяжка вверх → swap", () => {
    expect(normalizeRange(660, 540, snap)).toEqual({ startMin: 540, endMin: 660 });
  });
  it("длина < 15мин → 1ч (тап)", () => {
    expect(normalizeRange(540, 547, snap)).toEqual({ startMin: 540, endMin: 600 });
  });
});

describe("hhmmss / createPayload", () => {
  it("минуты → HH:MM:00", () => { expect(hhmmss(545)).toBe("09:05:00"); });
  it("payload без проекта/приоритета, дата=сегодня", () => {
    expect(createPayload(540, 600, "2026-06-09")).toEqual({
      due_date: "2026-06-09", due_time: "09:00:00", end_time: "10:00:00",
      project_id: null, priority: "none",
    });
  });
});

describe("layoutColumns", () => {
  const L = (id: number, s: number, e: number) => ({ id, startMin: s, endMin: e });
  it("нет блоков → пусто", () => { expect(layoutColumns([]).size).toBe(0); });
  it("один блок → 1 колонка", () => {
    const r = layoutColumns([L(1, 540, 600)]);
    expect(r.get(1)).toEqual({ colIndex: 0, colCount: 1 });
  });
  it("два пересекающихся → 2 колонки", () => {
    const r = layoutColumns([L(1, 540, 660), L(2, 600, 690)]);
    expect(r.get(1)).toEqual({ colIndex: 0, colCount: 2 });
    expect(r.get(2)).toEqual({ colIndex: 1, colCount: 2 });
  });
  it("A∩B, B∩C, A∌C → A и C делят колонку (colCount=2)", () => {
    const r = layoutColumns([L(1, 540, 630), L(2, 600, 720), L(3, 660, 750)]);
    expect(r.get(1)!.colCount).toBe(2);
    expect(r.get(1)!.colIndex).toBe(0);
    expect(r.get(2)!.colIndex).toBe(1);
    expect(r.get(3)!.colIndex).toBe(0);
  });
  it("непересекающиеся → каждый 1 колонка", () => {
    const r = layoutColumns([L(1, 540, 600), L(2, 660, 720)]);
    expect(r.get(1)).toEqual({ colIndex: 0, colCount: 1 });
    expect(r.get(2)).toEqual({ colIndex: 0, colCount: 1 });
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd frontend && npx vitest run src/lib/timelineLayout.test.ts`
Expected: FAIL — `timelineLayout` не найден.

- [ ] **Step 3: Реализация**

Create `frontend/src/lib/timelineLayout.ts`:
```ts
import type { Priority } from "../types";

export const HOUR_H = 56;
export const STEP_MIN = 15;
export const PX_PER_MIN = HOUR_H / 60;
export const DAY_END = 24 * 60;

export function snap15(min: number): number { return Math.round(min / STEP_MIN) * STEP_MIN; }
export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
export function parseMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function pad(n: number): string { return `${n}`.padStart(2, "0"); }
export function hhmm(min: number): string { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
export function hhmmss(min: number): string { return `${hhmm(min)}:00`; }

/** Y в координатах вьюпорта → минуты дня (учитывает скролл контейнера). */
export function pointerToMinutes(clientY: number, gridTop: number, scrollTop: number, offsetMin: number, pxPerMin = PX_PER_MIN): number {
  const yInGrid = clientY - gridTop + scrollTop;
  return offsetMin + yInGrid / pxPerMin;
}

/** Тап → блок 1ч на снапнутом часе. */
export function defaultRange(tapMin: number, snap: (m: number) => number = snap15): { startMin: number; endMin: number } {
  const s = snap(tapMin);
  return { startMin: s, endMin: s + 60 };
}

/** Протяжка → нормализованный диапазон (swap при движении вверх, <15мин→1ч). */
export function normalizeRange(a: number, b: number, snap: (m: number) => number = snap15): { startMin: number; endMin: number } {
  const start = snap(Math.min(a, b));
  let end = snap(Math.max(a, b));
  if (end - start < STEP_MIN) end = start + 60;
  return { startMin: start, endMin: end };
}

export interface CreatePayload { due_date: string; due_time: string; end_time: string; project_id: null; priority: Priority; }
export function createPayload(startMin: number, endMin: number, todayIso: string): CreatePayload {
  return { due_date: todayIso, due_time: hhmmss(startMin), end_time: hhmmss(endMin), project_id: null, priority: "none" };
}

/** Раскладка пересекающихся блоков по колонкам (greedy lane assignment, Apple-стиль). */
export function layoutColumns(
  blocks: { id: number; startMin: number; endMin: number }[],
): Map<number, { colIndex: number; colCount: number }> {
  const res = new Map<number, { colIndex: number; colCount: number }>();
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster: typeof sorted = [];
  let clusterEnd = -1;
  const flush = (group: typeof sorted) => {
    const colEnds: number[] = []; // индекс колонки → endMin последнего блока в ней
    const colOf = new Map<number, number>();
    for (const b of group) {
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= b.startMin) { colEnds[c] = b.endMin; placed = c; break; }
      }
      if (placed === -1) { colEnds.push(b.endMin); placed = colEnds.length - 1; }
      colOf.set(b.id, placed);
    }
    const colCount = colEnds.length;
    for (const b of group) res.set(b.id, { colIndex: colOf.get(b.id)!, colCount });
  };
  for (const b of sorted) {
    if (cluster.length && b.startMin >= clusterEnd) { flush(cluster); cluster = []; clusterEnd = -1; }
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  if (cluster.length) flush(cluster);
  return res;
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd frontend && npx vitest run src/lib/timelineLayout.test.ts`
Expected: PASS (все describe-блоки зелёные).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timelineLayout.ts src/lib/timelineLayout.test.ts
git commit -m "feat(planner-v2): timeline pure fns — pointerToMinutes/normalize/layoutColumns + tests"
```

---

## Task 2: theme.css — стили draft / колонки / accessory / saving / error

**Files:** Modify `frontend/src/theme.css` (рядом с `.cal-block`, см. строки ~325).

- [ ] **Step 1: Добавить стили**

После блока `.cal-block { ... }` добавить:
```css
/* колонки наложений — ширина/смещение задаются инлайном (left/width), здесь только переходы */
.cal-block { transition: left 120ms ease, width 120ms ease; }
/* черновик создания — намеренно ОТЛИЧЕН от обычного блока (пунктир ember) */
.cal-draft {
  position: absolute; border-radius: 10px; padding: 5px 9px; z-index: 5;
  border: 1.5px dashed var(--accent); background: var(--accent-soft);
  display: flex; flex-direction: column; gap: 2px; overflow: hidden;
}
.cal-draft.saving { opacity: 0.6; }
.cal-draft.error { border-style: solid; border-color: var(--danger); background: rgba(255,92,92,0.10); }
.cal-draft-input {
  -webkit-appearance: none; appearance: none; background: transparent; border: 0; outline: 0;
  font-family: inherit; font-size: 14px; font-weight: 500; color: var(--text);
  caret-color: var(--accent); min-height: 22px; width: 100%; padding: 0;
}
.cal-draft-input::placeholder { color: var(--text-muted); }
.cal-draft-time { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
.cal-draft-err { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--danger); }
.cal-draft-err button { background: var(--danger); color: #1a0808; border: 0; border-radius: 6px; padding: 3px 9px; font-weight: 600; font-size: 11px; }
/* accessory-бар «Готово» над клавиатурой */
.cal-accessory {
  position: fixed; left: 0; right: 0; bottom: var(--kb-inset, 0); z-index: 50;
  display: flex; justify-content: flex-end; padding: 8px 14px;
  background: linear-gradient(transparent, var(--onyx) 45%);
}
.cal-accessory button { min-height: 44px; background: var(--accent); color: #1a1209; border: 0; border-radius: 12px; padding: 0 22px; font-size: 15px; font-weight: 600; }
@keyframes cal-pulse { 0%{transform:scale(1)} 50%{transform:scale(1.02)} 100%{transform:scale(1)} }
.cal-block.created { animation: cal-pulse 200ms ease; }
```

- [ ] **Step 2: build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/theme.css
git commit -m "feat(planner-v2): css for inline draft, overlap columns, accessory bar"
```

---

## Task 3: DayTimeline — рендер блоков по колонкам

**Files:** Modify `frontend/src/components/DayTimeline.tsx`.

Цель: импортировать чистые функции из lib (убрать локальные дубли) и позиционировать блоки по `layoutColumns`.

- [ ] **Step 1: Импорт из lib, удалить локальные дубли**

В шапке DayTimeline.tsx заменить локальные `HOUR_H/STEP_MIN/PX_PER_MIN/DAY_END/parseMin/hhmm/clamp/snap15` на импорт:
```ts
import { HOUR_H, STEP_MIN, PX_PER_MIN, DAY_END, parseMin, hhmm, clamp, snap15, layoutColumns } from "../lib/timelineLayout";
```
Удалить их локальные определения (строки ~6-29). `START_HOUR`, `LONGPRESS_MS`, `CANCEL_PX` оставить локально. `resolveColor`/`priorityColor` оставить.

- [ ] **Step 2: Посчитать раскладку**

Перед `return` (после вычисления `timed`) добавить:
```ts
const cols = useMemo(() => layoutColumns(
  timed.map((t) => {
    const s = parseMin(t.due_time)!;
    const e = parseMin(t.end_time);
    return { id: t.id, startMin: s, endMin: e && e > s ? e : s + 60 };
  }),
), [timed]);
const GUTTER = 4; // px между колонками
```

- [ ] **Step 3: Применить колонки к позиции блока**

В рендере `timed.map`, в `style` блока заменить фикс. `left/right` (сейчас из CSS `left:56;right:8`) на вычисленные. Добавить расчёт перед `return (<div className="cal-block"...>`:
```ts
const lay = cols.get(t.id) ?? { colIndex: 0, colCount: 1 };
const LANE_LEFT = 56, LANE_RIGHT = 8;
const colWidthPct = 100 / lay.colCount;
```
И в `style` добавить:
```ts
left: `calc(${LANE_LEFT}px + (100% - ${LANE_LEFT + LANE_RIGHT}px) * ${lay.colIndex / lay.colCount} + ${lay.colIndex ? GUTTER : 0}px)`,
width: `calc((100% - ${LANE_LEFT + LANE_RIGHT}px) * ${1 / lay.colCount} - ${lay.colCount > 1 ? GUTTER : 0}px)`,
right: "auto",
```
(CSS `.cal-block` right:8/left:56 теперь перекрывается инлайном; можно оставить как фолбэк.)

- [ ] **Step 4: build + проверить тесты раскладки**

Run: `cd frontend && npm run build && npx vitest run src/lib/timelineLayout.test.ts`
Expected: build OK, тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/components/DayTimeline.tsx
git commit -m "feat(planner-v2): timeline blocks render in columns on overlap (Apple)"
```

---

## Task 4: DayTimeline — жест создания на пустой сетке

**Files:** Modify `frontend/src/components/DayTimeline.tsx`.

Новый проп `onCreateDraft(range)` вместо открытия sheet. Жест ловим на `.cal-hour`.

- [ ] **Step 1: Расширить пропсы**

В тип пропсов добавить:
```ts
onCreateDraft: (range: { startMin: number; endMin: number }) => void;
gridRef?: React.RefObject<HTMLDivElement>;
```
(`onTapHour` оставить временно для обратной совместимости — удалим в Task 7.)

- [ ] **Step 2: Хэндлер создания на сетке**

Добавить рефы/хэндлеры (рядом с существующими жестами):
```ts
const createRef = useRef<{ startMin: number; originY: number; moved: boolean } | null>(null);
function onHourDown(e: React.PointerEvent, gridTop: number) {
  if ((e.target as HTMLElement).closest(".cal-block,.cal-draft")) return; // тап по блоку/черновику — не создаём
  const m = pointerToMinutes(e.clientY, gridTop, scrollRef.current?.scrollTop ?? 0, offsetMin);
  createRef.current = { startMin: m, originY: e.clientY, moved: false };
}
function onHourMove(e: React.PointerEvent, gridTop: number) {
  const c = createRef.current; if (!c) return;
  if (Math.abs(e.clientY - c.originY) > CANCEL_PX) {
    c.moved = true;
    const cur = pointerToMinutes(e.clientY, gridTop, scrollRef.current?.scrollTop ?? 0, offsetMin);
    setDrag({ id: -1, startMin: Math.min(c.startMin, cur), endMin: Math.max(c.startMin, cur) }); // draft preview через тот же drag-стейт (id=-1)
  }
}
function onHourUp() {
  const c = createRef.current; createRef.current = null;
  if (!c) return;
  const raw = c.moved ? { a: c.startMin, b: (drag?.endMin ?? c.startMin) } : null;
  setDrag(null);
  const range = c.moved
    ? normalizeRange(c.startMin, raw!.b)
    : defaultRange(c.startMin);
  const startClamped = clamp(range.startMin, offsetMin, DAY_END - 15);
  onCreateDraft({ startMin: startClamped, endMin: clamp(range.endMin, startClamped + 15, DAY_END) });
}
```
(Импортировать `pointerToMinutes, defaultRange, normalizeRange` из lib.)

- [ ] **Step 3: Повесить на грид**

На контейнер `.cal-grid` (или на каждый `.cal-hour`) добавить pointer-хэндлеры с передачей `gridTop` из `scrollRef`/ref. Заменить `onClick={() => onTapHour(h)}` на pointer-модель:
```tsx
<div className="cal-grid" ref={gridRef}
  onPointerDown={(e) => onHourDown(e, gridRef!.current!.getBoundingClientRect().top)}
  onPointerMove={(e) => onHourMove(e, gridRef!.current!.getBoundingClientRect().top)}
  onPointerUp={onHourUp}
  style={{ height: HOURS.length * HOUR_H }}>
```
(Удалить `onClick={() => onTapHour(h)}` с `.cal-hour`.)

- [ ] **Step 4: build**

Run: `cd frontend && npm run build`
Expected: OK (draft-рендер ещё в Task 5; пока onCreateDraft просто зовётся).

- [ ] **Step 5: Commit**

```bash
git add src/components/DayTimeline.tsx
git commit -m "feat(planner-v2): create-on-empty gesture (tap=1h, drag=range) on timeline"
```

---

## Task 5: DayTimeline — рендер draft-блока с инлайн-инпутом

**Files:** Modify `frontend/src/components/DayTimeline.tsx`.

Draft приходит сверху как проп (state живёт в Today, Task 6).

- [ ] **Step 1: Пропсы draft**

```ts
draft?: { startMin: number; endMin: number; title: string; state: "editing" | "saving" | "error" } | null;
onDraftChange?: (title: string) => void;
onDraftCommit?: () => void;
onDraftCancel?: () => void;
onDraftRetry?: () => void;
```

- [ ] **Step 2: Рендер draft-блока**

В `.cal-grid`, после `timed.map`, добавить:
```tsx
{draft && (() => {
  const top = ((draft.startMin - offsetMin) / 60) * HOUR_H + 1;
  const height = Math.max(((draft.endMin - draft.startMin) / 60) * HOUR_H - 2, 44);
  return (
    <div className={`cal-draft ${draft.state === "saving" ? "saving" : ""} ${draft.state === "error" ? "error" : ""}`}
         style={{ top, height, left: 56, right: 8 }}>
      <input className="cal-draft-input" autoFocus placeholder="Новая задача"
        value={draft.title} disabled={draft.state === "saving"}
        onChange={(e) => onDraftChange?.(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onDraftCommit?.(); if (e.key === "Escape") onDraftCancel?.(); }}
        ref={(el) => { if (el && draft.state === "editing") el.scrollIntoView({ block: "center" }); }}
      />
      {draft.state === "error"
        ? <span className="cal-draft-err">Не сохранено <button onClick={onDraftRetry}>Повторить</button></span>
        : <span className="cal-draft-time">{hhmm(draft.startMin)}–{hhmm(draft.endMin)}{draft.state === "saving" ? " · сохранение…" : ""}</span>}
    </div>
  );
})()}
```

- [ ] **Step 3: Гард onOpen существующих блоков (без id у draft и SAVING не открывать)**

В `onClick` блока (строка ~264) уже есть гард `pickedRef/movedRef`. Убедиться, что draft (id=-1) не попадает в `timed` (он не в массиве). Ок.

- [ ] **Step 4: build**

Run: `cd frontend && npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/components/DayTimeline.tsx
git commit -m "feat(planner-v2): render inline draft block (input + time + saving/error)"
```

---

## Task 6: Today — draft-state, создание, scroll-lock, accessory

**Files:** Modify `frontend/src/screens/Today.tsx`.

- [ ] **Step 1: Состояние draft + создание**

В компоненте Today (timeline-вид) добавить:
```ts
import { createTask } from "../api";
import { createPayload } from "../lib/timelineLayout";
type Draft = { startMin: number; endMin: number; title: string; state: "editing" | "saving" | "error" };
const [draft, setDraft] = useState<Draft | null>(null);
const gridRef = useRef<HTMLDivElement>(null);

const openDraft = useCallback((r: { startMin: number; endMin: number }) => {
  setDraft({ ...r, title: "", state: "editing" });
}, []);
const commitDraft = useCallback(async () => {
  setDraft((d) => {
    if (!d || !d.title.trim()) return null; // пусто → отмена
    void (async () => {
      setDraft({ ...d, state: "saving" });
      try {
        await createTask(d.title.trim(), createPayload(d.startMin, d.endMin, iso));
        setDraft(null);
        load();
      } catch { setDraft((cur) => (cur ? { ...cur, state: "error" } : null)); }
    })();
    return { ...d, state: "saving" };
  });
}, [iso, load]);
const retryDraft = useCallback(() => { if (draft) { setDraft({ ...draft, state: "editing" }); commitDraft(); } }, [draft, commitDraft]);
```

- [ ] **Step 2: scroll-lock при открытом draft**

```ts
useEffect(() => {
  if (!draft) return;
  const y = window.scrollY;
  document.body.style.cssText = `position:fixed;top:${-y}px;left:0;right:0;`;
  return () => { document.body.style.cssText = ""; window.scrollTo(0, y); };
}, [!!draft]);
```

- [ ] **Step 3: Передать в DayTimeline + accessory-бар**

В JSX timeline-вида заменить `onTapHour={onTapHour}` на проп `onCreateDraft={openDraft}` и передать draft-пропсы + `gridRef`:
```tsx
<DayTimeline tasks={timed} byId={byId} isToday autoScroll={false}
  gridRef={gridRef}
  onCreateDraft={openDraft}
  draft={draft}
  onDraftChange={(title) => setDraft((d) => (d ? { ...d, title } : d))}
  onDraftCommit={commitDraft}
  onDraftCancel={() => setDraft(null)}
  onDraftRetry={retryDraft}
  onToggle={toggle} onOpen={onOpenTask} onResize={resize} nowAnchorId="today-now" />
{draft?.state === "editing" && (
  <div className="cal-accessory"><button onMouseDown={(e) => e.preventDefault()} onClick={commitDraft}>Готово</button></div>
)}
```
(Тап-вне с текстом → авто-коммит: на `cal-accessory`/документе можно повесить, но MVP — Enter/Готово; авто-коммит на blur инпута добавить в Task 5 onBlur → commitDraft.)

- [ ] **Step 4: build**

Run: `cd frontend && npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Today.tsx src/components/DayTimeline.tsx
git commit -m "feat(planner-v2): Today inline-create draft state + createTask + scroll-lock"
```

---

## Task 7: App — убрать bottom-sheet по тапу часа

**Files:** Modify `frontend/src/App.tsx`, `frontend/src/screens/Today.tsx`, `DayTimeline.tsx`.

- [ ] **Step 1: Убрать onTapHour-путь к TaskComposer для timeline**

В App.tsx: `tapHour`/`setAddHour` больше не вызывается из Today-таймлайна. Если `addHour` использовался только для тапа часа — оставить TaskComposer только для FAB-пути; иначе удалить `addHour`-стейт и связанный `<TaskComposer addHour=...>`. Проверить, не используется ли `onTapHour` где-то ещё (Calendar). Если Calendar тоже использует — оставить проп там, убрать только в Today.

- [ ] **Step 2: Удалить временный onTapHour из DayTimeline (Today-путь)**

Сделать `onTapHour` опциональным; в Today не передавать. Убедиться, что Calendar (если зовёт DayTimeline) либо мигрирует на onCreateDraft, либо передаёт onTapHour (отдельный тикет — в этом плане только Today).

- [ ] **Step 3: build + все тесты**

Run: `cd frontend && npm run build && npm test`
Expected: build OK, тесты зелёные.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/screens/Today.tsx src/components/DayTimeline.tsx
git commit -m "feat(planner-v2): replace tap-hour bottom-sheet with inline create on Today"
```

---

## Task 8: Визуал-фиделити гейт (live + диф против мокапа)

**Files:** none (проверка). Соблюдаем гейт TEAM.md.

- [ ] **Step 1: Локальный стек + сид**

Поднять локальный прод-стек (docker PG + uvicorn + vite, как в memory). Засидить: 2 пересекающихся timed-задачи (проверить колонки) + пустые часы (создание).

- [ ] **Step 2: Сценарии**

Прогнать: тап пустого часа → draft 1ч + инпут; протяжка → диапазон; ввод+Enter → блок (колонки если наезд); Escape пустого → отмена; убить сеть → error+повтор; тап существующего → TaskDetail (не создаёт).

- [ ] **Step 3: Скрин live рядом с мокапом `annotated-spec.html` → диф**

Сверить токены/пунктир draft/колонки/accessory. Расхождение → фикс → пересъём. Не «готово», пока диф не чист.

- [ ] **Step 4: Deploy-гейт**

После визуал-ОК владельца — деплой по рецепту (push origin → VPS git pull + compose build), сверка bundle-хэша, health 200.

---

## Self-Review

- **Покрытие спеки:** жест тап/протяжка (T4), draft+инпут (T5), commit/cancel/error/saving (T5,T6), колонки наложений §12 (T1,T3), reuse чистых функций (T1), замена bottom-sheet (T7), клавиатура/scroll-lock/accessory (T2,T5,T6), тач-таргет 44px (T2 input min-height/accessory), API контракт C3 (T6 createPayload). E12 авто-коммит — частично (Enter/Готово + onBlur в T5; тап-вне-документа на MVP не вешаем, флаг).
- **Открытый риск (флаг):** авто-коммит по «тап в любом месте вне» в MVP реализован как onBlur инпута; полноценный «тап по фону сетки» можно добавить позже.
- **Типы:** `Draft`/`createPayload`/`layoutColumns` сигнатуры согласованы между T1/T5/T6.
- **Плейсхолдеры:** код приведён по шагам; UI-интеграция T6/T7 требует сверки реальных имён пропсов DayTimeline при исполнении (исполнитель читает текущий файл).
```
