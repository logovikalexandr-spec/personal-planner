import {
  wCancel, wComplete, wCreateWorkout, wGetExercises, wGetTemplates, wGetWorkout, wGetWorkouts,
  wHistory, wLastSets, wPutSets,
} from "../api";
import { clientToday } from "../lib/clientDate";
import type { WHistPoint, WSession, WSet, WTemplate, WorkoutApi } from "./WorkoutLog";

/** Боевой api для WorkoutLog поверх реального бэка. Маппит ApiSession→WSession (имя шаблона, кол-во подходов). */
export function makeWorkoutApi(goalId: number): WorkoutApi {
  let tplNames: Map<number, string> | null = null;

  async function templateNames(): Promise<Map<number, string>> {
    if (tplNames) return tplNames;
    const tpls = await wGetTemplates(goalId);
    tplNames = new Map(tpls.map((t) => [t.id, t.name]));
    return tplNames;
  }

  return {
    getTemplates: async () =>
      (await wGetTemplates(goalId)).map((t): WTemplate => ({
        id: t.id, name: t.name,
        exercises: t.exercises.map((e) => ({
          exercise_id: e.exercise_id, target_sets: e.target_sets,
          rep_low: e.rep_low, rep_high: e.rep_high, coach_target_weight: e.coach_target_weight,
        })),
      })),

    getExercises: async () =>
      (await wGetExercises()).map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group })),

    getWorkouts: async () => {
      const [ws, names] = await Promise.all([wGetWorkouts(goalId), templateNames()]);
      return ws.map((s): WSession => ({
        id: s.id, date: s.date,
        template_name: (s.template_id != null && names.get(s.template_id)) || "Тренировка",
        duration_minutes: s.duration_minutes, review_note: s.review_note, coach_note: s.coach_note,
        set_count: (s.sets ?? []).filter((x) => !x.is_warmup).length,
      }));
    },

    getWorkoutSets: async (sessionId): Promise<WSet[]> => {
      const s = await wGetWorkout(sessionId);
      return (s.sets ?? []).map((x) => ({
        exercise_id: x.exercise_id, set_index: x.set_index, weight: x.weight, reps: x.reps,
        is_warmup: x.is_warmup, done: x.done, note: x.note,
      }));
    },

    getHistory: async (exId): Promise<WHistPoint[]> => await wHistory(exId),

    lastSets: async (exId): Promise<WSet[]> =>
      (await wLastSets(exId)).map((s, i) => ({
        exercise_id: exId, set_index: i, weight: s.weight, reps: s.reps, is_warmup: false, done: false,
      })),

    completeSession: async ({ template_id, sets, review_note }) => {
      const ws = await wCreateWorkout(goalId, clientToday(), template_id);
      await wPutSets(ws.id, sets.map((s) => ({
        exercise_id: s.exercise_id, set_index: s.set_index, weight: s.weight, reps: s.reps,
        is_warmup: false, done: s.done ?? false, note: s.note ?? null,
      })));
      await wComplete(ws.id, review_note);
      return { coach_note: "Тренировка сохранена. Разбор тренера придёт в Telegram." };
    },

    cancelSession: async (id) => { await wCancel(id); },
  };
}
