import { describe, expect, it } from "vitest";
import { parseISO } from "./calDates";
import {
  PPD, barPx, barStatusClass, buildColumns, criticalPathIds,
  dayDiff, hasConflict, rangeOf, trackWidth, xPx,
} from "./ganttLayout";
import type { Stage } from "../types";

const D = (iso: string) => parseISO(iso);

function stage(p: Partial<Stage> & { id: number }): Stage {
  return {
    id: p.id, project_id: 1, name: p.name ?? `S${p.id}`, order_index: p.order_index ?? 0,
    start_date: p.start_date ?? null, end_date: p.end_date ?? null,
    status: p.status ?? "future", progress: p.progress ?? 0,
    is_milestone: p.is_milestone ?? false, milestone_date: p.milestone_date ?? null,
    depends_on_ids: p.depends_on_ids ?? [],
  };
}

describe("ganttLayout · геометрия", () => {
  it("dayDiff = целых дней b-a", () => {
    expect(dayDiff(D("2026-06-01"), D("2026-06-10"))).toBe(9);
    expect(dayDiff(D("2026-06-10"), D("2026-06-01"))).toBe(-9);
    expect(dayDiff(D("2026-06-01"), D("2026-06-01"))).toBe(0);
  });

  it("xPx = смещение в px от начала", () => {
    expect(xPx(D("2026-06-11"), D("2026-06-01"), 10)).toBe(100);
    expect(xPx(D("2026-06-01"), D("2026-06-01"), 10)).toBe(0);
  });

  it("barPx: end включительно, минимум 1 день", () => {
    expect(barPx(D("2026-06-01"), D("2026-06-01"), D("2026-06-01"), 10)).toEqual({ left: 0, width: 10 });
    expect(barPx(D("2026-06-01"), D("2026-06-05"), D("2026-06-01"), 10)).toEqual({ left: 0, width: 50 });
    expect(barPx(D("2026-06-03"), D("2026-06-04"), D("2026-06-01"), 10)).toEqual({ left: 20, width: 20 });
  });

  it("trackWidth учитывает последний день", () => {
    expect(trackWidth(D("2026-06-01"), D("2026-06-10"), 10)).toBe(100);
  });
});

describe("ganttLayout · окно и колонки", () => {
  it("month-зум выравнивает по границам месяцев", () => {
    const r = rangeOf([D("2026-06-09"), D("2026-08-15")], D("2026-06-09"), "month");
    expect(r.from).toEqual(new Date(2026, 5, 1));
    expect(r.to).toEqual(new Date(2026, 7, 31));
  });

  it("пустые данные → окно вокруг сегодня", () => {
    const r = rangeOf([], D("2026-06-09"), "month");
    expect(r.from.getTime()).toBeLessThan(D("2026-06-09").getTime());
    expect(r.to.getTime()).toBeGreaterThan(D("2026-06-09").getTime());
  });

  it("buildColumns month = по месяцу на колонку", () => {
    const cols = buildColumns({ from: new Date(2026, 5, 1), to: new Date(2026, 7, 31) }, "month");
    expect(cols.map((c) => c.label)).toEqual(["ИЮН", "ИЮЛ", "АВГ"]);
    expect(cols[0].leftPx).toBe(0);
  });

  it("buildColumns day = по дню на колонку", () => {
    const cols = buildColumns({ from: new Date(2026, 5, 1), to: new Date(2026, 5, 5) }, "day");
    expect(cols).toHaveLength(5);
    expect(cols.map((c) => c.label)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("PPD: месяц плотнее всех (обзор), день самый разреженный", () => {
    expect(PPD.month).toBeLessThan(PPD.week);
    expect(PPD.week).toBeLessThan(PPD.day);
  });
});

describe("ganttLayout · статусы / критпуть / конфликт", () => {
  it("barStatusClass маппит статусы этапа", () => {
    expect(barStatusClass("done")).toBe("done");
    expect(barStatusClass("current")).toBe("cur");
    expect(barStatusClass("late")).toBe("late");
    expect(barStatusClass("future")).toBe("fut");
    expect(barStatusClass(null)).toBe("fut");
  });

  it("criticalPathIds = самая длинная цепочка по длительности", () => {
    const stages = [
      stage({ id: 1, start_date: "2026-06-01", end_date: "2026-06-05" }),                       // dur 5
      stage({ id: 2, start_date: "2026-06-06", end_date: "2026-06-15", depends_on_ids: [1] }),  // dur 10
      stage({ id: 3, start_date: "2026-06-06", end_date: "2026-06-08", depends_on_ids: [1] }),  // dur 3
      stage({ id: 4, start_date: "2026-06-16", end_date: "2026-06-19", depends_on_ids: [2, 3] }), // dur 4
    ];
    const cp = criticalPathIds(stages);
    expect([...cp].sort()).toEqual([1, 2, 4]);
    expect(cp.has(3)).toBe(false);
  });

  it("criticalPathIds: нет зависимостей → пусто (нечего подсвечивать)", () => {
    const cp = criticalPathIds([stage({ id: 1, start_date: "2026-06-01", end_date: "2026-06-05" })]);
    expect(cp.size).toBe(0);
  });

  it("hasConflict: старт раньше финиша предшественника", () => {
    const stages = [
      stage({ id: 1, start_date: "2026-06-01", end_date: "2026-06-28" }),
      stage({ id: 2, start_date: "2026-06-18", end_date: "2026-07-10", depends_on_ids: [1] }),
      stage({ id: 3, start_date: "2026-07-01", end_date: "2026-07-20", depends_on_ids: [1] }),
    ];
    const byId = new Map(stages.map((s) => [s.id, s]));
    expect(hasConflict(stages[1], byId)).toBe(true);  // 18 июн < 28 июн
    expect(hasConflict(stages[2], byId)).toBe(false); // 1 июл > 28 июн
  });
});
