/* CanliMetro — canlı koşum sahnesinin "HAVALE PUSULASI" (Antet & Damga, 2026-10).
   Eski metro (ışık kuyruklu, glow'lu raylar) bir SaaS boru hattı gibi okunuyordu. Yeni dil,
   kamu evrakının kendi nesnesinden gelir: evrak masadan masaya gezen bir havale pusulasıyla
   dolaşır; her masa işini bitirince satırına PARAF atar. Burada:
   · Her GERÇEKTEN İŞ YAPAN adım bittiği anda satırına mürekkepli paraf damgası (baş harfler)
     basılır + mono süre yazılır. "gerekmedi" → ince GEREKMEDİ notu, "atlandi" → kesikli
     ATLANDI notu; ikisi de paraf ALMAZ (CLAUDE.md §9 — koşmayan/iş yapmayan tamamlandı sayılmaz).
     Tek durum kaynağı akisKatman.adimDurumu (§10).
   · Sol kenardaki mürekkep hattı adım bittikçe aşağı doğru KENDİNİ ÇİZER (scaleY, compositor).
     Eşzamanlı blok içi bağ kesikli; blok ve sıra yalnız start.katmanlar'dan (§8).
   · ParalelBaslik yalnız ≥2 üye GERÇEKTEN koştuysa basılır (olgu).
   Glow, ışık kuyruğu, aurora SÖKÜLDÜ (yeni dil: "glow yok"). Hareket = bilgi: paraf vuruşu,
   hat çizimi, aktif masanın yavaş dönen kesikli paraf yuvası. reduced-motion global kuralı
   hepsini söndürür; statik hâl aynı bilgiyi taşır. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { MONO, DISPLAY, T, V, PAL, BANT, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SR_ONLY, focusRing, Icon, Btn } from "./neonUi.jsx";
import { gorevFaz } from "../lib/pipelinePhases.js";
import { adimDurumu, kostuMu, ortusenAdimlar } from "../lib/akisKatman.js";
import { duvarMs, fmtSn, grupDuvarMs, akisDuvarMs, hataSebebi, kosumSaati } from "../lib/canliBicim.js";
import { parafUret } from "./agent-flow/topology.js";

/* Sahneye özgü keyframe'ler (ke-e-*). Ortak NEON_KEYFRAMES başka sahibin dosyasında; burada
   yerel. Tarayıcı çizgisi reduced-motion'da tamamen gizlenir (global kural animasyonu söndürür
   ama çizgi statik olarak sayfanın dibinde kalırdı). */
export const SAHNE_CSS = `
@keyframes ke-e-paraf{0%{opacity:0;transform:rotate(var(--egim)) scale(1.9)}55%{opacity:1;transform:rotate(var(--egim)) scale(.9)}100%{opacity:1;transform:rotate(var(--egim)) scale(1)}}
@keyframes ke-e-tik{0%{transform:scaleY(.2)}60%{transform:scaleY(1.12)}100%{transform:scaleY(1)}}
@keyframes ke-e-tara{from{transform:translateY(-100%)}to{transform:translateY(0)}}
@keyframes ke-e-fosfor{from{opacity:.3}to{opacity:1}}
@keyframes ke-e-yaz{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes ke-e-cizgi{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes ke-e-nefes{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes ke-e-kayit{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes ke-e-masa{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ke-e-tarayici{display:none}}
/* Mobil güvenli alt pay: sabit "Asistan" düğmesi pusulanın son satırının paraf sütununu
   örtüyordu (390px bulgusu) — sahne dibinde düğme yüksekliği + nefes kadar boşluk. */
.ke-e-sahne{padding-bottom:calc(40px + env(safe-area-inset-bottom, 0px))}
@media (max-width: 720px){.ke-e-sahne{padding-bottom:calc(104px + env(safe-area-inset-bottom, 0px))}}
`;

/* OLUK — hat sütunu. Tur 8: 28 px'lik olukta üç paralel şerit 11 px aralıkla 1x DPR'de
   birbirine yapışıyordu; oluk 36 px'e açıldı (şerit aralığı 12 px). Tüm satırlar aynı oluğu
   kullanır → masa adları paralel blokta da aynı x'te başlar (cetvel hizası). */
const OLUK = 36, OC = OLUK / 2;
const HAT = { x: OC - 1, w: 2, merkez: 18 };
/* Süre etiketleri TEK SAATTEN (lib/canliBicim.duvarMs): izleyicinin gördüğü t1−t0. */

/* CANLI SÜRE SAYACI — çalışan masanın gerçek geçen süresi (backend "başladı" olayının t0'ı →
   şimdi). GitHub Actions iş grafiğindeki "in progress · 12s" dersi: süre, çalışan adımın
   yanında akar; bitince aynı yerde aynı saatle (t1−t0) donar. Rakam DÖNMEZ (NumberFlow
   yok): saniyede 10 kez değişen bir değeri canlandırmak gürültüdür (Emil sıklık yasası) —
   sabit genişlikli rakamla (tnum) yalnız metin değişir, satır titremez. */
export function CanliSure({ runBase, t0, style = null }) {
  const [, setTik] = useState(0);
  const gecerli = Number.isFinite(runBase) && runBase > 0 && Number.isFinite(t0);
  useEffect(() => {
    if (!gecerli) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [gecerli]);
  if (!gecerli) return null;
  const ms = Math.max(0, performance.now() - runBase - t0);
  return <span style={{ fontFamily: MONO, ...TNUM, whiteSpace: "nowrap", ...style }}>{(ms / 1000).toFixed(1).replace(".", ",")} sn</span>;
}

/* Mürekkep hattı parçası — zemin hairline üstünde hat rengi YUKARIDAN AŞAĞI kendini çizer.
   kesik=true: EŞZAMANLI adımlar arası bağ (aralarında sıra yok → düz çizgi iddia etmez). */
const Ray = ({ top, height, bottom, filled, col, kesik = false, sure = 420 }) => (
  <span aria-hidden="true" style={{ position: "absolute", left: HAT.x, width: HAT.w, top, height, bottom, background: kesik ? `repeating-linear-gradient(180deg, ${PAL.lineHi} 0 3px, transparent 3px 7px)` : PAL.line, overflow: "hidden" }}>
    <span style={{ position: "absolute", inset: 0, background: kesik ? `repeating-linear-gradient(180deg, ${col} 0 3px, transparent 3px 7px)` : col, transformOrigin: "top", transform: filled ? "scaleY(1)" : "scaleY(0)", transition: `transform ${sure}ms var(--ke-ease-in-out)` }} />
  </span>
);

/* Hat üstündeki düğüm — durum kipine göre biçim (renk tek sinyal değil). */
function HatDurak({ durum, col, x = null }) {
  const boy = x == null ? 12 : 10;    // şeritteki düğüm küçük: üç şerit arasında nefes kalsın
  const orta = { position: "absolute", left: x == null ? 0 : x - OC, top: HAT.merkez - boy / 2, width: OLUK, display: "flex", justifyContent: "center" };
  const taban = { width: boy, height: boy, borderRadius: RAD.dot, boxSizing: "border-box" };
  if (durum === "calisti") return <span aria-hidden="true" style={orta}><span key="c" style={{ ...taban, background: col, boxShadow: `0 0 0 3px ${PAL.surf}`, animation: "nu-pop .35s var(--ke-ease-spring) both" }} /></span>;
  if (durum === "hata") return <span aria-hidden="true" style={orta}><span style={{ ...taban, background: BANT.kirmizi.c, boxShadow: `0 0 0 3px ${PAL.surf}` }} /></span>;
  if (durum === "kesildi" || durum === "yarida") return (
    <span aria-hidden="true" style={orta}>
      <span style={{ ...taban, border: `2px solid ${BANT.kirmizi.c}`, background: PAL.surf, boxShadow: `0 0 0 3px ${PAL.surf}`, display: "flex", alignItems: "center", justifyContent: "center", color: DERIN_OF(BANT.kirmizi.c) }}>
        <span style={{ width: 6, height: 1.5, background: "currentColor", transform: "rotate(45deg)", position: "absolute" }} />
        <span style={{ width: 6, height: 1.5, background: "currentColor", transform: "rotate(-45deg)", position: "absolute" }} />
      </span>
    </span>
  );
  if (durum === "isleniyor") return (
    <span aria-hidden="true" style={orta}>
      <span style={{ ...taban, border: `2px solid ${col}`, background: PAL.surf, boxShadow: `0 0 0 3px ${PAL.surf}, 0 0 0 5px ${ALFA(col)}`, animation: "ke-e-nefes 1.4s ease-in-out infinite" }} />
    </span>
  );
  // gerekmedi: içi boş düz halka · atlandi: kesikli halka · bekliyor: küçük nokta
  if (durum === "gerekmedi" || durum === "atlandi") return <span aria-hidden="true" style={orta}><span style={{ ...taban, border: `1.5px ${durum === "atlandi" ? "dashed" : "solid"} ${PAL.lineHi}`, background: PAL.surf }} /></span>;
  return <span aria-hidden="true" style={{ ...orta, top: HAT.merkez - 3 }}><span style={{ width: 6, height: 6, borderRadius: RAD.dot, background: PAL.lineHi, boxShadow: `0 0 0 3px ${PAL.surf}` }} /></span>;
}

/* PARAF — masanın imzası. Yalnız "calisti" adımı mürekkepli mühür alır; diğer kipler ince,
   mürekkepsiz notlardır. Eğim adım kimliğinden deterministik (her paraf biraz farklı oturur). */
function egimOf(id) { let x = 0; for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 997; return (x % 15) - 9; }
const NOT = { ...TYPE.damga, fontSize: 9, lineHeight: "10px", letterSpacing: ".08em", padding: "3px 5px", borderRadius: 3, whiteSpace: "nowrap" };
export function Paraf({ a, durum, col }) {
  if (durum === "calisti") {
    const egim = egimOf(a.id);
    return (
      <span aria-hidden="true" style={{ "--egim": `${egim}deg`, width: 32, height: 32, borderRadius: RAD.dot, border: `1.5px solid ${DERIN_OF(col)}`, outline: `1px solid ${DERIN_OF(col)}`, outlineOffset: 2, color: DERIN_OF(col), display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: 11, letterSpacing: ".02em", transform: `rotate(${egim}deg)`, opacity: 0.92, animation: "ke-e-paraf .5s var(--ke-ease-out) both", flexShrink: 0 }}>
        {parafUret(a.id, a.label)}
      </span>
    );
  }
  if (durum === "gerekmedi") return <span aria-hidden="true" style={{ ...NOT, color: PAL.mut2, border: `1px solid ${PAL.lineHi}` }}>Gerekmedi</span>;
  if (durum === "atlandi") return <span aria-hidden="true" style={{ ...NOT, color: PAL.mut2, border: `1px dashed ${PAL.lineHi}` }}>Atlandı</span>;
  if (durum === "hata") return <span aria-hidden="true" style={{ ...NOT, color: DERIN_OF(BANT.kirmizi.c), border: `1.5px solid ${BANT.kirmizi.c}` }}>Hata</span>;
  // DURDU kipleri (koşum hata ile kesildi): "kesildi" = akışın durduğu masa (paraf yok, iş
  // bitmedi); "islenmedi" = sonrakiler. İkisi de tamamlandı/atlandı DEĞİL — olgu: bu koşumda
  // bu masalara iş ulaşmadı (CLAUDE.md §9).
  if (durum === "kesildi") return <span aria-hidden="true" style={{ ...NOT, color: DERIN_OF(BANT.kirmizi.c), border: `1.5px dashed ${BANT.kirmizi.c}` }}>Kesildi</span>;
  if (durum === "yarida") return <span aria-hidden="true" style={{ ...NOT, color: DERIN_OF(BANT.kirmizi.c), border: `1.5px dashed ${BANT.kirmizi.c}` }}>Yarıda</span>;
  if (durum === "islenmedi") return <span aria-hidden="true" style={{ ...NOT, color: PAL.mut3, border: `1px dotted ${PAL.lineHi}` }}>İşlenmedi</span>;
  if (durum === "isleniyor") return (
    <span aria-hidden="true" style={{ display: "inline-block", width: 32, height: 32, boxSizing: "border-box", borderRadius: RAD.dot, border: `1.5px dashed ${col}`, flexShrink: 0, animation: "nu-spin 6s linear infinite" }} />
  );
  return <span aria-hidden="true" style={{ display: "inline-block", width: 32, height: 32, boxSizing: "border-box", borderRadius: RAD.dot, border: `1px dotted ${PAL.lineHi}`, flexShrink: 0 }} />;
}

/* Hat başlığı — antet dilinde: "I. ANLAMA" künyesi + kendi ilerleme hattı + sayaç.
   Mühür rakamı hat hizmete girince mürekkeple dolar. */
function HatTerminal({ n, col, count, doneN, sure, girisAktif, tamam, ilerleme, devir }) {
  return (
    <div style={{ position: "relative", paddingBottom: SP.s }}>
      <Ray top={26} bottom={0} filled={girisAktif} col={col} />
      {devir && (
        <span aria-hidden="true" style={{ position: "absolute", top: 13, left: -SP.xxl + SP.s, width: SP.xxl - SP.s - 6, height: 0, borderTop: `2px dashed ${girisAktif ? col : PAL.lineHi}`, transition: "border-color .3s ease" }} />
      )}
      {/* Tek satır (390px'te sayaç başlığın altına kırılıyordu): çizgi esner/kaybolur, künye
          ve sayaç asla kırılmaz. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", columnGap: SP.m, minHeight: 28, minWidth: 0 }}>
        <span style={{ width: OLUK, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <span key={girisAktif ? "on" : "off"} aria-hidden="true" style={{ width: 26, height: 26, boxSizing: "border-box", borderRadius: RAD.dot, background: girisAktif ? col : PAL.surf, border: `2px solid ${col}`, color: girisAktif ? PAL.onAccent : DERIN_OF(col), fontFamily: DISPLAY, fontWeight: 800, fontStretch: "120%", fontSize: n === 2 ? 11 : 13, lineHeight: "22px", textAlign: "center", ...TNUM, transition: "background .25s ease", animation: girisAktif ? "nu-pop .4s var(--ke-ease-spring) both" : "none" }}>{gorevFaz(n).no}</span>
        </span>
        <span style={{ ...TYPE.antet, color: DERIN_OF(col), flexShrink: 0, textTransform: "uppercase" }}>{gorevFaz(n).ad}</span>
        <span aria-hidden="true" style={{ flex: "1 1 0", height: 1, background: PAL.line, overflow: "hidden", minWidth: 0 }}>
          <span style={{ display: "block", width: "100%", height: "100%", background: col, transformOrigin: "left", transform: `scaleX(${ilerleme || 0})`, transition: "transform .5s var(--ke-ease-in-out)" }} />
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: tamam ? DERIN_OF(col) : PAL.mut2, flexShrink: 0, whiteSpace: "nowrap", ...TNUM, display: "inline-flex", alignItems: "center", gap: SP.xs }}>
          {tamam && <Icon.check width={11} height={11} />}
          {doneN}/{count}{sure ? ` · ${sure}` : ""}
        </span>
      </div>
    </div>
  );
}

/* Durdu koşumunda bekleyen masanın kipi (tek durum kaynağı adimDurumu, §10; yalnız durdu
   koşumda ayrıntılanır):
   · yarida    — backend bu masanın BAŞLADIĞINI söyledi (t0 damgası var) ama koşum kesildi.
                 Tur 8 bulgusu: 1,5 sn çalışmış paralel kardeş "akış bu masaya gelmeden durdu"
                 diye yazılıyordu — olgu yanlıştı (§9). Damga = backend'in "başladı" olayı.
   · kesildi   — akışın durduğu ilk BAŞLAMAMIŞ masa · islenmedi — sonrakiler. */
export function sahneDurumu(a, durdu) {
  const d = adimDurumu(a);
  if (!durdu || d !== "bekliyor") return d;
  if (Number.isFinite(a.t0)) return "yarida";
  return a.sira === durdu.kesim ? "kesildi" : "islenmedi";
}

const ALT_YAZI = {
  kesildi: () => "akış bu masaya gelmeden durdu", islenmedi: (a) => a.desc || "—",
  atlandi: () => "bu koşumda çalışmadı", gerekmedi: (a) => a.out || "gerekmedi",
  calisti: (a) => a.out || "tamamlandı", isleniyor: (a) => a.desc || "çalışıyor…",
  hata: () => "işini tamamlayamadı — akış bu masada durdu",
};
const SR_YAZI = {
  kesildi: "işlem bu adıma gelmeden durdu", islenmedi: "işlem durduğu için işlenmedi", atlandi: "bu koşumda çalışmadı",
  gerekmedi: "bu belgede gerekmedi", isleniyor: "şu an işleniyor", hata: "hata: adım başarısız, akış burada durdu",
};
function altYaziOf(a, durum, ms) {
  if (durum === "yarida") return `yarıda kesildi${Number.isFinite(ms) ? ` · ${fmtSn(ms)} çalıştı` : ""}`;
  return (ALT_YAZI[durum] || ((x) => x.desc || "—"))(a);
}
function altRenkOf(durum, col, bantC) {
  if (durum === "hata" || durum === "kesildi" || durum === "yarida") return DERIN_OF(BANT.kirmizi.c);
  if (durum === "calisti") return bantC ? DERIN_OF(bantC) : PAL.mut;
  if (durum === "isleniyor") return DERIN_OF(col);
  return durum === "islenmedi" ? PAL.mut3 : PAL.mut2;
}

/* KESİM ÇİZGİSİ (tur 8 imza) — durdu koşumunda kesimin yaşandığı masanın ÜSTÜNE resmî
   tutanaktaki "buraya kadar işlendi" notası: mürekkep hattını kesen ince kesikli kırmızı çizgi
   + mono "DURDU · ss:dd:sn" künyesi. Saat hatalı masanın gerçek bitiş damgasından (t1). */
export function KesimCizgisi({ saat }) {
  return (
    <div aria-hidden="true" style={{ position: "relative", display: "flex", alignItems: "center", gap: SP.s, height: 20, ...TYPE.antet, fontSize: 10, color: DERIN_OF(BANT.kirmizi.c), textTransform: "uppercase", animation: "ke-e-masa .22s var(--ke-ease-out) both" }}>
      <span style={{ width: OLUK - 4, borderTop: `1.5px dashed ${BANT.kirmizi.c}`, flexShrink: 0 }} />
      <span style={{ whiteSpace: "nowrap", ...TNUM }}>Durdu{saat ? ` · ${saat}` : ""}</span>
      <span style={{ flex: 1, borderTop: `1.5px dashed ${BANT.kirmizi.c}` }} />
    </div>
  );
}

/* Pusula satırı — oluk (hat + düğüm) · sıra no · masa adı + not · süre · paraf. Satır
   TIKLANABİLİR (adım detay modalı). Zemin vurgusu OLGUNUN YERİNDE: çalışan masa mürekkep
   tinti, HATALI masa ACELE kırmızısı tint + sol kırmızı kenar (tur 8: vurgu kesilen kardeşteydi,
   göz hatanın yerini değil yan etkisini görüyordu). Pasif (işlenmedi) satır opaklıkla değil
   ayrı metin tonuyla (mut3, AA) + noktalı düğümle anlatılır. */
function HatIstasyon({ a, col, risk, hasTop, topFill, hasBot, onDetay, kesikTop = false, kesikBot = false, durdu = null, runBase = 0, serit = null, zaman = null }) {
  const durum = sahneDurumu(a, durdu);
  const done = a.status === "done", active = durum === "isleniyor", err = durum === "hata";
  const kirmiziAd = durum === "kesildi" || durum === "yarida" || err;
  const nodeBant = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant] : null;
  const durakCol = a.id === "risk_guard" && done ? (nodeBant || risk).c : col;
  const ms = duvarMs(a);
  const sure = done && durum !== "gerekmedi" ? fmtSn(ms) : null;
  // Hat çizim süresi adımın gerçek süresiyle orantılı (kısa adım çabuk, uzun adım ağır çizilir).
  const cizim = Number.isFinite(ms) ? Math.round(Math.min(900, Math.max(260, ms / 6))) : 420;
  const zemin = active ? ALFA(col) : err ? ALFA(BANT.kirmizi.c) : "transparent";
  return (
    <div role="button" tabIndex={0} onClick={onDetay} title={`${a.label} — adım detayını aç`}
      aria-current={active ? "step" : undefined}
      {...focusRing}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetay(); } }}
      onMouseEnter={(e) => { if (!active && !err) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = zemin; }}
      data-satir={a.id}
      style={{ cursor: "pointer", position: "relative", display: "grid", gridTemplateColumns: `${OLUK}px minmax(0,1fr) auto`, columnGap: SP.m, alignItems: "center", padding: "7px 6px 7px 0", borderBottom: `1px solid ${PAL.line}`, background: zemin, boxShadow: err ? `inset 2px 0 0 ${BANT.kirmizi.c}` : "none", transition: "background .2s ease" }}>
      <div style={{ position: "relative", alignSelf: "stretch", minHeight: 40 }}>
        {serit == null && hasTop && <Ray top={-8} height={HAT.merkez + 8} filled={topFill} col={col} kesik={kesikTop} sure={cizim} />}
        {serit == null && hasBot && <Ray top={HAT.merkez} bottom={-8} filled={done} col={col} kesik={kesikBot} sure={cizim} />}
        <HatDurak durum={durum} col={durakCol} x={serit} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, ...TNUM, flexShrink: 0 }}>{String(a.sira + 1).padStart(2, "0")}</span>
          <span style={{ ...TYPE.ui, fontWeight: active || kirmiziAd ? 600 : 500, color: active || done || kirmiziAd ? PAL.ink : PAL.mut, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
          {/* Süre masa adının hizasında (tur 8): alt satırda çıktı metniyle yarışıp onu iki
              satıra kırıyordu; artık çıktı tüm genişliği kullanır. */}
          {sure && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, flexShrink: 0, ...TNUM }}>{sure}</span>}
          {active && <CanliSure runBase={runBase} t0={a.t0} style={{ marginLeft: "auto", fontSize: 11, lineHeight: "16px", fontWeight: 600, color: DERIN_OF(col), flexShrink: 0 }} />}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginTop: 1, paddingLeft: 23, minWidth: 0 }}>
          <span style={{ ...TYPE.meta, color: altRenkOf(durum, col, nodeBant ? nodeBant.c : (a.id === "risk_guard" ? risk.c : null)), overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", minWidth: 0 }}>{altYaziOf(a, durum, durum === "yarida" && Number.isFinite(durdu?.t) && Number.isFinite(a.t0) ? Math.max(0, durdu.t - a.t0) : ms)}</span>
        </div>
        {zaman && <ZamanCubugu z={zaman} col={durakCol} canli={active} />}
        <span style={SR_ONLY}>
          {durum === "yarida" ? "işlem bu adım çalışırken kesildi" : durum === "calisti" ? `tamamlandı${sure ? ` · ${sure}` : ""}` : SR_YAZI[durum] || "sırada"}
        </span>
      </div>
      <span style={{ display: "flex", justifyContent: "center", minWidth: 40 }}>
        <Paraf a={a} durum={durum} col={durakCol} />
      </span>
    </div>
  );
}

/* Hat sonu — pusulanın kapanış çizgisi; hat tamamlanınca çift çizgi (antet kapanışı) çizilir. */
const HatSon = ({ col, done }) => (
  <div aria-hidden="true" style={{ position: "relative", height: 14 }}>
    <Ray top={0} height={8} filled={done} col={col} />
    <span style={{ position: "absolute", top: 8, left: HAT.x - 5, width: 12, height: 4, borderTop: `2px solid ${done ? col : PAL.lineHi}`, borderBottom: `1px solid ${done ? col : PAL.lineHi}`, transition: "border-color .3s ease-out" }} />
  </div>
);

/* ——— PARALEL BLOK: çatal → yan yana şeritler → birleşme (tur 6, jüri fırsatı #2) ———
   Eskiden eşzamanlı masalar tek hatta alt alta diziliyor, paralellik yalnız "∥ 3 masa aynı
   anda" METNİYLE anlatılıyordu; göz sırayı okuyordu. Artık hat bir demiryolu şeması gibi
   ÇATALLANIR: blok başında her masa kendi şeridine ayrılır, blok sonunda şeritler yeniden
   birleşir. Sözleşmeler:
   · Blok yapısı YALNIZ start.katmanlar'dan gelir (gruplar; §8). Harita yoksa blok yok.
   · Her şeridin dolumu KENDİ masasının olgusuyla ilerler: üst kol masa "başladı" deyince,
     alt kol masa bitince. Atlanan / işlenmeyen masanın şeridi kesikli ve boş kalır (§9).
   · "aynı anda" iddiası olguya bağlı (ortusenAdimlar / ≥2 koşan) — birleşme notunda.
   · Zaman çubuğu: blok içindeki her masanın GERÇEK [t0, t1) aralığı (usePipeline damgaları)
     ortak bir pencerede; çubuklar üst üste biniyorsa masalar gerçekten aynı anda koştu. */
function useTik(ms) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!ms) return undefined;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/* Ortak zaman penceresi — başlamış masaların [t0, t1|şimdi) aralıkları 0..1'e ölçeklenir.
   ≥2 masa başlamadıysa karşılaştırma anlamsız → her masa için null. */
export function zamanPenceresi(items, simdiMs) {
  const basladi = (a) => ["active", "done", "error"].includes(a?.status) && Number.isFinite(a.t0);
  const bitis = (a) => (a.status === "active" || !Number.isFinite(a.t1) ? simdiMs : a.t1);
  const olgu = items.filter(basladi);
  if (olgu.length < 2) return items.map(() => null);
  const min = Math.min(...olgu.map((a) => a.t0));
  const genis = Math.max(1, Math.max(...olgu.map(bitis)) - min);
  return items.map((a) => {
    if (!basladi(a)) return null;
    const bas = (a.t0 - min) / genis;
    return { bas, bit: Math.min(1, Math.max((bitis(a) - min) / genis, bas + 0.015)) };
  });
}

function ZamanCubugu({ z, col, canli }) {
  return (
    <div aria-hidden="true" style={{ position: "relative", height: 5, marginTop: 7, marginLeft: 23, marginRight: 4, background: PAL.press, borderRadius: 3 }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, left: `${z.bas * 100}%`, width: `${(z.bit - z.bas) * 100}%`, background: col, opacity: canli ? 1 : 0.62, borderRadius: 3 }} />
    </div>
  );
}

const SERIT_BOY = { ust: 12, alt: 14 };
function SeritCizimi({ items, xs, ys, H, col, durdu }) {
  return (
    <svg aria-hidden="true" width={OLUK} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      {items.map((a, i) => {
        const x = xs[i], y = ys[i];
        if (!Number.isFinite(y)) return null;
        const ust = `M${OC} 0 C${OC} 7 ${x} ${SERIT_BOY.ust - 6} ${x} ${SERIT_BOY.ust} L${x} ${y}`;
        const alt = `M${x} ${y} L${x} ${H - SERIT_BOY.alt} C${x} ${H - 7} ${OC} ${H - 6} ${OC} ${H}`;
        const d = sahneDurumu(a, durdu);
        const tire = d === "atlandi" ? "3 4" : d === "islenmedi" || d === "kesildi" ? "1 3" : undefined;
        const basladi = a.status !== "pending" && a.status !== "atlandi";
        const ms = duvarMs(a);
        const sure = Number.isFinite(ms) ? Math.round(Math.min(900, Math.max(260, ms / 6))) : 420;
        const dolgu = (dolu, gec) => ({ stroke: col, strokeWidth: 2.5, fill: "none", strokeDasharray: "1 1", strokeDashoffset: dolu ? 0 : 1, transition: `stroke-dashoffset ${gec}ms var(--ke-ease-in-out)` });
        const zemin = { stroke: PAL.lineHi, strokeWidth: 2.5, fill: "none", strokeDasharray: tire };
        return (
          <g key={a.id}>
            <path d={ust} style={zemin} />
            <path d={alt} style={zemin} />
            {!tire && <path d={ust} pathLength="1" style={dolgu(basladi, 300)} />}
            {!tire && <path d={alt} pathLength="1" style={dolgu(a.status === "done", sure)} />}
          </g>
        );
      })}
    </svg>
  );
}

/* Birleşme notu — İDDİA YALNIZ OLGUYA DAYANIR (2026-08-12 ölçümü). Satır yüksekliği HEP
   ayrılır (şeritler burada birleşir): not belirip kaybolurken pusula kaymaz (CLS). */
function birlesimMetni(g) {
  const kosan = g.items.filter(kostuMu).length;
  const suruyor = g.items.filter((a) => a.status === "active").length;
  if (suruyor > 0) {
    const ort = ortusenAdimlar(g.items).length;
    if (ort < 2) return null;
    return { canli: true, metin: suruyor >= 2 && suruyor === ort ? `${ort} masa şu an aynı anda çalışıyor` : `${ort} masa aynı anda başladı · ${suruyor} sürüyor` };
  }
  if (kosan < 2) return null;
  const ms = grupDuvarMs(g.items);
  const sure = Number.isFinite(ms) && ms >= 100 ? fmtSn(ms) : null;
  return { canli: false, metin: `${kosan} masa aynı anda çalıştı${sure ? ` · en uzun dal ${sure}` : ""}` };
}

function BirlesimNotu({ g, col }) {
  const n = birlesimMetni(g);
  return (
    <div style={{ height: 24, display: "flex", alignItems: "center", paddingLeft: OLUK + SP.m, borderBottom: `1px solid ${PAL.line}`, minWidth: 0 }}>
      {n && (
        <span key={n.canli ? "c" : "b"} style={{ display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: n.canli ? DERIN_OF(col) : PAL.mut, fontWeight: n.canli ? 600 : 400, animation: "ke-e-masa .2s var(--ke-ease-out) both", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontFamily: MONO, fontWeight: 600, color: DERIN_OF(col) }}>∥</span>{n.metin}
        </span>
      )}
    </div>
  );
}

function useSatirOlcu(ref, adet) {
  const [olcu, setOlcu] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const olc = () => {
      const satirlar = [...el.children].filter((c) => c.dataset?.satir);
      setOlcu({ H: el.offsetHeight, ys: satirlar.map((r) => r.offsetTop + 7 + HAT.merkez) });
    };
    olc();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, adet]);
  return olcu;
}

function ParalelBlok({ g, col, risk, durdu, runBase, onDetay }) {
  const ref = useRef(null);
  const olcu = useSatirOlcu(ref, g.items.length);
  const k = g.items.length;
  // Şerit aralığı ≥12 px (tur 8: 11 px'te 2,5 px yollar 1x DPR'de yapışıyordu); oluk 36 px.
  const ara = Math.min(12, (OLUK - 10) / Math.max(1, k - 1));
  const xs = g.items.map((_, i) => OC + (i - (k - 1) / 2) * ara);
  useTik(g.items.some((a) => a.status === "active") ? 100 : 0);
  const simdi = Number.isFinite(runBase) && runBase > 0 ? performance.now() - runBase : 0;
  const zaman = zamanPenceresi(g.items, simdi);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {olcu && <SeritCizimi items={g.items} xs={xs} ys={olcu.ys} H={olcu.H} col={col} durdu={durdu} />}
      {g.items.map((a, i) => (
        <HatIstasyon key={a.id} a={a} col={col} risk={risk} serit={xs[i]} zaman={zaman[i]}
          durdu={durdu} runBase={runBase} onDetay={() => onDetay(a.sira)} />
      ))}
      <BirlesimNotu g={g} col={col} />
    </div>
  );
}

function HatFaz({ n, gruplar, risk = BANT.yesil, sonHat = true, devir = false, onDetay, durdu = null, runBase = 0 }) {
  const col = n === 2 ? V : T;
  const items = gruplar.flatMap((g) => g.items);
  // Geçen süre: gruplar arası TOPLAM, grup içi EN UZUN (paralel dallar iki kez sayılmaz).
  const ms = akisDuvarMs(gruplar);
  const sure = Number.isFinite(ms) && ms >= 100 ? fmtSn(ms) : null;
  // "Kapandı" (koştu/atlandı/hata) ilerlemeyi sürer; BAŞARI sayımı (doneN) yalnız koşanlar.
  const kapandi = (a) => a.status === "done" || a.status === "atlandi" || a.status === "error";
  const doneN = items.filter(kostuMu).length;
  const fazDone = items.length > 0 && items.every(kapandi);
  const kapananN = items.filter(kapandi).length;
  let j = 0;
  // Kesim çizgisi yalnız durdu koşumda, hatalı masanın bulunduğu bloğun hemen ardında.
  const kesim = (g) => {
    const h = durdu && g.items.find((a) => a.status === "error");
    return h ? <KesimCizgisi saat={kosumSaati(runBase, h.t1, performance.now(), Date.now())} /> : null;
  };
  return (
    <div style={{ minWidth: 0 }}>
      <HatTerminal n={n} col={col} count={items.length} doneN={doneN} sure={sure}
        girisAktif={items[0]?.status !== "pending"} tamam={fazDone}
        ilerleme={items.length ? kapananN / items.length : 0} devir={devir} />
      {gruplar.map((g, gi) => {
        const son = gi === gruplar.length - 1 && sonHat ? <HatSon col={col} done={fazDone} /> : null;
        if (g.paralel) {
          j += g.items.length;
          return <div key={g.items[0].id}><ParalelBlok g={g} col={col} risk={risk} durdu={durdu} runBase={runBase} onDetay={onDetay} />{kesim(g)}{son}</div>;
        }
        return (
          <div key={g.items[0].id} style={{ position: "relative" }}>
            {g.items.map((a) => {
              const idx = j++;
              const grupGirisi = idx === 0 ? a.status !== "pending" : items[idx - 1].status === "done";
              return (
                <HatIstasyon key={a.id} a={a} col={col} risk={risk} hasTop topFill={grupGirisi} hasBot
                  durdu={durdu} runBase={runBase} onDetay={() => onDetay(a.sira)} />
              );
            })}
            {kesim(g)}
            {son}
          </div>
        );
      })}
    </div>
  );
}

/* SAHNE telemetrisi — canlılık + geçen süre (saniye 500ms'de işler). */
export function SahneTelemetri({ busy, allDone, toplamSn, runBase, durdu = false }) {
  const [, setTik] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [busy]);
  const gecen = busy && Number.isFinite(runBase) && runBase > 0 ? Math.max(0, (performance.now() - runBase) / 1000) : null;
  // Durmuş koşumda telemetri susar: "kesildi" bilgisi başlık çipinde ve odak kartında zaten var.
  if (durdu && !busy) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.antet, color: PAL.mut, ...TNUM, flexShrink: 0, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: busy ? T : durdu ? BANT.kirmizi.c : (allDone ? BANT.yesil.c : PAL.mut2), animation: busy ? "ke-e-nefes 1.4s ease-in-out infinite" : "none" }} />
      {/* Geçen saniye düz metin: her saniye dönen rakam, sahnenin asıl hareketiyle (paraf,
          mürekkep) yarışan sürekli bir gürültüydü. */}
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, color: durdu && !busy ? DERIN_OF(BANT.kirmizi.c) : undefined }}>
        {busy ? "CANLI" : durdu ? "DURDU" : (allDone ? "TAMAM" : "BEKLEMEDE")}
        {gecen != null ? <> · {Math.floor(gecen)} SN</> : (toplamSn ? <> · {toplamSn.toLocaleUpperCase("tr-TR")}</> : null)}
      </span>
    </span>
  );
}

/* Odaktaki masa — sahnenin tipografik anı. Archivo rakamları (04 / 15), masa adı display
   kademesinde, canlı not ve gerçek-zaman süre. Ad her değişişte soldan sağa "yazılır". */
export function merkezIndeksi(display) {
  const aktif = display.findIndex((x) => x.status === "active");
  if (aktif >= 0) return aktif;
  // Koşum hata ile durduysa odak HATALI masadadır (son paraf değil): jüri hatayı odağın
  // kendisinde görmeli, "10 · Yazı Taslağı · son paraf" gibi bir başarı anında değil.
  const hata = display.findIndex((x) => x.status === "error");
  if (hata >= 0) return hata;
  let son = -1;
  display.forEach((x, i) => { if (x.status === "done") son = i; });
  return son >= 0 ? son : 0;
}

/* Odaktaki masayla AYNI ANDA çalışan diğer masalar — yalnız backend'in "başladı" dediği ve
   henüz bitmemiş adımlar (olgu; katman haritasından tahmin YOK). */
export function eszamanliMasalar(display, merkezIdx) {
  return (display || []).filter((x, i) => i !== merkezIdx && x.status === "active");
}

/* "aynı anda" yuvası — SABİT yükseklik (tur 6 CLS bulgusu): satır yalnız paralel katmanda
   doluyordu; belirip kaybolurken kart 24px uzayıp tüm pusulayı ve ıstampayı itiyordu. Yuva
   hep ayrılır, içerik yalnız olguda (backend'in "başladı" dediği masalar) görünür. */
function EszYuvasi({ esz, col }) {
  const var_ = esz.length > 0;
  return (
    <div aria-hidden={!var_} style={{ height: 18, display: "flex", alignItems: "center", gap: `0 ${SP.s}px`, ...TYPE.meta, color: PAL.mut, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", opacity: var_ ? 1 : 0, transition: "opacity .18s ease-out" }}>
      {var_ && <>
        <span aria-hidden="true" style={{ fontFamily: MONO, color: DERIN_OF(col) }}>∥</span>
        <span>aynı anda:</span>
        {esz.map((x) => (
          <span key={x.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PAL.ink, fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: x.gorev === 2 ? V : T, animation: "ke-e-nefes 1.2s ease-in-out infinite" }} />
            {x.label}
          </span>
        ))}
      </>}
    </div>
  );
}

function merkezUstSatir(a, kapanis, esz) {
  if (kapanis) return "Pusula kapandı";
  if (a.status === "active") return esz.length ? `Masada · ${esz.length + 1} masa eşzamanlı` : `Masada · ${gorevFaz(a.gorev).uzun}`;
  if (a.status === "error") return "Hata · akış bu masada";
  const d = adimDurumu(a);
  if (d === "gerekmedi") return "Son masa · gerekmedi";
  if (d === "calisti") return `Son paraf · ${gorevFaz(a.gorev).uzun}`;
  return `Sırada · ${gorevFaz(a.gorev).uzun}`;
}

/* Durum satırının sağ ucu — çalışan masanın canlı süresi, bitmiş masanın sunucu süresi ya da
   iki olay arasındaki kısa boşlukta yalnız "koşum sürüyor" olgusu (hangi masa UYDURULMAZ). */
function MerkezSure({ a, kapanis, kosumda, runBase }) {
  if (kapanis) return null;
  const active = a.status === "active";
  if (active) return <CanliSure runBase={runBase} t0={a.t0} style={{ marginLeft: "auto", fontSize: 13, lineHeight: "18px", color: PAL.ink2, flexShrink: 0 }} />;
  if (kosumda) return (
    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, ...TYPE.meta, color: DERIN_OF(T), flexShrink: 0 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: T, animation: "ke-e-nefes 1.2s ease-in-out infinite" }} />
      sonraki masa çalışıyor
    </span>
  );
  const sure = a.status === "done" ? fmtSn(duvarMs(a)) : null;
  if (!sure) return null;
  return <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, lineHeight: "18px", color: PAL.ink2, flexShrink: 0, ...TNUM }}>{sure}</span>;
}

/* HATA — sebep sahnenin KENDİSİNDE yazılır (tur 6: yalnız köşedeki bildirimde yazıyordu ve
   bildirim kaynak belgenin metnini örtüyordu). Sunucu mesajı çağırandan gelir; yoksa olgu. */
function MerkezHata({ mesaj, etiket, onTekrarDene }) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: SP.m, flexWrap: "wrap", marginTop: SP.xs, padding: `${SP.s}px ${SP.m}px`, borderLeft: `2px solid ${BANT.kirmizi.c}`, background: ALFA(BANT.kirmizi.c), borderRadius: `0 ${RAD.ctl}px ${RAD.ctl}px 0` }}>
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: "1 1 200px", minWidth: 0 }}>
        {hataSebebi(mesaj, etiket) || "Bu masa işini tamamlayamadı; sonraki masalar işlenmedi. Evrakı yeniden yükleyerek tekrar deneyebilirsiniz."}
        {/* Kapsam cümlesi (tur 8 jüri 2): neyin korunduğu söylenmiyordu. Olgu: yeniden deneme
            akışı BAŞTAN koşar; paraflı satırların çıktısı bu ekranda açılabilir kalır. */}
        <span style={{ display: "block", marginTop: SP.xs, ...TYPE.meta, color: PAL.mut }}>Paraflı masaların çıktısı aşağıda incelenebilir; Tekrar dene akışı baştan koşar.</span>
      </span>
      {/* Durdu hâlinde görünümün TEK primary'si: kurtarma (tur 8 — göz nereye gideceğini bilmiyordu). */}
      {onTekrarDene && <Btn primary onClick={onTekrarDene} style={{ flexShrink: 0 }}><Icon.undo width={14} height={14} /> Tekrar dene</Btn>}
    </div>
  );
}

export function MerkezKart({ a, total, runBase, kapanis = null, kosumda = false, esz = [], hataMesaji = "", onTekrarDene = null, damga = null, kisa = false }) {
  if (!a) return null;
  const active = a.status === "active", err = a.status === "error";
  const col = a.gorev === 2 ? V : T;
  const bantC = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : null;
  const durum = kapanis ? kapanis.alt
    : active ? (a.desc || "çalışıyor…") : a.status === "done" ? (a.out || "tamamlandı") : (a.desc || "sırada");
  const no = kapanis ? total : a.sira + 1;
  const vurgu = err ? BANT.kirmizi.c : kapanis ? BANT.yesil.c : col;
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: SP.s }}>
      <div style={{ ...TYPE.antet, color: DERIN_OF(vurgu), display: "flex", alignItems: "center", gap: SP.s, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden" }}>
        <span aria-hidden="true" style={{ width: 18, height: 2, background: vurgu, flexShrink: 0 }} />
        {merkezUstSatir(a, kapanis, esz)}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0 }}>
        {/* KIRPILMIŞ RAKAM KABI (tur 8): .82 satır yüksekliğiyle dönen NumberFlow'un önceki/sonraki
            rakam yayı üstteki künye satırına taşıyordu (hayalet glif): NumberFlow kendi kabında satır
            yüksekliğini 1'e + maske payına zorlar, kap .82'yi aşıyordu. Rakam .82em'lik taşmasız bir
            pencereye alınır; dönen komşu rakamlar yalnız bu pencerede görünür. */}
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: kisa ? 68 : "clamp(56px, 6vw, 96px)", lineHeight: 0.82, letterSpacing: "-.05em", color: PAL.ink, ...TNUM }}>
          <span style={{ display: "inline-block", height: "0.82em", overflow: "hidden", verticalAlign: "-0.16em" }}>
            <NumberFlow value={no} format={{ minimumIntegerDigits: 2 }} spinTiming={{ duration: 280, easing: "cubic-bezier(.23,1,.32,1)" }}
              style={{ display: "block", marginTop: "-0.22em", "--number-flow-mask-height": "0.12em" }} />
          </span>
        </span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 22, lineHeight: "22px", color: PAL.mut2, paddingBottom: 2, whiteSpace: "nowrap", flexShrink: 0, ...TNUM }}>/ {String(total).padStart(2, "0")}</span>
        {/* Kapanış damgası rakam bloğunun SAĞINDAKİ yuvaya oturur (tur 8: rakamın üstüne biniyordu). */}
        {damga && <span style={{ marginLeft: "auto", alignSelf: "center", flexShrink: 0 }}>{damga}</span>}
      </div>
      {/* TEK SATIR (nowrap + ellipsis): masa adı değişince kart yüksekliği DEĞİŞMEZ (CLS).
          Silme (ke-e-yaz) yalnız FAZ değişiminde ve kapanışta oynar; masa değişiminde sakin
          160ms opaklık + 4px — her vuruşta tekrarlanan daktilo süse dönüşüyordu (tur 6). */}
      <div key={kapanis ? "kapanis" : `faz-${a.gorev}`} style={{ marginTop: -SP.xs, minWidth: 0, animation: "ke-e-yaz .5s var(--ke-ease-out) both" }}>
        <div key={kapanis ? "k" : a.id} title={kapanis ? kapanis.baslik : a.label} style={{ ...TYPE.h1, fontSize: kisa ? 28 : "clamp(26px, 2.6vw, 36px)", lineHeight: 1.08, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", animation: "ke-e-masa .16s var(--ke-ease-out) both" }}>
          {kapanis ? kapanis.baslik : a.label}
        </div>
      </div>
      {/* Hata hâlinde durum satırı yok: sebep kutusu aynı bilgiyi tek yerde söyler (tur 6:
          "durdu" beş yerde tekrarlanıyordu). */}
      {err && !kosumda ? <MerkezHata mesaj={hataMesaji} etiket={a.label} onTekrarDene={onTekrarDene} /> : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, minWidth: 0 }}>
            <span style={{ ...TYPE.data, color: kapanis ? PAL.ink2 : active ? DERIN_OF(col) : (bantC ? DERIN_OF(bantC) : PAL.mut), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{durum}</span>
            <MerkezSure a={a} kapanis={kapanis} kosumda={kosumda} runBase={runBase} />
          </div>
          <EszYuvasi esz={!kapanis && active ? esz : []} col={col} />
        </>
      )}
    </div>
  );
}

/* ——— useSahneTempo: kısa sunum temposu ———
   Canlı burst'ler en fazla 80ms arayla okunur; backend sonucu geldiği anda kuyruk açılır.
   Böylece görsel ritim korunur fakat sonuç sonrası saniyelik yapay bekleme oluşmaz. */
export function useSahneTempo(nodes, { pendingOnay = null, glow = true } = {}) {
  // Başlangıç = mount ANINDAKİ gerçek tamamlanma sayısı: tempo yalnız CANLI gelen
  // tamamlanmaları sıralar. useState(0) ile başlamak, başka görünüme geçip dönüldüğünde
  // (remount) bitmiş koşumu baştan "yeniden işliyormuş" gibi oynatıyordu — kullanıcı
  // bulgusu: sekme dönüşünde sahte koşum + sayaç.
  const [reveal, setReveal] = useState(() => nodes.reduce((s, n) => s + (n.status === "done" ? 1 : 0), 0));
  const sonVurus = useRef(0);
  const trueDone = nodes.reduce((s, n) => s + (n.status === "done" ? 1 : 0), 0);
  const hataVar = nodes.some((n) => n.status === "error");
  useEffect(() => {
    // Yeni koşum: gerçek tamamlanma sayısı gösterilenin altına düştüyse sıfırdan başla.
    if (trueDone < reveal) { setReveal(trueDone); sonVurus.current = 0; }
  }, [trueDone, reveal]);
  useEffect(() => {
    if (reveal >= trueDone) return undefined;
    const aninda = !glow || hataVar || !!pendingOnay || trueDone === nodes.length;
    const kalan = trueDone - reveal;
    const dwell = aninda ? 0 : Math.min(80, Math.max(24, 300 / kalan));
    const bekle = Math.max(0, dwell - (performance.now() - sonVurus.current));
    const id = setTimeout(() => { sonVurus.current = performance.now(); setReveal((r) => r + 1); }, bekle);
    return () => clearTimeout(id);
  }, [reveal, trueDone, nodes.length, glow, hataVar, pendingOnay]);
  const paced = useMemo(() => {
    let gorulen = 0;
    return nodes.map((n) => {
      if (n.status !== "done") return n;
      gorulen += 1;
      if (gorulen <= reveal) return n;
      return { ...n, status: "pending" };
    });
  }, [nodes, reveal]);
  return { paced, sunumTamam: reveal >= trueDone };
}

/* Sahne gövdesi — iki sütunlu havale pusulası (Görev 1 | Görev 2; dar panelde alt alta).
   Odaktaki masa (MerkezKart) artık çağıran tarafta ıstampanın yanında durur; burada yalnız
   pusula var. Satırlar tıklanabilir (adım detayı). Blok/sıra = `gruplar` (start.katmanlar). */
export function SahneAkis({ display, gruplar = null, onDetay, durdu = null, runBase = 0 }) {
  // Harita yoksa her adım kendi bloğunda — paralellik İDDİA EDİLMEZ.
  const bloklar = gruplar || display.map((a) => ({ katman: null, paralel: false, items: [a] }));
  const gorevBloklari = (secici) => bloklar
    .map((g) => ({ ...g, items: g.items.filter(secici) }))
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, paralel: g.paralel && g.items.length > 1 }));
  const g1 = gorevBloklari((a) => a.gorev !== 2);
  const g2 = gorevBloklari((a) => a.gorev === 2);
  // Aktarma bağı yalnız iki hat YAN YANA iken çizilir — kolonların offsetTop eşitliği ölçülür.
  const gridRef = useRef(null);
  const [ikiKolon, setIkiKolon] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const olc = () => {
      const c = el.children;
      setIkiKolon(c.length >= 2 && Math.abs(c[0].offsetTop - c[1].offsetTop) < 4);
    };
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [display.length]);
  if (!display.length) return null;
  return (
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", columnGap: SP.xxl, rowGap: SP.xl, alignItems: "start" }}>
      {g1.length > 0 && <HatFaz n={1} gruplar={g1} onDetay={onDetay} durdu={durdu} runBase={runBase} />}
      {g2.length > 0 && <HatFaz n={2} gruplar={g2} devir={ikiKolon} onDetay={onDetay} durdu={durdu} runBase={runBase} />}
    </div>
  );
}

/* Başlık işaret cetveli — eski ince ilerleme çubuğunun yerine: her adım için bir çentik,
   graf sırasıyla (display = katmanGruplari dizilimi). Biçim durumdan (adimDurumu) gelir:
   koştu → dolu mürekkep · gerekmedi → içi boş · atlandı → kesikli · hata → kırmızı ·
   işleniyor → nefes alan yarı ton · bekliyor → soluk. Görev 1→2 geçişinde geniş aralık. */
export function IsaretCetveli({ display, durdu = null }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "stretch", gap: 4, height: 8, flex: 1, minWidth: 0 }}>
      {display.map((a, i) => {
        const d = sahneDurumu(a, durdu);
        const col = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : (a.gorev === 2 ? V : T);
        const ayrac = i > 0 && display[i - 1].gorev !== a.gorev;
        const st = {
          calisti: { background: col },
          hata: { background: BANT.kirmizi.c },
          isleniyor: { background: ALFA(col), boxShadow: `inset 0 0 0 1.5px ${col}`, animation: "ke-e-nefes 1.2s ease-in-out infinite" },
          gerekmedi: { boxShadow: `inset 0 0 0 1px ${PAL.lineHi}` },
          atlandi: { background: `repeating-linear-gradient(135deg, ${PAL.lineHi} 0 2px, transparent 2px 5px)` },
          bekliyor: { background: PAL.press },
          kesildi: { background: PAL.line, opacity: 0.4 },
          yarida: { boxShadow: `inset 0 0 0 1.5px ${BANT.kirmizi.c}` },
          islenmedi: { background: PAL.line, opacity: 0.4 },
        }[d];
        return (
          <span key={a.id} style={{ flex: 1, minWidth: 3, marginLeft: ayrac ? 10 : 0, borderRadius: 1.5, transformOrigin: "bottom", ...st, ...(d === "calisti" ? { animation: "ke-e-tik .38s var(--ke-ease-out) both" } : null) }} />
        );
      })}
    </div>
  );
}
