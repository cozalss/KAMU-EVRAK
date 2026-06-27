/* AgentTracePanel — AJAN İZİ. N adımlı dikey ajan listesi (durum + canlı özet + süre).
   Node listesi DİNAMİK (usePipeline'dan; SSE start.nodes ile gelir → "N ADIM" gerçek sayı).
   Her node SSE'de done olunca summarize(id,data) ile gerçek özet gösterir. */
import React from "react";
import { summarize } from "../lib/nodeMeta.js";

function fmtTime(ms) {
  if (ms == null) return "";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const STATUS_BADGE = { active: "çalışıyor", error: "hata" };

export function AgentTracePanel({ nodes, busy }) {
  const total = nodes.length;
  const done = nodes.filter((n) => n.status === "done").length;

  return (
    <section className="dash-panel" aria-labelledby="dash-trace-h">
      <div className="dash-panel-head">
        <h2 id="dash-trace-h" className="dash-panel-h">Ajan İzi · {total} Adım</h2>
        <span className="dash-panel-tag">
          <span className="dot" aria-hidden="true" /> {done}/{total}
        </span>
      </div>
      <div className="dash-panel-body">
        <ol className="dash-trace">
          {nodes.map((n, i) => {
            const summary = summarize(n.id, n.data);
            const badge = STATUS_BADGE[n.status];
            return (
              <li key={n.id} className={`dash-trace-row ${n.status} g${n.gorev}`}>
                <span className="dash-trace-n" aria-hidden="true">
                  {n.status === "active"
                    ? <span className="dash-trace-spin" />
                    : String(i + 1).padStart(2, "0")}
                </span>
                <div className="dash-trace-tx">
                  <div className="dash-trace-label">
                    <span>{n.label}</span>
                    {badge && <span className="dash-trace-badge">{badge}</span>}
                    {n.t1 != null && n.status === "done" && (
                      <span className="dash-trace-time">{fmtTime(n.t1)}</span>
                    )}
                  </div>
                  {summary && <div className="dash-trace-summary">{summary}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export default AgentTracePanel;
