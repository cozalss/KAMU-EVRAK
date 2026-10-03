/* PanelBrif — Panel'in KAHRAMANI (2026-10, "Antet & Damga" yeniden tasarımı).
   PanelView'dan ayrıldı (dosya < 800 satır kuralı). Mantık AYNEN eski KahramanBrif'tir:
   aynı `kuyrukSla` dizisi, aynı durum sayımı, aynı acil sıralaması (kalan_gun artan),
   aynı "ilk 5 + kalanı kuyruğa" kuralı, ekranın tek primary'si yine "En acil evrakı işle".
   Değişen yalnız sunum:
   · DEV RAKAM: acil sayısı Archivo'nun en geniş kesiminde (%125) — sabah brifinin tek
     manşeti. NumberFlow 0'dan sayar (açılış koreografisi), reduced-motion'da anında.
   · SİCİL DEFTERİ: acil liste artık kayıt defteri — mono sıra no, kırmızı kenar boşluğu
     çizgisi (defter kâğıdının "marj" çizgisi), sağda Archivo gecikme rakamı + mono son gün.
     Satırlar sırayla "yazılır" (stagger).
   · Şerit: kuyruğun süre kompozisyonu, sayılar Archivo — renk tek sinyal değil (sayı+söz). */
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Btn, Icon, MONO, DISPLAY, T, R, TYPE, TNUM, SP, RAD, SH, EASE, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { kalanMetin } from "../lib/sureTakvimi.js";
import { useDarEkran } from "../hooks/useMedya.js";

/* Panel'in yerel giriş koreografisi. Global reduced-motion kuralı (NEON_KEYFRAMES)
   `*{animation:none!important}` ile bunları da söndürür — ayrıca koşul gerekmez.
   pv-gir: blok girişi (yükselme + netleşme) · pv-yaz: defter satırı (soldan, kalemle yazılır
   gibi kısa kayma) · pv-bas: takvim mührü (büyükten basılıp oturur) · pv-cizgi: marj çizgisi
   yukarıdan aşağı çizilir (scaleY, transform-only). */
export const PANEL_KF = `
@keyframes pv-gir{from{opacity:0;transform:translateY(14px);filter:blur(3px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes pv-yaz{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@keyframes pv-bas{0%{opacity:0;transform:rotate(var(--pv-egim,-8deg)) scale(1.8)}60%{opacity:1;transform:rotate(var(--pv-egim,-8deg)) scale(.92)}100%{opacity:1;transform:rotate(var(--pv-egim,-8deg)) scale(1)}}
@keyframes pv-cizgi{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes pv-serit{from{transform:scaleX(0)}to{transform:scaleX(1)}}
`;

/* Blok giriş stili — gecikme ms. Tek kaynak: hem PanelView ızgara hücreleri hem bu dosya. */
export const giris = (ms, ad = "pv-gir", sure = 0.56) => ({ animation: `${ad} ${sure}s ${EASE.out} ${ms}ms both` });

/* Açılış sayacı: ilk karede 0, kısa gecikmeyle gerçek değer → NumberFlow akarak sayar.
   Sonraki değişimler doğrudan geçer (canlı veri güncellemesi de akar). Reduced-motion'da
   NumberFlow kendi tercihine uyar (respectMotionPreference varsayılan açık). */
export function useAcilisSayaci(deger, gecikme = 220) {
  const [hazir, setHazir] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHazir(true), gecikme);
    return () => clearTimeout(t);
  }, [gecikme]);
  return hazir ? deger : 0;
}

/* Defter marjı rengi — kırmızı damga mürekkebinin soluk hâli (yeni token değil, color-mix). */
const MARJ = `color-mix(in srgb, ${R} 38%, transparent)`;

/* Süre kompozisyonu şeridi — dilimler soldan sağa "dolar" (scaleX, transform-only). */
function SlaSerit({ dilimler, toplam }) {
  return (
    <div>
      <div role="img" aria-label={dilimler.map((d) => `${d.n} ${d.l}`).join(", ")}
        style={{ display: "flex", gap: 3, height: 8, transformOrigin: "0 50%", ...giris(260, "pv-serit", 0.9) }}>
        {dilimler.map((d) => (
          <span key={d.l} title={`${d.l}: ${d.n}`}
            style={{ width: `${(d.n / toplam) * 100}%`, minWidth: 6, background: d.c, borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.xl}px`, marginTop: SP.s + 2 }}>
        {dilimler.map((d) => (
          <span key={d.l} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, ...TYPE.data, color: PAL.mut2 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: d.c, alignSelf: "center" }} />
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 15, color: PAL.ink, ...TNUM }}>{d.n}</span>
            {d.l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Gecikme hücresi — büyük rakam + birim. Cümle kaynağı hâlâ kalanMetin (title + aria);
   burada yalnız SAYI ile birimi ayrı tipografide basılır. Sayı yoksa cümle aynen yazılır. */
function GecikmeRakam({ sla, renk }) {
  const k = sla.kalan_gun;
  const cumle = kalanMetin(sla);
  if (!Number.isFinite(k) || (sla.durum !== "GECIKMIS" && k === 0)) {
    return <span style={{ ...TYPE.data, fontWeight: 600, color: DERIN_OF(renk) }}>{cumle}</span>;
  }
  return (
    <span title={cumle} style={{ display: "inline-flex", alignItems: "baseline", gap: 5, color: DERIN_OF(renk) }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 26, lineHeight: "28px", fontWeight: 800, fontStretch: `${genislik(sla)}%`, letterSpacing: "-.02em", ...TNUM }}>{Math.abs(k)}</span>
      <span style={{ ...TYPE.meta, fontWeight: 500, whiteSpace: "nowrap" }}>{sla.durum === "GECIKMIS" ? "gün gecikti" : "gün kaldı"}</span>
    </span>
  );
}

/* GENİŞLİK EKSENİ VERİYİ KODLAR (benchmark hamlesi #6): Archivo rakamı yasal süre yaklaştıkça
   SIKIŞIR — bol süre geniş (%125), son gün dar (%75), gecikmişte gecikme büyüdükçe en dar
   kesime (%62) iner; "sıkışan süre" harfin kendisinde okunur. Tek sinyal DEĞİL: renk (BANT)
   ikinci, üçgen ikon + "gün gecikti/kaldı" sözü üçüncü taşıyıcıdır. */
export function genislik(sla) {
  const k = sla?.kalan_gun;
  if (!Number.isFinite(k)) return 100;
  if (sla.durum === "GECIKMIS" || k < 0) return Math.max(62, Math.round(75 - Math.abs(k) / 5));
  return Math.min(125, 75 + k * 5);
}

const DEFTER_SUTUN = "44px minmax(0, 1fr) 128px 104px auto";

/* Sicil defteri satırı. Geniş ekranda 5 sütunlu ızgara; telefonda iki satıra iner (ad tam
   genişlik, künye + İşle altta) — hiçbir bilgi kırpılmaz, yatay kayma yok. */
function DefterSatir({ x, sira, onIsle, dar, gecikme }) {
  const gecikmis = x.sla.durum === "GECIKMIS";
  const renk = gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  const no = String(sira).padStart(2, "0");
  const isle = (
    <Btn onClick={() => onIsle(x.id)} ariaLabel={`${x.label} evrakını hemen işle`} style={{ padding: "4px 12px", minHeight: 32 }}>
      İşle <Icon.arrow width={14} height={14} />
    </Btn>
  );
  const ad = (
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.ui, fontWeight: 600, color: PAL.ink, minWidth: 0 }}>
        {/* Renk tek sinyal değil: üçgen ikon "dikkat" der (renk körlüğünde de okunur). */}
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(renk) }}><Icon.alert width={14} height={14} /></span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
      </span>
      <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, marginTop: 2, paddingLeft: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.sla.mevzuat}</span>
    </span>
  );
  const sonGun = x.sla.son_tarih
    ? <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, ...TNUM }}>{x.sla.son_tarih}</span>
    : <span style={{ ...TYPE.meta, color: PAL.mut3 }}>—</span>;

  if (dar) {
    return (
      <div style={{ padding: `${SP.m}px 0 ${SP.m}px ${SP.m}px`, borderTop: `1px solid ${PAL.line}`, ...giris(gecikme, "pv-yaz", 0.42) }}>
        <div style={{ display: "flex", gap: SP.s, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, paddingTop: 2, ...TNUM }}>{no}</span>
          {ad}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.s, minWidth: 0 }}>
          <GecikmeRakam sla={x.sla} renk={renk} />
          {x.sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>son {x.sla.son_tarih.slice(0, 5)}</span>}
          <span style={{ marginLeft: "auto" }}>{isle}</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: DEFTER_SUTUN, alignItems: "center", gap: SP.l,
      padding: `${SP.m}px 0`, borderTop: `1px solid ${PAL.line}`, ...giris(gecikme, "pv-yaz", 0.42) }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, textAlign: "right", paddingRight: SP.s, ...TNUM }}>{no}</span>
      {ad}
      <span style={{ textAlign: "right" }}><GecikmeRakam sla={x.sla} renk={renk} /></span>
      <span style={{ textAlign: "right" }}>{sonGun}</span>
      {isle}
    </div>
  );
}

/* Kahraman manşeti — dev rakam solda; sağ kolonda başlık + bağlam + (varsa) eylem. Rakam
   kutusu yazı gövdesine (≈cap height) kırpılır: NumberFlow kendi satır kutusunu taşır ve
   üstte ~0,3em ölü boşluk açıyordu — rakam kâğıda "oturmuyordu". */
function Manset({ sayi, renk, baslik, baglam, eylem, dar }) {
  const akan = useAcilisSayaci(sayi, 260);
  const boy = dar ? 88 : 132;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: dar ? SP.l : SP.xl + 4, flexWrap: dar ? "wrap" : "nowrap" }}>
      <span aria-hidden="true" style={{ display: "flex", alignItems: "center", height: boy * 0.76, flexShrink: 0,
        fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: boy, lineHeight: 1, letterSpacing: "-.05em",
        color: renk, ...TNUM }}>
        <NumberFlow value={akan} style={{ lineHeight: 1 }} />
      </span>
      <div style={{ flex: "1 1 280px", minWidth: "min(280px, 100%)" }}>
        <h3 style={{ margin: 0, fontFamily: DISPLAY, fontSize: dar ? 22 : 28, lineHeight: dar ? "26px" : "32px", fontWeight: 700,
          fontStretch: "110%", letterSpacing: "-.02em", color: PAL.ink, textWrap: "balance" }}>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{sayi} </span>
          {baslik}
        </h3>
        {baglam && <p style={{ margin: `${SP.s}px 0 0`, ...TYPE.read, fontSize: 15, color: PAL.mut2, textWrap: "pretty", maxWidth: 620 }}>{baglam}</p>}
        {eylem && <div style={{ marginTop: SP.l }}>{eylem}</div>}
      </div>
    </div>
  );
}

/* Kâğıt yüzeyi — kahraman evrak. Üstte ince kırmızı "acele" kenarı (yalnız acil varken). */
const yuzey = (acele) => ({
  position: "relative", overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}`,
  borderRadius: RAD.card, boxShadow: SH.card,
  borderTop: acele ? `3px solid ${acele}` : `1px solid ${PAL.line}`,
});

/* Kuyruk durum sayımı + şerit dilimleri (eski KahramanBrif'ten AYNEN). */
function sayimVeDilim(kuyrukSla) {
  const say = { normal: 0, kritik: 0, gecikmis: 0, tarihYok: 0, diger: 0 };
  for (const x of kuyrukSla) {
    if (x.sla.durum === "NORMAL") say.normal++;
    else if (x.sla.durum === "KRITIK") say.kritik++;
    else if (x.sla.durum === "GECIKMIS") say.gecikmis++;
    else if (x.sla.durum === "tarih_yok") say.tarihYok++;   // Gelen'deki çip ile aynı sözlük
    else say.diger++;
  }
  const dilimler = [
    { c: BANT.yesil.c, n: say.normal, l: "normal takvim" },
    { c: BANT.sari.c, n: say.kritik, l: "kritik" },
    { c: BANT.kirmizi.c, n: say.gecikmis, l: "gecikmiş" },
    { c: T, n: say.tarihYok, l: "tarih doğrulanmalı" },   // bilgi durumu
    { c: PAL.mut3, n: say.diger, l: "süre tanımsız" },     // veri yok → tek nötr
  ].filter((d) => d.n > 0);
  return { say, dilimler };
}

/* Acil başlığı — sayımdan dürüst cümle: kritik yoksa "ya da kritik" demez. */
function acilBaslik(say) {
  if (say.gecikmis && say.kritik) return "evrakın yasal cevap süresi doldu ya da dolmak üzere";
  if (say.gecikmis) return "evrakın yasal cevap süresi doldu";
  return "evrakın yasal cevap süresi dolmak üzere";
}

export default function KahramanBrif({ kuyrukSla, onGoInbox, onIsle }) {
  const [acilRef] = useAutoAnimate();
  const dar = useDarEkran();
  const { say, dilimler } = sayimVeDilim(kuyrukSla);
  const acil = kuyrukSla
    .filter((x) => x.sla.durum === "GECIKMIS" || x.sla.durum === "KRITIK")
    .sort((a, b) => (a.sla.kalan_gun ?? 0) - (b.sla.kalan_gun ?? 0));
  const toplam = kuyrukSla.length || 1;
  const pad = dar ? SP.l : SP.xl + 4;

  if (acil.length === 0) {
    // Sükûnet hâli: dev rakam kuyruğun kendisi (mürekkep rengi, alarm değil) + ilk ufuk.
    const yaklasan = kuyrukSla
      .filter((x) => x.sla.durum === "NORMAL" && Number.isFinite(x.sla.kalan_gun))
      .sort((a, b) => a.sla.kalan_gun - b.sla.kalan_gun)[0];
    return (
      <section aria-label="Kuyruk yasal süre durumu" style={{ ...yuzey(null), padding: pad }}>
        <Manset sayi={kuyrukSla.length} renk={PAL.ink} dar={dar}
          baslik="evrak kuyrukta — tamamı normal takvimde"
          baglam={yaklasan ? `İlk yaklaşan süre: ${yaklasan.sla.son_tarih || `${yaklasan.sla.kalan_gun} gün`} — ${yaklasan.label}` : "Eskalasyon gerekmiyor."} />
        <div style={{ marginTop: SP.xl }}><SlaSerit dilimler={dilimler} toplam={toplam} /></div>
      </section>
    );
  }

  const enEski = acil[0];
  const baglam = `${kuyrukSla.length} evraklık kuyrukta · en acili: ${enEski.label} (${kalanMetin(enEski.sla)})`;
  const vurgu = say.gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  const gorunen = acil.slice(0, 5);

  return (
    <section aria-label="Bugünün brifi — kuyruk yasal süre durumu" style={{ ...yuzey(vurgu), height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: `${pad + 4}px ${pad}px ${pad - 4}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.l, ...TYPE.antet, color: PAL.mut3 }}>
          {/* Çalan saat: yalnız gerçek acil varken — hareket=bilgi. */}
          <span aria-hidden="true" style={{ display: "flex", color: DERIN_OF(vurgu), animation: "nu-alarm 2s linear infinite" }}>
            <Icon.clock width={14} height={14} />
          </span>
          <span>YASAL SÜRE BRİFİ</span>
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
        </div>
        <Manset sayi={acil.length} renk={DERIN_OF(vurgu)} dar={dar} baslik={acilBaslik(say)} baglam={baglam}
          eylem={(
            <Btn primary onClick={() => onIsle(acil[0].id)} ariaLabel={`En acil evrak: ${acil[0].label} — hemen işle`}>
              En acil evrakı işle <Icon.arrow />
            </Btn>
          )} />
        <div style={{ marginTop: SP.xl }}><SlaSerit dilimler={dilimler} toplam={toplam} /></div>
      </div>

      {/* Sicil defteri — marj çizgisi sıra no sütununun sağında, yukarıdan aşağı çizilir. */}
      <div style={{ position: "relative", flex: 1, padding: `0 ${pad}px ${SP.s}px`, background: PAL.surf2, borderTop: `1px solid ${PAL.line}` }}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: pad + (dar ? 0 : 44), width: 1,
          background: MARJ, transformOrigin: "50% 0", ...giris(320, "pv-cizgi", 0.7) }} />
        {!dar && (
          <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: DEFTER_SUTUN, gap: SP.l, padding: `${SP.m}px 0 ${SP.s}px`,
            ...TYPE.antet, fontSize: 10, color: PAL.mut3 }}>
            <span style={{ textAlign: "right", paddingRight: SP.s }}>SIRA</span>
            <span>EVRAK · YASAL DAYANAK</span>
            <span style={{ textAlign: "right" }}>DURUM</span>
            <span style={{ textAlign: "right" }}>SON GÜN</span>
            <span style={{ width: 64 }} />
          </div>
        )}
        <div ref={acilRef} role="list" aria-label="Süresi dolan ya da dolmak üzere olan evraklar">
          {gorunen.map((x, i) => (
            <div role="listitem" key={x.id}>
              <DefterSatir x={x} sira={i + 1} onIsle={onIsle} dar={dar} gecikme={380 + i * 70} />
            </div>
          ))}
        </div>
        {acil.length > 5 && (
          <button type="button" onClick={() => onGoInbox()} {...focusRing} data-press=""
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, width: "100%",
              padding: `${SP.m}px 0`, background: "transparent", border: "none", borderTop: `1px dashed ${PAL.lineHi}`,
              borderRadius: 0, ...TYPE.ui, fontWeight: 500, color: DERIN.T, transition: `background .12s ease, transform .14s ${EASE.out}`,
              ...giris(380 + gorunen.length * 70, "pv-yaz", 0.42) }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", ...TNUM }}>+{acil.length - 5}</span>
            {dar ? "evrak daha — kuyrukta" : "evrak daha — tümü kuyrukta aciliyet sırasıyla"} <Icon.arrow width={14} height={14} />
          </button>
        )}
      </div>
    </section>
  );
}
