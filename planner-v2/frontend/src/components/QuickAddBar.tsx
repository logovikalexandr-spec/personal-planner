import { useEffect, useMemo, useRef, useState } from "react";
import { quickParse, removeToken, type ParsedToken, type ParseResult } from "../lib/quickParse";
import { IcoCalendar2, IcoFlag, IcoBell, IcoTag, IcoSend, IcoProjects } from "./icons";
import { DateSheet, type DateValue } from "./DateSheet";
import { PriorityPicker, ProjectPickerSheet, TagPickerSheet } from "./pickers";
import { getProjects } from "../api";
import type { Priority, Project } from "../types";

// Quick-add — ЕДИНСТВЕННОЕ поле создания задачи (на «+»). NL-подсветка + рабочие чипы:
// тап чипа дата/приоритет/тег/напоминание открывает пикер-шит ИНЛАЙН (не второе поле),
// значение копится на эту задачу. Отправка создаёт задачу с текстом + выбранным в чипах.

const PROJECT_GREEN = "var(--project-tag)";
const EMPTY_DATE: DateValue = { due_date: null, due_time: null, end_time: null, reminder_at: null, recurrence: null };
const MONTHS_ABBR = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return null;
  return `${d} ${MONTHS_ABBR[m - 1]}`;
}

// что владелец выбрал чипами вручную (перекрывает распознанное из текста)
export interface QuickManual { date?: DateValue; priority?: Priority; tagIds?: number[]; projectId?: number | null }

export interface QuickAddBarProps {
  onAdd: (p: ParseResult, manual?: QuickManual) => void;
  placeholder?: string;
  autoFocus?: boolean;
  value?: string;
  onChange?: (s: string) => void;
}

function HighlightLayer({
  source, tokens, onTokenTap,
}: { source: string; tokens: ParsedToken[]; onTokenTap: (t: ParsedToken) => void }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((tok, i) => {
    if (tok.start > cursor) parts.push(<span key={`p${i}`}>{source.slice(cursor, tok.start)}</span>);
    const isProj = tok.kind === "project";
    parts.push(
      <span
        key={`t${i}`}
        className="qa-tok"
        style={isProj ? { color: PROJECT_GREEN, background: "rgba(111,207,151,0.16)" } : undefined}
        onMouseDown={(e) => { e.preventDefault(); onTokenTap(tok); }}
      >
        {tok.raw}
      </span>,
    );
    cursor = tok.end;
  });
  if (cursor < source.length) parts.push(<span key="tail">{source.slice(cursor)}</span>);
  return <div className="qa-text qa-highlight" aria-hidden="true">{parts}{source === "" ? "​" : ""}</div>;
}

const PRIO_NUM = { high: 1, medium: 2, low: 3 } as const;

export function QuickAddBar({ onAdd, placeholder = "Новая задача…", autoFocus, value, onChange }: QuickAddBarProps) {
  const [internal, setInternal] = useState("");
  const text = value !== undefined ? value : internal;
  const setText = (s: string | ((c: string) => string)) => {
    const next = typeof s === "function" ? s(text) : s;
    if (onChange) onChange(next); else setInternal(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => quickParse(text), [text]);

  // выбранное чипами вручную
  const [sheet, setSheet] = useState<"date" | "prio" | "tag" | "project" | null>(null);
  const [mDate, setMDate] = useState<DateValue>(EMPTY_DATE);
  const [mPrio, setMPrio] = useState<Priority>("none");
  const [mTags, setMTags] = useState<number[]>([]);
  const [mProject, setMProject] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { getProjects().then(setProjects).catch(() => {}); }, []);

  function reset() {
    setText("");
    setMDate(EMPTY_DATE);
    setMPrio("none");
    setMTags([]);
    setMProject(null);
  }

  function submit() {
    if (!text.trim()) return;
    const manual: QuickManual = {
      date: mDate.due_date || mDate.reminder_at ? mDate : undefined,
      priority: mPrio !== "none" ? mPrio : undefined,
      tagIds: mTags.length ? mTags : undefined,
      projectId: mProject ?? undefined,
    };
    onAdd(parsed, manual);
    reset();
  }

  function tapToken(tok: ParsedToken) {
    setText((cur) => removeToken(cur, tok));
    inputRef.current?.focus();
  }

  // приоритет/дата/теги для чипов: вручную выбранное в приоритете, иначе распознанное из текста
  const prio = mPrio !== "none" ? mPrio : (parsed.priority ?? "none");
  const dateIso = mDate.due_date ?? parsed.due_date ?? null;
  const tagCount = mTags.length || parsed.tagNames.length;

  const projName = mProject != null ? projects.find((p) => p.id === mProject)?.name : undefined;
  type Open = "date" | "prio" | "tag" | "project";
  const chips: { key: string; label: string; ico: React.ReactNode; on: boolean; open: Open }[] = [
    { key: "date", label: dateLabel(dateIso) ?? "дата", ico: <IcoCalendar2 />, on: !!dateIso, open: "date" },
    { key: "project", label: projName ?? "проект", ico: <IcoProjects />, on: mProject != null, open: "project" },
    { key: "prio", label: prio !== "none" ? `P${PRIO_NUM[prio as "high" | "medium" | "low"]}` : "приоритет", ico: <IcoFlag />, on: prio !== "none", open: "prio" },
    { key: "tag", label: tagCount ? `#${tagCount}` : "тег", ico: <IcoTag />, on: tagCount > 0, open: "tag" },
    { key: "rem", label: "напоминание", ico: <IcoBell />, on: !!mDate.reminder_at, open: "date" },
  ];

  return (
    <div className="qa">
      <div className="qa-field">
        <HighlightLayer source={text} tokens={parsed.tokens} onTokenTap={tapToken} />
        <input
          ref={inputRef}
          className="qa-text qa-input"
          value={text}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
      </div>
      <div className="qa-chips">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`qa-chip ${c.on ? "on" : ""}`}
            onClick={() => { inputRef.current?.blur(); setSheet(c.open); }}
          >
            <span className="qa-chip-ico">{c.ico}</span>
            <span>{c.label}</span>
          </button>
        ))}
        <button className="qa-send" onClick={submit} aria-label="Добавить"><IcoSend /></button>
      </div>
      <div className="qa-hint mono">распознано: дата · проект · приоритет · тег — тап по токену вернёт в текст</div>

      {sheet === "date" && (
        <DateSheet initial={mDate} onApply={(v) => { setMDate(v); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet === "prio" && (
        <PriorityPicker value={mPrio} onPick={(p) => { setMPrio(p); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet === "tag" && (
        <TagPickerSheet value={mTags} onChange={setMTags} onClose={() => setSheet(null)} />
      )}
      {sheet === "project" && (
        <ProjectPickerSheet
          value={mProject}
          projects={projects}
          onProjectsChange={setProjects}
          onPick={(id) => { setMProject(id); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
