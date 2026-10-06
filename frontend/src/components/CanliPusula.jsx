/* CanliPusula — canlı sahnenin HAVALE PUSULASI kartı (tur 6'da CanliAjanAkisi'nden ayrıldı).
   Antet künyesi (kayıt defteri satırı gibi olgularla dolar) + çift çizgi · paraf defteri
   (ıstampa; telefonda okunan belgenin kâğıt şeridi) ile odaktaki masa yan yana · altta kendini
   çizen pusula (çatallanan paralel şeritlerle). Durum/eşzamanlılık YALNIZ akisKatman + SSE
   start.katmanlar'dan (§8-10) — bu dosya hiçbir durumu kendisi türetmez. */
import { useEffect, useRef } from "react";
import { T, V, PAL, TYPE, RAD, SP, SH, Icon, Damga } from "./neonUi.jsx";
import { gorevFaz } from "../lib/pipelinePhases.js";
import AjanOrb from "./AjanOrb.jsx";
import { SahneAkis, SahneTelemetri, MerkezKart, merkezIndeksi, eszamanliMasalar } from "./CanliMetro.jsx";

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
    const satirlar = document.querySelectorAll('[data-satir][aria-current="step"]');
    const son = satirlar[satirlar.length - 1];
    const fark = son ? son.getBoundingClientRect().bottom - (window.innerHeight - altPay) : 0;
    if (fark <= 0) return;
    window.scrollBy({ top: fark, behavior: azHareket() ? "auto" : "smooth" });
  }, [etkin, kosumda, altPay]);
}

/* Canlı künye — kayıt defteri satırı: her olgu SSE'den geldiği an yerine "yazılır"
   (tür → evrak tarihi/sayısı → havale önerisi). Uydurma kayıt no YOK; kişi adı YOK (PII). */
const AYRAC = 18;
function CanliKunye({ olgu }) {
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
      <span style={{ display: "flex", flexWrap: "wrap", rowGap: SP.xs, marginLeft: -AYRAC }}>
        {parcalar.map((p) => (
          <span key={`${p.k}:${p.v}`} style={{ position: "relative", paddingLeft: AYRAC, minWidth: 0, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: p.k === "baslik" ? PAL.mut2 : p.soluk ? PAL.mut2 : PAL.mut, animation: p.k === "baslik" ? "none" : "ke-e-kayit .32s var(--ke-ease-out) both" }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 6, color: PAL.mut3 }}>·</span>
            {p.v}
          </span>
        ))}
      </span>
    </span>
  );
}

function IstampaKutusu({ display, sahneCanli, runBase, durdu, gelis }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ padding: SP.s, borderRadius: RAD.pop, background: PAL.surf2, boxShadow: `inset 0 0 0 1px ${PAL.lineHi}, ${SH.card}` }}>
        <AjanOrb display={display} kosumda={sahneCanli} yukseklik={200} runBase={runBase} durdu={durdu} gelis={gelis} />
      </div>
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
    </div>
  );
}

export default function CanliPusula({ display, gruplar, sahneCanli, allDone, toplamSn, runBase, durdu, kapanis, kapanisBilgi, gelis, olgu, onDetay, dar, kaynakSerit, hataMesaji, onTekrarDene }) {
  const pad = "clamp(16px, 2.4vw, 28px)";
  const merkezIdx = merkezIndeksi(display);
  useEtkinSatiraKaydir(display, runBase, sahneCanli, dar ? 96 : 24);
  return (
    <section aria-label="İşlem durumu" style={{ position: "relative", width: "100%", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, overflow: "hidden", viewTransitionName: "ke-pusula" }}>
      <div style={{ padding: `${pad} ${pad} 0` }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: SP.m, rowGap: SP.xs, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", minWidth: 0 }}>
          <CanliKunye olgu={olgu} />
          <span aria-hidden="true" style={{ flex: "1 1 12px", height: 1, background: PAL.line, minWidth: 12 }} />
          <SahneTelemetri busy={sahneCanli} allDone={allDone} toplamSn={toplamSn} runBase={runBase} durdu={!!durdu} />
        </div>
        <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
      </div>
      {/* alignItems:start — sağdaki odak kartının yüksekliği değişse de ıstampa yerinde durur. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: pad, padding: pad, alignItems: "start" }}>
        {dar ? kaynakSerit : <IstampaKutusu display={display} sahneCanli={sahneCanli} runBase={runBase} durdu={durdu} gelis={gelis} />}
        <div style={{ position: "relative", minWidth: 0 }}>
          <MerkezKart a={display[merkezIdx]} total={display.length || 1} runBase={runBase} kapanis={kapanisBilgi} kosumda={sahneCanli}
            esz={eszamanliMasalar(display, merkezIdx)} hataMesaji={hataMesaji} onTekrarDene={onTekrarDene} />
          {/* KAPANIŞ DAMGASI — pusulanın KENDİ üstüne, "15 / 15"in yanına basılır (tur 6 jüri
              fırsatı #4; eskiden ıstampaya basılıyordu). Ardından pusula sonuç başlığındaki
              "İşlem tamamlandı" satırına view-transition ile oturur. */}
          {kapanis && (
            <div aria-hidden="true" style={{ position: "absolute", top: 30, right: 0, zIndex: 3, pointerEvents: "none" }}>
              <Damga ton={V} egim={-8} oncelik={1} style={{ fontSize: 28, lineHeight: "30px", padding: "9px 20px", borderWidth: 3, background: `color-mix(in srgb, ${PAL.surf} 70%, transparent)` }}>İşlendi</Damga>
            </div>
          )}
        </div>
      </div>
      <div className="ke-e-sahne" style={{ paddingLeft: pad, paddingRight: pad }}>
        <SahneAkis display={display} gruplar={gruplar} onDetay={onDetay} durdu={durdu} runBase={runBase} />
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.l, ...TYPE.meta, color: PAL.mut2 }}>
          <Icon.info width={13} height={13} />
          Her satır bir masadır; paraf, o masanın işini gerçekten yaptığını gösterir. Ayrıntı için satıra dokunun.
        </div>
      </div>
    </section>
  );
}
