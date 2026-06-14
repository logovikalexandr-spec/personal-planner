import { describe, expect, it } from "vitest";
import { groupByProject } from "./groupByProject";
import type { Project, Task } from "../types";

const P = (id: number, name: string, order: number): Project =>
  ({ id, name, slug: `p${id}`, is_inbox: false, parent_id: null, open_count: 0, color: null, icon: null, pinned: false, order_index: order } as Project);
const T = (id: number, project_id: number | null): Task =>
  ({ id, title: `t${id}`, project_id, priority: "none", status: "todo", due_date: null, due_time: null, end_date: null, end_time: null, tags: [] } as unknown as Task);

const byId = new Map<number, Project>([[1, P(1, "ZIMA", 1)], [2, P(2, "Здоровье", 0)]]);

describe("groupByProject", () => {
  it("группирует по проекту, проекты по order_index", () => {
    const r = groupByProject([T(10, 1), T(11, 2), T(12, 1)], byId);
    expect(r.map((g) => g.project?.name)).toEqual(["Здоровье", "ZIMA"]); // order 0 раньше 1
    expect(r[1].tasks.map((t) => t.id)).toEqual([10, 12]);
  });

  it("задачи без проекта → группа null последней", () => {
    const r = groupByProject([T(10, null), T(11, 1)], byId);
    expect(r.map((g) => g.project?.name ?? "—")).toEqual(["ZIMA", "—"]);
    expect(r[1].project).toBeNull();
    expect(r[1].tasks.map((t) => t.id)).toEqual([10]);
  });

  it("неизвестный project_id → как «без проекта» (null)", () => {
    const r = groupByProject([T(10, 999)], byId);
    expect(r).toHaveLength(1);
    expect(r[0].project).toBeNull();
  });

  it("пустой вход → пустой массив", () => {
    expect(groupByProject([], byId)).toEqual([]);
  });
});
