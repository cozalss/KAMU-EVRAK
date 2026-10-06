/* DuzeltmeKalemi — öneri farkı "amir düzeltmesi" görünümünde (DuzeltmeDiff'in yeni yüzü).

   Bürokraside düzeltme böyle görünür: metin belge yazı tipinde durur, silinen kelimenin
   üstünden ince kırmızı kalemle geçilir, eklenen kelime tükenmez mavisiyle altı çizili yazılır,
   değişen paragrafın kenarına kırmızı düzeltme işareti (⁁) düşer. Eski mono satır-diff'i
   resmî yazıyı kod editörü gibi gösteriyordu (jüri tur 6).

   Erişilebilirlik: <del>/<ins> semantik öğeleri + ekran okuyucuya "silinen/eklenen" önekleri;
   renk tek sinyal değil (üstü çizili ↔ altı çizili). Kelime eşleme lib/duzeltmeFarki'de. */
import { useMemo } from "react";
import { PAL, DERIN, ALFA, T, R, MONO, TYPE, RAD, SP, SR_ONLY } from "./neonUi.jsx";
import { BELGE_FONT, ROL_STIL } from "./A4Belge.jsx";
import { duzeltmeBloklari, duzeltmeSayisi } from "../lib/duzeltmeFarki.js";
import { antetSiniflandir } from "../lib/a4Antet.js";

const SATIR_SONU = "\n";
const METIN = { fontFamily: BELGE_FONT, fontSize: 14, lineHeight: "23px", whiteSpace: "pre-wrap", wordBreak: "break-word" };

function Parca({ p }) {
  if (p.tur === "sil") {
    return (
      <del style={{ marginRight: 3, color: DERIN.kirmizi, textDecorationLine: "line-through", textDecorationThickness: 1.25, textDecorationColor: R, background: "transparent" }}>
        <span style={SR_ONLY}>silinen: </span>{p.t}
      </del>
    );
  }
  if (p.tur === "ekle") {
    return (
      <ins style={{ color: DERIN.T, textDecorationLine: "underline", textDecorationThickness: 1.5, textUnderlineOffset: 3, textDecorationColor: T, background: ALFA(T), borderRadius: 2 }}>
        <span style={SR_ONLY}>eklenen: </span>{p.t}
      </ins>
    );
  }
  return <span>{p.t}</span>;
}

/* Blokları GÖRÜNEN SATIRLARA böler ve her satıra önerilen metindeki sırasını (yeniIdx)
   iliştirir — resmî dizgi (ortalı antet, sağda tarih, ortalı muhatap, girinti, imza) önerilen
   metnin satır rolünden gelir. Tur 6 doğrulaması: fark gövdesi düz metindi (T.C. sola yaslı,
   Sayı ile tarih tek satır) ve önizlemeyle aynı belgeye benzemiyordu. Yalnız eski metinde
   olan (tamamen silinen) satırın rolü yoktur → düz dizilir. */
function satirlaraBol(bloklar) {
  const satirlar = [];
  let yeniIdx = 0;
  let cur = { parcalar: [], degisti: false, yeniVar: false };
  const kapat = (yeniSatir) => {
    satirlar.push({ ...cur, yeniIdx: yeniSatir ? yeniIdx : null });
    if (yeniSatir) yeniIdx += 1;
    cur = { parcalar: [], degisti: false, yeniVar: false };
  };
  for (const b of bloklar) {
    for (const p of b.parcalar) {
      const parcalar = p.t.split(SATIR_SONU);
      parcalar.forEach((t, k) => {
        if (t) cur.parcalar.push({ tur: p.tur, t });
        if (t && p.tur !== "ayni") cur.degisti = true;
        if (t && p.tur !== "sil") cur.yeniVar = true;
        if (k === parcalar.length - 1) return;
        // Silinen satır sonu, satır önerilen metinde sürüyorsa kapatmaz ("ab[c][d]" tek satır);
        // yalnız eski metinde olan satır rolsüz kapanır. Satır sayacı yalnız yeni satırda artar.
        if (p.tur !== "sil") kapat(true);
        else if (!cur.yeniVar) kapat(false);
      });
    }
  }
  if (cur.parcalar.length) kapat(cur.yeniVar);
  return satirlar;
}

function DuzeltmeSatiri({ satir, rol }) {
  const yalinSayi = rol?.tip === "sayi" && !satir.degisti;
  const rolStil = rol && rol.tip !== "sayi" ? ROL_STIL[rol.tip] : null;
  const stil = { position: "relative", ...METIN, minHeight: 23, color: PAL.ink2, ...rolStil,
    ...(rol?.tip === "imza" ? { marginLeft: "45%" } : null), ...(yalinSayi ? ROL_STIL.sayi : null) };
  return (
    <div style={stil}>
      {satir.degisti && (
        <span aria-hidden="true" title="Düzeltilen satır"
          style={{ position: "absolute", left: -20, top: 0, width: 14, textAlign: "center", textIndent: 0, fontFamily: BELGE_FONT, fontSize: 16, lineHeight: "23px", fontWeight: 700, color: R }}>⁁</span>
      )}
      {yalinSayi
        ? (<><span>{rol.metin}</span><span style={{ flexShrink: 0 }}>{rol.sag}</span></>)
        : satir.parcalar.length ? satir.parcalar.map((p, j) => <Parca key={j} p={p} />) : " "}
    </div>
  );
}

export default function DuzeltmeKalemi({ eski, yeni }) {
  const bloklar = useMemo(() => (eski ? duzeltmeBloklari(eski, yeni) : []), [eski, yeni]);
  if (!eski) {
    return <div style={{ margin: 0, padding: "16px 20px", ...METIN, color: PAL.ink2, maxHeight: 480, overflow: "auto", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>{yeni}</div>;
  }
  const sayi = duzeltmeSayisi(bloklar);
  const satirlar = satirlaraBol(bloklar);
  const roller = antetSiniflandir(String(yeni ?? "").split(SATIR_SONU));
  return (
    <figure style={{ margin: 0, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, background: PAL.surf2, overflow: "hidden" }}>
      <figcaption style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "7px 14px", borderBottom: `1px solid ${PAL.line}`, ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3 }}>
        <span>Düzeltme</span>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 6, textTransform: "none", letterSpacing: 0, fontFamily: MONO }}>
          <del style={{ color: DERIN.kirmizi, textDecorationColor: R }}>silinen</del>
          <ins style={{ color: DERIN.T, textDecoration: "underline", textDecorationColor: T, textUnderlineOffset: 3 }}>eklenen</ins>
        </span>
        <span style={{ marginLeft: "auto" }}>{sayi === 0 ? "değişiklik yok" : `${sayi} düzeltme`}</span>
      </figcaption>
      <div aria-label={`Önerilen düzeltme: ${sayi} değişiklik`} style={{ maxHeight: 480, overflow: "auto", padding: "14px 18px 16px 30px" }}>
        {satirlar.map((st, i) => <DuzeltmeSatiri key={i} satir={st} rol={st.yeniIdx == null ? null : roller[st.yeniIdx]} />)}
      </div>
    </figure>
  );
}
