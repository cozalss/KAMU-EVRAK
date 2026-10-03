/* GidenEvrakView — onaylanıp gönderilen resmî yazıların arşivi + en zengin filtre
   (arama/risk/durum çip + tür/birim select + tarih + sıralama) + detay modalı.
   outbox: DashboardApp session state (Onayla&Gönder → giden evrak). */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ViewWrap, Btn, KV, Icon, MONO, DISPLAY, PAL, BANT, TYPE, TNUM, RAD, SP, SH, DERIN, DERIN_OF, SR_ONLY, focusRing, odakDongusu } from "./neonUi.jsx";
import { SicilStil, SicilNo, BaslikHucre, SessizCip, DefterYuzey, BosDefter, DefterIskelet, DefterHata, GrupBasligi, useDefterGezinme, Imlec, HUCRE } from "./SicilDefter.jsx";
import { bosDurumMetni, gunleGrupla } from "../lib/sicilDefter.js";
import FilterBar from "./FilterBar.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { evrakKategori, kategoriMeta, KATEGORILER } from "../lib/kategori.js";

const DURUM_TR = { gonderildi: "Gönderildi", reddedildi: "Reddedildi", duzenlendi: "Düzenlenerek gönderildi" };
const DURUM_RENK = { gonderildi: BANT.yesil.c, reddedildi: BANT.kirmizi.c, duzenlendi: BANT.sari.c };
const fmtTime = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
// "bugün" / "N gün önce" — TAKVİM günü farkı (saat-tabanlı fark dün 18:00'i bugün 09:00'da
// "bugün" sayıyordu — bug avı bulgusu).
const gecenSure = (ts) => {
  const simdi = new Date(); simdi.setHours(0, 0, 0, 0);
  const o = new Date(Number(ts || 0)); o.setHours(0, 0, 0, 0);
  const gun = Math.round((simdi - o) / 86400000);
  return gun <= 0 ? "bugün" : `${gun} gün önce`;
};
const KATEGORI_SELECT = [{ value: "", label: "Tüm kategoriler" }, ...KATEGORILER.map((k) => ({ value: k.id, label: k.label }))];

const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Konu, kaynak evrak, kayıt no…" },
  chips: [
    { id: "risk", label: "Risk", options: [
      { value: "yesil", label: "Yeşil · Düşük", color: BANT.yesil.c },
      { value: "sari", label: "Sarı · Orta", color: BANT.sari.c },
      { value: "kirmizi", label: "Kırmızı · Yüksek", color: BANT.kirmizi.c },
    ] },
    { id: "durum", label: "Durum", options: [
      { value: "gonderildi", label: "Gönderildi", color: BANT.yesil.c },
      { value: "duzenlendi", label: "Düzenlenerek", color: BANT.sari.c },
      { value: "reddedildi", label: "Reddedildi", color: BANT.kirmizi.c },
    ] },
    /* "Yasal süre" çipi KALDIRILDI (bug avı bulgusu): sla_durum yalnız oturum satırlarında
       var — DB'de GidenEvrak tablosu bu kolonu taşımıyor, /giden-evrak döndürmüyor → çip
       refresh sonrası HİÇBİR kayıtla eşleşmiyordu (ölü filtre yanıltıcı). Satır/detaydaki
       koşullu "süresi geçmiş" gösterimi kalır; kalıcı filtre için şema değişikliği gerekir. */
  ],
  select: [
    { id: "kategori", label: "Kategori", options: KATEGORI_SELECT },
    { id: "tur", label: "Yazı türü", options: [] },
    { id: "birim", label: "Alıcı birim", options: [] },
  ],
  dateRange: { enabled: true, label: "Gönderim tarihi" },
  datePresets: { enabled: true },
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" },
    { value: "risk_desc", label: "Risk (yüksek–düşük)" }, { value: "birim_asc", label: "Birim (A–Z)" },
  ] },
  dataMapping: { search: ["konu", "kaynak_evrak_adi", "id"], risk: "risk", durum: "durum", sla: "sla_durum", kategori: "_kategori", tur: "tur", birim: "alici_birim", dateField: "gonderim_tarihi" },
};

/* Defter şablonu — gönderi no · konu bloğu · durum/risk · posta damgası · eylem. */
const SABLON = {
  kolon: "128px minmax(0,1fr) 168px 92px 116px",
  alan: '"no ana durum pul eylem"',
  alanDar: '"no pul" "ana ana" "durum eylem"',
  marj: "158px",
  adim: "88px",
};
const BASLIKLAR = [
  <BaslikHucre key="n" alan="no">Gönderi no</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Konu · kaynak · alıcı birim</BaslikHucre>,
  <BaslikHucre key="d" alan="durum">Durum · risk</BaslikHucre>,
  <BaslikHucre key="p" alan="pul">Pul</BaslikHucre>,
  <BaslikHucre key="e" alan="eylem" sag>Eylem</BaslikHucre>,
];
const saatOf = (ts) => { const d = new Date(Number(ts || 0)); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); };
const gunAy = (ts) => { const d = new Date(Number(ts || 0)); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }); };

/* Posta damgası ("iptal pulu") — gönderilen her satır için dairesel SVG: çember üstünde
   GÖNDERİLDİ, altında yıl (textPath), ortada gün.ay; sağa iptal dalgaları. Mühür moru
   (DERIN.V), mürekkep dokusu maskesi, satır kimliğinden türeyen SABİT eğim (her pul biraz
   farklı basılmış görünür ama yeniden çizimde zıplamaz). Salt görsel (aria-hidden): tarih
   satırda ekran okuyucuya ayrıca verilir. */
const PUL_DOKU = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='70'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
function PostaDamgasi({ ts, tohum = "" }) {
  const uid = useId().replace(/:/g, "");
  const d = new Date(Number(ts || 0));
  const gecerli = !Number.isNaN(d.getTime());
  const gun = gecerli ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}` : "—";
  const yil = gecerli ? String(d.getFullYear()) : "";
  let h = 0;
  for (const c of String(tohum)) h = (h * 31 + c.charCodeAt(0)) % 997;
  const egim = -4 - (h % 11);
  return (
    <svg width="86" height="62" viewBox="0 0 72 52" aria-hidden="true"
      style={{ "--egim": `${egim}deg`, display: "block", color: DERIN.V, transform: `rotate(${egim}deg)`, overflow: "visible",
        WebkitMaskImage: PUL_DOKU, maskImage: PUL_DOKU, WebkitMaskSize: "90px 70px", maskSize: "90px 70px",
        animation: "nu-damga .5s var(--ke-ease-out) both", animationDelay: "calc(min(var(--sd-i,0), 5) * 30ms + 120ms)" }}>
      <defs>
        <path id={`ust-${uid}`} d="M 7.5 26 A 18.5 18.5 0 0 1 44.5 26" />
        <path id={`alt-${uid}`} d="M 6 26 A 20 20 0 0 0 46 26" />
      </defs>
      {[0, 6, 12].map((y) => <path key={y} d={`M 51 ${20 + y} q 4 -3 7 0 t 7 0 t 7 0`} fill="none" stroke="currentColor" strokeWidth="1.3" opacity=".75" />)}
      <circle cx="26" cy="26" r="24.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="26" cy="26" r="13.5" fill="none" stroke="currentColor" strokeWidth=".9" />
      <text style={{ fontFamily: DISPLAY, fontSize: 5.4, fontWeight: 800, letterSpacing: ".04em", fontStretch: "100%" }} fill="currentColor">
        <textPath href={`#ust-${uid}`} startOffset="50%" textAnchor="middle">GÖNDERİLDİ</textPath>
      </text>
      <text style={{ fontFamily: MONO, fontSize: 5.6, fontWeight: 600, letterSpacing: ".06em" }} fill="currentColor">
        <textPath href={`#alt-${uid}`} startOffset="50%" textAnchor="middle">★ {yil} ★</textPath>
      </text>
      <text x="26" y="28.8" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, ...TNUM }} fill="currentColor">{gun}</text>
    </svg>
  );
}

function DetayModal({ item, onClose }) {
  const closeRef = useRef(null);
  // Escape dinleyicisi YALNIZ modal açıkken (bug avı bulgusu): kapalıyken de bağlı kalınca
  // arama kutusundaki Esc, odağı listedeki eski satıra çalıyordu.
  useEffect(() => {
    if (!item) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, item]);
  if (!item) return null;
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl }}>
      <div role="dialog" aria-modal="true" aria-labelledby="giden-modal-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} style={{ width: "min(720px,100%)", maxHeight: "88vh", overflowY: "auto", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.xl, boxShadow: SH.modal }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SP.l, marginBottom: SP.l }}>
          <div>
            <h2 id="giden-modal-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{item.id}</h2>
            <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>{cleanDemoText(item.konu)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Kapat" {...focusRing} data-press=""
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
            style={{ cursor: "pointer", flexShrink: 0, width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: PAL.ink2, padding: 0, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
            <Icon.x />
          </button>
        </div>
        <div style={{ marginBottom: SP.l }}>
          <KV k="Kaynak evrak" v={item.kaynak_evrak_adi} />
          <KV k="Kategori" v={kategoriMeta(item._kategori).label} />
          <KV k="Evrak türü" v={EVRAK_TR(item.evrak_turu)} />
          <KV k="Yazı türü" v={item.tur ? YAZI_TR(item.tur) : "—"} />
          <KV k="Önerilen / alıcı birim" v={BIRIM_LBL(item.alici_birim)} c={DERIN.V} />
          <KV k="Sınıflandırma güveni" v={fmtGuven(item.guven) || "—"} c={item.guven >= 0.5 ? DERIN.T : PAL.mut2} />
          <KV k="Risk bandı" v={BANT[item.risk]?.l || "—"} c={DERIN_OF(BANT[item.risk]?.c)} />
          <KV k="Durum" v={DURUM_TR[item.durum] || item.durum} c={DERIN_OF(DURUM_RENK[item.durum])} />
          {item.sla_durum && <KV k="Yasal süre" v={item.sla_durum === "GECIKMIS" ? "Gecikmiş" : item.sla_durum === "KRITIK" ? "Kritik" : item.sla_durum} c={item.sla_durum === "GECIKMIS" ? DERIN.kirmizi : item.sla_durum === "KRITIK" ? DERIN.sari : PAL.mut2} />}
          {item.evrak_tarihi && <KV k="Evrak / dilekçe tarihi" v={item.evrak_tarihi} />}
          <KV k="Gönderen memur" v={[item.memor_adi, item.memor_unvan].filter(Boolean).join(" · ")} />
          <KV k="Gönderim tarihi" v={fmtTime(item.gonderim_tarihi)} />
          {item.son_hash && <KV k="Denetim hash" v={String(item.son_hash).slice(0, 22) + "…"} c={DERIN.yesil} />}
        </div>
        {item.taslak && (
          <pre style={{ margin: 0, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cleanDemoText(item.taslak)}</pre>
        )}
      </div>
    </div>
  );
}

/* Defter kaydı — gönderi no · konu bloğu · durum/risk · posta damgası · eylem. Gün
   gruplamasında (zimmet çizelgesi) göreli "N gün önce" yerine gönderim SAATİ yazılır —
   gün zaten yapışkan ayraçta. */
function GidenSatir({ item, sira, gez, gunlu, onAc }) {
  const drenk = DURUM_RENK[item.durum] || PAL.mut2;
  const kat = kategoriMeta(item._kategori);
  const guven = fmtGuven(item.guven);
  const gecikmis = item.sla_durum === "GECIKMIS";
  const riskC = BANT[item.risk]?.c;
  const gitti = item.durum === "gonderildi" || item.durum === "duzenlendi";
  const ayrac = <span aria-hidden="true" style={{ color: PAL.mut3 }}>·</span>;
  return (
    <div role="row" data-sicil-satir="" data-sd-anahtar={item.id} style={{ "--sd-i": sira }}
      onPointerDown={() => gez.sec(item.id)}
      onClick={(e) => onAc(item, e.currentTarget.querySelector("[data-sd-eylem]"))}>
      {gez.aktif === item.id && <Imlec gezinme={gez} kimlik="giden" />}
      <span {...HUCRE.grid} style={{ gridArea: "no", display: "flex", flexDirection: "column", gap: 2 }}>
        <SicilNo no={item.id} />
        {gunlu && <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM }}>saat {saatOf(item.gonderim_tarihi)}</span>}
      </span>
      <div {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0 }}>
        <span data-sd-konu="" title={cleanDemoText(item.konu)} style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDemoText(item.konu)}</span>
        <div style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, display: "flex", columnGap: SP.s, rowGap: 2, alignItems: "center", minWidth: 0, whiteSpace: "nowrap" }}>
          <span style={{ color: PAL.mut2, fontWeight: 500 }}>{kat.label}</span>
          {ayrac}
          <span title={item.kaynak_evrak_adi} style={{ fontFamily: MONO, fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{item.kaynak_evrak_adi}</span>
          {!gunlu && <>{ayrac}<span>{gecenSure(item.gonderim_tarihi)}</span></>}
          {guven && <>{ayrac}<span style={TNUM}>güven {guven}</span></>}
          {gecikmis && <span style={{ color: DERIN.kirmizi, fontWeight: 500 }}>· süresi geçmiş</span>}
        </div>
        <div style={{ ...TYPE.meta, color: PAL.mut2, marginTop: 2, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span aria-hidden="true" style={{ display: "flex", color: DERIN.V, flexShrink: 0 }}><Icon.send width={11} height={11} /></span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={SR_ONLY}>alıcı birim: </span>{BIRIM_LBL(item.alici_birim)}</span>
        </div>
      </div>
      <span {...HUCRE.grid} style={{ gridArea: "durum", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", minWidth: 0 }}>
        <SessizCip renk={drenk} vurgulu={item.durum === "reddedildi"} metin={DURUM_TR[item.durum] || item.durum} />
        {/* Risk kodu (BANT.l uppercase istisnası — mono) */}
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: ".06em", paddingLeft: 12, color: riskC ? DERIN_OF(riskC) : PAL.mut3 }}><span style={SR_ONLY}>risk: </span>{BANT[item.risk]?.l || "—"}</span>
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "pul", justifySelf: "center" }}>
        {gitti ? <PostaDamgasi ts={item.gonderim_tarihi} tohum={item.id} /> : <span style={{ ...TYPE.meta, color: PAL.mut3 }} aria-label="Pul yok — gönderilmedi">—</span>}
        {gitti && <span style={SR_ONLY}>Gönderim: {gunAy(item.gonderim_tarihi)}</span>}
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "eylem", justifySelf: "end" }}>
        <button type="button" data-sd-eylem="" data-press=""
          onClick={(e) => { e.stopPropagation(); onAc(item, e.currentTarget); }} aria-label={`${item.id} detayını görüntüle`}>
          Görüntüle <Icon.arrow width={14} height={14} />
        </button>
      </span>
    </div>
  );
}

const BOS_ILK = {
  baslik: "Defterin ilk sayfası henüz boş",
  sub: "Bir evrakı işleyip “Onayla ve gönder” dediğinizde yazı buraya posta damgasıyla, değiştirilemez denetim iziyle birlikte işlenir.",
};

/* Boş defter üç hâli — yükleniyor (iskelet) · hata/çevrimdışı · gerçekten ilk sayfa. */
function GidenBos({ yukleniyor, hata, onYenidenDene, onGoInbox }) {
  if (yukleniyor) return <DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} etiket="Giden evrak kayıtları yükleniyor" />;
  if (hata) return <DefterHata sablon={SABLON} basliklar={BASLIKLAR} baslik="Giden evrak defteri alınamadı" ayrinti={String(hata?.message || hata)} onYenidenDene={onYenidenDene} />;
  return (
    <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="E-G-2026/" satir={7} baslik={BOS_ILK.baslik} sub={BOS_ILK.sub}
      actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
  );
}

/* yukleniyor / hata: DB'den giden evrak sorgusunun durumu (DashboardApp gidenQ). Verilmezse
   eski davranış — boş liste "ilk sayfa boş" olarak okunur. */
export default function GidenEvrakView({ outbox = [], onUpload, onGoInbox, yukleniyor = false, hata = null, onYenidenDene }) {
  const [detay, setDetay] = useState(null);
  const gez = useDefterGezinme();    // j/k gezinme + kayan seçim imleci
  const triggerRef = useRef(null);   // modal kapanınca odağı tetikleyen butona geri ver (a11y)
  const closeDetay = useCallback(() => { setDetay(null); triggerRef.current?.focus(); }, []);
  // Her gönderiye operasyonel kategori türet (evrak türü + birim + konu) — filtre + rozet.
  const items = useMemo(() => outbox.map((o) => ({
    ...o, _kategori: o._kategori || evrakKategori({ evrak_turu: o.evrak_turu, birim: o.alici_birim, konu: o.konu }),
  })), [outbox]);
  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      BASE_CONFIG.select[0], // kategori (statik tam liste)
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(items, "tur", YAZI_TR)] },
      { ...BASE_CONFIG.select[2], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(items, "alici_birim", BIRIM_LBL)] },
    ],
  }), [items]);
  const filter = useFilter(items, config);
  const gonderildi = outbox.filter((o) => o.durum === "gonderildi").length;
  // Zimmet çizelgesi: tarih sıralamasında gün ayraçları (yapışkan mono tarih); risk/birim
  // sıralamasında gün başlığı yanıltır → düz liste.
  const gunlu = filter.filters.sortBy === "ts_desc" || filter.filters.sortBy === "ts_asc";
  const gruplar = useMemo(() => (gunlu ? gunleGrupla(filter.results, (r) => r.gonderim_tarihi) : [{ anahtar: "duz", rows: filter.results }]), [filter.results, gunlu]);

  if (outbox.length === 0) {
    return (
      <ViewWrap id="giden-h" title="Giden evrak" kunye="Giden evrak defteri" sub={yukleniyor ? "Defter açılıyor…" : "Onaylanıp gönderilen resmî yazılar"}>
        <SicilStil />
        <GidenBos yukleniyor={yukleniyor} hata={hata} onYenidenDene={onYenidenDene} onGoInbox={onGoInbox} />
      </ViewWrap>
    );
  }

  const ac = (item, el) => { triggerRef.current = el; setDetay(item); };
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "gönderi", kalici: "gönderilen yazılar silinmez" });
  let sira = 0;
  return (
    <ViewWrap id="giden-h" title="Giden evrak" kunye="Giden evrak defteri" sub={`${outbox.length} evrak · ${gonderildi} gönderildi`}
      actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]}>
      <SicilStil />
      <FilterBar config={config} filter={filter} />

      {filter.results.length === 0 ? (
        <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="E-G-2026/" damga="Eşleşme yok"
          baslik={bos.baslik} sub={bos.sub}
          actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <DefterYuzey sablon={SABLON} basliklar={BASLIKLAR} etiket="Giden evrak kayıtları" gezinme={gez} ipucu="detayı aç"
          rol="grid" dolgu={Math.max(0, 4 - filter.results.length)}>
          {gruplar.map((g) => (
            <React.Fragment key={g.anahtar}>
              {gunlu && <GrupBasligi etiket={g.etiket} ek={g.tarih} sayi={g.rows.length} birim="gönderi" />}
              {g.rows.map((item) => <GidenSatir key={item.id} item={item} sira={sira++} gez={gez} gunlu={gunlu} onAc={ac} />)}
            </React.Fragment>
          ))}
        </DefterYuzey>
      )}

      <DetayModal item={detay} onClose={closeDetay} />
    </ViewWrap>
  );
}
