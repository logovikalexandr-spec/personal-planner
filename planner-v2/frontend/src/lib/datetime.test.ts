import { describe, expect, it } from "vitest";
import { durationLabel, pickCalendarDay } from "./datetime";

describe("durationLabel", () => {
  it("часы+минуты в один день", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: "09:00:00", end_date: null, end_time: "10:30:00" }))
      .toBe("1 ч 30 мин");
  });

  it("ровно час", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: "09:00:00", end_date: null, end_time: "10:00:00" }))
      .toBe("1 ч");
  });

  it("только минуты", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: "09:00:00", end_date: null, end_time: "09:30:00" }))
      .toBe("30 мин");
  });

  it("многодневный спан = дни (включительно)", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: null, end_date: "2026-06-17", end_time: null }))
      .toBe("4 дня");
  });

  it("один день многодневного = 1 день", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: null, end_date: "2026-06-14", end_time: null }))
      .toBe(null);
  });

  it("плюрализация дней: 1 день / 5 дней", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: null, end_date: "2026-06-15", end_time: null }))
      .toBe("2 дня");
    expect(durationLabel({ due_date: "2026-06-01", due_time: null, end_date: "2026-06-05", end_time: null }))
      .toBe("5 дней");
  });

  it("нет времени конца → нет метки", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: "09:00:00", end_date: null, end_time: null }))
      .toBe(null);
  });

  it("конец раньше начала → нет метки", () => {
    expect(durationLabel({ due_date: "2026-06-14", due_time: "10:00:00", end_date: null, end_time: "09:00:00" }))
      .toBe(null);
  });
});

describe("pickCalendarDay", () => {
  it("первый тап = начало", () => {
    expect(pickCalendarDay({ due_date: null, end_date: null }, "2026-06-14"))
      .toEqual({ due_date: "2026-06-14", end_date: null });
  });

  it("второй тап позже = дедлайн (спан)", () => {
    expect(pickCalendarDay({ due_date: "2026-06-14", end_date: null }, "2026-06-17"))
      .toEqual({ due_date: "2026-06-14", end_date: "2026-06-17" });
  });

  it("тап раньше начала = новое начало, сброс дедлайна", () => {
    expect(pickCalendarDay({ due_date: "2026-06-14", end_date: null }, "2026-06-10"))
      .toEqual({ due_date: "2026-06-10", end_date: null });
  });

  it("тап того же дня = сброс к одиночному (дедлайн снят)", () => {
    expect(pickCalendarDay({ due_date: "2026-06-14", end_date: null }, "2026-06-14"))
      .toEqual({ due_date: "2026-06-14", end_date: null });
  });

  it("когда спан задан, новый тап перезапускает выбор", () => {
    expect(pickCalendarDay({ due_date: "2026-06-14", end_date: "2026-06-17" }, "2026-06-20"))
      .toEqual({ due_date: "2026-06-20", end_date: null });
  });
});
