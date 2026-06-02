// Волна 2 F2 — quick-add NL-парсер (RU). Мокап wave2.html #2.
// Распознаёт в свободном тексте: дату/время ("сегодня"/"завтра"/"HH:MM"/"DD.MM"),
// приоритет (!1..!4), проект (~имя), тег (#имя). Возвращает чистый title + структуру.
// Подсветка токенов: каждый токен знает свой [start,end) в исходной строке → UI рендерит span'ы.
// Тап по токену = вернуть его текст в plain (UI вырезает диапазон, перезапускает парс).

import type { Priority } from "../types";

export type TokenKind = "date" | "time" | "priority" | "project" | "tag";

export interface ParsedToken {
  kind: TokenKind;
  /** Подстрока исходного текста, ровно как её ввёл пользователь (для подсветки/возврата). */
  raw: string;
  start: number; // индекс в исходной строке (включительно)
  end: number;   // индекс в исходной строке (исключительно)
  /** Человеческая метка для чипа («завтра», «P1», «#аренда», «17:00», «~ZIMA»). */
  label: string;
}

export interface ParseResult {
  /** Исходный (необработанный) текст — источник истины для индексов токенов. */
  source: string;
  /** Текст без распознанных токенов (то, что станет title). */
  title: string;
  tokens: ParsedToken[];
  // Извлечённые значения (undefined = не распознано):
  due_date?: string;   // YYYY-MM-DD (локальная)
  due_time?: string;   // HH:MM:00
  priority?: Priority;
  /** Имя проекта как введено (резолв id делает вызывающий по списку проектов). */
  projectName?: string;
  /** Имена тегов как введены. */
  tagNames: string[];
}

function localISO(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

// Сопоставление слова дня недели (текущая/ближайшая будущая неделя) с offset от сегодня.
const WEEKDAYS: Record<string, number> = {
  "понедельник": 0, "пн": 0,
  "вторник": 1, "вт": 1,
  "среда": 2, "среду": 2, "ср": 2,
  "четверг": 3, "чт": 3,
  "пятница": 4, "пятницу": 4, "пт": 4,
  "суббота": 5, "субботу": 5, "сб": 5,
  "воскресенье": 6, "вс": 6,
};

const PRIORITY_BY_NUM: Record<string, Priority> = {
  "1": "high", "2": "medium", "3": "low", "4": "none",
};

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

// Каждый матчер возвращает массив непересекающихся матчей в исходной строке.
interface RawMatch {
  kind: TokenKind;
  start: number;
  end: number;
  raw: string;
  label: string;
  // payload:
  due_date?: string;
  due_time?: string;
  priority?: Priority;
  projectName?: string;
  tagName?: string;
}

// Граница "слова" слева: начало строки или пробел. Не матчим внутри слова (e.g. e-mail#тег).
function leftBounded(text: string, i: number): boolean {
  return i === 0 || /\s/.test(text[i - 1]);
}

function collectRegex(
  text: string,
  re: RegExp,
  make: (m: RegExpExecArray) => Omit<RawMatch, "start" | "end"> | null,
): RawMatch[] {
  const out: RawMatch[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const made = make(m);
    if (made) out.push({ ...made, start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++; // защита от нулевой длины
  }
  return out;
}

export function quickParse(text: string, now: Date = new Date()): ParseResult {
  const matches: RawMatch[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── приоритет: !1..!4 ──
  matches.push(...collectRegex(text, /!([1-4])\b/g, (m) => {
    if (!leftBounded(text, m.index)) return null;
    const prio = PRIORITY_BY_NUM[m[1]];
    return { kind: "priority", raw: m[0], label: `P${m[1]}`, priority: prio };
  }));

  // ── тег: #слово ──
  matches.push(...collectRegex(text, /#([^\s#~!]+)/gu, (m) => {
    if (!leftBounded(text, m.index)) return null;
    return { kind: "tag", raw: m[0], label: m[0], tagName: m[1] };
  }));

  // ── проект: ~слово ──
  matches.push(...collectRegex(text, /~([^\s#~!]+)/gu, (m) => {
    if (!leftBounded(text, m.index)) return null;
    return { kind: "project", raw: m[0], label: m[0], projectName: m[1] };
  }));

  // ── время: HH:MM (24ч) ──
  matches.push(...collectRegex(text, /\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (m) => {
    const hh = `${m[1]}`.padStart(2, "0");
    return { kind: "time", raw: m[0], label: `${hh}:${m[2]}`, due_time: `${hh}:${m[2]}:00` };
  }));

  // ── дата: DD.MM или DD.MM.YYYY ──
  matches.push(...collectRegex(text, /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/g, (m) => {
    const day = +m[1], mon = +m[2];
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
    let year = now.getFullYear();
    if (m[3]) year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = new Date(year, mon - 1, day);
    if (d.getDate() !== day || d.getMonth() !== mon - 1) return null; // невалидная дата
    const iso = localISO(d);
    return { kind: "date", raw: m[0], label: dateLabel(iso), due_date: iso };
  }));

  // ── дата словом: сегодня / завтра / послезавтра / день недели ──
  // JS \b — только ASCII, для кириллицы не работает → границы через lookaround по буквам/цифрам (флаг u).
  const wordRe = /(?<![\p{L}\p{N}])(сегодня|завтра|послезавтра|понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье|пн|вт|ср|чт|пт|сб|вс)(?![\p{L}\p{N}])/giu;
  matches.push(...collectRegex(text, wordRe, (m) => {
    const w = m[1].toLowerCase();
    let offset: number;
    if (w === "сегодня") offset = 0;
    else if (w === "завтра") offset = 1;
    else if (w === "послезавтра") offset = 2;
    else if (w in WEEKDAYS) {
      const todayDow = (today.getDay() + 6) % 7; // 0=Пн
      const target = WEEKDAYS[w];
      offset = (target - todayDow + 7) % 7;
      if (offset === 0) offset = 7; // ближайший будущий
    } else return null;
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    const iso = localISO(d);
    const label = w === "сегодня" || w === "завтра" || w === "послезавтра" ? w : m[1];
    return { kind: "date", raw: m[1], label, due_date: iso };
  }));

  // Снять пересечения: сортировка по старту, жадно берём непересекающиеся
  // (приоритет порядку добавления при равном старте — символьные токены важнее слов).
  matches.sort((a, b) => (a.start - b.start) || (a.end - b.end));
  const tokens: ParsedToken[] = [];
  const accepted: RawMatch[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start < lastEnd) continue; // пересекается с уже принятым
    accepted.push(m);
    lastEnd = m.end;
    tokens.push({ kind: m.kind, raw: m.raw, start: m.start, end: m.end, label: m.label });
  }

  // Собрать payload (первый матч каждого вида выигрывает; теги собираем все).
  const res: ParseResult = { source: text, title: "", tokens, tagNames: [] };
  for (const m of accepted) {
    if (m.kind === "date" && res.due_date === undefined) res.due_date = m.due_date;
    else if (m.kind === "time" && res.due_time === undefined) res.due_time = m.due_time;
    else if (m.kind === "priority" && res.priority === undefined) res.priority = m.priority;
    else if (m.kind === "project" && res.projectName === undefined) res.projectName = m.projectName;
    else if (m.kind === "tag" && m.tagName) res.tagNames.push(m.tagName);
  }

  // title = исходный текст минус принятые токены, схлопнуть пробелы.
  let title = "";
  let cursor = 0;
  for (const m of accepted) {
    title += text.slice(cursor, m.start);
    cursor = m.end;
  }
  title += text.slice(cursor);
  res.title = title.replace(/\s{2,}/g, " ").trim();

  return res;
}

// Вернуть токен в plain: вырезать его raw из исходной строки (UI потом перезапустит парс).
export function removeToken(source: string, tok: ParsedToken): string {
  const before = source.slice(0, tok.start);
  const after = source.slice(tok.end);
  // убрать осиротевший двойной пробел на стыке
  return (before + after).replace(/\s{2,}/g, " ").replace(/^\s+/, "");
}
