/* TaslakKuyruk — Taslaklar kuyruk sütununun parçaları: araç çubuğu, defter başlığı, kuyruk
   satırı, boş-filtre durumu. TaslaklarView'dan ayrıldı (dosya <800 kuralı); davranış
   sözleşmeleri aynen (listbox + aria-activedescendant, sabit SATIR_H defter adımı).

   Tur 6 (jüri):
   · Araç çubuğu iki satır ve SABİT yükseklik — "Filtreleri temizle" bağlantısı artık araç
     çubuğunda doğmuyor (doğunca defter başlığını 28px aşağı itiyordu); defter başlığının sağ
     ucundaki sayaç yuvasına oturur ("2 / 6 kayıt · temizle").
   · "/" kısayol rozeti yalnız ince işaretçili (fare) cihazda — dokunmatikte klavye kısayolu yok.
   · Seçiciler künye önekiyle ("Tür · Tümü") — dar sütunda "Tüm biri…" kırpılması bitti.
   · Satır meta'sı birim yoksa MUHATABI yazar: aynı konulu üç taslak artık ayırt edilir. */
import { useEffect, useRef, useState } from "react";
import { Icon, MONO, T, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, EASE, focusRing } from "./neonUi.jsx";
import { SecimKutusu } from "./FilterBar.jsx";
import { YAZI_TR, BIRIM_GOSTER } from "../lib/evrakEtiket.js";
import { SATIR_H, KENAR_X, defterZemini } from "./TaslakDefter.jsx";

/* Meta satırı — YALNIZ dolu parçaları "·" ile birleştirir (bilinmeyen "—" düşer, yalnız
   kalan ayraç bırakmaz). */
export const metaSatiri = (...parcalar) =>
  parcalar.map((p) => String(p ?? "").trim()).filter((p) => p && p !== "—").join(" · ");

/* İnce işaretçi + hover: klavye kısayolu ipuçları yalnız orada anlamlı. */
function useInceIsaretci() {
  const sorgu = "(hover: hover) and (pointer: fine)";
  const [ince, setInce] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(sorgu).matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(sorgu);
    const degis = () => setInce(mq.matches);
    mq.addEventListener("change", degis);
    return () => mq.removeEventListener("change", degis);
  }, []);
  return ince;
}

function AramaKutusu({ filter, dar, kisa = false }) {
  const f = filter.filters;
  const aramaRef = useRef(null);
  const [odakta, setOdakta] = useState(false);
  const ince = useInceIsaretci();
  useEffect(() => {
    const dinle = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      e.preventDefault();
      aramaRef.current?.focus();
    };
    document.addEventListener("keydown", dinle);
    return () => document.removeEventListener("keydown", dinle);
  }, []);
  return (
    /* minWidth:0 — girdi telefonda 16px'e çıkınca (iOS zoom) min-content kabı itmesin. */
    <div style={{ position: "relative", minWidth: 0 }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", color: PAL.mut3, pointerEvents: "none" }}><Icon.search /></span>
      <input ref={aramaRef} type="search" value={f.search} onChange={(e) => filter.setSearch(e.target.value)}
        placeholder={dar ? "Konu, dosya…" : kisa ? "Ara" : "Konu, dosya adı…"} aria-label="Taslaklarda ara (konu ya da dosya adı)"
        onFocus={(e) => { focusRing.onFocus(e); setOdakta(true); }}
        onBlur={(e) => { focusRing.onBlur(e); setOdakta(false); }} data-dokunma=""
        style={{ width: "100%", height: dar ? 44 : 36, boxSizing: "border-box", padding: `0 ${ince && !dar ? 32 : 12}px 0 34px`, borderRadius: RAD.ctl,
          border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.ink, ...TYPE.data, ...(dar ? { fontSize: 16 } : null) }} />
      {ince && !dar && !f.search && !odakta && (
        <span aria-hidden="true" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", ...TYPE.meta, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 6px", background: PAL.surfHi, pointerEvents: "none" }}>/</span>
      )}
    </div>
  );
}

/* Kompakt iki satırlık araç çubuğu: arama + sıralama · tür + birim. Yüksekliği filtre
   durumundan BAĞIMSIZ (temizle bağlantısı defter başlığında). */
export function AracCubugu({ filter, turSecenek, birimSecenek, siraSecenek, dar = false, kisa = false }) {
  const f = filter.filters;
  return (
    <div className="ke-tas-arac" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 118px)", gap: SP.s, minWidth: 0, maxWidth: "100%", padding: SP.m, borderBottom: `1px solid ${PAL.line}` }}>
      {/* Seçici atomu (FilterBar) bu kümenin değil — telefonda 44px hedef kap kuralıyla verilir. */}
      <style>{"@media (max-width:640px){.ke-tas-arac select{min-height:44px;font-size:16px}}"}</style>
      <AramaKutusu filter={filter} dar={dar} kisa={kisa} />
      <SecimKutusu id="tas-sira" label="Sıralama" value={f.sortBy} onChange={(e) => filter.setSortBy(e.target.value)}
        options={siraSecenek} minW={58} />
      <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: SP.s, minWidth: 0 }}>
        <SecimKutusu id="tas-tur" label="Evrak türü" onek="Tür" value={f.select.evrak_turu} onChange={(e) => filter.setSelect("evrak_turu", e.target.value)}
          options={[{ value: "", label: "Tümü" }, ...turSecenek]} minW={400} />
        <SecimKutusu id="tas-birim" label="Hedef birim" onek="Birim" value={f.select.hedef_birim} onChange={(e) => filter.setSelect("hedef_birim", e.target.value)}
          options={[{ value: "", label: "Tümü" }, ...birimSecenek]} minW={400} />
      </div>
    </div>
  );
}

/* Defter başlığı — sütun etiketleri antet dilinde. Sağ uçtaki SAYAÇ YUVASI filtre etkinken
   "2 / 6 kayıt" + temizle bağlantısını taşır; yükseklik değişmez (sıçrama yok). Sütun
   etiketleri aria-hidden; sayaç ve düğme ekran okuyucuya açık. */
/* Yeniden deneme sayısı react-query `retry` ayarından (main.jsx: ilk istek + 3 tekrar). */
const DENEME_AZAMI = 4;
export function DefterBasligi({ adet, toplam, dar = false, filtreli = false, onTemizle, deneme = 0 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 34, flexShrink: 0, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: KENAR_X, textAlign: "center", flexShrink: 0 }}>No</span>
      {/* Deneme/yükleme sırasında DAR etiket: jüri tur 8 — 1920'de uzun etiket sayaçla boşluksuz
          çakışıyordu ("MUHATAPYENİDEN DENENİYOR · 4/4"). Sayaç yuvası ayrıca paddingLeft taşır. */}
      <span aria-hidden="true" style={{ flex: 1, minWidth: 0, paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{dar || adet == null ? "Konu" : "Konu · yazı türü · muhatap"}</span>
      <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: SP.s, paddingLeft: SP.m, paddingRight: filtreli ? 6 : 14, flexShrink: 0, ...TNUM }}>
        {adet == null ? (deneme > 0 ? `yeniden deneniyor · ${Math.min(deneme + 1, DENEME_AZAMI)}/${DENEME_AZAMI}` : "yükleniyor") : filtreli ? <><span style={{ color: PAL.ink2 }}>{adet}</span>/ {toplam} kayıt</> : `${adet} kayıt`}
        {filtreli && onTemizle && adet > 0 && (
          <button type="button" onClick={onTemizle} {...focusRing} data-press=""
            style={{ cursor: "pointer", height: 26, padding: "0 8px", border: "none", borderRadius: RAD.chip, background: ALFA(T), ...TYPE.antet, textTransform: "uppercase", color: DERIN.T, transition: `transform .14s ${EASE.out}` }}>
            Temizle
          </button>
        )}
      </span>
    </div>
  );
}

/* Liste odağı — jüri tur 8: genel :focus-visible halkası DIŞA dönük box-shadow'dur; liste
   köşeleri kırpan defter kartının içinde olduğundan halkanın yalnız üst ve alt çizgisi
   görünüyordu (kart çerçevesiyle karışıyordu), eski iç gölge ise satır zeminlerinin altında
   kalıyordu. 2. jüri: kab boyu outline tüm listeyi kalın çerçeveye alıp son satırı kesiyordu
   → odak SATIR düzeyinde (aria-activedescendant zaten var): seçili satır 2px iç mürekkep
   halkası alır, kapta yalnız üstte ince mürekkep çizgisi kalır. */
export const KUYRUK_ODAK_CSS = `
[data-kuyruk-liste]:focus-visible{box-shadow:inset 0 1px 0 color-mix(in srgb,var(--ke-t) 45%,transparent)!important;outline:none!important}
[data-kuyruk-liste]:focus-visible [aria-selected="true"]{box-shadow:inset 3px 0 0 var(--ke-t),inset 0 0 0 2px var(--ke-t)!important}
`;
export const icOdak = { "data-kuyruk-liste": "" };

/* Kuyruk satırı — kart DEĞİL: iki satırlık seçilebilir öğe (konu + meta), eylemsiz. Seçili:
   3px mürekkep şeridi + tint + 600 başlık + mavi sıra no (renk tek sinyal değil). */
export function KuyrukSatiri({ h, konu, muhatap, sira, secili, onSec, onAc, optId, kisa = false }) {
  const tarih = satirTarihi(h.ts, kisa);
  const tamTarih = satirTarihi(h.ts, false);
  const baslik = konu || h.name;
  const birim = BIRIM_GOSTER(h.result?.hedef_birim || h.hedef_birim, h.result?.evrak_turu || h.evrak_turu);
  // Dar kuyrukta (1440) satır yalnız saati taşır; eski günün tarihi meta satırının başına iner
  // (tur 9 jüri: "06.10 21:14" sütunu konuyu 15-18 karaktere sıkıştırıyordu).
  const gunEki = kisa ? satirGunu(h.ts) : "";
  const meta = metaSatiri(gunEki, YAZI_TR(h.result?.yazi_turu) || "Taslak", birim && birim !== "—" ? birim : muhatap);
  const zemin = secili ? ALFA(T) : "transparent";
  return (
    <div role="option" id={optId} aria-selected={secili} onClick={onSec} onDoubleClick={onAc} data-press=""
      style={{ cursor: "pointer", height: SATIR_H, boxSizing: "border-box", display: "flex", alignItems: "center",
        boxShadow: secili ? `inset 3px 0 0 ${T}` : "none", background: zemin,
        transition: `background .14s ease-out, transform .14s ${EASE.out}` }}
      onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = zemin; }}>
      <span aria-hidden="true" style={{ width: KENAR_X, flexShrink: 0, textAlign: "center", fontFamily: MONO, fontSize: 12, ...TNUM, fontWeight: secili ? 600 : 400, color: secili ? DERIN.T : PAL.mut3 }}>
        {String(sira).padStart(2, "0")}
      </span>
      <div style={{ flex: 1, minWidth: 0, padding: "0 14px 1px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span title={baslik} style={{ ...TYPE.ui, fontWeight: secili ? 600 : 500, color: PAL.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {baslik}
          </span>
          {tarih && <span title={tamTarih} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".02em", color: PAL.mut3, ...TNUM, flexShrink: 0 }}>{tarih}</span>}
        </div>
        <div title={meta} style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta}
        </div>
      </div>
    </div>
  );
}

/* Satır tarihi daima saatle yazılır — ikiz satırlar (aynı konu + aynı meta) da böylece ayrışır
   (tur 6 doğrulaması); ayırıcı veriden gelir, uydurma ek yok. */
const SAAT = { hour: "2-digit", minute: "2-digit" };
const iki = (n) => String(n).padStart(2, "0");
function satirTarihi(ts, kisa = false) {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const gun = d.toLocaleDateString("tr-TR");
  const saat = d.toLocaleTimeString("tr-TR", SAAT);
  const bugun = gun === new Date().toLocaleDateString("tr-TR");
  // KISA (dar kuyruk, 1440): yalnız saat — 5 mono karakter, sütun hizalı; gün meta satırında
  // (satirGunu). GENİŞ: bugün → "bugün 21:14", eski gün tam tarih + saat. Tam tarih title'da.
  if (kisa) return saat;
  return bugun ? `bugün ${saat}` : `${gun} ${saat}`;
}

/* Dar kuyrukta meta satırının gün öneki: bugün için boş (varsayılan gün), eski gün "06.10". */
function satirGunu(ts) {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  if (d.toLocaleDateString("tr-TR") === new Date().toLocaleDateString("tr-TR")) return "";
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}`;   // gg.aa (yerel ayar "/" basıyordu)
}

/* Liste yüksekliği SATIR_H'nin tam katı (tur 9 jüri: 1920'de 14. satır yarım kesikti). Kap
   esnek ölçülür, liste katına yuvarlanır; artan <52px defter zemini olarak boş kalır. */
export function useSatirKati(etkin) {
  const [el, kapRef] = useState(null);   // callback ref: kap geç bağlansa da gözlem kurulur
  const [yuk, setYuk] = useState(null);
  useEffect(() => {
    if (!etkin || !el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([g]) => {
      const h = Math.floor(g.contentRect.height / SATIR_H) * SATIR_H;
      setYuk(h > 0 ? h : null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [etkin, el]);
  return { kapRef, yuk: etkin ? yuk : null };
}

/* Boş filtre — defter SATIRLARINA oturur: başlık+açıklama tek 52px satır (kuyruk satırıyla
   aynı iki-satır ritmi), eylem bir sonraki satırda. Metin cetvel çizgisini kesmez. */
export function BosFiltre({ toplam, onTemizle }) {
  return (
    <div role="status" style={{ ...defterZemini(2), flex: 1, minHeight: SATIR_H * 4 }}>
      <div style={{ height: SATIR_H, display: "flex", flexDirection: "column", justifyContent: "center", padding: `0 14px 1px ${KENAR_X + 12}px`, minWidth: 0 }}>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Eşleşen taslak yok</span>
        <span title={`Kuyruktaki ${toplam} taslağın hiçbiri arama ve filtrelere uymuyor.`} style={{ ...TYPE.meta, color: PAL.mut2, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {toplam} taslaktan hiçbiri uymuyor.
        </span>
      </div>
      <div style={{ height: SATIR_H, display: "flex", alignItems: "center", paddingLeft: KENAR_X + 4 }}>
        <button type="button" onClick={onTemizle} {...focusRing} data-press="" data-dokunma=""
          style={{ cursor: "pointer", minHeight: 36, padding: "0 8px", border: "none", borderRadius: RAD.ctl, background: "transparent", ...TYPE.data, fontWeight: 600, color: DERIN.T, textDecoration: "underline", textUnderlineOffset: 3, transition: `transform .14s ${EASE.out}` }}>
          Aramayı ve filtreleri temizle
        </button>
      </div>
    </div>
  );
}

/* Klavye tuşu — kuyruk altbilgisindeki kısayol ipucu. */
export const Tus = ({ children }) => (
  <kbd style={{ display: "inline-block", minWidth: 16, padding: "0 4px", marginRight: 3, borderRadius: 4, border: `1px solid ${PAL.lineHi}`, borderBottomWidth: 2, background: PAL.surf, fontFamily: MONO, fontSize: 10, lineHeight: "14px", textAlign: "center", color: PAL.ink2 }}>{children}</kbd>
);
