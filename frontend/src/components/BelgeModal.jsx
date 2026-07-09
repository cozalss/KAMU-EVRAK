/* BelgeModal — Kaynak belge / Resmî yazı taslağını A4 kâğıt görünümünde büyütüp inceleme.
   Havada duran katman disiplini (MASTER): karartı + SH.modal + RAD.pop; kâğıt gerçek belge
   gibi durur (A4 oranında min yükseklik + geniş belge kenar boşlukları). a11y: role=dialog +
   aria-modal, Esc ve dış-tık kapatır, açılışta odak kapat düğmesine gider, kapanışta
   tetikleyiciye döner, açıkken body scroll kilitlenir. PDF kaynaklarda gerçek sayfa
   önizlemesi (react-pdf, tembel) — metin yolunda maskeli içerik gösterilir (KVKK). */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MONO, PAL, DERIN, DERIN_OF, T, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, Icon, Btn, focusRing } from "./neonUi.jsx";
import { DuzeltmeDiff } from "./NeonDetayParts.jsx";
import { cleanDemoText } from "./result-cards.jsx";
import { useSpeechToText } from "../hooks/useSpeechToText.js";

const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

/* Karartı üstü açık düğme — modal üst şeridindeki eylemler (PDF/DOCX indir) Kapat ile aynı dil. */
export function ScrimDugme({ onClick, onMouseDown, disabled, children, title, ariaLabel, ariaPressed }) {
  return (
    <button type="button" onClick={onClick} onMouseDown={onMouseDown} disabled={disabled} title={title} aria-label={ariaLabel} aria-pressed={ariaPressed} {...focusRing}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(251,247,240,.18)"; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(251,247,240,.10)"; }}
      style={{ cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", minHeight: 32, borderRadius: RAD.ctl, border: "1px solid rgba(251,247,240,.35)", background: "rgba(251,247,240,.10)", color: PAL.onInk, opacity: disabled ? 0.55 : 1, ...TYPE.data, fontWeight: 500, transition: "background .12s ease-out" }}>
      {children}
    </button>
  );
}

export default function BelgeModal({ acik, baslik, dosyaAdi = "", metin = "", mono = false, fileUrl = "", onKapat = () => {}, eylemler = null, duzenlenebilir = false, onKaydet = null, onGonder = null, onIndir = null, onRevize = null }) {
  const kapatRef = useRef(null);
  const alanRef = useRef(null);
  const oncekiOdak = useRef(null);
  // Düzenleme taslağı — modal her açılışta taze kurulmalı: çağıran taraf bileşeni koşullu
  // render eder ({acikken && <BelgeModal …/>}), kapanınca unmount → durum sızmaz.
  const [metinD, setMetinD] = useState(metin);
  const [kapatUyari, setKapatUyari] = useState(false);
  const kirli = duzenlenebilir && metinD !== metin;

  // AI ile revize et — doğal-dil talimatla taslağı DeepSeek'e düzenlet, sonucu diff olarak
  // göster, memur Uygula/Vazgeç ile onaylar (HITL — AI hiçbir zaman doğrudan uygulamaz).
  const [talimat, setTalimat] = useState("");
  const [revizeBusy, setRevizeBusy] = useState(false);
  const [revizeOneri, setRevizeOneri] = useState(null);
  const [revizeHata, setRevizeHata] = useState(null);
  const revizeIste = async () => {
    if (!talimat.trim() || revizeBusy) return;
    setRevizeBusy(true);
    setRevizeHata(null);
    setRevizeOneri(null);
    try {
      const sonuc = await onRevize(metinD, talimat.trim());
      if (sonuc?.revize_edildi && sonuc.taslak_md) {
        // metinD (eski) TaslaklarView'da cleanDemoText'ten geçmiş halde geliyor — AI'nin ham
        // cevabı (yeni) aynı temizlikten geçmezse aynı içerik bile satır-diff'te "değişti"
        // görünüyordu ([DOĞRULA:...]/şablon-slot metni + boşluk normalizasyonu asimetrisi).
        setRevizeOneri(cleanDemoText(sonuc.taslak_md));
      } else {
        setRevizeHata("Talimat uygulanamadı — taslakla ilgisiz olabilir ya da AI şu an kullanılamıyor.");
      }
    } catch {
      setRevizeHata("Revizyon isteği başarısız oldu — bağlantıyı kontrol edip tekrar deneyin.");
    } finally {
      setRevizeBusy(false);
    }
  };

  // Gönder — onGonder artık /yazi/dogrula'dan geçtiği için ağ turu içerir (eskiden
  // senkron pushOutbox'tı). Busy koruması olmadan hızlı çift tıklama aynı taslak için
  // iki Giden Evrak kaydı açabilirdi; çağıran (TaslaklarView) da yalnız BAŞARIDA
  // modalı kapatır — doğrulama başarısız olursa taslak açık kalır, toast görülür.
  const [gonderBusy, setGonderBusy] = useState(false);
  const gonderIste = async () => {
    if (gonderBusy || !onGonder) return;
    setGonderBusy(true);
    try { await onGonder(metinD); } finally { setGonderBusy(false); }
  };

  // Sesle dikte — "canlı bölge" (liveRef) konuşulan ama henüz kesinleşmemiş metnin kâğıttaki
  // aralığını tutar: her ara-sonuç o aralığı günceller (konuştukça kâğıda akar), kesinleşince
  // aralık kalıcı metne dönüşür ve bir sonraki cümle için sıfırlanır. Dikte başlarken (mic
  // düğmesine ilk basışta) imleç konumu yakalanır; sonrasında aralık kendi kendini ilerletir.
  const liveRef = useRef({ start: 0, len: 0 });
  // NOT: setMetinD'i fonksiyonel updater olarak ÇAĞIRMIYORUZ — React StrictMode (main.jsx)
  // geliştirmede updater'ları saflık kontrolü için iki kez çağırır; updater içinde liveRef gibi
  // bir side-effect olsaydı ikinci çağrı zaten ilerlemiş ref'i okur ve imleç yanlış konuma
  // sıçrardı (canlı yazı "üste atma" hatası). Bunun yerine mevcut render'ın kapadığı metinD'yi
  // doğrudan okuyup TEK, düz bir setMetinD(yeniMetin) çağrısı yapıyoruz.
  const sesSonucu = (parca, { finalMi }) => {
    if (!parca.trim() && !finalMi) return;
    const { start, len } = liveRef.current;
    const b = Math.min(start, metinD.length);
    const s = Math.min(b + len, metinD.length);
    const bosluk = len === 0 && b > 0 && !/\s/.test(metinD[b - 1] || "") ? " " : "";
    const ekIcerik = finalMi ? `${bosluk}${parca.trim()} ` : `${bosluk}${parca}`;
    liveRef.current = finalMi ? { start: b + ekIcerik.length, len: 0 } : { start: b, len: ekIcerik.length };
    setMetinD(metinD.slice(0, b) + ekIcerik + metinD.slice(s));
    setKapatUyari(false);
    // İmleci canlı bölgenin sonuna taşı — konuştukça imleç metnin ardından ilerler.
    const konum = liveRef.current.start + liveRef.current.len;
    requestAnimationFrame(() => {
      const el = alanRef.current;
      el?.focus();
      el?.setSelectionRange(konum, konum);
    });
  };
  const stt = useSpeechToText({ lang: "tr-TR", onSonuc: sesSonucu });

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
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.onInk }}>{baslik}</span>
          {dosyaAdi && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: "rgba(251,247,240,.72)" }}>{dosyaAdi}</span>}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
            {duzenlenebilir && (
              <span style={{ ...TYPE.meta, ...TNUM, color: "rgba(251,247,240,.72)" }}>{metinD.length} karakter</span>
            )}
            {duzenlenebilir && stt.destekleniyor && (
              <ScrimDugme
                // Odak metin alanından hiç ayrılmasın (imleç görünür kalsın) — buton tıklaması
                // varsayılan odak-kapma davranışını burada iptal eder, click yine de tetiklenir.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!stt.dinliyor) {
                    const el = alanRef.current;
                    const pos = Math.min(el ? el.selectionStart : metinD.length, metinD.length);
                    liveRef.current = { start: pos, len: 0 };
                  }
                  stt.toggle();
                }}
                ariaPressed={stt.dinliyor}
                ariaLabel={stt.dinliyor ? "Dikteyi durdur" : "Sesle dikte et"}
                title={stt.dinliyor ? "Dikteyi durdur" : "Sesle dikte et (Türkçe)"}>
                {stt.dinliyor && (
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: BANT.kirmizi.c, animation: "nu-think 1.1s infinite" }} />
                )}
                <Icon.mic width={13} height={13} /> {stt.dinliyor ? "Dinliyor…" : "Sesle yaz"}
              </ScrimDugme>
            )}
            {duzenlenebilir && onIndir && (
              <ScrimDugme onClick={() => onIndir(metinD)} title="Düzenlenen metni DOCX indir">DOCX indir</ScrimDugme>
            )}
            {duzenlenebilir && (
              <ScrimDugme onClick={() => onKaydet?.(metinD)} disabled={!kirli || gonderBusy} title={kirli ? "Değişiklikleri kaydet" : "Değişiklik yok"}>
                <Icon.check width={12} height={12} /> Kaydet
              </ScrimDugme>
            )}
            {duzenlenebilir && onGonder && (
              <ScrimDugme onClick={gonderIste} disabled={gonderBusy} title="Doğrula, kaydet ve Giden Evrak'a gönder">
                {gonderBusy ? <><Icon.spin width={12} height={12} /> Gönderiliyor…</> : <><Icon.arrow width={12} height={12} /> Gönder</>}
              </ScrimDugme>
            )}
            {eylemler}
            <button ref={kapatRef} type="button" onClick={kapatIstegi} aria-label={duzenlenebilir ? "Vazgeç ve kapat (Esc)" : "Kapat (Esc)"} {...focusRing}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,247,240,.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(251,247,240,.10)"; }}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", minHeight: 32, borderRadius: RAD.ctl, border: "1px solid rgba(251,247,240,.35)", background: "rgba(251,247,240,.10)", color: PAL.onInk, ...TYPE.data, fontWeight: 500, transition: "background .12s ease-out" }}>
              <Icon.x width={12} height={12} /> {duzenlenebilir ? "Vazgeç" : "Kapat"}
            </button>
          </span>
        </div>

        {duzenlenebilir && stt.hata && (
          <div role="alert" style={{ ...TYPE.data, fontWeight: 500, color: BANT.kirmizi.c, textAlign: "center" }}>{stt.hata}</div>
        )}

        {/* Kaydedilmemiş değişiklik koruması — kapatma denendiğinde net seçenekler */}
        {kapatUyari && kirli && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: "8px 12px", borderRadius: RAD.ctl, background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}` }}>
            <span style={{ ...TYPE.data, fontWeight: 500, color: DERIN.sari, flex: 1 }}>Kaydedilmemiş değişiklikler var.</span>
            <ScrimDugme onClick={() => onKaydet?.(metinD)}>Kaydet ve kapat</ScrimDugme>
            <ScrimDugme onClick={onKapat}>Kaydetmeden çık</ScrimDugme>
          </div>
        )}

        {/* AI ile revize et — doğal-dil talimat, öneri diff olarak gösterilir, memur onaylar */}
        {duzenlenebilir && onRevize && !revizeOneri && (
          <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", padding: "10px 14px", borderRadius: RAD.chip, background: PAL.surf, boxShadow: SH.card }}>
            <Icon.sparkle width={15} height={15} style={{ color: DERIN_OF(T), flexShrink: 0 }} />
            <input value={talimat} onChange={(e) => { setTalimat(e.target.value); setRevizeHata(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") revizeIste(); }}
              placeholder="AI ile revize et — örn. “daha resmi yap”, “507 sayılı kanuna atıf ekle”"
              aria-label="Taslak revizyon talimatı" disabled={revizeBusy} {...focusRing}
              style={{ flex: 1, minWidth: 200, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, padding: "7px 10px", background: PAL.bg, color: PAL.ink, ...TYPE.data }} />
            <Btn onClick={revizeIste} disabled={!talimat.trim() || revizeBusy}>
              {revizeBusy ? <><Icon.spin width={13} height={13} /> Düşünüyor…</> : "Revize et"}
            </Btn>
          </div>
        )}
        {revizeHata && (
          <div role="alert" style={{ ...TYPE.data, color: DERIN.kirmizi, textAlign: "center" }}>{revizeHata}</div>
        )}
        {revizeOneri && (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.s, padding: SP.m, borderRadius: RAD.chip, background: PAL.surf, boxShadow: SH.modal }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.s, flexWrap: "wrap" }}>
              <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>AI önerisi — talimat: “{talimat}”</span>
              <span style={{ display: "flex", gap: SP.s }}>
                <Btn onClick={() => setRevizeOneri(null)}>Vazgeç</Btn>
                <Btn primary onClick={() => { setMetinD(revizeOneri); setRevizeOneri(null); setTalimat(""); setKapatUyari(false); }}>
                  <Icon.check width={12} height={12} /> Uygula
                </Btn>
              </span>
            </div>
            <DuzeltmeDiff eski={metinD} yeni={revizeOneri} />
          </div>
        )}

        {/* A4 kâğıt — inceleme bekleyen bir AI önerisi varken gizlenir: aynı (henüz
            değişmemiş) metni hem diff'te hem burada tekrar göstermek yığılma yaratıyordu,
            diff kartına da daha az yer bırakıyordu. Uygula/Vazgeç sonrası kâğıt geri döner. */}
        {!revizeOneri && (
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
        )}

        <div style={{ ...TYPE.meta, color: "rgba(251,247,240,.62)", textAlign: "center" }}>
          {duzenlenebilir ? "Esc vazgeçer — kaydedilmemiş değişiklikte önce sorar" : "Kapatmak için Esc'e basın ya da dışarı tıklayın"}
        </div>
      </div>
    </div>
  );
}
