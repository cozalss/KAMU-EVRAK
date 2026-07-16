/* AltTaslakKarti — çok-konulu evrakta HER birim için bağımsız resmî yazı taslağı. Görsel olarak
   ana (tek-taslak) "kağıt tezgahı" bloğuyla BİREBİR aynı format (2026-07-15 kullanıcı isteği:
   "klasik resmi yazı taslağımızın formatında olsun, sadece butonlara basınca diğer taslağa
   geçsin") — başlık şeridi (ikon+"Resmî yazı taslağı"+Tür dropdown+A4 büyüt) → tint "masa"
   üstünde yüzen beyaz A4 kağıdı (TAM metin, kırpma yok) → HITL açıklaması + Reddet/Düzenle/
   Onayla footer. AltTaslakPager bunları tek tek (display:none ile gizleyerek) gösterir; tek
   alt-talep varsa CanliAjanAkisi doğrudan basar (onPrev/onNext verilmez).

   Her kart KENDİ yerel state'ini taşır (tur/metin/uretilen/durum) — ana taslaktan farklı olarak
   N kardeş taslak aynı anda var olabilir, her biri bağımsız karar alır. Karar verilince (durum
   != null) footer kaldırılır + başlıktaki Tür/Büyüt yerine durum rozeti geçer; pager'da başka
   taslağa gidip GERİ dönünce bu rozet KAYBOLMAMALI (bkz. AltTaslakPager'daki mount-koruma notu). */
import { useEffect, useRef, useState } from "react";
import { cleanDemoText } from "./result-cards.jsx";
import TurSecici from "./TurSecici.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { PAL, DERIN, BANT, ALFA, RAD, SP, TYPE, SH, focusRing, Icon, BuyutDugme } from "./neonUi.jsx";

/* Pager ok düğmesi — başlık şeridine gömülü (ayrı üst satır AÇMAZ, kartın dış kutusu komşu
   kolonlarla aynı y'de başlamalı). onPrev/onNext verilmezse AltTaslakKarti bunu hiç render etmez. */
function PagerOk({ ileri, onClick, disabled, label }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: RAD.dot, border: `1px solid ${disabled ? PAL.line : PAL.inputLine}`, background: PAL.surf, color: disabled ? PAL.mut3 : PAL.ink2, flexShrink: 0, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
      <Icon.arrow width={13} height={13} style={ileri ? undefined : { transform: "scaleX(-1)" }} />
    </button>
  );
}

const DURUM_ETIKET = {
  gonderildi: { text: "Gönderildi", color: "yesil" },
  reddedildi: { text: "Reddedildi", color: "kirmizi" },
};

export default function AltTaslakKarti({ altTalep, sira, toplam = 0, onTurUret, onOnaylaGonder, onReddet, onDuzenle, onPrev = null, onNext = null, prevDisabled = false, nextDisabled = false }) {
  const onerilen = altTalep.yazi_turu || "ust_yazi";
  const [tur, setTur] = useState(onerilen);
  const [metin, setMetin] = useState(altTalep.yazi_taslak_md || "");
  const [uretilen, setUretilen] = useState("");   // üretimi süren tür ("" = boşta)
  const [durum, setDurum] = useState(null);        // null | "gonderildi" | "reddedildi"
  const [modalAcik, setModalAcik] = useState(false);   // A4 görünüm büyütme
  const cacheRef = useRef({ [onerilen]: altTalep.yazi_taslak_md || "" });
  const etiket = altTalep.birim_tr || "İlgili birim";
  const bitti = durum != null;
  const rozet = durum && DURUM_ETIKET[durum];

  // Yeni koşumda (altTalep değişince) yerel state sıfırla — önceki evrakın tur/metin/rozeti sızmasın.
  useEffect(() => {
    const yeniOnerilen = altTalep.yazi_turu || "ust_yazi";
    setTur(yeniOnerilen);
    setMetin(altTalep.yazi_taslak_md || "");
    setUretilen("");
    setDurum(null);
    setModalAcik(false);
    cacheRef.current = { [yeniOnerilen]: altTalep.yazi_taslak_md || "" };
  }, [altTalep]);

  const secTur = async (yeni) => {
    if (yeni === tur || uretilen || bitti) return;
    const onbellek = cacheRef.current;
    if (onbellek[yeni] != null) { setTur(yeni); setMetin(onbellek[yeni]); return; }
    setUretilen(yeni);
    const data = await onTurUret(yeni);   // hata → null (toast DashboardApp'te gösterilir)
    setUretilen("");
    if (data?.yazi_taslak_md) {
      onbellek[yeni] = data.yazi_taslak_md;
      setTur(yeni);
      setMetin(data.yazi_taslak_md);
    }
  };

  const kilitli = bitti || !!uretilen;
  return (
    <div className="sc-draft-card" style={{ position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Başlık şeridi — [◀ pager] ikon + "Resmî yazı taslağı" · tür seçici · A4 büyüt [pager ▶].
          Ana taslak başlığıyla BİREBİR aynı; yalnız pager okları eklenir (onPrev/onNext varsa). */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
        {onPrev && <PagerOk onClick={onPrev} disabled={prevDisabled} label="Önceki taslağa git" />}
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.V }}><Icon.doc /></span>
        <span style={{ flex: 1, minWidth: 120 }}>
          <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Resmî yazı taslağı</span>
          {/* Çok-konulu "wow" görünür olsun (jüri bulgusu): konum + muhatap birim başlıkta. */}
          <span style={{ display: "block", marginTop: 1, ...TYPE.meta, color: DERIN.V, fontWeight: 500 }}>
            {toplam >= 2 ? `Taslak ${sira}/${toplam} · ` : ""}{etiket}
          </span>
        </span>
        {rozet ? (
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(BANT[rozet.color]?.c || DERIN[rozet.color]), ...TYPE.meta, fontWeight: 500, color: DERIN[rozet.color] }}>
            <Icon.check width={12} height={12} /> {rozet.text}
          </span>
        ) : (
          <>
            <TurSecici secili={tur} onerilen={onerilen} uretilen={uretilen} onSec={secTur} pasif={bitti} />
            <BuyutDugme onClick={() => setModalAcik(true)} label={`${etiket} taslağını A4 görünümde büyüt`} />
          </>
        )}
        {onNext && <PagerOk ileri onClick={onNext} disabled={nextDisabled} label="Sonraki taslağa git" />}
      </div>

      {/* Kağıt tezgahı — beyaz A4 sayfası tint "masa" üstünde yüzer, ortalı, TAM metin (kırpma
          yok — 2026-07-15 kullanıcı isteği). Ana taslak kağıt bloğuyla aynı ölçüler/gölge. */}
      <div className="sc-document-stage" style={{ background: PAL.surf2 }}>
        <div className="sc-document-paper" title="Büyüt (A4 görünüm)"
          onClick={() => setModalAcik(true)}
          style={{ maxWidth: 860, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "clamp(28px,3.5vw,48px) clamp(32px,4vw,60px)", boxShadow: SH.pop, cursor: "zoom-in", animation: "nu-rise .16s var(--ke-ease-out) both", opacity: uretilen ? 0.55 : 1, transition: "opacity .15s ease-out" }}>
          <pre style={{ ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{cleanDemoText(metin)}</pre>
        </div>
      </div>

      <BelgeModal acik={modalAcik} baslik={`Resmî yazı taslağı · ${etiket}`}
        metin={cleanDemoText(metin)} onKapat={() => setModalAcik(false)} />

      {/* HITL karar footer — belge kolonuyla hizalı (max 760, ortalı). Tek primary (Onayla ve
          gönder, sağda); Düzenle secondary; Reddet SOLDA düşük-vurgu (ghost). Karar verilince
          footer kaldırılır (kart soluk + başlıktaki rozet kalır — bkz. AltTaslakPager mount notu). */}
      {!bitti && (
        <div className="sc-decision-footer" style={{ borderTop: `1px solid ${PAL.line}` }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div className="sc-action-row">
              <button type="button" disabled={kilitli} {...focusRing}
                onClick={() => { if (onReddet(metin, tur)) setDurum("reddedildi"); }}
                onMouseEnter={(e) => { if (!kilitli) e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                style={{ cursor: kilitli ? "default" : "pointer", padding: "9px 14px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", background: "transparent", color: kilitli ? PAL.mut2 : DERIN.kirmizi, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                <Icon.x /> Reddet
              </button>
              <span className="sc-action-spacer" />
              <button type="button" disabled={kilitli} onClick={() => onDuzenle(metin, tur)} {...focusRing}
                style={{ cursor: kilitli ? "default" : "pointer", padding: "9px 16px", minHeight: 42, borderRadius: RAD.ctl, border: `1px solid ${kilitli ? PAL.line : PAL.inputLine}`, background: PAL.surf, color: kilitli ? PAL.mut2 : PAL.ink, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                <Icon.edit /> Düzenle
              </button>
              <button type="button" disabled={kilitli} {...focusRing} data-press=""
                onClick={() => { if (onOnaylaGonder(metin, tur)) setDurum("gonderildi"); }}
                style={{ cursor: kilitli ? "default" : "pointer", padding: "9px 20px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", ...TYPE.ui, fontWeight: 600, color: kilitli ? PAL.mut2 : PAL.onAccent, background: kilitli ? PAL.press : DERIN.T, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                <Icon.send /> Onayla ve gönder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
