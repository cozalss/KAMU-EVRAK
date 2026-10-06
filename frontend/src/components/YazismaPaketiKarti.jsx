/* YazismaPaketiKarti — gelen evraka karşılık üretilen YAZIŞMA PAKETİ, bir "DAĞITIM PLANI"
   paftası olarak.

   Bir dilekçe tek yazıyla kapanmaz (backend yazi/paket.py): talep başına birime havale,
   yetki dışı talepte yetkili makama gönderme (3071 m.5 / 4982 m.7) ve başvurana cevap ya da
   devir bilgisi. Tur 6 (jüri): dört eş gri kutu + her satırda "Oku" düğmesi bu mimariyi düz bir
   dosya listesi gibi okutuyordu. Şimdi akışın kendisi çizilir:

     [GELEN EVRAK künyesi] ──┬── Kurum içinde     → yazı fişleri
                             ├── Yetkili makama   → yazı fişleri
                             └── Başvurana        → yazı fişleri

   Dağıtım ipliği ıstampa moru (Görev 2 / resmî yazı rengi), kollar talep numarasını taşır.
   Fişin TAMAMI tıklanabilir (A4 görünümde açar) — ayrı "Oku" düğmesi yok. Makine kimliği
   ("t1") memura gösterilmez: "Talep 1". Damga KULLANILMAZ (ekran bütçesi hüküm kartına ait).
   Salt-okuma, additive: paketin gönderimi memur onayından geçer. */
import { useState } from "react";
import { MONO, DISPLAY, V, PAL, DERIN, ALFA, RAD, SP, TYPE, TNUM, NeonCard, Icon, focusRing } from "./neonUi.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { cleanDemoText, EVRAK_TR } from "../lib/evrakEtiket.js";
import { paketOgeleri, paketGosterilir, paketOzeti } from "../lib/yazismaPaketi.js";

/* Rol → dağıtım kolu. Sıra = resmî akış: önce kurum içi havale, sonra devir, en son başvuran. */
const KOLLAR = [
  { id: "ic", etiket: "Kurum içinde", alt: "birime havale", roller: ["havale", "olur", "dagitim"] },
  { id: "dis", etiket: "Yetkili makama", alt: "görev alanı dışı — gönderme", roller: ["devir"] },
  { id: "basvuran", etiket: "Başvurana", alt: "cevap / bilgi", roller: ["cevap", "devir_bilgi"] },
];
const talepEtiketi = (id) => { const n = String(id).match(/\d+/)?.[0]; return n ? `Talep ${Number(n)}` : String(id); };

const PAKET_CSS = `
.ke-paket{display:grid;grid-template-columns:minmax(0,230px) minmax(0,1fr);gap:0 28px;align-items:start}
.ke-paket-kollar{position:relative;display:grid;gap:18px;padding-left:22px}
.ke-paket-liste{margin:0;padding:0;display:grid;gap:8px}
.ke-paket-liste>li{display:grid}
.ke-paket-kagit{display:block}
.ke-paket-kollar::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:2px;border-radius:2px;background:color-mix(in srgb,var(--ke-v) 55%,transparent)}
.ke-paket-kunye{position:relative}
.ke-paket-kunye::after{content:"";position:absolute;top:30px;right:-28px;width:28px;height:2px;background:color-mix(in srgb,var(--ke-v) 55%,transparent)}
.ke-paket-kol{position:relative}
.ke-paket-kol::before{content:"";position:absolute;left:-22px;top:9px;width:14px;height:2px;background:color-mix(in srgb,var(--ke-v) 55%,transparent)}
.ke-paket-fis{position:relative;width:100%;text-align:left;cursor:pointer;display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:12px;align-items:center;
  padding:12px 14px;border-radius:10px;border:1px solid var(--ke-line);background:var(--ke-surf);color:inherit;font:inherit;
  box-shadow:var(--ke-sh-card);transition:border-color .14s ease,background .14s ease,transform .14s var(--ke-ease-out)}
.ke-paket-fis:hover{border-color:color-mix(in srgb,var(--ke-v) 45%,var(--ke-line));background:color-mix(in srgb,var(--ke-v) 4%,var(--ke-surf))}
.ke-paket-fis:hover .ke-paket-ok{transform:translateX(2px);color:var(--ke-derin-v)}
.ke-paket-ok{transition:transform .18s var(--ke-ease-out),color .14s ease;color:var(--ke-mut3)}
/* Geniş ekran: kollar YAN YANA — gövde yatay, her kol ona dikey bir dalla bağlanır. Dikey
   yığında 1920'de kollar ~920px'te bitiyor, kartın sağında ~320px ölü alan kalıyordu. */
@media (min-width: 1600px){
  .ke-paket-kollar{gap:18px 16px;padding:48px 0 0}
  .ke-paket-kollar{grid-template-columns:repeat(var(--kol-n,3),minmax(0,1fr))}
  .ke-paket-kollar::before{left:0;right:calc((100% - (var(--kol-n,3) - 1) * 16px) / var(--kol-n,3) - 16px);top:30px;bottom:auto;width:auto;height:2px}
  .ke-paket-kol::before{left:14px;top:-18px;width:2px;height:16px}
  .ke-paket-kol{display:flex;flex-direction:column}
  .ke-paket-liste{flex:1;align-content:start}
}
@media (max-width: 760px){
  .ke-paket{grid-template-columns:minmax(0,1fr);gap:16px 0}
  .ke-paket-kunye::after{top:auto;bottom:-16px;left:10px;right:auto;width:2px;height:16px}
  .ke-paket-kollar{margin-left:10px;padding-left:18px}
  .ke-paket-kollar::before{top:0}
  .ke-paket-kol::before{left:-18px;width:10px}
  .ke-paket-fis{grid-template-columns:minmax(0,1fr) auto;padding:12px}
  .ke-paket-fis > .ke-paket-kagit, .ke-paket-ok-metin, .ke-paket-kol-alt{display:none}
}
@media (prefers-reduced-motion: reduce){.ke-paket-fis:hover .ke-paket-ok{transform:none}}`;

/* Küçük A4 simgesi — yazının "kâğıt" olduğunu söyler (antet çizgisi + satırlar). */
function MiniKagit() {
  return (
    <svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true" className="ke-paket-kagit">
      <rect x=".5" y=".5" width="25" height="33" rx="1.5" fill="var(--kd-kagit, var(--ke-surf))" stroke="var(--ke-line-hi)" />
      <rect x="9" y="4.5" width="8" height="1.6" rx=".8" fill="var(--ke-mut3)" />
      {[10, 13.5, 17, 20.5].map((y, i) => <rect key={y} x="4.5" y={y} width={i === 3 ? 11 : 17} height="1.3" rx=".65" fill="var(--ke-line-hi)" />)}
      <rect x="15" y="26" width="7" height="1.3" rx=".65" fill="color-mix(in srgb, var(--ke-v) 60%, transparent)" />
    </svg>
  );
}

function GelenKunye({ r, adet }) {
  const u = r.bilgi_unsurlari || {};
  const satirlar = [["Tür", EVRAK_TR(r.evrak_turu)], ["Konu", cleanDemoText(u.konu || "")], ["Tarih", cleanDemoText(u.tarih || "")]]
    .filter(([, v]) => v && v !== "—");
  return (
    <div className="ke-paket-kunye" style={{ padding: "12px 14px 14px", borderRadius: RAD.card, background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
      <div style={{ ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3 }}>Gelen evrak</div>
      <div style={{ margin: "6px 0 10px", fontFamily: DISPLAY, fontSize: 26, lineHeight: "28px", fontWeight: 800, fontStretch: "112%", color: PAL.ink, ...TNUM }}>
        1 <span aria-hidden="true" style={{ display: "inline-block", fontSize: 20, fontWeight: 500, color: DERIN.V, transform: "translateY(-2px)", margin: "0 2px" }}>→</span> {adet}
        <span style={{ display: "block", ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginTop: 2 }}>dilekçe → resmî yazı</span>
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "4px 10px" }}>
        {satirlar.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={{ ...TYPE.meta, color: PAL.mut3 }}>{k}</dt>
            <dd style={{ margin: 0, ...TYPE.meta, color: PAL.ink2, fontWeight: 500, overflowWrap: "anywhere" }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function YaziFisi({ o, onAc }) {
  return (
    <li style={{ listStyle: "none" }}>
      <button type="button" className="ke-paket-fis" onClick={() => onAc(o)} {...focusRing} data-press=""
        aria-label={`${o.rolEtiket}${o.muhatap ? ` — ${o.muhatap}` : ""}: yazıyı A4 görünümde oku`}>
        <MiniKagit />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", ...TYPE.antet, textTransform: "uppercase", color: DERIN.V }}>{o.rolEtiket}</span>
          {o.muhatap && <span style={{ display: "block", marginTop: 3, fontFamily: DISPLAY, fontSize: 15, lineHeight: "20px", fontWeight: 700, fontStretch: "104%", color: PAL.ink, overflowWrap: "anywhere" }}>{o.muhatap}</span>}
          {o.konu && <span style={{ display: "block", marginTop: 2, ...TYPE.data, color: PAL.mut2 }}>Konu: {o.konu}</span>}
          {o.talepIds.length > 0 && (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {o.talepIds.map((t) => (
                <span key={t} style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", letterSpacing: ".02em", padding: "1px 7px", borderRadius: RAD.chip, background: ALFA(V), color: DERIN.V }}>{talepEtiketi(t)}</span>
              ))}
            </span>
          )}
        </span>
        <span className="ke-paket-ok" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4, ...TYPE.meta, fontWeight: 600 }}>
          <span className="ke-paket-ok-metin">Oku</span> <Icon.okSag width={15} height={15} />
        </span>
      </button>
    </li>
  );
}

export default function YazismaPaketiKarti({ r }) {
  const [acik, setAcik] = useState(null);
  if (!paketGosterilir(r)) return null;
  const ogeler = paketOgeleri(r);
  const kollar = KOLLAR.map((k) => ({ ...k, ogeler: ogeler.filter((o) => k.roller.includes(o.rol)) }));
  const diger = ogeler.filter((o) => !KOLLAR.some((k) => k.roller.includes(o.rol)));
  if (diger.length) kollar.push({ id: "diger", etiket: "Diğer", alt: "resmî yazı", ogeler: diger });
  const doluKollar = kollar.filter((k) => k.ogeler.length);
  return (
    <NeonCard title="Yazışma paketi" tag={paketOzeti(ogeler)} accent={V} icon={<Icon.send />} full>
      <style>{PAKET_CSS}</style>
      <p style={{ margin: `0 0 ${SP.l}px`, ...TYPE.data, color: PAL.mut2, maxWidth: 720 }}>
        Tek dilekçe, talep başına ayrı resmî yazıya dağıtıldı. Ana taslak panelinde ilk yazı görünür;
        her yazı memur onayından geçmeden gönderilmez.
      </p>
      <div className="ke-paket" aria-label="Yazışma paketi dağıtım planı">
        <GelenKunye r={r} adet={ogeler.length} />
        <div className="ke-paket-kollar" style={{ "--kol-n": doluKollar.length }}>
          {doluKollar.map((k) => (
            <section key={k.id} className="ke-paket-kol" aria-label={`${k.etiket}: ${k.ogeler.length} yazı`}>
              <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: SP.s, ...TYPE.antet, textTransform: "uppercase" }}>
                <span style={{ color: PAL.ink, fontWeight: 600 }}>{k.etiket}</span>
                <span className="ke-paket-kol-alt" style={{ color: PAL.mut3, textTransform: "none", letterSpacing: 0 }}>{k.alt}</span>
                <span style={{ marginLeft: "auto", color: PAL.mut3, ...TNUM }}>{String(k.ogeler.length).padStart(2, "0")}</span>
              </div>
              <ol className="ke-paket-liste">
                {k.ogeler.map((o) => <YaziFisi key={o.anahtar} o={o} onAc={setAcik} />)}
              </ol>
            </section>
          ))}
        </div>
      </div>
      <BelgeModal acik={!!acik} baslik={acik ? `${acik.rolEtiket}${acik.muhatap ? ` · ${acik.muhatap}` : ""}` : ""}
        metin={acik ? cleanDemoText(acik.metin) : ""} onKapat={() => setAcik(null)} />
    </NeonCard>
  );
}
