import { describe, expect, it } from "vitest";
import { CLAIM_PX, MAX_PULL, TRIGGER_PX, decide, pullProgress, pullVisual, shouldRefresh } from "./pullRefresh";

describe("decide", () => {
  it("маленькое движение = pending", () => {
    expect(decide(2, 3)).toBe("pending");
    expect(decide(CLAIM_PX, CLAIM_PX)).toBe("pending");
  });
  it("вниз доминирует = pull", () => {
    expect(decide(2, 20)).toBe("pull");
    expect(decide(-5, 30)).toBe("pull");
  });
  it("вверх = reject", () => {
    expect(decide(0, -20)).toBe("reject");
  });
  it("горизонталь доминирует = reject (свайп ленты/удаления)", () => {
    expect(decide(40, 12)).toBe("reject");
    expect(decide(-40, 12)).toBe("reject");
  });
});

describe("pullVisual", () => {
  it("0 и вверх → 0", () => {
    expect(pullVisual(0)).toBe(0);
    expect(pullVisual(-50)).toBe(0);
  });
  it("монотонно растёт и не превышает MAX_PULL", () => {
    expect(pullVisual(40)).toBeLessThan(pullVisual(120));
    expect(pullVisual(10000)).toBeLessThanOrEqual(MAX_PULL);
  });
  it("порог TRIGGER достигается комфортным пуллом (~80px пальца)", () => {
    expect(pullVisual(80)).toBeGreaterThanOrEqual(TRIGGER_PX);
    expect(pullVisual(50)).toBeLessThan(TRIGGER_PX);
  });
});

describe("pullProgress / shouldRefresh", () => {
  it("прогресс 0..1, насыщается на пороге", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(TRIGGER_PX)).toBe(1);
    expect(pullProgress(TRIGGER_PX * 2)).toBe(1);
  });
  it("обновляем только за порогом", () => {
    expect(shouldRefresh(TRIGGER_PX - 1)).toBe(false);
    expect(shouldRefresh(TRIGGER_PX)).toBe(true);
  });
});
