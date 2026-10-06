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

function AramaKutusu({ filter, dar }) {
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
        placeholder={dar ? "Konu, dosya…" : "Konu, dosya adı…"} aria-label="Taslaklarda ara (konu ya da dosya adı)"
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
export function AracCubugu({ filter, turSecenek, birimSecenek, siraSecenek, dar = false }) {
  const f = filter.filters;
  return (
    <div className="ke-tas-arac" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 118px)", gap: SP.s, minWidth: 0, maxWidth: "100%", padding: SP.m, borderBottom: `1px solid ${PAL.line}` }}>
      {/* Seçici atomu (FilterBar) bu kümenin değil — telefonda 44px hedef kap kuralıyla verilir. */}
      <style>{"@media (max-width:640px){.ke-tas-arac select{min-height:44px;font-size:16px}}"}</style>
      <AramaKutusu filter={filter} dar={dar} />
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
export function DefterBasligi({ adet, toplam, dar = false, filtreli = false, onTemizle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 34, flexShrink: 0, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: KENAR_X, textAlign: "center", flexShrink: 0 }}>No</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 0, paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{dar ? "Konu" : "Konu · yazı türü · muhatap"}</span>
      <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: SP.s, paddingRight: filtreli ? 6 : 14, ...TNUM }}>
        {adet == null ? "yükleniyor" : filtreli ? <><span style={{ color: PAL.ink2 }}>{adet}</span>/ {toplam} kayıt</> : `${adet} kayıt`}
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

/* İç odak halkası — liste, köşeleri kırpan defter kartının içinde; dış halka kırpılırdı. */
export const icOdak = {
  onFocus: (e) => { if (e.currentTarget.matches(":focus-visible")) e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${T}`; },
  onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; },
};

/* Kuyruk satırı — kart DEĞİL: iki satırlık seçilebilir öğe (konu + meta), eylemsiz. Seçili:
   3px mürekkep şeridi + tint + 600 başlık + mavi sıra no (renk tek sinyal değil). */
export function KuyrukSatiri({ h, konu, muhatap, sira, secili, onSec, onAc, optId, ikiz = false }) {
  const tarih = ikizTarihi(h.ts, ikiz);
  const baslik = konu || h.name;
  const birim = BIRIM_GOSTER(h.result?.hedef_birim || h.hedef_birim, h.result?.evrak_turu || h.evrak_turu);
  const meta = metaSatiri(YAZI_TR(h.result?.yazi_turu) || "Taslak", birim && birim !== "—" ? birim : muhatap);
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
          {tarih && <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".02em", color: PAL.mut3, ...TNUM, flexShrink: 0 }}>{tarih}</span>}
        </div>
        <div title={meta} style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta}
        </div>
      </div>
    </div>
  );
}

/* İkiz satır (aynı konu + aynı meta): tarih saatle birlikte yazılır — "01 ile 02 birebir
   aynı" görünmesin (tur 6 doğrulaması). Ayırıcı veriden gelir; uydurma ek yok. */
const SAAT = { hour: "2-digit", minute: "2-digit" };
function ikizTarihi(ts, ikiz) {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const gun = d.toLocaleDateString("tr-TR");
  const saat = d.toLocaleTimeString("tr-TR", SAAT);
  // Bugünün TÜM satırları "bugün 21:14" (çapraz jüri: aynı listede yalnız ikizler "bugün …",
  // ötekiler "06.10.2026" yazıyordu — aynı gün iki biçimde okunuyordu). Eski gün: tarih; ikizse +saat.
  if (gun === new Date().toLocaleDateString("tr-TR")) return `bugün ${saat}`;
  return ikiz ? `${gun} ${saat}` : gun;
}

/** Satır anahtarı (konu · yazı türü · birim/muhatap) birden çok satırda geçenlerin id kümesi. */
export function ikizKumesi(satirlar) {
  const say = new Map();
  const anahtar = (h) => `${h.konu || h.name}|${h.result?.yazi_turu || ""}|${h.result?.hedef_birim || h.hedef_birim || h.muhatap || ""}`;
  satirlar.forEach((h) => say.set(anahtar(h), (say.get(anahtar(h)) || 0) + 1));
  return new Set(satirlar.filter((h) => say.get(anahtar(h)) > 1).map((h) => h.id));
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
