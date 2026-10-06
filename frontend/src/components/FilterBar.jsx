/* FilterBar — üç evrak defterinin (ve Denetim/Taslaklar'ın) TEK filtre dilbilgisi.
   config'te tanımlı kontroller render edilir; filter = useFilter(...) (ya da aynı şekilli
   useDefterArama) çıktısı.

   İki kip, tek kontrol modeli (jüri tur 6: "üç defterde üç ayrı filtre arayüzü"):
   · kip="acik" (varsayılan): 1) arama · seçimler · sıralama  2) çip grupları · tarih · sayaç
   · kip="kompakt": TEK satır — arama · `satirIci` çip grupları · sıralama · "Filtreler"
     açılır düğmesi · sayaç. Seçimler, kalan çipler ve tarih açılır panelde (aşamalı açılım:
     kontrol yüzeyi veriden ağır olmasın — 1 kayıtlık Giden'de 11 kontrol vardı).
   Telefonda (≤640) iki kip de aynı: arama + "Filtreler" + sayaç; panelde her seçim TAM
   genişlikte (kesik "Tüm kateg…" etiketleri yok). Etkin filtre şeridi altta. */
import React, { useState } from "react";
import { useDarEkran } from "../hooks/useMedya.js";
import { ChevronDown, SlidersHorizontal, CalendarDays } from "lucide-react";
import { T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, MONO, RAD, SP, EASE, Icon, focusRing, SR_ONLY } from "./neonUi.jsx";

const KONTROL_Y = 36;
const inputBase = { background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, color: PAL.ink, ...TYPE.ui, padding: "0 12px", height: KONTROL_Y, outline: "none", boxSizing: "border-box" };
const kunyeEtiket = { ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" };

/* Yerel kontrol cilası — tarayıcının arama "x"i (kendi temizle düğmemiz var) ve takvim glifi
   (markaya yabancı) gizlenir; takvim seçici tüm kutuya yayılır, ikon lucide'den gelir. Hover
   JS yerine CSS (press tutarlılığı). */
const FLT_CSS = `
[data-flt-ara]::-webkit-search-cancel-button,[data-flt-ara]::-webkit-search-decoration{-webkit-appearance:none;appearance:none}
[data-flt-tarih]{position:relative}
[data-flt-tarih] input::-webkit-calendar-picker-indicator{position:absolute;inset:0;width:auto;height:auto;opacity:0;cursor:pointer}
[data-flt-cip]:hover:not([aria-pressed="true"]),[data-flt-dugme]:hover:not([aria-expanded="true"]){background:var(--ke-hov)!important}
`;

// epoch ↔ <input type=date> (YYYY-MM-DD, yerel)
const toDateInput = (ms) => { if (ms == null) return ""; const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fromDateInput = (v, endOfDay) => { if (!v) return null; const t = new Date(v + (endOfDay ? "T23:59:59.999" : "T00:00:00")).getTime(); return Number.isNaN(t) ? null : t; };
const trTarihi = (ms) => { if (ms == null) return "…"; const [y, a, g] = toDateInput(ms).split("-"); return `${g}.${a}.${y}`; };

function optionLabel(config, controlId, value) {
  const lists = [...(config.chips || []), ...(config.select || [])];
  for (const c of lists) if (c.id === controlId) { const o = (c.options || []).find((x) => x.value === value); if (o) return o.label; }
  return value;
}

/* minWidth `min(…,100%)` — WCAG 1.4.10 Reflow: 320px telefonda kabı dışarı itmez. */
function FilterInput({ config, filter, dar }) {
  return (
    <div style={{ position: "relative", flex: dar ? "1 1 100%" : "1 1 260px", maxWidth: dar ? "none" : 440, minWidth: "min(220px, 100%)" }}>
      <label htmlFor="flt-search" style={SR_ONLY}>{config.search.label || "Defterde ara"}</label>
      <span aria-hidden="true" style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center", color: PAL.mut3, pointerEvents: "none" }}><Icon.search /></span>
      <input id="flt-search" data-flt-ara="" type="search" value={filter.filters.search} placeholder={config.search.placeholder || "Ara…"}
        onChange={(e) => filter.setSearch(e.target.value)} {...focusRing} autoComplete="off" spellCheck={false} data-dokunma=""
        style={{ ...inputBase, width: "100%", paddingLeft: 36, paddingRight: SP.xxl, ...(dar ? { fontSize: 16 } : null) }} />
      {filter.filters.search && (
        <button type="button" onClick={() => filter.setSearch("")} aria-label="Aramayı temizle" {...focusRing}
          style={{ position: "absolute", right: 2, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 30, background: "none", border: "none", color: PAL.mut2, cursor: "pointer", padding: "0 6px", borderRadius: RAD.ctl }}><Icon.x /></button>
      )}
    </div>
  );
}

/* Yerel seçim kutusu — native select (erişilebilirlik + mobil seçici) korunur, yalnız kabuk
   çizilir: tarayıcı oku yerine ince chevron, sol künye öneki (yalnız sıralamada).
   `tam`: telefonda panel içinde tam genişlik (etiket kesilmez). */
export function SecimKutusu({ id, label, onek, value, onChange, options, minW = 170, tam = false }) {
  return (
    <div style={{ position: "relative", flex: tam ? "1 1 100%" : "1 1 140px", maxWidth: tam ? "none" : minW + 60, minWidth: "min(140px, 100%)" }}>
      <label htmlFor={id} style={SR_ONLY}>{label}</label>
      {onek && <span aria-hidden="true" style={{ ...kunyeEtiket, position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center", pointerEvents: "none" }}>{onek}</span>}
      <select id={id} value={value} onChange={onChange} {...focusRing} data-dokunma=""
        style={{ ...inputBase, width: "100%", cursor: "pointer", appearance: "none", WebkitAppearance: "none", paddingRight: 32, paddingLeft: onek ? 12 + onek.length * 7.4 + 10 : 12, textOverflow: "ellipsis", ...(tam ? { fontSize: 16 } : null) }}>
        {options.map((o) => <option key={o.value} value={o.value} style={{ background: PAL.surf }}>{o.label}</option>)}
      </select>
      <span aria-hidden="true" style={{ position: "absolute", right: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", color: PAL.mut2, pointerEvents: "none" }}><ChevronDown size={15} strokeWidth={1.75} /></span>
    </div>
  );
}

/* Sessiz geçiş çipi — üç defterin TEK çip bileşeni (İşlenen'in eski Pill'i bununla birleşti).
   Kapalıyken çerçevesiz metin (+ semantik nokta), açıkken tint zemin + lineHi kenar (tint tek
   sinyal değil: WCAG 1.4.11) + aria-pressed. Renksiz açık çipte onay işareti. */
export function GecisCip({ on, renk, onClick, children, ariaLabel }) {
  return (
    <button type="button" aria-pressed={on} aria-label={ariaLabel} onClick={onClick} {...focusRing} data-press="" data-dokunma="" data-flt-cip=""
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", minHeight: 28, borderRadius: RAD.chip + 1, cursor: "pointer",
        ...TYPE.data, fontWeight: 500, whiteSpace: "nowrap",
        border: `1px solid ${on ? PAL.lineHi : "transparent"}`, background: on ? ALFA(renk || PAL.ink) : "transparent",
        color: on ? (renk ? DERIN_OF(renk) : PAL.ink) : PAL.mut2,
        transition: `background .12s ease, border-color .12s ease, color .12s ease, transform .14s ${EASE.out}` }}>
      {renk && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: renk, opacity: on ? 1 : 0.6, flexShrink: 0 }} />}
      {on && !renk && <Icon.check width={12} height={12} />}
      {children}
    </button>
  );
}

const Grup = ({ etiket, children, ariaLabel }) => (
  <div role="group" aria-label={ariaLabel || etiket} style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", minWidth: 0 }}>
    <span aria-hidden="true" style={{ ...kunyeEtiket, marginRight: SP.s }}>{etiket}</span>
    {children}
  </div>
);

function FilterChips({ group, filter }) {
  const set = filter.filters.chips[group.id] || new Set();
  return (
    <Grup etiket={group.label}>
      {group.options.map((opt) => (
        <GecisCip key={opt.value} on={set.has(opt.value)} renk={opt.color || BANT[opt.value]?.c || null}
          onClick={() => filter.toggleChip(group.id, opt.value)}>{opt.label}</GecisCip>
      ))}
    </Grup>
  );
}

/* Tarih kutusu — öteki kontrollerle aynı 36 px; yerel takvim glifi yerine lucide ikonu. */
function TarihKutusu({ id, etiket, value, onChange }) {
  return (
    <span data-flt-tarih="" style={{ flex: "1 1 0", minWidth: 128, maxWidth: 170, display: "flex" }}>
      <label htmlFor={id} style={SR_ONLY}>{etiket}</label>
      <input id={id} type="date" value={value} onChange={onChange} {...focusRing}
        style={{ ...inputBase, ...TYPE.data, width: "100%", padding: "0 34px 0 10px", fontFamily: MONO, fontSize: 12, ...TNUM }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", color: PAL.mut2, pointerEvents: "none" }}><CalendarDays size={15} strokeWidth={1.75} /></span>
    </span>
  );
}

function FilterDateRange({ dateRange, filter }) {
  return (
    <div role="group" aria-label={dateRange.label || "Tarih"} style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", minWidth: 0, flex: "0 1 auto" }}>
      <span aria-hidden="true" style={kunyeEtiket}>{dateRange.label || "Tarih"}</span>
      {/* İki kutu birlikte kalır (aralık tek bir olgu); dar kapta etiket üste geçer. */}
      <span style={{ display: "flex", alignItems: "center", gap: SP.s, flex: "1 1 290px", minWidth: 0 }}>
        <TarihKutusu id="flt-date-from" etiket="Başlangıç tarihi" value={toDateInput(filter.filters.dateFrom)} onChange={(e) => filter.setDateRange(fromDateInput(e.target.value, false), filter.filters.dateTo)} />
        <span aria-hidden="true" style={{ ...TYPE.data, color: PAL.mut3 }}>–</span>
        <TarihKutusu id="flt-date-to" etiket="Bitiş tarihi" value={toDateInput(filter.filters.dateTo)} onChange={(e) => filter.setDateRange(filter.filters.dateFrom, fromDateInput(e.target.value, true))} />
      </span>
    </div>
  );
}

/* Hızlı tarih ön-ayarları — üst sınır GÜN SONU (Date.now() üst sınırı preset aktifken eklenen
   kaydı "Bugün"den düşürüyordu); alt sınır gün başı. */
function FilterDatePresets({ filter }) {
  const gunBasi = (gun) => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - gun * 86400000; };
  const uygula = (gun) => { const son = new Date(); son.setHours(23, 59, 59, 999); filter.setDateRange(gunBasi(gun), son.getTime()); };
  const aktif = filter.filters.dateFrom != null || filter.filters.dateTo != null;
  return (
    <Grup etiket="Hızlı tarih" ariaLabel="Hızlı tarih filtreleri">
      {[["Bugün", 0], ["Son 7 gün", 7], ["Son 30 gün", 30]].map(([lbl, g]) => (
        <GecisCip key={lbl} on={filter.filters.dateFrom === gunBasi(g)} onClick={() => uygula(g)}>{lbl}</GecisCip>
      ))}
      {aktif && (
        <button type="button" onClick={() => filter.setDateRange(null, null)} aria-label="Tarih filtresini temizle" {...focusRing}
          style={{ padding: "4px 8px", borderRadius: RAD.ctl, cursor: "pointer", ...TYPE.data, border: "1px solid transparent", background: "none", color: PAL.mut2, textDecoration: "underline", textUnderlineOffset: 3 }}>Temizle</button>
      )}
    </Grup>
  );
}

function ActiveState({ config, filter }) {
  if (!filter.hasActiveFilters) return null;
  const pills = [];
  if (filter.filters.search.trim()) pills.push({ key: "search", label: `“${filter.filters.search.trim()}”`, clear: () => filter.setSearch("") });
  for (const [cid, set] of Object.entries(filter.filters.chips)) for (const v of set) pills.push({ key: `${cid}:${v}`, label: optionLabel(config, cid, v), clear: () => filter.toggleChip(cid, v) });
  for (const [sid, v] of Object.entries(filter.filters.select)) if (v) pills.push({ key: `${sid}:${v}`, label: optionLabel(config, sid, v), clear: () => filter.setSelect(sid, "") });
  if (filter.filters.dateFrom != null || filter.filters.dateTo != null) pills.push({ key: "date", label: `${trTarihi(filter.filters.dateFrom)} – ${trTarihi(filter.filters.dateTo)}`, clear: () => filter.setDateRange(null, null) });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", paddingTop: SP.s, borderTop: `1px dashed ${PAL.line}` }}>
      <span aria-hidden="true" style={kunyeEtiket}>Etkin</span>
      {pills.map((p) => (
        <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 4px 2px 8px", borderRadius: RAD.chip, background: ALFA(T), color: DERIN.T, ...TYPE.meta, fontWeight: 500, animation: "nu-rise .2s var(--ke-ease-out) both" }}>
          {p.label}
          <button type="button" onClick={p.clear} aria-label={`Filtre kaldır: ${p.label}`} {...focusRing}
            style={{ background: "none", border: "none", color: DERIN.T, cursor: "pointer", padding: 6, margin: "-6px -2px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.chip }}><Icon.x width={12} height={12} /></button>
        </span>
      ))}
      <button type="button" onClick={filter.clearAll} {...focusRing}
        style={{ ...TYPE.data, color: PAL.mut2, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, padding: "4px 6px", margin: "-4px -6px" }}>Tüm filtreleri temizle</button>
    </div>
  );
}

/* "Filtreler" açılır düğmesi — disclosure (aria-expanded), onay işareti DEĞİL chevron + etkin
   ölçüt sayısı rozeti (geçiş çipi sözcüğü disclosure'a yanlış anlam veriyordu). */
function FiltreDugmesi({ acik, onClick, sayi, panelId }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={acik} aria-controls={panelId} data-flt-dugme="" data-dokunma=""
      aria-label={`Filtreler${sayi ? ` — ${sayi} etkin` : ""}`} {...focusRing} data-press=""
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, height: KONTROL_Y, padding: "0 12px", flexShrink: 0,
        borderRadius: RAD.ctl, border: `1px solid ${acik || sayi ? PAL.lineHi : PAL.inputLine}`,
        background: acik ? PAL.surf2 : PAL.surf, color: PAL.ink2, ...TYPE.ui, fontWeight: 500,
        transition: `background .12s ease, border-color .12s ease, transform .14s ${EASE.out}` }}>
      <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
      Filtreler
      {sayi > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, display: "inline-grid", placeItems: "center", background: T, color: PAL.onAccent, fontFamily: MONO, fontSize: 11, fontWeight: 600, ...TNUM }}>{sayi}</span>}
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" style={{ transform: acik ? "rotate(180deg)" : "none", transition: `transform .2s ${EASE.out}` }} />
    </button>
  );
}

const Sayac = ({ filter }) => (
  <span role="status" aria-live="polite" aria-atomic="true" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 6, fontFamily: MONO, fontSize: 12, color: PAL.mut2, whiteSpace: "nowrap", flexShrink: 0, ...TNUM }}>
    <strong style={{ color: PAL.ink, fontWeight: 600, fontSize: 13 }}>{filter.counts.filtered}</strong>
    <span>/ {filter.counts.total} kayıt</span>
  </span>
);

function etkinOlcutSayisi(filter, haric = []) {
  const c = Object.entries(filter.filters.chips || {}).reduce((a, [k, set]) => a + (haric.includes(k) ? 0 : set?.size || 0), 0);
  const s = Object.values(filter.filters.select || {}).filter(Boolean).length;
  return c + s + (filter.filters.dateFrom != null || filter.filters.dateTo != null ? 1 : 0);
}

/* Kontrol kümeleri — hangi kipte nerede duracakları FilterBar'da karar verilir. */
function kontroller(config, filter, dar) {
  const chips = config.chips || [];
  const secimler = (config.select || []).map((s) => (
    <SecimKutusu key={s.id} id={`flt-${s.id}`} label={s.label} value={filter.filters.select[s.id] || ""} tam={dar}
      onChange={(e) => filter.setSelect(s.id, e.target.value)} options={s.options || []} />
  ));
  const sirala = config.sort?.enabled ? (
    <SecimKutusu key="sort" id="flt-sort" label="Sıralama" onek="Sıra" value={filter.filters.sortBy} minW={200} tam={dar}
      onChange={(e) => filter.setSortBy(e.target.value)} options={config.sort.options} />
  ) : null;
  const cip = (g) => <FilterChips key={g.id} group={g} filter={filter} />;
  const tarih = [
    ...(config.datePresets?.enabled ? [<FilterDatePresets key="dp" filter={filter} />] : []),
    ...(config.dateRange?.enabled ? [<FilterDateRange key="dr" dateRange={config.dateRange} filter={filter} />] : []),
  ];
  return { chips, secimler, sirala, cip, tarih };
}

function Panel({ id, children }) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "center", gap: `${SP.m}px ${SP.xl}px`, flexWrap: "wrap",
      padding: `${SP.m}px ${SP.l}px`, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, background: PAL.surf2,
      animation: "nu-rise .18s var(--ke-ease-out) both" }}>
      {children}
    </div>
  );
}

/* Yükleme yer tutucusu — kompakt araç satırının birebir silüeti: arama · `cip` adet satır içi
   çip · sıralama · Filtreler · sayaç (telefonda: tam genişlik arama, alt satırda Filtreler +
   sayaç). Kayıtlar gelince biçim DEĞİŞMEZ, defter aşağı kaymaz (tur 6: iskelet iki kutuydu,
   gerçek satır arama + 3 çip + sıralama + Filtreler). */
export function FiltreIskelet({ cip = 0 }) {
  const dar = useDarEkran();
  const kutu = { height: dar ? 44 : KONTROL_Y, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, boxSizing: "border-box" };
  const cubuk = { height: 10, borderRadius: 3, background: PAL.line };
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: `${SP.s}px ${SP.m}px`, flexWrap: "wrap", alignItems: "center", marginBottom: SP.l }}>
      <span style={{ ...kutu, flex: dar ? "1 1 100%" : "1 1 260px", maxWidth: dar ? "none" : 440, minWidth: "min(220px, 100%)" }} />
      {!dar && Array.from({ length: cip }, (_, i) => <span key={i} style={{ ...cubuk, width: [44, 52, 40][i % 3], marginInline: 6 }} />)}
      {!dar && <span style={{ ...kutu, flex: "1 1 140px", maxWidth: 260, minWidth: "min(140px, 100%)" }} />}
      <span style={{ ...kutu, width: 128 }} />
      <span style={{ ...cubuk, marginLeft: "auto", width: 72 }} />
    </div>
  );
}

/* gizli: kontrolü BAŞKA yerde çizilen çip grupları (İşlenen'de karar durumu özet karolarında) —
   burada düğme basılmaz, ama etkin şeritte okunur etiketle görünür. */
export default function FilterBar({ config, filter, compact = false, showResultCount = true, kip = "acik", satirIci = [], gizli = [] }) {
  const dar = useDarEkran();
  const [acik, setAcik] = useState(false);
  const { chips: tumCipler, secimler, sirala, cip, tarih } = kontroller(config, filter, dar);
  const chips = tumCipler.filter((g) => !gizli.includes(g.id));
  const katli = dar || kip === "kompakt";
  const inlineChips = katli && !dar ? chips.filter((g) => satirIci.includes(g.id)) : [];
  const panelChips = katli ? chips.filter((g) => !inlineChips.includes(g)) : [];
  const panelIcerik = katli ? [...(dar ? [sirala] : []), ...secimler, ...panelChips.map(cip), ...tarih].filter(Boolean) : [];
  const panelId = "flt-panel";
  return (
    <section role="region" aria-labelledby="flt-h" style={{ marginBottom: compact ? SP.m : SP.l, display: "flex", flexDirection: "column", gap: SP.m }}>
      <style>{FLT_CSS}</style>
      <h2 id="flt-h" style={SR_ONLY}>Filtreler</h2>
      <div style={{ display: "flex", gap: `${SP.s}px ${SP.m}px`, flexWrap: "wrap", alignItems: "center" }}>
        {config.search?.enabled && <FilterInput config={config} filter={filter} dar={dar} />}
        {!katli && secimler}
        {inlineChips.map(cip)}
        {!dar && sirala}
        {katli && panelIcerik.length > 0 && (
          <FiltreDugmesi acik={acik} onClick={() => setAcik((a) => !a)} panelId={panelId}
            sayi={etkinOlcutSayisi(filter, [...inlineChips.map((g) => g.id), ...gizli])} />
        )}
        {katli && showResultCount && <Sayac filter={filter} />}
      </div>
      {katli && acik && panelIcerik.length > 0 && <Panel id={panelId}>{panelIcerik}</Panel>}
      {!katli && (chips.length > 0 || tarih.length > 0 || showResultCount) && (
        <div style={{ display: "flex", alignItems: "center", gap: `${SP.s}px ${SP.xl}px`, flexWrap: "wrap" }}>
          {chips.map(cip)}
          {tarih}
          {showResultCount && <Sayac filter={filter} />}
        </div>
      )}
      <ActiveState config={config} filter={filter} />
    </section>
  );
}
