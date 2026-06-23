import { useEffect, useState } from "react";

// ВРЕМЕННЫЙ дебаг: реальные числа вьюпорта на устройстве (навбар-провал на iOS не репродится в CDP).
// Снять после диагностики.
export function ViewportDebug() {
  const [s, setS] = useState<Record<string, number | string>>({});
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none;";
    document.body.appendChild(probe);
    const probeTop = document.createElement("div");
    probeTop.style.cssText = "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);pointer-events:none;";
    document.body.appendChild(probeTop);
    let maxLift = 0;   // макс (iH − tbBot): на сколько навбар отрывался от низа
    let maxSy = 0;     // макс |scrollY|
    let minVvH = 99999; // мин vv.height (схлопывался ли видимый вьюпорт)
    const read = () => {
      const vv = window.visualViewport;
      const tb = document.querySelector(".tabbar") as HTMLElement | null;
      const r = tb?.getBoundingClientRect();
      const iH = window.innerHeight;
      if (r) maxLift = Math.max(maxLift, Math.round(iH - r.bottom));
      maxSy = Math.max(maxSy, Math.abs(Math.round(window.scrollY)));
      if (vv) minVvH = Math.min(minVvH, Math.round(vv.height));
      setS({
        iH,
        vvH: vv ? Math.round(vv.height) : "—",
        vvT: vv ? Math.round(vv.offsetTop) : "—",
        saT: probeTop.offsetHeight,
        saB: probe.offsetHeight,
        tbT: r ? Math.round(r.top) : "—",
        tbB: r ? Math.round(r.bottom) : "—",
        tbInlineTop: tb?.style.top || "—",
        sy: Math.round(window.scrollY),
        MAXLIFT: maxLift,
        MAXSY: maxSy,
        MINVVH: minVvH,
      });
    };
    read();
    const id = window.setInterval(read, 80);
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    return () => { window.clearInterval(id); probe.remove(); probeTop.remove(); window.visualViewport?.removeEventListener("resize", read); window.visualViewport?.removeEventListener("scroll", read); };
  }, []);
  return (
    <div style={{ position: "fixed", top: "env(safe-area-inset-top)", left: 0, right: 0, zIndex: 999, background: "rgba(220,0,0,0.9)", color: "#fff", font: "11px/1.35 monospace", padding: "3px 6px", pointerEvents: "none", whiteSpace: "pre-wrap" }}>
      {`iH${s.iH} vvH${s.vvH} vvT${s.vvT} saT${s.saT} saB${s.saB}\ntbTop${s.tbT} tbBot${s.tbB} inTop${s.tbInlineTop} sy${s.sy}\nMAXLIFT ${s.MAXLIFT}  MAXSY ${s.MAXSY}  MINVVH ${s.MINVVH}`}
    </div>
  );
}
