/* BelgeModal — Kaynak belge / Resmî yazı taslağını A4 kâğıt görünümünde büyütüp inceleme.
   Havada duran katman disiplini (MASTER): karartı + SH.modal + RAD.pop; kâğıt gerçek belge
   gibi durur (A4 oranında min yükseklik + geniş belge kenar boşlukları). a11y: role=dialog +
   aria-modal, Esc ve dış-tık kapatır, açılışta odak kapat düğmesine gider, kapanışta
   tetikleyiciye döner, açıkken body scroll kilitlenir. PDF kaynaklarda gerçek sayfa
   önizlemesi (react-pdf, tembel) — metin yolunda maskeli içerik gösterilir (KVKK). */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MONO, PAL, DERIN, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, Icon, focusRing } from "./neonUi.jsx";

const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

/* Karartı üstü açık düğme — modal üst şeridindeki eylemler (PDF/DOCX indir) Kapat ile aynı dil. */
export function ScrimDugme({ onClick, disabled, children, title }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} {...focusRing}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(251,247,240,.18)"; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(251,247,240,.10)"; }}
      style={{ cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", minHeight: 32, borderRadius: RAD.ctl, border: "1px solid rgba(251,247,240,.35)", background: "rgba(251,247,240,.10)", color: PAL.onAccent, opacity: disabled ? 0.55 : 1, ...TYPE.data, fontWeight: 500, transition: "background .12s ease-out" }}>
      {children}
    </button>
  );
}

export default function BelgeModal({ acik, baslik, dosyaAdi = "", metin = "", mono = false, fileUrl = "", onKapat = () => {}, eylemler = null, duzenlenebilir = false, onKaydet = null, onIndir = null }) {
  const kapatRef = useRef(null);
  const alanRef = useRef(null);
  const oncekiOdak = useRef(null);
  // Düzenleme taslağı — modal her açılışta taze kurulmalı: çağıran taraf bileşeni koşullu
  // render eder ({acikken && <BelgeModal …/>}), kapanınca unmount → durum sızmaz.
  const [metinD, setMetinD] = useState(metin);
  const [kapatUyari, setKapatUyari] = useState(false);
  const kirli = duzenlenebilir && metinD !== metin;

  // Kapatma isteği — kaydedilmemiş değişiklik varsa kapatmak yerine uyarı şeridi açılır.
  const kapatIstegi = () => { if (kirli) { setKapatUyari(true); return; } onKapat(); };
  const kapatIstegiRef = useRef(kapatIstegi);
  kapatIstegiRef.current = kapatIstegi;

  useEffect(() => {
    if (!acik) return undefined;
    oncekiOdak.current = document.activeElement;
    (duzenlenebilir ? alanRef.current : kapatRef.current)?.focus();
    const tusla = (e) => { if (e.key === "Escape") kapatIstegiRef.current(); };
    document.addEventListener("keydown", tusla);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // arkadaki sayfa kaymasın
    return () => {
      document.removeEventListener("keydown", tusla);
      document.body.style.overflow = eski;
      oncekiOdak.current?.focus?.();
    };
  }, [acik, duzenlenebilir]);

  if (!acik) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={baslik} onClick={kapatIstegi}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: "rgba(22,22,22,.58)", overflowY: "auto", padding: "32px 16px 48px", animation: "nu-rise .16s ease-out both" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 96vw)", margin: "0 auto", display: "flex", flexDirection: "column", gap: SP.m }}>

        {/* Üst şerit — başlık + dosya kimliği + eylemler + kapat */}
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.onAccent }}>{baslik}</span>
          {dosyaAdi && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: "rgba(251,247,240,.72)" }}>{dosyaAdi}</span>}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
            {duzenlenebilir && (
              <span style={{ ...TYPE.meta, ...TNUM, color: "rgba(251,247,240,.72)" }}>{metinD.length} karakter</span>
            )}
            {duzenlenebilir && onIndir && (
              <ScrimDugme onClick={() => onIndir(metinD)} title="Düzenlenen metni DOCX indir">DOCX indir</ScrimDugme>
            )}
            {duzenlenebilir && (
              <ScrimDugme onClick={() => onKaydet?.(metinD)} disabled={!kirli} title={kirli ? "Değişiklikleri kaydet" : "Değişiklik yok"}>
                <Icon.check width={12} height={12} /> Kaydet
              </ScrimDugme>
            )}
            {eylemler}
            <button ref={kapatRef} type="button" onClick={kapatIstegi} aria-label={duzenlenebilir ? "Vazgeç ve kapat (Esc)" : "Kapat (Esc)"} {...focusRing}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,247,240,.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(251,247,240,.10)"; }}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", minHeight: 32, borderRadius: RAD.ctl, border: "1px solid rgba(251,247,240,.35)", background: "rgba(251,247,240,.10)", color: PAL.onAccent, ...TYPE.data, fontWeight: 500, transition: "background .12s ease-out" }}>
              <Icon.x width={12} height={12} /> {duzenlenebilir ? "Vazgeç" : "Kapat"}
            </button>
          </span>
        </div>

        {/* Kaydedilmemiş değişiklik koruması — kapatma denendiğinde net seçenekler */}
        {kapatUyari && kirli && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: "8px 12px", borderRadius: RAD.ctl, background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}` }}>
            <span style={{ ...TYPE.data, fontWeight: 500, color: DERIN.sari, flex: 1 }}>Kaydedilmemiş değişiklikler var.</span>
            <ScrimDugme onClick={() => onKaydet?.(metinD)}>Kaydet ve kapat</ScrimDugme>
            <ScrimDugme onClick={onKapat}>Kaydetmeden çık</ScrimDugme>
          </div>
        )}

        {/* A4 kâğıt — 1:1.414 oranında en az bir tam sayfa; uzun içerik sayfayı uzatır */}
        <div style={{ background: PAL.surf, borderRadius: RAD.chip, boxShadow: SH.modal, minHeight: "min(1040px, 137vw)", padding: fileUrl ? SP.l : "clamp(36px, 8vw, 76px) clamp(28px, 9vw, 88px)" }}>
          {fileUrl ? (
            <Suspense fallback={<div style={{ padding: SP.l, ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
              <PdfOnizleme fileUrl={fileUrl} tam />
            </Suspense>
          ) : duzenlenebilir ? (
            /* Kâğıt üzerinde doğrudan yazım — çerçevesiz alan, belge hissi bozulmaz. */
            <textarea ref={alanRef} value={metinD}
              onChange={(e) => { setMetinD(e.target.value); setKapatUyari(false); }}
              aria-label="Resmî yazı taslağı metni" spellCheck={false}
              style={{ width: "100%", boxSizing: "border-box", minHeight: 800, border: "none", outline: "none", background: "transparent", resize: "vertical", ...TYPE.read, color: PAL.ink2, padding: 0 }} />
          ) : (
            <div style={mono
              ? { fontFamily: MONO, fontSize: 13, lineHeight: 1.85, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }
              : { ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {metin || "İçerik henüz hazır değil."}
            </div>
          )}
        </div>

        <div style={{ ...TYPE.meta, color: "rgba(251,247,240,.62)", textAlign: "center" }}>
          {duzenlenebilir ? "Esc vazgeçer — kaydedilmemiş değişiklikte önce sorar" : "Kapatmak için Esc'e basın ya da dışarı tıklayın"}
        </div>
      </div>
    </div>
  );
}
