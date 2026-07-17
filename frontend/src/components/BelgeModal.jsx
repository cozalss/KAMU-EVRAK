/* BelgeModal — Kaynak belge / Resmî yazı taslağını A4 kâğıt görünümünde büyütüp inceleme.
   Havada duran katman disiplini (MASTER): karartı + SH.modal + RAD.pop; kâğıt gerçek belge
   gibi durur (A4 oranında min yükseklik + geniş belge kenar boşlukları). a11y: role=dialog +
   aria-modal, Esc ve dış-tık kapatır, açılışta odak kapat düğmesine gider, kapanışta
   tetikleyiciye döner, açıkken body scroll kilitlenir. PDF kaynaklarda gerçek sayfa
   önizlemesi (react-pdf, tembel) — metin yolunda maskeli içerik gösterilir (KVKK). */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MONO, PAL, DERIN, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, Icon, focusRing, odakDongusu } from "./neonUi.jsx";
import RevizePaneli from "./RevizePaneli.jsx";
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

export default function BelgeModal({ acik, baslik, dosyaAdi = "", metin = "", segmentler = null, mono = false, fileUrl = "", onKapat = () => {}, eylemler = null, duzenlenebilir = false, onKaydet = null, onGonder = null, onIndir = null, onRevize = null }) {
  const kapatRef = useRef(null);
  const alanRef = useRef(null);
  const oncekiOdak = useRef(null);
  // Düzenleme taslağı — modal her açılışta taze kurulmalı: çağıran taraf bileşeni koşullu
  // render eder ({acikken && <BelgeModal …/>}), kapanınca unmount → durum sızmaz.
  const [metinD, setMetinD] = useState(metin);
  const [kapatUyari, setKapatUyari] = useState(false);
  const kirli = duzenlenebilir && metinD !== metin;

  // AI ile revize et — tüm akış (talimat, öneri diff'i, çok-turlu geliştirme, geri al)
  // RevizePaneli'nde yaşar (HITL — AI hiçbir zaman doğrudan uygulamaz). Burada yalnız
  // "öneri açık mı" bilgisi tutulur: öneri incelenirken A4 kâğıt gizlenir (yığılma önlenir).
  const [revizeOneriAcik, setRevizeOneriAcik] = useState(false);

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
  // Aynı `onresult` olayı ≥2 parça taşıyabilir (final + ara): iki senkron çağrı da render
  // kapanışındaki AYNI metinD'yi okursa ikincisi ilkinin kesinleşen cümlesini eziyordu (bug
  // avı bulgusu — dikte kaybı). Çözüm: metinD'nin senkron ref aynası — olay içi ardışık
  // çağrılar günceli okur; StrictMode kaygısı updater'da değil (bu bir olay işleyicisi).
  const metinDRef = useRef(metinD);
  useEffect(() => { metinDRef.current = metinD; });   // elle yazım dahil her commit'te aynala
  const sesSonucu = (parca, { finalMi }) => {
    if (!parca.trim() && !finalMi) return;
    const kaynakMetin = metinDRef.current;
    const { start, len } = liveRef.current;
    const b = Math.min(start, kaynakMetin.length);
    const s = Math.min(b + len, kaynakMetin.length);
    const bosluk = len === 0 && b > 0 && !/\s/.test(kaynakMetin[b - 1] || "") ? " " : "";
    const ekIcerik = finalMi ? `${bosluk}${parca.trim()} ` : `${bosluk}${parca}`;
    liveRef.current = finalMi ? { start: b + ekIcerik.length, len: 0 } : { start: b, len: ekIcerik.length };
    const yeniMetin = kaynakMetin.slice(0, b) + ekIcerik + kaynakMetin.slice(s);
    metinDRef.current = yeniMetin;
    setMetinD(yeniMetin);
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
    <div role="dialog" aria-modal="true" aria-label={baslik} onClick={kapatIstegi} onKeyDown={odakDongusu}
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: "rgba(22,22,22,.58)", overflowY: "auto", padding: "32px 16px 48px", animation: "nu-rise .16s var(--ke-ease-out) both" }}>
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

        {/* AI ile revize et — hazır talimatlar, sesle talimat, değişiklik özeti, kalite
            kapıları, çok-turlu geliştirme ve geri-al ile tam akış RevizePaneli'nde. */}
        {duzenlenebilir && onRevize && (
          <RevizePaneli metin={metinD} onRevize={onRevize}
            onUygula={(yeni) => { setMetinD(yeni); setKapatUyari(false); }}
            onOneriDegisti={setRevizeOneriAcik} />
        )}

        {/* A4 kâğıt — AI revizyonu İSTENDİĞİ ANDAN (busy) inceleme bitene kadar gizlenir:
            aynı (henüz değişmemiş) metni hem diff'te hem burada tekrar göstermek yığılma
            yaratıyordu; ayrıca istek sürerken kâğıt açık kalsaydı memurun o sırada yaptığı
            elle düzeltme "Uygula"da sessizce silinirdi (ESKİ metne göre üretilmiş öneri
            üzerine yazardı). Uygula/Vazgeç sonrası kâğıt geri döner. */}
        {!revizeOneriAcik && (
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
                {/* Çıkarım vurguları A4'te de korunur — panel ile aynı sarı <mark> dili
                    (kaynak belgede vurgulanan unsurlar büyütünce de görünür kalır). */}
                {segmentler && segmentler.length
                  ? segmentler.map((sg, i) => sg.mark
                      ? <mark key={i} style={{ background: ALFA(BANT.sari.c), color: DERIN.sari, borderRadius: RAD.chip, padding: "0 2px" }}>{sg.t}</mark>
                      : <span key={i}>{sg.t}</span>)
                  : (metin || "İçerik henüz hazır değil.")}
              </div>
            )}
          </div>
        )}

        <div style={{ ...TYPE.meta, color: "rgba(251,247,240,.62)", textAlign: "center" }}>
          {duzenlenebilir ? "Esc vazgeçer; kaydedilmemiş değişiklikte önce sorar" : "Kapatmak için Esc'e basın ya da dışarı tıklayın"}
        </div>
      </div>
    </div>
  );
}
