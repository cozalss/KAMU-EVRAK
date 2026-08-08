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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAL, SH, SP, TYPE } from "./neonUi.jsx";
import {
  A4_GEN_PX,
  A4_YUK_PX,
  KENAR_MM,
  MM,
  YAZI_ALANI_GEN_PX,
  olcekHesapla,
  olcumleriTopla,
  sayfalaraBol,
} from "../lib/a4Sayfalama.js";

const SAYFA_ARASI_PX = 24;

/* Yönetmelik m.7/1 belgede İKİ yazı tipine izin verir: "Times New Roman" 12 punto VEYA
   "Arial" 11 punto. Arial seçildi — kullanıcı tercihi tırnaksız (sans-serif) görünüm ve bu
   tercih mevzuata AYKIRI DEĞİL, yönetmeliğin kendi ikinci seçeneği. Times'a dönmek istenirse
   punto da 12'ye çekilmelidir; ikisi maddede birlikte tanımlı.

   PUNTO ≠ PİKSEL: "11 punto" CSS'te `fontSize: 11` yazılırsa 11 PİKSEL olur ve belge
   yönetmeliğin öngördüğünden ~%25 küçük çıkar (ilk sürümde bu hata vardı). Bu yüzden ölçü
   birimi açıkça `pt` verilir; sayfa boyutu da aynı 96dpi referansına dayandığı için ikisi
   tutarlı kalır. */
const BELGE_FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
const BELGE_PUNTO_PT = 11;
const BELGE_SATIR = 1.45;
const BELGE_MURAKKEP = "#111";   // matbaa siyahı — kağıt üstünde UI gri tonları kullanılmaz

const STIL_ID = "ke-a4-stil";
const STIL = `
@media print {
  @page { size: A4; margin: 0; }
  body * { visibility: hidden; }
  .ke-a4-yigin, .ke-a4-yigin * { visibility: visible; }
  .ke-a4-yigin { position: absolute; inset: 0; width: auto !important; height: auto !important;
                 margin: 0 !important; }
  .ke-a4-olcek { transform: none !important; gap: 0 !important; }
  .ke-a4-sayfa { box-shadow: none !important; border: none !important;
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

export default function A4Belge({ metin = "", onAc = null, solgun = false, baslikIpucu = "" }) {
  const sarmalRef = useRef(null);
  const olcerRef = useRef(null);
  const [olcek, setOlcek] = useState(1);
  const [sayfalar, setSayfalar] = useState(null);

  const satirlar = String(metin).split("\n");

  useEffect(stilYukle, []);

  /* Ölçek ölçümü — BOYAMADAN ÖNCE (useLayoutEffect). Karar matematiği `olcekHesapla`da
     (saf, a4Sayfalama.test.js'te birim testli).

     NEDEN useLayoutEffect (gerçek hataydı): bu ölçüm `useEffect` ile boyamadan SONRA
     koşuyordu. `olcek` 1'de başladığı ve yığın yüksekliği `olcek`e bağlı olduğu için ilk
     kare YANLIŞ yükseklikle boyanıyor, hemen ardından ölçülen değere `transition: height`
     ile ANİMASYONLA gidiyordu (ör. 2270px → 1021px). Kullanıcı bunu "panel üstten aşağı
     iniyor" diye bildirdi; karar paneli her seçimde remount olduğundan başka bir taslağa
     her tıklayışta tekrarlanıyordu. Hemen aşağıdaki sayfalama efekti bu kuralı zaten
     yazmıştı ("Ölçüm boyamadan ÖNCE yapılmalı"); ölçek efekti ona uymuyordu — tutarsızlık
     hatanın ta kendisiydi. */
  useLayoutEffect(() => {
    const el = sarmalRef.current;
    if (!el) return undefined;
    const guncelle = () => {
      const kutu = el.parentElement;
      const bicim = kutu ? getComputedStyle(kutu) : null;
      const yuk = kutu
        ? kutu.clientHeight - parseFloat(bicim.paddingTop || 0) - parseFloat(bicim.paddingBottom || 0)
        : 0;
      const gen = el.clientWidth;
      if (gen <= 0) return;   // kap henüz yerleşmemiş; ResizeObserver birazdan yine çağırır
      setOlcek(olcekHesapla(gen, yuk));
    };
    guncelle();
    const gozlemci = new ResizeObserver(guncelle);
    gozlemci.observe(el);
    if (el.parentElement) gozlemci.observe(el.parentElement);
    return () => gozlemci.disconnect();
  }, []);

  /* Yükseklik geçişi ilk yerleşmede KAPALIDIR, sonrasında açılır.
     Yalnız ölçümü öne almak yetmez: ölçüm bir state güncellemesidir ve React bunu ayrı bir
     commit'te uygular; geçiş açık olsaydı o commit yine animasyon tetikleyebilirdi. Bu bayrak
     ilk boyamadan SONRA çalışan passive efektte açılır — yani ölçülen yüksekliği uygulayan
     commit'te geçiş hâlâ "none"dur, mount sıçraması imkânsız hâle gelir. Pencere yeniden
     boyutlandırma gibi GERÇEK değişiklikler ise animasyonlu kalır (hareket = bilgi).
     prefers-reduced-motion için ek kod YOK: neonUi.jsx global kuralı tüm geçişleri söndürür. */
  const [yerlesti, setYerlesti] = useState(false);
  useEffect(() => { setYerlesti(true); }, []);

  // Ölçüm boyamadan ÖNCE yapılmalı; yoksa tek sayfalık hâli bir kare görünüp sonra bölünür.
  useLayoutEffect(() => {
    setSayfalar(sayfalaraBol(olcumleriTopla(olcerRef.current)));
  }, [metin]);

  const satirStil = {
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
    background: "#fff",
    // Köşe yuvarlaması YOK — gerçek sayfa keskin köşelidir. Kağıt beyazı, "masa" (surf2)
    // tonunun üstünde durur; ince kenar + derin gölge olmadan iki beyaz birbirine karışıyordu.
    border: `1px solid ${PAL.line}`,
    // SH.kagit: değerler bit-aynı, gölge mürekkebi tek kaynağa (--ke-shadow-rgb) bağlı.
    boxShadow: SH.kagit,
    overflow: "hidden",
    flexShrink: 0,
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
        {satirlar.map((s, i) => <div key={i} style={satirStil}>{s === "" ? " " : s}</div>)}
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
              {satirlar.slice(bas, son).map((s, i) => (
                <div key={i} style={satirStil}>{s === "" ? " " : s}</div>
              ))}
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
