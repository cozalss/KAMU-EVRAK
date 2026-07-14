/* AltTaslakKarti — çok-konulu evrakta HER birim için bağımsız üst yazı kartı (kompakt tile).
   CanliAjanAkisi bunları YAN YANA responsive grid'de dizer → her birim ayrı kolon, karışmaz.

   Tasarım (2026-07): kartlar dikey yığılınca birbirine karışıyordu — çünkü resmî yazılar hep
   aynı "T.C. KAMU KURUMU…" başlığıyla açılıyor (görsel olarak ikiz). Çözüm: tile'da AYIRT EDİCİ
   olan KONU/özet öne çıkar (her birim farklı), mektubun kendisi kısa önizleme + "Büyüt" ile A4
   modalda. Tür = sessiz dropdown (tek taslak kartıyla aynı dil). Onayla/Reddet gerçek karar;
   Düzenle taslağı Taslaklar kuyruğuna alır (yerinde textarea yok). */
import { useEffect, useRef, useState } from "react";
import { cleanDemoText } from "./result-cards.jsx";
import TurSecici from "./TurSecici.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { PAL, DERIN, BANT, ALFA, RAD, SP, TYPE, TNUM, SH, focusRing, Icon, BuyutDugme } from "./neonUi.jsx";

const cardStyle = {
  position: "relative", borderRadius: RAD.card, background: PAL.surf,
  border: `1px solid ${PAL.line}`, padding: 0, overflow: "hidden",
  display: "flex", flexDirection: "column", height: "100%",
};

const DURUM_ETIKET = {
  gonderildi: { text: "Gönderildi", color: "yesil" },
  reddedildi: { text: "Reddedildi", color: "kirmizi" },
};

export default function AltTaslakKarti({ altTalep, sira, onTurUret, onOnaylaGonder, onReddet, onDuzenle }) {
  const onerilen = altTalep.yazi_turu || "ust_yazi";
  const [tur, setTur] = useState(onerilen);
  const [metin, setMetin] = useState(altTalep.yazi_taslak_md || "");
  const [uretilen, setUretilen] = useState("");   // üretimi süren tür ("" = boşta)
  const [durum, setDurum] = useState(null);        // null | "gonderildi" | "reddedildi"
  const [modalAcik, setModalAcik] = useState(false);   // A4 görünüm büyütme
  const cacheRef = useRef({ [onerilen]: altTalep.yazi_taslak_md || "" });
  const etiket = altTalep.birim_tr || "İlgili birim";
  const konu = (altTalep.ozet || "").trim();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const desc = `alt-taslak-${sira || 0}-hitl`;
  const clamp = (satir) => ({ display: "-webkit-box", WebkitLineClamp: satir, WebkitBoxOrient: "vertical", overflow: "hidden" });
  return (
    <div style={{ ...cardStyle, opacity: bitti ? 0.72 : 1, transition: "opacity .15s ease-out" }}>
      {/* Başlık — [sıra] birim adı · A4 büyüt. Birim adı kartın kimliği (kalın, sarmalı). */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: `${SP.s}px ${SP.m}px`, borderBottom: `1px solid ${PAL.line}` }}>
        {sira != null && (
          <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: RAD.dot, background: ALFA(DERIN.V), color: DERIN.V, ...TYPE.meta, ...TNUM, fontWeight: 600 }}>{sira}</span>
        )}
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2, flex: 1, minWidth: 0 }}>{etiket}</span>
        {rozet ? (
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(BANT[rozet.color]?.c || DERIN[rozet.color]), ...TYPE.meta, fontWeight: 500, color: DERIN[rozet.color] }}>
            <Icon.check width={12} height={12} /> {rozet.text}
          </span>
        ) : (
          metin && <BuyutDugme onClick={() => setModalAcik(true)} label={`${etiket} taslağını A4 görünümde büyüt`} />
        )}
      </div>

      {/* Gövde — AYIRT EDİCİ konu (özet) öne çıkar; altında kısa mektup önizlemesi (clamp). */}
      <div style={{ display: "flex", flexDirection: "column", gap: SP.s, padding: SP.m, flex: 1, minWidth: 0 }}>
        {konu && (
          <div style={{ minWidth: 0 }}>
            <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Konu</span>
            <div style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, marginTop: 2, ...clamp(2) }}>{konu}</div>
          </div>
        )}
        {!bitti && metin && (
          <TurSecici secili={tur} onerilen={onerilen} uretilen={uretilen} onSec={secTur} pasif={bitti} />
        )}
        {/* Mektup önizleme — mini kağıt (tint zemin üstünde), tıklanınca tam A4 modal. Clamp'li
            → tile'lar dengeli yükseklikte, mektup boilerplate'i kartları şişirmez. */}
        <div role="button" tabIndex={0} title="Büyüt (A4 görünüm)" {...focusRing}
          onClick={() => setModalAcik(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalAcik(true); } }}
          style={{ background: PAL.bg2, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, padding: "10px 12px", cursor: "zoom-in", opacity: uretilen ? 0.55 : 1, transition: "opacity .15s ease-out" }}>
          <div style={{ ...TYPE.data, color: PAL.mut, whiteSpace: "pre-wrap", wordBreak: "break-word", ...clamp(4) }}>{cleanDemoText(metin)}</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, marginTop: SP.xs, ...TYPE.meta, color: DERIN.T }}>Tam metni gör</span>
        </div>
      </div>

      <BelgeModal acik={modalAcik} baslik={`Resmî yazı taslağı · ${etiket}`}
        metin={cleanDemoText(metin)} onKapat={() => setModalAcik(false)} />

      {/* Footer — Reddet sol (düşük-vurgu) · Düzenle · Onayla (primary sağ). Kompakt; dar kolonda
          sığmazsa sarar. Karar verilince footer kaldırılır (kart soluk + rozet kalır). */}
      {!bitti && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.xs, flexWrap: "wrap", padding: `${SP.s}px ${SP.m}px ${SP.m}px`, borderTop: `1px solid ${PAL.line}` }}>
          <button type="button" disabled={kilitli} {...focusRing} aria-describedby={desc}
            onClick={() => { if (onReddet(metin, tur)) setDurum("reddedildi"); }}
            onMouseEnter={(e) => { if (!kilitli) e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: kilitli ? "default" : "pointer", padding: "7px 10px", minHeight: 34, borderRadius: RAD.ctl, border: "none", background: "transparent", color: kilitli ? PAL.mut2 : DERIN.kirmizi, ...TYPE.data, fontWeight: 500, transition: "background .12s ease-out" }}>
            Reddet
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" disabled={kilitli} onClick={() => onDuzenle(metin, tur)} {...focusRing}
            title="Taslağı Taslaklar'a al ve orada düzenle"
            style={{ cursor: kilitli ? "default" : "pointer", padding: "7px 12px", minHeight: 34, borderRadius: RAD.ctl, border: `1px solid ${kilitli ? PAL.line : PAL.inputLine}`, background: PAL.surf, color: kilitli ? PAL.mut2 : PAL.ink, ...TYPE.data, fontWeight: 500 }}>
            Düzenle
          </button>
          <button type="button" disabled={kilitli} {...focusRing} data-press=""
            onClick={() => { if (onOnaylaGonder(metin, tur)) setDurum("gonderildi"); }}
            style={{ cursor: kilitli ? "default" : "pointer", padding: "7px 14px", minHeight: 34, borderRadius: RAD.ctl, border: "none", ...TYPE.data, fontWeight: 600, color: kilitli ? PAL.mut2 : PAL.onAccent, background: kilitli ? PAL.press : DERIN.T }}>
            Onayla ve gönder
          </button>
        </div>
      )}
      <span id={desc} style={{ display: "none" }}>Yapay zekâ öneriyor, yetkili memur karar verir (HITL)</span>
    </div>
  );
}
