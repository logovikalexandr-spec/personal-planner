import { useCallback, useEffect, useMemo, useState } from "react";
import { getDayTasks, getProjects, getStages, getTasksRange } from "../api";
import { localISO, weekDays } from "../lib/calDates";
import type { AiNote, Project, Stage } from "../types";
import { tg } from "../telegram";
import { WorkoutLog } from "../components/WorkoutLog";
import { makeWorkoutApi } from "../components/workoutApi";
import "../components/workout-log.css";

// ── T4 «Цели» (мокап база-проекта-v3/pages/T4-celi.html) ──
// Список проектов-целей: A1 пульс · A2-A7 карточка (имя→деталь·кольцо%шанс·полоски
// этапов·веха·AI-заметка) · A8 новый проект. Пульс/статус — derive client-side
// из projects+stages+tasks (ZERO-AFK: бэк LLM не зовёт, AI-поля пишет Claude).

const MONTHS_ABBR = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function fmtTargetShort(iso?: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${d} ${MONTHS_ABBR[m - 1]}`;
}

function latestNote(p: Project): AiNote | null {
  const notes = p.ai_notes;
  if (!notes || notes.length === 0) return null;
  return [...notes].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

// проект «отстаёт», если последняя AI-заметка = risk ИЛИ есть просроченный этап
function isBehind(p: Project, stages: Stage[]): boolean {
  const note = latestNote(p);
  return note?.type === "risk" || stages.some((s) => s.status === "late");
}

// активный этап = тот, что в работе ИЛИ просрочен (late = блокирующий, тоже «текущий»)
function activeIdx(stages: Stage[]): number {
  return stages.findIndex((s) => s.status === "current" || s.status === "late");
}

// «этап N / M»: N = позиция активного этапа (current|late), иначе число закрытых
function stagePosition(stages: Stage[]): { pos: number; total: number } {
  const total = stages.length;
  const ai = activeIdx(stages);
  const done = stages.filter((s) => s.status === "done").length;
  return { pos: ai >= 0 ? ai + 1 : done, total };
}

// следующая веха = активный этап (current|late), иначе первый будущий
function nextStage(stages: Stage[]): Stage | null {
  const ai = activeIdx(stages);
  if (ai >= 0) return stages[ai];
  return stages.find((s) => s.status === "future") ?? null;
}

const IcoBolt = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </svg>
);
const IcoWarn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L2 20h20L12 3z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

function ProjectCard({ p, stages, onOpenWorkout }: { p: Project; stages: Stage[]; onOpenWorkout: () => void }) {
  const c = p.color || "var(--accent)";
  const { pos, total } = stagePosition(stages);
  const target = fmtTargetShort(p.target_date);
  const veha = nextStage(stages);
  const note = latestNote(p);
  const meta = [target ? `срок ИИ: до ${target}` : null, total > 0 ? `этап ${pos} / ${total}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="t4-card"
      style={{ ["--c" as string]: c }}
      data-testid={`goal-card-${p.id}`}
      role="button"
      tabIndex={0}
    >
      <div className="t4-top">
        <div className="t4-name" data-testid={`goal-name-${p.id}`}>{p.name}</div>
        <div className="t4-ring" data-testid={`goal-ring-${p.id}`}>
          <div className="v">{p.success_probability}%</div>
          <div className="l">ШАНС</div>
        </div>
      </div>

      {meta && <div className="t4-meta">{meta}</div>}

      {total > 0 && (
        <div className="t4-stages" data-testid={`goal-stages-${p.id}`}>
          {stages.map((s) => (
            <i key={s.id} className={s.status === "done" || s.status === "current" || s.status === "late" ? "on" : ""} />
          ))}
        </div>
      )}

      {veha && (
        <div className="t4-next">
          След. веха: <b>{veha.name}</b>
        </div>
      )}

      {note && (note.type === "accelerate" || note.type === "risk") && (
        <div className={`t4-ai ${note.type === "risk" ? "risk" : "fast"}`} data-testid={`goal-ai-${p.id}`}>
          <span className="t4-ai-ic">{note.type === "risk" ? <IcoWarn /> : <IcoBolt />}</span>
          <span>{note.text}</span>
        </div>
      )}

      <button
        className="t4-workout"
        data-testid={`goal-workout-${p.id}`}
        onClick={(e) => { e.stopPropagation(); onOpenWorkout(); }}
      >
        <span>🏋 Тренировки</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

export function Goals() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stagesByProject, setStagesByProject] = useState<Record<number, Stage[]>>({});
  const [todayN, setTodayN] = useState(0);
  const [week, setWeek] = useState({ done: 0, total: 0 });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [workoutGoalId, setWorkoutGoalId] = useState<number | null>(null);
  const workoutApi = useMemo(() => (workoutGoalId == null ? null : makeWorkoutApi(workoutGoalId)), [workoutGoalId]);
  const workoutGoalName = projects.find((p) => p.id === workoutGoalId)?.name ?? "Цель";

  const load = useCallback(async () => {
    setState("loading");
    try {
      const ps = await getProjects();
      const goals = ps.filter((p) => p.success_probability != null && !p.is_inbox);
      const stagesArr = await Promise.all(goals.map((g) => getStages(g.id)));
      const map: Record<number, Stage[]> = {};
      goals.forEach((g, i) => (map[g.id] = stagesArr[i]));

      const goalIds = new Set(goals.map((g) => g.id));
      const wd = weekDays(new Date());
      const [todayTasks, weekTasks] = await Promise.all([
        getDayTasks(localISO(new Date())),
        getTasksRange(localISO(wd[0]), localISO(wd[6])),
      ]);
      const tN = todayTasks.filter((t) => t.project_id != null && goalIds.has(t.project_id)).length;
      const wt = weekTasks.filter((t) => t.project_id != null && goalIds.has(t.project_id));

      setProjects(goals);
      setStagesByProject(map);
      setTodayN(tN);
      setWeek({ done: wt.filter((t) => t.status === "done").length, total: wt.length });
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pulse = useMemo(() => {
    const behind = projects.filter((p) => isBehind(p, stagesByProject[p.id] ?? [])).length;
    return { count: projects.length, onTrack: projects.length - behind, behind };
  }, [projects, stagesByProject]);

  const onNew = useCallback(() => {
    const t = tg();
    const msg = "Новый проект-цель разбирается с ИИ в Claude Code: вероятность, срок, этапы. Карточка появится заполненной.";
    if (t?.showPopup) t.showPopup({ title: "Новый проект", message: msg, buttons: [{ type: "ok" }] });
    else if (t?.showAlert) t.showAlert(msg);
  }, []);

  if (state === "loading") {
    return (
      <div className="screen t4" data-testid="goals-loading">
        <h1>Цели</h1>
        <div className="sub">Большие намерения. Разобраны с ИИ, прогресс растёт от задач.</div>
        <div className="t4-pulse skeleton" />
        <div className="t4-card skeleton" />
        <div className="t4-card skeleton" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="screen t4" data-testid="goals-error">
        <h1>Цели</h1>
        <div className="state-stub">
          <div className="state-ico"><IcoWarn /></div>
          <div className="state-title">Не удалось загрузить</div>
          <button className="lnk" style={{ marginTop: 10 }} onClick={() => void load()}>Повторить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen t4" data-testid="goals-ready">
      <h1>Цели</h1>
      <div className="sub">Большие намерения. Разобраны с ИИ, прогресс растёт от задач.</div>

      <div className="t4-pulse" data-testid="goals-pulse">
        <div className="t4-pulse-lbl">ПУЛЬС · ОБЗОР</div>
        <div className="t4-pulse-big">
          <b>{pulse.count}</b> {plural(pulse.count, "проект", "проекта", "проектов")}
          {pulse.onTrack > 0 && (
            <>
              {" · "}
              <span className="t4-ok"><span className="t4-dot ok" />{pulse.onTrack} в графике</span>
            </>
          )}
          {pulse.behind > 0 && (
            <>
              {" · "}
              <span className="t4-bad"><span className="t4-dot bad" />{pulse.behind} отстаёт</span>
            </>
          )}
        </div>
        <div className="t4-pulse-small">
          сегодня {todayN} {plural(todayN, "задача", "задачи", "задач")} по целям · неделя {week.done}/{week.total} закрыто
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="state-stub" data-testid="goals-empty">
          <div className="state-ico"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg></div>
          <div className="state-title">Пока нет целей</div>
          <div className="state-sub">Разбери первый проект с ИИ — появится карточка с шансом, сроком и этапами.</div>
        </div>
      ) : (
        <>
          <div className="seclbl">Активные</div>
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} stages={stagesByProject[p.id] ?? []} onOpenWorkout={() => setWorkoutGoalId(p.id)} />
          ))}
        </>
      )}

      <button className="t4-newbtn" data-testid="goal-new" onClick={onNew}>
        + Новый проект — разобрать с ИИ
      </button>

      {workoutGoalId != null && workoutApi && (
        <div className="wl-overlay" data-testid="workout-overlay">
          <WorkoutLog
            goalId={workoutGoalId}
            goalName={workoutGoalName}
            api={workoutApi}
            onBack={() => setWorkoutGoalId(null)}
          />
        </div>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
