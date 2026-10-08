/* PanelGozlem — Panel'in GÖZLEM kuşağı (kahramanın arkasındaki sakin koro). PanelView'dan
   ayrıldı (dosya < 800 satır). Tur 6 değişiklikleri:
   · Dağılım: Risk Bandı üç ayrı çubuk ("0 (%0)" ×2) yerine kahramandaki SlaSerit diliyle TEK
     yığılı şerit + sayılı lejant — boş satırlar kalktı, kolon boyları eşitlendi.
   · Son İşlemler: satırlar artık IZGARA (kahramandaki defter gibi): nokta | evrak (+ mono tür
     künyesi) | durum (boşsa yer tutar) | birim | gün·saat. Çip satırdan satıra oynamaz.
     Telefonda nokta adın İÇİNDE, künye tek mono satırda; yetim nokta yok.
   · Tarih noktalı ("03.10 15:57") — defter/takvimle aynı ayırıcı.
   · Hata hâli "Yeniden dene" eylemi taşır. */
import { useMemo } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { RotateCw } from "lucide-react";
import { NeonCard, Btn, Icon, MONO, DISPLAY, T, V, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_GOSTER } from "./result-cards.jsx";
import { iskeletCizgi, iskeletNefes, MARJ } from "./PanelBrif.jsx";
import { useDarEkran, useMedyaSorgusu } from "../hooks/useMedya.js";
import { HataFisi } from "./kabukAtomlari.jsx";
import { GUN_MS, gunBasi } from "../lib/gunlukSeri.js";
import { kayitAdi } from "../lib/sohbetMetin.js";
import { noktaliGunSaat, noktaliSaat } from "../lib/panelBrifSaf.js";

/* ---------- Dağılım ---------- */

function BosKolon({ metin }) {
  return (
    <div>
      {[0.82, 0.54].map((w) => (
        <div key={w} aria-hidden="true" style={{ marginBottom: SP.m }}>
          <div style={{ height: 14, width: `${w * 60}%`, borderRadius: RAD.chip, background: PAL.surfHi, marginBottom: SP.xs }} />
          <div style={{ height: 10, width: `${w * 100}%`, borderRadius: RAD.chip, border: `1px dashed ${PAL.lineHi}` }} />
        </div>
      ))}
      <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2, textWrap: "pretty" }}>{metin}</p>
    </div>
  );
}

function BarList({ rows, color, bos = "Kayıt yok." }) {
  if (!rows.length) return <BosKolon metin={bos} />;
  const max = rows[0][1] || 1;
  return rows.map(([label, c]) => (
    <div key={label} title={`${label}: ${c} evrak`} style={{ marginBottom: SP.m }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: SP.s, ...TYPE.data, color: PAL.mut2, marginBottom: SP.xs }}>
        <span style={{ color: PAL.ink2, fontWeight: 500, minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textWrap: "pretty" }}>{label}</span>
        <span style={{ color: DERIN_OF(color), fontWeight: 600, ...TNUM, flexShrink: 0 }}>{c}</span>
      </div>
      <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
        {/* Koyuda doygun mor/mavi rakamları bastırıyordu (tur 8 jüri) → çubuk yüzeyle karışık bir kademe sönük. */}
        <div style={{ height: "100%", width: `${Math.round((c / max) * 100)}%`, background: `color-mix(in srgb, ${color} 78%, ${PAL.surf})`, borderRadius: RAD.chip }} />
      </div>
    </div>
  ));
}

function KolonBaslik({ children }) {
  return <p style={{ margin: `0 0 ${SP.m}px`, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{children}</p>;
}

/* Risk bandı — tek yığılı şerit (SlaSerit dili) + üç satırlık sayılı lejant. Sıfır kalemler
   lejantta soluk durur (bandın varlığı bilgidir), şeritte yer kaplamaz. Yüzde YOK: CLAUDE.md
   §7 risk dilinde yüzdeyi tek alana ayırır; burada adet yeterli. */
/* Tur 8 jüri: sütun 3 satırda bitip komşulardan ~60 px kısa kalıyordu → satırlar sütunun kalan
   boyuna eşit dağılır (flex:1) ve dördüncü satır TOPLAM'dır; üç sütunun tabanı aynı çizgide. */
function RiskSerit({ risk, n }) {
  const kalemler = ["yesil", "sari", "kirmizi"].map((k) => ({ k, ...BANT[k], adet: risk[k] }));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div role="img" aria-label={kalemler.map((x) => `${x.l} ${x.adet}`).join(", ")} style={{ display: "flex", gap: 3, height: 10 }}>
        {kalemler.filter((x) => x.adet > 0).map((x) => (
          <span key={x.k} title={`${x.l} · ${x.t}: ${x.adet}`} style={{ width: `${(x.adet / n) * 100}%`, minWidth: 6, background: x.c, borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ marginTop: SP.m, flex: 1, display: "flex", flexDirection: "column" }}>
        {kalemler.map((x) => (
          <div key={x.k} style={{ flex: 1, display: "flex", alignItems: "center", gap: SP.s, padding: "5px 0", borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: x.adet ? PAL.ink2 : PAL.mut3 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: x.adet ? x.c : "transparent", border: `1px solid ${x.c}`, alignSelf: "center" }} />
            <span style={{ fontWeight: 600, color: x.adet ? DERIN_OF(x.c) : PAL.mut3 }}>{x.l}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{x.t}</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 15, color: x.adet ? PAL.ink : PAL.mut3, ...TNUM }}>{x.adet}</span>
          </div>
        ))}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: SP.s, borderTop: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, ...TNUM }}>
          <span style={{ flex: 1 }}>TOPLAM İŞLEM</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "112%", fontSize: 15, color: PAL.ink }}>{n}</span>
        </div>
      </div>
    </div>
  );
}

export function DagilimYuzeyi({ n, risk, turList, birimList, ortGuven, genis }) {
  if (n < 3) {
    return (
      <NeonCard title="Dağılım" accent={T} icon={<Icon.chart width={16} height={16} />}>
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Dağılım özeti 3 işlemden sonra oluşur — {3 - n} evrak kaldı.</p>
      </NeonCard>
    );
  }
  const kolonStil = (i) => ({ minWidth: 0, display: "flex", flexDirection: "column", paddingLeft: genis && i > 0 ? SP.l : 0, borderLeft: genis && i > 0 ? `1px solid ${PAL.line}` : "none",
    paddingTop: !genis && i > 0 ? SP.l : 0, borderTop: !genis && i > 0 ? `1px solid ${PAL.line}` : "none" });
  return (
    <NeonCard title="Dağılım" accent={T} icon={<Icon.chart width={16} height={16} />} tag={ortGuven != null ? `ort. tür güveni %${ortGuven}` : undefined}>
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(3, minmax(0, 1fr))" : "1fr", gap: SP.l }}>
        <div style={kolonStil(0)}><KolonBaslik>Risk Bandı</KolonBaslik><RiskSerit risk={risk} n={n} /></div>
        {/* Tür = ıstampa moru, birim = tükenmez mavisi — sütun kimliği renkten de okunur. */}
        <div style={kolonStil(1)}><KolonBaslik>Evrak Türü</KolonBaslik><BarList rows={turList} color={V} /></div>
        <div style={kolonStil(2)}>
          <KolonBaslik>Havale Edilen Birim</KolonBaslik>
          <BarList rows={birimList} color={T}
            bos="Henüz kayıtlı havale yok — birim yönlendirmesi doğrulanan evraklar burada birime göre sayılır." />
        </div>
      </div>
    </NeonCard>
  );
}

/* ---------- Birim bazlı gecikme ---------- */

/* Tur 8 (jüri): satırlar artık İşlenen arşivine giden DÜĞMELER (eylem çağrısı bir yere götürür)
   ve birimin havale adedini de taşır — Dağılım'daki "Havale Edilen Birim" ile aynı birim ekseni:
   "Park ve Bahçeler · 7 havale · 3 gecikmiş" tek satırda okunur. */
function BirimSatir({ birim, e, cip, onGoIslenen }) {
  return (
    <button type="button" onClick={() => onGoIslenen?.()} {...focusRing} data-press=""
      aria-label={`${birim}: ${e.havale} havale${e.gecikmis ? `, ${e.gecikmis} gecikmiş` : ""}${e.kritik ? `, ${e.kritik} kritik` : ""} — işlenen evrak arşivini aç`}
      onMouseEnter={(ev) => { ev.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", columnGap: SP.s, width: "100%",
        textAlign: "left", padding: `7px ${SP.xs}px`, background: "transparent", border: "none", borderTop: `1px solid ${PAL.line}`, borderRadius: 0,
        transition: `background .14s ${EASE.out}, transform .14s ${EASE.out}` }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={birim}>{birim}</span>
        <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, ...TNUM }}>{e.havale} havale</span>
      </span>
      <span style={{ display: "inline-flex", gap: SP.xs }}>
        {e.gecikmis > 0 && cip(BANT.kirmizi.c, `${e.gecikmis} gecikmiş`)}
        {e.kritik > 0 && cip(BANT.sari.c, `${e.kritik} kritik`)}
      </span>
    </button>
  );
}

export function BirimGecikmeKart({ rows, dar, onGoIslenen }) {
  const [ref] = useAutoAnimate();
  const varmi = rows.length > 0;
  const cip = (renk, metin) => (
    <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(renk), background: ALFA(renk), borderRadius: RAD.chip, padding: "2px 8px", whiteSpace: "nowrap", ...TNUM }}>{metin}</span>
  );
  return (
    <NeonCard title="Birim Bazlı Gecikme" accent={varmi ? BANT.kirmizi.c : BANT.yesil.c} tag={dar ? undefined : "havale + yasal süre"} icon={<Icon.clock />}>
      {varmi ? (
        <div ref={ref}>
          {rows.map(([birim, e]) => <BirimSatir key={birim} birim={birim} e={{ havale: 0, ...e }} cip={cip} onGoIslenen={onGoIslenen} />)}
        </div>
      ) : (
        <div style={{ display: "flex", gap: SP.m, alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 28, height: 28, flexShrink: 0, borderRadius: RAD.dot,
            color: DERIN.yesil, background: ALFA(BANT.yesil.c), border: `1px solid ${BANT.yesil.c}` }}>
            <Icon.check width={14} height={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Gecikmiş havale yok</p>
            <p style={{ margin: "2px 0 0", ...TYPE.data, color: PAL.mut2, textWrap: "pretty" }}>
              İşlenen evrakın hiçbiri, havale edildiği birimde yasal süresini aşmadı ya da kritik eşikte değil.
            </p>
          </div>
        </div>
      )}
    </NeonCard>
  );
}

/* ---------- Son işlemler (ızgaralı defter) ---------- */

/* Tur 8: durum sütunu YALNIZ satırlar arasında farklılaştığında var (8 satırın 8'inde aynı
   "karar bekliyor" çipi bilgi taşımıyor, evrak adını 200 px'e sıkıştırıyordu). Hepsi aynıysa
   durum grup başlığında TEK kez söylenir. */
/* Tur 8 jüri (2. tur): bant işareti "● S" tek harfi şifre gibiydi ve 8 satırın 8'inde aynıydı →
   bant sütunu da durum gibi YALNIZ farklılaştığında; aynıysa grup başlığında tek kez ("TÜMÜ SARI
   BANT"). ≥1600 px'te başlık ile birim arasındaki ~350 px boşluğa "SON GÜN" sütunu (yasal süre). */
/* Tur 9 jüri: tüm satırlarda aynı nokta bilgi taşımıyordu → bant ortaksa nokta sütunu YOK
   (başlık "TÜMÜ SARI BANT" der); <1600 px'te son gün meta satırına mono iner. */
const FEED_SUTUN = ({ cipli, bantli, sonGunlu }) => [bantli && "52px", "minmax(0, 1fr)", cipli && "112px", sonGunlu && "minmax(0, 168px)",
  cipli ? "minmax(0, 220px)" : "minmax(0, 240px)", "88px"].filter(Boolean).join(" ");
const bekliyorMu = (h) => !!(h.result?.yazi_taslak_md && !h.result?.onay_durumu);

function FeedSatir({ h, onGoIslenen, bugunGrubu, dar, cipli, bantli = true, sonGunlu = false }) {
  const bekliyor = cipli && bekliyorMu(h);
  const ad = kayitAdi({ konu: h.result?.bilgi_unsurlari?.konu, name: h.name, evrak_turu: h.evrak_turu });
  const saat = Number.isFinite(h.ts) ? (bugunGrubu ? noktaliSaat(h.ts) : noktaliGunSaat(h.ts)) : "";
  const birim = BIRIM_GOSTER(h.hedef_birim, h.evrak_turu);
  /* Renk tek sinyal değil: nokta + kısa bant adı (SARI) + ekran okuyucu metni. Bant tüm
     satırlarda aynıysa yalnız nokta (sütun bilgi taşımaz; ad grup başlığında). */
  const bant = BANT[h.bant];
  const nokta = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }} title={bant ? `${bant.l} · ${bant.t}` : "Risk bandı yok"}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: bant?.c || PAL.mut2 }} />
      {bantli && <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 10, lineHeight: "12px", fontWeight: 600, letterSpacing: ".04em",
        color: bant ? DERIN_OF(bant.c) : PAL.mut3 }}>{bant ? bant.l.toLocaleUpperCase("tr") : "—"}</span>}
    </span>
  );
  const sla = h.result?.sla_metadata;
  const sonGun = sla?.son_tarih ? (sla.durum === "GECIKMIS" ? `${sla.son_tarih} · gecikti` : sla.son_tarih) : "süre tanımsız";
  const riskSr = bant ? `, ${bant.l.toLocaleLowerCase("tr")} risk` : "";
  const git = () => onGoIslenen?.(h.id);
  const cip = bekliyor ? <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.sari, background: ALFA(BANT.sari.c), borderRadius: RAD.chip, padding: "2px 8px", whiteSpace: "nowrap" }}>karar bekliyor</span> : null;
  const adMetin = <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }} title={h.name}>{ad}</span>;
  const ortak = { cursor: "pointer", width: "100%", textAlign: "left", padding: `${SP.s}px ${SP.xs}px`, background: "transparent", border: "none",
    borderTop: `1px solid ${PAL.line}`, transition: `background .12s ease, transform .14s ${EASE.out}` };
  const hover = { onMouseEnter: (e) => { e.currentTarget.style.background = PAL.hov; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; } };
  if (dar) {
    return (
      <button type="button" onClick={git} aria-label={`${ad}${riskSr} — işlenen evrak arşivinde gör`} {...focusRing} {...hover} data-press="" style={{ ...ortak, display: "block" }}>
        <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>{nokta}{adMetin}<span style={{ marginLeft: "auto", flexShrink: 0 }}>{cip}</span></span>
        {/* Zaman ayrı, kırpılmaz sütunda: satırın asıl bilgisi; uzun birim adı yalnız kendi payında kısalır. */}
        <span style={{ display: "flex", gap: SP.s, marginTop: 2, paddingLeft: 30, fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, minWidth: 0, ...TNUM }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{EVRAK_TR(h.evrak_turu)} · {birim}</span>
          {saat && <span style={{ flexShrink: 0, whiteSpace: "nowrap", color: PAL.mut2 }}>{saat}</span>}
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={git} aria-label={`${ad}${riskSr} — işlenen evrak arşivinde gör`} {...focusRing} {...hover} data-press=""
      style={{ ...ortak, display: "grid", gridTemplateColumns: FEED_SUTUN({ cipli, bantli, sonGunlu }), alignItems: "center", columnGap: SP.m }}>
      {bantli && nokta}
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {adMetin}
        <span style={{ ...TYPE.meta, color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {EVRAK_TR(h.evrak_turu)}
          {!sonGunlu && <span style={{ fontFamily: MONO, fontSize: 11, color: sla?.durum === "GECIKMIS" ? DERIN.kirmizi : PAL.mut2, ...TNUM }}> · son gün {sonGun}</span>}
        </span>
      </span>
      {cipli && <span>{cip}</span>}
      {sonGunlu && <span style={{ fontFamily: MONO, fontSize: 12, color: sla?.durum === "GECIKMIS" ? DERIN.kirmizi : sla?.son_tarih ? PAL.ink2 : PAL.mut3,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...TNUM }} title="Yasal son gün">{sonGun}</span>}
      <span style={{ ...TYPE.meta, color: PAL.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={birim}>{birim}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, textAlign: "right", whiteSpace: "nowrap", ...TNUM }}>{saat}</span>
    </button>
  );
}

export function SonIslemlerFeed({ history, n, onGoIslenen }) {
  const [sonRef] = useAutoAnimate();
  const dar = useDarEkran();
  const gruplar = useMemo(() => {
    const bugun = gunBasi(Date.now());
    const g = { bugun: [], dun: [], eski: [] };
    for (const h of history.slice(0, 8)) {
      const t = Number.isFinite(h.ts) ? gunBasi(h.ts) : 0;
      if (t === bugun) g.bugun.push(h);
      else if (t === bugun - GUN_MS) g.dun.push(h);
      else g.eski.push(h);
    }
    return [["Bugün", g.bugun, true], ["Dün", g.dun, false], ["Daha eski", g.eski, false]].filter(([, list]) => list.length > 0);
  }, [history]);
  const ilk8 = history.slice(0, 8);
  const bekleyen = ilk8.filter(bekliyorMu).length;
  const cipli = bekleyen > 0 && bekleyen < ilk8.length;
  const bantlar = new Set(ilk8.map((h) => h.bant || ""));
  const bantli = bantlar.size > 1;
  const ortakBant = !bantli && BANT[ilk8[0]?.bant] ? `tümü ${BANT[ilk8[0].bant].l.toLocaleLowerCase("tr")} bant` : null;
  const sonGunlu = useMedyaSorgusu("(min-width: 1600px)") && !dar;
  const ortakDurum = [bekleyen === ilk8.length && bekleyen > 0 ? "tümü karar bekliyor" : null, ortakBant].filter(Boolean).join(" · ") || null;
  return (
    <NeonCard title="Son İşlemler" accent={T} tag={`son ${Math.min(history.length, 8)} / ${n}`} style={{ flex: 1, display: "flex", flexDirection: "column" }} bodyCenter>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Başlıklar ve satırlar aynı konteynerin DOĞRUDAN çocukları — auto-animate yalnız onları izler. */}
      <div ref={sonRef}>
        {gruplar.flatMap(([etiket, list, bugunGrubu]) => [
          <div key={`grup-${etiket}`} style={{ display: "flex", justifyContent: "space-between", gap: SP.m, ...TYPE.antet, fontSize: 11, color: PAL.mut2, padding: `${SP.s}px ${SP.xs}px ${SP.xs}px`, ...TNUM }}>
            <span>{etiket.toLocaleUpperCase("tr")} · {list.length}</span>
            {ortakDurum && <span style={{ color: DERIN.sari }}>{ortakDurum.toLocaleUpperCase("tr")}</span>}
          </div>,
          ...list.map((h) => <FeedSatir key={h.id} h={h} onGoIslenen={onGoIslenen} bugunGrubu={bugunGrubu} dar={dar} cipli={cipli || (dar && bekleyen > 0)} bantli={bantli} sonGunlu={sonGunlu} />),
        ])}
      </div>
      <span aria-hidden="true" style={{ flex: 1 }} />
      <button type="button" onClick={onGoIslenen} {...focusRing} data-press="" data-dokunma=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, width: "100%", padding: "10px 0", background: "transparent", border: "none", borderTop: `1px dashed ${PAL.lineHi}`, borderRadius: 0, ...TYPE.data, fontWeight: 500, color: DERIN.T, transition: `background .12s ease, transform .14s ${EASE.out}` }}>
        Tüm işlenen evrakı gör <Icon.arrow width={14} height={14} />
      </button>
      </div>
    </NeonCard>
  );
}

/* ---------- Gözlem: yükleniyor / hata ---------- */

/* Tur 9 jüri: iskelet düz gri çubuktu → `defter` kartında defter cetveli: mono sıra no sütunu
   + ACELE kırmızısı kenar çizgisi (kâğıt imzası); nabız 1,6 sn (reduced-motion'da statik). */
function IskeletKart({ satir, gecikme, satirH = 29, defter = false }) {
  return (
    <div aria-hidden="true" style={{ position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
      padding: SP.l + 4, ...iskeletNefes(gecikme) }}>
      {defter && <span style={{ position: "absolute", top: 0, bottom: 0, left: SP.l + 4 + 26, width: 1, background: MARJ, opacity: 0.7 }} />}
      <div style={iskeletCizgi(120, 14, { marginBottom: SP.l })} />
      {Array.from({ length: satir }, (_, i) => (
        <div key={i} style={{ boxSizing: "border-box", height: satirH, display: "flex", gap: SP.m, alignItems: "center", borderTop: `1px solid ${PAL.line}` }}>
          {defter ? <span style={{ width: 20, fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>{String(i + 1).padStart(2, "0")}</span>
            : <span style={iskeletCizgi(8, 8, { borderRadius: RAD.dot })} />}
          <span style={iskeletCizgi(`${[62, 48, 70, 40, 56][i % 5]}%`, 10, { flexShrink: 1 })} />
          <span style={iskeletCizgi(44, 10, { marginLeft: "auto" })} />
        </div>
      ))}
    </div>
  );
}

/* İskelet kartı kabuğu — NeonCard ile aynı dolgu/çerçeve; başlık çizgisi + gövde. */
function IskeletKabuk({ gecikme, children, esnek }) {
  return (
    <div aria-hidden="true" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
      padding: SP.l + 4, ...(esnek ? { flex: 1 } : null), ...iskeletNefes(gecikme) }}>
      <div style={iskeletCizgi(120, 14, { marginBottom: SP.l })} />
      {children}
    </div>
  );
}

/* Dağılım iskeleti — gerçek yüzeyin ÜÇ sütunu (tur 8 jüri: iskelet tek liste, veri gelince
   geometri sıçrıyordu). Sütun başına başlık + 4 satır (etiket + çubuk) = BarList satırı. */
function DagilimIskelet({ genis }) {
  return (
    <IskeletKabuk gecikme={0}>
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(3, minmax(0, 1fr))" : "1fr", gap: SP.l }}>
        {[0, 1, 2].map((k) => (
          <div key={k} style={{ minWidth: 0, paddingLeft: genis && k ? SP.l : 0, borderLeft: genis && k ? `1px solid ${PAL.line}` : "none" }}>
            <div style={iskeletCizgi(96, 12, { marginBottom: SP.m + 4 })} />
            {[0.86, 0.62, 0.48, 0.3].map((w) => (
              <div key={w} style={{ marginBottom: SP.m }}>
                <div style={{ display: "flex", justifyContent: "space-between", height: 18, marginBottom: SP.xs, alignItems: "center" }}>
                  <span style={iskeletCizgi(`${w * 70}%`, 9)} /><span style={iskeletCizgi(16, 9)} />
                </div>
                <div style={iskeletCizgi(`${w * 100}%`, 8, { borderRadius: RAD.chip })} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </IskeletKabuk>
  );
}

/* İşlem Süresi iskeleti — büyük ortalama + kronometre GRAFİK KUTUSU (etiket | çubuk | değer,
   7 satır × 22 px + eksen) + lejant + kıyas + düğme; gerçek kartla aynı bölgeler. */
function SureIskelet() {
  return (
    <IskeletKabuk gecikme={180} esnek>
      <div style={iskeletCizgi(92, 26, { marginBottom: SP.m })} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, 36%) minmax(0, 1fr) 50px", columnGap: SP.s, rowGap: 0 }}>
        <span style={{ gridColumn: "1 / -1", height: 20 }} />
        {[0.7, 0.42, 0.9, 0.55, 0.36, 0.62, 0.48].map((w, i) => [
          <span key={`a${i}`} style={{ display: "flex", alignItems: "center", height: 22 }}><span style={iskeletCizgi(`${60 + (i % 3) * 12}%`, 8)} /></span>,
          <span key={`b${i}`} style={{ display: "flex", alignItems: "center", height: 22 }}><span style={iskeletCizgi(`${w * 100}%`, 8, { borderRadius: "0 2px 2px 0" })} /></span>,
          <span key={`c${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: 22 }}><span style={iskeletCizgi(28, 8)} /></span>,
        ])}
        <span style={{ gridColumn: 2, height: 18, borderTop: `1px solid ${PAL.lineHi}` }} />
      </div>
      <div style={iskeletCizgi("70%", 9, { marginTop: SP.s })} />
      <div style={{ marginTop: SP.l, borderTop: `1px solid ${PAL.line}`, paddingTop: SP.m }}>
        {[0, 1].map((i) => <div key={i} style={iskeletCizgi(`${[78, 64][i]}%`, 10, { marginBottom: SP.s })} />)}
      </div>
      <div style={iskeletCizgi("100%", 38, { marginTop: SP.l, borderRadius: RAD.ctl })} />
    </IskeletKabuk>
  );
}

/* Gözlem iskeleti — gerçek kuşağın iki sütunu, gerçek kartların geometrisiyle. Sol: Dağılım
   (3 sütun) + Son İşlemler (grup başlığı + 8 satır); sağ: Birim Gecikme (6 satır) + Süre. */
function GozlemIskelet({ span, genis, kol }) {
  if (!genis) {
    return (
      <div style={{ ...span(12), display: "flex", flexDirection: "column", gap: SP.l + 4 }}>
        <DagilimIskelet genis={false} /><IskeletKart satir={9} gecikme={120} satirH={52} defter /><IskeletKart satir={4} gecikme={60} satirH={44} /><SureIskelet />
      </div>
    );
  }
  /* Gerçek kuşakla aynı 2×2 iç ızgara (tur 9): veri gelince kartlar yerinden oynamaz. */
  const hucre = (k) => ({ gridColumn: `span ${k}`, minWidth: 0, display: "flex", flexDirection: "column" });
  return (
    <div data-gozlem-hucre-iskelet="" style={{ ...span(12), display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: SP.l + 4 }}>
      <div style={hucre(kol[0])}><DagilimIskelet genis /></div>
      <div style={hucre(kol[1])}><IskeletKart satir={4} gecikme={60} satirH={44} /></div>
      <div style={hucre(kol[0])}><IskeletKart satir={9} gecikme={120} satirH={44} defter /></div>
      <div style={hucre(kol[1])}><SureIskelet /></div>
    </div>
  );
}

export function GozlemAntet({ sag, giris, rol }) {
  return (
    <div role={rol} aria-hidden={rol ? undefined : "true"} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m, ...TYPE.antet, color: PAL.mut3, ...giris }}>
      <span>GÖZLEM</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
      <span style={{ ...TNUM }}>{sag}</span>
    </div>
  );
}

export function GozlemDurum({ yukleniyor, span, genis, kol = [8, 4], onYeniden, saglamCumle, birlesik }) {
  if (yukleniyor) {
    return (
      <>
        <GozlemAntet sag="İŞLEM GEÇMİŞİ YÜKLENİYOR" rol="status" />
        <GozlemIskelet span={span} genis={genis} kol={kol} />
      </>
    );
  }
  /* Birleşik fiş üstte söyledi → burada yalnız künye (ikinci fiş, ikinci düğme yok). */
  if (birlesik) return <GozlemAntet sag="İŞLEM GEÇMİŞİ ALINAMADI · ÜSTTEKİ FİŞE BAKIN" rol="status" />;
  return (
    <div style={span(12)}>
      <HataFisi baslik="İşlem geçmişi alınamadı"
        ikincil={onYeniden ? <Btn onClick={onYeniden}><RotateCw size={14} strokeWidth={1.75} aria-hidden="true" /> Yeniden dene</Btn> : null}>
        Kayıtlı işlemler sunucudan okunamadı; dağılım, süre ve son işlemler bu yüzden boş.
        {saglamCumle ? ` ${saglamCumle.charAt(0).toLocaleUpperCase("tr")}${saglamCumle.slice(1)}.` : ""}
      </HataFisi>
    </div>
  );
}
