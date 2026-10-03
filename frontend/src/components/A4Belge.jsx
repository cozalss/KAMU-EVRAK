/* A4Belge — resmî yazı taslağını GERÇEK A4 sayfa düzeninde gösterir.

   Ölçüler uydurulmadı; Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik'ten
   alındı (korpus: data/mevzuat/2646_resmi_yazisma_yonetmeligi.txt):
     · m.6/1  — belgeler A4 (210x297 mm) boyutu dikkate alınarak hazırlanır
     · m.7/1  — Times New Roman 12 punto (veya Arial 11) normal yazı stili
     · m.8/1  — yazı alanı sayfanın UST, SOL ve SAG kenarından 1,5 cm boşluk bırakılarak
                düzenlenir (idare logo kullanırsa üst boşluk 0,5 cm)
   Yönetmelik ALT boşluğu belirlemiyor; simetri için üstle aynı değer kullanıldı — kaynağa
   dayanmayan tek ölçü budur, bilerek işaretlendi.

   Neden ölçüm tabanlı sayfalama: tarayıcılar CSS Paged Media'yı EKRANDA uygulamaz, yalnız
   baskıda. Paged.js bunu taklit eder ama DOM'u yeniden yazar; taslak SSE ile canlı akarken
   sürekli yeniden sayfalama kırılgan olur ve yeni bir bağımlılık gerektirir. Bunun yerine
   satırlar bir kez ölçülüp sayfa yüksekliğine göre bölünür; baskıda W3C standardı
   `@page { size: A4 }` devreye girer, ekrandaki ile çıktı aynı olur. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAL, SH, SP, TYPE } from "./neonUi.jsx";
import {
  A4_GEN_PX,
  A4_YUK_PX,
  KENAR_MM,
  MM,
  YAZI_ALANI_GEN_PX,
  genislikOlcegi,
  olcekHesapla,
  olcekOynadi,
  olcumleriTopla,
  sayfalaraBol,
} from "../lib/a4Sayfalama.js";
import { antetSiniflandir } from "../lib/a4Antet.js";
import { kagitStilYukle } from "./kagitDoku.js";

const SAYFA_ARASI_PX = 24;

/* Bir KARE içinde izin verilen azami senkron ölçek düzeltmesi — çökme kilidi (gerekçe
   `olcOlcek`in hemen altında). Meşru mount dizisi 1, dar düzenin min() yakınsaması 2
   harcar; 4 rahat bir tavan ve React'in 50'lik iç sınırının çok altında. */
const TUR_AZAMI = 4;

/* Yönetmelik m.7/1 belgede İKİ yazı tipine izin verir: "Times New Roman" 12 punto VEYA
   "Arial" 11 punto. Arial seçildi — kullanıcı tercihi tırnaksız (sans-serif) görünüm ve bu
   tercih mevzuata AYKIRI DEĞİL, yönetmeliğin kendi ikinci seçeneği. Times'a dönmek istenirse
   punto da 12'ye çekilmelidir; ikisi maddede birlikte tanımlı.

   PUNTO ≠ PİKSEL: "11 punto" CSS'te `fontSize: 11` yazılırsa 11 PİKSEL olur ve belge
   yönetmeliğin öngördüğünden ~%25 küçük çıkar (ilk sürümde bu hata vardı). Bu yüzden ölçü
   birimi açıkça `pt` verilir; sayfa boyutu da aynı 96dpi referansına dayandığı için ikisi
   tutarlı kalır. */
const BELGE_FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
/* Punto ve satır aralığı DIŞARI AÇIK: kaynak belge paneli aynı değerleri kullanarak metnini
   kâğıtla aynı okuma boyutuna getirir (KaynakBelge). Tek kaynak — yönetmelik Times 12'ye
   çevrilirse iki panel birlikte döner, elle senkron gerekmez. Yazı tipi AİLESİ paylaşılmaz:
   kâğıt m.7/1 gereği Arial kalır, panel kendi UI fontunu sürdürür. */
export const BELGE_PUNTO_PT = 11;
export const BELGE_SATIR = 1.45;
/* Matbaa siyahı — kâğıt üstünde UI gri tonları kullanılmaz. Kâğıt iki temada da açık
   kaldığı için (kagitDoku.js) mürekkep de kâğıdın kendi token'ından gelir. */
const BELGE_MURAKKEP = "var(--kd-kagit-murekkep)";

/* Satır rolüne göre dizgi (lib/a4Antet.js sınıflandırır). Gerçek resmî yazı düzeni:
   antet ortalı (T.C. + idare adı kalın), tarih Sayı hizasında sağda, muhatap ortalı,
   paragraf başı 1,25 cm içeride, imza bloğu sağ yarıda ortalı. Ölçüm katmanı AYNI stili
   kullanır — sarma farklı çıkarsa sayfalama kayardı. */
const ROL_STIL = {
  antet: { textAlign: "center" },
  antetKalin: { textAlign: "center", fontWeight: 700 },
  muhatap: { textAlign: "center" },
  paragraf: { textIndent: "1.25cm" },
  imza: { marginLeft: "55%", textAlign: "center" },
  sayi: { display: "flex", justifyContent: "space-between", gap: "1em" },
};

const STIL_ID = "ke-a4-stil";
const STIL = `
@media print {
  @page { size: A4; margin: 0; }
  body * { visibility: hidden; }
  .ke-a4-yigin, .ke-a4-yigin * { visibility: visible; }
  .ke-a4-yigin { position: absolute; inset: 0; width: auto !important; height: auto !important;
                 margin: 0 !important; }
  .ke-a4-olcek { transform: none !important; gap: 0 !important; }
  .ke-a4-sayfa { box-shadow: none !important; border: none !important; background-image: none !important;
                 break-after: page; page-break-after: always; }
  .ke-a4-sayfa:last-child { break-after: auto; page-break-after: auto; }
}`;

function stilYukle() {
  if (typeof document === "undefined" || document.getElementById(STIL_ID)) return;
  const el = document.createElement("style");
  el.id = STIL_ID;
  el.textContent = STIL;
  document.head.appendChild(el);
}

/* sigdir="kutu"      → sayfa kabına TAM sığar (kaydırma yok, punto küçülür). Varsayılan.
   sigdir="genislik"  → ölçek yalnız GENİŞLİKTEN türer; sayfa dikeyde kabı aşar ve kap kaydırır.
                        Ana taslak paneli bunu kullanır: kutuya sığdırma puntoyu ~9pt'ye
                        düşürüyordu ve memur "okunmuyor, kullanmayı düşürüyor" dedi
                        (2026-08-11). Okunabilirlik, tek ekranda tüm sayfayı görmeye yeğlendi. */
/* imzaKatmani → ilk İMZA satırına göre mutlak konumlanan katman (HukumMuhru: ıslak paraf +
   karar mührü). Kâğıdın içinde olduğu için A4 ölçeğiyle birlikte ölçeklenir; mutlak olduğu
   için ölçüm katmanına/sayfalamaya hiç girmez. İmza satırı yoksa son satıra düşer. */
export default function A4Belge({ metin = "", onAc = null, solgun = false, baslikIpucu = "", sigdir = "kutu", imzaKatmani = null }) {
  const sarmalRef = useRef(null);
  const olcerRef = useRef(null);
  const [olcek, setOlcek] = useState(1);
  const [sayfalar, setSayfalar] = useState(null);

  const satirlar = String(metin).split("\n");

  useEffect(() => { stilYukle(); kagitStilYukle(); }, []);
  const roller = antetSiniflandir(satirlar);
  const imzaIdx = (() => {
    if (!imzaKatmani) return -1;
    const i = roller.findIndex((r) => r?.tip === "imza");
    if (i >= 0) return i;
    for (let j = satirlar.length - 1; j >= 0; j -= 1) if (satirlar[j].trim()) return j;
    return -1;
  })();

  /* Islak mürekkep (yalnız DEĞİŞEN satırlar): tür değişimi / dayanak ekleme gibi bir
     yeniden üretimde yeni gelen satır tükenmez mavisiyle basılır ve ~900 ms'de mürekkep
     siyahına kurur — memur neyin değiştiğini aramadan görür. İlk yerleşimde ıslak satır
     YOK (her seçimde tüm sayfanın yanıp sönmesi dikkat hırsızlığı olurdu). */
  /* Islak küme metin BAŞINA bir kez hesaplanır ve sonraki render'larda (ölçek/sayfalama
     state'i) korunur — yoksa ölçüm turunun yeniden render'ı animasyonu yarıda keserdi. */
  const islakRef = useRef({ metin: null, satirlar: null, islak: new Set() });
  if (islakRef.current.metin !== metin) {
    const eski = islakRef.current.satirlar;
    islakRef.current = {
      metin,
      satirlar: new Set(satirlar),
      islak: eski ? new Set(satirlar.filter((s) => s.trim() && !eski.has(s))) : new Set(),
    };
  }
  const islakMi = (s) => islakRef.current.islak.has(s);

  /* Ölçek ölçümü — BOYAMADAN ÖNCE (useLayoutEffect). Karar matematiği `olcekHesapla`da
     (saf, a4Sayfalama.test.js'te birim testli).

     NEDEN useLayoutEffect (gerçek hataydı): bu ölçüm `useEffect` ile boyamadan SONRA
     koşuyordu. `olcek` 1'de başladığı ve yığın yüksekliği `olcek`e bağlı olduğu için ilk
     kare YANLIŞ yükseklikle boyanıyor, hemen ardından ölçülen değere `transition: height`
     ile ANİMASYONLA gidiyordu (ör. 2270px → 1021px). Kullanıcı bunu "panel üstten aşağı
     iniyor" diye bildirdi; karar paneli her seçimde remount olduğundan başka bir taslağa
     her tıklayışta tekrarlanıyordu. Hemen aşağıdaki sayfalama efekti bu kuralı zaten
     yazmıştı ("Ölçüm boyamadan ÖNCE yapılmalı"); ölçek efekti ona uymuyordu — tutarsızlık
     hatanın ta kendisiydi.

     NEDEN BAĞIMLILIK LİSTESİ YOK (2026-08-12, aynı hatanın ikinci yarısı): yalnız mount'ta
     ölçmek YETMİYORDU. Kabın genişliği bir kez daha, AYNI boyama turu içinde değişiyor:
     TaslaklarView sütun bütçesini kendi useLayoutEffect'inde ölçer ve React ebeveyn layout
     efektlerini ÇOCUKLARINKİNDEN SONRA koşturur — yani bu ölçüm koştuğunda grid hâlâ yedek
     sütunlardaydı, ölçüm bittikten sonra gerçek sütunlara geçiyordu. `[sigdir]` listesi
     efekti o ikinci commit'te yeniden koşmaktan alıkoyduğu için kâğıt BAYAT ölçekle
     boyanıyor, düzeltme ancak ResizeObserver'ın boyama SONRASI turunda geliyordu
     (Playwright'ta ölçüldü: kare 0 ölçek 1,1125 / yığın 1249px → kare 1 ölçek 0,8567 →
     11 karelik animasyonla 962px; memur bunu "büyüyor, sonra bir anda aşağı kayıyor,
     sonra düzeliyor" diye bildirdi).

     Liste kalkınca ölçüm HER commit'te, boyamadan önce tazelenir; yedek→ölçülmüş geçişi
     ekrana hiç çıkmaz. Ölçüm kendi çıktısına geri beslendiği için (yeni ölçek → yığın
     yüksekliği → kap) sabit noktaya oturmayı `olcekOynadi` sağlar: değer oynamadıysa
     state'e YAZILMAZ ve React yeniden render etmez. Sözleşme saf ve testlidir. */
  const olcOlcek = useCallback(() => {
    const el = sarmalRef.current;
    if (!el) return;
    const kutu = el.parentElement;
    const bicim = kutu ? getComputedStyle(kutu) : null;
    const yuk = kutu
      ? kutu.clientHeight - parseFloat(bicim.paddingTop || 0) - parseFloat(bicim.paddingBottom || 0)
      : 0;
    const gen = el.clientWidth;
    if (gen <= 0) return;   // kap henüz yerleşmemiş; ResizeObserver birazdan yine çağırır
    // yuk=0 → olcekHesapla yüksekliği YOK SAYAR ve genişlik tek başına karar verir.
    // "genislik" kipi ASGARI tabanı kullanmaz: kabın yatay kaydırması yok, sayfa taşmamalı.
    const yeni = sigdir === "genislik" ? genislikOlcegi(gen) : olcekHesapla(gen, yuk);
    setOlcek((eski) => (olcekOynadi(eski, yeni) ? yeni : eski));
  }, [sigdir]);

  /* ÇÖKME KİLİDİ — `olcekOynadi` yalnız SABİT NOKTAYA oturan döngüyü kapatır, ALMAŞIK olanı
     değil. Kabın dikey kaydırma çubuğu yer kaplıyorsa (Windows/Chrome: 15px; ölçüldü —
     headless'ta 0, yalnız headed'da 15) geri besleme şöyle işleyebilir: ölçek büyür → yığın
     kabı taşırır → çubuk gelir → clientWidth 15px düşer → ölçek küçülür → taşma biter →
     çubuk gider → clientWidth geri gelir → … Bu salınımın adımı 15/793,7 = 0,0189'dur, yani
     OLCEK_ESIK'in (0,00063) ~30 katı; eşik onu ASLA yutmaz.

     Her-commit ölçümü bu salınımı senkron hâle getirdiği için sonucu React'in "Maximum
     update depth exceeded" hatasıdır — TaslaklarView bir HataSiniri içinde olmadığından
     ekran beyaza döner. (Eski kod aynı 2-döngüye açıktı ama ölçüm ResizeObserver'daydı ve
     tarayıcı onu kare başına birle kısıyordu: titreme, çökme değil.)

     Salınımı ARADIM ve bulamadım: headed Chrome'da gerçek 15px çubukla ~40 yapılandırma
     tarandı (1080p/1440p genişlik bantları, pencere yüksekliği 560–1100, 1–3 sayfalık
     taslaklar; kâğıt sütunu 297–679px) — çubuk hiçbirinde yanıp sönmedi, render sayısı hep
     2 kaldı. Ama "bulamadım" bir kanıt değil ve bedeli beyaz ekran; bu yüzden sınıf, ucuz
     bir sayaçla erişilemez kılınıyor.

     SAYAÇ: senkron düzeltme kare başına AZAMI ile sınırlanır. Meşru mount dizisi tek
     düzeltme harcar (yedek sütun → ölçülmüş sütun); dar düzenin min() yakınsaması iki.
     Sınıra dayanan tek şey almaşık salınımdır, o da React'in 50'lik tavanının çok altında
     durur ve düzeltme bir sonraki karede ResizeObserver'a devredilir — yani en kötü hâl
     ESKİ davranıştır (titreme), çökme değil. `scrollbar-gutter: stable` de kenarı tamamen
     silerdi ama kâğıt sütununda kalıcı 15px ölü alan bırakırdı; `taslakSutun.js`'in
     "kenarında ölü alan kalmaz" sözleşmesi buna değmez. */
  const turRef = useRef(0);
  useLayoutEffect(() => {                     // bağımlılık listesi BİLEREK yok (yukarıdaki gerekçe)
    if (turRef.current >= TUR_AZAMI) return;
    turRef.current += 1;
    olcOlcek();
  });
  // Sayacı KARE başına sıfırla (commit başına değil): senkron zincir tek karede koşar, o
  // yüzden zincir içinde sıfırlanmamalı; rAF zinciri bittikten sonra çalışır.
  useEffect(() => {
    const k = requestAnimationFrame(() => { turRef.current = 0; });
    return () => cancelAnimationFrame(k);
  });

  /* Gözlemci AYRI efekt: kimliği yalnız `sigdir` ile değişir, böylece her ölçümde
     kurulup yıkılmaz (üstteki efekt her commit'te koşuyor). Mount SONRASI gerçek
     değişiklikleri (pencere yeniden boyutlandırma, sütun bütçesinin gecikmeli turu) burası
     yakalar; üstteki efekt yalnız commit'lerle senkron kalmayı üstlenir. */
  useLayoutEffect(() => {
    const el = sarmalRef.current;
    if (!el) return undefined;
    const gozlemci = new ResizeObserver(olcOlcek);
    gozlemci.observe(el);
    if (el.parentElement) gozlemci.observe(el.parentElement);
    return () => gozlemci.disconnect();
  }, [olcOlcek]);

  /* Yükseklik geçişi ilk yerleşmede KAPALIDIR, sonrasında açılır.
     Yalnız ölçümü öne almak yetmez: ölçüm bir state güncellemesidir ve React bunu ayrı bir
     commit'te uygular; geçiş açık olsaydı o commit yine animasyon tetikleyebilirdi.
     Pencere yeniden boyutlandırma gibi GERÇEK değişiklikler ise animasyonlu kalır
     (hareket = bilgi). prefers-reduced-motion için ek kod YOK: neonUi.jsx global kuralı
     tüm geçişleri söndürür.

     NEDEN İKİ KARE (2026-08-12): burada eskiden bağımlılıksız düz bir `useEffect` vardı ve
     yorumu "ilk boyamadan sonra açılır, mount sıçraması İMKÂNSIZ" diyordu. Ölçüm bunun
     yanlış olduğunu gösterdi: passive efekt ilk boyamanın hemen ardından koşuyor, ama kap
     geometrisinin son düzeltmesi ResizeObserver'dan bir tur SONRA geliyordu — bayrak
     düzeltmeden ÖNCE açılıyor ve düzeltme tam da animasyona yakalanıyordu (ölçülen: kare 1'de
     geçiş çoktan "height .18s"ti, ardından 11 kare boyunca 1249px→962px süzülme).

     Yukarıdaki her-commit ölçümü bu yarışın ana kaynağını zaten kurutuyor; bu iki-kare
     gecikmesi ikinci kilittir ve gözlemci yollu düzeltmeleri de kapsar (ör. sayfa kaydırma
     çubuğu kaybolunca sütun bütçesinin yeniden hesaplanması — o tur ASENKRON gelir ve
     her-commit ölçümünün erişemediği tek yoldur). İkisi birlikte: mount'ta hiçbir animasyon
     yok, mount'tan sonra hepsi var. */
  const [yerlesti, setYerlesti] = useState(false);
  useEffect(() => {
    let ikinci = 0;
    const ilk = requestAnimationFrame(() => { ikinci = requestAnimationFrame(() => setYerlesti(true)); });
    return () => { cancelAnimationFrame(ilk); cancelAnimationFrame(ikinci); };
  }, []);

  // Ölçüm boyamadan ÖNCE yapılmalı; yoksa tek sayfalık hâli bir kare görünüp sonra bölünür.
  useLayoutEffect(() => {
    setSayfalar(sayfalaraBol(olcumleriTopla(olcerRef.current)));
  }, [metin]);

  const satirStil = {
    margin: 0,
    fontFamily: BELGE_FONT,
    fontSize: `${BELGE_PUNTO_PT}pt`,
    lineHeight: BELGE_SATIR,
    color: BELGE_MURAKKEP,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    // Boş satırlar da yer kaplamalı (paragraf boşluğu); 1pt = 96/72 px.
    minHeight: BELGE_PUNTO_PT * (96 / 72) * BELGE_SATIR,
  };

  const sayfaStil = {
    width: A4_GEN_PX,
    height: A4_YUK_PX,
    boxSizing: "border-box",
    padding: KENAR_MM * MM,
    backgroundColor: "var(--kd-kagit)",
    backgroundImage: "var(--kd-doku)",
    // Köşe yuvarlaması YOK — gerçek sayfa keskin köşelidir. Kağıt beyazı, "masa" (surf2)
    // tonunun üstünde durur; ince kenar + derin gölge olmadan iki beyaz birbirine karışıyordu.
    border: `1px solid ${PAL.line}`,
    // SH.kagit: değerler bit-aynı, gölge mürekkebi tek kaynağa (--ke-shadow-rgb) bağlı.
    boxShadow: SH.kagit,
    overflow: "hidden",
    flexShrink: 0,
  };

  const satirBas = (i, olcum) => {
    const rol = roller[i] || { tip: "duz", metin: satirlar[i] };
    const s = satirlar[i];
    const islak = !olcum && islakMi(s);
    const stil = { ...satirStil, ...ROL_STIL[rol.tip], ...(islak ? { animation: `kd-kuru .9s var(--ke-ease-out) ${Math.min(i, 12) * 30}ms both` } : null) };
    const ic = rol.tip === "sayi"
      ? (<><span>{rol.metin}</span><span style={{ flexShrink: 0 }}>{rol.sag}</span></>)
      : (rol.tip === "duz" ? (s === "" ? " " : s) : rol.metin);
    const katman = !olcum && i === imzaIdx;
    return (
      <div key={islak ? `${i}:${s}` : i} className={islak ? "kd-islak" : undefined} style={katman ? { ...stil, position: "relative" } : stil}>
        {ic}{katman && imzaKatmani}
      </div>
    );
  };

  const liste = sayfalar || [[0, satirlar.length]];
  const yigunYuk = (A4_YUK_PX * liste.length + SAYFA_ARASI_PX * (liste.length - 1)) * olcek;

  return (
    <div ref={sarmalRef} style={{ width: "100%" }}>
      {/* Ölçüm katmanı — görünmez; sayfa içeriğiyle BİREBİR aynı genişlik ve tipografide
          olmak zorunda, yoksa sarma farklı çıkar ve sayfalama kayar. */}
      <div aria-hidden="true" ref={olcerRef}
        style={{
          position: "absolute", visibility: "hidden", pointerEvents: "none",
          left: -99999, top: 0, width: YAZI_ALANI_GEN_PX,
        }}>
        {satirlar.map((_, i) => satirBas(i, true))}
      </div>

      {/* Ölçeklenmiş sayfa transform ile küçülür/büyür ama LAYOUT genişliği A4_GEN_PX kalır;
          bu yüzden ortalama, ölçeklenmiş gerçek genişliğe sahip bir sarmalla yapılır — yoksa
          sayfa panelin soluna yaslanıp sağda boş alan bırakıyordu. */}
      <div className="ke-a4-yigin"
        style={{ width: A4_GEN_PX * olcek, height: yigunYuk, margin: "0 auto", transition: yerlesti ? "height .18s ease-out" : "none" }}>
        <div className="ke-a4-olcek"
          style={{
            transform: `scale(${olcek})`, transformOrigin: "top left", width: A4_GEN_PX,
            display: "flex", flexDirection: "column", gap: SAYFA_ARASI_PX,
            opacity: solgun ? 0.55 : 1, transition: "opacity .15s ease-out",
          }}>
          {liste.map(([bas, son], si) => (
            /* cursor "inherit": sayfanın KENDİSİ tıklanabilir değilse (onAc yok) kabın
               imlecini EZMEZ. Eskiden burada "default" yazıyordu ve TaslaklarView'da
               tıklanabilirliği kabın kendisi taşıdığı için (cursor:zoom-in) memur kâğıdın
               üstüne geldiğinde büyüteç imleci yerine düz ok görüyordu — kâğıdın
               tıklanabilir olduğuna dair TEK ipucu kayboluyordu (2026-08-06 bulgusu). */
            <div key={si} className="ke-a4-sayfa"
              style={{ ...sayfaStil, cursor: onAc ? "zoom-in" : "inherit" }}
              title={onAc ? (baslikIpucu || "Büyüt (A4 görünüm)") : (baslikIpucu || undefined)}
              onClick={onAc || undefined}>
              {satirlar.slice(bas, son).map((_, j) => satirBas(bas + j, false))}
            </div>
          ))}
        </div>
      </div>

      {liste.length > 1 && (
        <div style={{ ...TYPE.meta, color: PAL.mut3, textAlign: "center", marginTop: SP.s }}>
          {liste.length} sayfa · A4 (210×297 mm)
        </div>
      )}
    </div>
  );
}
