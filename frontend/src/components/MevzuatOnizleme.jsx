/* MevzuatOnizleme — katalog aramasının altındaki "Madde içinde" önizlemesi (tur 9).
   Jüri: 'dilekçe' gibi az sonuçlu (≤3) ya da sonuçsuz katalog aramasında sonuç sütunu kısa
   kalıyor, 900 px yüksekliğin yarısı ölüyordu; iki arama kipi birbirine bağlı değildi.
   Aynı sorgu madde metinlerinde (BM25, salt okuma GET — LLM yok) aranır, ilk 3 madde kartı
   gösterilir ve "Tümünü gör" derin kipe geçer. Sonuç yoksa/hata varsa bölüm hiç basılmaz:
   önizleme bilgi değilse yer kaplamaz. Madde numarası/kanun adı ÜRETİLMEZ — sunucudan gelir. */
import { useEffect, useState } from "react";
import { Btn, Icon, PAL, TYPE, SP, TNUM } from "./neonUi.jsx";
import { DerinSonucSatir } from "./MevzuatDizin.jsx";

const GECIKME = 400;   // yazarken her tuşta istek atılmasın
const ADET = 3;

export default function MevzuatOnizleme({ q, onAc, onTumu }) {
  const [sonuc, setSonuc] = useState(null);   // null | {q, sonuclar}
  useEffect(() => {
    const s = String(q || "").trim();
    if (s.length < 3) { setSonuc(null); return undefined; }
    let iptal = false;
    const t = setTimeout(() => {
      fetch(`/mevzuat/derin-ara?q=${encodeURIComponent(s)}&limit=30`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!iptal) setSonuc(d && Array.isArray(d.sonuclar) ? { q: s, sonuclar: d.sonuclar } : null); })
        .catch(() => { if (!iptal) setSonuc(null); });
    }, GECIKME);
    return () => { iptal = true; clearTimeout(t); };
  }, [q]);
  if (!sonuc?.sonuclar.length) return null;
  const n = sonuc.sonuclar.length;
  return (
    <section aria-labelledby="mv-onizleme-h" style={{ marginTop: SP.xxl, paddingTop: SP.l, borderTop: `1px solid ${PAL.ink}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, flexWrap: "wrap", marginBottom: SP.m }}>
        <h2 id="mv-onizleme-h" style={{ margin: 0, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
          Madde içinde · <span style={{ color: PAL.ink2, ...TNUM }}>{n}{n >= 30 ? "+" : ""}</span> eşleşme
        </h2>
        <span style={{ ...TYPE.meta, color: PAL.mut2 }}>“{sonuc.q}” madde metinlerinde de geçiyor</span>
        <span style={{ marginLeft: "auto" }}>
          <Btn onClick={onTumu}><Icon.search width={14} height={14} /> Tümünü gör</Btn>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: SP.s, alignContent: "start" }}>
        {sonuc.sonuclar.slice(0, ADET).map((s, i) => <DerinSonucSatir key={`${s.dosya}-${s.madde_no}-${s.madde_tur ?? "madde"}`} s={s} onAc={onAc} sira={i} q={sonuc.q} />)}
      </div>
    </section>
  );
}
