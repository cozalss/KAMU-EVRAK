/* Ajan Akış Şeması — canlı SVG iş-akışı görselleştirmesi (custom SVG, SIFIR ek dep).
   Evrak işlenirken hangi ajanın çalıştığını, paralel kolları (mevzuat ∥ özet) ve Görev-1/
   Görev-2 ayrımını gerçek-zamanlı gösterir. Her node SSE'de "done" olunca yanar.
   RED-LINE: yalnız İLERLEME görselleştirir; sonuç (tür/birim/yazı) backend'de üretilir.

   Demo yıldızı: akan kenarlar (stroke-dashoffset), aktif yolda gezen "komet" parıltısı,
   sırayla yanan node'lar (glow + pulse), Görev-1 (yeşil) / Görev-2 (mavi) bölge bantları,
   üstte canlı ilerleme çubuğu.

   Props:
     nodes: [{ id, label, gorev, status, data }]  — App SSE'den günceller
            status ∈ "pending" | "active" | "done" | "error"
   Erişilebilir: role=img + aria-label (canlı özet) + figcaption status-region;
   prefers-reduced-motion ile animasyonlar kapanır (CSS). */
import React, { useMemo } from "react";
import { PIPELINE, EDGES, edgeState, buildFigcaption } from "./topology.js";

// ---- SVG yerleşim sabitleri (col/row → piksel) ----
const PAD_X = 64;
const PAD_Y = 64;
const COL_W = 138;
const ROW_H = 82;
const NODE_W = 116;
const NODE_H = 52;
// Sütun sayısı PIPELINE'dan türetilir (node eklendiğinde SVG genişliği otomatik uyar).
const N_COLS = Math.max(...PIPELINE.map((n) => n.col)) + 1; // oku..finalize
const VIEW_W = PAD_X * 2 + (N_COLS - 1) * COL_W;
const VIEW_H = PAD_Y * 2 + 2 * ROW_H;

const centerX = (col) => PAD_X + col * COL_W;
const centerY = (row) => PAD_Y + row * ROW_H;
const byId = Object.fromEntries(PIPELINE.map((n) => [n.id, n]));

// Görev-1 / Görev-2 bölge sınırı: ilk gorev=2 node'unun sütunundan önce ayrılır.
const FIRST_G2_COL = Math.min(...PIPELINE.filter((n) => n.gorev === 2).map((n) => n.col));
const BAND_SPLIT_X = centerX(FIRST_G2_COL) - COL_W / 2;

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
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount >= total;

  // SC 4.1.2 — ilerleyiş ekran okuyucuya erişilebilir metin olarak verilir
  const progressLabel = `${doneCount} / ${total} ajan tamamlandı`;

  return (
    /*
     * SC 4.1.2 / SC 1.3.1 — <figure> öğesi örtük role="figure" taşır;
     * aria-label ile adlandırılmış. role="group" kaldırıldı (spec'te figure ile çakışır).
     * figcaption role="status" + aria-live dinamik güncellemeleri duyurur.
     */
    <figure
      className={"agw-figure" + (allDone ? " is-complete" : "")}
      aria-label="Ajan akış şeması — canlı işleme durumu"
    >
      <div className="agw-head">
        <span className="agw-title" aria-hidden="true">
          <span className="agw-live-dot" aria-hidden="true" />
          Ajan Ekibi · Canlı Akış
        </span>
        {/*
         * SC 1.4.1 — renk tek sinyal DEĞİL: görev ayrımı hem renk (şerit) hem metin
         * (Görev 1 / Görev 2 etiketi) ile sağlanıyor.
         * legend artık aria-hidden değil; ekran okuyucu görev açıklamalarını duyabilir.
         */}
        <span className="agw-legend">
          <span className="agw-legend-item g1">
            <i className="agw-swatch" aria-hidden="true" />
            <span>Görev 1: Anla</span>
          </span>
          <span className="agw-legend-item g2">
            <i className="agw-swatch" aria-hidden="true" />
            <span>Görev 2: Üret</span>
          </span>
        </span>
        {/* SC 4.1.2 — görsel sayaç + görünmez erişilebilir etiket */}
        <span
          className="agw-progress"
          aria-label={progressLabel}
          title={progressLabel}
        >
          <span aria-hidden="true">{doneCount}/{total}</span>
        </span>
      </div>

      {/* Canlı ilerleme çubuğu — görsel; sayı zaten agw-progress'te erişilebilir.
          width compositor-dostu değil ama tek öğe + nadir güncellenir (node başına). */}
      <div className="agw-bar" aria-hidden="true">
        <span
          className={"agw-bar-fill" + (allDone ? " full" : "")}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="agw-scroll">
        {/*
         * SC 1.1.1 — SVG tamamen dekoratif/görsel; anlamsal içerik figcaption
         * aria-live bölgesinde metin olarak sağlanıyor. aria-hidden="true" doğru.
         */}
        <svg
          className="agw-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="Ajan pipeline akış diyagramı"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* SVG başlığı — role="img" + title kombinasyonu SC 1.1.1 uyumlu */}
          <title>Ajan pipeline akış diyagramı</title>
          <defs>
            <marker
              id="agw-arrow" markerWidth="7" markerHeight="7" refX="5.4" refY="3"
              orient="auto" markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L6,3 L0,6 Z" className="agw-arrowhead" />
            </marker>
            {/* aktif düğüm parıltısı için yumuşak glow */}
            <filter id="agw-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Görev bölge bantları (arka plan) — Görev-1 (yeşil) / Görev-2 (mavi) ayrımı
              hem renk hem üstteki legend metniyle (SC 1.4.1: renk tek sinyal değil). */}
          <g className="agw-bands" aria-hidden="true">
            <rect className="agw-band agw-band-g1" x="0" y="0" width={BAND_SPLIT_X} height={VIEW_H} />
            <rect
              className="agw-band agw-band-g2"
              x={BAND_SPLIT_X} y="0" width={VIEW_W - BAND_SPLIT_X} height={VIEW_H}
            />
            <line className="agw-band-split" x1={BAND_SPLIT_X} y1="14" x2={BAND_SPLIT_X} y2={VIEW_H - 14} />
          </g>

          {/* Kenarlar (düğümlerin ALTINDA) */}
          <g className="agw-edges" aria-hidden="true">
            {EDGES.map((e) => {
              const state = edgeState(statusById, e);
              const d = edgePath(e.from, e.to);
              return (
                <g key={`${e.from}-${e.to}`}>
                  <path
                    className={`agw-edge agw-edge-${state}`}
                    d={d}
                    fill="none"
                    markerEnd="url(#agw-arrow)"
                  />
                  {/* Aktif yolda gezen "komet" — yalnız akan kenarda; akış yönünü güçlendirir.
                      pathLength normalize → dash uzunluğu yola bağımsız. */}
                  {state === "flowing" && (
                    <path
                      className="agw-edge-comet"
                      d={d}
                      fill="none"
                      pathLength="100"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* Düğümler — görsel temsil; erişilebilir metin figcaption'da */}
          <g className="agw-nodes" aria-hidden="true">
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
                    <>
                      <rect className="agw-pulse" x="-5" y="-5" width={NODE_W + 10} height={NODE_H + 10} rx="15" />
                      <rect className="agw-pulse agw-pulse-2" x="-5" y="-5" width={NODE_W + 10} height={NODE_H + 10} rx="15" />
                    </>
                  )}
                  <rect
                    className="agw-card"
                    width={NODE_W} height={NODE_H} rx="11"
                    filter={st === "active" ? "url(#agw-glow)" : undefined}
                  />
                  {/* Görev rengi sol-şerit (renk TEK ayırt edici değil; ✓/● işaret + Görev etiketi de var) */}
                  <rect className="agw-stripe" width="4" height={NODE_H} rx="2" />
                  <text className="agw-dot" x={NODE_W - 13} y="17">{MARK[st]}</text>
                  <text className="agw-label" x="14" y="21">{n.label}</text>
                  <text className="agw-sub" x="14" y="36">{summary || n.desc}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/*
       * SC 4.1.3 Durum Mesajları — figcaption role="status" + aria-live="polite"
       * ekran okuyucuya her node değişiminde güncel durumu duyurur.
       * figure'ın erişilebilir açıklamasını da sağlar (figcaption).
       */}
      <figcaption className="agw-sr" role="status" aria-live="polite" aria-atomic="true">
        {caption}
      </figcaption>
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
  if (id === "verify") {
    const n = (d.verify_uyari || []).length;
    if (n) return `${n} uyarı ⚠`;
    return d.format_uyumlu === false ? "format ⚠" : "uyumlu ✓";
  }
  return "";
}

export default AgentFlowGraph;
