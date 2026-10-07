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
import SureCetveli from "./PanelCetvel.jsx";
import { useMedyaSorgusu } from "../hooks/useMedya.js";
import NumberFlow from "@number-flow/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Btn, Damga, Icon, MONO, DISPLAY, T, R, TYPE, TNUM, SP, RAD, SH, EASE, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { kalanMetin, genislik } from "../lib/sureTakvimi.js";
import { useDarEkran } from "../hooks/useMedya.js";
import { HataFisi } from "./kabukAtomlari.jsx";

/* Panel'in yerel giriş koreografisi. Global reduced-motion kuralı (NEON_KEYFRAMES)
   `*{animation:none!important}` ile bunları da söndürür — ayrıca koşul gerekmez.
   pv-gir: blok girişi (yalnız yükselme + opaklık — tur 6: blur kaldırıldı; veri geç gelince
   alt yarı "bulanıktan netleşiyor" ve pahalı bir boyama yapıyordu) · pv-yaz: defter satırı (soldan, kalemle yazılır
   gibi kısa kayma) · pv-bas: takvim mührü (büyükten basılıp oturur) · pv-cizgi: marj çizgisi
   yukarıdan aşağı çizilir (scaleY, transform-only). */
export const PANEL_KF = `
@keyframes pv-gir{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pv-yaz{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@keyframes pv-bas{0%{opacity:0;transform:rotate(var(--pv-egim,-8deg)) scale(1.8)}60%{opacity:1;transform:rotate(var(--pv-egim,-8deg)) scale(.92)}100%{opacity:1;transform:rotate(var(--pv-egim,-8deg)) scale(1)}}
@keyframes pv-cizgi{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes pv-serit{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes pv-nefes{from{opacity:.7}to{opacity:1}}
@keyframes pv-ciz{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
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
export const MARJ = `color-mix(in srgb, ${R} 38%, transparent)`;

/* Süre kompozisyonu lejantı — sayı Archivo + söz (renk tek sinyal değil). */
function SeritLejant({ dilimler }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.xl}px`, marginTop: SP.s + 2 }}>
      {dilimler.map((d) => (
        <span key={d.l} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, ...TYPE.data, color: PAL.mut2 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: d.c, alignSelf: "center" }} />
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 15, color: PAL.ink, ...TNUM }}>{d.n}</span>
          {d.l}
        </span>
      ))}
    </div>
  );
}

/* Kuyruk bileşimi — ≥1600 px'te manşetin SAĞ SÜTUNU (tur 8: 1920'de manşet ~600 px'te kırılıp
   sağında ~400 px boş dikdörtgen kalıyordu). Lejantın büyük, dikey, cetvel-hizalı hâli. */
function BilesimSutun({ dilimler, toplam }) {
  return (
    <div style={{ flex: "0 0 248px", alignSelf: "stretch", paddingLeft: SP.xl, borderLeft: `1px solid ${PAL.line}` }}>
      <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.antet, color: PAL.mut3, ...TNUM }}>KUYRUK BİLEŞİMİ · {toplam}</p>
      {dilimler.map((d) => (
        <div key={d.l} style={{ display: "grid", gridTemplateColumns: "10px 44px minmax(0, 1fr)", alignItems: "baseline", columnGap: SP.s,
          padding: "5px 0", borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: PAL.mut2 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: d.c, alignSelf: "center" }} />
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "118%", fontSize: 22, lineHeight: "24px", color: PAL.ink, textAlign: "right", ...TNUM }}>{d.n}</span>
          <span style={{ minWidth: 0 }}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

/* Süre bandı — telefonda yığılı şerit (eski hâl), masaüstünde SÜRE CETVELİ (PanelCetvel).
   ≥1600 px'te lejant manşetin sağındaki BilesimSutun'a taşınır. */
function SureBandi({ dilimler, toplam, kuyrukSla, dar, cokGenis, odak, onOdak }) {
  if (dar) return <SlaSerit dilimler={dilimler} toplam={toplam} />;
  return (
    <div>
      <SureCetveli kuyrukSla={kuyrukSla} odak={odak} onOdak={onOdak} />
      {!cokGenis && <SeritLejant dilimler={dilimler} />}
    </div>
  );
}

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

/* Genişlik ekseni veriyi kodlar (hamle 6) — saf kural lib/sureTakvimi.genislik'te (testli);
   takvimin işaretli günleri de aynı kuralla sıkışır. */

/* Tur 6: DURUM ve SON GÜN sütunları geniş ekranda oranla büyür (1920'de ad ile durum
   arasında ~340 px ölü alan açılıyordu); SON GÜN, en eski evrakın tarih damgasını taşıyacak
   genişlikte (136). */
/* Tur 7: DURUM/SON GÜN sabit dar sütun, DURUM sola yaslı → ad uzar, ad ile durum arası
   ölü alan kapanır (1920 ölçümü); ad kesilmez. */
/* Tur 8: DURUM 132→116 (1440'ta ad kesiliyordu; "7 gün gecikti" 104 px'e sığar). */
const DEFTER_SUTUN = "44px minmax(0, 1fr) 116px 136px auto";

/* En eski gecikmiş evrakın SON GÜNÜ = kırmızı TARİH DAMGASI (resmî evrakın gelen-tarih
   ıstampası). Ekran başına ≤2 damga bütçesi bileşende zorlanır; burada yalnız 1. satır. */
/* Damga OTURUM başına bir kez basılır (tur 8 jüri: geç gelen veri satırı yeniden bağlayınca
   mühür baştan basılıyor, 1920 koyu çekimde hücre boş yakalanmıştı). */
const BASILAN_DAMGA = new Set();
function SonGun({ sla, damga, dar, id }) {
  const [animasyon] = useState(() => !BASILAN_DAMGA.has(id));
  useEffect(() => { BASILAN_DAMGA.add(id); }, [id]);
  if (!sla.son_tarih) return <span style={{ ...TYPE.meta, color: PAL.mut3 }}>—</span>;
  if (damga) {
    return (
      <span title={`Son gün ${sla.son_tarih} — süre geçti`} style={{ display: "inline-flex" }}>
        <Damga ton={R} egim={-5} kucuk oncelik={1} animasyon={animasyon}>{dar ? sla.son_tarih.slice(0, 5) : sla.son_tarih}</Damga>
      </span>
    );
  }
  return <span style={{ fontFamily: MONO, fontSize: dar ? 11 : 12, color: dar ? PAL.mut3 : PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>{dar ? `son ${sla.son_tarih.slice(0, 5)}` : sla.son_tarih}</span>;
}

/* Evrak adı + yasal dayanak. Dayanak yoksa yetim "—" yerine dürüst künye (tur 6). */
/* Geniş ekranda ad ile DURUM arasına defter "nokta dolgusu" (fihrist çizgisi) çekilir:
   1920'de kısa adla durum sütunu arasında ~300 px ölü alan kalıyordu; dolgu gözü satır
   boyunca rakama taşır (içindekiler sayfasının sayfa-no çizgisi). Telefonda yok. */
function DefterAd({ x, renk, normal, dolgu = false }) {
  const dayanak = /^[\s—–-]*$/.test(x.sla.mevzuat || "") ? null : x.sla.mevzuat;   // backend "—" = yok
  return (
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.ui, fontWeight: 600, color: PAL.ink, minWidth: 0 }}>
        {/* Renk tek sinyal değil: üçgen ikon "dikkat" der (renk körlüğünde de okunur). */}
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(renk) }}>{normal ? <Icon.clock width={14} height={14} /> : <Icon.alert width={14} height={14} />}</span>
        <span title={x.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto", minWidth: 0 }}>{x.label}</span>
        {/* Tur 8: dolgu taban-0 esnek → ad kesildiğinde genişliği 0'a iner (kesik ad + "…" + nokta
            çizgisi üst üste binmez); yalnız ad TAM sığdığında görünür. */}
        {dolgu && <span aria-hidden="true" style={{ flex: "1 1 0", minWidth: 0, alignSelf: "flex-end", marginBottom: 5, borderBottom: `2px dotted ${PAL.lineHi}` }} />}
      </span>
      <span style={{ display: "block", ...TYPE.meta, color: dayanak ? PAL.mut2 : PAL.mut3, marginTop: 2, paddingLeft: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {dayanak || "yasal dayanak belirlenmedi"}
      </span>
    </span>
  );
}

/* Sicil defteri satırı. Geniş ekranda 5 sütunlu ızgara; telefonda iki satıra iner (ad tam
   genişlik, künye + İşle altta) — hiçbir bilgi kırpılmaz, yatay kayma yok. */
function DefterSatir({ x, sira, onIsle, dar, gecikme, damga, odak, onOdak }) {
  const durum = x.sla.durum;
  const renk = durum === "GECIKMIS" ? BANT.kirmizi.c : durum === "KRITIK" ? BANT.sari.c : BANT.yesil.c;
  const normal = durum !== "GECIKMIS" && durum !== "KRITIK";
  const no = String(sira).padStart(2, "0");
  const isle = (
    <Btn onClick={() => onIsle(x.id)} ariaLabel={`${x.label} evrakını hemen işle`} style={{ padding: "6px 12px", minHeight: dar ? 44 : 36, whiteSpace: "nowrap" }}>
      İşle <Icon.arrow width={14} height={14} />
    </Btn>
  );
  if (dar) {
    return (
      <div style={{ padding: `${SP.m}px 0 ${SP.m}px ${SP.m}px`, borderTop: `1px solid ${PAL.line}`, ...giris(gecikme, "pv-yaz", 0.42) }}>
        <div style={{ display: "flex", gap: SP.s, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, paddingTop: 2, ...TNUM }}>{no}</span>
          <DefterAd x={x} renk={renk} normal={normal} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.s, minWidth: 0 }}>
          <GecikmeRakam sla={x.sla} renk={renk} />
          <SonGun sla={x.sla} damga={damga} id={x.id} dar />
          <span style={{ marginLeft: "auto" }}>{isle}</span>
        </div>
      </div>
    );
  }
  /* Mürekkep köprüsü (tur 8): satıra gelince takvimdeki günü ve cetveldeki iğneyi vurgular;
     karşı yuvadan gelen vurguda sıra no tükenmez mavisiyle basılır. Yalnız renk/zemin. */
  const vurgu = odak === x.id;
  const kopru = onOdak ? { onMouseEnter: () => onOdak(x.id), onMouseLeave: () => onOdak(null),
    onFocus: () => onOdak(x.id), onBlur: () => onOdak(null) } : null;
  return (
    <div {...kopru} style={{ display: "grid", gridTemplateColumns: DEFTER_SUTUN, alignItems: "center", gap: SP.l,
      padding: `${SP.m}px 0`, borderTop: `1px solid ${PAL.line}`, background: vurgu ? PAL.hov : "transparent",
      transition: `background .14s ${EASE.out}`, ...giris(gecikme, "pv-yaz", 0.42) }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: vurgu ? DERIN.T : PAL.mut3, fontWeight: vurgu ? 600 : 400, textAlign: "right", paddingRight: SP.s,
        transition: `color .14s ${EASE.out}`, ...TNUM }}>{no}</span>
      <DefterAd x={x} renk={renk} normal={normal} dolgu />
      <span style={{ textAlign: "left" }}><GecikmeRakam sla={x.sla} renk={renk} /></span>
      <span style={{ textAlign: "right" }}><SonGun sla={x.sla} damga={damga} id={x.id} /></span>
      {isle}
    </div>
  );
}

/* Defterin devamı (tur 8): kart takvimin boyuna gerildiğinde son satırın altı boş kart
   yüzeyiydi (1440'ta ~70 px). Artık sayfa sürer: soluklaşan boş cetvel çizgileri + soluk marj —
   boş defter sayfasının kendisi; içerik iddia etmez (aria-hidden). Kalan yüksekliği bu kaplar. */
function DefterDevami({ gecikme }) {
  return (
    <div aria-hidden="true" style={{ flex: 1, minHeight: 0, position: "relative", ...giris(gecikme, "pv-gir", 0.4),
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 31px, ${PAL.line} 31px 32px)`,
      WebkitMaskImage: "linear-gradient(to bottom, rgb(0 0 0 / .7), transparent)", maskImage: "linear-gradient(to bottom, rgb(0 0 0 / .7), transparent)" }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, left: 44, width: 1, background: MARJ }} />
    </div>
  );
}

/* Defterin alt kenarına sabit "devamı" satırı — kuyruğun geri kalanına tek ikincil yol. */
function DevamSatiri({ onClick, gecikme, children }) {
  return (
    <button type="button" onClick={onClick} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, width: "100%",
        padding: `${SP.m}px 0`, background: "transparent", border: "none", borderTop: `1px dashed ${PAL.lineHi}`,
        borderRadius: 0, ...TYPE.ui, fontWeight: 500, color: DERIN.T, transition: `background .14s ${EASE.out}, transform .14s ${EASE.out}`,
        ...giris(gecikme, "pv-yaz", 0.42) }}>
      {children} <Icon.arrow width={14} height={14} />
    </button>
  );
}

/* Sicil defteri — acil hâlde süresi dolan/dolmak üzere olanlar; sükûnette SIRADAKİ süreler
   (tur 3: sükûnet kahramanı takvim boyuna gerilip ortada tek manşetle boş kalıyordu; artık
   aynı defter "ufku" gösterir — veri aynı kuyrukSla, yalnız süzgeç farklı). */
function Defter({ liste, pad, dar, onIsle, onGoInbox, etiket, fazlaMetin, damgali = false, odak, onOdak, kuyrukN = 0 }) {
  const [acilRef] = useAutoAnimate();
  const gorunen = liste.slice(0, 5);
  return (
    <>
      {/* Sicil defteri — marj çizgisi sıra no sütununun sağında, yukarıdan aşağı çizilir. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `0 ${pad}px ${SP.s}px`, background: PAL.surf2, borderTop: `1px solid ${PAL.line}` }}>
        {/* Marj çizgisi YALNIZ yazılı satırlar boyunca iner (kart takvim boyuna gerildiğinde
            "+N evrak daha"nın altında boş inen kırmızı çizgi bırakmıyordu — tur 6 denetimi). */}
        <div style={{ position: "relative" }}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: dar ? 0 : 44, width: 1,
          background: MARJ, transformOrigin: "50% 0", ...giris(320, "pv-cizgi", 0.7) }} />
        {!dar && (
          <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: DEFTER_SUTUN, gap: SP.l, padding: `${SP.m}px 0 ${SP.s}px`,
            ...TYPE.antet, fontSize: 10, color: PAL.mut3 }}>
            <span style={{ textAlign: "right", paddingRight: SP.s }}>SIRA</span>
            <span>EVRAK · YASAL DAYANAK</span>
            <span>DURUM</span>
            <span style={{ textAlign: "right" }}>SON GÜN</span>
            <span style={{ width: 66 }} />
          </div>
        )}
        <div ref={acilRef} role="list" aria-label={etiket}>
          {gorunen.map((x, i) => (
            <div role="listitem" key={x.id}>
              <DefterSatir x={x} sira={i + 1} onIsle={onIsle} dar={dar} gecikme={380 + i * 70} damga={damgali && i === 0 && x.sla.durum === "GECIKMIS"}
                odak={odak} onOdak={onOdak} />
            </div>
          ))}
        </div>
        </div>
        {!dar && <DefterDevami gecikme={380 + gorunen.length * 70} />}
        {!dar && liste.length <= 5 && kuyrukN > liste.length && (
          <DevamSatiri onClick={() => onGoInbox()} gecikme={380 + gorunen.length * 70}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", ...TNUM }}>{kuyrukN - liste.length}</span>
            evrak daha kuyrukta — Gelen evrakı aç
          </DevamSatiri>
        )}
        {liste.length > 5 && (
          <button type="button" onClick={() => onGoInbox()} {...focusRing} data-press=""
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, width: "100%",
              padding: `${SP.m}px 0`, background: "transparent", border: "none", borderTop: `1px dashed ${PAL.lineHi}`,
              borderRadius: 0, ...TYPE.ui, fontWeight: 500, color: DERIN.T, transition: `background .12s ease, transform .14s ${EASE.out}`,
              ...giris(380 + gorunen.length * 70, "pv-yaz", 0.42) }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", ...TNUM }}>+{liste.length - 5}</span>
            {dar ? "evrak daha — kuyrukta" : `evrak daha — ${fazlaMetin}`} <Icon.arrow width={14} height={14} />
          </button>
        )}
      </div>
    </>
  );
}

/* Kahraman manşeti — dev rakam solda; sağ kolonda başlık + bağlam + künye + (varsa) eylem.
   Rakam kutusu cap-height'a kırpılı (boy × 0,76); başlık da `text-box: cap` ile kırpılır →
   rakamın üst kenarı ile başlığın büyük harf üstü AYNI çizgide (tur 6, eski hâlde h2'nin satır
   kutusu ~6 px aşağıdan başlıyordu). Geniş ekranda rakam ve başlık akışkan büyür (1920'de
   kahraman 1060 px'lik kartta küçük kalıyordu). */
const RAKAM_BOY = "clamp(132px, 8.4vw, 168px)";
/* Sakin hâl rakamı bir boy küçük (tur 8 jüri: "hiçbirinde süre tanımlı değil" acil hâlle aynı sesle bağırıyordu). */
const RAKAM_BOY_SAKIN = "clamp(99px, 6.3vw, 126px)";
function Manset({ sayi, renk, baslik, baglam, kunye, eylem, dar, yan, sakin }) {
  const akan = useAcilisSayaci(sayi, 260);
  const boy = dar ? "88px" : sakin ? RAKAM_BOY_SAKIN : RAKAM_BOY;   // telefon düzeni korunur
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: dar ? SP.l : SP.xl + 4, flexWrap: dar ? "wrap" : "nowrap" }}>
      {/* overflow:hidden (tur 3): açılış sayımında NumberFlow'un dönen rakam şeridi kutunun
          dışına taşıyordu. Kutu cap-height'a kırpılı → tam bir "sayaç penceresi". */}
      <span aria-hidden="true" style={{ display: "flex", alignItems: "center", height: `calc(${boy} * .76)`, flexShrink: 0, overflow: "hidden",
        fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: boy, lineHeight: 1, letterSpacing: "-.05em",
        color: renk, ...TNUM }}>
        <NumberFlow value={akan} style={{ lineHeight: 1 }} />
      </span>
      <div style={{ flex: "1 1 280px", minWidth: "min(280px, 100%)" }}>
        {/* Tur 8 jüri: 1920'de başlık tek satırda ~1000 px uzanıyordu → ölçü ≤22ch (masaüstü). */}
        <h2 style={{ margin: 0, maxWidth: dar ? "none" : "22ch", fontFamily: DISPLAY, fontSize: dar ? 22 : "clamp(28px, 2vw, 40px)", lineHeight: 1.16, fontWeight: 700,
          fontStretch: "110%", letterSpacing: "-.02em", color: PAL.ink, textWrap: "balance", textBox: "trim-both cap alphabetic" }}>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{sayi} </span>
          {baslik}
        </h2>
        {baglam && <p style={{ margin: `${SP.m}px 0 0`, ...TYPE.read, fontSize: 15, color: PAL.mut2, textWrap: "pretty", maxWidth: 620 }}>{baglam}</p>}
        {kunye && <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.antet, color: PAL.mut3, ...TNUM }}>{kunye}</p>}
        {eylem && <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, marginTop: SP.l }}>{eylem}</div>}
      </div>
      {yan}
    </div>
  );
}

/* Antet satırı — İKİ hâlde de basılır (tur 6: sakin hâlde yoktu, iki hâl iki ayrı bileşen
   gibi duruyordu). Acil hâlde saat ikonu açılışta İKİ salvo çalar ve durur (eskiden sonsuz
   döngüydü — her sabah açılan iş aracında dikkat sömüren tek hareket). `alarmAnahtar`
   değişince (yeni gecikme) span yeniden bağlanır → salvo yeniden çalar. */
function AntetSatir({ vurgu, alarmAnahtar, sag }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.l, ...TYPE.antet, color: PAL.mut3 }}>
      <span key={alarmAnahtar} aria-hidden="true" style={{ display: "flex", color: vurgu ? DERIN_OF(vurgu) : PAL.mut2,
        animation: vurgu ? "nu-alarm 2s linear 2" : "none" }}>
        <Icon.clock width={14} height={14} />
      </span>
      <span>YASAL SÜRE ÖZETİ</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
      {sag && <span style={{ ...TNUM }}>{sag}</span>}
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

/* ---------- Yükleme iskeleti ("kuruyan mürekkep") ---------- */

/* İskelet çizgisi — kurşun kalem izi (PAL.surfHi). Tek kaynak: brif, takvim ve gözlem iskeletleri. */
/* Tur 6: PAL.surfHi açık temada ~1,05:1 idi (iskelet görünmüyordu) — artık lineHi'nin ¾'ü. */
export const ISKELET_MUREKKEP = `color-mix(in srgb, ${PAL.lineHi} 75%, transparent)`;
export const iskeletCizgi = (width, height, ek) => ({ display: "block", flexShrink: 0, width, height, borderRadius: RAD.chip, background: ISKELET_MUREKKEP, ...ek });
/* Nefes — iskelet yüzeyinin yavaş opaklık salınımı (transform yok; reduced-motion söndürür). */
export const iskeletNefes = (gecikme = 0) => ({ animation: `pv-nefes .9s ease-in-out ${gecikme}ms infinite alternate both` });

/* Ölçüler gerçek KahramanBrif'in "acil" hâlinden alındı (statik örnek kuyruğunun olağan hâli;
   412 ve 1440 px'te DOM ölçümü, 2026-10-03). İskelet bu kutularla AYNI yüksekliği kaplar —
   SLA gelince brif yerine oturur, altındaki takvim/akış yerinden oynamaz (CLS: telefonda
   brif iskeletsizken akışın üstüne 1050 px'lik blok iniyordu → 0,38). Metin satır sayıları
   tipik kırılımdır; veri farklı kırılırsa fark birkaç satırla sınırlı kalır. */
const ISKELET_OLCU = {
  dar: { baslikSatir: 2, baslikLh: 26, baglamSatir: 3, dugme: 44, lejantSatir: 2, lejantLh: 20, defterSatir: 115, defterBaslik: 0 },
  genis: { baslikSatir: 1, baslikLh: 32, baglamSatir: 2, dugme: 38, lejantSatir: 1, lejantLh: 18, defterSatir: 63, defterBaslik: 34 },
};
const BAGLAM_LH = 24;          // TYPE.read 15px gövdesinin satır yüksekliği
const FAZLA_SATIR = 45;        // "+N evrak daha" satırı
const ISKELET_SATIR_N = 5;     // Defter ilk 5 satırı gösterir (bkz. Defter.gorunen)

function SatirCizgileri({ n, lh, genislikler }) {
  return Array.from({ length: n }, (_, i) => (
    <span key={i} style={{ display: "flex", alignItems: "center", height: lh }}>
      <span style={iskeletCizgi(genislikler[i % genislikler.length], Math.round(lh * 0.5))} />
    </span>
  ));
}

export function BrifIskelet() {
  const dar = useDarEkran();
  const o = ISKELET_OLCU[dar ? "dar" : "genis"];
  const pad = dar ? SP.l : SP.xl + 4;
  const boy = dar ? 88 : 132;   // Manset'in dev rakam boyu (geniş ekranda akışkan; iskelet tabanı alır)
  return (
    <section aria-hidden="true" style={{ ...yuzey(PAL.line), height: "100%", display: "flex", flexDirection: "column", ...iskeletNefes() }}>
      <div style={{ padding: `${pad + 4}px ${pad}px ${pad - 4}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, height: 14, marginBottom: SP.l }}>
          <span style={iskeletCizgi(14, 14)} />
          <span style={iskeletCizgi(116, 10)} />
          <span style={{ flex: 1, height: 1, background: PAL.line }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: dar ? SP.l : SP.xl + 4, flexWrap: dar ? "wrap" : "nowrap" }}>
          <span style={iskeletCizgi(Math.round(boy * 0.74), Math.round(boy * 0.76))} />
          <div style={{ flex: "1 1 280px", minWidth: "min(280px, 100%)" }}>
            <SatirCizgileri n={o.baslikSatir} lh={o.baslikLh} genislikler={["88%", "56%"]} />
            <div style={{ marginTop: SP.s }}><SatirCizgileri n={o.baglamSatir} lh={BAGLAM_LH} genislikler={["94%", "78%", "42%"]} /></div>
            <span style={iskeletCizgi(188, o.dugme, { marginTop: SP.l, borderRadius: RAD.ctl })} />
          </div>
        </div>
        <div style={{ marginTop: SP.xl }}>
          <span style={iskeletCizgi("100%", 8, { borderRadius: 2 })} />
          <div style={{ marginTop: SP.s + 2 }}><SatirCizgileri n={o.lejantSatir} lh={o.lejantLh} genislikler={["72%", "48%"]} /></div>
        </div>
      </div>
      <div style={{ flex: 1, padding: `0 ${pad}px ${SP.s}px`, background: PAL.surf2, borderTop: `1px solid ${PAL.line}` }}>
        {o.defterBaslik > 0 && (
          <div style={{ display: "flex", alignItems: "center", height: o.defterBaslik }}><span style={iskeletCizgi(220, 8)} /></div>
        )}
        {Array.from({ length: ISKELET_SATIR_N }, (_, i) => (
          <div key={i} style={{ boxSizing: "border-box", height: o.defterSatir, display: "flex", flexDirection: "column", justifyContent: "center",
            gap: SP.s, borderTop: `1px solid ${PAL.line}` }}>
            <span style={iskeletCizgi(`${[64, 52, 70, 46, 58][i]}%`, 12)} />
            <span style={iskeletCizgi(`${[38, 44, 30, 40, 34][i]}%`, 9)} />
          </div>
        ))}
        <div style={{ boxSizing: "border-box", height: FAZLA_SATIR, display: "flex", alignItems: "center", justifyContent: "center",
          borderTop: `1px dashed ${PAL.lineHi}` }}><span style={iskeletCizgi(170, 10)} /></div>
      </div>
    </section>
  );
}

/* SLA servisi hatası — kahraman yuvası BOŞ kalmaz (tur 6): manşet kuyruğun kendisi, süre
   uydurulmaz; ekranın tek primary'si "Kuyruğu aç", yanında ikincil "Yeniden dene". */
export function BrifHata({ kuyrukN, onGoInbox, onYeniden, saglamCumle }) {
  return (
    <HataFisi ton="uyari" baslik="Yasal süreler şu an hesaplanamadı" onYenidenDene={onYeniden}
      ikincil={<Btn onClick={() => onGoInbox()} ariaLabel="Gelen evrak kuyruğunu aç">Kuyruğu aç ({kuyrukN}) <Icon.arrow /></Btn>}
      style={{ height: "100%" }}>
      Süre servisi yanıt vermedi; takvim ve aciliyet sırası gizlendi, tahmini süre gösterilmez.
      {/* Tur 8 jüri: sabit "gözlem verileri etkilenmedi" aynı ekrandaki geçmiş fişini yalanlıyordu —
          cümle artık gerçek kaynak durumundan (kaynakOzeti); sağlam kaynak yoksa basılmaz. */}
      {saglamCumle ? ` ${saglamCumle.charAt(0).toLocaleUpperCase("tr")}${saglamCumle.slice(1)}.` : ""}
    </HataFisi>
  );
}

/* Süre tanımlı evrak YOK (tur 8, jüri "boş hâl 4,5"): SLA servisi BAŞARILI döndü ama hiçbir
   kuyruk evrakı için son gün hesaplanmadı. Eskiden bu hâl boş diziden "SLA yolda" sanılıyor,
   iskelet sonsuza dek "yükleniyor" diyordu. Artık sakin, dürüst bir kahraman: kuyruk sayısı +
   tek primary "Kuyruğu aç". Süre uydurulmaz. */
export function SureYokBrif({ kuyrukN, onGoInbox }) {
  const dar = useDarEkran();
  const genis = useMedyaSorgusu("(min-width: 1200px)");
  const pad = dar ? SP.l : SP.xl + 4;
  /* Geniş ekranda sağ sütun dolu hâlle aynı: kuyruk bileşimi (tek kalem — süre tanımsız). */
  const yan = genis && !dar ? <BilesimSutun dilimler={[{ l: "süre tanımsız", n: kuyrukN, c: PAL.mut3 }]} toplam={kuyrukN} /> : null;
  return (
    <section aria-label="Kuyruk yasal süre durumu" style={{ ...yuzey(null), padding: `${pad + 4}px ${pad}px ${pad}px` }}>
      <AntetSatir vurgu={null} sag="SÜRE TANIMLI EVRAK YOK" />
      <Manset sayi={kuyrukN} renk={PAL.mut2} dar={dar} sakin
        baslik="evrak kuyrukta — hiçbirinde yasal süre tanımlı değil"
        baglam="Süre servisi yanıt verdi; kuyruktaki evrakların hiçbiri için son gün hesaplanamadı. Son gün, evrak işlendiğinde türüne ve dayanağına göre belirlenir."
        kunye={`KUYRUK ${String(kuyrukN).padStart(2, "0")} · SON GÜN —`}
        eylem={<Btn primary onClick={() => onGoInbox()} ariaLabel="Gelen evrak kuyruğunu aç">Kuyruğu aç <Icon.arrow /></Btn>} yan={yan} />
    </section>
  );
}

/* Kahraman gövdesi — antet + manşet + süre bandı; iki hâl (acil · sakin) aynı iskelet. */
function UstBlok({ pad, children }) {
  return <div style={{ padding: `${pad + 4}px ${pad}px ${pad - 4}px` }}>{children}</div>;
}

/* Sükûnet hâli: dev rakam kuyruğun kendisi (mürekkep rengi, alarm değil) + sıradaki süreler. */
function SakinBrif({ kuyrukSla, dilimler, toplam, onIsle, onGoInbox, dar, cokGenis, pad, odak, onOdak }) {
  const siradaki = kuyrukSla
    .filter((x) => x.sla.durum === "NORMAL" && Number.isFinite(x.sla.kalan_gun))
    .sort((a, b) => a.sla.kalan_gun - b.sla.kalan_gun);
  const yaklasan = siradaki[0];
  return (
    <section aria-label="Kuyruk yasal süre durumu" style={{ ...yuzey(null), height: "100%", display: "flex", flexDirection: "column" }}>
      <UstBlok pad={pad}>
        <AntetSatir vurgu={null} sag="ACİL YOK" />
        <Manset sayi={kuyrukSla.length} renk={PAL.ink} dar={dar}
          baslik="evrak kuyrukta — tamamı normal takvimde"
          baglam={yaklasan ? `İlk yaklaşan süre: ${yaklasan.label}` : "Eskalasyon gerekmiyor."}
          kunye={yaklasan ? `SON GÜN ${yaklasan.sla.son_tarih || "—"} · ${yaklasan.sla.kalan_gun} GÜN KALDI` : null}
          eylem={yaklasan ? (
            <Btn primary onClick={() => onIsle(yaklasan.id)} ariaLabel={`İlk yaklaşan evrak: ${yaklasan.label} — işle`}>
              Sıradaki evrakı işle <Icon.arrow />
            </Btn>
          ) : null}
          yan={cokGenis ? <BilesimSutun dilimler={dilimler} toplam={toplam} /> : null} />
        <div style={{ marginTop: SP.xl }}><SureBandi dilimler={dilimler} toplam={toplam} kuyrukSla={kuyrukSla} dar={dar} cokGenis={cokGenis} odak={odak} onOdak={onOdak} /></div>
      </UstBlok>
      {siradaki.length > 0 && (
        <Defter liste={siradaki} pad={pad} dar={dar} onIsle={onIsle} onGoInbox={onGoInbox} odak={odak} onOdak={onOdak} kuyrukN={kuyrukSla.length}
          etiket="Sıradaki yasal süreler" fazlaMetin="tümü kuyrukta" />
      )}
    </section>
  );
}

export default function KahramanBrif({ kuyrukSla, onGoInbox, onIsle, kuyrukN = kuyrukSla.length, odak = null, onOdak }) {
  const dar = useDarEkran();
  const cokGenis = useMedyaSorgusu("(min-width: 1760px)");
  const { say, dilimler } = sayimVeDilim(kuyrukSla);
  const acil = kuyrukSla
    .filter((x) => x.sla.durum === "GECIKMIS" || x.sla.durum === "KRITIK")
    .sort((a, b) => (a.sla.kalan_gun ?? 0) - (b.sla.kalan_gun ?? 0));
  const toplam = kuyrukSla.length || 1;
  const pad = dar ? SP.l : SP.xl + 4;
  const ortak = { dilimler, toplam, dar, cokGenis, pad, odak, onOdak };

  if (acil.length === 0) {
    return <SakinBrif kuyrukSla={kuyrukSla} onIsle={onIsle} onGoInbox={onGoInbox} {...ortak} />;
  }

  const enEski = acil[0];
  const vurgu = say.gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  /* Bağlam cümlesi parantezsiz; gecikme + son gün ayrı mono künye satırına iner. */
  const kunye = [kalanMetin(enEski.sla).toLocaleUpperCase("tr"), enEski.sla.son_tarih ? `SON GÜN ${enEski.sla.son_tarih}` : null].filter(Boolean).join(" · ");

  return (
    <section aria-label="Bugünün özeti — kuyruk yasal süre durumu" style={{ ...yuzey(vurgu), height: "100%", display: "flex", flexDirection: "column" }}>
      <UstBlok pad={pad}>
        <AntetSatir vurgu={vurgu} alarmAnahtar={`${say.gecikmis}-${say.kritik}`} sag={`${kuyrukSla.length} EVRAKLIK KUYRUK`} />
        <Manset sayi={acil.length} renk={DERIN_OF(vurgu)} dar={dar} baslik={acilBaslik(say)}
          baglam={`En acili: ${enEski.label}`} kunye={kunye}
          eylem={(
            <Btn primary onClick={() => onIsle(enEski.id)} ariaLabel={`En acil evrak: ${enEski.label} — hemen işle`}>
              En acil evrakı işle <Icon.arrow />
            </Btn>
          )}
          yan={cokGenis ? <BilesimSutun dilimler={dilimler} toplam={kuyrukSla.length} /> : null} />
        <div style={{ marginTop: SP.xl }}><SureBandi dilimler={dilimler} toplam={toplam} kuyrukSla={kuyrukSla} dar={dar} cokGenis={cokGenis} odak={odak} onOdak={onOdak} /></div>
      </UstBlok>
      <Defter liste={acil} pad={pad} dar={dar} onIsle={onIsle} onGoInbox={onGoInbox} damgali odak={odak} onOdak={onOdak} kuyrukN={kuyrukN}
        etiket="Süresi dolan ya da dolmak üzere olan evraklar" fazlaMetin="tümü kuyrukta aciliyet sırasıyla" />
    </section>
  );
}
