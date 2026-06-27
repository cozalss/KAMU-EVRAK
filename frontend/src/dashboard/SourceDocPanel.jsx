/* SourceDocPanel — KAYNAK BELGE. Maskeli kaynak metin + çıkarılan unsurların sarı vurgusu.
   Veri: result.kanit_metadata = {metin (PII-maskeli), spanlar:[{start,end,label}]}. Bu HER İKİ
   yolda da gelir (kanit_baglama node). Sonuç gelmeden örnek yolda evrakText (maskesiz ham) gösterilir;
   dosya yolunda ham metin sunucuda tutulur (PII koruması) → işleniyor notu. XSS-güvenli React <mark>. */
import React, { useMemo } from "react";
import { cleanDemoText } from "../components/result-cards.jsx";
import { Icon } from "../components/icons.jsx";

// Maskeli metni span'lara göre düz/vurgulu segmentlere böl (KanitVurguCard ile aynı mantık; çakışma backend'de elendi).
function buildSegments(metin, spanlar) {
  const segs = [];
  let cur = 0;
  for (const sp of spanlar) {
    const s = Math.max(cur, Math.min(metin.length, sp.start | 0));
    const e = Math.max(s, Math.min(metin.length, sp.end | 0));
    if (s > cur) segs.push({ t: metin.slice(cur, s) });
    if (e > s) segs.push({ t: metin.slice(s, e), mark: true, label: sp.label });
    cur = e;
  }
  if (cur < metin.length) segs.push({ t: metin.slice(cur) });
  return segs;
}

export function SourceDocPanel({ result, evrakText, busy }) {
  const km = result?.kanit_metadata;
  const metin = typeof km?.metin === "string" ? km.metin : "";
  const spanlar = Array.isArray(km?.spanlar) ? km.spanlar : [];
  const segs = useMemo(() => (metin ? buildSegments(metin, spanlar) : []), [metin, spanlar]);

  let body;
  if (segs.length) {
    body = (
      <pre className="dash-source-doc">
        {segs.map((sg, i) => sg.mark
          ? <mark className="dash-pii" key={i} title={sg.label}>{sg.t}</mark>
          : <React.Fragment key={i}>{sg.t}</React.Fragment>)}
      </pre>
    );
  } else if (evrakText) {
    body = <pre className="dash-source-doc">{cleanDemoText(evrakText)}</pre>;
  } else {
    body = (
      <div className="dash-source-empty">
        <Icon.shieldCheck aria-hidden="true" />
        <p>{busy
          ? "Kaynak metin okunuyor; çıkarılan unsurlar birazdan işaretlenecek."
          : "Kaynak metin, kişisel veri koruması için sunucuda maskelenerek işlenir. Çıkarılan unsurlar işleme tamamlandığında burada vurgulanır."}</p>
      </div>
    );
  }

  return (
    <section className="dash-panel dash-source" aria-labelledby="dash-source-h">
      <div className="dash-panel-head">
        <h2 id="dash-source-h" className="dash-panel-h">Kaynak Belge</h2>
        {spanlar.length > 0 && (
          <span className="dash-panel-tag"><span className="dot" aria-hidden="true" /> {spanlar.length} unsur işaretli</span>
        )}
      </div>
      <div className="dash-panel-body">{body}</div>
    </section>
  );
}

export default SourceDocPanel;
