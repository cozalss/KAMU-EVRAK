/* IslenenEvrakView — işlenen TÜM evrakların arşivi: "EVRAK SİCİL DEFTERİ" kompozisyonu.
   Gelen Evrak'ın kart-satır + kalıcı filtre paneli şablonundan BİLİNÇLİ olarak ayrışır
   (kullanıcı bulgusu: iki ekran aynılaşmıştı). Üç katman (Stripe/Vercel/Attio araştırması):
   · Bento özet: 1 büyük karo (toplam + 14 günlük etkinlik çubuğu + ort. süre) + 4 küçük
     tıklanabilir durum karosu — karo = filtre (aria-pressed).
   · Kompakt araç çubuğu: tek satır arama + risk pilleri + sıralama + "Filtreler" disclosure
     (tür/birim/tarih varsayılan kapalı — dikey alan deftere kalır).
   · Sicil defteri: kova başına TEK yüzey; satırlar kart değil hairline-ayraçlı defter
     kaydı (sol mono zaman kolonu + dikey ray hissi), condensed ~44px, hover'da eylem.
   Kurgu ayrımı: İşlenen = arşiv/izleme, Taslaklar = çalışma kuyruğu, Giden = gönderilmiş. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewWrap, Btn, KV, Icon, MONO, SANS, T, PAL, BANT, TYPE, TNUM, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing, odakDongusu, SR_ONLY } from "./neonUi.jsx";
import { SicilStil, BaslikHucre, SessizCip, DefterYuzey, BosDefter, DefterIskelet, DefterHata, GrupBasligi, useDefterGezinme, Imlec, HUCRE } from "./SicilDefter.jsx";
import { SecimKutu, SecimCubugu } from "./IslenenSecim.jsx";
import { bosDurumMetni } from "../lib/sicilDefter.js";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { useDarEkran } from "../hooks/useMedya.js";
import IslenenOzet from "./IslenenOzet.jsx";
import { SecimKutusu } from "./FilterBar.jsx";
import { SlidersHorizontal } from "lucide-react";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { evrakKategori, kategoriMeta } from "../lib/kategori.js";
import { sicilGrupla } from "../lib/sicilVaryant.js";

/* Karar durumu tek sözlükten türetilir — Panel sayaçları ve DashboardApp
   draftsFromHistory ile AYNI süzgeç (taslak var + karar yok = bekliyor). */
const durumOf = (r) =>
  r?.onay_durumu === "onaylandi" ? "onaylandi"
    : r?.onay_durumu === "reddedildi" ? "reddedildi"
      : r?.onay_durumu === "duzenlendi" ? "duzenlendi"
        : r?.yazi_taslak_md ? "bekliyor" : "islendi";

const DURUM_TR = {
  bekliyor: "Karar bekliyor",
  onaylandi: "Onaylandı · gönderildi",
  reddedildi: "Reddedildi",
  duzenlendi: "Düzenlenerek gönderildi",
  islendi: "İşlendi · taslak üretilmedi",
};
const DURUM_KISA = {
  bekliyor: "Karar bekliyor", onaylandi: "Onaylandı", reddedildi: "Reddedildi",
  duzenlendi: "Düzenlendi", islendi: "Taslak yok",
};
const DURUM_RENK = {
  bekliyor: BANT.sari.c,
  onaylandi: BANT.yesil.c,
  reddedildi: BANT.kirmizi.c,
  duzenlendi: BANT.yesil.c,
  islendi: null,   // nötr — renk yoksa gri (renk tek sinyal değil, metin ayırt eder)
};
/* Risk bandı — renk adı yerine anlam etiketi (renk-körü dostu); yoksa em-dash (defter
   hizası bozulmasın — Geist tablo kuralı). */
const RISK_TR = { yesil: "Düşük", sari: "Orta", kirmizi: "Yüksek" };

const fmtSaat = (ts) => { try { return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
// gg.aa elle — ICU tr-TR {day, month} "01/10" (eğik çizgi) veriyor; defterin tarih dili noktalı.
const fmtGunKisa = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fmtTam = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
const fmtSure = (ms) => (Number.isFinite(ms) && ms >= 100 ? `${(ms / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn` : "");
// Konu verbatim veriden gelir; başlık zarafeti için ilk harf büyütülür (taslakOzeti deseni).
const baslikCase = (s) => (s ? s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1) : s);

/* Zaman kovası — gün-gün uzayan başlıklar yerine insan-dostu kovalar; fonksiyon zamana
   göre monoton → sıralı listede gruplar bitişik kalır. */
const ayniGun = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const GUN_MS = 86_400_000;
function gunEtiketi(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Tarihsiz";
  const bugun = new Date();
  if (ayniGun(d, bugun)) return "Bugün";
  const dun = new Date(bugun); dun.setDate(bugun.getDate() - 1);
  if (ayniGun(d, dun)) return "Dün";
  const gunBasi = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate());
  const fark = Math.floor((gunBasi - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / GUN_MS);
  if (fark < 7) return "Bu hafta";
  if (fark < 14) return "Geçen hafta";
  return d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

/* Filtre çekirdeği (useFilter) başsız kullanılır — UI'ı bu görünümün kendi kompakt araç
   çubuğu çizer (FilterBar paneli Gelen Evrak'ın dili; burada bilinçli olarak YOK). */
const BASE_CONFIG = {
  search: { enabled: true, fuzzy: true },
  chips: [
    { id: "risk", options: [] },
    { id: "durum", options: [] },
  ],
  select: [{ id: "tur" }, { id: "birim" }],
  sort: { default: "ts_desc" },
  dataMapping: { search: ["name", "konu"], risk: "bant", durum: "_durum", tur: "evrak_turu", birim: "hedef_birim", dateField: "ts" },
};

/* ---------- Kompakt araç çubuğu ---------- */

const RISK_PILL = [
  { value: "yesil", label: "Düşük", renk: BANT.yesil.c },
  { value: "sari", label: "Orta", renk: BANT.sari.c },
  { value: "kirmizi", label: "Yüksek", renk: BANT.kirmizi.c },
];
const SIRALAMA = [
  { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" },
  { value: "risk_desc", label: "Risk (yüksek–düşük)" }, { value: "name_asc", label: "Ad (A–Z)" },
];
const kunyeEtiket = { ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap", marginRight: SP.xs };

function Pill({ label, renk, aktif, onClick, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={aktif} aria-label={ariaLabel || label}
      {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = aktif ? ALFA(renk || T) : "transparent"; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
        borderRadius: RAD.chip + 1, border: `1px solid ${aktif ? PAL.lineHi : "transparent"}`,
        background: aktif ? ALFA(renk || T) : "transparent",
        ...TYPE.data, fontWeight: 500, color: aktif ? DERIN_OF(renk || T) : PAL.mut2,
        transition: "background .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
      {renk && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: renk }} />}
      {label}
    </button>
  );
}

/* Tek satır: arama · risk pilleri · sıralama · "Filtreler" disclosure (tür/birim/tarih).
   Gelişmiş ölçütler varsayılan KAPALI — dikey alan sicil defterine kalır (Stripe/Linear
   toolbar deseni; eski kalıcı panel Gelen Evrak'ın diliydi). */
function AracCubugu({ filter, turSecenek, birimSecenek }) {
  const [acik, setAcik] = useState(false);
  const f = filter.filters;
  const gelismisAktif = (f.select.tur ? 1 : 0) + (f.select.birim ? 1 : 0) + (f.dateFrom != null || f.dateTo != null ? 1 : 0);
  const riskSet = f.chips.risk || new Set();
  const gunSonu = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
  const oncekiGun = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - n * GUN_MS; };
  return (
    <div style={{ marginBottom: SP.l }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <span style={{ position: "relative", flex: "1 1 220px", maxWidth: 360, minWidth: "min(200px, 100%)", display: "flex" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center", color: PAL.mut3, pointerEvents: "none" }}><Icon.search /></span>
          <input type="search" value={f.search} onChange={(e) => filter.setSearch(e.target.value)}
            placeholder="Evrak adı, konu…" aria-label="Arşivde ara" {...focusRing}
            style={{ width: "100%", height: 36, boxSizing: "border-box", padding: "0 12px 0 36px", borderRadius: RAD.ctl, outline: "none",
              border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.ink, ...TYPE.ui }} />
        </span>
        <span role="group" aria-label="Risk filtresi" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <span aria-hidden="true" style={kunyeEtiket}>Risk</span>
          {RISK_PILL.map((r) => (
            <Pill key={r.value} label={r.label} renk={r.renk} aktif={riskSet.has(r.value)}
              ariaLabel={`${r.label} risk filtresi`} onClick={() => filter.toggleChip("risk", r.value)} />
          ))}
        </span>
        {/* Native select kabuğu FilterBar ile ortak (SecimKutusu): tarayıcı oku yerine ince
            chevron + "SIRA" künye öneki — Gelen/Giden/Denetim ile aynı kontrol dili. */}
        <SecimKutusu id="isl-sort" label="Sıralama" onek="Sıra" value={f.sortBy} minW={190}
          onChange={(e) => filter.setSortBy(e.target.value)} options={SIRALAMA} />
        <button type="button" onClick={() => setAcik((a) => !a)} aria-expanded={acik} aria-controls="isl-gelismis"
          aria-label={`Gelişmiş filtreler${gelismisAktif ? ` — ${gelismisAktif} aktif` : ""}`}
          {...focusRing} data-press=""
          onMouseEnter={(e) => { if (!acik) e.currentTarget.style.background = PAL.hov; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = acik ? PAL.surf2 : PAL.surf; }}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, height: 36, padding: "0 12px",
            borderRadius: RAD.ctl, border: `1px solid ${acik || gelismisAktif ? PAL.lineHi : PAL.inputLine}`,
            background: acik ? PAL.surf2 : PAL.surf, color: PAL.ink2, ...TYPE.ui, fontWeight: 500,
            transition: "background .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
          <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
          Filtreler
          {gelismisAktif > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, display: "inline-grid", placeItems: "center", background: T, color: PAL.onAccent, fontFamily: MONO, fontSize: 11, fontWeight: 600, ...TNUM }}>{gelismisAktif}</span>}
        </button>
        <span role="status" aria-live="polite" style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>
          <strong style={{ color: PAL.ink, fontWeight: 600, fontSize: 13 }}>{filter.counts.filtered}</strong> / {filter.counts.total} kayıt
        </span>
      </div>
      {acik && (
        <div id="isl-gelismis" style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.s,
          padding: `${SP.s}px ${SP.m}px`, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, background: PAL.surf2,
          animation: "nu-rise .18s var(--ke-ease-out) both" }}>
          <SecimKutusu id="isl-tur" label="Evrak türü" value={f.select.tur || ""} onChange={(e) => filter.setSelect("tur", e.target.value)}
            options={[{ value: "", label: "Tüm türler" }, ...turSecenek]} />
          <SecimKutusu id="isl-birim" label="Hedef birim" value={f.select.birim || ""} minW={220} onChange={(e) => filter.setSelect("birim", e.target.value)}
            options={[{ value: "", label: "Tüm birimler" }, ...birimSecenek]} />
          <span role="group" aria-label="Hızlı tarih" style={{ display: "inline-flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <span aria-hidden="true" style={kunyeEtiket}>Tarih</span>
            <Pill label="Bugün" aktif={f.dateFrom === oncekiGun(0)} onClick={() => filter.setDateRange(oncekiGun(0), gunSonu())} />
            <Pill label="Son 7 gün" aktif={f.dateFrom === oncekiGun(7)} onClick={() => filter.setDateRange(oncekiGun(7), gunSonu())} />
            <Pill label="Son 30 gün" aktif={f.dateFrom === oncekiGun(30)} onClick={() => filter.setDateRange(oncekiGun(30), gunSonu())} />
          </span>
          {(filter.hasActiveFilters) && (
            <button type="button" onClick={filter.clearAll} {...focusRing} data-press=""
              style={{ cursor: "pointer", marginLeft: "auto", padding: "5px 10px", border: "none",
                background: "transparent", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: DERIN.T }}>
              Filtreleri temizle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Sicil defteri ---------- */

/* Varsayılan kütle durumu (bekliyor) SESSİZ metin — 17/17 satırda aynı sarı çip saf
   görsel gürültüydü (yargıç bulgusu); yalnız KARAR VERİLMİŞ istisnalar tint çip taşır. */
function DurumCip({ durum }) {
  const renk = DURUM_RENK[durum];
  const sessiz = durum === "bekliyor" || durum === "islendi";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifySelf: "end",
      ...TYPE.meta, fontWeight: 500,
      ...(sessiz
        ? { color: PAL.mut2, padding: "2px 0" }
        : { padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(renk), color: DERIN_OF(renk) }) }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot,
        background: renk || PAL.mut3, opacity: sessiz && renk ? 0.7 : 1 }} />
      {DURUM_KISA[durum]}
    </span>
  );
}

/* Defter şablonu — zaman · konu bloğu · karar durumu · risk · ok. Telefonda: üst satır
   zaman + durum, orta satır konu, alt satır risk + ok (bilgi gizlenmez, yeniden dizilir). */
const SABLON = {
  kolon: "16px 56px minmax(0,1fr) 150px 76px 16px",
  alan: '"sec zaman ana durum risk ok"',
  kolonDar: "24px minmax(0,1fr) auto",
  alanDar: '"sec zaman durum" "sec ana ana" "sec risk ok"',
  marj: "134px",
  adim: "64px",
};
/* Başlık: ilk hücre "tümünü seç" kutusu (filtrelenmiş görünür kayıtlar) — dinamik olduğu
   için bileşende kurulur; boş/iskelet defter seçimsiz başlığı kullanır. */
const BASLIK_GOVDE = [
  <BaslikHucre key="z" alan="zaman">Saat</BaslikHucre>,
  <BaslikHucre key="a" alan="ana">Konu · kaynak · tür · birim</BaslikHucre>,
  <BaslikHucre key="d" alan="durum">Karar</BaslikHucre>,
  <BaslikHucre key="r" alan="risk">Risk</BaslikHucre>,
];
const BASLIKLAR = [<BaslikHucre key="s" alan="sec"><span style={SR_ONLY}>Seçim</span></BaslikHucre>, ...BASLIK_GOVDE];

/* Sicil dökümü sütunları (CSV) — risk SKORU yok, yalnız bant kodu (CLAUDE.md §7). */
const DOKUM_SUTUN = [
  { baslik: "İşlem tarihi", deger: (r) => fmtTam(r.ts) },
  { baslik: "Dosya", deger: (r) => r.name },
  { baslik: "Konu", deger: (r) => cleanDemoText(r.konu) },
  { baslik: "Evrak türü", deger: (r) => EVRAK_TR(r.evrak_turu) },
  { baslik: "Hedef birim", deger: (r) => BIRIM_GOSTER(r.hedef_birim, r.evrak_turu) },
  { baslik: "Karar durumu", deger: (r) => DURUM_TR[r._durum] },
  { baslik: "Risk bandı", deger: (r) => BANT[r.bant]?.l || "" },
  { baslik: "Sınıflandırma güveni", deger: (r) => fmtGuven(r.result?.tur_confidence) },
];

/* Defter kaydı — ortak defter satırı ([data-sicil-satir]: hairline ayraç, solda mürekkep
   cetveli, kayan seçim imleci). div[role=button]: satır içinde ikincil eylem yaşayabilsin
   (button-içinde-button geçersiz). Durum/risk sütunları SABİT genişlik — dikey hat dalgalanmaz. */
function DefterSatiri({ item, sira, zamanBicimi, onAc, onDuzenle, gez, secili, onSec }) {
  const [uzerinde, setUzerinde] = useState(false);
  // Telefonda hover yok: hızlı "Düzenle" kalıcı görünür (a11y denetimi 2026-08-12).
  const dar = useDarEkran();
  const riskC = BANT[item.bant]?.c;
  const guven = fmtGuven(item.result?.tur_confidence);
  const sure = fmtSure(item.result?.sure_ms);
  const sla = item.result?.sla_metadata?.durum;
  const kat = kategoriMeta(evrakKategori({ evrak_turu: item.evrak_turu, konu: item.konu }));
  const KIcon = Icon[kat.icon] || Icon.doc;
  const hizliDuzenle = item._durum === "bekliyor" && onDuzenle;
  const zaman = zamanBicimi === "saat" ? fmtSaat(item.ts) : fmtGunKisa(item.ts);
  return (
    /* Satır = grid row (odaklanabilir; Enter detayı açar, Space seçer — APG ızgara deseni). */
    <div role="row" tabIndex={0} aria-selected={secili} data-sicil-satir="" data-sd-anahtar={item.id} onClick={(e) => onAc(item, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") { e.preventDefault(); onAc(item, e.currentTarget); }
        else if (e.key === " ") { e.preventDefault(); onSec(item.id); }
      }}
      aria-label={`${item.konu || item.name} — ${DURUM_TR[item._durum]}${secili ? " — seçili" : ""}`}
      onPointerDown={() => gez.sec(item.id)}
      onMouseEnter={() => setUzerinde(true)} onMouseLeave={() => setUzerinde(false)}
      /* Klavye eşdeğerliği (WCAG 2.1.1): hızlı "Düzenle" odak satıra gelince de açılır. */
      onFocus={() => setUzerinde(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setUzerinde(false); }}
      style={{ "--sd-i": Math.min(sira, 14) }}>
      {gez.aktif === item.id && <Imlec gezinme={gez} kimlik="islenen" />}
      <span {...HUCRE.grid} style={{ gridArea: "sec", display: "flex" }}>
        <SecimKutu secili={secili} onDegis={() => onSec(item.id)} etiket={`Seç: ${item.konu || item.name}`} />
      </span>
      <span {...HUCRE.grid} data-sd-no-sira="" style={{ gridArea: "zaman", fontFamily: MONO, fontSize: 13, fontWeight: 500, color: PAL.ink2, ...TNUM }}>{zaman}</span>
      <span {...HUCRE.grid} style={{ gridArea: "ana", minWidth: 0 }}>
        <span data-sd-konu-satir="" style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
          <span aria-hidden="true" title={kat.label} style={{ display: "flex", flexShrink: 0, color: DURUM_RENK[item._durum] ? DERIN_OF(DURUM_RENK[item._durum]) : PAL.mut3 }}><KIcon width={14} height={14} /></span>
          <span data-sd-konu="" title={baslikCase(cleanDemoText(item.konu)) || item.name} style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {baslikCase(cleanDemoText(item.konu)) || item.name}
          </span>
          {sla === "GECIKMIS" && <SessizCip renk={BANT.kirmizi.c} vurgulu metin="süresi geçmiş" ikon={<Icon.alert width={11} height={11} />} />}
          {sla === "KRITIK" && <SessizCip renk={BANT.sari.c} metin="süre kritik" />}
        </span>
        <span style={{ display: "block", ...TYPE.meta, color: PAL.mut, marginTop: 3, paddingLeft: 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 11 }}>{item.name}</span>
          {" · "}{EVRAK_TR(item.evrak_turu)}{" · "}<span style={{ color: PAL.mut2 }}>{BIRIM_GOSTER(item.hedef_birim, item.evrak_turu)}</span>
          {guven && ` · güven ${guven}`}{sure && ` · ${sure}`}
          {item.varyantlar?.length > 1 && ` · ${item.varyantlar.length} yazı türü`}
        </span>
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "durum", minWidth: 0 }}>
        {hizliDuzenle && (uzerinde || dar) ? (
          <button type="button" data-sd-eylem="" onClick={(e) => { e.stopPropagation(); onDuzenle(item); }}
            onFocus={() => setUzerinde(true)} onBlur={() => setUzerinde(false)}
            aria-label={`${item.konu || item.name} taslağını Taslaklar'da düzenle`} data-press=""
            style={{ justifySelf: "start", minHeight: 28, padding: "3px 10px", borderColor: PAL.lineHi, background: PAL.surf }}>
            <Icon.edit width={12} height={12} /> Düzenle
          </button>
        ) : (
          <DurumCip durum={item._durum} />
        )}
      </span>
      <span {...HUCRE.grid} style={{ gridArea: "risk", display: "inline-flex", alignItems: "center", gap: 6,
        ...TYPE.meta, fontWeight: 500, color: riskC ? DERIN_OF(riskC) : PAL.mut3, ...TNUM }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: riskC || PAL.mut3, opacity: riskC ? 1 : 0.5 }} />
        {RISK_TR[item.bant] || "—"}
      </span>
      <span aria-hidden="true" style={{ gridArea: "ok", display: "flex", color: PAL.mut3 }}><Icon.arrow width={12} height={12} /></span>
    </div>
  );
}

/* ---------- Detay modalı ---------- */
function DetayModal({ item, onClose, onDuzenle, onMevzuatAc }) {
  const closeRef = useRef(null);
  // Koşumda denenen yazı türleri seçenek çipleri olarak sunulur; null = satırın son
  // aktif türü (result.yazi_turu). Yeni kayıt açılınca seçim sıfırlanır.
  const [seciliTur, setSeciliTur] = useState(null);
  useEffect(() => {
    setSeciliTur(null);
    // Escape dinleyicisi YALNIZ modal açıkken (bug avı bulgusu): kapalıyken de bağlı
    // kalınca arama kutusundaki Esc, odağı listedeki eski satıra çalıyordu.
    if (!item) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, item]);
  if (!item) return null;
  const r = item.result || {};
  const ozet = cleanDemoText(r.ozet || "").replace(/\*\*/g, "");
  const mevzuat = (r.mevzuat_onerileri || []).slice(0, 3);
  const sure = fmtSure(r.sure_ms);
  const varyantlar = item.varyantlar || [];
  const aktif = varyantlar.find((v) => v.yazi_turu === (seciliTur || r.yazi_turu)) || varyantlar[0] || null;
  const aktifTur = aktif?.yazi_turu ?? r.yazi_turu;
  const aktifMd = aktif?.yazi_taslak_md ?? r.yazi_taslak_md;
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl }}>
      <div role="dialog" aria-modal="true" aria-labelledby="islenen-modal-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} style={{ width: "min(720px,100%)", maxHeight: "88vh", overflowY: "auto", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.xl, boxShadow: SH.modal }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SP.l, marginBottom: SP.l }}>
          <div>
            <h2 id="islenen-modal-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{cleanDemoText(item.konu) || item.name}</h2>
            <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{item.name}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Kapat" {...focusRing} data-press=""
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
            style={{ cursor: "pointer", flexShrink: 0, width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: PAL.ink2, padding: 0, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
            <Icon.x />
          </button>
        </div>
        <div style={{ marginBottom: SP.l }}>
          <KV k="Evrak türü" v={EVRAK_TR(item.evrak_turu)} />
          {aktifTur && <KV k="Üretilen yazı türü" v={YAZI_TR(aktifTur)} />}
          <KV k="Hedef birim" v={BIRIM_GOSTER(item.hedef_birim, item.evrak_turu)} c={DERIN.V} />
          <KV k="Sınıflandırma güveni" v={fmtGuven(r.tur_confidence) || "—"} c={r.tur_confidence >= 0.5 ? DERIN.T : PAL.mut2} />
          <KV k="Risk bandı" v={BANT[item.bant]?.l || "—"} c={DERIN_OF(BANT[item.bant]?.c)} />
          <KV k="Karar durumu" v={DURUM_TR[item._durum]} c={DURUM_RENK[item._durum] ? DERIN_OF(DURUM_RENK[item._durum]) : PAL.mut2} />
          {r.sla_metadata?.durum && <KV k="Yasal süre" v={r.sla_metadata.durum === "GECIKMIS" ? "Gecikmiş" : r.sla_metadata.durum === "KRITIK" ? "Kritik" : "Normal takvim"} c={r.sla_metadata.durum === "GECIKMIS" ? DERIN.kirmizi : r.sla_metadata.durum === "KRITIK" ? DERIN.sari : DERIN.yesil} />}
          {sure && <KV k="İşlem süresi" v={sure} c={DERIN.T} />}
          <KV k="İşlem tarihi" v={fmtTam(item.ts)} />
          {r.islem_id && <KV k="İşlem kimliği" v={String(r.islem_id).slice(0, 22)} />}
          {r.denetim_izi?.son_hash && <KV k="Denetim hash" v={String(r.denetim_izi.son_hash).slice(0, 22) + "…"} c={DERIN.yesil} />}
        </div>
        {ozet && (
          <p style={{ margin: `0 0 ${SP.l}px`, ...TYPE.data, color: PAL.ink2, background: ALFA(PAL.mut3), borderRadius: RAD.card, padding: SP.l }}>{ozet}</p>
        )}
        {mevzuat.length > 0 && (
          <div style={{ marginBottom: SP.l }}>
            <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.meta, color: PAL.mut2 }}>Mevzuat dayanakları — tıklayınca madde metni açılır</p>
            {mevzuat.map((m, i) => (
              m.kaynak_dosya && onMevzuatAc ? (
                <button key={i} type="button" {...focusRing} data-press=""
                  onClick={() => onMevzuatAc({ dosya: m.kaynak_dosya, maddeNo: m.madde_no, maddeTur: m.madde_tur })}
                  onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, width: "100%", textAlign: "left", padding: "6px 8px", background: "transparent", border: "none", borderRadius: RAD.ctl, ...TYPE.data, color: DERIN.T, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                  <Icon.book width={14} height={14} /> {m.gosterim_adi || m.baslik}
                </button>
              ) : (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 8px", ...TYPE.data, color: PAL.ink2 }}>
                  <Icon.book width={14} height={14} /> {m.gosterim_adi || m.baslik}
                </span>
              )
            ))}
          </div>
        )}
        {varyantlar.length > 1 && (
          <div style={{ marginBottom: SP.s }}>
            <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.meta, color: PAL.mut2 }}>Bu evrak için işlenen yazı türleri</p>
            <div role="group" aria-label="İşlenen yazı türleri" style={{ display: "flex", gap: SP.xs, flexWrap: "wrap" }}>
              {varyantlar.map((v) => (
                <Pill key={v.yazi_turu} label={YAZI_TR(v.yazi_turu)} aktif={v.yazi_turu === aktifTur}
                  ariaLabel={`${YAZI_TR(v.yazi_turu)} taslağını göster`}
                  onClick={() => setSeciliTur(v.yazi_turu)} />
              ))}
            </div>
          </div>
        )}
        {aktifMd && (
          <pre style={{ margin: 0, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cleanDemoText(aktifMd)}</pre>
        )}
        {item._durum === "bekliyor" && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: SP.l }}>
            <Btn primary onClick={() => { onClose(); onDuzenle(item); }} ariaLabel={`${item.name} taslağını Taslaklar'da düzenle`}>
              <Icon.edit /> Taslaklar'da düzenle
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* Toplu seçim durumu — anahtar kümesi (değişmez güncelleme), görünür kayıtlarla kesişim
   (filtre değişince gizlenen kayıt seçimde "hayalet" kalmaz), Esc ile bırakma. */
function useTopluSecim(gorunur) {
  const [secim, setSecim] = useState(() => new Set());
  const gorunurIdler = useMemo(() => new Set(gorunur.map((x) => x.id)), [gorunur]);
  const etkin = useMemo(() => new Set([...secim].filter((id) => gorunurIdler.has(id))), [secim, gorunurIdler]);
  const degistir = useCallback((id) => setSecim((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; }), []);
  const birak = useCallback(() => setSecim(new Set()), []);
  const hepsi = gorunur.length > 0 && etkin.size === gorunur.length;
  const tumunu = useCallback(() => setSecim(hepsi ? new Set() : new Set(gorunurIdler)), [hepsi, gorunurIdler]);
  useEffect(() => {
    if (!etkin.size) return undefined;
    const tus = (e) => { if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]')) birak(); };
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, [etkin.size, birak]);
  return { etkin, degistir, birak, hepsi, tumunu, kayitlar: gorunur.filter((x) => etkin.has(x.id)) };
}

/* yukleniyor / hata: DB işlem geçmişi sorgusunun durumu (DashboardApp islemlerQ). Verilmezse
   eski davranış — boş geçmiş "defter henüz açılmadı" olarak okunur. */
export default function IslenenEvrakView({ history = [], onGoInbox, onUpload, onDuzenle = () => {}, onMevzuatAc = null, yukleniyor = false, hata = null, onYenidenDene }) {
  const [detay, setDetay] = useState(null);
  const triggerRef = useRef(null);   // modal kapanınca odak tetikleyen satıra döner (a11y)
  const closeDetay = useCallback(() => { setDetay(null); triggerRef.current?.focus(); }, []);
  const acDetay = useCallback((item, el) => { triggerRef.current = el; setDetay(item); }, []);
  // Belge başına TEK sicil satırı (sicilGrupla): eski oturumların yinelenen satırlarında
  // denenen yazı türleri kaybolmaz, temsilcinin varyant listesine katılır → detay modalı
  // türleri seçenek çipleri olarak sunar.
  const items = useMemo(() => sicilGrupla(history).map((h) => ({
    ...h,
    // Serbest-metin yönlendirmede birim kodu yok → DB'nin taşıdığı etkin birim ADI ("—" yerine).
    hedef_birim: h.hedef_birim || h.hedef_birim_adi || "",
    _durum: durumOf(h.result),
    konu: h.result?.bilgi_unsurlari?.konu || h.result?.alt_talepler?.[0]?.ozet || "",
  })), [history]);
  const filter = useFilter(items, BASE_CONFIG);
  const secim = useTopluSecim(filter.results);
  const gez = useDefterGezinme({ secimTusu: secim.degistir });   // j/k gezinme + kayan imleç + x seçimi
  const turSecenek = useMemo(() => deriveOptions(items, "evrak_turu", EVRAK_TR), [items]);
  const birimSecenek = useMemo(() => deriveOptions(items, "hedef_birim", BIRIM_LBL), [items]);

  // Kova gruplaması yalnız TARİH sıralamasında (risk/ad sıralamasında kova başlığı yanıltır).
  const tarihSirali = filter.filters.sortBy === "ts_desc" || filter.filters.sortBy === "ts_asc";
  const gruplar = useMemo(() => {
    if (!tarihSirali) return [{ etiket: null, rows: filter.results }];
    const out = [];
    for (const row of filter.results) {
      const etiket = gunEtiketi(row.ts);
      if (!out.length || out[out.length - 1].etiket !== etiket) out.push({ etiket, rows: [] });
      out[out.length - 1].rows.push(row);
    }
    return out;
  }, [filter.results, tarihSirali]);

  // Ortalama işlem süresi — büyük karoda dürüst telemetri (veri yoksa yazılmaz).
  const sureler = items.map((x) => x.result?.sure_ms).filter((x) => Number.isFinite(x) && x > 0);
  const ortSn = sureler.length ? sureler.reduce((a, x) => a + x, 0) / sureler.length / 1000 : null;

  if (history.length === 0) {
    return (
      <ViewWrap id="islenen-h" title="İşlenen evrak" kunye="Evrak sicil defteri" sub={yukleniyor ? "Defter açılıyor…" : "Bu oturumda ve önceki oturumlarda işlenen tüm evraklar"}>
        <SicilStil />
        {yukleniyor ? <DefterIskelet sablon={SABLON} basliklar={BASLIKLAR} etiket="Sicil kayıtları yükleniyor" />
          : hata ? <DefterHata sablon={SABLON} basliklar={BASLIKLAR} baslik="Sicil defteri alınamadı" ayrinti={String(hata?.message || hata)} onYenidenDene={onYenidenDene} />
            : <BosDefter sablon={SABLON} basliklar={BASLIKLAR} onek="" satir={7} baslik="Sicil defteri henüz açılmadı"
              sub="Gelen evrak kuyruğundan bir evrak seçtiğinizde ya da yeni bir belge yüklediğinizde, işlenen her evrak karar durumuyla birlikte buraya kaydedilir."
              actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />}
      </ViewWrap>
    );
  }

  // Görünümün hükmü: memur kararı bekleyen kayıt sayısı (tek damga).
  const bekleyen = items.filter((x) => x._durum === "bekliyor").length;
  const bos = bosDurumMetni({ ara: filter.filters.search, filtreVar: filter.hasActiveFilters, nesne: "kayıt", kalici: "sicil kayıtları silinmez" });
  const basliklarSecimli = [
    <BaslikHucre key="s" alan="sec">
      <SecimKutu secili={secim.hepsi} karisik={secim.etkin.size > 0} onDegis={secim.tumunu}
        etiket={secim.hepsi ? "Tüm seçimi kaldır" : `Görünen ${filter.results.length} kaydın tümünü seç`} />
    </BaslikHucre>, ...BASLIK_GOVDE];

  // Başlıkta eylem YOK: "Yeni evrak yükle" sidebar'da kalıcı duruyor — burada tekrarı gürültüydü.
  return (
    <ViewWrap id="islenen-h" title="İşlenen evrak" kunye="Evrak sicil defteri" sub="İşlenen her kayıt, karar durumu ve risk bandıyla"
      damga={bekleyen ? { metin: `${bekleyen} karar bekliyor`, ton: BANT.sari.c, egim: -4 } : undefined}>
      <SicilStil />
      <IslenenOzet items={items} filter={filter} ortSn={ortSn} />
      <AracCubugu filter={filter} turSecenek={turSecenek} birimSecenek={birimSecenek} />

      {filter.results.length === 0 ? (
        <BosDefter sablon={SABLON} basliklar={BASLIKLAR} damga="Eşleşme yok" onek=""
          baslik={bos.baslik} sub={bos.sub}
          actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <>
        <SecimCubugu seciliKayitlar={secim.kayitlar} sutunlar={DOKUM_SUTUN} onBirak={secim.birak} />
        <DefterYuzey sablon={SABLON} basliklar={basliklarSecimli} etiket="İşlenen evrak kayıtları" gezinme={gez} ipucu="detayı aç"
          rol="grid" secimli dolgu={Math.max(0, 4 - filter.results.length)}>
          {(() => {
            let sira = 0;
            return gruplar.map((g, gi) => (
              <React.Fragment key={g.etiket || `düz-${gi}`}>
                {/* Kova başlığı — yapışkan bant (overflow:clip kaydırma kabı kurmaz, sticky çalışır). */}
                {g.etiket && <GrupBasligi etiket={g.etiket} sayi={g.rows.length} />}
                {g.rows.map((item) => (
                  <DefterSatiri key={item.id} item={item} sira={sira++} gez={gez} secili={secim.etkin.has(item.id)} onSec={secim.degistir}
                    zamanBicimi={g.etiket === "Bugün" || g.etiket === "Dün" ? "saat" : "gun"}
                    onAc={acDetay} onDuzenle={onDuzenle} />
                ))}
              </React.Fragment>
            ));
          })()}
        </DefterYuzey>
        </>
      )}

      <DetayModal item={detay} onClose={closeDetay} onDuzenle={onDuzenle} onMevzuatAc={onMevzuatAc} />
    </ViewWrap>
  );
}
