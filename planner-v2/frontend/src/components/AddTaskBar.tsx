import { useEffect, useState } from "react";
import { QuickAddBar } from "./QuickAddBar";
import { createTask, createTag, getProjects, getTags } from "../api";
import type { ParseResult } from "../lib/quickParse";
import type { Project, Tag } from "../types";

// Волна 2 F2 — quick-add бар с NL-парсингом. Резолвит ~проект и #теги в id,
// затем создаёт задачу с распознанными дата/время/приоритет. onAdded — рефетч у родителя.
// projectName матчится по имени без регистра; тег создаётся, если нет.

export function AddTaskBar({
  defaultProjectId = null, onAdded,
}: { defaultProjectId?: number | null; onAdded?: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
    getTags().then(setTags).catch(() => {});
  }, []);

  function resolveProject(name?: string): number | null {
    if (!name) return defaultProjectId;
    const hit = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    return hit ? hit.id : defaultProjectId;
  }

  async function resolveTags(names: string[]): Promise<number[]> {
    if (names.length === 0) return [];
    const ids: number[] = [];
    let known = tags;
    for (const n of names) {
      let hit = known.find((t) => t.name.toLowerCase() === n.toLowerCase());
      if (!hit) {
        try { hit = await createTag(n); known = [...known, hit]; } catch { /* skip */ }
      }
      if (hit) ids.push(hit.id);
    }
    setTags(known);
    return ids;
  }

  async function handleAdd(p: ParseResult) {
    const title = p.title.trim() || p.source.trim();
    if (!title) return;
    const tag_ids = await resolveTags(p.tagNames);
    await createTask(title, {
      project_id: resolveProject(p.projectName),
      priority: p.priority ?? "none",
      due_date: p.due_date ?? null,
      due_time: p.due_time ?? null,
      tag_ids: tag_ids.length ? tag_ids : undefined,
    });
    onAdded?.();
  }

  return <QuickAddBar onAdd={handleAdd} placeholder="Новая задача…" />;
}
