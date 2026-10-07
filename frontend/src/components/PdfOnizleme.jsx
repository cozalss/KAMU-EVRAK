/* PdfOnizleme — yüklenen PDF'in gerçek sayfa görüntüsü (react-pdf / pdf.js, MIT-benzeri).
   Kaynak belge panelinde kullanılır; TEMBEL yüklenir (React.lazy) → pdf.js ana bundle'a
   girmez. Metin/işaret katmanları kapalı (CSS bağımlılığı yok, salt görüntü) — çıkarım
   vurgusu "Metin" sekmesinde kalır. Genişlik konteynerden ölçülür (dar panel dostu). */
import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PAL, TYPE, TNUM, SP } from "./neonUi.jsx";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_SAYFA = 8; // dar panelde makul kaydırma; kalanı sayaçla belirtilir
const ISKELET_SATIR = [0.42, 0.9, 0.96, 0.88, 0.93, 0.6, 0.94, 0.9, 0.72];

/* Yükleniyor — düz "PDF açılıyor…" yerine A4 silüeti (210/297): kenar boşluğu, antet ve
   gövde satırı yer tutucuları; sayfa gelince aynı oranda yer değiştirir (sıçrama yok). */
function PdfIskelet() {
  return (
    <div role="status" aria-label="PDF açılıyor" style={{ padding: SP.l }}>
      <div aria-hidden="true" style={{ aspectRatio: "210 / 297", maxWidth: 640, margin: "0 auto", border: `1px solid ${PAL.line}`, borderRadius: 2, padding: "12% 11%", display: "flex", flexDirection: "column", gap: 14, opacity: 0.7 }}>
        <span style={{ alignSelf: "center", width: "38%", height: 8, borderRadius: 2, background: PAL.line }} />
        <span style={{ alignSelf: "center", width: "24%", height: 6, borderRadius: 2, background: PAL.line, marginBottom: 18 }} />
        {ISKELET_SATIR.map((w, i) => <span key={i} style={{ width: `${w * 100}%`, height: 5, borderRadius: 2, background: PAL.line }} />)}
      </div>
      <span style={{ display: "block", textAlign: "center", marginTop: SP.s, ...TYPE.meta, color: PAL.mut2 }}>PDF açılıyor…</span>
    </div>
  );
}

export default function PdfOnizleme({ fileUrl, tam = false }) {
  // tam: A4 modal görünümü — iç kaydırma/yükseklik siniri YOK (modal kendisi kayar),
  // TÜM sayfalar alt alta akar. Varsayılan (false): dar panel modu (460px + ilk 8 sayfa).
  const kutu = useRef(null);
  const [genislik, setGenislik] = useState(0);
  const [sayfaSayisi, setSayfaSayisi] = useState(0);
  const [hata, setHata] = useState(false);

  useEffect(() => {
    const olc = () => setGenislik(kutu.current ? kutu.current.clientWidth : 0);
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, []);

  // fileUrl değişince eski belgenin hata/sayfa state'ini sıfırla: bileşen kalıcı mount'lu
  // (KaynakBelge → CanliAjanAkisi, koşumlar arası remount YOK). Aksi halde hatalı PDF'ten
  // sonra gelen GEÇERLİ PDF için "önizleme açılamadı" kalıcı kalır (bug avı bulgusu).
  useEffect(() => {
    setHata(false);
    setSayfaSayisi(0);
  }, [fileUrl]);

  if (hata) {
    return <div style={{ padding: SP.l, ...TYPE.data, color: PAL.mut2 }}>PDF önizlemesi açılamadı — metin sekmesinden devam edebilirsiniz.</div>;
  }
  const gosterilen = tam ? (sayfaSayisi || 0) : Math.min(sayfaSayisi || 0, MAX_SAYFA);
  return (
    <div ref={kutu} style={tam ? { background: PAL.surf } : { maxHeight: 460, overflowY: "auto", background: PAL.surf }}>
      <Document
        file={fileUrl}
        onLoadSuccess={(pdf) => setSayfaSayisi(pdf.numPages)}
        onLoadError={() => setHata(true)}
        loading={<PdfIskelet />}
      >
        {genislik > 0 && Array.from({ length: gosterilen }, (_, i) => (
          <div key={i} style={{ borderBottom: i < gosterilen - 1 ? `1px solid ${PAL.line}` : "none" }}>
            <Page pageNumber={i + 1} width={genislik} renderTextLayer={false} renderAnnotationLayer={false} />
          </div>
        ))}
      </Document>
      {sayfaSayisi > 0 && (
        <div style={{ padding: "6px 12px", borderTop: `1px solid ${PAL.line}`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
          {sayfaSayisi} sayfa{!tam && sayfaSayisi > MAX_SAYFA ? ` · ilk ${MAX_SAYFA} sayfa gösteriliyor` : ""}
        </div>
      )}
    </div>
  );
}
