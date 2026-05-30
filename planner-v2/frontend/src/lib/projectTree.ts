import type { Project } from "../types";

export interface FlatProject extends Project {
  depth: number;
}

export interface FlattenOptions {
  /**
   * Если задан — дерево сворачиваемое: ребёнок раскрывается, только если
   * его родитель в наборе. Если не задан — дерево всегда-развёрнутое
   * (все узлы видны), что нужно picker'у выбора проекта.
   */
  expanded?: Set<number>;
}

/**
 * Единая логика построения дерева проектов (byParent + рекурсивный walk с depth).
 * Inbox исключается. Порядок детей сохраняет порядок исходного массива
 * (вызывающая сторона уже отсортировала по pinned/order_index/name).
 *
 * - picker (выбор проекта): flatten(projects) — всегда развёрнуто.
 * - drawer/lists (навигация): flatten(projects, { expanded }) — сворачиваемо.
 */
export function flatten(projects: Project[], opts: FlattenOptions = {}): FlatProject[] {
  const { expanded } = opts;
  const byParent = new Map<number | null, Project[]>();
  for (const p of projects) {
    if (p.is_inbox) continue;
    const k = p.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(p);
  }
  const out: FlatProject[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const p of byParent.get(parent) ?? []) {
      out.push({ ...p, depth });
      if (expanded === undefined || expanded.has(p.id)) walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Сколько прямых детей у каждого узла (для chevron в навигационном дереве). */
export function childCountMap(projects: Project[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of projects) {
    if (p.is_inbox || p.parent_id == null) continue;
    m.set(p.parent_id, (m.get(p.parent_id) ?? 0) + 1);
  }
  return m;
}

/**
 * Сумма open_count узла и всех его потомков (бейдж счётчика на свёрнутой
 * категории). Один источник для Drawer/Lists вместо локальных рекурсий.
 */
export function subtreeCountMap(projects: Project[]): Map<number, number> {
  const byParent = new Map<number | null, Project[]>();
  for (const p of projects) {
    if (p.is_inbox) continue;
    const k = p.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(p);
  }
  const memo = new Map<number, number>();
  const walk = (id: number, self: number): number => {
    let n = self;
    for (const ch of byParent.get(id) ?? []) {
      n += walk(ch.id, ch.open_count ?? 0);
    }
    memo.set(id, n);
    return n;
  };
  for (const p of projects) {
    if (p.is_inbox || memo.has(p.id)) continue;
    walk(p.id, p.open_count ?? 0);
  }
  return memo;
}

/** Лимит глубины дерева: категория(0) → субкатегория(1) → лист(2). */
export const MAX_DEPTH = 3;

/** Базовый отступ строки + шаг на уровень вложенности (px). */
export const INDENT = 22;
const BASE_PAD = 16;

/**
 * Отступ строки по глубине, с clamp `min(depth, MAX_DEPTH)` — имя остаётся
 * читаемым на узком экране. Единый расчёт для дерева И picker'а.
 */
export function indentFor(depth: number): number {
  return BASE_PAD + Math.min(depth, MAX_DEPTH) * INDENT;
}
