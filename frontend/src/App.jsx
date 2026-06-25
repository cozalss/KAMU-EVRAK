import { useRef, useState } from "react";
import { PIPELINE } from "./components/agent-flow/topology.js";

// kamu-evrak demo arayüzü — dosya yükle → /process_doc/stream SSE → canlı node akışı + sonuç.
// Kendi-kendine yeten (kopyalanan legal bileşenlere bağımlı DEĞİL). Demo (15p) için "düşünen sistem".
// # TODO(kamu-evrak): kopyalanan components/{ui,cards,panels} + agent-flow/AgentFlowGraph ile zenginleştir.

const STATUS = { pending: "•", active: "⏳", done: "✓" };

export default function App() {
  const [nodes, setNodes] = useState(() =>
    PIPELINE.map((n) => ({ ...n, status: "pending", data: null })),
  );
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  function reset() {
    setNodes(PIPELINE.map((n) => ({ ...n, status: "pending", data: null })));
    setResult(null);
    setError("");
  }

  function markNode(id, status, data) {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status, data: data ?? n.data } : n)),
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Lütfen bir evrak dosyası seçin (PDF/görsel/Word).");
    reset();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/process_doc/stream", { method: "POST", body: fd });
      if (!res.ok || !res.body) throw new Error(`Sunucu hatası (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const chunk of parts) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const ev = JSON.parse(line.slice(5).trim());
          handleEvent(ev);
        }
      }
    } catch (err) {
      setError(err.message || "Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  function handleEvent(ev) {
    if (ev.event === "node") markNode(ev.node, "done", ev.data);
    else if (ev.event === "done") setResult(ev.result);
    else if (ev.event === "error") setError(ev.message);
  }

  return (
    <div className="ke-app">
      <header className="ke-header">
        <h1>📑 kamu-evrak</h1>
        <p>Kamu Evrak ve Yazışma için Akıllı Agent Destek Sistemi — <i>TEKNOFEST 2026, 1. Senaryo</i></p>
      </header>

      <form className="ke-upload" onSubmit={onSubmit}>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx" />
        <button type="submit" disabled={busy}>{busy ? "İşleniyor…" : "Evrakı İşle"}</button>
      </form>
      {error && <div className="ke-error">⚠️ {error}</div>}

      <section className="ke-flow" aria-label="Ajan Akış Şeması">
        {nodes.map((n) => (
          <div key={n.id} className={`ke-node ke-${n.status} g${n.gorev}`}>
            <span className="ke-mark">{STATUS[n.status]}</span>
            <span className="ke-label">{n.label}</span>
            <span className="ke-desc">{n.desc}</span>
            {n.data && <span className="ke-nodedata">{summarize(n.id, n.data)}</span>}
          </div>
        ))}
      </section>

      {result && <Result r={result} />}
    </div>
  );
}

function summarize(id, d) {
  if (id === "oku") return `${d.engine || "?"} · ${d.n_chars ?? 0} karakter`;
  if (id === "siniflandir") return `${d.evrak_turu} (${Math.round((d.tur_confidence || 0) * 100)}%)`;
  if (id === "eksik_tespit") return `${(d.eksik_alanlar || []).length} eksik`;
  if (id === "route_birim") return d.hedef_birim;
  if (id === "yazi_taslak") return d.format_uyumlu ? "format ✓" : "eksik alanlı";
  return "";
}

function Result({ r }) {
  return (
    <section className="ke-result">
      <h2>Sonuç</h2>
      <div className="ke-bilgilendirme">{r.bilgilendirme}</div>
      {r.yazi_taslak_md && (
        <details open>
          <summary>📝 Resmî Yazı Taslağı ({r.yazi_turu})</summary>
          <pre>{r.yazi_taslak_md}</pre>
        </details>
      )}
      <details>
        <summary>🔎 Çıkarılan bilgi unsurları</summary>
        <pre>{JSON.stringify(r.bilgi_unsurlari, null, 2)}</pre>
      </details>
    </section>
  );
}
