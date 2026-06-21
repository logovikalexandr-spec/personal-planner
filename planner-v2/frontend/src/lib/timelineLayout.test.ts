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
  it("непересекающиеся (большой зазор) → каждый 1 колонка", () => {
    const r = layoutColumns([L(1, 540, 600), L(2, 660, 720)]);
    expect(r.get(1)).toEqual({ colIndex: 0, colCount: 1 });
    expect(r.get(2)).toEqual({ colIndex: 0, colCount: 1 });
  });

  // визуальная раскладка: короткие встык-задачи занимают min-height-полосу → разводятся по колонкам
  it("короткие встык (5/10/15мин) → колонки, не наложение", () => {
    // Подъём 06:30–06:35, Душ 06:35–06:45, Медитация 06:45–07:00 (как ставит planner)
    const r = layoutColumns([L(1, 390, 395), L(2, 395, 405), L(3, 405, 420)]);
    expect(r.get(1)!.colCount).toBeGreaterThan(1);   // не одна колонка во всю ширину
    expect(r.get(1)!.colIndex).not.toBe(r.get(2)!.colIndex); // соседи в разных колонках
  });
  it("читаемые встык (30+30мин) НЕ дробятся на колонки", () => {
    const r = layoutColumns([L(1, 540, 570), L(2, 570, 600)]);
    expect(r.get(1)).toEqual({ colIndex: 0, colCount: 1 });
    expect(r.get(2)).toEqual({ colIndex: 0, colCount: 1 });
  });
});
