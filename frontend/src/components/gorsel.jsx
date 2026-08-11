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
 *   · SAYFA ATMOSFERİ YOK (2026-08-12, kullanıcı kararı). `MeshZemin` her görünümün
 *     arkasına çok düşük yoğunlukta gök mavisi/mor radyal lekeler koyuyordu; başlık
 *     hizasında mavi bir aydınlanma olarak görünüyordu ve kaldırıldı. Görünüm zemini
 *     artık düz `--ke-bg`. Geri getirilmez — derinlik yüzeyden gelir (kart + hairline).
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
