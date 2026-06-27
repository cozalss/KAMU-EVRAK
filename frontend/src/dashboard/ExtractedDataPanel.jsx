/* ExtractedDataPanel — ÇIKARILAN VERİ. Üstte öne-çıkan RİSK BANDI (trafik ışığı), altta
   tüm sonuç kartları (mevcut <ResultCards>; dark token'larla kararır). KVKK-maskeli rozeti.
   Tüm veri gerçek ProcessResponse. */
import React from "react";
import { ResultCards } from "../components/result-cards.jsx";

const BANT = {
  yesil:   { cls: "yesil",   val: "Düşük risk",  badge: "DÜŞÜK",  oneri: "yayına hazır" },
  sari:    { cls: "sari",    val: "Orta risk",   badge: "ORTA",   oneri: "memur incelemeli" },
  kirmizi: { cls: "kirmizi", val: "Yüksek risk", badge: "YÜKSEK", oneri: "uydurma şüphesi" },
};

function RiskBand({ risk }) {
  const bant = risk?.bant;
  const m = BANT[bant];
  if (!m) return null;
  return (
    <div className={"dash-riskband " + m.cls} role="status">
      <span className="dash-riskband-lights" aria-hidden="true">
        <i className="l-yesil" /><i className="l-sari" /><i className="l-kirmizi" />
      </span>
      <span className="dash-riskband-tx">
        <span className="dash-riskband-lbl">Risk Bandı</span>
        <span className="dash-riskband-val">{m.val}{risk.skor != null ? ` · skor ${risk.skor}` : ""}</span>
      </span>
      <span className="dash-riskband-badge">{m.badge}</span>
    </div>
  );
}

export function ExtractedDataPanel({ result, onToast, onDownload, downloading, canDownload, verify }) {
  return (
    <section className="dash-panel" aria-labelledby="dash-extract-h">
      <div className="dash-panel-head dash-extract-head">
        <h2 id="dash-extract-h" className="dash-panel-h">Çıkarılan Veri</h2>
        <span className="dash-kvkk"><span className="dot" aria-hidden="true" /> KVKK maskeli</span>
      </div>
      <div className="dash-panel-body">
        <RiskBand risk={result?.risk_metadata} />
        <div className="dash-cards">
          <ResultCards
            r={result}
            onToast={onToast}
            onDownload={onDownload}
            downloading={downloading}
            canDownload={canDownload}
            verify={verify}
          />
        </div>
      </div>
    </section>
  );
}

export default ExtractedDataPanel;
