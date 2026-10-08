/* SicilDefter — "evrak kayıt defteri" ortak atomları (Gelen · İşlenen · Giden · Denetim).
   Dört kayıt görünümü aynı defter dilini konuşur: beyaz evrak yüzeyi (masa = gri zemin),
   mono antet satırı gibi sütun başlığı, hairline satır ayraçları, solda/sağda sabit mono
   kayıt no sütunu. Izgara sütunları görünüm başına CSS değişkeniyle verilir
   (--sd-kolon / --sd-alan); telefonda ayrı alan haritası (--sd-alan-dar) devreye girer —
   bilgi gizlenmez, satır yeniden dizilir.

   Hover "fiziksel" ama sarsıntısız: zemin tonu + solda mürekkep cetveli (scaleY, yalnız
   transform) + kayıt no mürekkebe döner + satır eylemi belirginleşir. Klavye odağında
   aynısı (:focus-within). Giriş: satır başına kısa gecikmeli yükseliş (--sd-i).
   reduced-motion: neonUi global kuralı tüm animasyon/transition'ı kapatır. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Damga, Btn, PAL, T, V, TYPE, TNUM, MONO, RAD, SP, DERIN_OF, SR_ONLY } from "./neonUi.jsx";
import { SICIL_CSS } from "./SicilDefterStil.js";
import { FOSFOR_STIL } from "./kagitDoku.js";
import { vurguParcalari } from "../lib/defterArama.js";

/* CSS ayrı dosyada (SicilDefterStil.js) — geometri sözleşmesi orada. Geriye uyum için
   yeniden dışa aktarılır. */
export { SICIL_CSS };

/* Üç evrak defterinin (Gelen · İşlenen · Giden) ORTAK geometrisi — kayıt no sütunu ve
   kırmızı marj her defterde aynı x'te (bkz. SicilDefterStil). Satır adımı iki kademe. */
export const DEFTER_NO = "128px";
export const DEFTER_MARJ = "158px";
export const ADIM = { yogun: "64px", rahat: "84px" };

/* Stil tek sefer basılır — görünüm başına bir <SicilStil/> yeterli (aynı metin iki kez
   basılsa da zararsızdır; React aynı içerikli <style>'ı yeniden yazmaz). */
export const SicilStil = () => <style>{SICIL_CSS}</style>;

/* Kayıt no — "E-2026/" öneki sessiz, sıra numarası mürekkep. Ayrımın nedeni: defterde göz
   sıra numarasını tarar; önek her satırda aynıdır ve yalnız künye işlevi görür. */
export function SicilNo({ no, style }) {
  const s = String(no || "—");
  const kes = s.lastIndexOf("/");
  const onek = kes >= 0 ? s.slice(0, kes + 1) : "";
  const sira = kes >= 0 ? s.slice(kes + 1) : s;
  return (
    <span style={{ fontFamily: MONO, fontSize: 13, lineHeight: "18px", whiteSpace: "nowrap", ...TNUM, ...style }}>
      <span style={{ color: PAL.mut3 }}>{onek}</span>
      <span data-sd-no-sira="" style={{ color: PAL.ink, fontWeight: 600 }}>{sira}</span>
    </span>
  );
}

/* Sütun başlığı hücresi — antet dili (mono, izlemeli, büyük harf). Tablo semantiğinde
   columnheader'dır (DefterYuzey başlık satırı role=row). */
export const BaslikHucre = ({ alan, sag, children }) => (
  <span role="columnheader" style={{ gridArea: alan, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", textAlign: sag ? "right" : "left", whiteSpace: "nowrap" }}>{children}</span>
);

/* Sessiz durum çipi: nokta + metin. `vurgulu` yalnız istisna durumlarda tint zemin alır
   (kütle durumu tint taşımaz — 15/15 satırda aynı renkli çip gürültüdür). */
export function SessizCip({ renk, metin, vurgulu = false, ikon = null, title, mono = false }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      ...TYPE.meta, fontWeight: 500, ...(mono ? { fontFamily: MONO, fontSize: 11, letterSpacing: ".04em" } : null), ...TNUM,
      ...(vurgulu
        ? { padding: "2px 8px", borderRadius: RAD.chip, background: `color-mix(in srgb, ${renk} var(--ke-alfa, 8%), transparent)`, color: DERIN_OF(renk) }
        : { color: PAL.mut2 }) }}>
      {ikon || <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: renk || PAL.mut3, flexShrink: 0 }} />}
      {metin}
    </span>
  );
}

/* Defter yüzeyi — başlık satırı + satırlar. sablon: { kolon, alan, alanDar, kolonDar, marj, satir }.
   Semantik: gezinmeli defter role=grid (satır = row, hücre = gridcell; j/k ve ok tuşları
   satırlar arası), salt-okunur defter role=table. Klavye gezinmesi polite canlı bölgeden
   "3. kayıt / 15" olarak duyurulur. `dolgu`: kısa listede sayfanın devamı olarak çizilen boş
   cetvel satırı sayısı (salt görsel) — adım İLK GERÇEK SATIRDAN ölçülür, kayıt ritminden
   sapmaz; numara basılmaz (olmayan kaydın numarası yazılmaz). Telefonda dolgu yok. */
const sablonDegisken = (sablon) => ({
  "--sd-kolon": sablon.kolon, "--sd-alan": sablon.alan, "--sd-alan-dar": sablon.alanDar,
  ...(sablon.marj ? { "--sd-marj": sablon.marj } : null),
  ...(sablon.kolonDar ? { "--sd-kolon-dar": sablon.kolonDar } : null),
  ...(sablon.satir ? { "--sd-satir": sablon.satir } : null),
  "--sd-adim": sablon.satir || sablon.adim || "64px",
});

function useOlculenAdim(listeRef, etkin) {
  const [adim, setAdim] = useState(null);
  useEffect(() => {
    const kok = listeRef.current;
    if (!etkin || !kok || typeof ResizeObserver === "undefined") return undefined;
    const satir = kok.querySelector("[data-sicil-satir]");
    if (!satir) return undefined;
    const ro = new ResizeObserver(() => setAdim(Math.round(satir.getBoundingClientRect().height)));
    ro.observe(satir);
    return () => ro.disconnect();
  }, [listeRef, etkin]);
  return adim;
}

/* `folyo`: defter sayfasının dip künyesi ("SAYFA 1 · 1 KAYIT · SON KAYIT …") — gerçek sicil
   defterlerinin sayfa altı; ipucu şeridinin sağ ucuna oturur (telefonda şerit gizli). */
export function DefterYuzey({ sablon, basliklar, children, etiket, style, listeRef, gezinme, ipucu, folyo, rol, dolgu = 0, dolguNotu = "", uzar = false, secimli = false }) {
  const icRef = useRef(null);
  const baglaListe = useCallback((el) => {
    icRef.current = el;
    if (typeof listeRef === "function") listeRef(el); else if (listeRef) listeRef.current = el;
  }, [listeRef]);
  const olculen = useOlculenAdim(icRef, dolgu > 0);
  const semantik = rol || null;
  /* grid/table rolü <section>'a verilemez (aria-allowed-role) → rollü defter <div>. */
  const Yuzey = semantik ? "div" : "section";
  return (
    <>
      <Yuzey data-sd-yuzey="" aria-label={etiket} role={semantik || undefined} ref={gezinme?.kokRef} onFocus={gezinme?.odakla}
        {...(semantik === "grid" && secimli ? { "aria-multiselectable": "true" } : null)} {...(uzar ? { "data-sd-uzar": "" } : null)}
        style={{ ...sablonDegisken(sablon), ...(olculen ? { "--sd-adim": `${olculen}px` } : null), ...style }}>
        {basliklar && (semantik
          ? <div role="rowgroup"><div data-sd-baslik="" role="row">{basliklar}</div></div>
          : <div data-sd-baslik="" aria-hidden="true">{basliklar}</div>)}
        <div ref={baglaListe} data-sd-liste="" role={semantik ? "rowgroup" : undefined} style={{ display: "flex", flexDirection: "column" }}>
          {children}
          {/* dolguNotu: ilk boş cetvel satırına sessiz mono künye ("sıradaki gönderi bu satıra işlenir"). */}
          {dolgu > 0 && <div data-sd-dolgu="" aria-hidden="true" style={{ height: `calc(var(--sd-adim) * ${dolgu})` }}>{dolguNotu && <span data-sd-dolgu-not="">{dolguNotu}</span>}</div>}
        </div>
        {(ipucu || folyo) && (
          <div data-sd-ipucu="" aria-hidden="true">
            {ipucu && <span><kbd>j</kbd> <kbd>k</kbd> satırlar arası</span>}
            {ipucu && <span><kbd>Enter</kbd> {ipucu}</span>}
            {ipucu && secimli && <span><kbd>x</kbd> seç</span>}
            {folyo && <span data-sd-folyo="">{folyo}</span>}
          </div>
        )}
      </Yuzey>
      {gezinme && <span role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{gezinme.duyuru}</span>}
    </>
  );
}

/* Hücre rolü — defter grid ise gridcell, tablo ise cell. Satır bileşenleri yayar: {...HUCRE.grid}. */
export const HUCRE = { grid: { role: "gridcell" }, table: { role: "cell" } };

/* Grup başlığı (zaman kovası / gün) — defter içinde yapışkan bant: kayıtlar altından akarken
   tarih okunur kalır (zimmet defterinin gün ayracı). Hücre içinde gerçek başlık (h2 düzeyi). */
export function GrupBasligi({ etiket, ek, sayi, birim = "kayıt", rol = "grid", kolon = 5, children }) {
  return (
    <div data-sd-grup="" role="row">
      <span role={rol === "grid" ? "gridcell" : "cell"} aria-colspan={kolon} style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0, width: "100%" }}>
        <span role="heading" aria-level={2} style={{ ...TYPE.antet, fontSize: 10, color: PAL.ink2, textTransform: "uppercase", whiteSpace: "nowrap" }}>{etiket}</span>
        {ek && <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>{ek}</span>}
        <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, whiteSpace: "nowrap", ...TNUM }}>· {sayi} {birim}</span>
        {children}
      </span>
    </div>
  );
}

/* Kayıt no hücresi — mono numara + altında DERKENAR (kenar notu). Marjın solu artık boş
   değil: bürokrasinin kendi kavramıyla kaydın istisnası orada yazılır. `ek`: telefonda
   koçana sığmayan ikincil satır (ör. saat) — koçanda gizlenir. `onEk`: numaranın solundaki
   öğe (İşlenen'de seçim kutusu). */
export function KayitNoHucre({ no, derkenar, ek, onEk, rol = "grid" }) {
  return (
    <span {...HUCRE[rol]} data-sd-no="" style={{ gridArea: "no" }}>
      {onEk ? <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{onEk}<SicilNo no={no} /></span> : <SicilNo no={no} />}
      {ek && <span data-sd-no-ek="" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM, whiteSpace: "nowrap" }}>{ek}</span>}
      {derkenar}
    </span>
  );
}

/* Derkenar — ton: mor (varsayılan, kayıt notu) · yesil · kirmizi · sessiz. */
export const Derkenar = ({ children, ton, title }) => (
  <span data-sd-derkenar="" data-ton={ton} title={title}>{children}</span>
);

/* Arama vurgusu — eşleşen parça fosforlu kalemle (kâğıt dilinin <mark>'ı). */
export function Vurgulu({ metin, jetonlar }) {
  if (!jetonlar?.length) return metin;
  return vurguParcalari(metin, jetonlar).map((p, i) => (p.mark
    ? <mark key={i} style={FOSFOR_STIL}>{p.t}</mark>
    : <React.Fragment key={i}>{p.t}</React.Fragment>));
}

/* Şablonun alan adları (ızgara sütun sayısı = aria-colspan kaynağı) — '"no ana sure"' → ["no","ana","sure"] (tekrarsız, sırayla). */
export const alanlarOf = (alan) => [...new Set(String(alan || "").replace(/"/g, " ").split(/\s+/).filter((x) => x && x !== "."))];
const CUBUK_EN = [52, 64, 44, 58, 48, 60];

function HayaletHucre({ a, i, no, numarasiz, bos }) {
  // Boş defter: yazılmamış cetvel satırı — çubuk YOK (çubuk = "yükleniyor" dili; İşlenen'de
  // boş arama mesajının altında iskelet gibi okunuyordu, tur 6 doğrulaması).
  if (bos && a !== "no") return <span style={{ gridArea: a }} />;
  if (a === "no") {
    if (no) return <span style={{ gridArea: a, fontFamily: MONO, fontSize: 12, color: PAL.mut3, ...TNUM }}>{no}</span>;
    return <span style={{ gridArea: a }}>{!numarasiz && <span data-sd-cubuk="" style={{ width: 84 }} />}</span>;
  }
  if (a === "ana") {
    return (
      <span style={{ gridArea: a, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <span data-sd-cubuk="" style={{ width: `${CUBUK_EN[i % 6]}%` }} />
        <span data-sd-cubuk="" style={{ width: `${CUBUK_EN[(i + 3) % 6] - 18}%`, height: 6, opacity: .7 }} />
      </span>
    );
  }
  const kucuk = a === "sec" || a === "ok";
  return (
    <span style={{ gridArea: a, justifySelf: a === "eylem" || kucuk ? "end" : "start" }}>
      <span data-sd-cubuk="" style={{ width: kucuk ? 14 : a === "eylem" ? 48 : 64, height: kucuk ? 14 : 8, opacity: .8 }} />
    </span>
  );
}

/* Hayalet satır — iskeletin ve boş defterin TEK satır biçimi: gerçek ızgara (aynı sütunlar,
   aynı adım, aynı telefon yerleşimi). `no`: numara metni; `numarasiz`: no hücresi boş;
   `bos`: boş defter cetveli (çubuksuz). */
const HayaletSatir = ({ alanlar, i, no, numarasiz, bos = false }) => (
  <div data-sd-hayalet="" aria-hidden="true">
    {alanlar.map((a) => <HayaletHucre key={a} a={a} i={i} no={no} numarasiz={numarasiz} bos={bos} />)}
  </div>
);

/* Boş defter — "henüz yazılmamış sicil sayfası". Mesaj sayfanın BAŞINDA, altında eşit
   soluklukta boş cetvel satırları sürer — degrade örtü YOK (yarı görünen satır render
   hatası gibi okunuyordu). Numara yalnız defterin gerçek bir kayıt no öneki varsa basılır.
   damga: yalnız gerçek HÜKÜM ("Kuyruk temiz"); arama ıskası hüküm değildir → `kunye`
   (mono künye satırı, ör. "ARAMA · 0 / 15 KAYIT"). */
export function BosDefter({ sablon, basliklar, baslik, sub, actions, damga = "Kayıt yok", kunye = null, satir = 4, onek = "", minYukseklik }) {
  const alanlar = alanlarOf(sablon.alan);
  return (
    <DefterYuzey sablon={sablon} basliklar={basliklar} etiket={baslik} style={minYukseklik ? { minHeight: minYukseklik } : undefined}>
      <div data-sd-bos-mesaj="">
        <div style={{ maxWidth: 480, animation: "sd-gir .4s var(--ke-ease-out) .06s both" }}>
          {damga && <div style={{ marginBottom: SP.l }}><Damga ton={V} egim={-6}>{damga}</Damga></div>}
          {kunye && <div style={{ ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", marginBottom: SP.s, ...TNUM }}>{kunye}</div>}
          <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{baslik}</h2>
          {sub && <div style={{ margin: `${SP.s}px auto 0`, ...TYPE.ui, color: PAL.mut2, textWrap: "balance" }}>{sub}</div>}
          {actions && <div style={{ display: "flex", gap: SP.m, justifyContent: "center", flexWrap: "wrap", marginTop: SP.l }}>{actions}</div>}
        </div>
      </div>
      <div style={{ opacity: .5 }}>
        {Array.from({ length: satir }, (_, i) => (
          <HayaletSatir key={i} alanlar={alanlar} i={i} numarasiz bos no={onek ? `${onek}${String(i + 1).padStart(4, "0")}` : ""} />
        ))}
      </div>
    </DefterYuzey>
  );
}

/* Yükleniyor — "kuruyan mürekkep" iskeleti: spinner yok; GERÇEK satır ızgarasında kurşun
   kalem çubukları + soldan sağa tek tarama. Yüklenince hiçbir çubuk yer değiştirmez. */
export function DefterIskelet({ sablon, basliklar, satir = 6, etiket = "Kayıtlar yükleniyor" }) {
  const alanlar = alanlarOf(sablon.alan);
  return (
    <DefterYuzey sablon={sablon} basliklar={basliklar} etiket={etiket}>
      <span role="status" style={SR_ONLY}>{etiket}…</span>
      <div data-sd-iskelet="">
        {Array.from({ length: satir }, (_, i) => (
          <div key={i} style={{ opacity: 1 - i * 0.1 }}><HayaletSatir alanlar={alanlar} i={i} /></div>
        ))}
      </div>
    </DefterYuzey>
  );
}

/* Hata / çevrimdışı — defter sayfası yerinde, ne olduğunu ve ne yapılacağını söyler; teknik
   ayrıntı mono ve katlanır. Damga yok (hata hüküm değil). "Yeniden dene" görünümün TEK
   eylemidir → birincil düğme (en zayıf hayalet biçimde kalıyordu). En az 360 px. */
export function DefterHata({ sablon, basliklar, baslik = "Kayıtlar alınamadı", sub, ayrinti, onYenidenDene, ek }) {
  const cevrimdisi = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <BosDefter sablon={sablon} basliklar={basliklar} damga={null} satir={3} minYukseklik={360}
      kunye={cevrimdisi ? "Bağlantı · çevrimdışı" : "Sunucu · yanıt yok"}
      baslik={cevrimdisi ? "Bağlantı yok — defter çevrimdışı" : baslik}
      sub={<>
        {sub || (cevrimdisi ? "İnternet bağlantınız geri geldiğinde kayıtlar yeniden yüklenir." : "Sunucuya ulaşılamadı. Kayıtlar sunucuda güvende; bağlantı düzelince yeniden deneyin.")}
        {ayrinti && <details style={{ marginTop: SP.s }}><summary style={{ cursor: "pointer", ...TYPE.meta, color: PAL.mut2 }}>Teknik ayrıntı</summary>
          <code style={{ display: "block", marginTop: 4, fontFamily: MONO, fontSize: 11, color: PAL.mut2, overflowWrap: "anywhere" }}>{ayrinti}</code></details>}
      </>}
      actions={[onYenidenDene && <Btn key="r" primary onClick={onYenidenDene}>Yeniden dene</Btn>, ek].filter(Boolean)} />
  );
}

/* Defter altı not — kart değil, solda ince cetvelli sessiz dipnot (sayfa altı açıklama). */
export const DefterNotu = ({ children, ikon, style }) => (
  <p style={{ display: "flex", gap: SP.m, alignItems: "flex-start", margin: `${SP.l}px 0 0`, padding: `${SP.xs}px 0 ${SP.xs}px ${SP.m}px`,
    borderLeft: `2px solid ${PAL.lineHi}`, ...TYPE.data, color: PAL.mut2, maxWidth: 860, ...style }}>
    {ikon && <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3, marginTop: 1 }}>{ikon}</span>}
    <span>{children}</span>
  </p>
);


/* ——— Klavye gezinmesi (j/k) + kayan seçim imleci ————————————————————————————
   j / k: sonraki / önceki kayıt — ANINDA (imleç yaysız atlar); fareyle seçimde imleç
   kısa bir yayla kayar (dosya sırtı layoutId deseni). Odak gerçekten satıra (ya da satırın
   ilk düğmesine) taşınır → Enter yerel davranışla açar, ekran okuyucu yeni kaydı okur.
   Çakışma kuralları: yazı alanında (input/textarea/select/contenteditable), değiştirici
   tuşla ya da açık bir diyalog (aria-modal) varken tuşlar YOK sayılır. */
const yaziAlani = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const ILERI = new Set(["j", "ArrowDown"]);
const GERI = new Set(["k", "ArrowUp"]);

/* secimTusu(anahtar): verilirse "x" aktif kaydı seçer/bırakır (Linear deseni). Ok tuşları
   yalnız odak defterin İÇİNDEYKEN çalışır (sayfa kaydırmasını gasp etmez); j/k globaldir. */
export function useDefterGezinme({ secimTusu } = {}) {
  const kokRef = useRef(null);
  const kaynak = useRef("fare");
  const [aktif, setAktif] = useState(null);
  const [duyuru, setDuyuru] = useState("");
  const satirlar = () => [...(kokRef.current?.querySelectorAll("[data-sicil-satir]") || [])];
  const odakla = useCallback((e) => {
    const row = e.target.closest?.("[data-sicil-satir]");
    if (row?.dataset.sdAnahtar) setAktif(row.dataset.sdAnahtar);
  }, []);
  useEffect(() => {
    const tus = (e) => {
      const ok = e.key === "ArrowDown" || e.key === "ArrowUp";
      const harf = e.key === "j" || e.key === "k" || e.key === "x";
      if (!ok && !harf) return;
      if (e.ctrlKey || e.metaKey || e.altKey || yaziAlani(e.target) || document.querySelector('[aria-modal="true"]')) return;
      if (ok && !kokRef.current?.contains(document.activeElement)) return;
      const rows = satirlar();
      if (!rows.length) return;
      if (e.key === "x") {
        if (!secimTusu || !aktif) return;
        e.preventDefault();
        secimTusu(aktif);
        return;
      }
      e.preventDefault();
      const simdi = rows.findIndex((r) => r.dataset.sdAnahtar === aktif);
      const adim = ILERI.has(e.key) ? 1 : GERI.has(e.key) ? -1 : 0;
      const yeni = simdi < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, simdi + adim));
      const row = rows[yeni];
      kaynak.current = "klavye";
      setAktif(row.dataset.sdAnahtar);
      setDuyuru(`${yeni + 1}. kayıt / ${rows.length}${yeni === rows.length - 1 && adim > 0 && simdi === yeni ? " — son kayıt" : ""}`);
      const hedef = row.matches("[tabindex]") ? row : row.querySelector("button, [tabindex]") || row;
      hedef.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, [aktif, secimTusu]);
  // Fareyle seçim: imleç yayla kayar. Satır div'inin onPointerDown'ına bağlanır.
  const sec = useCallback((anahtar) => { kaynak.current = "fare"; setAktif(anahtar); }, []);
  return { kokRef, aktif, odakla, kaynak, sec, duyuru };
}

/* Seçim imleci — satırın sol kenarında mürekkep çubuğu; satırlar arasında layoutId ile kayar.
   Klavyeyle anlık (duration 0), fareyle 150ms'lik sönümlü yay. */
export function Imlec({ gezinme, kimlik }) {
  const anlik = gezinme.kaynak.current === "klavye";
  return (
    <motion.span layoutId={`sd-imlec-${kimlik}`} aria-hidden="true"
      transition={anlik ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.6 }}
      style={{ position: "absolute", left: 4, top: 8, bottom: 8, width: 3, borderRadius: 2, background: T, zIndex: 1 }} />
  );
}
