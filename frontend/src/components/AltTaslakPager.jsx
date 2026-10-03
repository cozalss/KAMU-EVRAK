/* AltTaslakPager — çok-konulu evrakta N ayrı birim taslağını TEK TEK gösterir (grid'in yerini
   aldı, 2026-07-15: kullanıcı isteği — N kart alt alta/yan yana uzun scroll yaratıyordu).
   Sol/sağ ok butonları AYRI bir üst satırda DEĞİL — her AltTaslakKarti'nin KENDİ başlık
   satırında yaşar (kullanıcı isteği: kartın dış kutusu Kaynak belge/Hüküm kartıyla aynı y'de
   başlamalı — "hizasında olmalı"; ok satırı araya girince bu hizayı bozuyordu). ←/→ tuşu da
   aynı şekilde çalışır.

   Kabuk: embla-carousel-react (2026-07-20, kullanıcı isteği — elle ok-buton pager'ı gerçek
   dokunmatik/momentum'lu swipe'a çevir). DIŞARIYA hâlâ TAMAMEN KONTROLLÜ bileşen: idx/onIdx
   tek doğruluk kaynağı (CanliAjanAkisi'nin runBase-sıfırlama efekti bunu bekler) — Embla'nın
   kendi iç konumu bu prop'a İKİ YÖNLÜ senkronlanır (aşağıdaki iki effect): dışarıdan idx
   değişirse (ok tuşu/PagerOk) emblaApi.scrollTo, kullanıcı swipe/sürüklerse Embla'nın "select"
   olayı onIdx'i çağırır. Çift-yön senkron feedback döngüsü YARATMAZ: selectedScrollSnap()
   zaten hedefteyse scrollTo atlanır.

   Kritik karar (DEĞİŞMEDİ): TÜM AltTaslakKarti'lar mounted KALIR — Embla'nın swipe hissi
   ZATEN tüm slaytları yan yana DOM'da tutmayı gerektirir (komşu slayt kaymaya başlarken
   görünür olmalı), yani mount-koruma burada da bedava sağlanır. Yalnız GÖRÜNÜRLÜK mekanizması
   değişti: display:none yerine yatay konum (flex satırında Embla'nın transform'u). Aktif
   OLMAYAN slaytlar artık `inert` (+ aria-hidden) ile a11y ağacından/TAB SIRASINDAN çıkarılır —
   display:none'ın eskiden bedava verdiği garantinin yerini alan AÇIK, tek-attribute eşdeğeri
   (modern tarayıcılarda: Chrome 102+/Safari 15.5+/Firefox 112+).

   ESKİ UYARI (ARTIK GEÇERSİZ, kayıt için tutulur): "Bu sarmalayıcıya asla transform/animation
   eklenmesin" — sebep, o zamanki BelgeModal'ın position:fixed'i PORTAL'SIZ render etmesiydi;
   ataya transform gelince (Embla'nınki dahil) position:fixed'in containing-block'u değişip
   modal ekranın ortası yerine bu sarmalayıcının İÇİNE hapsoluyordu. BelgeModal artık
   @radix-ui/react-dialog Dialog.Portal kullanıyor (doğrulandı: @radix-ui/react-portal
   `ReactDOM.createPortal(..., document.body)` — modal DOM'da GERÇEKTEN body'nin doğrudan
   çocuğu, bu alt-ağacın DIŞINDA) → ata transform'u artık modalı etkilemiyor, Embla'nın kendi
   iç transform'u güvenle kullanılabilir. */
import { useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion, useReducedMotion } from "motion/react";
import { PAL, DERIN, V, ALFA, RAD, SP, TYPE, TNUM, MONO, focusRing } from "./neonUi.jsx";
import AltTaslakKarti from "./AltTaslakKarti.jsx";

export default function AltTaslakPager({ altTaslaklar, idx, onIdx, onTurUret, onKarar, onDuzenle }) {
  const son = altTaslaklar.length - 1;
  const guvenliIdx = Math.min(Math.max(0, idx), Math.max(0, son));

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });

  // Dışarıdan gelen idx (ok tuşu/PagerOk/harici sıfırlama) → Embla'yı senkronla. Guard:
  // Embla ZATEN o snap'teyse (ör. bu effect'i TETİKLEYEN şey kullanıcının kendi swipe'ıysa —
  // aşağıdaki "select" dinleyicisi onIdx'i çağırıp idx'i günceller) scrollTo atlanır — geri
  // besleme döngüsü kurulmaz.
  useEffect(() => {
    if (!emblaApi) return;
    // Embla kaymayı kendi rAF motoruyla (JS transform) sürer — CSS reduced-motion
    // kill-switch'i erişemez. jump=true (ikinci parametre) animasyonsuz anında konumlar;
    // kullanıcının KENDİ swipe'ı 1:1 takip olduğu için bu guard'ın dışında kalır.
    const az = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (emblaApi.selectedScrollSnap() !== guvenliIdx) emblaApi.scrollTo(guvenliIdx, az);
  }, [emblaApi, guvenliIdx]);

  // Kullanıcı sürükleyerek/swipe ile kaydırdı → dışarıya (tek doğruluk kaynağı olan idx'e) bildir.
  useEffect(() => {
    if (!emblaApi) return;
    const bildir = () => onIdx(emblaApi.selectedScrollSnap());
    emblaApi.on("select", bildir);
    return () => emblaApi.off("select", bildir);
  }, [emblaApi, onIdx]);

  // ←/→ yalnız bu bölge (veya bir çocuğu) odaktaysa çalışır — document-geneli dinleyici DEĞİL
  // (bu bir modal değil, sayfa-içi bölge; başka yerdeki gezinmeyi ele geçirmemeli). Native
  // <select> (TurSecici) veya input/textarea odaktaysa ok tuşları kendi davranışına bırakılır.
  const canli = useRef({});
  canli.current = { guvenliIdx, son, onIdx };
  const tusla = (e) => {
    const etiket = e.target?.tagName;
    if (etiket === "SELECT" || etiket === "INPUT" || etiket === "TEXTAREA") return;
    const c = canli.current;
    if (e.key === "ArrowLeft" && c.guvenliIdx > 0) { e.preventDefault(); c.onIdx(c.guvenliIdx - 1); }
    else if (e.key === "ArrowRight" && c.guvenliIdx < c.son) { e.preventDefault(); c.onIdx(c.guvenliIdx + 1); }
  };

  const azHareket = useReducedMotion();
  if (son < 0) return null;

  return (
    <div role="group" aria-label={`Taslak gezinme — ${guvenliIdx + 1} / ${altTaslaklar.length}`} onKeyDown={tusla}>
      <div ref={emblaRef} style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {altTaslaklar.map((x, i) => (
            <div key={x.sira} aria-hidden={i !== guvenliIdx} {...(i !== guvenliIdx ? { inert: "" } : {})}
              style={{ flex: "0 0 100%", minWidth: 0, opacity: i === guvenliIdx ? 1 : 0.35, transition: "opacity .32s var(--ke-ease-out)" }}>
              <AltTaslakKarti altTalep={x.a} sira={i + 1} toplam={altTaslaklar.length}
                onPrev={() => onIdx(guvenliIdx - 1)} prevDisabled={guvenliIdx === 0}
                onNext={() => onIdx(guvenliIdx + 1)} nextDisabled={guvenliIdx === son}
                onTurUret={(tur) => onTurUret(x.a, tur)}
                onOnaylaGonder={(metin, tur) => onKarar(x.a, metin, "onayla", x.sira, tur)}
                onReddet={(metin, tur) => onKarar(x.a, metin, "reddet", x.sira, tur)}
                onDuzenle={(metin, tur) => onDuzenle(x.a, metin, tur, x.sira)} />
            </div>
          ))}
        </div>
      </div>
      <DosyaSekmeleri altTaslaklar={altTaslaklar} idx={guvenliIdx} onIdx={onIdx} azHareket={azHareket} />
    </div>
  );
}

/* Dosya sekmeleri — klasördeki ayraçlar gibi: her alt-taslak bir sekme (sıra no + birim),
   etkin sekmenin altındaki mürekkep çizgisi `layoutId` ile bir sekmeden ötekine KAYAR
   (hareket = "aynı klasörde sayfa çevirdin" bilgisi). Oklar ve ←/→ ile aynı tek doğruluk
   kaynağını (idx) sürer; kart başlığının hizasını bozmamak için kartın ALTINDA durur. */
function DosyaSekmeleri({ altTaslaklar, idx, onIdx, azHareket }) {
  return (
    <div role="group" aria-label="Alt-taslaklar" style={{ display: "flex", gap: SP.xs, marginTop: SP.s, overflowX: "auto", scrollbarWidth: "none", padding: "2px 2px 4px" }}>
      {altTaslaklar.map((x, i) => {
        const etkin = i === idx;
        return (
          <button key={x.sira} type="button" aria-current={etkin ? "true" : undefined} onClick={() => onIdx(i)}
            {...focusRing} data-press=""
            style={{
              position: "relative", flex: "1 1 0", minWidth: 120, display: "flex", alignItems: "baseline", gap: SP.s,
              padding: "8px 10px 10px", border: 0, borderRadius: RAD.ctl, cursor: "pointer", textAlign: "left",
              background: etkin ? ALFA(V) : "transparent", color: etkin ? DERIN.V : PAL.mut2,
              transition: "background .18s ease, color .18s ease",
            }}>
            <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", ...TNUM, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ ...TYPE.meta, fontWeight: etkin ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {x.a?.birim_tr || "İlgili birim"}
            </span>
            {etkin && (
              <motion.span layoutId="kd-alt-taslak-sekme" aria-hidden="true"
                transition={azHareket ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
                style={{ position: "absolute", left: 10, right: 10, bottom: 3, height: 2, borderRadius: RAD.chip, background: DERIN.V }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
