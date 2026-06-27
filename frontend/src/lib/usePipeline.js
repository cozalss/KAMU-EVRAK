/* usePipeline — kamu-evrak işleme akışının tek kaynağı (state + aksiyonlar).
   App.jsx'teki mantık buraya taşındı + dashboard için: fileMeta (dosya adı/boyut),
   node zamanlaması (terminal log [mm:ss]) ve DİNAMİK node listesi (SSE start.nodes'tan,
   ENV değişse bile bozulmaz). Dashboard bu hook'u kullanır; eski App.jsx kendi kopyasını korur.

   İki yol:
     A) Dosya → /process_doc/stream (gerçek SSE; node'lar canlı yanar)
     B) Örnek metin → /process_doc (JSON; sonuç gelince node'lar sırayla "yan" → düşünen-sistem)
   + HITL resume (/process_doc/resume) + taslak indirme (/yazi/taslak). */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_NODE_IDS, makeNode, nodeDataFromResult } from "./nodeMeta.js";

const MAX_UPLOAD_MB = 20;            // backend MAX_UPLOAD_BYTES (20 MiB) ile eşleşir
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx";
const STEP_MS = 320;                 // JSON yolunda node adımlama aralığı

const freshNodes = () => DEFAULT_NODE_IDS.map(makeNode);

export { MAX_UPLOAD_MB, ACCEPT };

export function usePipeline() {
  const [nodes, setNodes] = useState(freshNodes);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [selectedSample, setSelectedSample] = useState(null);
  // {name, size, kind:"file"|"sample"} — TopBar dosya meta. size: bytes (dosya) | char (örnek).
  const [fileMeta, setFileMeta] = useState(null);
  const [evrakText, setEvrakText] = useState("");
  const [downloading, setDownloading] = useState("");
  const [pendingOnay, setPendingOnay] = useState(null);

  const stepTimers = useRef([]);
  const toastTimer = useRef(null);
  const runStart = useRef(0);
  const lastRun = useRef(null);

  const elapsed = () => (runStart.current ? Math.max(0, performance.now() - runStart.current) : 0);

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
    runStart.current = performance.now();
    setNodes(freshNodes());
    setResult(null);
    setError("");
    setEvrakText("");
    setPendingOnay(null);
  }, [clearTimers]);

  // Tek node durum + zamanlama güncelle. active→t0 damgala, done/error→t1 damgala.
  const markNode = useCallback((id, status, data) => {
    const t = elapsed();
    setNodes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      const t0 = n.t0 ?? t;
      const t1 = status === "done" || status === "error" ? t : n.t1;
      return { ...n, status, data: data ?? n.data, t0, t1 };
    }));
  }, []);

  // SSE event işleyici (dosya yolu). Bir node bitince sıradaki(ler)i aktifle (akış hissi).
  const handleEvent = useCallback((ev) => {
    if (ev.event === "start") {
      // start.nodes DİNAMİK — backend ENV ne döndürürse onu kur (R1). İlki aktif.
      const ids = Array.isArray(ev.nodes) && ev.nodes.length ? ev.nodes : DEFAULT_NODE_IDS;
      const t = elapsed();
      setNodes(ids.map((id, i) => {
        const node = makeNode(id);
        return i === 0 ? { ...node, status: "active", t0: t } : node;
      }));
    } else if (ev.event === "node") {
      const nodeDone = ev.status !== "active";
      const t = elapsed();
      setNodes((prev) => {
        const idx = prev.findIndex((n) => n.id === ev.node);
        return prev.map((n, i) => {
          if (n.id === ev.node) {
            const t0 = n.t0 ?? t;
            return { ...n, status: nodeDone ? "done" : "active", data: ev.data ?? n.data, t0, t1: nodeDone ? t : n.t1 };
          }
          if (nodeDone && i > idx && n.status === "pending") {
            const prevStatus = prev[i - 1]?.status;
            if (prevStatus === "done" || prevStatus === "active") {
              return { ...n, status: "active", t0: n.t0 ?? t };
            }
          }
          return n;
        });
      });
    } else if (ev.event === "done") {
      if (ev.result?.onay_bekliyor) setPendingOnay(ev.result);
      else setResult(ev.result);
      const t = elapsed();
      setNodes((prev) => prev.map((n) =>
        (n.status === "pending" || n.status === "active")
          ? { ...n, status: "done", t0: n.t0 ?? t, t1: t } : n));
    } else if (ev.event === "error") {
      setError(ev.message || "İşleme hatası");
      setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error", t1: elapsed() } : n)));
    }
  }, []);

  // ---------- A) Dosya → /process_doc/stream (gerçek SSE) ----------
  const runFile = useCallback(async (file) => {
    reset();
    setBusy(true);
    setSelectedSample(null);
    setFileMeta({ name: file.name, size: file.size, kind: "file" });
    lastRun.current = { kind: "file", file };
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/process_doc/stream", { method: "POST", body: fd });
      if (!res.ok || !res.body) throw new Error(`Sunucu hatası (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const chunk of parts) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try { handleEvent(JSON.parse(line.slice(5).trim())); }
          catch { /* yarım satır — sonraki chunk'ta tamamlanır */ }
        }
      }
    } catch (err) {
      setError(err?.message || "Bağlantı hatası — backend çalışıyor mu?");
      setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error" } : n)));
    } finally {
      setBusy(false);
    }
  }, [reset, handleEvent]);

  // Sonuç alanlarından her node'a özet türetip sırayla "done" işaretle (JSON yolu görsel akış).
  const animateNodes = useCallback((data, nChars = 0) => {
    const ids = DEFAULT_NODE_IDS;
    ids.forEach((id, i) => {
      const tActive = setTimeout(() => markNode(id, "active"), Math.max(0, i * STEP_MS - 140));
      const tDone = setTimeout(() => {
        markNode(id, "done", nodeDataFromResult(id, data, nChars));
        if (i === ids.length - 1) setBusy(false);
      }, i * STEP_MS + 120);
      stepTimers.current.push(tActive, tDone);
    });
  }, [markNode]);

  // ---------- B) Örnek metin → /process_doc (JSON) ----------
  const runSample = useCallback(async (sample) => {
    reset();
    setBusy(true);
    setSelectedSample(sample.id);
    setFileMeta({ name: `${sample.id}.txt`, size: sample.text.length, kind: "sample", label: sample.label });
    setEvrakText(sample.text);
    lastRun.current = { kind: "sample", sample };
    try {
      const res = await fetch("/process_doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evrak_text: sample.text, filename: `${sample.id}.txt` }),
      });
      if (!res.ok) throw new Error(`Sunucu hatası (${res.status})`);
      const data = await res.json();
      animateNodes(data, sample.text.length);
      const t = setTimeout(
        () => (data.onay_bekliyor ? setPendingOnay(data) : setResult(data)),
        DEFAULT_NODE_IDS.length * STEP_MS + 120,
      );
      stepTimers.current.push(t);
    } catch (err) {
      setError(err?.message || "Bağlantı hatası — backend çalışıyor mu?");
      setBusy(false);
    }
  }, [reset, animateNodes]);

  // ---------- HITL resume ----------
  const resume = useCallback(async (secim, metin = "", gerekce = "") => {
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
      showToast(secim === "reddet" ? "Taslak reddedildi." : secim === "duzenle" ? "Düzenleme onaylandı." : "Taslak onaylandı.");
    } catch (err) {
      showToast(err?.message || "Onay gönderilemedi — backend çalışıyor mu?");
    } finally {
      setBusy(false);
    }
  }, [pendingOnay, showToast]);

  const retry = useCallback(() => {
    const last = lastRun.current;
    if (!last) { setError(""); return; }
    if (last.kind === "file") runFile(last.file);
    else if (last.kind === "sample") runSample(last.sample);
  }, [runFile, runSample]);

  // ---------- C) Taslağı PDF/DOCX indir → /yazi/taslak ----------
  const download = useCallback(async (format) => {
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

  // Dosya doğrula + çalıştır.
  const runFileValidated = useCallback((file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Dosya çok büyük (en fazla ${MAX_UPLOAD_MB} MB).`);
      return;
    }
    runFile(file);
  }, [runFile]);

  const dismissError = useCallback(() => setError(""), []);
  const canRetry = !!lastRun.current;

  return {
    nodes, result, busy, error, toast, selectedSample, fileMeta, evrakText, downloading, pendingOnay,
    runFile: runFileValidated, runSample, resume, retry, download, showToast, dismissError, canRetry,
  };
}
