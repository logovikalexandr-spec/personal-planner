import { useMemo, useRef, useState } from "react";
import { quickParse, removeToken, type ParsedToken, type ParseResult } from "../lib/quickParse";
import { IcoCalendar2, IcoFlag, IcoBell, IcoTag, IcoSend } from "./icons";

// Волна 2 F2 — quick-add с NL-подсветкой. Мокап wave2.html #2.
// Инпут наложен на подсвеченный слой (highlight overlay): распознанные токены красятся
// (ember; проект=зелёный). Тап по токену вырезает его из текста (removeToken) → возврат в plain.
// Под полем — чипы распознанного (дата/прио/тег/проект). Enter/кнопка → onAdd(parsed).
//
// Прозрачный <input> поверх цветного <div> с тем же текстом: caret/ввод нативные,
// окраска — на нижнем слое. Шрифт/паддинги синхронизированы классом .qa-text.

const PROJECT_GREEN = "var(--project-tag)";

export type QuickField = "date" | "prio" | "tag" | "rem";

export interface QuickAddBarProps {
  onAdd: (p: ParseResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  // контролируемый текст (чтобы родитель мог перенести его в полный composer при «Развернуть»)
  value?: string;
  onChange?: (s: string) => void;
  // тап по чипу → раскрыть полный composer с нужным пикером (date/prio/tag); rem — просто раскрыть
  onExpand?: (field: QuickField) => void;
}

function HighlightLayer({
  source, tokens, onTokenTap,
}: { source: string; tokens: ParsedToken[]; onTokenTap: (t: ParsedToken) => void }) {
  // собрать чередующиеся отрезки: обычный текст / токен-чип
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

export function QuickAddBar({ onAdd, placeholder = "Новая задача…", autoFocus, value, onChange, onExpand }: QuickAddBarProps) {
  const [internal, setInternal] = useState("");
  const text = value !== undefined ? value : internal;
  const setText = (s: string | ((c: string) => string)) => {
    const next = typeof s === "function" ? s(text) : s;
    if (onChange) onChange(next); else setInternal(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => quickParse(text), [text]);

  function submit() {
    if (!parsed.title.trim() && parsed.tokens.length === 0) return;
    if (!text.trim()) return;
    onAdd(parsed);
    setText("");
  }

  function tapToken(tok: ParsedToken) {
    setText((cur) => removeToken(cur, tok));
    inputRef.current?.focus();
  }

  // чипы: показываем что распознано (мокап #2 «распознано: дата · проект · приоритет · тег»)
  const chips: { key: string; label: string; ico: React.ReactNode; on: boolean }[] = [
    { key: "date", label: parsed.due_date ? (parsed.tokens.find((t) => t.kind === "date")?.label ?? "дата") : "дата", ico: <IcoCalendar2 />, on: !!parsed.due_date },
    { key: "prio", label: parsed.priority && parsed.priority !== "none" ? `P${({ high: 1, medium: 2, low: 3 } as const)[parsed.priority as "high" | "medium" | "low"]}` : "приоритет", ico: <IcoFlag />, on: !!parsed.priority && parsed.priority !== "none" },
    { key: "tag", label: parsed.tagNames.length ? `#${parsed.tagNames.length}` : "тег", ico: <IcoTag />, on: parsed.tagNames.length > 0 },
    { key: "rem", label: "напоминание", ico: <IcoBell />, on: false },
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
        {chips.map((c) =>
          onExpand ? (
            <button
              key={c.key}
              type="button"
              className={`qa-chip ${c.on ? "on" : ""}`}
              onClick={() => onExpand(c.key as QuickField)}
            >
              <span className="qa-chip-ico">{c.ico}</span>
              <span>{c.label}</span>
            </button>
          ) : (
            <div key={c.key} className={`qa-chip ${c.on ? "on" : ""}`}>
              <span className="qa-chip-ico">{c.ico}</span>
              <span>{c.label}</span>
            </div>
          ),
        )}
        <button className="qa-send" onClick={submit} aria-label="Добавить"><IcoSend /></button>
      </div>
      <div className="qa-hint mono">распознано: дата · проект · приоритет · тег — тап по токену вернёт в текст</div>
    </div>
  );
}
