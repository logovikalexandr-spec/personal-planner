import { describe, expect, it } from "vitest";
import { blockGeom, nowLineTop, WEEK_GRID_H, WEEK_PX_PER_HOUR, WEEK_START_HOUR, yToTime } from "./weekLayout";

describe("weekLayout", () => {
  it("нет времени → null", () => {
    expect(blockGeom(null, null)).toBeNull();
    expect(blockGeom(undefined, "10:00:00")).toBeNull();
  });

  it("блок 09:00–10:00 = top 1ч, высота 1ч", () => {
    const g = blockGeom("09:00:00", "10:00:00")!;
    expect(g.top).toBeCloseTo(WEEK_PX_PER_HOUR); // 08:00 = top 0, 09:00 = 1*pxPerHour
    expect(g.height).toBeCloseTo(WEEK_PX_PER_HOUR);
  });

  it("без end_time → дефолт 45 мин", () => {
    const g = blockGeom("12:00:00", null)!;
    expect(g.height).toBeCloseTo(45 * (WEEK_PX_PER_HOUR / 60));
  });

  it("блок до окна клампится к верху", () => {
    const g = blockGeom("06:00:00", "09:00:00")!; // окно с 08:00
    expect(g.top).toBe(0);
  });

  it("блок не вылезает за низ сетки", () => {
    const g = blockGeom("20:30:00", "23:00:00")!;
    expect(g.top + g.height).toBeLessThanOrEqual(WEEK_GRID_H + 0.01);
  });

  it("минимальная высота для очень короткого блока", () => {
    const g = blockGeom("10:00:00", "10:05:00")!;
    expect(g.height).toBeGreaterThanOrEqual(16);
  });

  it("nowLineTop: время в окне → позиция, вне окна → null", () => {
    expect(nowLineTop(new Date(2026, 5, 14, WEEK_START_HOUR, 0))).toBe(0); // ровно верх окна
    expect(nowLineTop(new Date(2026, 5, 14, WEEK_START_HOUR + 1, 0))).toBeCloseTo(WEEK_PX_PER_HOUR);
    expect(nowLineTop(new Date(2026, 5, 14, 5, 0))).toBeNull();  // до окна
    expect(nowLineTop(new Date(2026, 5, 14, 23, 0))).toBeNull(); // после окна
  });

  it("yToTime снапит к 15 мин и клампит в окно", () => {
    expect(yToTime(0)).toBe("08:00:00");
    expect(yToTime(-100)).toBe("08:00:00");           // выше окна → верх
    expect(yToTime(WEEK_GRID_H + 999)).toBe("20:45:00"); // ниже окна → последний слот
    // 1ч7мин от верха → ~09:07 → снап 09:00 или 09:15
    const t = yToTime(WEEK_PX_PER_HOUR * 1.1);
    expect(["09:00:00", "09:15:00"]).toContain(t);
  });
});
