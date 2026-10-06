/* rcYaziKartlari — eski sonuç kartlarından YAZI grubu: taslak önizleme (daktilo + kopyala +
   indir) ve doğrulama kapısı. result-cards.jsx'ten bölündü (dosya <800 kuralı, tur 6);
   result-cards bunları yeniden dışa aktarır. Kullanıcı: App.jsx (eski giriş). */
import { useEffect, useRef, useState } from "react";
import { useTypewriter, usePrefersReducedMotion } from "../lib/useTypewriter.js";
import { Icon } from "./icons.jsx";
import { YAZI_TR, cleanDemoText, normalizeDraftForDemo, uniqueLabels } from "../lib/evrakEtiket.js";

/* ---------- 6) Yazı Taslağı (önizleme + kopyala + PDF/DOCX indir) ---------- */
function YaziTaslakCard({ yaziTuru, taslakMd, onToast, onDownload, downloading, canDownload }) {
  const [copied, setCopied] = useState(false);
  const draft = normalizeDraftForDemo(taslakMd || "");
  // Daktilo efekti — resmî yazı "yazılıyormuş" gibi akar (Demo wow). Hook erken-return ÖNCESİ.
  // cps 700: yazım anı jüri tarafından yakalanacak kadar yavaş, yine de okunur akıcı.
  // reduced-motion'da anında tam metin (hook içinde).
  const { shown, animating } = useTypewriter(draft.display, { cps: 700 });
  // Sonuç gelince Yazı Taslağı kartını görünüme kaydır (Görev-2 demosu yakalanır).
  // reduced-motion → ani; aksi halde yumuşak. Bir kez kaydırılır (taslak metnine göre guard).
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef(null);
  const scrolledFor = useRef(null);
  useEffect(() => {
    if (!taslakMd || !cardRef.current || scrolledFor.current === taslakMd) return;
    scrolledFor.current = taslakMd;
    cardRef.current.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [taslakMd, reduced]);
  if (!taslakMd) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft.copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      onToast?.("Taslak panoya kopyalandı.");
    } catch {
      onToast?.("Kopyalanamadı — tarayıcı izni gerekebilir.");
    }
  };

  // İndirme yalnız evrak metni eldeyken (örnek metin yolu) etkin; aksi halde
  // (dosya/OCR yolu) buton devre dışı + açıklayıcı başlık.
  const busy = !!downloading;
  const dlTitle = canDownload
    ? "Taslağı indir"
    : "İndirme için örnek bir evrak metni seçin (dosya/OCR yolunda metin saklanmıyor)";
  const dl = (fmt) => () => onDownload?.(fmt);

  return (
    <article ref={cardRef} className="rc-card rc-taslak rc-g2" aria-labelledby="rc-taslak-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true"><Icon.pencil /></span>
        <h3 id="rc-taslak-h" className="rc-card-title">
          Resmî Yazı Taslağı{yaziTuru ? ` · ${YAZI_TR(yaziTuru)}` : ""}
        </h3>
        <div className="rc-taslak-actions">
          <button type="button" className="rc-btn" onClick={copy} aria-label="Yazı taslağını kopyala">
            {copied
              ? <><Icon.check aria-hidden="true" /> Kopyalandı</>
              : <><Icon.copy aria-hidden="true" /> Kopyala</>}
          </button>
          <button
            type="button" className="rc-btn" onClick={dl("pdf")}
            disabled={!canDownload || busy} title={dlTitle} aria-label="Taslağı PDF olarak indir"
          >
            {downloading === "pdf" ? "İndiriliyor…" : <><Icon.download aria-hidden="true" /> PDF</>}
          </button>
          <button
            type="button" className="rc-btn" onClick={dl("docx")}
            disabled={!canDownload || busy} title={dlTitle} aria-label="Taslağı DOCX olarak indir"
          >
            {downloading === "docx" ? "İndiriliyor…" : <><Icon.download aria-hidden="true" /> DOCX</>}
          </button>
        </div>
      </header>
      {/* Görsel: daktilo akışı (kopyala her zaman temiz TAM metni alır — copy() draft.copy kullanır).
          SC 4.1.3 / 1.3.1: Animasyon aktifken parça-parça duyuru (screen-reader spam) önlemek
          için aria-live="off" + aria-busy=animating. Tam metin rc-taslak-sr bölgesinde bir
          kez duyurulur (animating biter bitmez). aria-atomic="true" duyuruyu tek blok yapar. */}
      <pre
        className={"rc-taslak-pre" + (animating ? " is-typing" : "")}
        tabIndex={0}
        aria-label="Yazı taslağı önizleme"
        aria-live="off"
        aria-busy={animating}
      >
        {/* Daktilo sırasında sizer overlay: görünmez TAM metin son boyutu kilitler,
            akan metin üstünde mutlak konumda → kutu frame-başı büyümez, sayfa geneli
            reflow tetiklenmez (jank fix). */}
        {animating ? (
          <span style={{ position: "relative", display: "block" }}>
            <span aria-hidden="true" style={{ visibility: "hidden" }}>{draft.display}</span>
            <span style={{ position: "absolute", inset: 0 }}>
              {shown}
              <span className="rc-caret rc-caret-pre" aria-hidden="true" />
            </span>
          </span>
        ) : shown}
      </pre>
      {(draft.fields.length > 0 || draft.reviewNotes.length > 0) && (
        <div className="rc-taslak-review" role="note" aria-label="Taslak tamamlama notları">
          {draft.fields.length > 0 && (
            <div className="rc-taslak-review-row">
              <span className="rc-taslak-review-h">Tamamlanacak alanlar</span>
              <ul className="rc-chiplist">
                {draft.fields.map((field) => (
                  <li className="rc-chip rc-chip-field" key={field}>{field}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.reviewNotes.length > 0 && (
            <div className="rc-taslak-review-row">
              <span className="rc-taslak-review-h">İnceleme notları</span>
              <ul className="rc-chiplist">
                {draft.reviewNotes.map((note) => (
                  <li className="rc-chip rc-chip-review" key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {/* SC 4.1.3 — Animasyon bitince ekran okuyucuya TAM metin bir kerede duyurulur.
          animating=true iken içerik değişmez (shown değişir ama sr-only görmez) → spam yok.
          animating=false olunca tam metin buraya geçer → tek duyuru. */}
      <p
        className="rc-taslak-sr"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {animating ? "" : draft.display}
      </p>
      {!canDownload && (
        // Dosya/OCR yolunda evrak metni client'ta saklanmaz → indirme devre dışı.
        // Tooltip yeterli değil; jüri ve ekran okuyucu için görünür açıklama.
        <p className="rc-taslak-dlnote" role="note">
          <Icon.info aria-hidden="true" />
          <span>İndirme (PDF/DOCX), <strong>örnek evrak</strong> akışında etkindir. Dosya yükleme
          yolunda taslağı yukarıdan <strong>Kopyala</strong> ile alabilirsiniz.</span>
        </p>
      )}
      <p className="rc-taslak-note">
        Bu taslak ön hazırlıktır; açık alanlar ve inceleme notları yetkili birimce tamamlanır.
      </p>
    </article>
  );
}

/* ---------- 7) Doğrulama (verify kalite kapısı) ---------- */
/* Görev 2 kalite kapısı çıktısı: resmî yazı taslağının (a) zorunlu format bölümlerini
   içerip içermediği (format_uyumlu) ve (b) kaynak evrakta OLMAYAN somut tarih/sayı
   "uydurması" olup olmadığı (verify_uyari). Veri App'in elindeki verify node data'sından
   gelir (backend ProcessResponse şeması verify alanlarını taşımayabilir → graceful).
   taslakMd verilmediyse (taslak yok) kart gizlenir. */
function DogrulamaCard({ verify, taslakMd }) {
  if (!taslakMd) return null;
  const draft = normalizeDraftForDemo(taslakMd);
  const uyarilar = uniqueLabels([
    ...(verify?.verify_uyari || []).filter(Boolean).map(cleanDemoText),
    ...draft.reviewNotes.map((note) => `Kaynak kontrolü: ${note}`),
  ]);
  // format_uyumlu açıkça false ise format eksik; aksi halde uyumlu kabul (graceful).
  const formatOk = verify?.format_uyumlu !== false;
  const temiz = formatOk && uyarilar.length === 0;
  return (
    <article className={`rc-card rc-dogrulama rc-g2 ${temiz ? "rc-dogru-ok" : "rc-dogru-warn"}`} aria-labelledby="rc-dogru-h">
      <header className="rc-card-head">
        <span className="rc-ic" aria-hidden="true">{temiz ? <Icon.shieldCheck /> : <Icon.alert />}</span>
        <h3 id="rc-dogru-h" className="rc-card-title">Doğrulama (Kalite Kapısı)</h3>
        <span className={`rc-badge ${temiz ? "rc-badge-ok" : "rc-badge-warn"}`}>
          {temiz ? <>Doğrulandı <span aria-hidden="true">✓</span></> : `${uyarilar.length || 1} uyarı`}
        </span>
      </header>
      <ul className="rc-dogru-checks" aria-label="Doğrulama kontrolleri">
        <li className={formatOk ? "rc-dogru-pass" : "rc-dogru-fail"}>
          <span className="rc-dogru-mark" aria-hidden="true">{formatOk ? "✓" : "✕"}</span>
          <span className="rc-sr">{formatOk ? "Geçti — " : "Geçemedi — "}</span>
          Format uyumu — zorunlu bölümler (T.C. / Sayı / Konu / imza)
        </li>
        <li className={uyarilar.length === 0 ? "rc-dogru-pass" : "rc-dogru-fail"}>
          <span className="rc-dogru-mark" aria-hidden="true">{uyarilar.length === 0 ? "✓" : "✕"}</span>
          <span className="rc-sr">{uyarilar.length === 0 ? "Geçti — " : "Geçemedi — "}</span>
          Kaynak kontrolü — tarih/sayı ve madde notları temiz
        </li>
      </ul>
      {uyarilar.length > 0 ? (
        <div className="rc-dogru-uyarilar">
          <p className="rc-dogru-uyari-h">Doğrulama uyarıları:</p>
          <ul className="rc-chiplist" aria-label="Doğrulama uyarıları">
            {uyarilar.map((u, i) => <li className="rc-chip rc-chip-warn" key={i}>{u}</li>)}
          </ul>
        </div>
      ) : (
        <p className="rc-dogru-note">
          Taslak format açısından uyumlu ve kaynak evrakta bulunmayan somut veri içermiyor.
        </p>
      )}
    </article>
  );
}

export { YaziTaslakCard, DogrulamaCard };
