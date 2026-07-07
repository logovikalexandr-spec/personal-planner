import { useRef, useState } from "react";
import { attachmentSrc, deleteAttachment } from "../api";
import { confirmDialog } from "../lib/confirm";
import type { Attachment } from "../types";
import { IcoTrash } from "./icons";

// Полноэкранный просмотр вложений. Свайп влево/вправо между фото, скачать, удалить.
// height:100vh (НЕ 100% / 100dvh) — закон iOS-PWA (урезанный вьюпорт даёт чёрную полосу).
export function PhotoViewer({
  atts, start = 0, onClose, onDeleted,
}: {
  atts: Attachment[];
  start?: number;
  onClose: () => void;
  onDeleted?: (id: number) => void;
}) {
  const [idx, setIdx] = useState(Math.min(Math.max(start, 0), atts.length - 1));
  const startX = useRef<number | null>(null);

  if (atts.length === 0) return null;
  const cur = atts[Math.min(idx, atts.length - 1)];

  function go(d: number) {
    setIdx((i) => Math.min(Math.max(i + d, 0), atts.length - 1));
  }
  function onTS(e: React.TouchEvent) { startX.current = e.touches[0].clientX; }
  function onTE(e: React.TouchEvent) {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  }

  async function remove() {
    const ok = await confirmDialog("Удалить фото?", { body: "Вложение удалится навсегда." });
    if (!ok) return;
    const id = cur.id;
    await deleteAttachment(id);
    onDeleted?.(id);
    if (atts.length <= 1) { onClose(); return; }
    setIdx((i) => Math.min(i, atts.length - 2));
  }

  return (
    <div className="pv">
      <div className="pv-bar">
        <button className="pv-ic" onClick={onClose} aria-label="Закрыть">✕</button>
        <div style={{ flex: 1 }} />
        <a className="pv-ic" href={attachmentSrc(cur.id)} download target="_blank" rel="noreferrer" aria-label="Скачать">⤓</a>
        <button className="pv-ic" onClick={remove} aria-label="Удалить"><IcoTrash /></button>
      </div>
      <div className="pv-stage" onTouchStart={onTS} onTouchEnd={onTE}>
        <img className="pv-img" src={attachmentSrc(cur.id)} alt="" />
        {idx > 0 && <button className="pv-nav left" onClick={() => go(-1)} aria-label="Назад">‹</button>}
        {idx < atts.length - 1 && <button className="pv-nav right" onClick={() => go(1)} aria-label="Вперёд">›</button>}
      </div>
      {atts.length > 1 && (
        <div className="pv-dots">
          {atts.map((a, i) => <i key={a.id} className={i === idx ? "on" : ""} />)}
        </div>
      )}
    </div>
  );
}
