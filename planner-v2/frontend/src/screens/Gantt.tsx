import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getProjects, getStages, getTasks } from "../api";
import { useRefreshSignal } from "../lib/refreshSignal";
import { addDays, parseISO } from "../lib/calDates";
import {
  PPD, barPx, barStatusClass, buildColumns, criticalPathIds,
  dayDiff, hasConflict, rangeOf, trackWidth, xPx, type DateRange, type Zoom,
} from "../lib/ganttLayout";
import type { Project, Stage, Task } from "../types";
import { priorityColor } from "../lib/projectColor";
import { tg } from "../telegram";
import { Sheet } from "../components/Sheet";

// ── T3 «Гант» — Волна 1 (read-only PM-вид). Мокапы: база-проекта-v3/pages/T3a/T3b + flows + состояния.
// Два режима: «Все проекты» (строка=проект) и «По проекту» (строки=этапы + задачи под текущим).
// Драг/ресайз/правка дат = Волна 2 (см. COVERAGE-DEFER в T3-gantt.spec). ZERO-AFK: бэк LLM не зовёт.

const MON_GEN = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function fmtShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return `${d.getDate()} ${MON_GEN[d.getMonth()]}`;
}

const ZOOMS: { key: Zoom; label: string; ecode: string }[] = [
  { key: "day", label: "День", ecode: "A3" },
  { key: "week", label: "Нед", ecode: "A4" },
  { key: "month", label: "Мес", ecode: "A5" },
];

const ROW_H = 56;
const TASK_H = 32;

const IcoWarn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z" /><path d="M12 9v5M12 17.5h.01" />
  </svg>
);
const IcoGanttGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M4 6h10M4 12h14M4 18h7" /><circle cx="19" cy="18" r="2.4" /></svg>
);

// ── вспом. геометрия: собрать все значимые даты проекта/этапов для окна шкалы ──
function projectDates(stages: Stage[], project: Project): Date[] {
  const ds: Date[] = [];
  for (const s of stages) {
    if (s.start_date) ds.push(parseISO(s.start_date));
    if (s.end_date) ds.push(parseISO(s.end_date));
    if (s.is_milestone && s.milestone_date) ds.push(parseISO(s.milestone_date));
  }
  if (project.target_date) ds.push(parseISO(project.target_date));
  return ds;
}

// ── строка-проект / строка-этап / строка-задача (для режимов) ──
interface RowDef { kind: "project" | "stage" | "task"; height: number; }

export function Gantt() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stagesBy, setStagesBy] = useState<Record<number, Stage[]>>({});
  const [tasksBy, setTasksBy] = useState<Record<number, Task[]>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const [mode, setMode] = useState<"all" | "project">("all");
  const [zoom, setZoom] = useState<Zoom>("month");
  const [projId, setProjId] = useState<number | null>(null);
  const [sheetStage, setSheetStage] = useState<Stage | null>(null);
  const [pop, setPop] = useState<{ stage: Stage; x: number; y: number; projColor: string } | null>(null);

  const today = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const ps = (await getProjects()).filter((p) => !p.is_inbox);
      const stagesArr = await Promise.all(ps.map((p) => getStages(p.id)));
      const sMap: Record<number, Stage[]> = {};
      ps.forEach((p, i) => (sMap[p.id] = stagesArr[i]));
      // на Гант попадают проекты с этапами ИЛИ с дедлайном (target_date):
      // стейджлес-с-дедлайном → строка-флаг в «Все» + состояние «нет этапов» при заходе внутрь.
      const board = ps.filter((p) => (sMap[p.id]?.length ?? 0) > 0 || p.target_date);
      setProjects(board);
      setStagesBy(sMap);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useRefreshSignal(load); // pull-to-refresh

  // задачи выбранного проекта (для мини-баров под текущим этапом) — ленивая дозагрузка
  useEffect(() => {
    if (mode !== "project" || projId == null || tasksBy[projId]) return;
    let alive = true;
    getTasks("all", projId, true)
      .then((ts) => { if (alive) setTasksBy((m) => ({ ...m, [projId]: ts })); })
      .catch(() => { if (alive) setTasksBy((m) => ({ ...m, [projId]: [] })); });
    return () => { alive = false; };
  }, [mode, projId, tasksBy]);

  const openProject = useCallback((id: number) => { setProjId(id); setMode("project"); }, []);
  const backToAll = useCallback(() => { setMode("all"); setSheetStage(null); setPop(null); }, []);

  const onAddStageHint = useCallback(() => {
    const t = tg();
    const msg = "Этапы проекта задаёт ИИ в Claude Code при разборе цели. Попроси разбить цель на этапы — они появятся на Ганте.";
    if (t?.showPopup) t.showPopup({ title: "Этапы", message: msg, buttons: [{ type: "ok" }] });
    else if (t?.showAlert) t.showAlert(msg);
  }, []);

  // ── состояния ──
  if (state === "loading") return <GanttSkeleton />;
  if (state === "error") {
    return (
      <div className="screen t3" data-testid="gantt-error">
        <h1>Гант</h1>
        <div className="g-state">
          <div className="ic"><IcoWarn /></div>
          <div className="t">Не удалось загрузить Гант</div>
          <div className="s">Проверь соединение и попробуй ещё раз.</div>
          <button className="btn" data-testid="gantt-retry" onClick={() => void load()}>Повторить</button>
        </div>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="screen t3" data-testid="gantt-empty">
        <h1>Гант</h1>
        <div className="g-sub">временна́я раскладка проектов</div>
        <div className="g-seg"><button className="on">Все проекты</button><button>По проекту</button></div>
        <div className="g-state">
          <div className="ic"><IcoGanttGlyph /></div>
          <div className="t">Пока нет проектов</div>
          <div className="s">Гант покажет этапы проектов на шкале времени. Заведи первый проект в «Целях».</div>
        </div>
      </div>
    );
  }

  const cur = mode === "project" ? projects.find((p) => p.id === projId) ?? projects[0] : null;

  return (
    <div className="screen t3" data-testid={mode === "all" ? "gantt-all" : "gantt-project"}>
      {mode === "project" && (
        <button className="g-back" data-testid="gantt-back" onClick={backToAll}>‹ Все проекты</button>
      )}
      <h1>Гант</h1>
      {mode === "all" && <div className="g-sub">временна́я раскладка проектов</div>}

      <div className="g-seg" data-testid="gantt-seg">
        <button className={mode === "all" ? "on" : ""} data-testid="seg-all" onClick={() => setMode("all")}>
          Все проекты
        </button>
        <button className={mode === "project" ? "on" : ""} data-testid="seg-project" onClick={() => { setMode("project"); if (projId == null && projects[0]) setProjId(projects[0].id); }}>
          По проекту
        </button>
      </div>

      {mode === "all"
        ? <GanttAll projects={projects} stagesBy={stagesBy} today={today} zoom={zoom} setZoom={setZoom}
            onRow={openProject} onStage={setSheetStage} onMile={setPop} />
        : cur && <GanttProject project={cur} stages={stagesBy[cur.id] ?? []} tasks={tasksBy[cur.id] ?? []}
            today={today} zoom={zoom} setZoom={setZoom} projects={projects} onPick={setProjId}
            onStage={setSheetStage} onMile={setPop} onAddStage={onAddStageHint} />}

      {sheetStage && (
        <Sheet onClose={() => setSheetStage(null)}>
          <StageSheet
            stage={sheetStage}
            project={mode === "project" ? cur! : projects.find((p) => p.id === sheetStage.project_id) ?? projects[0]}
            stages={stagesBy[sheetStage.project_id] ?? []}
            tasks={tasksBy[sheetStage.project_id] ?? []}
          />
        </Sheet>
      )}
      {pop && <MilestonePop pop={pop} today={today} onClose={() => setPop(null)} />}
    </div>
  );
}

// ════════ режим «Все проекты» ════════
function GanttAll({
  projects, stagesBy, today, zoom, setZoom, onRow, onStage, onMile,
}: {
  projects: Project[]; stagesBy: Record<number, Stage[]>; today: Date; zoom: Zoom;
  setZoom: (z: Zoom) => void; onRow: (id: number) => void;
  onStage: (s: Stage) => void; onMile: (p: { stage: Stage; x: number; y: number; projColor: string }) => void;
}) {
  const allDates = useMemo(() => {
    const ds: Date[] = [];
    for (const p of projects) ds.push(...projectDates(stagesBy[p.id] ?? [], p));
    return ds;
  }, [projects, stagesBy]);
  const range = useMemo(() => rangeOf(allDates, today, zoom), [allDates, today, zoom]);
  const stageCount = projects.reduce((n, p) => n + (stagesBy[p.id]?.length ?? 0), 0);

  return (
    <>
      <PeriodRow range={range} zoom={zoom} setZoom={setZoom}
        meta={`${projects.length} ${plural(projects.length, "проект", "проекта", "проектов")} · ${stageCount} ${plural(stageCount, "этап", "этапа", "этапов")}`} />
      <GanttGrid
        range={range} zoom={zoom} today={today} labelW={92}
        cornerLabel="ПРОЕКТ"
        rows={projects.map((p) => ({ kind: "project", height: ROW_H }) as RowDef)}
        renderLabel={(i) => {
          const p = projects[i];
          return (
            <div className="glabel" data-testid={`grow-${p.id}`} style={{ width: 92, ["--c" as string]: p.color || "var(--accent)" }}
              role="button" onClick={() => onRow(p.id)}>
              <div className="nm">{p.name}</div>
              <div className="tg"><span className="d" />{p.slug?.toUpperCase() || p.name.toUpperCase()}</div>
            </div>
          );
        }}
        renderTrack={(i, ppd) => {
          const p = projects[i];
          const stages = stagesBy[p.id] ?? [];
          return <ProjectTrack project={p} stages={stages} range={range} ppd={ppd} onStage={onStage} onMile={onMile} showPct={false} />;
        }}
      />
      <Legend />
    </>
  );
}

// дорожка одного проекта (в режиме «Все»): бары этапов + вехи + флаг target_date
function ProjectTrack({
  project, stages, range, ppd, onStage, onMile, showPct,
}: {
  project: Project; stages: Stage[]; range: DateRange; ppd: number;
  onStage: (s: Stage) => void; onMile: (p: { stage: Stage; x: number; y: number; projColor: string }) => void; showPct: boolean;
}) {
  const c = project.color || "var(--accent)";
  const targetISO = project.target_date ?? null;
  // флаг target рисуем отдельно ТОЛЬКО если на эту дату нет вехи-этапа (иначе дубль-ромб перехватывает тап)
  const targetCovered = targetISO != null && stages.some((s) => s.is_milestone && s.milestone_date === targetISO);
  return (
    <div className="gtrack" style={{ width: trackWidth(range.from, range.to, ppd), ["--c" as string]: c }}>
      {stages.map((s) => <StageBar key={s.id} s={s} range={range} ppd={ppd} crit={false} showPct={showPct} onStage={onStage} onMile={onMile} projColor={c} targetISO={targetISO} />)}
      {targetISO && !targetCovered && (
        <MilestoneDiamond
          left={xPx(parseISO(targetISO), range.from, ppd)}
          flag label={fmtShort(targetISO)}
        />
      )}
    </div>
  );
}

// ════════ режим «По проекту» ════════
function GanttProject({
  project, stages, tasks, today, zoom, setZoom, projects, onPick, onStage, onMile, onAddStage,
}: {
  project: Project; stages: Stage[]; tasks: Task[]; today: Date; zoom: Zoom; setZoom: (z: Zoom) => void;
  projects: Project[]; onPick: (id: number) => void;
  onStage: (s: Stage) => void; onMile: (p: { stage: Stage; x: number; y: number; projColor: string }) => void; onAddStage: () => void;
}) {
  const c = project.color || "var(--accent)";
  const range = useMemo(() => rangeOf(projectDates(stages, project), today, zoom), [stages, project, today, zoom]);
  const byId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  // CPM считаем по всей цепочке (вкл. done для верных длительностей/предков),
  // подсвечиваем только незакрытую часть — узкое место, что ещё впереди (как в мокапе 3→4).
  const crit = useMemo(() => {
    const full = criticalPathIds(stages);
    return new Set([...full].filter((id) => byId.get(id)?.status !== "done"));
  }, [stages, byId]);

  // строки: этап, и если текущий — его задачи следом
  const curStage = stages.find((s) => s.status === "current") ?? null;
  const curTasks = curStage
    ? tasks.filter((t) => t.stage_id === curStage.id && t.due_date)
    : [];

  const critPair = useMemo(() => {
    // подпись критпути: первые два имени незакрытой цепочки
    const names = stages.filter((s) => crit.has(s.id)).map((s) => s.name);
    return names.length >= 2 ? `${names[0]} → ${names[1]}` : null;
  }, [stages, crit]);

  // переключение проекта (циклом по списку с этапами)
  const cyclePick = useCallback(() => {
    const i = projects.findIndex((p) => p.id === project.id);
    const next = projects[(i + 1) % projects.length];
    if (next) onPick(next.id);
  }, [projects, project.id, onPick]);

  // нет этапов — сетка + пустая дорожка + подсказка
  if (stages.length === 0) {
    return (
      <div data-testid="gantt-nostages">
        <ProjChip project={project} onClick={cyclePick} />
        <div className="gantt">
          <div className="g-inner" style={{ width: 92 + trackWidth(range.from, range.to, PPD[zoom]) }}>
            <ScaleHeader range={range} zoom={zoom} labelW={92} cornerLabel="ЭТАП" />
            <div className="gbody"><div className="g-emptyrow">этапов ещё нет</div></div>
          </div>
        </div>
        <div className="g-state" style={{ padding: "26px 22px 0" }}>
          <div className="ic" style={{ width: 34, height: 34 }}><IcoGanttGlyph /></div>
          <div className="t">Нет этапов</div>
          <div className="s">Шкала готова, но у проекта пока нет этапов. Разбей цель на этапы — они лягут барами.</div>
          <button className="btn" data-testid="gantt-addstage" onClick={onAddStage}>Добавить этап</button>
        </div>
      </div>
    );
  }

  // плоский список строк с y-индексом этапа (для стрелок зависимостей)
  const rows: RowDef[] = [];
  const stageRowIndex = new Map<number, number>();
  stages.forEach((s) => {
    stageRowIndex.set(s.id, rows.length);
    rows.push({ kind: "stage", height: ROW_H });
    if (curStage && s.id === curStage.id) curTasks.forEach(() => rows.push({ kind: "task", height: TASK_H }));
  });

  // y-центр строки этапа по индексу
  const rowTop = (idx: number) => rows.slice(0, idx).reduce((a, r) => a + r.height, 0);
  const stageCenterY = (id: number) => { const i = stageRowIndex.get(id)!; return rowTop(i) + ROW_H / 2; };

  return (
    <div data-testid="gantt-project-body">
      <ProjChip project={project} onClick={cyclePick} />
      {critPair && (
        <div className="g-critnote" data-testid="gantt-critnote">
          <span className="gsw" /> Критический путь: <b>{critPair}</b>
        </div>
      )}
      <PeriodRow range={range} zoom={zoom} setZoom={setZoom}
        meta={`${stages.length} ${plural(stages.length, "этап", "этапа", "этапов")}`} />
      <GanttGrid
        range={range} zoom={zoom} today={today} labelW={104} cornerLabel="ЭТАП / ЗАДАЧА"
        projColor={c}
        rows={rows}
        deps={(ppd) => (
          <DepArrows stages={stages} byId={byId} crit={crit} range={range} ppd={ppd} centerY={stageCenterY} />
        )}
        renderRow={(i, ppd) => {
          const r = rows[i];
          if (r.kind === "task") {
            // найти задачу по позиции среди task-строк текущего этапа
            const before = rows.slice(0, i).filter((x) => x.kind === "task").length;
            const t = curTasks[before];
            return <TaskRow key={`t${i}`} t={t} range={range} ppd={ppd} projColor={c} />;
          }
          // stage row: по позиции среди stage-строк
          const sIdx = rows.slice(0, i + 1).filter((x) => x.kind === "stage").length - 1;
          const s = stages[sIdx];
          return (
            <div className="grow" style={{ height: ROW_H, ["--c" as string]: c }} key={`s${s.id}`}>
              <div className="glabel" data-testid={`gstage-${s.id}`} style={{ width: 104 }}>
                <div className="nm">{s.order_index + 1} · {s.name}</div>
                {(s.start_date || s.status === "current") && (
                  <div className="tg">{[fmtShort(s.start_date), s.status === "current" ? "текущий" : null].filter(Boolean).join(" · ")}</div>
                )}
              </div>
              <div className="gtrack" style={{ width: trackWidth(range.from, range.to, ppd) }}>
                <StageBar s={s} range={range} ppd={ppd} crit={crit.has(s.id)} showPct onStage={onStage} onMile={onMile} projColor={c} targetISO={project.target_date} />
              </div>
            </div>
          );
        }}
      />
      <Keys />
    </div>
  );
}

function TaskRow({ t, range, ppd, projColor }: { t: Task | undefined; range: DateRange; ppd: number; projColor: string }) {
  if (!t || !t.due_date) return <div className="grow" style={{ height: TASK_H }} />;
  const start = parseISO(t.due_date);
  const end = t.end_date ? parseISO(t.end_date) : start;
  const box = barPx(start, end, range.from, ppd);
  const prioDot = priorityColor(t.priority) ?? projColor;
  return (
    <div className="grow" style={{ height: TASK_H }} data-testid={`gtask-${t.id}`}>
      <div className="glabel task" style={{ width: 104 }}>
        <span className="tdot" style={{ background: prioDot }} />
        <span className="nm tnm">{t.title}</span>
      </div>
      <div className="gtrack" style={{ width: trackWidth(range.from, range.to, ppd) }}>
        <div className={`gtbar ${t.status === "done" ? "tdone" : "topen"}`} style={{ left: box.left, width: box.width }} />
      </div>
    </div>
  );
}

// ── общий каркас сетки с горизонт-скроллом + «сегодня»-кнопкой ──
function GanttGrid({
  range, zoom, today, labelW, cornerLabel, projColor, rows, renderLabel, renderTrack, renderRow, deps,
}: {
  range: DateRange; zoom: Zoom; today: Date; labelW: number; cornerLabel: string; projColor?: string;
  rows: RowDef[];
  renderLabel?: (i: number) => React.ReactNode;
  renderTrack?: (i: number, ppd: number) => React.ReactNode;
  renderRow?: (i: number, ppd: number) => React.ReactNode;
  deps?: (ppd: number) => React.ReactNode;
}) {
  const ppd = PPD[zoom];
  const trackW = trackWidth(range.from, range.to, ppd);
  const cols = useMemo(() => buildColumns(range, zoom), [range, zoom]);
  const todayPx = xPx(today, range.from, ppd);
  const todayInRange = dayDiff(range.from, today) >= 0 && dayDiff(today, range.to) >= 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayBtn, setTodayBtn] = useState<"l" | "r" | null>(null);

  const checkToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !todayInRange) { setTodayBtn(null); return; }
    const absX = labelW + todayPx;
    if (absX < el.scrollLeft + labelW + 8) setTodayBtn("l");
    else if (absX > el.scrollLeft + el.clientWidth - 8) setTodayBtn("r");
    else setTodayBtn(null);
  }, [labelW, todayPx, todayInRange]);

  useEffect(() => { checkToday(); }, [checkToday]);

  const jumpToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, labelW + todayPx - el.clientWidth / 2), behavior: "smooth" });
  }, [labelW, todayPx]);

  return (
    <div className="gantt" ref={scrollRef} onScroll={checkToday} data-testid="gantt-grid">
      <div className="g-inner" style={{ width: labelW + trackW, ...(projColor ? { ["--c" as string]: projColor } : {}) }}>
        <ScaleHeaderCols cols={cols} labelW={labelW} cornerLabel={cornerLabel} trackW={trackW} />
        <div className="gbody">
          <div className="ggrid" style={{ left: labelW, width: trackW }}>
            {cols.slice(1).map((cc, i) => <i key={i} style={{ left: cc.leftPx }} />)}
          </div>
          {todayInRange && <div className="gtoday" data-testid="gantt-today" style={{ left: labelW + todayPx }} />}
          {deps?.(ppd)}
          {rows.map((_, i) =>
            renderRow
              ? renderRow(i, ppd)
              : (
                <div className="grow" style={{ height: rows[i].height }} key={i}>
                  {renderLabel?.(i)}
                  {renderTrack?.(i, ppd)}
                </div>
              ),
          )}
        </div>
      </div>
      {todayBtn && (
        <button className={`g-todaybtn ${todayBtn}`} data-testid="gantt-todaybtn" onClick={jumpToday}>
          {todayBtn === "l" ? "◀ Сегодня" : "Сегодня ▶"}
        </button>
      )}
    </div>
  );
}

function ScaleHeaderCols({ cols, labelW, cornerLabel, trackW }: { cols: { label: string; leftPx: number; widthPx: number }[]; labelW: number; cornerLabel: string; trackW: number }) {
  return (
    <div className="ghead">
      <div className="corner" style={{ width: labelW }}>{cornerLabel}</div>
      <div className="g-scale" style={{ width: trackW }}>
        {cols.map((c, i) => <div className="mon" key={i} style={{ left: c.leftPx, width: c.widthPx }}>{c.label}</div>)}
      </div>
    </div>
  );
}

// для no-stages состояния
function ScaleHeader({ range, zoom, labelW, cornerLabel }: { range: DateRange; zoom: Zoom; labelW: number; cornerLabel: string }) {
  const cols = buildColumns(range, zoom);
  return <ScaleHeaderCols cols={cols} labelW={labelW} cornerLabel={cornerLabel} trackW={trackWidth(range.from, range.to, PPD[zoom])} />;
}

// ── бар этапа (или ромб, если веха) ──
function StageBar({
  s, range, ppd, crit, showPct, onStage, onMile, projColor, targetISO,
}: {
  s: Stage; range: DateRange; ppd: number; crit: boolean; showPct: boolean;
  onStage: (s: Stage) => void; onMile: (p: { stage: Stage; x: number; y: number; projColor: string }) => void; projColor: string;
  targetISO?: string | null;
}) {
  if (s.is_milestone && s.milestone_date) {
    const left = xPx(parseISO(s.milestone_date), range.from, ppd);
    const flag = targetISO != null && s.milestone_date === targetISO; // веха-дедлайн = светлый ромб
    return <MilestoneDiamond left={left} flag={flag} label={fmtShort(s.milestone_date)} onClick={() => onMile({ stage: s, x: left, y: 0, projColor })} />;
  }
  if (!s.start_date || !s.end_date) return null;
  const box = barPx(parseISO(s.start_date), parseISO(s.end_date), range.from, ppd);
  const kind = barStatusClass(s.status);
  return (
    <>
      <div
        className={`gbar ${kind}${crit ? " crit" : ""}`}
        data-testid={`gbar-${s.id}`}
        style={{ left: box.left, width: box.width }}
        role="button"
        onClick={() => onStage(s)}
      >
        {kind === "cur" && <div className="fill" style={{ width: `${s.progress}%` }} />}
        {showPct && kind === "cur" && <span className="pct">{s.progress}%</span>}
      </div>
      {kind === "late" && <span className="glate" data-testid={`glate-${s.id}`} style={{ left: box.left + 2 }}>!</span>}
    </>
  );
}

function MilestoneDiamond({ left, label, flag, onClick }: { left: number; label?: string | null; flag?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <>
      <div className={`gmile${flag ? " flag" : ""}`} style={{ left }} role="button" data-testid="gmile" onClick={onClick} />
      {label && <div className="gmlabel" style={{ left }}>{label}</div>}
    </>
  );
}

// ── стрелки зависимостей + критпуть (read-only) ──
function DepArrows({
  stages, byId, crit, range, ppd, centerY,
}: {
  stages: Stage[]; byId: Map<number, Stage>; crit: Set<number>; range: DateRange; ppd: number; centerY: (id: number) => number;
}) {
  const arrows: React.ReactNode[] = [];
  for (const s of stages) {
    if (!s.start_date) continue;
    for (const depId of s.depends_on_ids ?? []) {
      const from = byId.get(depId);
      if (!from?.end_date || !s.start_date) continue;
      const fromX = xPx(parseISO(from.end_date), range.from, ppd) + ppd; // правый конец источника
      const toX = xPx(parseISO(s.start_date), range.from, ppd);          // левый конец приёмника
      const fromY = centerY(from.id);
      const toY = centerY(s.id);
      const conflict = hasConflict(s, byId);
      const onCrit = crit.has(s.id) && crit.has(from.id);
      const midX = Math.max(fromX, toX) + 6;
      const d = `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;
      const col = conflict ? "var(--danger)" : "var(--accent)";
      arrows.push(
        <path key={`${from.id}-${s.id}`} d={d} stroke={col} strokeWidth={onCrit ? 1.7 : 1.4}
          fill="none" strokeDasharray={conflict ? "4 3" : undefined} />,
      );
      // наконечник
      arrows.push(
        <path key={`${from.id}-${s.id}-h`} d={`M ${toX - 4} ${toY - 4} L ${toX} ${toY} L ${toX - 4} ${toY + 4}`}
          stroke={col} strokeWidth={1.4} fill="none" />,
      );
    }
  }
  if (arrows.length === 0) return null;
  return <svg className="gdep" data-testid="gantt-deps">{arrows}</svg>;
}

// ── шапка периода + зум ──
function PeriodRow({ range, zoom, setZoom, meta }: { range: DateRange; zoom: Zoom; setZoom: (z: Zoom) => void; meta: string }) {
  const label = `${MON_GEN[range.from.getMonth()]} – ${MON_GEN[range.to.getMonth()]} ${range.to.getFullYear()}`;
  return (
    <div className="g-periodrow">
      <div className="g-period">{cap(label)}<span>{meta}</span></div>
      <div className="g-zoom" data-testid="gantt-zoom">
        {ZOOMS.map((z) => (
          <button key={z.key} className={zoom === z.key ? "on" : ""} data-testid={`zoom-${z.key}`} onClick={() => setZoom(z.key)}>{z.label}</button>
        ))}
      </div>
    </div>
  );
}

function ProjChip({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button className="g-projchip" data-testid="gantt-projchip" style={{ ["--c" as string]: project.color || "var(--accent)" }} onClick={onClick}>
      {project.name} <span className="car">▾</span>
    </button>
  );
}

// ── шит «деталь этапа» ──
function StageSheet({ stage, project, stages, tasks }: { stage: Stage; project: Project; stages: Stage[]; tasks: Task[] }) {
  const c = project.color || "var(--accent)";
  const kind = barStatusClass(stage.status);
  const badge = kind === "cur" ? "текущий" : kind === "late" ? "отстаёт" : kind === "done" ? "сделано" : "впереди";
  const opens = stages.find((s) => (s.depends_on_ids ?? []).includes(stage.id)) ?? null;
  const stageTasks = tasks.filter((t) => t.stage_id === stage.id);
  const doneN = stageTasks.filter((t) => t.status === "done").length;
  return (
    <div data-testid="gantt-stage-sheet" style={{ ["--c" as string]: c }}>
      <div className="gsh-top">
        <span className="gsh-dot" />
        <div>
          <div className="gsh-title">Этап {stage.order_index + 1} · {stage.name}</div>
          <div className="gsh-sub">{project.name} · {badge} этап</div>
        </div>
      </div>
      <span className={`gbadge ${kind}`}>● {badge}</span>
      <div className="gpwrap">
        <div className="gptrack"><div className="gpfill" style={{ width: `${stage.progress}%` }} /></div>
        <div className="gpmeta"><span>прогресс {stage.progress}%</span>{stageTasks.length > 0 && <span>{doneN} из {stageTasks.length} задач</span>}</div>
      </div>
      <div className="gdates">
        <div className="gdcell"><div className="dl">Старт</div><div className="dv">{fmtShort(stage.start_date) ?? "—"}</div></div>
        <div className="gdcell"><div className="dl">Финиш</div><div className="dv">{fmtShort(stage.end_date) ?? "—"}</div></div>
      </div>
      {opens && (
        <div className="gdepline">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h12M13 6l6 6-6 6" /></svg>
          <span>Открывает <b>Этап {opens.order_index + 1} · {opens.name}</b></span>
        </div>
      )}
      {stageTasks.length > 0 && (
        <div style={{ margin: "4px 0 2px" }}>
          {stageTasks.slice(0, 5).map((t) => (
            <div key={t.id} className={`gstask ${t.status === "done" ? "is-done" : ""}`}>
              <span className="sd" style={{ background: priorityColor(t.priority) ?? "var(--text-muted)" }} />
              <span className="t">{t.title}</span>
              <span className="sm">{t.status === "done" ? "done" : fmtShort(t.due_date) ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── поповер вехи ──
function MilestonePop({ pop, today, onClose }: { pop: { stage: Stage; x: number; y: number; projColor: string }; today: Date; onClose: () => void }) {
  const s = pop.stage;
  const weeksLeft = s.milestone_date ? Math.max(0, Math.round(dayDiff(today, parseISO(s.milestone_date)) / 7)) : null;
  return (
    <Sheet onClose={onClose}>
      <div data-testid="gantt-mile-pop" style={{ ["--c" as string]: pop.projColor }}>
        <div className="gsh-top">
          <span className="gsh-dot" style={{ background: "var(--text)" }} />
          <div>
            <div className="gsh-title" style={{ fontSize: 15 }}>◆ {s.name}</div>
            <div className="gsh-sub">веха · {s.milestone_date ? fmtShort(s.milestone_date) : ""}</div>
          </div>
        </div>
        <div className="gdates" style={{ margin: "4px 0 0" }}>
          <div className="gdcell"><div className="dl">Дата</div><div className="dv">{fmtShort(s.milestone_date) ?? "—"}</div></div>
          {weeksLeft != null && <div className="gdcell"><div className="dl">Осталось</div><div className="dv">{weeksLeft} нед</div></div>}
        </div>
      </div>
    </Sheet>
  );
}

// ── легенды / скелетон ──
function Legend() {
  return (
    <div className="gfoot" data-testid="gantt-legend">
      <div className="it"><span className="gsw" style={{ background: "var(--success)" }} />сделано</div>
      <div className="it"><span className="gsw" style={{ background: "var(--accent-soft)", border: "1px dashed var(--accent)" }} />текущий</div>
      <div className="it"><span className="gsw" style={{ background: "color-mix(in srgb, var(--text-muted) 16%, transparent)", border: "1px solid var(--border)" }} />впереди</div>
      <div className="it"><span className="dia" />веха</div>
      <div className="it" style={{ color: "var(--danger)" }}><span className="gsw" style={{ background: "color-mix(in srgb, var(--danger) 18%, transparent)", border: "1px solid var(--danger)" }} />отставание</div>
      <div className="it" style={{ color: "var(--accent)" }}>▏сегодня</div>
    </div>
  );
}
function Keys() {
  return (
    <div className="gkeys" data-testid="gantt-keys">
      <span><i style={{ background: "var(--success)" }} /> готово</span>
      <span><i style={{ background: "var(--accent-soft)" }} /> в работе</span>
      <span><i style={{ background: "transparent", border: "1.4px dashed var(--text-muted)" }} /> впереди</span>
      <span><i style={{ background: "var(--accent)" }} /> крит. путь</span>
    </div>
  );
}
function GanttSkeleton() {
  return (
    <div className="screen t3" data-testid="gantt-loading">
      <h1>Гант</h1>
      <div className="g-sub">временна́я раскладка проектов</div>
      <div className="skeleton" style={{ height: 38, borderRadius: 10, margin: "12px 0" }} />
      <div className="gantt"><div className="g-inner">
        {[40, 30, 55, 25, 35].map((w, i) => (
          <div className="g-skrow" key={i}>
            <div className="skeleton g-skbar" style={{ width: 56 }} />
            <div style={{ flex: 1, position: "relative" }}>
              <div className="skeleton g-skbar" style={{ width: `${w}%`, marginLeft: `${i * 8}%` }} />
            </div>
          </div>
        ))}
      </div></div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
