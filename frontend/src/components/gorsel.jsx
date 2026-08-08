/* gorsel.jsx — çalışma alanının görsel katmanı. Yeniden kullanılabilir "şölen" parçaları.
 *
 * TASARIM SÖZLEŞMESİ: buradaki hiçbir efekt kendi rengini icat ETMEZ; hepsi `--ke-*`
 * token'larından beslenir. Böylece koyu tema ("Mürekkep Gecesi") kendiliğinden çalışır ve
 * palet tek yerden yönetilmeye devam eder.
 *
 * OKUNABİLİRLİK KURALI — bu dosyanın varlık sebebi kadar önemli: burası bir KAMU EVRAK
 * uygulaması, memur gün boyu bakıyor. Bu yüzden:
 *   · Metnin ARKASINDA sürekli hareket eden katman YOK. Zemin efektleri statiktir; yalnız
 *     bir kereye mahsus giriş yapar. (Sürekli döngü = periferik dikkat hırsızı + pil.)
 *   · Işık/parıltı yalnız İMLECİN OLDUĞU yerde ve yalnız fare olan cihazlarda.
 *   · prefers-reduced-motion'da hepsi statik hâline düşer — kaybolmaz, DURUR.
 *   · Hiçbir katman tıklamayı yutmaz (`pointerEvents: none`).
 */
import { useCallback, useEffect, useRef, useState } from "react";

/* BAĞIMSIZ MODÜL — bilerek `neonUi.jsx`'ten HİÇBİR ŞEY import etmez.
   Sebep: bu efektler neonUi'nin kendi atomlarında (NeonCard/ViewWrap) kullanılıyor; iki
   dosya birbirini import etseydi ESM döngüsü doğar ve modül-seviyesi sabitler
   (PAL, ALFA…) henüz tanımlanmadan okunup `undefined` olurdu — sessiz, teşhisi zor bir
   kırılma. Token'lar zaten düz CSS değişkeni dizeleri olduğu için burada birebir
   tekrarlanabiliyorlar; TEK KAYNAK hâlâ THEME_CSS, bunlar ona işaret eden birer takma ad. */
const T = "var(--ke-t)";
const V = "var(--ke-v)";
const EASE_OUT = "var(--ke-ease-out)";

const azHareketMi = () =>
  typeof window !== "undefined"
  && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/** Fare var mı — dokunmatikte hover efektleri yanlış tetikleniyor (tap = hover). */
const fareVarMi = () =>
  typeof window !== "undefined"
  && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

/** İki medya sorgusunu canlı izleyen ortak kanca. */
function useOrtam() {
  const [ortam, setOrtam] = useState(() => ({ az: azHareketMi(), fare: fareVarMi() }));
  useEffect(() => {
    const mqAz = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const mqFare = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    const guncelle = () => setOrtam({ az: !!mqAz?.matches, fare: !!mqFare?.matches });
    mqAz?.addEventListener?.("change", guncelle);
    mqFare?.addEventListener?.("change", guncelle);
    return () => {
      mqAz?.removeEventListener?.("change", guncelle);
      mqFare?.removeEventListener?.("change", guncelle);
    };
  }, []);
  return ortam;
}

/**
 * IsikYuzeyi — imleci takip eden ışık. Kartın üstünde, imlecin bulunduğu noktada yumuşak
 * bir aydınlanma; kart "cama dokunuyormuş" gibi tepki verir.
 *
 * NEDEN KENDİ YAZIMIMIZ: hazır MagicCard bileşeni `next-themes` istiyor (bu proje Vite,
 * tema `data-theme` ile yönetiliyor → bileşenin useTheme'i çalışmaz) ve her pointermove'da
 * gradyan şablonunu yeniden kuruyor. Burada iki şey farklı:
 *   1. Konum CSS DEĞİŞKENİNE yazılır ve değişken ELEMANIN KENDİSİNDE tutulur — üst öğede
 *      tutulsa tüm çocuklar için stil yeniden hesaplanırdı (liste/tablo satırlarında
 *      titremenin klasik sebebi).
 *   2. Yazma rAF ile bir kareye kısılır; pointermove saniyede 120 kez gelse de tek yazma olur.
 */
export function IsikYuzeyi({
  children, renk = T, guc = 0.14, cap = 320, style, className, ...kalan
}) {
  const { az, fare } = useOrtam();
  const kapRef = useRef(null);
  const rafRef = useRef(0);
  const sonRef = useRef({ x: 0, y: 0 });

  const hareket = useCallback((e) => {
    const el = kapRef.current;
    if (!el) return;
    const k = el.getBoundingClientRect();
    sonRef.current = { x: e.clientX - k.left, y: e.clientY - k.top };
    if (rafRef.current) return;              // kare başına tek yazma
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const { x, y } = sonRef.current;
      el.style.setProperty("--isik-x", `${x}px`);
      el.style.setProperty("--isik-y", `${y}px`);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const aktif = fare && !az;
  return (
    <div
      ref={kapRef}
      onPointerMove={aktif ? hareket : undefined}
      onPointerEnter={aktif ? (e) => { e.currentTarget.style.setProperty("--isik-o", String(guc)); } : undefined}
      onPointerLeave={aktif ? (e) => { e.currentTarget.style.setProperty("--isik-o", "0"); } : undefined}
      className={className}
      style={{ position: "relative", isolation: "isolate", ...style }}
      {...kalan}
    >
      {aktif && (
        // Işık İÇERİĞİN ALTINDA (zIndex 0 + children zIndex 1): üstte olsaydı metnin
        // kontrastını düşürürdü. Amaç yüzeyi aydınlatmak, metni yıkamak değil.
        <span
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, zIndex: 0, borderRadius: "inherit",
            pointerEvents: "none", opacity: "var(--isik-o, 0)",
            transition: `opacity .22s ${EASE_OUT}`,
            background: `radial-gradient(${cap}px circle at var(--isik-x, 50%) var(--isik-y, 50%), ${renk}, transparent 70%)`,
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1, minWidth: 0, height: "100%" }}>{children}</div>
    </div>
  );
}

/**
 * useIsik — IsikYuzeyi'nin kanca hâli. Zaten `position:relative` olan bir yüzeye (NeonCard'ın
 * kendi `<section>`'ı gibi) EK SARMALAYICI DIV EKLEMEDEN ışık takmak için.
 *
 * Neden önemli: NeonCard uygulamanın her yerinde kullanılıyor. Her kartın etrafına bir div
 * daha koymak ızgara/flex hizalarını sessizce kaydırırdı (grid item artık kart değil
 * sarmalayıcı olurdu). Kanca yüzeyi olduğu gibi bırakır.
 *
 * @returns {{ref: object, baglar: object, katman: JSX.Element|null}}
 *   `baglar` doğrudan elemana yayılır; `katman` içeriğin ÖNÜNE basılır (arkada kalır).
 */
export function useIsik({ renk = T, guc = 0.1, cap = 340 } = {}) {
  const { az, fare } = useOrtam();
  const ref = useRef(null);
  const rafRef = useRef(0);
  const sonRef = useRef({ x: 0, y: 0 });
  const aktif = fare && !az;

  const hareket = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const k = el.getBoundingClientRect();
    sonRef.current = { x: e.clientX - k.left, y: e.clientY - k.top };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      el.style.setProperty("--isik-x", `${sonRef.current.x}px`);
      el.style.setProperty("--isik-y", `${sonRef.current.y}px`);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  if (!aktif) return { ref, baglar: {}, katman: null };
  return {
    ref,
    baglar: {
      onPointerMove: hareket,
      onPointerEnter: (e) => e.currentTarget.style.setProperty("--isik-o", String(guc)),
      onPointerLeave: (e) => e.currentTarget.style.setProperty("--isik-o", "0"),
    },
    katman: (
      <span
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0, zIndex: 0, borderRadius: "inherit",
          pointerEvents: "none", opacity: "var(--isik-o, 0)",
          transition: `opacity .22s ${EASE_OUT}`,
          background: `radial-gradient(${cap}px circle at var(--isik-x, 50%) var(--isik-y, 50%), ${renk}, transparent 70%)`,
        }}
      />
    ),
  };
}

/**
 * MeshZemin — sayfanın arkasındaki atmosfer. Palet renklerinden çok düşük yoğunlukta
 * radyal lekeler; derinlik hissi verir, okumayı bozmaz.
 *
 * STATİK — bilerek. Metnin arkasında SÜREKLİ hareket eden katman iki şeyi bozar: açık
 * zeminde kontrast ölçülemez hâle gelir ve rAF hiç durmadığı için dizüstünde pil/fan
 * bedeli doğar. Tek hareket, mount'ta bir kereye mahsus yumuşak beliriş.
 */
export function MeshZemin({ yogunluk = 1 }) {
  const { az } = useOrtam();
  const leke = (renk, x, y, boyut, alfa) => ({
    position: "absolute", left: `${x}%`, top: `${y}%`,
    width: boyut, height: boyut, marginLeft: -boyut / 2, marginTop: -boyut / 2,
    borderRadius: "50%", pointerEvents: "none",
    background: `radial-gradient(circle, ${renk} 0%, transparent 68%)`,
    opacity: alfa * yogunluk,
  });
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
        animation: az ? "none" : `nu-sol .9s ${EASE_OUT} both`,
      }}
    >
      <span style={leke(T, 12, 6, 560, 0.1)} />
      <span style={leke(V, 88, 22, 480, 0.07)} />
      <span style={leke(T, 62, 92, 620, 0.06)} />
    </div>
  );
}

/**
 * ParlaKenar — kartın kenarında BİR KEZ dolaşan ışık. Kapanış/onay gibi DURUM
 * DEĞİŞİMİNİ anlatır.
 *
 * Sonsuz döngü DEĞİL, bilerek: hazır "border beam" bileşenleri `repeat: Infinity` ile gelir
 * ve 8 saatlik mesaide ekran kenarında hiç durmayan ışık bırakır — demoda güzel, üretimde
 * ilk kapatılan efekt. Tek atış, olayın kendisine bağlı.
 * `anahtar` değişince yeniden oynar (remount).
 */
export function ParlaKenar({ anahtar, renk = T, sure = 1400 }) {
  const { az } = useOrtam();
  if (az) return null;
  return (
    <span
      key={anahtar}
      aria-hidden="true"
      style={{
        // inset 0 (−1 DEĞİL): taşıyıcı kartlarda çoğunlukla `overflow:hidden` var (yuvarlak
        // köşelerin içeriği kırpması için) — dışarı taşan bir katman orada zaten kırpılır ve
        // ışık görünmezdi. 0'da kenarın hemen içinden dolaşır, okuma aynı kalır.
        position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
        padding: 1.5, zIndex: 2,
        background: `conic-gradient(from 0deg, transparent 0deg, ${renk} 24deg, transparent 72deg)`,
        // Yalnız KENAR boyansın: iki maske üst üste, "xor" ile iç alan oyulur.
        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        maskComposite: "exclude",
        animation: `nu-spin ${sure}ms linear 1, nu-sol .2s ${EASE_OUT} both`,
      }}
    />
  );
}
