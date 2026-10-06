/* CanliAkisSeridi — sonuç sayfasının dibindeki yatay "pusula özeti" (CanliMetro'dan ayrıldı,
   tur 6: dosya <800 kuralı). Durum tek kaynaktan (akisKatman.adimDurumu, §10); eşzamanlı bağ
   yalnız start.katmanlar'dan damgalanan `katman` alanından (§8). */
import { SANS, V, T, PAL, BANT, DERIN_OF, TYPE, TNUM, RAD, SP, SH, focusRing, Icon } from "./neonUi.jsx";
import { gorevFaz } from "../lib/pipelinePhases.js";
import { adimDurumu } from "../lib/akisKatman.js";

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
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: RAD.dot, background: col, color: PAL.onAccent, fontFamily: SANS, fontSize: 11, lineHeight: "18px", fontWeight: 600, textAlign: "center", flexShrink: 0, ...TNUM }}>{gorevFaz(a.gorev).no}</span>
            <YarimRay filled={a.status !== "pending"} col={col} />
          </span>
          {/* İki satır: üstte bölüm no, altında bölüm adı — istasyon adlarıyla aynı düşey ritim. */}
          <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(col), whiteSpace: "nowrap", padding: "0 6px", textAlign: "center" }}>
            {gorevFaz(a.gorev).no}.
            <span style={{ display: "block", fontWeight: 400 }}>{gorevFaz(a.gorev).ad}</span>
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

/* PUSULA ÖZETİ — sonuç sayfasının dibinde koşumun yatay özeti. Tur 6: canlı sahnenin
   "masa / paraf / havale pusulası" dili burada "Ajan akışı"na dönüşüyor, metafor kırılıyordu. */
export function PusulaOzeti({ display, onDetay, toplamSn }) {
  return (
    <section aria-label="Pusula özeti" style={{ position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: SP.l, boxShadow: SH.card, marginTop: SP.xl, marginBottom: SP.xxl }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(T) }}><Icon.route /></span>
        <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Pusula özeti</h3>
        <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut, ...TNUM }}>{display.length} masa{toplamSn ? ` · ${toplamSn}` : ""}</span>
      </div>
      {/* Sağda sabit asistan balonu son noktaları örtmesin diye küçük iç pay. */}
      <div style={{ paddingRight: SP.xl }}>
        <AkisSeridi display={display} onDetay={onDetay} />
      </div>
    </section>
  );
}
