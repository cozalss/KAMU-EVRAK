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
import NumberFlow from "@number-flow/react";
import { ViewWrap, Btn, EmptyState, KV, Icon, MONO, SANS, T, PAL, BANT, TYPE, TNUM, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing, odakDongusu } from "./neonUi.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
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
const fmtGunKisa = (ts) => { try { return new Date(ts).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }); } catch { return ""; } };
const fmtTam = (ts) => { try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } };
const fmtGuven = (g) => (typeof g === "number" && g > 0 ? `%${Math.round(g * 100)}` : "");
const fmtSure = (ms) => (Number.isFinite(ms) && ms >= 100 ? `${(ms / 1000).toFixed(1)} sn` : "");
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

/* ---------- Bento özet ---------- */

/* 14 günlük işlem etkinliği — tek seri, tek ton (bugün tam, geçmiş soluk — aynı tonun
   açıklık kademesi); çubuk başına title, bütüne aria-label (PanelView süre grafiği dili). */
function EtkinlikBars({ items }) {
  const gunler = useMemo(() => {
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const out = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(bugun.getTime() - (13 - i) * GUN_MS);
      return { d, n: 0 };
    });
    for (const x of items) {
      const t = new Date(x.ts); t.setHours(0, 0, 0, 0);
      const idx = 13 - Math.round((bugun - t) / GUN_MS);
      if (idx >= 0 && idx < 14) out[idx].n += 1;
    }
    return out;
  }, [items]);
  const max = Math.max(1, ...gunler.map((g) => g.n));
  const toplam14 = gunler.reduce((a, g) => a + g.n, 0);
  return (
    <div role="img" aria-label={`Son 14 günde ${toplam14} işlem — günlük etkinlik çubuğu`}
      style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, marginTop: SP.s }}>
      {gunler.map((g, i) => (
        <span key={i} title={`${g.d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} · ${g.n} işlem`}
          style={{ flex: 1, minWidth: 4, height: `${g.n ? Math.max(12, Math.round((g.n / max) * 100)) : 6}%`,
            background: T, opacity: g.n === 0 ? 0.12 : i === 13 ? 0.95 : 0.4,
            borderRadius: "2px 2px 0 0" }} />
      ))}
    </div>
  );
}

/* Karar durumu tanımları — bento segment barı + lejant satırları + defter çipleri
   TEK listeden beslenir. duzenlendi/onaylandi aynı yeşil ailesi: segmentte açıklık
   kademesiyle ayrışır (tek-ton kuralı), lejant sayacı zaten adlandırır. */
const KARARLAR = [
  { key: "bekliyor", label: "Karar bekliyor", renk: BANT.sari.c, doluluk: 0.85 },
  { key: "onaylandi", label: "Onaylandı", renk: BANT.yesil.c, doluluk: 0.9 },
  { key: "duzenlendi", label: "Düzenlenip gönderildi", renk: BANT.yesil.c, doluluk: 0.45 },
  { key: "reddedildi", label: "Reddedildi", renk: BANT.kirmizi.c, doluluk: 0.85 },
];

/* Bento: solda büyük "etkinlik" karosu (toplam + 14 gün çubukları + ort. süre), sağda
   TEK "karar dağılımı" karosu — segmentli yatay bar + tıklanabilir lejant satırları
   (yargıç bulgusu: 2×2 sıfır-kart grid'i jenerik admin-template'ti, kaldırıldı). */
function BentoSeridi({ items, filter, ortSn }) {
  const say = { bekliyor: 0, onaylandi: 0, duzenlendi: 0, reddedildi: 0, islendi: 0 };
  const bugunSay = { toplam: 0 };
  const bugun = new Date();
  for (const x of items) {
    say[x._durum] = (say[x._durum] || 0) + 1;
    const d = new Date(x.ts);
    if (!Number.isNaN(d.getTime()) && ayniGun(d, bugun)) bugunSay.toplam += 1;
  }
  const aktifSet = filter.filters.chips.durum || new Set();
  const temizle = () => aktifSet.forEach((v) => filter.toggleChip("durum", v));
  const kararliToplam = KARARLAR.reduce((a, k) => a + say[k.key], 0);
  const barOzet = KARARLAR.filter((k) => say[k.key] > 0)
    .map((k) => `${say[k.key]} ${k.label.toLocaleLowerCase("tr-TR")}`).join(", ");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 1.4fr) minmax(240px, 1fr)",
      gap: SP.s, marginBottom: SP.m, alignItems: "stretch" }}>
      <button type="button" onClick={temizle} aria-pressed={aktifSet.size === 0}
        aria-label={`Toplam işlem: ${items.length}${bugunSay.toplam ? `, bugün ${bugunSay.toplam}` : ""} — tüm kararları göster`}
        {...focusRing} data-press=""
        onMouseEnter={(e) => { if (aktifSet.size) e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = aktifSet.size === 0 ? ALFA(T) : PAL.surf; }}
        style={{ cursor: "pointer", textAlign: "left", padding: `${SP.m}px ${SP.l}px`,
          borderRadius: RAD.card, background: aktifSet.size === 0 ? ALFA(T) : PAL.surf,
          border: `1px solid ${aktifSet.size === 0 ? T : PAL.line}`, display: "flex", flexDirection: "column",
          transition: "background .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span style={{ ...TYPE.num, fontSize: 28, lineHeight: "34px", color: PAL.ink, ...TNUM }}>
            <NumberFlow value={items.length} />
          </span>
          {bugunSay.toplam > 0 && <span style={{ ...TYPE.meta, color: DERIN.T, ...TNUM }}>bugün +{bugunSay.toplam}</span>}
        </span>
        <span style={{ ...TYPE.meta, color: PAL.mut, marginTop: 2 }}>
          Toplam işlem{ortSn ? ` · ort. ${ortSn} sn` : ""}
        </span>
        <EtkinlikBars items={items} />
        <span style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3, marginTop: 2, ...TNUM }}>
          <span>14 gün önce</span><span>bugün</span>
        </span>
      </button>
      <div style={{ padding: `${SP.s}px ${SP.m}px`, borderRadius: RAD.card, background: PAL.surf,
        border: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ ...TYPE.meta, color: PAL.mut, marginBottom: 2 }}>Karar dağılımı</span>
        {kararliToplam > 0 && (
          <span role="img" aria-label={`Karar dağılımı: ${barOzet}`}
            style={{ display: "flex", gap: 2, height: 8, borderRadius: RAD.chip, overflow: "hidden" }}>
            {KARARLAR.filter((k) => say[k.key] > 0).map((k) => (
              <span key={k.key} title={`${k.label} · ${say[k.key]}`}
                style={{ flex: say[k.key], background: k.renk, opacity: k.doluluk, minWidth: 4 }} />
            ))}
          </span>
        )}
        <div role="group" aria-label="Karar durumu — satır listeyi filtreler" style={{ marginTop: 2 }}>
          {KARARLAR.map((k) => {
            const sifir = say[k.key] === 0;
            const aktif = aktifSet.has(k.key);
            return (
              <button key={k.key} type="button" onClick={() => filter.toggleChip("durum", k.key)}
                aria-pressed={aktif} aria-label={`${k.label}: ${say[k.key]} evrak${aktif ? " — filtre açık" : ""}`}
                {...focusRing} data-press=""
                onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = PAL.hov; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = aktif ? ALFA(k.renk) : "transparent"; }}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, width: "100%",
                  padding: "3px 8px", border: "none", borderRadius: RAD.ctl, textAlign: "left",
                  background: aktif ? ALFA(k.renk) : "transparent",
                  transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot,
                  background: k.renk, opacity: sifir ? 0.3 : k.doluluk, flexShrink: 0 }} />
                <span style={{ ...TYPE.data, color: sifir ? PAL.mut3 : aktif ? DERIN_OF(k.renk) : PAL.ink2, flex: 1 }}>{k.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: sifir ? PAL.mut3 : PAL.mut, ...TNUM }}>{say[k.key]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
const selectStil = { padding: "6px 10px", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink2, ...TYPE.data, cursor: "pointer" };

function Pill({ label, renk, aktif, onClick, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={aktif} aria-label={ariaLabel || label}
      {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = aktif ? ALFA(renk || T) : "transparent"; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
        borderRadius: RAD.chip, border: `1px solid ${aktif ? (renk || T) : PAL.line}`,
        background: aktif ? ALFA(renk || T) : "transparent",
        ...TYPE.data, fontWeight: 500, color: aktif ? DERIN_OF(renk || T) : PAL.mut,
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
    <div style={{ marginBottom: SP.m }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <input type="search" value={f.search} onChange={(e) => filter.setSearch(e.target.value)}
          placeholder="Evrak adı, konu…" aria-label="Arşivde ara"
          style={{ flex: "1 1 200px", maxWidth: 320, padding: "6px 12px", borderRadius: RAD.ctl,
            border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink, ...TYPE.data }} />
        <span role="group" aria-label="Risk filtresi" style={{ display: "inline-flex", gap: SP.xs }}>
          {RISK_PILL.map((r) => (
            <Pill key={r.value} label={r.label} renk={r.renk} aktif={riskSet.has(r.value)}
              ariaLabel={`${r.label} risk filtresi`} onClick={() => filter.toggleChip("risk", r.value)} />
          ))}
        </span>
        <select value={f.sortBy} onChange={(e) => filter.setSortBy(e.target.value)}
          aria-label="Sıralama" style={selectStil}>
          {SIRALAMA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <Pill label={`Filtreler${gelismisAktif ? ` · ${gelismisAktif}` : ""}`} aktif={acik || gelismisAktif > 0}
          ariaLabel={`Gelişmiş filtreler${gelismisAktif ? ` — ${gelismisAktif} aktif` : ""}`}
          onClick={() => setAcik((a) => !a)} />
        <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
          <strong style={{ color: DERIN.T, fontWeight: 600 }}>{filter.counts.filtered}</strong> / {filter.counts.total} kayıt
        </span>
      </div>
      {acik && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.s,
          padding: `${SP.s}px ${SP.m}px`, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
          <select value={f.select.tur} onChange={(e) => filter.setSelect("tur", e.target.value)}
            aria-label="Evrak türü" style={selectStil}>
            <option value="">Tüm türler</option>
            {turSecenek.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={f.select.birim} onChange={(e) => filter.setSelect("birim", e.target.value)}
            aria-label="Hedef birim" style={selectStil}>
            <option value="">Tüm birimler</option>
            {birimSecenek.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span role="group" aria-label="Hızlı tarih" style={{ display: "inline-flex", gap: SP.xs }}>
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

/* Defter kaydı — kart DEĞİL: hairline üst ayraç, sol mono zaman kolonu + dikey ray,
   tek satır içerik (başlık + inline meta, ellipsis), sağda durum/risk + hover'da Düzenle.
   div[role=button]: satır içinde ikincil eylem yaşayabilsin (button-içinde-button geçersiz). */
function DefterSatiri({ item, zamanBicimi, onAc, onDuzenle, ilk = false }) {
  const [uzerinde, setUzerinde] = useState(false);
  const riskC = BANT[item.bant]?.c;
  const guven = fmtGuven(item.result?.tur_confidence);
  const sure = fmtSure(item.result?.sure_ms);
  const sla = item.result?.sla_metadata?.durum;
  const kat = kategoriMeta(evrakKategori({ evrak_turu: item.evrak_turu, konu: item.konu }));
  const KIcon = Icon[kat.icon] || Icon.doc;
  const hizliDuzenle = item._durum === "bekliyor" && onDuzenle;
  const zaman = zamanBicimi === "saat" ? fmtSaat(item.ts) : fmtGunKisa(item.ts);
  return (
    <div role="button" tabIndex={0} onClick={(e) => onAc(item, e.currentTarget)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAc(item, e.currentTarget); } }}
      aria-label={`${item.konu || item.name} — ${DURUM_TR[item._durum]} — detayı aç`} {...focusRing} data-press=""
      onMouseEnter={(e) => { setUzerinde(true); e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { setUzerinde(false); e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "grid", alignItems: "center", gap: SP.m,
        // Durum/risk kolonları SABİT genişlik — auto kolonlar çip metnine göre kayıp
        // dikey hattı dalgalandırıyordu (yargıç bulgusu).
        gridTemplateColumns: "52px 26px minmax(0,1fr) 128px 64px 14px",
        padding: "8px 14px", borderTop: ilk ? "none" : `1px solid ${PAL.line}`, background: "transparent",
        transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
      {/* Zaman kolonu — defterin ray'ı: mono, sağa yaslı, dikey hairline ile ayrılır */}
      <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, textAlign: "right",
        paddingRight: SP.m, borderRight: `1px solid ${PAL.line}`, alignSelf: "stretch",
        display: "flex", alignItems: "center", justifyContent: "flex-end", ...TNUM }}>{zaman}</span>
      <span aria-hidden="true" title={kat.label}
        style={{ width: 26, height: 26, borderRadius: RAD.ctl, display: "grid", placeItems: "center",
          background: PAL.surfHi, color: DURUM_RENK[item._durum] ? DERIN_OF(DURUM_RENK[item._durum]) : PAL.mut2 }}>
        <KIcon width={14} height={14} />
      </span>
      <span style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: SP.s, overflow: "hidden", whiteSpace: "nowrap" }}>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {baslikCase(cleanDemoText(item.konu)) || item.name}
        </span>
        <span style={{ ...TYPE.meta, color: PAL.mut, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 4, minWidth: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>{item.name}</span>
          {" · "}{EVRAK_TR(item.evrak_turu)}{" · "}{BIRIM_GOSTER(item.hedef_birim, item.evrak_turu)}
          {guven && ` · güven ${guven}`}{sure && ` · ${sure}`}
          {item.varyantlar?.length > 1 && ` · ${item.varyantlar.length} yazı türü`}
        </span>
        {sla === "GECIKMIS" && <span style={{ ...TYPE.meta, color: DERIN.kirmizi, flexShrink: 0 }}>süresi geçmiş</span>}
        {sla === "KRITIK" && <span style={{ ...TYPE.meta, color: DERIN.sari, flexShrink: 0 }}>süre kritik</span>}
      </span>
      {hizliDuzenle && uzerinde ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onDuzenle(item); }}
          onFocus={() => setUzerinde(true)} onBlur={() => setUzerinde(false)}
          aria-label={`${item.konu || item.name} taslağını Taslaklar'da düzenle`} {...focusRing} data-press=""
          style={{ cursor: "pointer", justifySelf: "end", display: "inline-flex", alignItems: "center", gap: SP.xs,
            padding: "3px 9px", border: `1px solid ${PAL.line}`, background: PAL.surf, borderRadius: RAD.ctl,
            ...TYPE.meta, fontWeight: 500, color: DERIN.T,
            transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
          <Icon.edit width={12} height={12} /> Düzenle
        </button>
      ) : (
        <DurumCip durum={item._durum} />
      )}
      <span style={{ justifySelf: "end", display: "inline-flex", alignItems: "center", gap: 6,
        ...TYPE.meta, fontWeight: 500, color: riskC ? DERIN_OF(riskC) : PAL.mut3, ...TNUM }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: riskC || PAL.mut3, opacity: riskC ? 1 : 0.5 }} />
        {RISK_TR[item.bant] || "—"}
      </span>
      <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3 }}><Icon.arrow width={12} height={12} /></span>
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
      <div role="dialog" aria-modal="true" aria-labelledby="islenen-modal-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu} style={{ width: "min(720px,100%)", maxHeight: "88vh", overflowY: "auto", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.xl, boxShadow: SH.modal }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SP.l, marginBottom: SP.l }}>
          <div>
            <h2 id="islenen-modal-h" style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{cleanDemoText(item.konu) || item.name}</h2>
            <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{item.name}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Kapat" {...focusRing}
            style={{ cursor: "pointer", flexShrink: 0, width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.lineHi}`, background: PAL.hov, color: PAL.ink2, padding: 0 }}>
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
                  <Icon.book width={14} height={14} /> {m.baslik}
                </button>
              ) : (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 8px", ...TYPE.data, color: PAL.ink2 }}>
                  <Icon.book width={14} height={14} /> {m.baslik}
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

export default function IslenenEvrakView({ history = [], onGoInbox, onUpload, onDuzenle = () => {}, onMevzuatAc = null }) {
  const [detay, setDetay] = useState(null);
  const triggerRef = useRef(null);   // modal kapanınca odak tetikleyen satıra döner (a11y)
  const closeDetay = useCallback(() => { setDetay(null); triggerRef.current?.focus(); }, []);
  const acDetay = useCallback((item, el) => { triggerRef.current = el; setDetay(item); }, []);
  // Belge başına TEK sicil satırı (sicilGrupla): eski oturumların yinelenen satırlarında
  // denenen yazı türleri kaybolmaz, temsilcinin varyant listesine katılır → detay modalı
  // türleri seçenek çipleri olarak sunar.
  const items = useMemo(() => sicilGrupla(history).map((h) => ({
    ...h,
    _durum: durumOf(h.result),
    konu: h.result?.bilgi_unsurlari?.konu || h.result?.alt_talepler?.[0]?.ozet || "",
  })), [history]);
  const filter = useFilter(items, BASE_CONFIG);
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
  const ortSn = sureler.length ? (sureler.reduce((a, x) => a + x, 0) / sureler.length / 1000).toFixed(1) : null;

  if (history.length === 0) {
    return (
      <ViewWrap id="islenen-h" title="İşlenen evrak" sub="Bu oturumda ve önceki oturumlarda işlenen tüm evraklar">
        <EmptyState icon={<Icon.shield />} title="Henüz evrak işlenmedi"
          sub="Gelen evrak kuyruğundan bir evrak seçtiğinizde ya da yeni bir belge yüklediğinizde, işlenen her evrak karar durumuyla birlikte burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  // Başlıkta eylem YOK: "Yeni evrak yükle" sidebar'da kalıcı duruyor — burada tekrarı gürültüydü.
  return (
    <ViewWrap id="islenen-h" title="İşlenen evrak" sub="Evrak sicil defteri — işlenen her kayıt karar durumuyla">
      <BentoSeridi items={items} filter={filter} ortSn={ortSn} />
      <AracCubugu filter={filter} turSecenek={turSecenek} birimSecenek={birimSecenek} />

      {filter.results.length === 0 ? (
        <EmptyState icon={<Icon.shield />} title="Eşleşen kayıt yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.m }}>
          {gruplar.map((g, gi) => (
            <section key={g.etiket || `düz-${gi}`} aria-label={g.etiket || "Kayıtlar"}>
              {g.etiket && (
                // Sticky kova başlığı — kart DIŞINDA (overflow'lu yüzey sticky'yi kırar);
                // zemin PAL.bg: kayıtlar altından akarken okunur kalır.
                <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center",
                  gap: SP.s, padding: `${SP.s}px 2px`, background: PAL.bg }}>
                  <span style={{ ...TYPE.meta, fontWeight: 600, color: PAL.ink2 }}>{g.etiket}</span>
                  <span style={{ ...TYPE.meta, color: PAL.mut3, ...TNUM, padding: "1px 7px",
                    borderRadius: RAD.chip, background: PAL.hov }}>{g.rows.length}</span>
                </div>
              )}
              {/* Kovanın defter yüzeyi: TEK kart, satırlar hairline ile ayrılır (satır kartı YOK) */}
              <div style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card,
                overflow: "clip",
                animation: "nu-rise .3s var(--ke-ease-out) both", animationDelay: `${Math.min(gi, 4) * 45}ms` }}>
                {g.rows.map((item, ri) => (
                  <DefterSatiri key={item.id} item={item} ilk={ri === 0}
                    zamanBicimi={g.etiket === "Bugün" || g.etiket === "Dün" ? "saat" : "gun"}
                    onAc={acDetay} onDuzenle={onDuzenle} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <DetayModal item={detay} onClose={closeDetay} onDuzenle={onDuzenle} onMevzuatAc={onMevzuatAc} />
    </ViewWrap>
  );
}
