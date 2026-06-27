/* TerminalLog — islem-gunlugu.log. Boru-hattı çalışırken zaman-damgalı ajan satırları.
   Gerçek SSE (dosya) yolunda süreler GERÇEK ölçüm; örnek (JSON) yolunda istemci-simülasyonu
   (dürüstçe işaretlenir — R8). Her done node bir satır: [mm:ss] Ann Label → summarize. */
import React, { useEffect, useRef } from "react";
import { summarize } from "../lib/nodeMeta.js";

function fmtClock(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function TerminalLog({ nodes, fileMeta, busy }) {
  const bodyRef = useRef(null);
  const doneCount = nodes.filter((n) => n.status === "done").length;
  const activeIdx = nodes.findIndex((n) => n.status === "active");
  const activeNode = activeIdx >= 0 ? nodes[activeIdx] : null;
  const simulated = fileMeta?.kind === "sample";
  const target = fileMeta?.name || "evrak";

  // Yeni satır eklendikçe en alta kaydır.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [doneCount, activeNode?.id]);

  return (
    <section className="dash-terminal" aria-label="İşlem günlüğü">
      <div className="dash-term-head">
        <span className="dash-term-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="dash-term-title">islem-gunlugu.log — boru-hatti</span>
      </div>
      <div className="dash-term-body" ref={bodyRef}>
        <div className="dash-term-cmd">
          <span className="pfx">$ </span>pipeline --run {target} --agents {nodes.length}
        </div>
        {nodes.map((n, i) => {
          if (n.status !== "done") return null;
          const summary = summarize(n.id, n.data) || n.desc;
          return (
            <div key={n.id} className={`dash-term-line g${n.gorev}`}>
              <span className="dash-term-ts">[{fmtClock(n.t1)}]</span>
              <span className="dash-term-tag">A{String(i + 1).padStart(2, "0")} {n.label}</span>
              <span className="dash-term-msg"><span className="arrow">→</span>{summary}</span>
            </div>
          );
        })}
        {activeNode && (
          <div className={`dash-term-line g${activeNode.gorev}`}>
            <span className="dash-term-ts">[{fmtClock(activeNode.t0)}]</span>
            <span className="dash-term-tag">A{String(activeIdx + 1).padStart(2, "0")} {activeNode.label}</span>
            <span className="dash-term-msg"><span className="arrow">→</span>çalışıyor<span className="dash-term-cursor" aria-hidden="true" /></span>
          </div>
        )}
        {!busy && doneCount === nodes.length && nodes.length > 0 && (
          <div className="dash-term-line g2">
            <span className="dash-term-ts">[{fmtClock(nodes[nodes.length - 1]?.t1)}]</span>
            <span className="dash-term-tag" style={{ color: "var(--ok-ink)" }}>✓ tamamlandı</span>
            <span className="dash-term-msg"><span className="arrow">→</span>{nodes.length} ajan başarıyla yürütüldü</span>
          </div>
        )}
      </div>
      {simulated && (
        <p className="dash-term-sim">Örnek metin yolunda süreler istemci simülasyonudur; dosya yüklemede gerçek akış süreleri ölçülür.</p>
      )}
    </section>
  );
}

export default TerminalLog;
