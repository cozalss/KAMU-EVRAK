/* usePipeline — kamu-evrak işleme akışının tek kaynağı (state + aksiyonlar).
   App.jsx'teki mantık buraya taşındı + dashboard için: fileMeta (dosya adı/boyut),
   node zamanlaması (terminal log [mm:ss]) ve DİNAMİK node listesi (SSE start.nodes'tan,
   ENV değişse bile bozulmaz). Dashboard bu hook'u kullanır; eski App.jsx kendi kopyasını korur.

   TEK yol (L1 hız düzeltmesi): dosya VE örnek metin AYNI /process_doc/stream SSE
   akışından geçer → node'lar her iki yolda da CANLI yanar (örneklerdeki bloklayan
   POST + sahte animasyon kaldırıldı; backend .txt'i text-plain olarak kabul eder).
   + HITL resume (/process_doc/resume) + taslak indirme (/yazi/taslak). */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { authFetch } from "./authApi.js";
import { DEFAULT_NODE_IDS, makeNode } from "./nodeMeta.js";

const MAX_UPLOAD_MB = 20;            // backend MAX_UPLOAD_BYTES (20 MiB) ile eşleşir
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx,.txt";

const freshNodes = () => DEFAULT_NODE_IDS.map(makeNode);

export { ACCEPT };

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
  // canRetry'i ref yerine state'ten türet (ref render'da güvenilir okunmaz).
  const [hasRun, setHasRun] = useState(false);
  // Yüklenen PDF'in object-URL'i → Kaynak belge panelinde gerçek sayfa önizlemesi
  // (react-pdf). Yalnız PDF'te dolar; yeni koşumda/unmount'ta revoke edilir (bellek).
  const [fileUrl, setFileUrl] = useState("");
  const fileUrlRef = useRef("");

  const stepTimers = useRef([]);
  const toastTimer = useRef(null);
  const runStart = useRef(0);
  const lastRun = useRef(null);
  const abortRef = useRef(null);   // akış reader'ını unmount'ta iptal et

  const elapsed = () => (runStart.current ? Math.max(0, performance.now() - runStart.current) : 0);

  const clearTimers = useCallback(() => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
  }, []);
  useEffect(() => () => {
    abortRef.current?.abort();   // yarıda kalan SSE reader döngüsünü kapat
    clearTimers();
    clearTimeout(toastTimer.current);
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
  }, [clearTimers]);

  // Görsel bildirim sonner'a (katmanlı/istiflenen toast, DashboardApp'te <Toaster>);
  // toast state'i YALNIZ ekran okuyucu canlı bölgesini besler (SR_ONLY, davranış korunur).
  const showToast = useCallback((msg) => {
    sonnerToast(msg);
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    sawTerminal.current = false;
    runStart.current = performance.now();
    setNodes(freshNodes());
    setResult(null);
    setError("");
    setEvrakText("");
    setPendingOnay(null);
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = "";
    setFileUrl("");
  }, [clearTimers]);

  // Akış terminal event (done/error) gördü mü? — akış kapanınca sessiz boş duruma düşmeyi
  // önleyen emniyet kemeri (aşağıda streamRun sonu). reset() her koşumda sıfırlar.
  const sawTerminal = useRef(false);

  // SSE event işleyici (dosya + örnek — tek yol). Bir node bitince sıradakini aktifle.
  const handleEvent = useCallback((ev) => {
    if (ev.event === "done" || ev.event === "error") {
      sawTerminal.current = true;
      // busy'yi AKIŞ KAPANIŞINI beklemeden düşür: backend `done`dan sonra DB persist için
      // akışı açık tutar (~saniyeler); sayaç/HITL butonları bunu beklemesin.
      setBusy(false);
    }
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
    } else if (ev.event === "persist") {
      // `done`dan SONRA gelen islem_id (backend persist'i sonuca ertelendi) — sonucu SIĞ
      // merge ile zenginleştir (iç nesne referansları korunur; DashboardApp aynı-koşum
      // tespiti buna dayanır). Aynı islem_id tekrar gelirse no-op (gereksiz render yok).
      if (ev.islem_id) setResult((prev) => (
        prev && prev.islem_id !== ev.islem_id ? { ...prev, islem_id: ev.islem_id } : prev));
    } else if (ev.event === "error") {
      setError(ev.message || "İşleme hatası");
      setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error", t1: elapsed() } : n)));
    }
  }, []);

  // ---------- SSE akış çekirdeği — dosya + örnek AYNI yolu paylaşır ----------
  const streamRun = useCallback(async (file) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/process_doc/stream", { method: "POST", body: fd, signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Sunucu hatası (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const parseChunk = (chunk) => {
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!line) return;
        try { handleEvent(JSON.parse(line.slice(5).trim())); }
        catch { /* yarım satır — sonraki chunk'ta tamamlanır */ }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        parts.forEach(parseChunk);
      }
      // KRİTİK: akış kapandı — decoder'ı boşalt ve tamponda kalan SON event'i de işle.
      // Sonucu taşıyan `done` event'i kapanış chunk'ında ayraçsız gelebilir; eski kod onu
      // atıyordu → sonuç yok + hata yok + busy=false = sessiz boş ekran (görülen hata).
      buf += decoder.decode();
      buf.split("\n\n").forEach(parseChunk);
      // Emniyet kemeri: akış terminal event (done/error) vermeden kapandıysa bunu
      // kullanıcıya söyle — sessizce boş duruma dönme.
      if (!sawTerminal.current) {
        setError("İşlem sonucu alınamadı — bağlantı erken kapandı. Yeniden deneyin.");
        setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error" } : n)));
      }
    } catch (err) {
      if (err?.name === "AbortError") return;   // unmount/iptal — sessizce çık
      setError(err?.message || "Bağlantı hatası — backend çalışıyor mu?");
      setNodes((prev) => prev.map((n) => (n.status === "active" ? { ...n, status: "error" } : n)));
    } finally {
      // Bu çağrı hâlâ GÜNCEL akış mı? `done` sonrası busy=false olsa da reader persist
      // event'ini beklerken açık kalır; bu sırada YENİ bir koşum başlarsa (abortRef'i
      // kendi controller'ıyla değiştirip bunu iptal eder) bu ESKİ akışın finally'si
      // yeni koşumun busy=true'sunu sessizce ezmemeli (regresyon: çakışan ikinci koşum).
      if (abortRef.current === ctrl) setBusy(false);
    }
  }, [handleEvent]);

  // ---------- A) Dosya → SSE ----------
  const runFile = useCallback(async (file) => {
    reset();
    setBusy(true);
    setHasRun(true);
    setSelectedSample(null);
    setFileMeta({ name: file.name, size: file.size, kind: "file" });
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      setFileUrl(url);
    }
    lastRun.current = { kind: "file", file };
    await streamRun(file);
  }, [reset, streamRun]);

  // ---------- B) Örnek metin → AYNI SSE yolu (canlı node akışı; bloklayan POST kalktı) ----------
  const runSample = useCallback(async (sample) => {
    reset();
    setBusy(true);
    setHasRun(true);
    setSelectedSample(sample.id);
    setFileMeta({ id: sample.id, name: `${sample.id}.txt`, size: sample.text.length, kind: "sample", label: sample.label });
    setEvrakText(sample.text);
    lastRun.current = { kind: "sample", sample };
    // Örnek metni .txt dosyasına sarılır → backend text-plain dalıyla OCR'sız kabul eder.
    const file = new File([sample.text], `${sample.id}.txt`, { type: "text/plain" });
    await streamRun(file);
  }, [reset, streamRun]);

  // ---------- HITL resume ----------
  // Döner: true = karar backend'e işlendi (result-effect damgayı tüketir), false = başarısız/
  // no-op. Çağıran (DashboardApp) false'ta pendingApprovalRef'i TEMİZLEMELİ — aksi halde bayat
  // karar bir sonraki ilgisiz koşuma sızıp onaylanmamış evrakı Giden Evrak'a gönderir.
  const resume = useCallback(async (secim, metin = "", gerekce = "") => {
    const p = pendingOnay;
    if (!p?.thread_id) return false;
    setBusy(true);
    try {
      const res = await authFetch("/process_doc/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: p.thread_id, secim, metin, gerekce }),
      });
      if (!res.ok) throw new Error(`Onay gönderilemedi (${res.status})`);
      const final = await res.json();
      setPendingOnay(null);
      setResult(final);
      showToast(secim === "reddet" ? "Taslak reddedildi." : secim === "duzenle" ? "Düzenleme onaylandı." : "Taslak onaylandı.");
      return true;
    } catch (err) {
      showToast(err?.message || "Onay gönderilemedi — backend çalışıyor mu?");
      return false;
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

  // ---------- Koşumu İPTAL et (kullanıcı eylemi) ----------
  // Abort altyapısı zaten vardı (unmount + çakışan koşum) ama kullanıcıya açık değildi.
  // sawTerminal işaretlenir ki streamRun'ın emniyet kemeri iptali "İşleme hatası" sanmasın;
  // AbortError dalı sessizce çıkar. busy düşünce started=false → boş duruma dönülür;
  // lastRun durduğundan "Tekrar dene" ile aynı evrak yeniden başlatılabilir.
  const cancelRun = useCallback(() => {
    if (!abortRef.current) return;
    sawTerminal.current = true;
    abortRef.current.abort();
    setBusy(false);
    showToast("İşlem iptal edildi.");
  }, [showToast]);

  // ---------- C) Taslağı PDF/DOCX indir → /yazi/taslak ----------
  const download = useCallback(async (format) => {
    // Taslak kaynağı: result (yeşil/karar sonrası) VEYA pendingOnay (HITL beklerken). Dosya
    // yükleme yolunda evrakText boştur ama taslak result.yazi_taslak_md'de vardır → taslağı
    // buradan al, evrakText'e bağlanma (aksi halde yüklenen dosyada indirme çalışmıyordu).
    const src = result || pendingOnay;
    const md = src?.yazi_taslak_md;
    if (!md && !evrakText) {
      showToast("İndirme için önce bir evrak işleyin.");
      return;
    }
    setDownloading(format);
    let url = "";
    const isEyp = format === "eyp";
    try {
      // HIZLI YOL: taslak zaten üretildiyse pipeline'ı (≈8 LLM çağrısı) TEKRAR çalıştırma —
      // mevcut metni doğrudan render et (/yazi/render). Yalnız taslak yoksa pipeline'a düş.
      // EYP: sonuç üstverisi (SDP/birim/ilgi) elimizdeyse paket pipeline'sız kurulur (S5).
      const res = isEyp
        ? await fetch("/yazi/eyp", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(md ? {
              taslak_md: md,
              konu: src?.bilgi_unsurlari?.konu || "",
              yazi_turu: src?.yazi_turu || "",
              sdp_kodu: src?.arsiv_metadata?.sdp_kodu || "",
              sdp_adi: src?.arsiv_metadata?.sdp_adi || "",
              hedef_birim: src?.hedef_birim || "",
              ilgi_tarih: src?.bilgi_unsurlari?.tarih || "",
              ilgi_sayi: src?.bilgi_unsurlari?.sayi || "",
            } : { evrak_text: evrakText }),
          })
        : md
        ? await fetch(`/yazi/render?format=${encodeURIComponent(format)}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: md, title: "Resmî Yazı Taslağı" }),
          })
        : await fetch(`/yazi/taslak?format=${encodeURIComponent(format)}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ evrak_text: evrakText }),
          });
      if (!res.ok) throw new Error(`Taslak indirilemedi (${res.status})`);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isEyp ? "eyp-paket-taslak.zip" : `resmi-yazi-taslak.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(isEyp ? "EYP 2.0 yazışma paketi (ZIP) indirildi." : `Taslak ${format.toUpperCase()} olarak indirildi.`);
    } catch (err) {
      showToast(err?.message || "Taslak indirilemedi — backend çalışıyor mu?");
    } finally {
      // Tarayıcı indirmeyi yakalasın diye revoke'u bir tık geciktir (bazı tarayıcılarda
      // senkron revoke indirmeyi iptal eder).
      if (url) { const u = url; setTimeout(() => URL.revokeObjectURL(u), 1500); }
      setDownloading("");
    }
  }, [evrakText, result, pendingOnay, showToast]);

  // Dosya doğrula + çalıştır.
  const runFileValidated = useCallback((file) => {
    if (!file || busy) return;   // busy iken yeni dosya başlatma (yarış önle)
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Dosya çok büyük (en fazla ${MAX_UPLOAD_MB} MB).`);
      return;
    }
    runFile(file);
  }, [runFile, busy]);

  const dismissError = useCallback(() => setError(""), []);
  const canRetry = hasRun;

  // Memur farklı yazı TÜRÜ seçti → yeni üretilen taslağı sonuca işle. Yalnız üç taslak
  // alanı değişir; iç nesne referansları (denetim_izi/bilgi_unsurlari) AYNEN korunur —
  // DashboardApp'in result-effect'i bunu "aynı koşumun zenginleşmesi" sayar (yeni geçmiş
  // kaydı açılmaz), download/onay akışları da otomatik seçili taslağı kullanır.
  const applyTaslak = useCallback((patch) => {
    setResult((r) => (r ? {
      ...r,
      yazi_turu: patch.yazi_turu,
      yazi_taslak_md: patch.yazi_taslak_md,
      format_uyumlu: !!patch.format_uyumlu,
    } : r));
  }, []);

  return {
    nodes, result, busy, error, toast, selectedSample, fileMeta, evrakText, downloading, pendingOnay, fileUrl,
    runFile: runFileValidated, runSample, resume, retry, cancelRun, download, showToast, dismissError, canRetry, applyTaslak,
    // Koşum başlangıcının MUTLAK saati (performance.now tabanı). Node t0/t1 damgaları bu
    // tabana GÖRELİdir → canlı süre = performance.now() - runBase - t0 (saat karıştırma yok).
    runBase: runStart.current,
  };
}
