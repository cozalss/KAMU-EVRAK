/* TaslakKararPaneli — Taslaklar triyajının sağ iki sütunu: MASA (kâğıt) + KARAR sütunu.
   TaslaklarView'dan ayrıldı (dosya <800 kuralı). React fragment döner; iki parça üst grid'in
   AYRI hücreleridir (kuyruk | kâğıt | karar).

   Neden ikiye ayrık (2026-08 ölçümü): A4 dikey (0,707) — kâğıt ve eylemler tek geniş kartta
   iken kartın yarısı ölü beyaz alandı. Kâğıt sütunu ölçülen yükseklikten A4 oranıyla türer.

   Tur 6 (jüri):
   · KARAR SÜTUNU = MASA YÜKSEKLİĞİ (geniş düzen): fiş içeriği kendi içinde kayar, eylem bloğu
     sütunun DİBİNE sabitlenir. 1440x900'de "Kurulu topla" ve Sil sütunun altından taşıyordu;
     1920'de karar fişi masadan 107px kısa bitip sağ altta yırtık bir boşluk bırakıyordu.
   · Masa başlığında Okuma/Sayfa anahtarı (TaslakOkumaKesiti): dar sütunda varsayılan okuma
     kesiti — kâğıt gerçek puntoda okunur.

   Sözleşmeler (geri döndürme): Gönder tek primary; gönderim iki adımlı (fiş); sil/gönder
   onayı eylem yığınının yerine geçer; sendBusy tüm eylemleri kilitler. */
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BuyutIkon, MONO, PAL, DERIN, TYPE, RAD, SP, SH, focusRing } from "./neonUi.jsx";
import A4Belge from "./A4Belge.jsx";
import KararFisi from "./TaslakKararFisi.jsx";
import { KararEylemleri, MetinEylem, COP } from "./TaslakEylem.jsx";
import { BIRIM_GOSTER, cleanDemoText } from "../lib/evrakEtiket.js";
import { A4_GEN_MM, A4_YUK_MM } from "../lib/a4Sayfalama.js";
import { gonderimDenetimi } from "../lib/gonderimHazirlik.js";
import { MASA_PAY } from "./TaslakDefter.jsx";
import GonderimOnayFisi from "./GonderimOnayFisi.jsx";
import TaslakOkumaKesiti, { GorunumAnahtari, useKagitGorunumu } from "./TaslakOkumaKesiti.jsx";

const MOBIL_SAHNE = 360;   // telefonda kâğıt sahnesinin mantıksal genişliği (px)
const MASA_BASLIK_H = 30;  // masa künye satırı (anahtar + sayfa bilgisi)

/* Telefon kâğıt sahnesi — kabın genişliği ölçülüp CSS zoom'a çevrilir (a4Sayfalama
   matematiği DEĞİŞMEZ, yalnız sunum). */
function useMobilZoom(genis, kap) {
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    if (genis || !kap || typeof ResizeObserver === "undefined") return undefined;
    const olc = () => { const w = kap.clientWidth; if (w > 0) setZoom(Math.min(1, w / MOBIL_SAHNE)); };
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(kap);
    return () => ro.disconnect();
  }, [genis, kap]);
  return zoom;
}

/* MASA — çökük arşiv zemini; üstte künye satırı (görünüm anahtarı), altında kâğıt. Kâğıt ya
   tam A4 sayfası (aspect-ratio, yüksekliğe sığar) ya da okuma kesitidir. Tık/Enter → A4
   düzenleme (BelgeModal). */
function Masa({ h, ad, metin, genis, sutunH, kagitGen, onDuzenle }) {
  const [kap, setKap] = useState(null);
  const zoom = useMobilZoom(genis, kap);
  // Okunabilirlik kararı kâğıdın EKRANDAKİ genişliğinden: geniş düzende sütun bütçesi,
  // telefonda zoom'lanmış 360px sahne.
  const [gorunum, setGorunum] = useKagitGorunumu(genis ? kagitGen : MOBIL_SAHNE * zoom);
  const okuma = gorunum === "okuma";
  return (
    <div style={{ minWidth: 0, height: genis ? (sutunH ?? undefined) : undefined, display: "flex", flexDirection: "column", gap: SP.s,
      padding: genis ? `10px ${MASA_PAY}px ${MASA_PAY}px` : SP.m, boxSizing: "border-box", borderRadius: RAD.card, background: PAL.bg2,
      boxShadow: `inset 0 1px 3px color-mix(in srgb, ${PAL.ink} 7%, transparent)`, animation: "nu-rise .32s var(--ke-ease-out) .08s both" }}>
      <div style={{ minHeight: MASA_BASLIK_H, flexShrink: 0, display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
        <span aria-hidden="true" style={{ ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {okuma ? "Gerçek punto" : "210×297 mm"}
        </span>
        <span style={{ marginLeft: "auto", flexShrink: 0 }}><GorunumAnahtari deger={gorunum} onDegis={setGorunum} /></span>
      </div>
      <div style={{ flex: genis ? 1 : "none", minHeight: 0, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <div role="button" tabIndex={0} title="Düzenle (A4 görünüm)" aria-label={`${ad} taslağını A4 görünümde düzenle`} {...focusRing}
          data-karar-kagit="" data-kagit="" ref={setKap} onClick={onDuzenle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDuzenle(); } }}
          style={{ position: "relative", minWidth: 0, maxWidth: "100%", overflowY: "auto", overscrollBehavior: "contain", cursor: "zoom-in",
            ...(okuma
              ? { width: "100%", height: genis ? "100%" : undefined, maxHeight: genis ? undefined : "72vh" }
              : { height: genis ? "100%" : undefined, aspectRatio: genis ? `${A4_GEN_MM} / ${A4_YUK_MM}` : undefined, width: genis ? undefined : "100%", maxHeight: genis ? undefined : "76vh" }) }}>
          <div aria-hidden="true" style={{ position: "sticky", top: SP.s, height: 0, zIndex: 2, display: "flex", justifyContent: "flex-end", paddingRight: SP.s, pointerEvents: "none" }}>
            <span data-kagit-buyut="" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut, boxShadow: SH.card }}>
              <BuyutIkon />
            </span>
          </div>
          {/* key: seçim değişince kâğıt yeniden "masaya konur" (nu-rise, reduced-motion'da anında) —
              satırdan satıra geçişte tek, anlamlı hareket (jüri tur 8). */}
          {okuma ? <TaslakOkumaKesiti key={h.id} metin={metin} />
            : genis ? <A4Belge metin={metin} baslikIpucu="Düzenle (A4 görünüm)" />
            : (
              <div style={{ width: MOBIL_SAHNE, zoom }}>
                <A4Belge metin={metin} baslikIpucu="Düzenle (A4 görünüm)" sigdir="genislik" okumaYedegi={false} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/* BOŞ MASA — filtre hiçbir taslak bırakmadığında kâğıt + karar sütunlarının yerine tek hücre.
   Eskiden iki sütun tamamen kayboluyor, ekranın ~2/3'ü düz zemin kalıyordu (tur 6). Masa aynı
   çökük zeminde durur; ortada kesik çizgili boş bir kâğıt silueti "seçili belge yok" der.
   Eylem YOK: temizleme tek yerde, kuyruğun boş-filtre satırında. */
export function BosMasa({ sutunH, toplam }) {
  return (
    <div aria-hidden="true" style={{ gridColumn: "2 / -1", minWidth: 0, height: sutunH ?? undefined, minHeight: 320, boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl, borderRadius: RAD.card, background: PAL.bg2,
      boxShadow: `inset 0 1px 3px color-mix(in srgb, ${PAL.ink} 7%, transparent)`, animation: "nu-rise .32s var(--ke-ease-out) both" }}>
      <div style={{ width: "min(300px, 60%)", aspectRatio: `${A4_GEN_MM} / ${A4_YUK_MM}`, maxHeight: "100%", boxSizing: "border-box",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.s, padding: SP.l, textAlign: "center",
        border: `1px dashed ${PAL.lineHi}`, borderRadius: 2 }}>
        <span style={{ ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3 }}>Masa boş</span>
        <span style={{ ...TYPE.data, color: PAL.mut2, textWrap: "balance" }}>
          Filtreye uyan taslak yok; {toplam} taslak kuyrukta bekliyor.
        </span>
      </div>
    </div>
  );
}

/* Kaydırma kabının dibinde içerik kaldı mı? Jüri tur 8: 1440'ta fiş künyesinin ilk satırı
   kaydırma kenarında YARIM görünüyordu (kesik metin hata gibi okunur). Altında içerik varken
   dibe 28px solma maskesi iner — "devamı var" der; en dipte maske kalkar, hiçbir satır örtülmez. */
const SOLMA_PX = 28;
function useDipteIcerik(genis, anahtar) {
  const [kap, setKap] = useState(null);
  const [devam, setDevam] = useState(false);
  useLayoutEffect(() => {
    if (!genis || !kap) { setDevam(false); return undefined; }
    const olc = () => setDevam(kap.scrollHeight - kap.scrollTop - kap.clientHeight > 2);
    olc();
    kap.addEventListener("scroll", olc, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(olc) : null;
    ro?.observe(kap);
    if (kap.firstElementChild) ro?.observe(kap.firstElementChild);
    return () => { kap.removeEventListener("scroll", olc); ro?.disconnect(); };
  }, [genis, kap, anahtar]);
  const maske = devam ? `linear-gradient(to bottom, black calc(100% - ${SOLMA_PX}px), transparent)` : undefined;
  const sonaKaydir = () => kap?.scrollTo({ top: kap.scrollHeight, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return { ref: setKap, devam, sonaKaydir, stil: maske ? { maskImage: maske, WebkitMaskImage: maske } : null };
}

/* Eylem durum makinesi — "bos" | "sil"; gönderimin ikinci adımı onay fişidir. */
function useKararDurumu(h, komut, sendBusy) {
  const [durum, setDurumHam] = useState("bos");
  const [hata, setHata] = useState(false);
  const [fisAcik, setFisAcik] = useState(false);
  const setDurum = (d) => {
    setHata(false);
    if (d === "gonder") { setDurumHam("bos"); setFisAcik(true); return; }
    setDurumHam(d);
  };
  useEffect(() => { setDurumHam("bos"); setHata(false); }, [h.id]);
  // Klavye kısayolu (kuyrukta G): gönderim ONAYINI açar — tek tuşla kalıcı kayıt üretilmez.
  useEffect(() => { if (komut?.tip === "gonder" && !sendBusy) setDurum("gonder"); }, [komut]); // eslint-disable-line react-hooks/exhaustive-deps
  return { durum, setDurum, hata, setHata, fisAcik, setFisAcik };
}

export default function TaslakKararPaneli({ h, konu, govde, tamMetin, genis, sutunH, kagitGen, sira = 1, toplam = 1, sendBusy, komut, onDuzenle, onKurul, onGonder, onSil }) {
  const denetim = useMemo(() => gonderimDenetimi(tamMetin), [tamMetin]);
  const k = useKararDurumu(h, komut, sendBusy);
  const dip = useDipteIcerik(genis, h.id);
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const r = h.result || {};
  const ad = konu || h.name;
  const gonderOnayli = async () => {
    if (!denetim.hazir) return;
    k.setHata(false);
    const ok = await onGonder();
    if (ok === false) k.setHata(true); else k.setFisAcik(false);
  };
  const metin = cleanDemoText(tamMetin) || govde;
  const eylemler = (
    <KararEylemleri gonderKilit={!denetim.hazir} ad={ad} birim={BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)} sendBusy={sendBusy} kompakt={!genis}
      durum={k.durum} hata={k.hata} setDurum={k.setDurum} onGonder={gonderOnayli}
      onDuzenle={onDuzenle} onKurul={onKurul} onSil={onSil} />
  );
  return (
    <>
      <Masa h={h} ad={ad} metin={metin} genis={genis} sutunH={sutunH} kagitGen={kagitGen} onDuzenle={onDuzenle} />
      <aside aria-label="Karar paneli"
        style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden",
          height: genis ? (sutunH ?? undefined) : undefined,
          background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
          animation: "nu-rise .32s var(--ke-ease-out) .14s both" }}>
        {/* Kaydırma kabı esnek sütun: fiş en az kabın boyunu doldurur, künye dibe oturur —
            künye ile eylem bloğu arasında ölü boşluk kalmaz (tur 6 doğrulaması, 1440'ta ~140px). */}
        <div ref={dip.ref} style={{ flex: genis ? "1 1 auto" : "none", minHeight: 0, overflowY: genis ? "auto" : "visible", display: "flex", flexDirection: "column", ...dip.stil }}>
          <KararFisi h={h} r={r} ad={ad} govde={govde} tarih={tarih} sira={sira} toplam={toplam}
            govdeUyari={denetim.hazir ? null : denetim.engel[0]?.metin} onDuzenle={onDuzenle} kunye={denetim.kunye} />
        </div>
        {genis && dip.devam && (
          /* "Devamı" künyesi: bindirme değil, kaydırma kabı ile eylem bloğu arasında kendi
             24px satırı (tur9 jüri: absolute künye fiş metnini örtüyordu). */
          <div style={{ flexShrink: 0, height: 24, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 14px", borderTop: `1px solid ${PAL.line}` }}>
            <button type="button" onClick={dip.sonaKaydir} tabIndex={-1} aria-hidden="true" data-press=""
              style={{ padding: "0 6px", border: "none", borderRadius: RAD.chip, background: "transparent",
                cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: PAL.mut2, animation: "nu-rise .22s var(--ke-ease-out) both" }}>
              Devamı ↓
            </button>
          </div>
        )}
        {genis ? <div style={{ flexShrink: 0 }}>{eylemler}</div> : (
          /* Telefonda eylemler sayfa dibine yapışık karar çubuğunda; fişte yalnız sessiz Sil. */
          <div style={{ padding: "4px 12px 12px", borderTop: `1px solid ${PAL.line}` }}>
            <MetinEylem onClick={() => k.setDurum("sil")} disabled={sendBusy} renk={DERIN.kirmizi} ariaLabel={`${ad} taslağını sil`}><COP /> Sil</MetinEylem>
          </div>
        )}
      </aside>
      {!genis && eylemler}
      {k.fisAcik && (
        <GonderimOnayFisi denetim={denetim} r={r} gonderiliyor={sendBusy} hata={k.hata}
          onOnayla={gonderOnayli} onVazgec={() => { k.setFisAcik(false); k.setHata(false); }}
          onDuzenle={() => { k.setFisAcik(false); onDuzenle(); }} />
      )}
    </>
  );
}
