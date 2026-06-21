import { describe, it, expect } from "vitest";
import { cmpSmartTask, projectRankMap, cmpTaskGrouped } from "./taskSort";
import type { Project, Task } from "../types";

const T = (id: number, p: Partial<Task> = {}): Task =>
  ({ id, title: `t${id}`, priority: "none", project_id: null, due_date: null, due_time: null, status: "todo", ...p } as Task);
const P = (id: number, order: number, name: string, pinned = false): Project =>
  ({ id, name, order_index: order, pinned, parent_id: null } as Project);

describe("cmpSmartTask", () => {
  it("приоритет ↓ (high перед low)", () => {
    const r = [T(1, { priority: "low" }), T(2, { priority: "high" }), T(3, { priority: "medium" })].sort(cmpSmartTask);
    expect(r.map((t) => t.id)).toEqual([2, 3, 1]);
  });
  it("равный приоритет → стабильный тайбрейк по id", () => {
    const r = [T(5), T(2), T(9)].sort(cmpSmartTask);
    expect(r.map((t) => t.id)).toEqual([2, 5, 9]);
  });
});

describe("cmpTaskGrouped — порядок как смарт-список (проект шторки → приоритет)", () => {
  const byId = new Map<number, Project>([
    [1, P(1, 0, "Альфа")],
    [2, P(2, 1, "Бета")],
  ]);
  const rank = projectRankMap(byId);
  it("проекты в порядке шторки, без проекта — в конец", () => {
    const r = [
      T(10, { project_id: 2, priority: "high" }),
      T(11, { project_id: null, priority: "high" }),
      T(12, { project_id: 1, priority: "low" }),
    ].sort(cmpTaskGrouped(rank));
    expect(r.map((t) => t.id)).toEqual([12, 10, 11]); // проект1 → проект2 → без проекта
  });
  it("внутри проекта — приоритет ↓", () => {
    const r = [
      T(20, { project_id: 1, priority: "low" }),
      T(21, { project_id: 1, priority: "high" }),
    ].sort(cmpTaskGrouped(rank));
    expect(r.map((t) => t.id)).toEqual([21, 20]);
  });
});
