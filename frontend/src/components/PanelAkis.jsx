/* PanelAkis — AKIŞ NABZI = defter sayfası altındaki "NAKLİ YEKÛN" satırı (tur 6).
   Eski hâl dört eş "stat kartı"ydı: her hücrede sol üstte 36 px rakam, altında aynı "bugün
   henüz yok" cümlesi, hücrenin ~%70'i boş, sparkline'lar (aktifGun<2) hiç çizilmiyordu —
   MASTER'ın kaçındığı template imzası. Artık resmî defterlerin sayfa sonu toplam satırı:
   · Üstte ÇİFT ÇİZGİ (yekûn çizgisi), dört sayı TEK cetvelde, hairline ayraçlı.
   · Her sayının yanında 7 günlük ÇETELE (tally): gün başına bir çentik, boyu o günün adedi;
     boş gün kısa kıl çentik — "boş hafta" dürüstçe görünür, yarım grafik yok. Bugün T.
   · Düne-göre kıyas dört hücrede AYNI cümleyse (ilk kurulum) tek bir ortak alt nota iner.
   · Gelen kuyruğun tarihsel verisi yok → çetele yerine dürüst "anlık" künyesi.
   · `hata`: işlem geçmişi alınamadıysa geçmişe bağlı hücreler "—" + "alınamadı" der; kuyruk
     ve giden sayıları ayrı kaynaktan geldiği için görünmeye devam eder.
   Tıklama alanı hücrenin tamamı (2026-08-09 kuralı); NumberFlow yalnız canlı değişimde akar. */
import { cloneElement } from "react";
import NumberFlow from "@number-flow/react";
import { MONO, DISPLAY, T, TYPE, TNUM, SP, RAD, SH, EASE, DERIN, PAL, focusRing } from "./neonUi.jsx";
import { iskeletCizgi, iskeletNefes } from "./PanelBrif.jsx";
import { kiyasMetni } from "../lib/gunlukSeri.js";

const GUN_ETIKET = (i) => (i === 6 ? "bugün" : i === 5 ? "dün" : `${6 - i} gün önce`);

/* Çetele — 7 dikey çentik; hücrenin boş kalan genişliğini doldurur (tur 6 denetimi: rakam +
   sabit 46 px SVG hücrenin ~%35'inde kalıyor, sağ yarı boş duruyordu). Çentik boyu adet/max,
   boş gün 3 px kıl; bugün T. Native title ile gün ayrıntısı. */
function Cetele({ seri }) {
  const H = 30, max = Math.max(1, ...seri);
  return (
    <span aria-hidden="true" style={{ flex: "1 1 auto", minWidth: 46, maxWidth: 176, height: H, display: "flex", alignItems: "flex-end", gap: 4 }}>
      {seri.map((v, i) => (
        <span key={i} title={`${GUN_ETIKET(i)}: ${v}`}
          style={{ flex: "1 1 0", maxWidth: 16, height: v > 0 ? 6 + Math.round((v / max) * (H - 6)) : 3, borderRadius: 1,
            background: i === 6 && v > 0 ? T : v > 0 ? PAL.mut3 : PAL.lineHi }} />
      ))}
    </span>
  );
}

function Rakam({ value, sifir }) {
  return (
    <span style={{ fontFamily: DISPLAY, fontSize: 34, lineHeight: "34px", fontWeight: 800, fontStretch: "118%", letterSpacing: "-.03em",
      color: sifir ? PAL.mut3 : PAL.ink, ...TNUM }}><NumberFlow value={value} /></span>
  );
}

/* Hücre gövdesi — etiket satırı + (rakam · çetele) + isteğe bağlı kıyas künyesi. */
function HucreIc({ label, value, icon, gunluk, gecmis, yukleniyor, hata, ortakKiyas }) {
  const yok = hata && !!gecmis;   // yalnız işlem geçmişine bağlı sayılar "alınamadı" der
  const kiyas = gunluk ? kiyasMetni(gunluk) : null;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: SP.s, width: "100%", minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.meta, color: PAL.mut2, minWidth: 0 }}>
        <span aria-hidden="true" style={{ display: "flex", color: value && !yok && !yukleniyor ? DERIN.T : PAL.mut3 }}>{cloneElement(icon, { width: 14, height: 14 })}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </span>
      <span style={{ display: "flex", alignItems: "flex-end", gap: SP.m, minHeight: 34 }}>
        {yukleniyor ? <span style={{ display: "flex", alignItems: "center", height: 34 }}><span style={iskeletCizgi(48, 24)} /></span>
          : yok ? <span style={{ fontFamily: DISPLAY, fontSize: 34, lineHeight: "34px", fontWeight: 800, color: PAL.mut3 }}>—</span>
            : <Rakam value={value} sifir={value === 0} />}
        {!yukleniyor && !yok && gunluk && <Cetele seri={gunluk.seri} />}
        {!yukleniyor && gunluk === null && <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, paddingBottom: 2 }}>anlık kuyruk sayısı</span>}
        {yok && <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: DERIN.kirmizi, paddingBottom: 2 }}>alınamadı</span>}
      </span>
      {!ortakKiyas && kiyas && !yukleniyor && !yok && (
        <span style={{ ...TYPE.meta, color: kiyas.yon === "artis" ? DERIN.yesil : PAL.mut2, ...TNUM }}>{kiyas.metin}</span>
      )}
    </span>
  );
}

function AkisHucre({ h, i, kolon, yukleniyor, hata, ortakKiyas }) {
  const kutu = { textAlign: "left", padding: `${SP.m + 2}px ${SP.l + 2}px`, width: "100%", height: "100%",
    background: "transparent", border: "none", borderRadius: 0, display: "flex", minWidth: 0,
    borderLeft: i % kolon !== 0 ? `1px solid ${PAL.line}` : "none",
    borderTop: i >= kolon ? `1px solid ${PAL.line}` : "none" };
  const ic = <HucreIc {...h} yukleniyor={yukleniyor} hata={hata} ortakKiyas={ortakKiyas} />;
  if (yukleniyor) return <div style={kutu}>{ic}</div>;
  return (
    <button type="button" onClick={h.onClick} aria-label={h.ariaLabel || h.label} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...kutu, cursor: "pointer", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      {ic}
    </button>
  );
}

/* Ortak kıyas notu — sayaçların HEPSİ "bugün henüz yok" diyorsa tek satır (eskiden üç kez). */
function ortakKiyasMetni(hucreler) {
  const metinler = hucreler.filter((h) => h.gunluk).map((h) => kiyasMetni(h.gunluk).metin);
  if (metinler.length < 2 || metinler.some((m) => m !== "bugün henüz yok")) return null;
  return "Bugün henüz kayıt yok";
}

export default function AkisKarti({ hucreler, kolon, yukleniyor = false, hata = false }) {
  const ortak = yukleniyor || hata ? null : ortakKiyasMetni(hucreler);
  return (
    <section aria-label="Akış nabzı" aria-busy={yukleniyor || undefined}
      style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden",
        ...(yukleniyor ? iskeletNefes() : null) }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.s + 2}px ${SP.l + 2}px`, ...TYPE.antet, color: PAL.mut3 }}>
        <span style={{ whiteSpace: "nowrap" }}>AKIŞ NABZI{kolon >= 4 ? " · NAKLİ YEKÛN" : ""}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
        <span style={{ whiteSpace: "nowrap" }}>{kolon >= 4 ? "ÇETELE: SON 7 GÜN" : "SON 7 GÜN"}</span>
      </div>
      {/* Yekûn çizgisi — defter sayfa sonu toplamının çift çizgisi (antet çizgisiyle aynı dil). */}
      <div aria-hidden="true" style={{ height: 4, borderTop: `1px solid ${PAL.lineHi}`, borderBottom: `1px solid ${PAL.lineHi}` }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${kolon}, minmax(0, 1fr))` }}>
        {hucreler.map((h, i) => <AkisHucre key={h.label} h={h} i={i} kolon={kolon} yukleniyor={yukleniyor} hata={hata} ortakKiyas={!!ortak} />)}
      </div>
      {ortak && (
        <p style={{ margin: 0, padding: `${SP.s}px ${SP.l + 2}px`, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2,
          ...TYPE.meta, color: PAL.mut2 }}>
          {ortak} — çentikler son 7 günün günlük adedidir; dolu çentik bugündür.
        </p>
      )}
    </section>
  );
}
