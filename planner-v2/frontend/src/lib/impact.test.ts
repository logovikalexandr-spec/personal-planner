import { describe, it, expect } from "vitest";
import { shouldShowImpact, IMPACT_THRESHOLD } from "./impact";
import type { Task } from "../types";

const base = (o: Partial<Task>): Task =>
  ({ id: 1, title: "t", status: "todo", priority: "none", ...o } as Task);

describe("shouldShowImpact", () => {
  it("скрыт без impact", () => {
    expect(shouldShowImpact(base({ project_id: 1 }))).toBe(false);
  });
  it("скрыт ниже порога", () => {
    expect(shouldShowImpact(base({ impact: IMPACT_THRESHOLD - 1, project_id: 1 }))).toBe(false);
  });
  it("скрыт без привязки к проекту/цели", () => {
    expect(shouldShowImpact(base({ impact: 90 }))).toBe(false);
  });
  it("виден при impact>=порог И привязке к проекту", () => {
    expect(shouldShowImpact(base({ impact: IMPACT_THRESHOLD, project_id: 3 }))).toBe(true);
  });
  it("виден при привязке к этапу", () => {
    expect(shouldShowImpact(base({ impact: 50, stage_id: 2 }))).toBe(true);
  });
});
