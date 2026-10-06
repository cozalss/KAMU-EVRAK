/* CanliTaslakKarti — resmî yazı taslağı + HITL kararı (Görev 2 çıktısı). Tur 6'da
   CanliAjanAkisi'nden ayrıldı (dosya <800 kuralı); davranış birebir. Sonuç gelince sonuç
   çalışma alanının yan/alt yuvasına yerleşir. */
import { T, PAL, BANT, DERIN, ALFA, TYPE, RAD, SP, SH, focusRing, Icon, BuyutDugme } from "./neonUi.jsx";
import { cleanDemoText } from "./result-cards.jsx";
import { ParlaKenar } from "./gorsel.jsx";
import A4Belge from "./A4Belge.jsx";
import HukumMuhru from "./HukumMuhru.jsx";
import AltTaslakKarti from "./AltTaslakKarti.jsx";
import AltTaslakPager from "./AltTaslakPager.jsx";
import TurSecici from "./TurSecici.jsx";

const KART = { position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card };

/* HITL karar footer — belge kolonuyla hizalı. Tek primary (Onayla ve gönder, sağda); Düzenle
   secondary; Reddet SOLDA düşük-vurgu → sonuçlu eylem onaydan uzak (NN/g). */
function KararSatiri({ decisionReady, onayHazir, onRet, onEdit, onOnay }) {
  return (
    <div className="sc-decision-footer" style={{ borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div className="sc-action-row">
          <button onClick={onRet} disabled={!decisionReady} aria-label="Taslağı reddet" {...focusRing} data-press=""
            onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 14px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", background: "transparent", color: decisionReady ? DERIN.kirmizi : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.x /> Reddet</button>
          <span className="sc-action-spacer" />
          <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" {...focusRing} data-press=""
            onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
            style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 16px", minHeight: 42, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.edit /> Düzenle</button>
          <button onClick={onOnay} disabled={!onayHazir} aria-label="Taslağı onayla ve gönder" {...focusRing} data-press=""
            onMouseEnter={(e) => { if (onayHazir) e.currentTarget.style.background = DERIN.Th; }}
            onMouseLeave={(e) => { if (onayHazir) e.currentTarget.style.background = DERIN.T; }}
            style={{ cursor: onayHazir ? "pointer" : "not-allowed", padding: "9px 20px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", ...TYPE.ui, fontWeight: 600, color: onayHazir ? PAL.onAccent : PAL.mut2, background: onayHazir ? DERIN.T : PAL.press, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.send /> Onayla ve gönder</button>
        </div>
      </div>
    </div>
  );
}

function TekTaslak({ p }) {
  const { result, busy, draftMd, kararMuhru, onerilenTur, turUretiliyor, onTurSec, dayanakUretiliyor, onBuyut } = p;
  return (
    <div className="sc-draft-card" style={{ ...KART, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
      {/* Karar mührü — kenarda TEK TUR dolaşan ışık; renk kararı taşır ama tek sinyal değil. */}
      {kararMuhru && <ParlaKenar anahtar={kararMuhru} renk={kararMuhru === "onay" ? BANT.yesil.c : BANT.kirmizi.c} />}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.V }}><Icon.doc /></span>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 120 }}>Resmî yazı taslağı</span>
        {draftMd && <TurSecici secili={result?.yazi_turu} onerilen={onerilenTur} uretilen={turUretiliyor} onSec={onTurSec} />}
        {draftMd && <BuyutDugme onClick={onBuyut} label="Resmî yazı taslağını A4 görünümde büyüt" />}
      </div>
      <div className="sc-document-stage" style={{ background: PAL.surf2 }}>
        {draftMd ? (
          <div className="sc-document-paper" style={{ maxWidth: 860, margin: "0 auto" }}>
            <A4Belge metin={cleanDemoText(draftMd)} onAc={onBuyut} solgun={turUretiliyor || dayanakUretiliyor} sigdir="genislik"
              imzaKatmani={kararMuhru ? <HukumMuhru key={kararMuhru} karar={kararMuhru} /> : null} />
          </div>
        ) : (
          <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", gap: SP.s, justifyContent: "center", ...TYPE.data, color: PAL.mut2, border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.card, padding: SP.xxl, background: PAL.surf }}>
            <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: RAD.dot, background: busy ? T : PAL.mut2, animation: busy ? "nu-think 1.2s ease-in-out infinite" : "none" }} />
            {busy ? "Taslak, yazı taslağı masasında üretilecek…" : "Bu koşumda yazı taslağı üretilmedi."}
          </div>
        )}
      </div>
      <KararSatiri decisionReady={p.decisionReady} onayHazir={p.onayHazir} onEdit={p.onEdit}
        onRet={() => p.kararVer("ret", p.onReject)} onOnay={() => p.kararVer("onay", p.onApprove)} />
    </div>
  );
}

export default function CanliTaslakKarti(p) {
  const { altTaslaklar, runBase, altIdx, setAltIdx, onAltTurUret, onAltKarar, onAltDuzenle } = p;
  return (
    <>
      {altTaslaklar.length < 2 && <TekTaslak p={p} />}
      {/* Çok-konulu evrak: tek-taslak pager (oklar kartın kendi başlığında); tek alt-talep
          varsa doğrudan kart. Her kart mounted kalır — onay/red rozeti gezinmede kaybolmaz. */}
      {altTaslaklar.length >= 2 ? (
        <AltTaslakPager key={runBase} altTaslaklar={altTaslaklar} idx={altIdx} onIdx={setAltIdx}
          onTurUret={onAltTurUret} onKarar={onAltKarar} onDuzenle={onAltDuzenle} />
      ) : (
        altTaslaklar.map(({ a, sira }, i) => (
          <AltTaslakKarti key={sira} altTalep={a} sira={i + 1}
            onTurUret={(tur) => onAltTurUret(a, tur)}
            onOnaylaGonder={(metin, tur) => onAltKarar(a, metin, "onayla", sira, tur)}
            onReddet={(metin, tur) => onAltKarar(a, metin, "reddet", sira, tur)}
            onDuzenle={(metin, tur) => onAltDuzenle(a, metin, tur, sira)} />
        ))
      )}
    </>
  );
}
