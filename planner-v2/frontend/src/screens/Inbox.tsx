import { useEffect, useMemo, useRef, useState } from "react";
import { Empty } from "../components/Empty";
import { attachmentSrc, createTask, getInbox, resolveInbox } from "../api";
import type { InboxItem, Task } from "../types";

// Инбокс = поток сырых карточек (кружок + текст, как задача).
// Тап = «разобрать»: сырой айтем превращается в настоящую задачу (с переносом фото)
// и сразу открывается ПОЛНАЯ карточка-деталь — там проект/дата/приоритет/вложения/чеклист.
// Айтем уходит из инбокса. Группировка по дню создания, новые сверху (бэк отдаёт desc).

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function pad(n: number): string {
  return `${n}`.padStart(2, "0");
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const today = new Date();
  const tKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const yKey = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
  if (key === tKey) return "Сегодня";
  if (key === yKey) return "Вчера";
  const base = `${d} ${MONTH_SHORT[m - 1]}`;
  return y === today.getFullYear() ? base : `${base} ${y}`;
}
function sourceLabel(it: InboxItem): string {
  return it.source === "session" ? "из сессий" : "моё";
}
function hasPhoto(it: InboxItem): boolean {
  return !!it.attachments && it.attachments.length > 0;
}
// Заголовок сырой карточки: текст подписи, иначе осмысленный фоллбэк (не «(photo)»).
function inboxTitle(it: InboxItem): string {
  if (it.raw_content) return it.raw_content;
  if (hasPhoto(it) || it.kind === "photo") return "Фото без подписи";
  return "Без названия";
}

export function Inbox({ onChange, onOpenTask }: { onChange: () => void; onOpenTask?: (t: Task) => void }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const busy = useRef(false);

  async function load() {
    setItems(await getInbox());
  }
  useEffect(() => {
    load();
  }, []);

  // группы по дню; порядок вставки = новые сверху (айтемы уже desc по created_at)
  const groups = useMemo(() => {
    const map = new Map<string, InboxItem[]>();
    for (const it of items) {
      const k = dayKey(it.created_at);
      const arr = map.get(k);
      if (arr) arr.push(it);
      else map.set(k, [it]);
    }
    return [...map.entries()];
  }, [items]);

  // Тап по карточке: создать задачу из сырого текста, перенести фото, открыть деталь.
  async function openCard(it: InboxItem) {
    if (busy.current) return;
    busy.current = true;
    try {
      const task = await createTask(inboxTitle(it)); // project null → Входящие, дальше меняешь в детали
      await resolveInbox(it.id, task.id);            // перенос вложений + пометка разобранным
      await load();
      onChange();
      onOpenTask?.(task);
    } finally {
      busy.current = false;
    }
  }

  if (items.length === 0) {
    return <Empty text="Inbox пуст. Кидай мысли боту в Telegram." />;
  }

  return (
    <>
      {groups.map(([key, list]) => (
        <div key={key}>
          <div className="group-head" style={{ cursor: "default" }}>
            <span className="gh-name">{dayLabel(key)}</span>
            <span className="gh-cnt">{list.length}</span>
          </div>
          <div className="list">
            {list.map((it) => (
              <div
                key={it.id}
                className="task-row"
                onClick={() => openCard(it)}
                style={{ cursor: "pointer" }}
              >
                <div className="checkbox" aria-hidden="true" />
                <div className="grow">
                  <div>{inboxTitle(it)}</div>
                  <div className="muted mono" style={{ fontSize: 13, marginTop: 2 }}>
                    {hasPhoto(it) ? "фото · из Telegram" : sourceLabel(it)}
                  </div>
                </div>
                {hasPhoto(it) && <img className="ti-thumb" src={attachmentSrc(it.attachments![0].id)} alt="" />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
