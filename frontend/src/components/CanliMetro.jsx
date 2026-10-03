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
import { useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { MONO, SANS, DISPLAY, T, V, PAL, BANT, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, focusRing, Icon } from "./neonUi.jsx";
import { nodeDurationMs } from "../lib/pipelinePhases.js";
import { grupSuresiMs, akisSuresiMs, adimDurumu, kostuMu } from "../lib/akisKatman.js";
import { parafUret } from "./agent-flow/topology.js";

/* Sahneye özgü keyframe'ler (ke-e-*). Ortak NEON_KEYFRAMES başka sahibin dosyasında; burada
   yerel. Tarayıcı çizgisi reduced-motion'da tamamen gizlenir (global kural animasyonu söndürür
   ama çizgi statik olarak sayfanın dibinde kalırdı). */
export const SAHNE_CSS = `
@keyframes ke-e-paraf{0%{opacity:0;transform:rotate(var(--egim)) scale(1.9)}55%{opacity:1;transform:rotate(var(--egim)) scale(.9)}100%{opacity:1;transform:rotate(var(--egim)) scale(1)}}
@keyframes ke-e-tik{0%{transform:scaleY(.2)}60%{transform:scaleY(1.12)}100%{transform:scaleY(1)}}
@keyframes ke-e-tara{from{transform:translateY(-100%)}to{transform:translateY(0)}}
@keyframes ke-e-fosfor{from{background-size:0% 100%}to{background-size:100% 100%}}
@keyframes ke-e-yaz{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes ke-e-cizgi{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes ke-e-nefes{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes ke-e-kayit{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ke-e-tarayici{display:none}}
/* Mobil güvenli alt pay: sabit "Asistan" düğmesi pusulanın son satırının paraf sütununu
   örtüyordu (390px bulgusu) — sahne dibinde düğme yüksekliği + nefes kadar boşluk. */
.ke-e-sahne{padding-bottom:calc(40px + env(safe-area-inset-bottom, 0px))}
@media (max-width: 720px){.ke-e-sahne{padding-bottom:calc(104px + env(safe-area-inset-bottom, 0px))}}
`;

const HAT = { x: 13, w: 2, merkez: 18 };
const fmtSn = (ms) => (Number.isFinite(ms) && ms >= 50 ? `${(ms / 1000).toFixed(1).replace(".", ",")} sn` : null);

/* Mürekkep hattı parçası — zemin hairline üstünde hat rengi YUKARIDAN AŞAĞI kendini çizer.
   kesik=true: EŞZAMANLI adımlar arası bağ (aralarında sıra yok → düz çizgi iddia etmez). */
const Ray = ({ top, height, bottom, filled, col, kesik = false, sure = 420 }) => (
  <span aria-hidden="true" style={{ position: "absolute", left: HAT.x, width: HAT.w, top, height, bottom, background: kesik ? `repeating-linear-gradient(180deg, ${PAL.lineHi} 0 3px, transparent 3px 7px)` : PAL.line, overflow: "hidden" }}>
    <span style={{ position: "absolute", inset: 0, background: kesik ? `repeating-linear-gradient(180deg, ${col} 0 3px, transparent 3px 7px)` : col, transformOrigin: "top", transform: filled ? "scaleY(1)" : "scaleY(0)", transition: `transform ${sure}ms var(--ke-ease-in-out)` }} />
  </span>
);

/* Hat üstündeki düğüm — durum kipine göre biçim (renk tek sinyal değil). */
function HatDurak({ durum, col }) {
  const orta = { position: "absolute", left: 0, top: HAT.merkez - 6, width: 28, display: "flex", justifyContent: "center" };
  const taban = { width: 12, height: 12, borderRadius: RAD.dot, boxSizing: "border-box" };
  if (durum === "calisti") return <span aria-hidden="true" style={orta}><span key="c" style={{ ...taban, background: col, boxShadow: `0 0 0 3px ${PAL.surf}`, animation: "nu-pop .35s var(--ke-ease-spring) both" }} /></span>;
  if (durum === "hata") return <span aria-hidden="true" style={orta}><span style={{ ...taban, background: BANT.kirmizi.c, boxShadow: `0 0 0 3px ${PAL.surf}` }} /></span>;
  if (durum === "kesildi") return (
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
  if (durum === "islenmedi") return <span aria-hidden="true" style={{ ...NOT, color: PAL.mut3, border: `1px dotted ${PAL.lineHi}` }}>İşlenmedi</span>;
  if (durum === "isleniyor") return (
    <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: RAD.dot, border: `1.5px dashed ${col}`, flexShrink: 0, animation: "nu-spin 6s linear infinite" }} />
  );
  return <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: RAD.dot, border: `1px dotted ${PAL.lineHi}`, flexShrink: 0 }} />;
}

/* Hat başlığı — antet dilinde: "GÖREV 1 — ANLA" künyesi + kendi ilerleme hattı + sayaç.
   Mühür rakamı hat hizmete girince mürekkeple dolar. */
function HatTerminal({ n, col, count, doneN, sure, girisAktif, tamam, ilerleme, devir }) {
  return (
    <div style={{ position: "relative", paddingBottom: SP.s }}>
      <Ray top={26} bottom={0} filled={girisAktif} col={col} />
      {devir && (
        <span aria-hidden="true" style={{ position: "absolute", top: 13, left: -SP.xxl, width: SP.xxl - 6, height: 0, borderTop: `2px dashed ${girisAktif ? col : PAL.lineHi}`, transition: "border-color .3s ease" }} />
      )}
      {/* Tek satır (390px'te sayaç başlığın altına kırılıyordu): çizgi esner/kaybolur, künye
          ve sayaç asla kırılmaz. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", columnGap: SP.m, minHeight: 28, minWidth: 0 }}>
        <span style={{ width: 28, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <span key={girisAktif ? "on" : "off"} aria-hidden="true" style={{ width: 26, height: 26, boxSizing: "border-box", borderRadius: RAD.dot, background: girisAktif ? col : PAL.surf, border: `2px solid ${col}`, color: girisAktif ? PAL.onAccent : DERIN_OF(col), fontFamily: DISPLAY, fontWeight: 800, fontStretch: "120%", fontSize: 13, lineHeight: "22px", textAlign: "center", ...TNUM, transition: "background .25s ease", animation: girisAktif ? "nu-pop .4s var(--ke-ease-spring) both" : "none" }}>{n}</span>
        </span>
        <span style={{ ...TYPE.antet, color: DERIN_OF(col), flexShrink: 0, textTransform: "uppercase" }}>{n === 2 ? "Görev 2 — Üret" : "Görev 1 — Anla"}</span>
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

/* Pusula satırı — oluk (hat + düğüm) · sıra no · masa adı + not · süre · paraf. Satır
   TIKLANABİLİR (adım detay modalı). Aktif masa hafif mürekkep tintiyle vurgulanır. */
/* Durdu koşumunda bekleyen masanın kipi — kesimin olduğu ilk masa "kesildi", sonrakiler
   "islenmedi". Durdu değilse adimDurumu aynen (tek durum kaynağı, §10). */
export function sahneDurumu(a, durdu) {
  const d = adimDurumu(a);
  if (!durdu || d !== "bekliyor") return d;
  return a.sira === durdu.kesim ? "kesildi" : "islenmedi";
}

function HatIstasyon({ a, col, risk, hasTop, topFill, hasBot, onDetay, kesikTop = false, kesikBot = false, durdu = null }) {
  const durum = sahneDurumu(a, durdu);
  const kesildi = durum === "kesildi", islenmedi = durum === "islenmedi";
  const done = a.status === "done", active = durum === "isleniyor", err = durum === "hata";
  const bosGecti = durum === "gerekmedi", atlandi = durum === "atlandi";
  const nodeBant = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant] : null;
  const durakCol = a.id === "risk_guard" && done ? (nodeBant || risk).c : col;
  const ms = nodeDurationMs(a);
  const sure = done ? fmtSn(ms) : null;
  // Hat çizim süresi adımın gerçek süresiyle orantılı (kısa adım çabuk, uzun adım ağır çizilir).
  const cizim = Number.isFinite(ms) ? Math.round(Math.min(900, Math.max(260, ms / 6))) : 420;
  const altYazi = kesildi ? "akış bu masaya gelmeden durdu"
    : islenmedi ? "işlenmedi"
    : atlandi ? "bu koşumda çalışmadı"
    : bosGecti ? (a.out || "gerekmedi")
    : done ? (a.out || "tamamlandı") : active ? (a.desc || "çalışıyor…") : err ? "hata · adım başarısız" : (a.desc || "—");
  const altRenk = err || kesildi ? DERIN_OF(BANT.kirmizi.c) : (bosGecti || atlandi || islenmedi) ? PAL.mut2
    : done ? (a.id === "risk_guard" ? DERIN_OF((nodeBant || risk).c) : PAL.mut) : active ? DERIN_OF(col) : PAL.mut2;
  const zemin = active ? ALFA(col) : kesildi ? ALFA(BANT.kirmizi.c) : "transparent";
  return (
    <div role="button" tabIndex={0} onClick={onDetay} title={`${a.label} — adım detayını aç`}
      aria-current={active ? "step" : undefined}
      {...focusRing}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetay(); } }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = zemin; }}
      style={{ cursor: "pointer", position: "relative", display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", columnGap: SP.m, alignItems: "center", padding: "7px 6px 7px 0", borderBottom: `1px solid ${PAL.line}`, background: zemin, opacity: islenmedi ? 0.62 : 1, transition: "background .2s ease, opacity .3s ease" }}>
      <div style={{ position: "relative", alignSelf: "stretch", minHeight: 40 }}>
        {hasTop && <Ray top={-8} height={HAT.merkez + 8} filled={topFill} col={col} kesik={kesikTop} sure={cizim} />}
        {hasBot && <Ray top={HAT.merkez} bottom={-8} filled={done} col={col} kesik={kesikBot} sure={cizim} />}
        <HatDurak durum={durum} col={durakCol} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, ...TNUM, flexShrink: 0 }}>{String(a.sira + 1).padStart(2, "0")}</span>
          <span style={{ ...TYPE.ui, fontWeight: active || kesildi ? 650 : 500, color: active || done || kesildi ? PAL.ink : PAL.mut, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginTop: 1, paddingLeft: 23, minWidth: 0 }}>
          <span style={{ ...TYPE.meta, color: altRenk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{altYazi}</span>
          {sure && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, flexShrink: 0, ...TNUM }}>{sure}</span>}
        </div>
        <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
          {kesildi ? "işlem bu adıma gelmeden durdu" : islenmedi ? "işlem durduğu için işlenmedi" : atlandi ? "bu koşumda çalışmadı" : bosGecti ? "bu belgede gerekmedi" : done ? `tamamlandı${sure ? ` · ${sure}` : ""}` : active ? "şu an işleniyor" : err ? "hata: adım başarısız" : "sırada"}
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

/* Eşzamanlı blok başlığı — İDDİA YALNIZ OLGUYA DAYANIR: ≥2 üye GERÇEKTEN koştuysa basılır
   (2026-08-12 adversarial ölçümü). Süre EN UZUN dalın süresidir. */
function ParalelBaslik({ grup, col }) {
  const kosan = grup.items.filter(kostuMu).length;
  if (kosan < 2) return null;
  const ms = grupSuresiMs(grup.items);
  const sure = Number.isFinite(ms) && ms >= 100
    ? `${ms < 10000 ? (ms / 1000).toFixed(1).replace(".", ",") : Math.round(ms / 1000)} sn` : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0 4px 40px", borderBottom: `1px dashed ${PAL.line}`, animation: "nu-rise .2s var(--ke-ease-out) both" }}>
      <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: DERIN_OF(col) }}>∥</span>
      <span style={{ ...TYPE.meta, color: PAL.mut }}>
        {kosan} masa aynı anda çalıştı{sure ? ` · ${sure} (en uzun dal)` : ""}
      </span>
    </div>
  );
}

function HatFaz({ n, gruplar, risk = BANT.yesil, sonHat = true, devir = false, onDetay, durdu = null }) {
  const col = n === 2 ? V : T;
  const items = gruplar.flatMap((g) => g.items);
  // Geçen süre: gruplar arası TOPLAM, grup içi EN UZUN (paralel dallar iki kez sayılmaz).
  const ms = akisSuresiMs(gruplar);
  const sure = Number.isFinite(ms) && ms >= 100
    ? `${ms < 10000 ? (ms / 1000).toFixed(1).replace(".", ",") : Math.round(ms / 1000)} sn` : null;
  // "Kapandı" (koştu/atlandı/hata) ilerlemeyi sürer; BAŞARI sayımı (doneN) yalnız koşanlar.
  const kapandi = (a) => a.status === "done" || a.status === "atlandi" || a.status === "error";
  const doneN = items.filter(kostuMu).length;
  const fazDone = items.length > 0 && items.every(kapandi);
  const kapananN = items.filter(kapandi).length;
  let j = 0;
  return (
    <div style={{ minWidth: 0 }}>
      <HatTerminal n={n} col={col} count={items.length} doneN={doneN} sure={sure}
        girisAktif={items[0]?.status !== "pending"} tamam={fazDone}
        ilerleme={items.length ? kapananN / items.length : 0} devir={devir} />
      {gruplar.map((g, gi) => (
        <div key={g.items[0].id} style={{ position: "relative" }}>
          {g.paralel && <ParalelBaslik grup={g} col={col} />}
          {g.items.map((a, k) => {
            const idx = j++;
            const kesikTop = g.paralel && k > 0;
            const kesikBot = g.paralel && k < g.items.length - 1;
            // Paralel blokta giriş rayı GRUBUN girişine bakar, önceki KARDEŞE değil.
            const oncekiKapandi = idx === 0 ? a.status !== "pending" : items[idx - 1].status === "done";
            const grupGirisi = g.paralel
              ? (idx - k === 0 ? g.items[0].status !== "pending" : items[idx - k - 1].status === "done")
              : oncekiKapandi;
            return (
              <HatIstasyon key={a.id} a={a} col={col} risk={risk} hasTop topFill={grupGirisi} hasBot
                kesikTop={kesikTop} kesikBot={kesikBot} durdu={durdu} onDetay={() => onDetay(a.sira)} />
            );
          })}
          {gi === gruplar.length - 1 && sonHat && <HatSon col={col} done={fazDone} />}
        </div>
      ))}
    </div>
  );
}

/* SAHNE telemetrisi — canlılık + geçen süre (saniye 500ms'de işler). */
export function SahneTelemetri({ busy, allDone, toplamSn, runBase }) {
  const [, setTik] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [busy]);
  const gecen = busy && Number.isFinite(runBase) && runBase > 0 ? Math.max(0, (performance.now() - runBase) / 1000) : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.antet, color: PAL.mut, ...TNUM, flexShrink: 0, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: busy ? T : (allDone ? BANT.yesil.c : PAL.mut2), animation: busy ? "ke-e-nefes 1.4s ease-in-out infinite" : "none" }} />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
        {busy ? "CANLI" : (allDone ? "TAMAM" : "BEKLEMEDE")}
        {gecen != null ? <> · <NumberFlow value={Math.floor(gecen)} spinTiming={{ duration: 300 }} /> SN</> : (toplamSn ? <> · {toplamSn.toLocaleUpperCase("tr-TR")}</> : null)}
      </span>
    </span>
  );
}

/* Odaktaki masa — sahnenin tipografik anı. Archivo rakamları (04 / 15), masa adı display
   kademesinde, canlı not ve gerçek-zaman süre. Ad her değişişte soldan sağa "yazılır". */
export function merkezIndeksi(display) {
  const aktif = display.findIndex((x) => x.status === "active");
  if (aktif >= 0) return aktif;
  let son = -1;
  display.forEach((x, i) => { if (x.status === "done") son = i; });
  return son >= 0 ? son : 0;
}

export function MerkezKart({ a, total, runBase, kapanis = null, kosumda = false }) {
  const [, setTik] = useState(0);
  const active = a?.status === "active";
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 300);
    return () => clearInterval(id);
  }, [active, a?.id]);
  if (!a) return null;
  const col = a.gorev === 2 ? V : T;
  const done = a.status === "done", err = a.status === "error";
  const bantC = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : null;
  const relNow = Number.isFinite(runBase) && runBase > 0 ? performance.now() - runBase : null;
  const ms = active && relNow != null && Number.isFinite(a.t0) ? relNow - a.t0 : (done ? nodeDurationMs(a) : null);
  const sn = ms != null && ms >= 100 ? ms / 1000 : null;
  const durum = kapanis ? kapanis.alt
    : active ? (a.desc || "çalışıyor…") : done ? (a.out || "tamamlandı") : err ? "hata · adım başarısız" : (a.desc || "sırada");
  const no = kapanis ? total : a.sira + 1;
  const vurgu = err ? BANT.kirmizi.c : kapanis ? BANT.yesil.c : col;
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: SP.s }}>
      <div style={{ ...TYPE.antet, color: DERIN_OF(vurgu), display: "flex", alignItems: "center", gap: SP.s, textTransform: "uppercase" }}>
        <span aria-hidden="true" style={{ width: 18, height: 2, background: vurgu }} />
        {kapanis ? "Pusula kapandı" : active ? `Masada · Görev ${a.gorev}` : err ? "Durdu"
          : adimDurumu(a) === "gerekmedi" ? `Son masa · gerekmedi` : adimDurumu(a) === "calisti" ? `Son paraf · Görev ${a.gorev}` : `Sırada · Görev ${a.gorev}`}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: "clamp(64px, 7.2vw, 104px)", lineHeight: 0.82, letterSpacing: "-.05em", color: PAL.ink, ...TNUM }}>
          <NumberFlow value={no} format={{ minimumIntegerDigits: 2 }} spinTiming={{ duration: 420, easing: "cubic-bezier(.23,1,.32,1)" }} />
        </span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 22, lineHeight: "22px", color: PAL.mut2, paddingBottom: 2, ...TNUM }}>/ {String(total).padStart(2, "0")}</span>
      </div>
      <div key={kapanis ? "kapanis" : a.id} style={{ ...TYPE.h1, fontSize: "clamp(26px, 2.6vw, 36px)", lineHeight: 1.08, marginTop: -SP.l, color: PAL.ink, minWidth: 0, overflowWrap: "anywhere", animation: "ke-e-yaz .5s var(--ke-ease-out) both" }}>
        {kapanis ? kapanis.baslik : a.label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, minWidth: 0 }}>
        <span style={{ ...TYPE.data, color: kapanis ? PAL.ink2 : active ? DERIN_OF(col) : (bantC ? DERIN_OF(bantC) : PAL.mut), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{durum}</span>
        {!kapanis && !active && kosumda && (
          /* Backend her masanın başlangıcını yayınlamaz; hangi masanın çalıştığını UYDURMAYIZ —
             yalnız koşumun sürdüğü (olgu) söylenir. */
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, ...TYPE.meta, color: DERIN_OF(T), flexShrink: 0 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: T, animation: "ke-e-nefes 1.2s ease-in-out infinite" }} />
            sonraki masa çalışıyor
          </span>
        )}
        {!kapanis && (active || !kosumda) && sn != null && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, lineHeight: "18px", color: PAL.ink2, flexShrink: 0, ...TNUM, display: "inline-flex", alignItems: "baseline", gap: 3 }}>
            <NumberFlow value={sn} locales="tr-TR" format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} spinTiming={{ duration: 220 }} /> sn
          </span>
        )}
      </div>
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
export function SahneAkis({ display, gruplar = null, onDetay, durdu = null }) {
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
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", columnGap: SP.xxl, rowGap: SP.xl, alignItems: "start" }}>
      {g1.length > 0 && <HatFaz n={1} gruplar={g1} onDetay={onDetay} durdu={durdu} />}
      {g2.length > 0 && <HatFaz n={2} gruplar={g2} devir={ikiKolon} onDetay={onDetay} durdu={durdu} />}
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
          kesildi: { boxShadow: `inset 0 0 0 1.5px ${BANT.kirmizi.c}` },
          islenmedi: { background: PAL.press, opacity: 0.5 },
        }[d];
        return (
          <span key={a.id} style={{ flex: 1, minWidth: 3, marginLeft: ayrac ? 10 : 0, borderRadius: 1.5, transformOrigin: "bottom", ...st, ...(d === "calisti" ? { animation: "ke-e-tik .38s var(--ke-ease-out) both" } : null) }} />
        );
      })}
    </div>
  );
}

/* ——— AkisSeridi: yatay istasyon şeridi ("satır gibi" ajan akışı) ———
   Sonuç sayfasının EN ALTINDA koşumun kompakt özeti: roundel + istasyon noktaları + dolu
   bağlar; Görev 1→2 aktarması kesikli. Noktalar tıklanabilir (adım detay modalı). Sakin mod:
   koşum bitmiştir, ışık kuyruğu/pop yok. */
function SeritNokta({ a, col }) {
  const dotCol = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : col;
  if (a.status === "active") return (
    <span style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 20 20" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1s linear infinite" }}>
        <circle cx="10" cy="10" r="7.5" stroke={PAL.line} strokeWidth="3.5" fill={PAL.surf} />
        <path d="M10 2.5 A7.5 7.5 0 0 1 17.5 10" stroke={dotCol} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
  const err = a.status === "error";
  // Hatalı adım renk + BİÇİMLE ayrılır (X glifi) — renk tek sinyal olamaz (WCAG 1.4.1).
  if (err) return (
    <span style={{ width: 12, height: 12, borderRadius: RAD.dot, background: BANT.kirmizi.c, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon.x width={8} height={8} />
    </span>
  );
  // Yalnız GERÇEKTEN iş üreten adım dolu nokta alır. "gerekmedi" (koştu, işi yoktu) ve
  // "atlandi" (hiç koşmadı) içi boş halka kalır; atlanan ayrıca kesikli çerçeveyle ayrışır.
  const durum = adimDurumu(a);
  const dolu = durum === "calisti";
  const atlandi = durum === "atlandi";
  return (
    <span style={{ width: dolu ? 12 : 9, height: dolu ? 12 : 9, borderRadius: RAD.dot, background: dolu ? dotCol : PAL.bg, border: dolu ? "none" : `1px ${atlandi ? "dashed" : "solid"} ${PAL.lineHi}`, flexShrink: 0 }} />
  );
}

/* Yarım ray parçası — her istasyon hücresi kendi sol/sağ ray yarısını taşır; bitişik
   hücreler kesintisiz tek hat okunur. bos: hattın gerçek ucu (parça çizilmez).
   Radius YOK: yuvarlak uçlar her ek yerinde "kapanmış boru" okunuyordu — parçalar
   düz uçla birbirine yaslanır, şerit boydan boya TEK boru görünür. */
const YarimRay = ({ filled, col, bos, kesik = false }) => (
  <span aria-hidden="true" style={{ flex: 1, minWidth: 6, height: 3, alignSelf: "center", background: bos ? "transparent" : (kesik ? `repeating-linear-gradient(90deg, ${filled ? col : PAL.line} 0 3px, transparent 3px 7px)` : (filled ? col : PAL.line)), transition: "background .3s ease" }} />
);

export function AkisSeridi({ display, onDetay }) {
  const parcalar = [];
  display.forEach((a, i) => {
    const col = a.gorev === 2 ? V : T;
    const prev = display[i - 1];
    const gorevBasi = i === 0 || (prev && prev.gorev !== a.gorev);
    // Hat başı roundeli — istasyonlarla aynı iki katlı düzen (üstte işaret, altta ad).
    // Roundel RAYA OTURUR: blok etiket kadar geniş olduğundan işaret satırı tam genişlik
    // ray taşır — solda Görev 2'de kesikli AKTARMA (Görev 1 bitince hat rengine döner,
    // akışın en başında boş), sağda hattın ilk parçası. Komşu hücrelerin yarım-raylarıyla
    // uç uca eklenir → şerit boydan boya kesintisiz TEK boru okunur (boru kapanması yok).
    if (gorevBasi) {
      parcalar.push(
        <div key={`g${a.gorev}`} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", width: "100%", height: 24 }}>
            {a.gorev === 2 && prev
              ? <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderTop: `2px dashed ${prev.status === "done" ? col : PAL.lineHi}`, transition: "border-color .3s ease" }} />
              : <span aria-hidden="true" style={{ flex: 1 }} />}
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: RAD.dot, background: col, color: PAL.onAccent, fontFamily: SANS, fontSize: 11, lineHeight: "18px", fontWeight: 600, textAlign: "center", flexShrink: 0, ...TNUM }}>{a.gorev}</span>
            <YarimRay filled={a.status !== "pending"} col={col} />
          </span>
          {/* İki satır: üstte "Görev N", altında faz adı — istasyon adlarıyla aynı düşey ritim. */}
          <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(col), whiteSpace: "nowrap", padding: "0 6px", textAlign: "center" }}>
            Görev {a.gorev}
            <span style={{ display: "block", fontWeight: 400 }}>{a.gorev === 2 ? "Üret" : "Anla"}</span>
          </span>
        </div>
      );
    }
    // İstasyon hücresi — üstte ray içinde nokta, altında adım adı (2 satır sığar).
    // Tüm hücre tıklanabilir (geniş hedef); durum + risk bandı erişilebilir ada girer.
    const durumTr = {
      calisti: "tamamlandı", gerekmedi: "gerekmedi", atlandi: "bu koşumda çalışmadı",
      hata: "hata", isleniyor: "işleniyor", bekliyor: "sırada",
    }[adimDurumu(a)];
    const bantEk = a.id === "risk_guard" && a.bant && BANT[a.bant] ? ` · risk bandı ${BANT[a.bant].l}` : "";
    // Aynı katmandaki komşularla bağ KESİKLİ: aralarında çalışma sırası yok.
    const esKatman = (x, y) => x && y && x.katman != null && x.katman === y.katman;
    const kesikSol = esKatman(a, prev);
    const kesikSag = esKatman(a, display[i + 1]);
    const adRenk = a.status === "error" ? DERIN_OF(BANT.kirmizi.c) : a.status === "done" ? PAL.ink2 : a.status === "active" ? PAL.ink : PAL.mut;
    parcalar.push(
      <button key={a.id} type="button" onClick={() => onDetay(a.sira)} title={`${a.label} — ${durumTr}${bantEk}`}
        aria-label={`${a.label}, ${durumTr}${bantEk} — adım detayını aç`} {...focusRing} data-press=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 0 6px", background: "transparent", border: "none", borderRadius: RAD.ctl, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
        <span style={{ display: "flex", alignItems: "center", width: "100%", height: 24 }}>
          <YarimRay filled={gorevBasi ? a.status !== "pending" : prev?.status === "done"} col={col} kesik={kesikSol} />
          <SeritNokta a={a} col={col} />
          <YarimRay filled={a.status === "done"} col={col} bos={i === display.length - 1} kesik={kesikSag} />
        </span>
        <span style={{ ...TYPE.meta, color: adRenk, fontWeight: a.status === "active" ? 600 : 400, textAlign: "center", maxWidth: 92, padding: "0 2px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", transition: "color .2s ease" }}>{a.label}</span>
      </button>
    );
  });
  return <div style={{ display: "flex", alignItems: "flex-start" }}>{parcalar}</div>;
}
