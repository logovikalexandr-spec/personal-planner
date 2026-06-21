import "./theme.css";
import { createRoot } from "react-dom/client";
import { WorkoutLog } from "./components/WorkoutLog";
import type { WorkoutApi, WTemplate, WExercise, WSession, WHistPoint, WSet } from "./components/WorkoutLog";

/* Mock-preview Волны 1 (workout-лог). Бэк не нужен. НЕ прод. */

const EX: WExercise[] = [
  { id: 1, name: "Жим гантелей на наклонной 30°", muscle_group: "chest" },
  { id: 2, name: "Подтягивания широким хватом", muscle_group: "back" },
  { id: 3, name: "Тяга верхнего блока узким хватом", muscle_group: "back" },
  { id: 4, name: "Горизонтальная тяга блока сидя", muscle_group: "back" },
  { id: 5, name: "Махи гантелями в стороны", muscle_group: "delts" },
  { id: 6, name: "Тяга к лицу (Face Pull)", muscle_group: "delts" },
  { id: 7, name: "Сгибания на бицепс (наклон)", muscle_group: "biceps" },
  { id: 8, name: "Разгибания на трицепс", muscle_group: "triceps" },
  { id: 11, name: "Жим штанги лёжа", muscle_group: "chest" },
  { id: 12, name: "Тяга штанги в наклоне", muscle_group: "back" },
  { id: 13, name: "Армейский жим", muscle_group: "delts" },
  { id: 14, name: "Подтягивания с весом", muscle_group: "back" },
  { id: 15, name: "Вертикальная тяга блока", muscle_group: "back" },
  { id: 16, name: "Сгибания на бицепс штанга", muscle_group: "biceps" },
  { id: 17, name: "Молотки", muscle_group: "biceps" },
  { id: 21, name: "Приседания со штангой", muscle_group: "quads" },
  { id: 22, name: "Румынская тяга", muscle_group: "hamstrings" },
  { id: 23, name: "Жим ногами", muscle_group: "quads" },
  { id: 24, name: "Сгибания ног лёжа", muscle_group: "hamstrings" },
  { id: 25, name: "Подъём на носки стоя", muscle_group: "calves" },
  { id: 26, name: "Пресс — упор Паллоф", muscle_group: "core" },
  { id: 27, name: "Пресс — мёртвый жук", muscle_group: "core" },
  { id: 28, name: "Жим ногами (высокая постановка)", muscle_group: "glutes" },
  { id: 29, name: "Болгарские сплит-приседы", muscle_group: "glutes" },
  { id: 30, name: "Разгибания ног сидя", muscle_group: "quads" },
  { id: 31, name: "Сгибания ног сидя", muscle_group: "hamstrings" },
  { id: 32, name: "Сведение/разведение ног", muscle_group: "glutes" },
  { id: 33, name: "Подъём на носки сидя", muscle_group: "calves" },
];

const te = (id: number, sets: number, lo: number, hi: number, ct?: number): WTemplate["exercises"][number] =>
  ({ exercise_id: id, target_sets: sets, rep_low: lo, rep_high: hi, coach_target_weight: ct ?? null });

// порядок = реальная очередь чередования: Верх → Низ → Верх → Низ
const TEMPLATES: WTemplate[] = [
  { id: 1, name: "Верх-Сила", exercises: [
    te(11, 3, 6, 8), te(12, 3, 6, 8, 50), te(13, 3, 8, 10, 37.5), te(14, 3, 6, 10),
    te(15, 3, 10, 12), te(16, 3, 10, 12), te(8, 3, 10, 12),
  ] },
  { id: 2, name: "Низ-Квадрицепс", exercises: [
    te(21, 3, 6, 8), te(22, 3, 8, 10), te(23, 3, 10, 12), te(24, 3, 10, 12),
    te(25, 3, 12, 15), te(26, 3, 12, 12), te(27, 3, 8, 10),
  ] },
  { id: 3, name: "Верх-Гипертрофия", exercises: [
    te(1, 3, 8, 10, 24), te(2, 3, 8, 10), te(3, 3, 10, 12), te(4, 3, 10, 12),
    te(5, 4, 12, 15), te(6, 4, 12, 15), te(7, 3, 12, 12), te(17, 3, 12, 12), te(8, 3, 12, 15),
  ] },
  { id: 4, name: "Низ-Задняя цепь", exercises: [
    te(28, 3, 8, 10), te(29, 3, 10, 12), te(30, 3, 12, 15), te(31, 4, 12, 15),
    te(32, 4, 12, 15), te(33, 4, 15, 20), te(26, 3, 12, 12),
  ] },
];

function s(ex: number, w: number, reps: number): WSet { return { exercise_id: ex, set_index: 0, weight: w, reps, done: false }; }
const L = (ex: number, w: number, r: number): WSet[] => [s(ex, w, r), s(ex, w, r), s(ex, w, r)];

// прошлые рабочие подходы (авто-подстановка) — ВСЕ упражнения
const LAST: Record<number, WSet[]> = {
  1: L(1, 22, 10), 2: L(2, 0, 8), 3: L(3, 45, 12), 4: L(4, 45, 12), 5: L(5, 7, 15), 6: L(6, 11, 15),
  7: L(7, 20, 12), 8: L(8, 18, 12), 11: [s(11, 75, 8), s(11, 75, 6), s(11, 75, 6)], 12: L(12, 50, 8),
  13: L(13, 35, 10), 14: L(14, 0, 6), 15: L(15, 40, 10), 16: L(16, 20, 12), 17: L(17, 8, 12),
  21: L(21, 75, 8), 22: L(22, 45, 10), 23: L(23, 70, 10), 24: L(24, 50, 12), 25: L(25, 40, 18),
  26: L(26, 0, 12), 27: L(27, 0, 10), 28: L(28, 80, 10), 29: L(29, 8, 10), 30: L(30, 32, 12),
  31: L(31, 45, 15), 32: L(32, 54, 12), 33: L(33, 20, 20),
};

// сегодняшняя дата (локальная) — для демо «сделана на этой неделе» + итоги недели
function todayISO(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const SESSIONS: WSession[] = [
  // эта неделя — одна тренировка сделана (демо галочки + «следующая» + итоги недели)
  { id: 950, date: todayISO(), template_name: "Верх-Сила", duration_minutes: 80, set_count: 21,
    coach_note: "Жим лёжа 75 на 8,6,6 — держишь. Тяга 50 ровно. Армейский 35 → ставлю 37.5 кг. Хорошее начало недели." },
  { id: 901, date: "2026-06-19", template_name: "Верх-Гипертрофия", duration_minutes: 81, set_count: 27,
    coach_note: "Наклонный жим 24 кг на 10 во всех подходах — добил, ставлю 26 кг. Махи растут (+1 повтор). Спина: подтягивания идут легко — добавь 4-й подход." },
  { id: 900, date: "2026-06-17", template_name: "Низ-Квадрицепс", duration_minutes: 74, set_count: 18,
    coach_note: "Присед 75 на 8,8,8 — уверенно, ставлю 77.5 кг. Разгибания: колено ныло → вес держим, добавь лёгкий разминочный подход." },
  { id: 880, date: "2026-06-12", template_name: "Верх-Гипертрофия", duration_minutes: 79, set_count: 26,
    coach_note: "Наклонный жим 22 на 12 — добил, ставлю 24 кг. Махи 7 кг держишь, тяни до 15 повторов везде." },
  { id: 875, date: "2026-06-10", template_name: "Низ-Задняя цепь", duration_minutes: 70, set_count: 19,
    coach_note: "Румынская 45 ровно, форма чистая — добавь 2.5 кг. Ягодичный мост хорошо включается." },
  { id: 860, date: "2026-06-04", template_name: "Верх-Сила", duration_minutes: 76, set_count: 21,
    coach_note: "Жим лёжа 72.5 → вышел на 75. Тяга штанги тяжело на 60 — снизил до 50, верное решение." },
  { id: 840, date: "2026-05-29", template_name: "Низ-Квадрицепс", duration_minutes: 72, set_count: 18,
    coach_note: "Первая неделя цикла. Присед 70 — база заложена. Дальше прибавляем по чуть-чуть." },
];

const HIST: Record<number, WHistPoint[]> = {
  1: [
    { date: "2026-06-19", top_1rm: 29.3, best_set: { weight: 22, reps: 10 }, total_volume: 660 },
    { date: "2026-06-12", top_1rm: 28.0, best_set: { weight: 20, reps: 12 }, total_volume: 620 },
    { date: "2026-06-05", top_1rm: 26.7, best_set: { weight: 20, reps: 10 }, total_volume: 560 },
    { date: "2026-05-29", top_1rm: 26.0, best_set: { weight: 18, reps: 12 }, total_volume: 540 },
  ],
};

const COACH_REPLY =
  "Хорошая тренировка. Жим лёжа 75 держишь — добей 8 повторов во всех подходах, потом 77.5 кг. Тяга 50 ровно, оставляем. Армейский 35 на 10 везде — ставлю 37.5 кг. Живот убираем питанием, не прессом. Завтра — 8 тысяч шагов.";

const mockApi: WorkoutApi = {
  getTemplates: async () => TEMPLATES,
  getExercises: async () => EX,
  getWorkouts: async () => SESSIONS,
  getHistory: async (id) => HIST[id] ?? HIST[1],
  lastSets: async (id) => LAST[id] ?? [],
  completeSession: async () => ({ coach_note: COACH_REPLY }),
};

createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390, height: 844, overflow: "auto", background: "var(--bg)", borderRadius: 28, boxShadow: "0 0 0 10px #111" }}>
    <WorkoutLog goalId={23} goalName="Рекомпозиция" onBack={() => {}} api={mockApi} />
  </div>,
);
