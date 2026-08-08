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
 *   · İMLEÇ IŞIĞI YOK (2026-08-09, kullanıcı kararı). Kartın üstünde imleci takip eden
 *     `IsikYuzeyi`/`useIsik` çifti vardı; kaldırıldı. Görsel gerekçenin yanında somut bir
 *     bedeli de vardı: `IsikYuzeyi`'nin sarmalayıcısı ızgara hücresini içerik genişliğine
 *     daraltıyor, hücrenin geri kalanı tıklanamıyordu (bkz. PanelView ölçü şeridi).
 *     Geri getirilecekse sarmalayıcının hücreyi tam doldurduğu ölçülerek doğrulanmalı.
 *   · prefers-reduced-motion'da hepsi statik hâline düşer — kaybolmaz, DURUR.
 *   · Hiçbir katman tıklamayı yutmaz (`pointerEvents: none`).
 */
import { useEffect, useState } from "react";

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

/* Hareket kısıtını CANLI izler — kullanıcı sistem ayarını mesai ortasında değiştirebilir,
   ilk render'daki değere kilitlenmek "ayarı açtım ama durmadı" olarak görünürdü.
   (Eskiden burada bir de `(hover: hover)` sorgusu vardı; yalnız imleç ışığı kullanıyordu,
   ışık kaldırılınca birlikte gitti.) */
function useOrtam() {
  const [az, setAz] = useState(azHareketMi);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const guncelle = () => setAz(!!mq?.matches);
    mq?.addEventListener?.("change", guncelle);
    return () => mq?.removeEventListener?.("change", guncelle);
  }, []);
  return { az };
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
