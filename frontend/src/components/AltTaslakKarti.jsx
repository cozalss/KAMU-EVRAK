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
import { PAL, DERIN, RAD, SP, TYPE, focusRing, Icon, BuyutDugme } from "./neonUi.jsx";

const cardStyle = {
  position: "relative", borderRadius: RAD.card, background: PAL.surf,
  border: `1px solid ${PAL.line}`, padding: SP.l,
};

const DURUM_ETIKET = {
  gonderildi: { text: "Gönderildi", color: "yesil" },
  reddedildi: { text: "Reddedildi", color: "kirmizi" },
};

export default function AltTaslakKarti({ altTalep, onTurUret, onOnaylaGonder, onReddet, onDuzenle }) {
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
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, flex: 1 }}>{etiket}</span>
        {rozet && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN[rozet.color] }}>
            <Icon.check width={12} height={12} /> {rozet.text}
          </span>
        )}
        {metin && <BuyutDugme onClick={() => setModalAcik(true)} label={`${etiket} taslağını A4 görünümde büyüt`} />}
      </div>
      <TurSecici secili={tur} onerilen={onerilen} uretilen={uretilen} onSec={secTur} pasif={bitti} />
      <pre role="button" tabIndex={0} title="Büyüt (A4 görünüm)" {...focusRing}
        onClick={() => setModalAcik(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalAcik(true); } }}
        style={{ background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "12px 16px", ...TYPE.data, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 320, overflowY: "auto", cursor: "zoom-in", opacity: uretilen ? 0.55 : 1, transition: "opacity .15s ease-out" }}>
        {cleanDemoText(metin)}
      </pre>
      <BelgeModal acik={modalAcik} baslik={`Resmî yazı taslağı · ${etiket}`}
        metin={cleanDemoText(metin)} onKapat={() => setModalAcik(false)} />
      <div style={{ display: "flex", gap: SP.s, marginTop: SP.s }}>
        <button type="button" disabled={kilitli} {...focusRing}
          onClick={() => { if (onOnaylaGonder(metin, tur)) setDurum("gonderildi"); }}
          style={{ flex: 1, cursor: kilitli ? "default" : "pointer", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: "none", ...TYPE.ui, fontWeight: 500, color: kilitli ? PAL.mut2 : PAL.onAccent, background: kilitli ? PAL.press : DERIN.T }}>
          Onayla &amp; gönder
        </button>
        <button type="button" disabled={kilitli} onClick={() => onDuzenle(metin, tur)} {...focusRing}
          title="Taslağı Taslaklar'a al ve orada düzenle"
          style={{ cursor: kilitli ? "not-allowed" : "pointer", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${kilitli ? PAL.line : PAL.inputLine}`, background: PAL.surf, color: kilitli ? PAL.mut2 : PAL.ink, ...TYPE.ui, fontWeight: 500 }}>
          Düzenle
        </button>
        <button type="button" disabled={kilitli} {...focusRing}
          onClick={() => { if (onReddet(metin, tur)) setDurum("reddedildi"); }}
          style={{ cursor: kilitli ? "not-allowed" : "pointer", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${kilitli ? PAL.line : PAL.inputLine}`, background: PAL.surf, color: kilitli ? PAL.mut2 : DERIN.kirmizi, ...TYPE.ui, fontWeight: 500 }}>
          Reddet
        </button>
      </div>
    </div>
  );
}
