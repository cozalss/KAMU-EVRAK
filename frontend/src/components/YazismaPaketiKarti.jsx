/* YazismaPaketiKarti — gelen evraka karşılık üretilen YAZIŞMA PAKETİNİN tamamı.

   Bir dilekçe tek yazıyla kapanmaz (backend yazi/paket.py): talep başına birime havale,
   yetki dışı talepte yetkili makama gönderme (3071 m.5 / 4982 m.7) ve başvurana cevap ya da
   devir bilgisi. Ana taslak paneli bunlardan yalnız ilkini gösterir; bu kart paketin geri
   kalanını OKUNUR kılar (salt-okuma, additive). Her yazı A4 görünümde açılır.

   Görsel dil "Antet & Damga": rol künyesi mono (makine verisi), muhatap satırı resmî yazıdaki
   gibi BÜYÜK harf; renkler neonUi token'larından. Rol rengi tek sinyal değil — rol adı metinle
   de yazılı. Damga atomu KULLANILMAZ (ekran başına ≤2 bütçesi hüküm kartına ait). */
import { useState } from "react";
import { MONO, T, V, PAL, DERIN, ALFA, RAD, SP, TYPE, TNUM, NeonCard, Icon, focusRing } from "./neonUi.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { cleanDemoText } from "./result-cards.jsx";
import { paketOgeleri, paketGosterilir, paketOzeti } from "../lib/yazismaPaketi.js";

// Rol → vurgu tonu: kurum içi işlem tükenmez mavisi, kurum dışına çıkan yazı ıstampa moru.
const ROL_TON = { havale: T, cevap: T, devir: V, devir_bilgi: V };

function PaketSatiri({ o, onAc }) {
  const ton = ROL_TON[o.rol] || T;
  return (
    <li style={{ listStyle: "none", padding: `${SP.m}px ${SP.m}px`, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf2, display: "flex", gap: SP.m, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <span style={{ display: "inline-block", ...TYPE.meta, fontFamily: MONO, fontWeight: 600, color: ton === V ? DERIN.V : DERIN.T,background: ALFA(ton), borderRadius: RAD.chip, padding: "2px 8px" }}>
          {o.rolEtiket}
        </span>
        {o.muhatap && (
          <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflowWrap: "anywhere" }}>{o.muhatap}</p>
        )}
        {o.konu && (
          <p style={{ margin: "2px 0 0", ...TYPE.data, color: PAL.mut2 }}>Konu: {o.konu}</p>
        )}
        {o.talepIds.length > 0 && (
          <p style={{ margin: "2px 0 0", ...TYPE.meta, color: PAL.mut3, fontFamily: MONO, ...TNUM }}>
            Talepler: {o.talepIds.join(", ")}
          </p>
        )}
      </div>
      <button type="button" onClick={() => onAc(o)} {...focusRing} data-press=""
        aria-label={`${o.rolEtiket}${o.muhatap ? ` — ${o.muhatap}` : ""} yazısını A4 görünümde aç`}
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, minHeight: 44, padding: "8px 14px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.ink, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
        <Icon.doc width={14} height={14} /> Oku
      </button>
    </li>
  );
}

export default function YazismaPaketiKarti({ r }) {
  const [acik, setAcik] = useState(null);
  if (!paketGosterilir(r)) return null;
  const ogeler = paketOgeleri(r);
  return (
    <NeonCard title="Yazışma paketi" tag={paketOzeti(ogeler)} accent={V} icon={<Icon.send />} full>
      <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.data, color: PAL.mut2 }}>
        Bu evrak için hazırlanan yazıların tamamı. Ana taslak panelinde ilk yazı görünür;
        diğerleri burada okunur ve memur onayından geçmeden gönderilmez.
      </p>
      <ol aria-label="Yazışma paketindeki yazılar" style={{ margin: 0, padding: 0, display: "grid", gap: SP.s }}>
        {ogeler.map((o) => <PaketSatiri key={o.anahtar} o={o} onAc={setAcik} />)}
      </ol>
      <BelgeModal acik={!!acik} baslik={acik ? `${acik.rolEtiket}${acik.muhatap ? ` · ${acik.muhatap}` : ""}` : ""}
        metin={acik ? cleanDemoText(acik.metin) : ""} onKapat={() => setAcik(null)} />
    </NeonCard>
  );
}
