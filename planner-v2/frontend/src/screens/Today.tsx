import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DayTimeline, priorityColor } from "../components/DayTimeline";
import { TaskItem } from "../components/TaskItem";
import { QuickAddBar } from "../components/QuickAddBar";
import { IcoBack, IcoChevron, IcoInbox, IcoMenu, IcoCalendar2, IcoChevronDown } from "../components/icons";
import { DateJumpSheet } from "../components/DateJumpSheet";
import { createTask, getDayTasks, getProjects, getTasks, patchTask } from "../api";
import { createPayload } from "../lib/timelineLayout";
import { groupByProject } from "../lib/groupByProject";
import { cmpTaskGrouped, projectRankMap } from "../lib/taskSort";
import { useBottomAnchor } from "../lib/viewportAnchor";
import { tg } from "../telegram";
import type { ParseResult } from "../lib/quickParse";
import type { Project, Task } from "../types";

type Draft = { startMin: number; endMin: number; title: string; state: "editing" | "saving" | "error" };

const FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
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

type LoadState = "loading" | "error" | "ready";

export function Today({
  reloadKey, hidden = false, onOpenTask, view, onViewChange, onOpenInbox, onQuickAdd, inboxCount, onOpenDrawer, gotoDay,
}: {
  reloadKey: number;
  /** Экран скрыт (keep-alive: App рендерит через .screen-host[hidden]). Сигнал для авто-коммита черновика (E9). */
  hidden?: boolean;
  onOpenTask?: (t: Task) => void;
  view: "timeline" | "tasks";
  onViewChange: (v: "timeline" | "tasks") => void;
  onOpenInbox: () => void;
  onQuickAdd: (p: ParseResult) => void;
  inboxCount: number;
  /** Открыть навигацию-шторку (бургер ☰). Drawer живёт в App. */
  onOpenDrawer: () => void;
  /** Внешний переход на дату (тап дня в Календаре «Дни»). nonce = повторный тап той же даты. */
  gotoDay?: { iso: string; n: number } | null;
}) {
  // Выбранный день таба «Задачи» (T1): по умолчанию сегодня; свайп/датапикер двигают.
  const [selectedISO, setSelectedISO] = useState(localToday);
  // Внешний переход с даты из Календаря: ставим выбранный день (nonce — чтобы повторный тап той же даты сработал).
  useEffect(() => {
    if (gotoDay) setSelectedISO(gotoDay.iso);
  }, [gotoDay?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const iso = selectedISO;
  const isToday = selectedISO === localToday();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [state, setState] = useState<LoadState>("loading");
  const [showDone, setShowDone] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false); // «Просрочено» под шторкой (свёрнуто по умолчанию)
  const [alldayExpanded, setAlldayExpanded] = useState(false); // A1: 2 чипа + «+N ещё»
  const firstRef = useRef(true); // скелетон/ошибку показываем только на первой загрузке, рефетчи — без мигания

  const load = useCallback(async () => {
    if (firstRef.current) setState("loading");
    try {
      const [ts, ps, ov] = await Promise.all([getDayTasks(iso), getProjects(), getTasks("overdue")]);
      setTasks(ts);
      setById(new Map(ps.map((p) => [p.id, p])));
      setOverdue(ov);
      firstRef.current = false;
      setState("ready");
    } catch {
      if (firstRef.current) setState("error");
    }
  }, [iso]);

  useEffect(() => {
    load().catch(() => {});
  }, [reloadKey, load]);

  const toggle = useCallback(async (t: Task) => {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    // клик по чекбоксу: done/wont_do → todo (снять), иначе → done
    const next = t.status === "done" || t.status === "wont_do" ? "todo" : "done";
    await patchTask(t.id, { status: next });
    load();
  }, [load]);

  // ресайз/перенос блока: оптимистично меняем время локально (мгновенно, без рефетча
  // и мигания скелетоном) → патч в фоне; при ошибке тихо ресинкаем.
  const resize = useCallback((t: Task, patch: { due_time: string; end_time: string }) => {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, due_time: patch.due_time, end_time: patch.end_time } : x)));
    patchTask(t.id, patch).catch(() => load());
  }, [load]);

  // ── инлайн-создание задачи в ячейке таймлайна (§11 C2/C4, H3) ──
  // draft-state живёт здесь (Today), DayTimeline только рисует и шлёт колбэки.
  const [draft, setDraft] = useState<Draft | null>(null);
  // зеркало draft для эффектов, которым нужен актуальный draft БЕЗ перезапуска на каждый
  // keystroke (E9 должен срабатывать только на переход hidden, а не на ввод текста).
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const gridRef = useRef<HTMLDivElement>(null);
  const accessoryRef = useRef<HTMLDivElement>(null);

  const openDraft = useCallback((r: { startMin: number; endMin: number }) => {
    setDraft({ ...r, title: "", state: "editing" });
  }, []);

  // commit: пусто → отмена; иначе SAVING → POST → ок:закрыть+рефетч / ошибка:ERROR.
  // Защита от двойного POST: коммитим только из editing/error (не из saving).
  // M3: таймаут 5с (Promise.race) → ERROR, текст цел. saveTok защищает от гонки —
  // поздний ответ POST игнорируется, если черновик уже ушёл из saving или это уже другой коммит.
  const saveTokRef = useRef(0);
  const commitDraft = useCallback(() => {
    setDraft((d) => {
      if (!d || d.state === "saving") return d;       // уже летит POST — игнор (анти-дубль)
      if (!d.title.trim()) return null;               // пусто → отмена
      const title = d.title.trim();
      const { startMin, endMin } = d;
      const tok = ++saveTokRef.current;               // токен этого коммита
      void (async () => {
        // settled — общий гард: применяем исход (ok/err/timeout) ровно один раз,
        // и только если черновик всё ещё в saving того же токена.
        let settled = false;
        const apply = (next: "done" | "error") => {
          if (settled) return;
          settled = true;
          setDraft((cur) => {
            if (saveTokRef.current !== tok || !cur || cur.state !== "saving") return cur; // гонка — игнор
            if (next === "done") { load(); return null; }
            return { ...cur, state: "error" };
          });
        };
        let timer = 0;
        const timeout = new Promise<never>((_, rej) => {
          timer = window.setTimeout(() => rej(new Error("timeout")), 5000);
        });
        try {
          await Promise.race([createTask(title, createPayload(startMin, endMin, iso)), timeout]);
          apply("done");
        } catch {
          apply("error");
        } finally {
          window.clearTimeout(timer);
        }
      })();
      return { ...d, state: "saving" };
    });
  }, [iso, load]);

  // retry из ERROR: commitDraft коммитит из любого состояния кроме saving (включая error),
  // так что отдельный перевод в editing не нужен.
  const retryDraft = commitDraft;

  // NB: scroll-lock (body position:fixed) для инлайн-черновика УБРАН — черновик в потоке
  // таймлайна, а не оверлей; фиксация body рвала экран («колдоёбит» на тап). autoFocus-инпут
  // браузер сам скроллит в видимую зону.
  // Пока черновик открыт — прячем таб-бар и FAB (иначе налезают на «Готово» над клавиатурой).
  useEffect(() => {
    document.body.classList.toggle("inline-draft", !!draft);
    return () => document.body.classList.remove("inline-draft");
  }, [!!draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Бар «Готово» прижимаем к низу видимого вьюпорта из JS (см. useBottomAnchor):
  // position:fixed+bottom глючит в TG iOS WebView (на верхних слотах бар улетал вверх).
  const editing = draft?.state === "editing";
  useBottomAnchor(accessoryRef, editing);

  // ПОЗИЦИОНИРОВАНИЕ черновика над клавой — ОДИН механизм: внутренний transform-скролл
  // DayTimeline (scrollDraftRef, поднимает блок к верху клипа). Прежний документ-скролл здесь
  // дрался с ним (двойной скролл → дёрганье 2-3 раза + overlap «Готово») — удалён. Грид-спейсер
  // в DayTimeline даёт late-блоку доехать вверх без клампа.

  // E9: смена таба с открытым черновиком (Today не размонтируется — keep-alive в App).
  // Скрыли экран → непустой draft авто-коммитим (как тап-вне), пустой отбрасываем.
  // saving не трогаем (POST уже летит). При возврате (hidden=false) ничего не дёргаем.
  useEffect(() => {
    if (!hidden) return;
    if (draftRef.current?.state === "saving") return;
    if (draftRef.current?.title.trim()) commitDraft();
    else if (draftRef.current) setDraft(null);
  }, [hidden, commitDraft]);

  // многодневный спан (end_date > due_date) показываем чипом в all-day, не блоком в одном дне
  const isMultiDay = (t: Task) => !!t.end_date && !!t.due_date && t.end_date !== t.due_date;
  const timed = useMemo(() => tasks.filter((t) => t.due_time && !isMultiDay(t)), [tasks]);
  // all-day = без времени ИЛИ многодневный; открытые (не done/wont_do).
  // Порядок = как в смарт-списках/шторке: проект (порядок шторки) → приоритет ↓ → дата/время (общий источник).
  const allday = useMemo(
    () =>
      tasks
        .filter((t) => (!t.due_time || isMultiDay(t)) && t.status !== "done" && t.status !== "wont_do")
        .sort(cmpTaskGrouped(projectRankMap(byId))),
    [tasks, byId],
  );
  const closed = useMemo(
    () => tasks.filter((t) => t.status === "done" || t.status === "wont_do"),
    [tasks],
  );

  // Прыжок к now-линии теперь делает DayTimeline (GPU-transform скролл) по сигналу-ключу.
  const [scrollNowKey, setScrollNowKey] = useState(0);
  const jumpNow = useCallback(() => setScrollNowKey((k) => k + 1), []);

  // По умолчанию показывать now-линию ВВЕРХУ при показе таба «Задачи» на сегодня+таймлайн (после загрузки).
  useEffect(() => {
    if (hidden || view !== "timeline" || selectedISO !== localToday() || state !== "ready") return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setScrollNowKey((k) => k + 1)));
    return () => cancelAnimationFrame(id);
  }, [hidden, view, selectedISO, state]);

  // НЕ сегодня (любой другой выбранный день) → открывать таймлайн на 05:00 (а не на 00:00).
  const [scrollHourKey, setScrollHourKey] = useState(0);
  useEffect(() => {
    if (hidden || view !== "timeline" || state !== "ready" || selectedISO === localToday()) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setScrollHourKey((k) => k + 1)));
    return () => cancelAnimationFrame(id);
  }, [hidden, view, selectedISO, state]);

  // Перескок через полночь: если реальная дата сменилась и мы были на «сегодня» —
  // перевести выбранный день на новые сутки (now-линия сама прыгнет вверх нового дня).
  const lastTodayRef = useRef(localToday());
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = localToday();
      if (t !== lastTodayRef.current) {
        if (selectedISO === lastTodayRef.current) setSelectedISO(t);
        lastTodayRef.current = t;
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [selectedISO]);

  // «Сегодня» в шапке: не на сегодня → прыжок на сегодня; уже сегодня → скролл к now.
  const goToday = useCallback(() => {
    if (selectedISO !== localToday()) setSelectedISO(localToday());
    else jumpNow();
  }, [selectedISO, jumpNow]);

  // Смена дня — через датапикер (кнопка даты) и «Сегодня»/«Сейчас». Свайп ◀▶ убран
  // (был ненадёжен, конфликтовал с жестами блоков/скролла).

  const renderList = (items: Task[]) => (
    <div className="list">
      {items.map((t) => (
        <TaskItem key={t.id} task={t} onToggle={toggle} onOpen={onOpenTask} color={resolveColor(t.project_id, byId)} />
      ))}
    </div>
  );

  const skeleton = (
    <div className="today-pad" aria-busy="true" style={{ marginTop: "var(--s4)" }}>
      {[0, 1, 2].map((i) => <div key={i} className="lists-skeleton-row" />)}
    </div>
  );
  const errorBlock = (
    <div className="today-pad" style={{ marginTop: "var(--s4)" }}>
      <div className="state-stub">
        <svg className="state-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
        </svg>
        <div className="state-title">Не удалось загрузить</div>
        <div className="state-sub">Проверь соединение и попробуй ещё раз.</div>
        <button className="btn btn-block" style={{ marginTop: "var(--s3)", width: "auto" }} onClick={() => load()}>Повторить</button>
      </div>
    </div>
  );

  // ── вид «Таймлайн» (главный) ────────────────────────────────────────────
  if (view === "timeline") {
    return (
      <div className="screen today">
        <div className="today-head">
          <div className="screen-hero today-pad">
            <div className="t1-hero-top">
              <button className="t1-burger" data-testid="btn-burger" onClick={onOpenDrawer} aria-label="Проекты"><IcoMenu /></button>
              <h1>Задачи</h1>
            </div>
            <div className="t1-daterow">
              <button className="t1-datebtn" data-testid="btn-date" onClick={() => setPickerOpen(true)}>
                <IcoCalendar2 />
                <span style={{ textTransform: "capitalize" }}>{FMT.format(new Date(selectedISO + "T00:00:00"))}</span>
                <span className="chev"><IcoChevronDown /></span>
              </button>
              {!isToday && <button className="t1-jump" data-testid="btn-today-jump" onClick={goToday}>Сегодня</button>}
              {isToday && <button className="t1-jump" data-testid="btn-today-jump" onClick={jumpNow}>Сейчас</button>}
              {pickerOpen && (
                <DateJumpSheet
                  initial={selectedISO}
                  onPick={(d) => setSelectedISO(d)}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            {tasks.length > 0 && (
              <div className="today-summary" data-testid="text-summary">{tasks.length} задач · {closed.length} закрыто</div>
            )}
          </div>
          {allday.length > 0 && (
            <div className="cal-allday today-pad" data-testid="allday">
              <span className="cal-allday-label">весь<br />день</span>
              <div className="cal-allday-chips">
                {(alldayExpanded ? allday : allday.slice(0, 2)).map((t) => {
                  const c = resolveColor(t.project_id, byId);
                  return (
                    <button
                      key={t.id}
                      className="cal-chip"
                      style={{
                        background: c ? `${c}22` : "var(--surface)",
                        color: c ?? "var(--text)",
                        borderLeftColor: priorityColor(t.priority) ?? "transparent",
                      }}
                      onClick={() => onOpenTask?.(t)}
                    >
                      {t.title}
                    </button>
                  );
                })}
                {!alldayExpanded && allday.length > 2 && (
                  <button className="cal-chip cal-chip-more" data-testid="btn-allday-expand" onClick={() => setAlldayExpanded(true)}>
                    +{allday.length - 2} ещё
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {state === "loading" ? skeleton
          : state === "error" ? errorBlock
          : (
            <DayTimeline
              tasks={timed}
              byId={byId}
              isToday={isToday}
              autoScroll={false}
              gridRef={gridRef}
              scrollToNowKey={scrollNowKey}
              scrollToHour={5}
              scrollToHourKey={scrollHourKey}
              onCreateDraft={openDraft}
              draft={draft}
              onDraftChange={(title) => setDraft((d) => (d ? { ...d, title } : d))}
              onDraftCommit={commitDraft}
              onDraftCancel={() => setDraft(null)}
              onDraftRetry={retryDraft}
              onDraftResize={(r) => setDraft((d) => (d ? { ...d, ...r } : d))}
              onToggle={toggle}
              onOpen={onOpenTask}
              onResize={resize}
              nowAnchorId="today-now"
            />
          )}
        {draft?.state === "editing" && (
          <div className="cal-accessory" ref={accessoryRef}>
            {/* onMouseDown preventDefault: не дать инпуту потерять фокус ДО клика (blur уже коммитит — но порядок важен для consistency) */}
            <button onMouseDown={(e) => e.preventDefault()} onClick={commitDraft}>Готово</button>
          </div>
        )}
      </div>
    );
  }

  // ── вид «Задачи» (гибрид-список) ────────────────────────────────────────
  const nothing = overdue.length === 0 && allday.length === 0 && closed.length === 0;
  return (
    <div className="screen today">
      <div className="today-head">
        <div className="today-pad">
          <button className="today-back" onClick={() => onViewChange("timeline")}>
            <IcoBack /><span>Таймлайн</span>
          </button>
          <h1 style={{ marginTop: "var(--s2)" }}>Сегодня</h1>
        </div>
      </div>

      {state === "loading" ? skeleton
        : state === "error" ? errorBlock
        : (
          <div className="today-pad today-tasks">
            <button className="entry-card" onClick={onOpenInbox}>
              <span className="lead"><IcoInbox /></span>
              <span className="grow">Входящие</span>
              {inboxCount > 0 && <span className="count">{inboxCount}</span>}
              <span className="chev"><IcoChevron /></span>
            </button>

            <div className="today-qa">
              <QuickAddBar onAdd={onQuickAdd} placeholder="Новая задача на сегодня…" />
            </div>

            {overdue.length > 0 && (
              <>
                <button className="section-label section-overdue section-toggle" data-testid="overdue-toggle"
                  onClick={() => setShowOverdue((v) => !v)}>
                  <span>Просрочено · {overdue.length}</span>
                  <span className={`tree-chev ${showOverdue ? "open" : ""}`}><IcoChevron /></span>
                </button>
                {showOverdue && groupByProject(overdue, byId).map((g) => (
                  <div key={g.project?.id ?? "none"} data-testid="overdue-group">
                    <div className="section-sublabel">
                      <span>{g.project ? `${g.project.icon ? g.project.icon + " " : ""}${g.project.name}` : "Без проекта"}</span>
                      <span className="section-subcount mono">{g.tasks.length}</span>
                    </div>
                    {renderList(g.tasks)}
                  </div>
                ))}
              </>
            )}

            {allday.length > 0 && (
              <>
                <div className="section-label">Без времени · {allday.length}</div>
                {renderList(allday)}
              </>
            )}

            {closed.length > 0 && (
              <>
                <button className="section-label section-toggle" onClick={() => setShowDone((v) => !v)}>
                  <span>Закрыто · {closed.length}</span>
                  <span className={`tree-chev ${showDone ? "open" : ""}`}><IcoChevron /></span>
                </button>
                {showDone && renderList(closed)}
              </>
            )}

            {nothing && (
              <div className="state-stub" style={{ marginTop: "var(--s4)" }}>
                <svg className="state-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 0 0 7 0" /><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="15" cy="10" r="0.6" fill="currentColor" />
                </svg>
                <div className="state-title">День свободен</div>
                <div className="state-sub">Ни одной задачи на сегодня. Запиши первую — или отдохни.</div>
                <button
                  className="btn btn-block"
                  style={{ marginTop: "var(--s3)", width: "auto" }}
                  onClick={() => (document.querySelector(".today-qa input") as HTMLInputElement | null)?.focus()}
                >Добавить задачу</button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
