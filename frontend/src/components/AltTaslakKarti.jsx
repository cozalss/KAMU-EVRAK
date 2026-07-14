/* AltTaslakKarti — çok-konulu evrakta HER birim için bağımsız üst yazı kartı.
   Ana taslak kartıyla TAM özellik paritesi:
   - Tür kutucukları (TurSecici): üst yazı / cevabi / bilgilendirme / olur / müzekkere / görüş —
     seçilen türe göre bu birimin taslağı yeniden üretilir (tür başına koşum-içi önbellek).
   - Onayla & gönder / Reddet: gerçek karar (DashboardApp.onAltKarar → Giden Evrak + DB).
   - Düzenle: ana karttaki gibi taslağı TASLAKLAR kuyruğuna ekler ve oraya götürür
     (yerinde textarea YOK — düzenleme tek yerde, TaslaklarView'da yapılır). */
import { useEffect, useRef, useState } from "react";
import { cleanDemoText } from "./result-cards.jsx";
import TurSecici from "./TurSecici.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { PAL, DERIN, BANT, ALFA, RAD, SP, TYPE, TNUM, SH, focusRing, Icon, BuyutDugme } from "./neonUi.jsx";

const cardStyle = {
  position: "relative", borderRadius: RAD.card, background: PAL.surf,
  border: `1px solid ${PAL.line}`, padding: 0, overflow: "hidden",
};

const DURUM_ETIKET = {
  gonderildi: { text: "Gönderildi", color: "yesil" },
  reddedildi: { text: "Reddedildi", color: "kirmizi" },
};

export default function AltTaslakKarti({ altTalep, sira, toplam, onTurUret, onOnaylaGonder, onReddet, onDuzenle }) {
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

  // CanliAjanAkisi bu bileşeni sıra (index) ile render eder (aynı sıradaki birim kartı
  // yeni bir evrak koşumunda YENİDEN oluşturulmaz, aynı örnek kalır) — yeni koşumda
  // `altTalep` (yeni pipeline sonucundan taze bir nesne) değiştiğinde yerel state'i
  // sıfırla; aksi hâlde önceki evrakın tur/metin/"Gönderildi" rozeti sızardı.
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
  return (
    <div style={{ ...cardStyle, opacity: bitti ? 0.72 : 1, transition: "opacity .15s ease-out" }}>
      {/* Başlık şeridi — [sıra] birim adı · tür dropdown (ikincil) · durum · A4 büyüt.
          Tek taslak kartıyla aynı dil: tür artık band değil sessiz dropdown. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.s}px ${SP.m}px`, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
        {sira != null && (
          <span aria-hidden="true" style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: RAD.dot, background: ALFA(DERIN.V), color: DERIN.V, ...TYPE.meta, ...TNUM, fontWeight: 600 }}>{sira}</span>
        )}
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink2, flex: 1, minWidth: 100 }}>{etiket}</span>
        {!bitti && metin && (
          <TurSecici secili={tur} onerilen={onerilen} uretilen={uretilen} onSec={secTur} pasif={bitti} />
        )}
        {rozet && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(BANT[rozet.color]?.c || DERIN[rozet.color]), ...TYPE.meta, fontWeight: 500, color: DERIN[rozet.color] }}>
            <Icon.check width={12} height={12} /> {rozet.text}
          </span>
        )}
        {metin && <BuyutDugme onClick={() => setModalAcik(true)} label={`${etiket} taslağını A4 görünümde büyüt`} />}
      </div>
      {/* Mini kağıt — beyaz sayfa tint "masa" üstünde; tek yükseltilmiş katman (SH.card). */}
      <div style={{ background: PAL.bg2, padding: SP.m }}>
        <pre role="button" tabIndex={0} title="Büyüt (A4 görünüm)" {...focusRing}
          onClick={() => setModalAcik(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalAcik(true); } }}
          style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: "18px 22px", ...TYPE.data, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 260, overflowY: "auto", cursor: "zoom-in", opacity: uretilen ? 0.55 : 1, transition: "opacity .15s ease-out" }}>
          {cleanDemoText(metin)}
        </pre>
      </div>
      <BelgeModal acik={modalAcik} baslik={`Resmî yazı taslağı · ${etiket}`}
        metin={cleanDemoText(metin)} onKapat={() => setModalAcik(false)} />
      {/* Footer — tek taslak kartıyla aynı düzen: Reddet sol (düşük-vurgu) · Düzenle · Onayla (primary sağ). */}
      {!bitti && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.s}px ${SP.m}px ${SP.m}px`, borderTop: `1px solid ${PAL.line}` }}>
          <button type="button" disabled={kilitli} {...focusRing} aria-describedby={desc}
            onClick={() => { if (onReddet(metin, tur)) setDurum("reddedildi"); }}
            onMouseEnter={(e) => { if (!kilitli) e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: kilitli ? "default" : "pointer", padding: "8px 12px", minHeight: 36, borderRadius: RAD.ctl, border: "none", background: "transparent", color: kilitli ? PAL.mut2 : DERIN.kirmizi, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease-out" }}>
            Reddet
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" disabled={kilitli} onClick={() => onDuzenle(metin, tur)} {...focusRing}
            title="Taslağı Taslaklar'a al ve orada düzenle"
            style={{ cursor: kilitli ? "default" : "pointer", padding: "8px 16px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${kilitli ? PAL.line : PAL.inputLine}`, background: PAL.surf, color: kilitli ? PAL.mut2 : PAL.ink, ...TYPE.ui, fontWeight: 500 }}>
            Düzenle
          </button>
          <button type="button" disabled={kilitli} {...focusRing} data-press=""
            onClick={() => { if (onOnaylaGonder(metin, tur)) setDurum("gonderildi"); }}
            style={{ cursor: kilitli ? "default" : "pointer", padding: "8px 20px", minHeight: 36, borderRadius: RAD.ctl, border: "none", ...TYPE.ui, fontWeight: 500, color: kilitli ? PAL.mut2 : PAL.onAccent, background: kilitli ? PAL.press : DERIN.T }}>
            Onayla ve gönder
          </button>
        </div>
      )}
      <span id={desc} style={{ display: "none" }}>Yapay zekâ öneriyor, yetkili memur karar verir (HITL)</span>
    </div>
  );
}
