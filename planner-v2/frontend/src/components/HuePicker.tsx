import { useRef, useState } from "react";

// Свободный выбор цвета проекта по спектру (мокап V3 T1-drawer C3/C4).
// Знаем только оттенок (hue): S/L зафиксированы под тёмную тему. Без hex-литералов в
// коде (всё вычисляется) — lint:tokens чист; градиент-спектр живёт в theme.css (.hue).

const SAT = 0.62;
const LIG = 0.56;

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

function hexToHue(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length < 6) return 30;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 30;
  let h: number;
  if (mx === r) h = (((g - b) / d) % 6 + 6) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function HuePicker({ value, onChange }: { value: string | null; onChange: (hex: string) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [, force] = useState(0);

  const hue = value ? hexToHue(value) : 30;
  const cur = value ?? hslToHex(hue, SAT, LIG);
  const left = (hue / 360) * 100;

  function pick(clientX: number) {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(hslToHex(t * 360, SAT, LIG));
  }

  return (
    <div className="picker">
      <div
        className="hue"
        ref={barRef}
        onPointerDown={(e) => { dragging.current = true; try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* нет активного pointer (тест/edge) — не критично */ } pick(e.clientX); force((n) => n + 1); }}
        onPointerMove={(e) => { if (dragging.current) pick(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
      >
        <div className="knob" style={{ left: `${left}%`, background: cur }} />
      </div>
      <div className="pk-row">
        <span className="pk-cur" style={{ background: cur }} />
        <span className="pk-hex mono">{cur.toUpperCase()}</span>
        <span className="pk-note mono">= цвет задач проекта</span>
      </div>
    </div>
  );
}
