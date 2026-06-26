import { useRef, useState, useCallback, useEffect } from "react";
import { PIPELINE } from "./components/agent-flow/topology.js";
import { AgentFlowGraph } from "./components/agent-flow/AgentFlowGraph.jsx";
import { ResultCards, OnayPaneli } from "./components/result-cards.jsx";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { Icon } from "./components/icons.jsx";

// kamu-evrak demo arayüzü — evrak yükle (SSE) VEYA örnek metin gönder (JSON) → canlı node akışı + sonuç kartları.
// SIFIR ek dep (react/react-dom dışında). TEKNOFEST 2026, 1. Senaryo — Demo (15p) + real-time avantajı.

const MAX_UPLOAD_MB = 20; // backend MAX_UPLOAD_BYTES (20 MiB) ile eşleşir
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx";
// JSON yolunda gerçek SSE yok → node'ları sırayla "yan" göster (düşünen-sistem hissi).
const STEP_MS = 320;

const freshNodes = () => PIPELINE.map((n) => ({ ...n, status: "pending", data: null }));

// Örnekleri kategoriye göre, ilk-görülen sırayı koruyarak grupla (8-9 örnek → okunur düzen).
// grup alanı yoksa "Örnekler" başlığı altında toplanır (graceful).
// Grup adından güvenli HTML id üret (boşluk, slash, Türkçe özel karakter sorunsuz)
const slugifyGrup = (g) => g.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SAMPLE_GROUPS = (() => {
  const order = [];
  const byGroup = new Map();
  for (const s of SAMPLE_DOCS) {
    const grup = s.grup || "Örnekler";
    if (!byGroup.has(grup)) { byGroup.set(grup, []); order.push(grup); }
    byGroup.get(grup).push(s);
  }
  return order.map((grup) => ({ grup, slug: slugifyGrup(grup), items: byGroup.get(grup) }));
})();

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
  // HITL: memur onayı bekleyen taslak (data.onay_bekliyor) — varsa OnayPaneli açılır.
  const [pendingOnay, setPendingOnay] = useState(null);

  const fileRef = useRef(null);
  const stepTimers = useRef([]);
  const toastTimer = useRef(null);
  // Son çalıştırma — hata durumunda "Tekrar dene" için (dosya VEYA örnek).
  const lastRun = useRef(null);

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
    setPendingOnay(null);
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
      // M5: status="active" → node CANLI çalışıyor (ör. taranmış PDF'te OCR sürerken
      // 'oku' yanar); sonraki node'u henüz ilerletme. Diğer durumda node bitti.
      const nodeDone = ev.status !== "active";
      setNodes((prev) => {
        const idx = prev.findIndex((n) => n.id === ev.node);
        return prev.map((n, i) => {
          if (n.id === ev.node) {
            return { ...n, status: nodeDone ? "done" : "active", data: ev.data ?? n.data };
          }
          // sıradaki pending node(lar)ı aktifle — YALNIZ mevcut node bittiyse (paralel kol yanar)
          if (nodeDone && i > idx && n.status === "pending") {
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
    lastRun.current = { kind: "file", file };
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
    lastRun.current = { kind: "sample", sample };
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
      // HITL: taslakta durulduysa onay panelini aç (final sonucu resume sonrası gelir).
      const t = setTimeout(
        () => (data.onay_bekliyor ? setPendingOnay(data) : setResult(data)),
        PIPELINE.length * STEP_MS + 120,
      );
      stepTimers.current.push(t);
    } catch (err) {
      setError(err?.message || "Bağlantı hatası — backend çalışıyor mu?");
      setBusy(false);
    }
  }, [reset, animateNodes]);

  // HITL: memur kararını (onayla/düzenle/reddet) backend'e gönder → final sonucu al.
  const handleResume = useCallback(async (secim, metin = "", gerekce = "") => {
    const p = pendingOnay;
    if (!p?.thread_id) return;
    setBusy(true);
    try {
      const res = await fetch("/process_doc/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: p.thread_id, secim, metin, gerekce }),
      });
      if (!res.ok) throw new Error(`Onay gönderilemedi (${res.status})`);
      const final = await res.json();
      setPendingOnay(null);
      setResult(final);
      showToast(
        secim === "reddet" ? "Taslak reddedildi." :
        secim === "duzenle" ? "Düzenleme onaylandı." : "Taslak onaylandı.",
      );
    } catch (err) {
      showToast(err?.message || "Onay gönderilemedi — backend çalışıyor mu?");
    } finally {
      setBusy(false);
    }
  }, [pendingOnay, showToast]);

  // Hata sonrası son işlemi yeniden dene (dosya VEYA örnek metin).
  const onRetry = useCallback(() => {
    const last = lastRun.current;
    if (!last) { setError(""); return; }
    if (last.kind === "file") runStream(last.file);
    else if (last.kind === "sample") runSampleJson(last.sample);
  }, [runStream, runSampleJson]);

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
      {/* SC 2.4.1 Bypass Blocks — sayfanın üstüne atlama bağlantısı */}
      <a href="#ke-main" className="ke-skip">Ana içeriğe geç</a>

      {/* SC 1.3.6 Landmark bölgeleri — header */}
      <header className="ke-header">
        <div className="ke-header-top">
          <div className="ke-brand">
            {/* SC 1.1.1 — logo dekoratif SVG, aria-hidden doğru */}
            <span className="ke-logo" aria-hidden="true"><Icon.brand /></span>
            <div className="ke-brand-tx">
              {/* SC 2.4.6 Başlıklar — h1 sayfa başlığı */}
              <h1>kamu-evrak</h1>
              <p className="ke-subline">Kamu Evrak ve Yazışma için Akıllı Agent Destek Sistemi · <i>TEKNOFEST 2026, 1. Senaryo</i></p>
            </div>
          </div>
          <ul className="ke-trust" aria-label="Sistem güvenceleri">
            {/* SC 1.4.1 — ikon+metin birlikte; ikon tek sinyal değil.
                Doğruluk rozeti: docs/benchmark/llm-heldout.md gpt-4o held-out
                sınıflandırma macro-F1 0.908 / accuracy 0.907 (bağımsız iki held-out). */}
            <li className="ke-trust-metric">
              <Icon.target aria-hidden="true" /> <strong>~%91</strong>&nbsp;sınıflandırma doğruluğu
            </li>
            <li><Icon.shield className="ke-trust-i-g1" aria-hidden="true" /> Kişisel veri maskeli</li>
            <li><Icon.scale className="ke-trust-i-warn" aria-hidden="true" /> Karar destek — uydurmasız</li>
          </ul>
        </div>
        {/* hero ürün-vaadi — gerçek kahraman (editöryel ölçek) */}
        <p className="ke-tagline">
          Evrakı okur, sınıflandırır, eksiğini sorar ve resmî yazı taslağını üretir —
          <strong> iki görev, tek pipeline</strong>.
        </p>
      </header>

      {/* SC 1.3.6 — main landmark */}
      <main id="ke-main" className="ke-main">
        {/* ---- Yükleme alanı ---- */}
        <section className="ke-intake" aria-labelledby="ke-intake-h">
          {/* SC 2.4.6 — gizli başlık, section'a ad verir */}
          <h2 id="ke-intake-h" className="ke-sr">Evrak Yükleme</h2>
          <div
            className={"ke-drop" + (dragOver ? " over" : "") + (busy ? " busy" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); fileRef.current?.click(); } }}
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label={
              fileName
                ? `Seçili dosya: ${fileName}. Değiştirmek için tıkla veya Enter'a bas.`
                : "Evrak dosyası yükle — tıkla veya sürükle bırak (PDF, görsel, Word)"
            }
            aria-disabled={busy}
          >
            <span className="ke-drop-ic" aria-hidden="true"><Icon.upload /></span>
            <span className="ke-drop-main">{fileName ? fileName : "Evrakı buraya sürükle veya tıkla"}</span>
            <span className="ke-drop-sub">PDF · JPG/PNG · TIFF · Word (.docx) — en fazla {MAX_UPLOAD_MB} MB</span>
            {!fileName && (
              <span className="ke-drop-hint">
                <Icon.shieldCheck aria-hidden="true" /> OCR + sınıflandırma otomatik başlar · veriler maskelenir
              </span>
            )}
            {/* SC 1.3.1 — gizli file input; görünür alan klavye erişimli role=button ile sağlanıyor */}
            <input
              ref={fileRef} type="file" accept={ACCEPT} hidden
              onChange={onPick} aria-hidden="true" tabIndex={-1}
            />
          </div>

          <div className="ke-samples" aria-labelledby="ke-samples-h">
            <p id="ke-samples-h" className="ke-samples-h">
              Dosyan yok mu? <strong>{SAMPLE_DOCS.length} örnek evraktan</strong> birini tek tıkla canlı işlet:
            </p>
            {SAMPLE_GROUPS.map(({ grup, slug, items }) => (
              <div className="ke-sample-group" key={grup}>
                {/* SC 1.3.1 / SC 2.4.6 — görünür grup başlığı; aria-hidden kaldırıldı.
                    role="group" artık aria-labelledby ile başlığa bağlanıyor.
                    id değeri slug kullanır (slash/boşluk/Türkçe karakter sorunu yok). */}
                <p id={`ke-grup-${slug}`} className="ke-sample-grup-h">{grup}</p>
                <div
                  className="ke-samples-row"
                  role="group"
                  aria-labelledby={`ke-grup-${slug}`}
                >
                  {items.map((s) => {
                    const SampleIcon = Icon[s.icon] || Icon.file;
                    return (
                    <button
                      key={s.id}
                      type="button"
                      className={"ke-sample" + (selectedSample === s.id ? " active" : "")}
                      onClick={() => !busy && runSampleJson(s)}
                      disabled={busy}
                      aria-pressed={selectedSample === s.id}
                      aria-describedby={`ke-sdesc-${s.id}`}
                    >
                      <span className="ke-sample-ic" aria-hidden="true"><SampleIcon /></span>
                      <span className="ke-sample-tx">
                        <span className="ke-sample-label">{s.label}</span>
                        {/* SC 1.3.1 — açıklama aria-describedby ile butonla ilişkili */}
                        <span id={`ke-sdesc-${s.id}`} className="ke-sample-desc">{s.aciklama}</span>
                      </span>
                    </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && !busy && (
          <div className="ke-error" role="alert" aria-atomic="true">
            <span className="ke-error-ic" aria-hidden="true"><Icon.alert /></span>
            <div className="ke-error-tx">
              <strong>İşlem tamamlanamadı.</strong>
              {/* SC 3.3.1 — hata mesajı programatik olarak duyuruluyor (role=alert) */}
              <span>{error}</span>
              {/* Panik değil — yardımcı, somut öneri (kullanıcıyı bir sonraki adıma yönlendir). */}
              <span className="ke-error-hint">
                Geçici bir aksaklık olabilir. <strong>Tekrar dene</strong>’yi kullanın
                ya da soldaki <strong>örnek evraklardan</strong> biriyle deneyin.
              </span>
            </div>
            <div className="ke-error-act">
              {lastRun.current && (
                <button type="button" className="ke-retry" onClick={onRetry}>
                  <Icon.refresh aria-hidden="true" /> Tekrar dene
                </button>
              )}
              <button
                type="button"
                className="ke-error-x"
                onClick={() => setError("")}
                aria-label="Hata bildirimini kapat"
              >
                <Icon.close aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ---- Canlı Ajan Akış Şeması ---- */}
        {started && (
          <section className="ke-flow-wrap" aria-label="Canlı ajan akış şeması">
            <AgentFlowGraph nodes={nodes} />
          </section>
        )}

        {/* ---- Sonuç bölgesi: yükleniyor (iskelet) → sonuç kartları ----
            SC 4.1.3 — aria-live="polite" + aria-busy dinamik içerik değişimini duyurur */}
        <section
          className="ke-result-wrap"
          aria-live="polite"
          aria-busy={busy}
          aria-label="Evrak işleme sonuçları"
        >
          {/* HITL: memur onay paneli (taslakta durulduysa) — sonuç gelmeden önce. */}
          {pendingOnay && !result && (
            <OnayPaneli data={pendingOnay} onResume={handleResume} busy={busy} />
          )}
          {busy && !result && !pendingOnay && <ResultSkeleton />}
          {result && (
            <ResultCards
              r={result} onToast={showToast}
              onDownload={onDownload} downloading={downloading}
              canDownload={!!evrakText}
              verify={nodes.find((n) => n.id === "verify")?.data}
            />
          )}
        </section>

        {!started && (
          <section className="ke-placeholder" aria-labelledby="ke-ph-h">
            <span className="ke-placeholder-ic" aria-hidden="true"><Icon.inbox /></span>
            <h2 id="ke-ph-h" className="ke-placeholder-h">Başlamak için bir evrak seçin</h2>
            <p>Yukarıdan bir evrak yükleyin ya da bir <strong>örnek evrak</strong> seçin; sistem evrakı
              <strong> {PIPELINE.length} ajanlı</strong> canlı bir boru hattından geçirir.</p>
            {/* "10 ajan" vaadini görselleştiren mini statik akış ipucu — gerçek pipeline
                node etiketlerinden türetilir (topology.js); canlı şemanın önizlemesi.
                Yalnız görsel ipucu (aria-hidden); özet metin yukarıda erişilebilir. */}
            <ol className="ke-ph-flow" aria-hidden="true">
              {PIPELINE.map((n, i) => (
                <li className={`ke-ph-step ke-ph-g${n.gorev}`} key={n.id}>
                  <span className="ke-ph-step-n">{i + 1}</span>
                  <span className="ke-ph-step-lbl">{n.label}</span>
                </li>
              ))}
            </ol>
            <p className="ke-ph-flow-cap">
              <span className="ke-ph-dot ke-ph-g1" aria-hidden="true" /> Görev 1: Anla &nbsp;·&nbsp;
              <span className="ke-ph-dot ke-ph-g2" aria-hidden="true" /> Görev 2: Üret
            </p>
          </section>
        )}
      </main>

      {/* SC 1.3.6 — contentinfo landmark (footer) */}
      <footer className="ke-footer">
        <p className="ke-footer-note">
          TEKNOFEST 2026, 1. Senaryo — Demo arayüzü. Bu sistem karar-destek amaçlıdır.
        </p>
      </footer>

      {/* SC 4.1.3 Durum Mesajları — ekran okuyucu toast'ı bu kalıcı canlı bölgeden duyurur.
          Görsel toast ayrı (role="presentation") — yalnız görsel kullanıcı içindir. */}
      <div className="ke-sr" role="status" aria-live="polite" aria-atomic="true">{toast}</div>
      {toast && (
        <div className="ke-toast" role="presentation" aria-hidden="true">{toast}</div>
      )}
    </div>
  );
}

/* Yükleniyor iskeleti — sonuç kartlarının yerini tutan placeholder.
   Ekran okuyucudan gizli (aria-hidden): canlı bölge zaten aria-busy ile durumu
   bildirir + akış şeması aktif düğümü duyurur. prefers-reduced-motion'da pırıltı
   (shimmer) CSS tarafında kapatılır → yalnız sabit placeholder kalır. */
function ResultSkeleton() {
  return (
    <div className="ke-skel" aria-hidden="true">
      <div className="ke-skel-card ke-skel-info">
        <span className="ke-skel-line w70" />
        <span className="ke-skel-line w90" />
        <span className="ke-skel-line w50" />
      </div>
      <div className="ke-skel-row">
        <div className="ke-skel-card">
          <span className="ke-skel-line w40 tall" />
          <span className="ke-skel-line w60" />
        </div>
        <div className="ke-skel-card">
          <span className="ke-skel-line w40 tall" />
          <span className="ke-skel-line w60" />
        </div>
      </div>
      <div className="ke-skel-card">
        <span className="ke-skel-line w30" />
        <span className="ke-skel-line w80" />
        <span className="ke-skel-line w75" />
      </div>
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
    // verify: kalite kapısı özeti. Backend ProcessResponse şeması verify alanlarını
    // (format_uyumlu/verify_uyari) HENÜZ taşımayabilir → varsa kullan, yoksa taslak
    // varlığından "uyumlu" türet (graceful). r.format_uyumlu yalnız mevcutsa okunur.
    case "verify": return {
      format_uyumlu: r.format_uyumlu === undefined ? !!r.yazi_taslak_md : r.format_uyumlu,
      verify_uyari: r.verify_uyari || [],
    };
    case "finalize": return {};
    default: return null;
  }
}
