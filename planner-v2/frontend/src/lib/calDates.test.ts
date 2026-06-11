import { describe, expect, it } from "vitest";
import {
  addDays, fmtAgendaDay, fmtMonthYear, fmtWeekRange, isWeekend,
  localISO, monthMatrix, parseISO, sameDay, startOfWeek, weekDays,
} from "./calDates";

describe("calDates", () => {
  it("localISO/parseISO round-trip без сдвига TZ", () => {
    const d = new Date(2026, 5, 9); // 9 июня 2026
    expect(localISO(d)).toBe("2026-06-09");
    expect(sameDay(parseISO("2026-06-09"), d)).toBe(true);
  });

  it("startOfWeek = понедельник", () => {
    // 9 июня 2026 = вторник → старт недели 8 июня (Пн)
    expect(localISO(startOfWeek(new Date(2026, 5, 9)))).toBe("2026-06-08");
    // воскресенье 14 июня → та же неделя, старт 8 июня
    expect(localISO(startOfWeek(new Date(2026, 5, 14)))).toBe("2026-06-08");
  });

  it("weekDays = 7 дней Пн..Вс", () => {
    const w = weekDays(new Date(2026, 5, 10));
    expect(w).toHaveLength(7);
    expect(localISO(w[0])).toBe("2026-06-08");
    expect(localISO(w[6])).toBe("2026-06-14");
  });

  it("monthMatrix = 42 ячейки, начинается с Пн", () => {
    const m = monthMatrix(2026, 5); // июнь 2026, 1 июня = Пн
    expect(m).toHaveLength(42);
    expect(localISO(m[0])).toBe("2026-06-01");
    // хвост заходит в июль
    expect(localISO(m[41])).toBe("2026-07-12");
  });

  it("monthMatrix с 1-м числом в середине недели добавляет хвост прошлого месяца", () => {
    // май 2026: 1 мая = пятница → сетка стартует с 27 апреля (Пн)
    const m = monthMatrix(2026, 4);
    expect(localISO(m[0])).toBe("2026-04-27");
  });

  it("isWeekend", () => {
    expect(isWeekend(new Date(2026, 5, 13))).toBe(true);  // сб
    expect(isWeekend(new Date(2026, 5, 14))).toBe(true);  // вс
    expect(isWeekend(new Date(2026, 5, 12))).toBe(false); // пт
  });

  it("fmtWeekRange один месяц / на стыке месяцев", () => {
    expect(fmtWeekRange(weekDays(new Date(2026, 5, 10)))).toBe("8–14 июня");
    // неделя на стыке июнь/июль
    expect(fmtWeekRange(weekDays(new Date(2026, 5, 30)))).toBe("29 июня – 5 июля");
  });

  it("fmtMonthYear", () => {
    expect(fmtMonthYear(new Date(2026, 5, 1))).toBe("Июнь 2026");
  });

  it("fmtAgendaDay: сегодня/завтра/дата", () => {
    const today = new Date(2026, 5, 9);
    expect(fmtAgendaDay(new Date(2026, 5, 9), today).label).toBe("Сегодня");
    expect(fmtAgendaDay(new Date(2026, 5, 10), today).label).toBe("Завтра");
    expect(fmtAgendaDay(new Date(2026, 5, 11), today).label).toBe("Чт 11 июня");
  });

  it("addDays через границу месяца", () => {
    expect(localISO(addDays(new Date(2026, 5, 30), 2))).toBe("2026-07-02");
  });
});
