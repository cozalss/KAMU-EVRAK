/* CanliPusula — canlı sahnenin HAVALE PUSULASI kartı (tur 6'da CanliAjanAkisi'nden ayrıldı).
   Antet künyesi (kayıt defteri satırı gibi olgularla dolar) + çift çizgi · paraf defteri
   (ıstampa; telefonda okunan belgenin kâğıt şeridi) ile odaktaki masa yan yana · altta kendini
   çizen pusula (çatallanan paralel şeritlerle). Durum/eşzamanlılık YALNIZ akisKatman + SSE
   start.katmanlar'dan (§8-10) — bu dosya hiçbir durumu kendisi türetmez. */
import { useEffect, useRef, useState } from "react";
import { T, V, PAL, TYPE, RAD, SP, SH, Icon, Damga } from "./neonUi.jsx";
import { gorevFaz } from "../lib/pipelinePhases.js";
import AjanOrb from "./AjanOrb.jsx";
import { SahneAkis, SahneTelemetri, MerkezKart, merkezIndeksi, eszamanliMasalar } from "./CanliMetro.jsx";

/* KISA MASAÜSTÜ (tur 8 jüri 2): 1440×900'de yapışkan odak bölgesi ~335 px kaplıyor, pusula
   listesi ~415 px'lik pencerede akıyordu. ≥1200 genişlik + ≤980 yükseklikte ıstampa ve rakam
   küçülür, lejant gizlenir (faz harfleri ıstampanın kendi bandında) → bölge ~220 px. Telefon
   (dar) bu yola hiç girmez. */
const KISA_SORGU = "(min-width: 1200px) and (max-height: 980px)";
function useKisaMasaustu() {
  const [kisa, setKisa] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(KISA_SORGU)?.matches);
  useEffect(() => {
    const mq = window.matchMedia?.(KISA_SORGU);
    if (!mq) return undefined;
    const f = () => setKisa(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return kisa;
}

const azHareket = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* Etkin satır katlamanın altına düşünce pusula onu görünür alana getirir — YALNIZ kullanıcı
   bu koşumda kendisi kaydırmadıysa (tur 6: 1440×900'de 6. masadan sonra etkin satırlar ekran
   dışında kalıyordu). Telefonda da açık (doğrulama: etkin satırlar katlamanın altında kalıyordu);
   alt pay orada sabit Asistan düğmesinin yüksekliği kadardır. Kapanışta sayfa başa döner
   (CanliAjanAkisi.useKapanis) — İŞLENDİ damgası pusulanın tepesinde görülür. */
function useEtkinSatiraKaydir(display, runBase, kosumda, altPay) {
  const elle = useRef(false);
  useEffect(() => { elle.current = false; }, [runBase]);
  useEffect(() => {
    const TUS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);
    const isaretle = (e) => { if (e.type !== "keydown" || TUS.has(e.key)) elle.current = true; };
    window.addEventListener("wheel", isaretle, { passive: true });
    window.addEventListener("touchmove", isaretle, { passive: true });
    window.addEventListener("keydown", isaretle);
    return () => {
      window.removeEventListener("wheel", isaretle);
      window.removeEventListener("touchmove", isaretle);
      window.removeEventListener("keydown", isaretle);
    };
  }, []);
  const etkin = display.filter((a) => a.status === "active").map((a) => a.id).join(",");
  useEffect(() => {
    if (!kosumda || !etkin || elle.current) return;
    if (document.body.style.overflow === "hidden") return;      // adım detayı açık
    const fark = kaydirmaFarki(altPay);
    if (!fark) return;
    window.scrollBy({ top: fark, behavior: azHareket() ? "auto" : "smooth" });
  }, [etkin, kosumda, altPay]);
}

/* Etkin satırların görünür kalması için gereken kaydırma (px; 0 = gerekmez). Masaüstünde odak
   bölgesi yapışkan olduğundan satır onun ALTINDA kalmışsa da görünmez sayılır (tur 8: iki hat
   yan yana iken etkin masa 1. hattın dibinden 2. hattın tepesine geçince yapışkan bölgenin
   arkasında kalıyordu) → gerekirse yukarı da kaydırılır. */
function kaydirmaFarki(altPay) {
  const satirlar = [...document.querySelectorAll('[data-satir][aria-current="step"]')].map((r) => r.getBoundingClientRect());
  if (!satirlar.length) return 0;
  const ust = (document.querySelector("[data-odak-bolge]")?.getBoundingClientRect().bottom ?? 0) + 8;
  const enUst = Math.min(...satirlar.map((r) => r.top)), enAlt = Math.max(...satirlar.map((r) => r.bottom));
  if (enUst < ust) return enUst - ust;
  const asagi = enAlt - (window.innerHeight - altPay);
  return asagi > 0 ? Math.min(asagi, Math.max(0, enUst - ust)) : 0;
}

/* Canlı künye — kayıt defteri satırı: her olgu SSE'den geldiği an yerine "yazılır"
   (tür → evrak tarihi/sayısı → havale önerisi). Uydurma kayıt no YOK; kişi adı YOK (PII). */
const AYRAC = 18;
function CanliKunye({ olgu, tekSatir = false }) {
  const parcalar = [
    { k: "baslik", v: "Havale pusulası" },
    { k: "tur", v: olgu.tur || "tür belirleniyor", soluk: !olgu.tur },
    olgu.tarih && { k: "tarih", v: olgu.tarih },
    olgu.sayi && { k: "sayi", v: `sayı ${olgu.sayi}` },
    olgu.birim && { k: "birim", v: `→ ${olgu.birim}` },
  ].filter(Boolean);
  /* Satır başı ayraç gizleme: her parça kendi "·"sini SOLUNDA taşır, iç sarmal AYRAC kadar sola
     taşar ve dış kap taşanı kırpar → satıra ilk oturan parçanın ayracı görünmez (tur 6: telefonda
     ikinci satır öksüz "·" ile başlıyordu). */
  return (
    <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden" }}>
      <span style={{ display: "flex", flexWrap: tekSatir ? "nowrap" : "wrap", rowGap: SP.xs, marginLeft: -AYRAC, minWidth: 0 }}>
        {parcalar.map((p) => (
          <span key={`${p.k}:${p.v}`} style={{ position: "relative", paddingLeft: AYRAC, minWidth: 0, flexShrink: p.k === "birim" ? 1 : 0, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: p.k === "baslik" ? PAL.mut2 : p.soluk ? PAL.mut2 : PAL.mut, animation: p.k === "baslik" ? "none" : "ke-e-kayit .32s var(--ke-ease-out) both" }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 6, color: PAL.mut3 }}>·</span>
            {p.v}
          </span>
        ))}
      </span>
    </span>
  );
}

function IstampaKutusu({ display, sahneCanli, runBase, durdu, gelis, vurgu, onYuva, kisa }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ padding: kisa ? SP.xs : SP.s, borderRadius: RAD.pop, background: PAL.surf2, boxShadow: `inset 0 0 0 1px ${PAL.lineHi}, ${SH.card}` }}>
        <AjanOrb display={display} kosumda={sahneCanli} yukseklik={kisa ? 124 : 176} runBase={runBase} durdu={durdu} gelis={gelis} vurgu={vurgu} onYuva={onYuva} />
      </div>
      {!kisa && <IstampaLejanti />}
    </div>
  );
}

function IstampaLejanti() {
  return (
    <>
      {/* Lejant: her nokta+etiket çifti kırılmaz bir birim (tur 6: satır sonunda öksüz nokta). */}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", columnGap: SP.m, rowGap: SP.xs, marginTop: SP.s, ...TYPE.antet, fontSize: 10, color: PAL.mut2, textTransform: "uppercase", flexWrap: "wrap" }}>
        <span style={{ whiteSpace: "nowrap" }}>Paraf defteri</span>
        <span style={{ display: "inline-flex", gap: SP.m, flexWrap: "wrap" }}>
          {[[T, 1], [V, 2]].map(([c, n]) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              <span style={{ width: 7, height: 7, borderRadius: RAD.dot, background: c }} />{gorevFaz(n).no}. {gorevFaz(n).ad}
            </span>
          ))}
        </span>
      </div>
    </>
  );
}

/* Odak bölgesi — künye + çift çizgi + paraf defteri + odaktaki masa. MASAÜSTÜNDE YAPIŞKAN
   (tur 8, jüri: 1440×900'de otomatik kaydırma "0X / 15 + masa adı"nı ve paraf defterini 6.
   masadan sonra ekran dışına itiyordu). Pusula listesi bunun altından akar; vitrin anı koşumun
   hiçbir saniyesinde kaybolmaz. Telefonda yapışkan DEĞİL (alan yok; düzen aynen korunur). */
function OdakBolgesi({ p, pad, merkezIdx, vurgu, kisa }) {
  const { display, sahneCanli, allDone, toplamSn, runBase, durdu, kapanis, kapanisBilgi, gelis, olgu, onDetay, dar, kaynakSerit, hataMesaji, onTekrarDene, ustPay = 0 } = p;
  const damga = kapanis ? (
    <Damga ton={V} egim={-8} oncelik={1} style={{ fontSize: "clamp(16px, 1.3vw, 26px)", lineHeight: 1.1, padding: "6px 14px", borderWidth: 3, background: PAL.surf }}>İşlendi</Damga>
  ) : null;
  return (
    <div data-odak-bolge={dar ? undefined : ""} style={dar ? undefined : { position: "sticky", top: ustPay, zIndex: 3, background: PAL.surf, borderBottom: `1px solid ${PAL.line}` }}>
      <div style={{ padding: `${pad} ${pad} 0` }}>
        {/* Masaüstünde TEK SATIR (tur 8 jüri 2): kapanışta birim + "TAMAM · 15 SN" künyeyi üç satıra
            kırıyordu; artık yalnız birim parçası kısalır (ellipsis), durum sağda aynı satırda. */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: dar ? "wrap" : "nowrap", columnGap: SP.m, rowGap: SP.xs, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", minWidth: 0 }}>
          <CanliKunye olgu={olgu} tekSatir={!dar} />
          <span aria-hidden="true" style={{ flex: "1 1 12px", height: 1, background: PAL.line, minWidth: 12 }} />
          <SahneTelemetri busy={sahneCanli} allDone={allDone} toplamSn={toplamSn} runBase={runBase} durdu={!!durdu} />
        </div>
        <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
      </div>
      {/* alignItems:start — sağdaki odak kartının yüksekliği değişse de ıstampa yerinde durur. */}
      {/* Masaüstünde odak kartı biraz geniş (tur 8): kapanışta "15 / 15" + İŞLENDİ damgası aynı
          satırda çakışmadan otursun. */}
      <div style={{ display: "grid", gridTemplateColumns: dar ? "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" : "minmax(240px, 0.9fr) minmax(300px, 1.1fr)", gap: pad, padding: kisa ? `${SP.l}px ${pad}` : pad, alignItems: kisa ? "center" : "start" }}>
        {dar ? kaynakSerit : <IstampaKutusu display={display} sahneCanli={sahneCanli} runBase={runBase} durdu={durdu} gelis={gelis} vurgu={vurgu} onYuva={onDetay} kisa={kisa} />}
        <div style={{ position: "relative", minWidth: 0 }}>
          {/* KAPANIŞ DAMGASI — rakam bloğunun sağındaki yuvada (tur 8: "15"in üstüne biniyordu). */}
          <MerkezKart a={display[merkezIdx]} total={display.length || 1} runBase={runBase} kapanis={kapanisBilgi} kosumda={sahneCanli}
            esz={eszamanliMasalar(display, merkezIdx)} hataMesaji={hataMesaji} onTekrarDene={onTekrarDene} damga={damga} kisa={kisa} />
        </div>
      </div>
      {/* Yapışkan kenarın altında solma (tur 8 jüri 2): akan satırlar ve paraf damgaları kartın
          altında sert kesiliyordu. Yalnız masaüstü; tıklamayı engellemez. */}
      {!dar && <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "100%", height: SP.l, pointerEvents: "none", background: `linear-gradient(${PAL.surf}, transparent)` }} />}
    </div>
  );
}

/* Satır ↔ yuva bağı: pusula satırının üzerine gelince / odaklanınca hangi masa vurgulanıyor. */
function useSatirVurgusu() {
  const [vurgu, setVurgu] = useState(null);
  const bul = (e) => setVurgu(e.target?.closest?.("[data-satir]")?.dataset?.satir || null);
  return [vurgu, { onMouseOver: bul, onFocus: bul, onMouseLeave: () => setVurgu(null), onBlur: () => setVurgu(null) }];
}

export default function CanliPusula(p) {
  const { display, gruplar, sahneCanli, runBase, durdu, onDetay, dar } = p;
  const pad = dar ? "clamp(16px, 2.4vw, 28px)" : "clamp(20px, 1.8vw, 28px)";
  const merkezIdx = merkezIndeksi(display);
  const kisa = useKisaMasaustu() && !dar;
  const [vurgu, vurguOlaylari] = useSatirVurgusu();
  useEtkinSatiraKaydir(display, runBase, sahneCanli, dar ? 96 : 24);
  return (
    <section aria-label="İşlem durumu" style={{ position: "relative", width: "100%", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, overflow: "clip", viewTransitionName: "ke-pusula" }}>
      <OdakBolgesi p={p} pad={pad} merkezIdx={merkezIdx} vurgu={vurgu} kisa={kisa} />
      <div className="ke-e-sahne" style={{ paddingLeft: pad, paddingRight: pad, paddingTop: dar ? 0 : SP.l }} {...vurguOlaylari}>
        <SahneAkis display={display} gruplar={gruplar} onDetay={onDetay} durdu={durdu} runBase={runBase} />
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.l, ...TYPE.meta, color: PAL.mut2 }}>
          <Icon.info width={13} height={13} />
          Her satır bir masadır; paraf, o masanın işini gerçekten yaptığını gösterir. Ayrıntı için satırı açın.
        </div>
      </div>
    </section>
  );
}
