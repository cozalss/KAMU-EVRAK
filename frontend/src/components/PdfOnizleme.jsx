/* PdfOnizleme — yüklenen PDF'in gerçek sayfa görüntüsü (react-pdf / pdf.js, MIT-benzeri).
   Kaynak belge panelinde kullanılır; TEMBEL yüklenir (React.lazy) → pdf.js ana bundle'a
   girmez. Metin/işaret katmanları kapalı (CSS bağımlılığı yok, salt görüntü) — çıkarım
   vurgusu "Metin" sekmesinde kalır. Genişlik konteynerden ölçülür (dar panel dostu). */
import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PAL, TYPE, TNUM, SP, RAD } from "./neonUi.jsx";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_SAYFA = 8; // dar panelde makul kaydırma; kalanı sayaçla belirtilir

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
        loading={<div style={{ padding: SP.l, ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}
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
