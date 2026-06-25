import { useRef, useState, useCallback, useEffect } from "react";
import { PIPELINE } from "./components/agent-flow/topology.js";
import { AgentFlowGraph } from "./components/agent-flow/AgentFlowGraph.jsx";
import { ResultCards } from "./components/result-cards.jsx";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";

// kamu-evrak demo arayüzü — evrak yükle (SSE) VEYA örnek metin gönder (JSON) → canlı node akışı + sonuç kartları.
// SIFIR ek dep (react/react-dom dışında). TEKNOFEST 2026, 1. Senaryo — Demo (15p) + real-time avantajı.

const MAX_UPLOAD_MB = 20; // backend MAX_UPLOAD_BYTES (20 MiB) ile eşleşir
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx";
// JSON yolunda gerçek SSE yok → node'ları sırayla "yan" göster (düşünen-sistem hissi).
const STEP_MS = 320;

const freshNodes = () => PIPELINE.map((n) => ({ ...n, status: "pending", data: null }));

export default function App() {
  const [nodes, setNodes] = useState(freshNodes);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  const [fileName, setFileName] = useState("");
  // İndirme için son işlenen evrak metni (örnek metin yolunda dolu; dosya/OCR
  // yolunda boş kalır → buton metin gerektiğini bildirir). + indirme durumu.
  const [evrakText, setEvrakText] = useState("");
  const [downloading, setDownloading] = useState("");

  const fileRef = useRef(null);
  const stepTimers = useRef([]);
  const toastTimer = useRef(null);

  // Tüm zamanlayıcıları temizle (unmount + her yeni çalıştırma başında).
  const clearTimers = useCallback(() => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
  }, []);
  useEffect(() => () => { clearTimers(); clearTimeout(toastTimer.current); }, [clearTimers]);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setNodes(freshNodes());
    setResult(null);
    setError("");
    setEvrakText("");
  }, [clearTimers]);

  // Tek node durum güncelle (SSE event veya client adımlama).
  const markNode = useCallback((id, status, data) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status, data: data ?? n.data } : n)));
  }, []);

  // SSE event işleyici. Bir node "done" gelince, sıradaki(ler)i "active" yap (akış hissi).
  const handleEvent = useCallback((ev) => {
    if (ev.event === "start") {
      // start.nodes: ["oku", ...PIPELINE_NODES] — ilk node'u aktifle.
      setNodes((prev) => prev.map((n, i) => (i === 0 ? { ...n, status: "active" } : n)));
    } else if (ev.event === "node") {
      setNodes((prev) => {
        const idx = prev.findIndex((n) => n.id === ev.node);
        return prev.map((n, i) => {
          if (n.id === ev.node) return { ...n, status: "done", data: ev.data ?? n.data };
          // sıradaki pending node(lar)ı aktifle — paralel kol (mevzuat∥özet) ikisi de yanar
          if (i > idx && n.status === "pending") {
            const prevDoneOrActive = prev[i - 1]?.status;
            if (prevDoneOrActive === "done" || prevDoneOrActive === "active") {
              return { ...n, status: "active" };
            }
          }
          return n;
        });
      });
    } else if (ev.event === "done") {
      setResult(ev.result);
      setNodes((prev) => prev.map((n) => (n.status === "pending" || n.status === "active" ? { ...n, status: "done" } : n)));
    } else if (ev.event === "error") {
      setError(ev.message || "İşleme hatası");
      setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error" } : n)));
    }
  }, []);

  // ---------- A) Dosya yükle → /process_doc/stream (gerçek SSE) ----------
  const runStream = useCallback(async (file) => {
    reset();
    setBusy(true);
    setSelectedSample(null);
    setFileName(file.name);
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
          try { handleEvent(JSON.parse(line.slice(5).trim())); }
          catch { /* yarım/parçalı satır — sonraki chunk'ta tamamlanır */ }
        }
      }
    } catch (err) {
      setError(err?.message || "Bağlantı hatası — backend çalışıyor mu?");
      // hata anında aktif node'u error işaretle (akış nerede durdu görünsün)
      setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error" } : n)));
    } finally {
      setBusy(false);
    }
  }, [reset, handleEvent]);

  // Sonucun alanlarından her node'a özet türetip sırayla "done" işaretle (görsel akış).
  const animateNodes = useCallback((data, nChars = 0) => {
    const dataFor = (id) => nodeDataFromResult(id, data, nChars);
    PIPELINE.forEach((n, i) => {
      const tActive = setTimeout(() => markNode(n.id, "active"), Math.max(0, i * STEP_MS - 140));
      const tDone = setTimeout(() => {
        markNode(n.id, "done", dataFor(n.id));
        if (i === PIPELINE.length - 1) setBusy(false);
      }, i * STEP_MS + 120);
      stepTimers.current.push(tActive, tDone);
    });
  }, [markNode]);

  // ---------- B) Örnek metin gönder → /process_doc (JSON, OCR'sız) ----------
  // Gerçek SSE yok → sonucu aldıktan sonra node'ları sırayla "yan" göstererek
  // "düşünen sistem" hissini koru (Demo). Backend'in döndürdüğü gerçek verilerle dolar.
  const runSampleJson = useCallback(async (sample) => {
    reset();
    setBusy(true);
    setSelectedSample(sample.id);
    setFileName("");
    setEvrakText(sample.text);  // indirme bu metinden taslak üretir
    try {
      const res = await fetch("/process_doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evrak_text: sample.text, filename: `${sample.id}.txt` }),
      });
      if (!res.ok) throw new Error(`Sunucu hatası (${res.status})`);
      const data = await res.json();

      // OCR adımı yok (metin verildi) → "oku"yu metin uzunluğuyla tamam say.
      animateNodes(data, sample.text.length);
      // Kartlar adımlama bittikten sonra belirsin (akış → sonuç akışı doğal).
      const t = setTimeout(() => setResult(data), PIPELINE.length * STEP_MS + 120);
      stepTimers.current.push(t);
    } catch (err) {
      setError(err?.message || "Bağlantı hatası — backend çalışıyor mu?");
      setBusy(false);
    }
  }, [reset, animateNodes]);

  // ---------- C) Taslağı PDF/DOCX indir → /yazi/taslak ----------
  // Backend pipeline'ı evrak metninden tekrar koşar → render edilmiş bytes döner.
  // Blob → createObjectURL → görünmez <a download> tıkla → URL'i serbest bırak.
  const onDownload = useCallback(async (format) => {
    if (!evrakText) {
      showToast("İndirme için evrak metni gerekli. Lütfen örnek bir evrak seçin.");
      return;
    }
    setDownloading(format);
    let url = "";
    try {
      const res = await fetch(`/yazi/taslak?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evrak_text: evrakText }),
      });
      if (!res.ok) throw new Error(`Taslak indirilemedi (${res.status})`);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resmi-yazi-taslak.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`Taslak ${format.toUpperCase()} olarak indirildi.`);
    } catch (err) {
      showToast(err?.message || "Taslak indirilemedi — backend çalışıyor mu?");
    } finally {
      if (url) URL.revokeObjectURL(url);
      setDownloading("");
    }
  }, [evrakText, showToast]);

  // ---------- dosya seçimi / drag-drop ----------
  const validateAndRun = useCallback((file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Dosya çok büyük (en fazla ${MAX_UPLOAD_MB} MB).`);
      return;
    }
    runStream(file);
  }, [runStream]);

  const onPick = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    validateAndRun(file);
  }, [validateAndRun]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    validateAndRun(e.dataTransfer.files?.[0]);
  }, [validateAndRun]);

  const started = busy || !!result || !!error;

  return (
    <div className="ke-app">
      <a href="#ke-main" className="ke-skip">İçeriğe geç</a>

      <header className="ke-header">
        <div className="ke-brand">
          <span className="ke-logo" aria-hidden="true">📑</span>
          <div>
            <h1>kamu-evrak</h1>
            <p>Kamu Evrak ve Yazışma için Akıllı Agent Destek Sistemi — <i>TEKNOFEST 2026, 1. Senaryo</i></p>
          </div>
        </div>
        <ul className="ke-trust" aria-label="Sistem güvenceleri">
          <li>✓ 2 görev tek pipeline</li>
          <li>🛡️ Kişisel veri maskeli</li>
          <li>⚖️ Karar destek — uydurmasız</li>
        </ul>
      </header>

      <main id="ke-main" className="ke-main">
        {/* ---- Yükleme alanı ---- */}
        <section className="ke-intake" aria-label="Evrak yükleme">
          <div
            className={"ke-drop" + (dragOver ? " over" : "") + (busy ? " busy" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); fileRef.current?.click(); } }}
            role="button"
            tabIndex={0}
            aria-label="Evrak dosyası yükle: tıkla veya sürükle bırak (PDF, görsel, Word)"
            aria-disabled={busy}
          >
            <span className="ke-drop-ic" aria-hidden="true">⬆️</span>
            <span className="ke-drop-main">{fileName ? fileName : "Evrakı buraya sürükle veya tıkla"}</span>
            <span className="ke-drop-sub">PDF · JPG/PNG · TIFF · Word (.docx) — en fazla {MAX_UPLOAD_MB} MB</span>
            <input
              ref={fileRef} type="file" accept={ACCEPT} hidden
              onChange={onPick} aria-hidden="true" tabIndex={-1}
            />
          </div>

          <div className="ke-samples" aria-label="Örnek evraklar">
            <span className="ke-samples-h">Dosyan yok mu? Örnek bir evrakı dene:</span>
            <div className="ke-samples-row">
              {SAMPLE_DOCS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"ke-sample" + (selectedSample === s.id ? " active" : "")}
                  onClick={() => !busy && runSampleJson(s)}
                  disabled={busy}
                  title={s.aciklama}
                  aria-pressed={selectedSample === s.id}
                >
                  <span className="ke-sample-ic" aria-hidden="true">{s.icon}</span>
                  <span className="ke-sample-tx">
                    <span className="ke-sample-label">{s.label}</span>
                    <span className="ke-sample-desc">{s.aciklama}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="ke-error" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
            <button type="button" className="ke-error-x" onClick={() => setError("")} aria-label="Hatayı kapat">✕</button>
          </div>
        )}

        {/* ---- Canlı Ajan Akış Şeması ---- */}
        {started && (
          <section className="ke-flow-wrap" aria-label="Ajan akış şeması">
            <AgentFlowGraph nodes={nodes} />
          </section>
        )}

        {/* ---- Sonuç kartları ---- */}
        {result && (
          <section className="ke-result-wrap" aria-live="polite">
            <ResultCards
              r={result} onToast={showToast}
              onDownload={onDownload} downloading={downloading}
              canDownload={!!evrakText}
            />
          </section>
        )}

        {!started && (
          <section className="ke-placeholder" aria-hidden="true">
            <p>Bir evrak yükleyin ya da örnek seçin; sistem evrakı <strong>9 ajanlı</strong> bir
              boru hattından geçirir: okuma → sınıflandırma → bilgi çıkarma → eksik tespiti →
              mevzuat → özet → birim havalesi → resmî yazı taslağı → bilgilendirme.</p>
          </section>
        )}
      </main>

      {/* a11y: kalıcı canlı bölge — ekran okuyucu toast'ı duyurur */}
      <div className="ke-sr" role="status" aria-live="polite">{toast}</div>
      {toast && (
        <div className="ke-toast" role="presentation">{toast}</div>
      )}
    </div>
  );
}

/* ProcessResponse'tan bir node için SSE'ye eşdeğer özet veri çıkar (JSON yolu animasyonu). */
function nodeDataFromResult(id, r, nChars = 0) {
  switch (id) {
    case "oku": return { engine: "metin", n_chars: nChars, page_count: 1 };
    case "siniflandir": return { evrak_turu: r.evrak_turu, tur_confidence: r.tur_confidence };
    case "cikar": return { bilgi_unsurlari: r.bilgi_unsurlari };
    case "eksik_tespit": return { eksik_alanlar: r.eksik_alanlar };
    case "mevzuat_oner": return { mevzuat_onerileri: r.mevzuat_onerileri };
    case "ozetle": return { ozet: r.ozet };
    case "route_birim": return { hedef_birim: r.hedef_birim };
    case "yazi_taslak": return { yazi_turu: r.yazi_turu, format_uyumlu: !!r.yazi_taslak_md };
    case "finalize": return {};
    default: return null;
  }
}
