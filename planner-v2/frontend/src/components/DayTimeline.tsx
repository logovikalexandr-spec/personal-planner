import { memo, useEffect, useMemo, useRef, useState } from "react";
import { IcoBellMicro, IcoRepeatMicro, IcoCheck, IcoStage, IcoXCircle } from "./icons";
import { tg } from "../telegram";
import { shouldShowImpact } from "../lib/impact";
import { stageColor } from "../lib/stage";
import type { Priority, Project, Task } from "../types";
import {
  HOUR_H, STEP_MIN, PX_PER_MIN, DAY_END, MIN_BLOCK_PX,
  parseMin, hhmm, clamp, snap15, layoutColumns,
  pointerToMinutes, defaultRange, normalizeRange,
} from "../lib/timelineLayout";

const LONGPRESS_MS = 220;       // удержание тела блока → «поднять» для переноса
const CANCEL_PX = 12;           // сдвиг до long-press = это скролл, отменяем подъём (tolerance как у dnd-kit)
const CLAIM_MS = 110;           // создание: палец неподвижен N мс → «клеймим» жест (блок скролла),
                                // иначе iOS WebView крадёт удержание под скролл и срывает long-press до взвода
const MOVE_THRESH = 16;         // мёртвая зона после взвода: дрейф пальца < порога не двигает черновик

function haptic(style: "light" | "medium" = "light") {
  tg()?.HapticFeedback?.impactOccurred?.(style);
}
function resolveColor(projectId: number | null, byId: Map<number, Project>): string | null {
  let cur = projectId != null ? byId.get(projectId) : undefined;
  let g = 0;
  while (cur && g++ < 8) {
    if (cur.color) return cur.color;
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

/** Единый маппинг приоритета → цвет канта (общий с TaskItem). */
export function priorityColor(priority: Priority): string | null {
  if (priority === "high") return "var(--danger)";
  if (priority === "medium") return "var(--warning)";
  if (priority === "low") return "var(--accent)";
  return null;
}

type Drag = { id: number; startMin: number; endMin: number };
type Edge = "top" | "bottom" | "move";
type Draft = { startMin: number; endMin: number; title: string; state: "editing" | "saving" | "error" };

export const DayTimeline = memo(function DayTimeline({
  tasks, byId, isToday, onTapHour, onToggle, onOpen, onResize, autoScroll = true, nowAnchorId,
  gridRef: gridRefProp, onCreateDraft, compact = false, startHourOverride, scrollToNowKey = 0,
  scrollToHour, scrollToHourKey = 0,
  draft, onDraftChange, onDraftCommit, onDraftCancel, onDraftRetry, onDraftResize,
}: {
  tasks: Task[];
  byId: Map<number, Project>;
  isToday: boolean;
  /** Старый путь тапа часа (Calendar). Опционален — Today перешёл на onCreateDraft. */
  onTapHour?: (hour: number) => void;
  onToggle: (t: Task) => void;
  onOpen?: (t: Task) => void;
  /** Перенос/ресайз блока (шаг 15 мин). Если не передан — жесты выключены. */
  onResize?: (t: Task, patch: { due_time: string; end_time: string }) => void;
  autoScroll?: boolean;
  /** id на now-линии — якорь для прыжок-скролла «Сегодня» (Today timeline). */
  nowAnchorId?: string;
  /** Ref на .cal-grid (нужен для координат жеста создания; живёт у родителя). */
  gridRef?: React.RefObject<HTMLDivElement>;
  /** Жест создания на пустой сетке: тап=1ч / протяжка=диапазон. Если не передан — создание выключено. */
  onCreateDraft?: (range: { startMin: number; endMin: number }) => void;
  /** Компактный режим колонки «Дни» (T2d): узкий lane (блоки во всю ширину), часы оверлеем. Default — полный Today-вид. */
  compact?: boolean;
  /** Фикс. час начала сетки (общий для N колонок «Дни»). Без него — динамический от earliest задачи. */
  startHourOverride?: number;
  /** Сигнал «прыгнуть к now-линии» (Today бампает при показе таба / кнопке «Сейчас»). */
  scrollToNowKey?: number;
  /** Час, к которому скроллить по scrollToHourKey (для не-сегодня — открывать на 05:00). */
  scrollToHour?: number;
  scrollToHourKey?: number;
  /** Черновик создаваемой задачи (state живёт в родителе — Today). */
  draft?: Draft | null;
  onDraftChange?: (title: string) => void;
  onDraftCommit?: () => void;
  onDraftCancel?: () => void;
  onDraftRetry?: () => void;
  /** Растягивание краёв черновика до коммита (шаг 15 мин, локально в Today). */
  onDraftResize?: (range: { startMin: number; endMin: number }) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const localGridRef = useRef<HTMLDivElement>(null);
  const gridRef = gridRefProp ?? localGridRef;
  // GPU-transform скролл (Today timeline): смещение контента + ref-API «прыжок к now» + актуальный nowMin
  const offsetRef = useRef(0);
  const scrollNowRef = useRef<() => void>(() => {});
  const scrollHourRef = useRef<() => void>(() => {});    // скролл к фикс. часу (не-сегодня → 05:00)
  const scrollDraftRef = useRef<() => void>(() => {});   // подскролл черновика над клавой
  const nowMinRef = useRef(0);
  const scrollHourValRef = useRef(5);
  scrollHourValRef.current = scrollToHour ?? 5;
  const draftActiveRef = useRef(false);                  // редактируется черновик → заморозить refit/скролл
  const draftStartRef = useRef(0);
  const timed = useMemo(() => tasks.filter((t) => t.due_time), [tasks]);

  // Начало сетки: 00:00 (полные сутки — владелец хочет 00:00 в начале и в конце).
  // startHourOverride: общий старт для N колонок «Дни» (иначе разный earliest рассинхронит высоты).
  const startHour = startHourOverride ?? 0;
  const HOURS = useMemo(
    () => Array.from({ length: 24 - startHour }, (_, i) => startHour + i),
    [startHour],
  );
  const offsetMin = startHour * 60;

  // Раскладка пересекающихся блоков по колонкам (Apple-стиль).
  const DRAFT_ID = -1; // sentinel id живого превью/черновика создания
  const cols = useMemo(() => {
    const blocks = timed.map((t) => {
      const s = parseMin(t.due_time)!;
      const e = parseMin(t.end_time);
      return { id: t.id, startMin: s, endMin: e && e > s ? e : s + 60 };
    });
    if (draft) blocks.push({ id: DRAFT_ID, startMin: draft.startMin, endMin: draft.endMin });
    return layoutColumns(blocks);
  }, [timed, draft]);
  const GUTTER = 4; // px между колонками
  // compact (колонка «Дни»): узкий lane — блоки почти во всю ширину, часы оверлеем.
  const LANE_LEFT = compact ? 6 : 56;
  const LANE_RIGHT = compact ? 4 : 8;
  function laneStyle(colIndex: number, colCount: number): React.CSSProperties {
    return {
      left: `calc(${LANE_LEFT}px + (100% - ${LANE_LEFT + LANE_RIGHT}px) * ${colIndex / colCount} + ${colIndex ? GUTTER : 0}px)`,
      width: `calc((100% - ${LANE_LEFT + LANE_RIGHT}px) * ${1 / colCount} - ${colCount > 1 ? GUTTER : 0}px)`,
      right: "auto",
    };
  }

  // Поминутный пересчёт линии «сейчас» (мгновенный, без transition — §6).
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  nowMinRef.current = nowMin;
  draftActiveRef.current = draft?.state === "editing";
  draftStartRef.current = draft?.startMin ?? 0;
  useEffect(() => {
    if (!isToday) return;
    const id = window.setInterval(() => {
      setNowMin(new Date().getHours() * 60 + new Date().getMinutes());
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isToday]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const focusHour = isToday ? new Date().getHours() : 9;
    el.scrollTop = Math.max(0, (focusHour - startHour) * HOUR_H - HOUR_H);
  }, [autoScroll, isToday, startHour]);

  // Жесты: drag = живое состояние перетаскиваемого блока; refs хранят базу/режим.
  const [drag, setDrag] = useState<Drag | null>(null);
  // активный (зажатый) блок: только у него видны грипы и работает ресайз краёв.
  const [activeId, setActiveId] = useState<number | null>(null);
  const dragRef = useRef<{ task: Task; edge: Edge; originY: number; baseStart: number; baseEnd: number } | null>(null);
  const lpRef = useRef<number | null>(null);     // таймер long-press (move)
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const pickedRef = useRef(false);               // тело поднято (move активен)
  const movedRef = useRef(false);                // был реальный сдвиг → коммит + подавить тап
  const suppressClickRef = useRef(false);        // long-press взвёл активность → не открывать деталь на отпускании

  function clearLp() {
    if (lpRef.current != null) { window.clearTimeout(lpRef.current); lpRef.current = null; }
  }

  // Глушим нативный скролл на время жеста (как ProjectTree на шторке): non-passive
  // touchmove с preventDefault — иначе iOS WebView начинает скролл и срывает перенос.
  const blockerRef = useRef<((e: TouchEvent) => void) | null>(null);
  function startBlocking() {
    if (blockerRef.current) return;
    const fn = (e: TouchEvent) => e.preventDefault();
    blockerRef.current = fn;
    document.addEventListener("touchmove", fn, { passive: false });
  }
  function stopBlocking() {
    if (blockerRef.current) {
      document.removeEventListener("touchmove", blockerRef.current);
      blockerRef.current = null;
    }
  }
  useEffect(() => () => stopBlocking(), []);

  // ── края: ресайз только у АКТИВНОГО (зажатого) блока ──
  function onEdgeDown(e: React.PointerEvent, t: Task, edge: "top" | "bottom", baseStart: number, baseEnd: number) {
    if (!onResize) return;
    if (activeId !== t.id) return;   // не активен → грипа нет, тап у края = открыть (событие всплывёт)
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pickedRef.current = false;
    movedRef.current = false;
    startBlocking();
    dragRef.current = { task: t, edge, originY: e.clientY, baseStart, baseEnd };
    setDrag({ id: t.id, startMin: baseStart, endMin: baseEnd });
  }

  // ── тело: перенос всего блока по long-press ──
  function onBodyDown(e: React.PointerEvent, t: Task, baseStart: number, baseEnd: number) {
    if (!onResize) return;
    pickedRef.current = false;
    movedRef.current = false;
    suppressClickRef.current = false;
    downRef.current = { x: e.clientX, y: e.clientY };
    const pid = e.pointerId;
    const el = e.currentTarget as Element;
    clearLp();
    lpRef.current = window.setTimeout(() => {
      pickedRef.current = true;
      suppressClickRef.current = true;   // взвели long-press → подавить открытие на отпускании
      haptic("medium");
      el.setPointerCapture?.(pid);
      startBlocking();
      setActiveId(t.id);   // зажали → активируем карточку (грипы + ресайз краёв)
      dragRef.current = { task: t, edge: "move", originY: downRef.current!.y, baseStart, baseEnd };
      setDrag({ id: t.id, startMin: baseStart, endMin: baseEnd });
    }, LONGPRESS_MS);
  }

  function onDragMove(e: React.PointerEvent) {
    // до подъёма: если уехали дальше порога — это скролл/отмена, гасим long-press
    if (!pickedRef.current && dragRef.current?.edge !== "top" && dragRef.current?.edge !== "bottom") {
      const s = downRef.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > CANCEL_PX) clearLp();
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    // непрерывный сдвиг (без снапа) → блок плавно следует за пальцем, не дёргается
    const deltaMin = (e.clientY - d.originY) / PX_PER_MIN;
    if (Math.abs(deltaMin) >= 1) movedRef.current = true;
    if (d.edge === "top") {
      const s = clamp(d.baseStart + deltaMin, offsetMin, d.baseEnd - STEP_MIN);
      setDrag({ id: d.task.id, startMin: s, endMin: d.baseEnd });
    } else if (d.edge === "bottom") {
      const en = clamp(d.baseEnd + deltaMin, d.baseStart + STEP_MIN, DAY_END);
      setDrag({ id: d.task.id, startMin: d.baseStart, endMin: en });
    } else {
      const dur = d.baseEnd - d.baseStart;
      const s = clamp(d.baseStart + deltaMin, offsetMin, DAY_END - dur);
      setDrag({ id: d.task.id, startMin: s, endMin: s + dur });
    }
  }

  function onDragUp() {
    clearLp();
    stopBlocking();
    const d = dragRef.current;
    dragRef.current = null;
    pickedRef.current = false;
    if (!d) return;
    setDrag((cur) => {
      if (cur && movedRef.current) {
        // снап к 15 мин ТОЛЬКО на отпускании; move сохраняет длительность
        let s: number;
        let en: number;
        if (d.edge === "move") {
          const dur = d.baseEnd - d.baseStart;
          s = clamp(snap15(cur.startMin), offsetMin, DAY_END - dur);
          en = s + dur;
        } else if (d.edge === "top") {
          s = clamp(snap15(cur.startMin), offsetMin, d.baseEnd - STEP_MIN);
          en = d.baseEnd;
        } else {
          s = d.baseStart;
          en = clamp(snap15(cur.endMin), d.baseStart + STEP_MIN, DAY_END);
        }
        if (s !== d.baseStart || en !== d.baseEnd) {
          haptic("light");
          onResize?.(d.task, { due_time: `${hhmm(s)}:00`, end_time: `${hhmm(en)}:00` });
        }
      }
      return null;
    });
  }

  // ── создание на пустой сетке ──
  // Обычный драг по сетке = нативный СКРОЛЛ (не перехватываем!).
  // Тап = блок 1ч на месте тапа. Удержание (long-press) → ДВИГАЕМ 1ч-блок пальцем (выбор времени),
  // на отпускании блок встаёт там. Дальше длину тянешь за края готового черновика (как у блоков).
  const createRef = useRef<{ startMin: number; originY: number; armed: boolean; moved: boolean; claimed: boolean } | null>(null);
  const createLpRef = useRef<number | null>(null);
  const createClaimRef = useRef<number | null>(null);   // таймер «клейма» жеста (блок скролла)
  function clearCreateLp() {
    if (createLpRef.current != null) { window.clearTimeout(createLpRef.current); createLpRef.current = null; }
    if (createClaimRef.current != null) { window.clearTimeout(createClaimRef.current); createClaimRef.current = null; }
  }
  function gridTop(): number {
    return gridRef.current?.getBoundingClientRect().top ?? 0;
  }
  // дебаг жеста снят после диагностики на устройстве — оставлена no-op заглушка вызовов
  function dbg(_s: string) { /* no-op */ }
  // GPU-TRANSFORM СКРОЛЛ (Today timeline). Лупа/iOS-перехват глушатся только блоком нативного
  // скролла (touchstart preventDefault) → нативный скролл недоступен. Поэтому таймлайн = клип-вьюпорт
  // фикс-высоты (overflow:hidden), а контент двигаем `translate3d` НА КОМПОЗИТОРЕ (плавно, как нативно).
  // Создание (pointer-жест) работает поверх — gridTop() учитывает transform → расчёт минут верен.
  useEffect(() => {
    const sc = scrollRef.current, g = gridRef.current;
    if (!sc || !g || autoScroll || !onCreateDraft) return;   // только Today-таймлайн (static + создание)

    // maxOff КЕШИРУЕМ (не читать scrollHeight/clientHeight на каждый touchmove — это reflow = джанк)
    let maxOff = 0;
    const recalcMax = () => { maxOff = Math.max(0, g.scrollHeight - sc.clientHeight); };
    const fitHeight = () => {
      // во время редактирования черновика НЕ рефитим: клава дёргает visualViewport много раз →
      // высота клипа скакала бы каждый кадр → черновик «прыгает». Замораживаем раскладку.
      if (draftActiveRef.current) return;
      const top = sc.getBoundingClientRect().top;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      sc.style.height = `${Math.max(180, Math.round(vh - top - 76))}px`;   // до низа экрана минус таб-бар
      recalcMax();
    };
    const apply = () => { g.style.transform = `translate3d(0,${-offsetRef.current}px,0)`; };
    const setOff = (v: number) => { offsetRef.current = Math.max(0, Math.min(v, maxOff)); apply(); };

    fitHeight(); apply();
    scrollNowRef.current = () => {                            // прыжок: now-линия вверху + ~час до неё над ней
      fitHeight();
      setOff(((nowMinRef.current - offsetMin) / 60) * HOUR_H - 70);
    };
    scrollHourRef.current = () => {                           // не-сегодня: открыть на фикс. часе (05:00) у верха
      fitHeight();
      setOff(((scrollHourValRef.current * 60 - offsetMin) / 60) * HOUR_H - 8);
    };
    scrollDraftRef.current = () => {                          // черновик к верху клипа (над клавой), один раз
      recalcMax();                                            // грид только что вырос на спейсер-клавы → пересчитать предел
      setOff(((draftStartRef.current - offsetMin) / 60) * HOUR_H - 80);
    };

    let startY = 0, startOff = 0, lastY = 0, lastT = 0, vy = 0, raf = 0, dragging = false;
    const onTS = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      // интерактив (инпут черновика, кнопки, грипы ресайза) — не перехватываем под скролл
      if (t.closest(".cal-draft, input, textarea, button, .cal-resize")) { dragging = false; return; }
      // Apple-стиль: скроллим и по карточке тоже (раньше тут был bail на .cal-block → драг по карточке
      // ничего не скроллил). Подъём блока (long-press) живёт параллельно и отменяется при сдвиге >CANCEL_PX.
      // pd зовём ТОЛЬКО на пустой сетке (глушит лупу/iOS-перехват). На карточке pd убил бы синтет-клик
      // (tap-open детали) на iOS — потому НЕ зовём; нативный скролл на теле и так выкл. (touch-action:none).
      if (!t.closest(".cal-block")) e.preventDefault();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      recalcMax();                                           // один reflow на старте жеста, не на каждый move
      startY = lastY = e.touches[0].clientY; startOff = offsetRef.current; lastT = e.timeStamp; vy = 0; dragging = true;
    };
    const onTM = (e: TouchEvent) => {
      // не скроллим, если активен другой жест: создание (armed) / подъём-или-ресайз блока (dragRef)
      if (!dragging || createRef.current?.armed || dragRef.current) return;
      const y = e.touches[0].clientY;
      offsetRef.current = Math.max(0, Math.min(startOff - (y - startY), maxOff));
      apply();                                               // ПРЯМО (transform на композиторе дешёвый, без reflow/rAF-лага)
      const dt = e.timeStamp - lastT;
      if (dt > 0) { const inst = (y - lastY) / dt; vy = vy * 0.7 + inst * 0.3; }   // сглаженная скорость
      lastY = y; lastT = e.timeStamp;
    };
    const onTE = () => {
      dragging = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      let v = vy * 16;                                        // инерция (затухание как нативное)
      if (Math.abs(v) < 0.6) return;
      const step = () => {
        offsetRef.current = Math.max(0, Math.min(offsetRef.current - v, maxOff));
        apply(); v *= 0.95;
        raf = (Math.abs(v) > 0.35 && offsetRef.current > 0 && offsetRef.current < maxOff) ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    };
    g.addEventListener("touchstart", onTS, { passive: false });
    g.addEventListener("touchmove", onTM, { passive: false });
    g.addEventListener("touchend", onTE);
    g.addEventListener("touchcancel", onTE);
    window.addEventListener("resize", fitHeight);
    window.visualViewport?.addEventListener("resize", fitHeight);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      g.removeEventListener("touchstart", onTS);
      g.removeEventListener("touchmove", onTM);
      g.removeEventListener("touchend", onTE);
      g.removeEventListener("touchcancel", onTE);
      window.removeEventListener("resize", fitHeight);
      window.visualViewport?.removeEventListener("resize", fitHeight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCreateDraft, autoScroll, offsetMin]);

  // Прыжок к now-линии (по сигналу от Today: показ таба / кнопка «Сейчас»). После main-эффекта.
  useEffect(() => { scrollNowRef.current(); }, [scrollToNowKey]);

  // Скролл к фикс. часу (не-сегодня → 05:00). key=0 = не трогать (сегодня идёт через now-key).
  useEffect(() => { if (scrollToHourKey) scrollHourRef.current(); }, [scrollToHourKey]);

  // Вход в редактирование черновика → подскроллить его к верху (над клавой), один раз.
  useEffect(() => {
    if (draft?.state !== "editing") return;
    const id = requestAnimationFrame(() => scrollDraftRef.current());
    return () => cancelAnimationFrame(id);
  }, [draft?.state, draft?.startMin]);

  function onHourDown(e: React.PointerEvent) {
    if (!onCreateDraft) { dbg("DOWN: no onCreateDraft"); return; }
    // тап по существующему блоку/черновику — это «открыть», не «создать» (E1)
    const hitBlock = !!(e.target as HTMLElement).closest(".cal-block,.cal-draft");
    dbg(`DOWN tgt=${((e.target as HTMLElement).className + "").slice(0, 12)} blk=${hitBlock} pt=${e.pointerType}`);
    if (hitBlock) return;
    setActiveId(null);   // тронули пустую сетку → снимаем активность с блока
    // НЕ stopPropagation/preventDefault и НЕ startBlocking здесь — иначе убьём нативный скролл.
    const m = pointerToMinutes(e.clientY, gridTop(), scrollRef.current?.scrollTop ?? 0, offsetMin);
    createRef.current = { startMin: m, originY: e.clientY, armed: false, moved: false, claimed: false };
    clearCreateLp();
    // палец неподвижен CLAIM_MS → клеймим жест: глушим скролл, чтобы iOS не украл удержание ДО взвода.
    // быстрый драг (move до CLAIM_MS) отменит этот таймер в onHourMove → нативный скролл сохранится.
    createClaimRef.current = window.setTimeout(() => {
      const c = createRef.current; if (c) c.claimed = true;
      startBlocking(); dbg("CLAIM block");
    }, CLAIM_MS);
    createLpRef.current = window.setTimeout(() => {
      const c = createRef.current;
      if (!c) { dbg("ARM: createRef null"); return; }
      c.armed = true;              // взвели: жест теперь наш, протяжка ДВИГАЕТ блок
      haptic("medium");
      startBlocking();             // только теперь глушим нативный скролл
      // превью встаёт на начало часа тапнутой ячейки (драг дальше двигает точно)
      const h = Math.floor(c.startMin / 60) * 60;
      setDrag({ id: DRAFT_ID, startMin: h, endMin: h + 60 });
      dbg("ARMED ✓");
    }, LONGPRESS_MS);
  }
  function onHourMove(e: React.PointerEvent) {
    const c = createRef.current;
    if (!c) return;
    if (!c.armed) {
      // до взвода сдвиг пальца = это листание (ручной скролл в touchmove-эффекте) → отменяем создание.
      // (нативный скролл заглушён touchstart-pd, потому iOS больше не крадёт удержание — взвод надёжен)
      if (Math.abs(e.clientY - c.originY) > CANCEL_PX) {
        dbg(`CANCEL move=${Math.round(e.clientY - c.originY)}`); clearCreateLp(); stopBlocking(); createRef.current = null;
      }
      return;
    }
    // мёртвая зона: мелкий дрейф пальца при удержании НЕ двигает блок (баг «зажал 7:00 → встал 7:30»).
    // блок едет только при осознанном драге за порогом MOVE_THRESH; иначе стоит на точке нажатия.
    if (!c.moved && Math.abs(e.clientY - c.originY) <= MOVE_THRESH) return;
    c.moved = true;
    // ДВИГАЕМ блок: верх следует за пальцем, длительность держим 1ч (растянешь краями потом)
    const cur = pointerToMinutes(e.clientY, gridTop(), scrollRef.current?.scrollTop ?? 0, offsetMin);
    const start = clamp(cur, offsetMin, DAY_END - 60);
    setDrag({ id: DRAFT_ID, startMin: start, endMin: start + 60 });
  }
  function onHourCancel() { dbg("PCANCEL (iOS забрал жест)"); onHourUp(); }
  function onHourUp() {
    clearCreateLp();
    const c = createRef.current;
    dbg(`UP armed=${c?.armed ?? "—"}`);
    createRef.current = null;
    if (!c) return;                // скролл — создание было отменено
    const liveStart = drag?.startMin;
    const wasArmed = c.armed;
    setDrag(null);
    stopBlocking();
    if (!onCreateDraft) return;
    // создание ТОЛЬКО по удержанию (long-press взвёл armed). Короткий тап = ничего не создаёт.
    if (!wasArmed) return;
    // блок 1ч. Осознанный драг → точное место (snap15). Удержание-без-драга →
    // блок встаёт НА НАЧАЛО часа зажатой ячейки.
    const isDrag = c.moved && liveStart != null;
    const baseStart = isDrag ? liveStart : c.startMin;
    const snap = isDrag ? snap15 : (m: number) => Math.floor(m / 60) * 60;
    const { startMin, endMin } = defaultRange(baseStart, snap);
    const startClamped = clamp(startMin, offsetMin, DAY_END - STEP_MIN);
    const endClamped = clamp(endMin, startClamped + STEP_MIN, DAY_END);
    onCreateDraft({ startMin: startClamped, endMin: endClamped });
  }

  // ── растягивание краёв ЧЕРНОВИКА до коммита (как ресайз обычного блока, но в draft-state) ──
  const draftEdgeRef = useRef<{ edge: "top" | "bottom"; originY: number; baseStart: number; baseEnd: number } | null>(null);
  function onDraftEdgeDown(e: React.PointerEvent, edge: "top" | "bottom") {
    if (!draft || !onDraftResize) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    startBlocking();
    draftEdgeRef.current = { edge, originY: e.clientY, baseStart: draft.startMin, baseEnd: draft.endMin };
  }
  function onDraftEdgeMove(e: React.PointerEvent) {
    const d = draftEdgeRef.current;
    if (!d) return;
    e.preventDefault();
    const deltaMin = (e.clientY - d.originY) / PX_PER_MIN;
    if (d.edge === "top") {
      const s = clamp(snap15(d.baseStart + deltaMin), offsetMin, d.baseEnd - STEP_MIN);
      onDraftResize?.({ startMin: s, endMin: d.baseEnd });
    } else {
      const en = clamp(snap15(d.baseEnd + deltaMin), d.baseStart + STEP_MIN, DAY_END);
      onDraftResize?.({ startMin: d.baseStart, endMin: en });
    }
  }
  function onDraftEdgeUp() {
    stopBlocking();
    draftEdgeRef.current = null;
  }

  return (
    <div className={`cal-scroll ${autoScroll ? "" : "daytimeline--static"} ${compact ? "dt-compact" : ""}`} ref={scrollRef} style={{ flex: autoScroll ? 1 : "none" }}>
      <div
        className="cal-grid"
        data-testid="cal-grid"
        ref={gridRef}
        // Нижний воздух: (а) ~110px у Today, чтобы метку 24:00 (00:00) можно было проскроллить
        // выше плавающих «Список»/FAB/таб-бара (иначе она прячется за ними у нижней границы);
        // (б) при редактировании черновика +360 (≈высота клавы) — late-черновик поднимается над клавой.
        style={{ height: HOURS.length * HOUR_H + (compact ? 0 : 110) + (draft?.state === "editing" ? 360 : 0) }}
        onPointerDown={onCreateDraft ? onHourDown : undefined}
        onPointerMove={onCreateDraft ? onHourMove : undefined}
        onPointerUp={onCreateDraft ? onHourUp : undefined}
        onPointerCancel={onCreateDraft ? onHourCancel : undefined}
        onContextMenu={onCreateDraft ? (e) => e.preventDefault() : undefined}
      >
        {HOURS.map((h) => (
          <div
            key={h}
            className="cal-hour"
            style={{ height: HOUR_H }}
            onClick={onTapHour && !onCreateDraft ? () => onTapHour(h) : undefined}
          >
            <span className="cal-hourlabel">{`${h}`.padStart(2, "0")}:00</span>
          </div>
        ))}

        {/* конец суток: маркер 00:00 на отметке 24ч (нижняя граница сетки) */}
        <div className="cal-hour-end" style={{ top: HOURS.length * HOUR_H }}>
          <span className="cal-hourlabel">00:00</span>
        </div>

        {timed.map((t) => {
          const baseStart = parseMin(t.due_time)!;
          const endRaw = parseMin(t.end_time);
          const baseEnd = endRaw && endRaw > baseStart ? endRaw : baseStart + 60;
          const done = t.status === "done";
          const wontDo = t.status === "wont_do";
          const closed = done || wontDo;   // wont_do = как выполненная (затемнён/зачёркнут), но крестик
          const live = drag && drag.id === t.id ? drag : null;
          const start = live ? live.startMin : baseStart;
          const end = live ? live.endMin : baseEnd;
          const dur = end - start;
          // позиция следует за пальцем плавно, а время в подписи показываем снапнутым к 15 мин
          const labelStart = live ? snap15(start) : start;
          const labelEnd = live ? snap15(end) : end;
          const c = resolveColor(t.project_id, byId);
          const prio = priorityColor(t.priority); // кант строго по приоритету; none → нет цвета
          const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
          const enabled = !!onResize && !closed;
          const lay = cols.get(t.id) ?? { colIndex: 0, colCount: 1 };
          const heightPx = Math.max((dur / 60) * HOUR_H - 2, MIN_BLOCK_PX);
          const short = heightPx < 40; // короткий блок (≤~30мин): обе строки не влезают → центрируем заголовок
          return (
            <div
              key={t.id}
              data-testid={`task-${t.id}`}
              className={`cal-block ${closed ? "done" : ""} ${wontDo ? "wontdo" : ""} ${live ? "resizing" : ""} ${activeId === t.id ? "active" : ""} ${short ? "short" : ""}`}
              style={{
                top: ((start - offsetMin) / 60) * HOUR_H + 1,
                height: heightPx,
                borderLeftColor: prio ?? "transparent",
                background: c ? `${c}22` : "var(--surface-2)",
                ...laneStyle(lay.colIndex, lay.colCount),
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (pickedRef.current || movedRef.current) return; // подъём/перенос — не открывать
                if (suppressClickRef.current) { suppressClickRef.current = false; return; } // отпускание long-press — не открывать
                setActiveId(null);   // короткий тап — открыть деталь, снять активность
                onOpen?.(t);
              }}
            >
              {enabled && activeId === t.id && (
                <div
                  className="cal-resize top"
                  onPointerDown={(e) => onEdgeDown(e, t, "top", baseStart, baseEnd)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragUp}
                  onPointerCancel={onDragUp}
                >
                  <span className="cal-resize-grip" />
                </div>
              )}
              <div
                className={`cal-cb ${done ? "done" : ""} ${wontDo ? "wontdo" : ""}`}
                onClick={(e) => { e.stopPropagation(); onToggle(t); }}
                role="button"
                aria-label={wontDo ? "не буду делать" : "done"}
              >
                {done ? <IcoCheck /> : wontDo ? <IcoXCircle /> : null}
              </div>
              <div
                className="cal-block-main"
                onPointerDown={enabled ? (e) => onBodyDown(e, t, baseStart, baseEnd) : undefined}
                onPointerMove={enabled ? onDragMove : undefined}
                onPointerUp={enabled ? onDragUp : undefined}
                onPointerCancel={enabled ? onDragUp : undefined}
              >
                <div className="bt">{proj?.icon ? `${proj.icon} ` : ""}{t.title}</div>
                <div className="bm">
                  <span>{hhmm(labelStart)}–{hhmm(labelEnd)}</span>
                  {t.stage_label ? (
                    <span className="stagelbl" style={{ color: stageColor(t.stage_status) }}>
                      <IcoStage />{t.stage_label}{t.stage_status === "late" ? " !" : ""}
                    </span>
                  ) : null}
                  {t.recurrence ? <IcoRepeatMicro /> : null}
                  {t.reminder_at ? <IcoBellMicro /> : null}
                  {shouldShowImpact(t) ? <span className="imp">{t.impact}%</span> : null}
                </div>
              </div>
              {enabled && activeId === t.id && (
                <div
                  className="cal-resize bottom"
                  onPointerDown={(e) => onEdgeDown(e, t, "bottom", baseStart, baseEnd)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragUp}
                  onPointerCancel={onDragUp}
                >
                  <span className="cal-resize-grip" />
                </div>
              )}
            </div>
          );
        })}

        {/* now-линия — рендерится ПОСЛЕ блоков (DOM-last) + z-index:6 + translateZ(0):
            на iOS промотированные блоки иначе перекрывают линию (см. theme.css .cal-now) */}
        {isToday && nowMin >= offsetMin && (
          <div id={nowAnchorId} className="cal-now" data-testid="now-line" style={{ top: ((nowMin - offsetMin) / 60) * HOUR_H }} />
        )}

        {/* live-превью протяжки-создания (до отпускания; draft-проп ещё не поднят в Today) */}
        {!draft && drag && drag.id === DRAFT_ID && (
          <div
            className="cal-draft"
            style={{
              top: ((snap15(drag.startMin) - offsetMin) / 60) * HOUR_H + 1,
              height: Math.max(((snap15(drag.endMin) - snap15(drag.startMin)) / 60) * HOUR_H - 2, MIN_BLOCK_PX),
              ...laneStyle(cols.get(DRAFT_ID)?.colIndex ?? 0, cols.get(DRAFT_ID)?.colCount ?? 1),
            }}
          >
            <span className="cal-draft-time">{hhmm(snap15(drag.startMin))}–{hhmm(snap15(drag.endMin))}</span>
          </div>
        )}

        {/* draft-блок с инлайн-инпутом (state живёт в Today) */}
        {draft && (() => {
          const lay = cols.get(DRAFT_ID) ?? { colIndex: 0, colCount: 1 };
          const top = ((draft.startMin - offsetMin) / 60) * HOUR_H + 1;
          const height = Math.max(((draft.endMin - draft.startMin) / 60) * HOUR_H - 2, 44);
          return (
            <div
              className={`cal-draft ${draft.state === "saving" ? "saving" : ""} ${draft.state === "error" ? "error" : ""}`}
              style={{ top, height, ...laneStyle(lay.colIndex, lay.colCount) }}
            >
              {draft.state === "editing" && onDraftResize && (
                <div className="cal-resize top" onPointerDown={(e) => onDraftEdgeDown(e, "top")}
                     onPointerMove={onDraftEdgeMove} onPointerUp={onDraftEdgeUp} onPointerCancel={onDraftEdgeUp}>
                  <span className="cal-resize-grip" />
                </div>
              )}
              <input
                className="cal-draft-input"
                autoFocus
                placeholder="Новая задача"
                value={draft.title}
                disabled={draft.state === "saving"}
                onChange={(e) => onDraftChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onDraftCommit?.(); }
                  if (e.key === "Escape") { e.preventDefault(); onDraftCancel?.(); }
                }}
                // авто-коммит при потере фокуса = «тап-вне» (E12): пусто→отмена, текст→SAVING.
                // НО не коммитим, если фокус ушёл из-за перетаскивания края черновика (ресайз).
                onBlur={() => { if (!draftEdgeRef.current) onDraftCommit?.(); }}
              />
              {draft.state === "error" ? (
                <span className="cal-draft-err">
                  Не сохранено
                  <button onClick={onDraftRetry}>Повторить</button>
                </span>
              ) : (
                <span className="cal-draft-time">
                  {hhmm(draft.startMin)}–{hhmm(draft.endMin)}{draft.state === "saving" ? " · сохранение…" : ""}
                </span>
              )}
              {draft.state === "editing" && onDraftResize && (
                <div className="cal-resize bottom" onPointerDown={(e) => onDraftEdgeDown(e, "bottom")}
                     onPointerMove={onDraftEdgeMove} onPointerUp={onDraftEdgeUp} onPointerCancel={onDraftEdgeUp}>
                  <span className="cal-resize-grip" />
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
});
