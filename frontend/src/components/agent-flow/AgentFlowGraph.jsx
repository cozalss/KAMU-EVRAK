/* Ajan Akış Şeması — canlı SVG iş-akışı görselleştirmesi (custom SVG, SIFIR ek dep).
   Evrak işlenirken hangi ajanın çalıştığını, paralel kolları (mevzuat ∥ özet) ve Görev-1/
   Görev-2 ayrımını gerçek-zamanlı gösterir. Her node SSE'de "done" olunca yanar.
   RED-LINE: yalnız İLERLEME görselleştirir; sonuç (tür/birim/yazı) backend'de üretilir.

   Props:
     nodes: [{ id, label, gorev, status, data }]  — App SSE'den günceller
            status ∈ "pending" | "active" | "done" | "error"
   Erişilebilir: role=img + aria-label (canlı özet) + figcaption status-region;
   prefers-reduced-motion ile animasyonlar kapanır (CSS). */
import React, { useMemo } from "react";
import { PIPELINE, EDGES, edgeState, buildFigcaption } from "./topology.js";

// ---- SVG yerleşim sabitleri (col/row → piksel) ----
const PAD_X = 60;
const PAD_Y = 56;
const COL_W = 138;
const ROW_H = 78;
const NODE_W = 116;
const NODE_H = 52;
const N_COLS = 8; // oku..finalize
const VIEW_W = PAD_X * 2 + (N_COLS - 1) * COL_W;
const VIEW_H = PAD_Y * 2 + 2 * ROW_H;

const centerX = (col) => PAD_X + col * COL_W;
const centerY = (row) => PAD_Y + row * ROW_H;
const byId = Object.fromEntries(PIPELINE.map((n) => [n.id, n]));

// Düğüm sağ-kenarından sonraki düğüm sol-kenarına yumuşak bezier kenar.
function edgePath(fromId, toId) {
  const a = byId[fromId];
  const b = byId[toId];
  const x1 = centerX(a.col) + NODE_W / 2;
  const y1 = centerY(a.row);
  const x2 = centerX(b.col) - NODE_W / 2;
  const y2 = centerY(b.row);
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

const MARK = { done: "✓", active: "●", error: "✕", pending: "" };

export function AgentFlowGraph({ nodes }) {
  // status haritası — props.nodes'tan; eksikse PIPELINE'dan "pending".
  const statusById = useMemo(() => {
    const map = {};
    for (const n of PIPELINE) map[n.id] = "pending";
    for (const n of nodes || []) if (n?.id in map) map[n.id] = n.status || "pending";
    return map;
  }, [nodes]);

  const dataById = useMemo(() => {
    const map = {};
    for (const n of nodes || []) if (n?.id) map[n.id] = n.data;
    return map;
  }, [nodes]);

  const caption = buildFigcaption(statusById);
  const doneCount = PIPELINE.filter((n) => statusById[n.id] === "done").length;
  const total = PIPELINE.length;

  return (
    <figure className="agw-figure" role="group" aria-label="Ajan akış şeması">
      <div className="agw-head">
        <span className="agw-title">Ajan Ekibi · Canlı Akış</span>
        <span className="agw-legend" aria-hidden="true">
          <span className="agw-legend-item g1"><i className="agw-swatch" /> Görev 1: Anla</span>
          <span className="agw-legend-item g2"><i className="agw-swatch" /> Görev 2: Üret</span>
        </span>
        <span className="agw-progress" aria-hidden="true">{doneCount}/{total}</span>
      </div>

      <div className="agw-scroll">
        <svg
          className="agw-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="presentation"
          aria-hidden="true"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="agw-arrow" markerWidth="7" markerHeight="7" refX="5.4" refY="3"
              orient="auto" markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L6,3 L0,6 Z" className="agw-arrowhead" />
            </marker>
          </defs>

          {/* Kenarlar (düğümlerin ALTINDA) */}
          <g className="agw-edges">
            {EDGES.map((e) => (
              <path
                key={`${e.from}-${e.to}`}
                className={`agw-edge agw-edge-${edgeState(statusById, e)}`}
                d={edgePath(e.from, e.to)}
                fill="none"
                markerEnd="url(#agw-arrow)"
              />
            ))}
          </g>

          {/* Düğümler */}
          <g className="agw-nodes">
            {PIPELINE.map((n) => {
              const st = statusById[n.id];
              const x = centerX(n.col) - NODE_W / 2;
              const y = centerY(n.row) - NODE_H / 2;
              const summary = summarize(n.id, dataById[n.id]);
              return (
                <g
                  key={n.id}
                  className={`agw-node agw-node-${st} agw-g${n.gorev}`}
                  transform={`translate(${x} ${y})`}
                >
                  {st === "active" && (
                    <rect className="agw-pulse" x="-4" y="-4" width={NODE_W + 8} height={NODE_H + 8} rx="14" />
                  )}
                  <rect className="agw-card" width={NODE_W} height={NODE_H} rx="11" />
                  {/* Görev rengi sol-şerit (renk TEK ayırt edici değil; ✓/● işaret + bold da var) */}
                  <rect className="agw-stripe" width="4" height={NODE_H} rx="2" />
                  <text className="agw-dot" x={NODE_W - 13} y="17" aria-hidden="true">{MARK[st]}</text>
                  <text className="agw-label" x="14" y="21">{n.label}</text>
                  <text className="agw-sub" x="14" y="36">{summary || n.desc}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* a11y: figure aria-label statik ad sağlar; TEK aria-live bölge dinamik durumu duyurur. */}
      <figcaption className="agw-sr" role="status" aria-live="polite">{caption}</figcaption>
    </figure>
  );
}

/* Node "done" olunca kutuda gösterilecek kompakt özet (SSE data alanından). */
function summarize(id, d) {
  if (!d) return "";
  if (id === "oku") return `${d.engine || "metin"} · ${d.n_chars ?? 0} krk`;
  if (id === "siniflandir") {
    const pct = Math.round((d.tur_confidence || 0) * 100);
    return d.evrak_turu ? `${d.evrak_turu} · %${pct}` : "";
  }
  if (id === "cikar") {
    const n = d.bilgi_unsurlari ? Object.keys(d.bilgi_unsurlari).length : 0;
    const pii = d.bilgi_unsurlari?.pii_var ? " · PII⚑" : "";
    return n ? `${n} alan${pii}` : "";
  }
  if (id === "eksik_tespit") {
    const n = (d.eksik_alanlar || []).length;
    return n ? `${n} eksik` : "tam ✓";
  }
  if (id === "mevzuat_oner") {
    const n = (d.mevzuat_onerileri || []).length;
    return n ? `${n} öneri` : "";
  }
  if (id === "ozetle") return d.ozet ? "özet ✓" : "";
  if (id === "route_birim") return d.hedef_birim ? "havale ✓" : "";
  if (id === "yazi_taslak") return d.format_uyumlu ? "format ✓" : d.yazi_turu ? "taslak" : "";
  return "";
}

export default AgentFlowGraph;
