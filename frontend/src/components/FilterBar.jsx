/* FilterBar — deklaratif, yeniden-kullanılabilir filtre çubuğu. config'te tanımlı kontroller
   render edilir. filter = useFilter(...) çıktısı.

   "Antet & Damga" (2026-10): ağır "Filtreler" kartı yerine defterin üstünde duran İNCE
   ARAÇ ÇUBUĞU. İki satır:
   1) araç satırı — büyüteçli arama · seçimler · sıralama (tek yükseklik, 36px)
   2) ölçüt satırı — çip grupları (mono künye etiketi + sessiz geçiş çipleri) · hızlı tarih ·
      tarih aralığı · sağda sonuç sayacı
   Etkin filtre şeridi altta. Etiketler a11y için korunur (select etiketleri ekran-okuyucuya,
   görünür künye görevini ilk seçenek — "Tüm kategoriler" — üstlenir). */
import React, { useState } from "react";
import { useDarEkran } from "../hooks/useMedya.js";
import { ChevronDown } from "lucide-react";
import { T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, MONO, RAD, SP, EASE, Icon, focusRing, SR_ONLY } from "./neonUi.jsx";

const KONTROL_Y = 36;
const inputBase = { background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, color: PAL.ink, ...TYPE.ui, padding: "0 12px", height: KONTROL_Y, outline: "none", boxSizing: "border-box" };
const kunyeEtiket = { ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" };

// epoch ↔ <input type=date> (YYYY-MM-DD, yerel)
const toDateInput = (ms) => { if (ms == null) return ""; const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fromDateInput = (v, endOfDay) => { if (!v) return null; const t = new Date(v + (endOfDay ? "T23:59:59.999" : "T00:00:00")).getTime(); return Number.isNaN(t) ? null : t; };

function optionLabel(config, controlId, value) {
  const lists = [...(config.chips || []), ...(config.select || [])];
  for (const c of lists) if (c.id === controlId) { const o = (c.options || []).find((x) => x.value === value); if (o) return o.label; }
  return value;
}

/* minWidth `min(…,100%)` — WCAG 1.4.10 Reflow: 320px telefonda kabı dışarı itmez. */
function FilterInput({ config, filter }) {
  return (
    <div style={{ position: "relative", flex: "1 1 260px", minWidth: "min(220px, 100%)" }}>
      <label htmlFor="flt-search" style={SR_ONLY}>Ara</label>
      <span aria-hidden="true" style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center", color: PAL.mut3, pointerEvents: "none" }}><Icon.search /></span>
      <input id="flt-search" type="text" value={filter.filters.search} placeholder={config.search.placeholder || "Ara…"}
        onChange={(e) => filter.setSearch(e.target.value)} {...focusRing}
        style={{ ...inputBase, width: "100%", paddingLeft: 36, paddingRight: SP.xxl }} />
      {filter.filters.search && (
        /* Hedef ≥24px (WCAG 2.2 SC 2.5.8) — buton yalnız arama doluyken DOM'da. */
        <button type="button" onClick={() => filter.setSearch("")} aria-label="Aramayı temizle" {...focusRing}
          style={{ position: "absolute", right: 2, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 30, background: "none", border: "none", color: PAL.mut2, cursor: "pointer", padding: "0 6px", borderRadius: RAD.ctl }}><Icon.x /></button>
      )}
    </div>
  );
}

/* Yerel seçim kutusu — native select (erişilebilirlik + mobil seçici) korunur, yalnız kabuk
   çizilir: tarayıcı oku yerine ince chevron, sol künye öneki (yalnız sıralamada). */
export function SecimKutusu({ id, label, onek, value, onChange, options, minW = 170 }) {
  return (
    <div style={{ position: "relative", flex: "1 1 140px", maxWidth: minW + 60, minWidth: "min(140px, 100%)" }}>
      <label htmlFor={id} style={SR_ONLY}>{label}</label>
      {onek && <span aria-hidden="true" style={{ ...kunyeEtiket, position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center", pointerEvents: "none" }}>{onek}</span>}
      <select id={id} value={value} onChange={onChange} {...focusRing}
        style={{ ...inputBase, width: "100%", cursor: "pointer", appearance: "none", WebkitAppearance: "none", paddingRight: 32, paddingLeft: onek ? 12 + onek.length * 7.4 + 10 : 12, textOverflow: "ellipsis" }}>
        {options.map((o) => <option key={o.value} value={o.value} style={{ background: PAL.surf }}>{o.label}</option>)}
      </select>
      <span aria-hidden="true" style={{ position: "absolute", right: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", color: PAL.mut2, pointerEvents: "none" }}><ChevronDown size={15} strokeWidth={1.75} /></span>
    </div>
  );
}

/* Sessiz geçiş çipi — kapalıyken çerçevesiz metin (+ semantik nokta), açıkken tint zemin +
   lineHi kenar (tint tek sinyal değil: WCAG 1.4.11) + aria-pressed. */
function GecisCip({ on, renk, onClick, children, ariaLabel }) {
  return (
    <button type="button" aria-pressed={on} aria-label={ariaLabel} onClick={onClick} {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
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

/* Tarih aralığı — kutular daralabilir (minWidth:0) ve yer yoksa sarar: iki type=date kutusu
   390px'te 36px taşırıyordu (2026-08-12 ölçümü). */
function FilterDateRange({ dateRange, filter }) {
  const kutu = { ...inputBase, ...TYPE.data, height: 30, padding: "0 8px", flex: "1 1 120px", minWidth: 0, fontFamily: MONO, fontSize: 12 };
  return (
    <div role="group" aria-label={dateRange.label || "Tarih"} style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", minWidth: 0, flex: "0 1 auto" }}>
      <span aria-hidden="true" style={kunyeEtiket}>{dateRange.label || "Tarih"}</span>
      <label htmlFor="flt-date-from" style={SR_ONLY}>Başlangıç tarihi</label>
      <input id="flt-date-from" type="date" value={toDateInput(filter.filters.dateFrom)} onChange={(e) => filter.setDateRange(fromDateInput(e.target.value, false), filter.filters.dateTo)} {...focusRing} style={kutu} />
      <span aria-hidden="true" style={{ ...TYPE.data, color: PAL.mut3 }}>–</span>
      <label htmlFor="flt-date-to" style={SR_ONLY}>Bitiş tarihi</label>
      <input id="flt-date-to" type="date" value={toDateInput(filter.filters.dateTo)} onChange={(e) => filter.setDateRange(filter.filters.dateFrom, fromDateInput(e.target.value, true))} {...focusRing} style={kutu} />
    </div>
  );
}

/* Hızlı tarih ön-ayarları — üst sınır GÜN SONU (bug avı bulgusu: Date.now() üst sınırı
   preset aktifken eklenen kaydı "Bugün"den düşürüyordu); alt sınır gün başı. */
function FilterDatePresets({ filter }) {
  const gunBasi = (gun) => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - gun * 86400000; };
  const uygula = (gun) => {
    const son = new Date(); son.setHours(23, 59, 59, 999);
    filter.setDateRange(gunBasi(gun), son.getTime());
  };
  const presets = [["Bugün", 0], ["Son 7 gün", 7], ["Son 30 gün", 30]];
  const aktif = filter.filters.dateFrom != null || filter.filters.dateTo != null;
  return (
    <Grup etiket="Hızlı tarih" ariaLabel="Hızlı tarih filtreleri">
      {presets.map(([lbl, g]) => (
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
  if (filter.filters.dateFrom != null || filter.filters.dateTo != null) pills.push({ key: "date", label: `${toDateInput(filter.filters.dateFrom) || "…"} – ${toDateInput(filter.filters.dateTo) || "…"}`, clear: () => filter.setDateRange(null, null) });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", paddingTop: SP.s, borderTop: `1px dashed ${PAL.line}` }}>
      <span aria-hidden="true" style={kunyeEtiket}>Etkin</span>
      {pills.map((p) => (
        <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 4px 2px 8px", borderRadius: RAD.chip, background: ALFA(T), color: DERIN.T, ...TYPE.meta, fontWeight: 500, animation: "nu-rise .2s var(--ke-ease-out) both" }}>
          {p.label}
          {/* Hedef 24x24 (WCAG 2.2 §2.5.8); negatif kenar boşluğu çipin görünen boyunu korur. */}
          <button type="button" onClick={p.clear} aria-label={`Filtre kaldır: ${p.label}`} {...focusRing}
            style={{ background: "none", border: "none", color: DERIN.T, cursor: "pointer", padding: 6, margin: "-6px -2px -6px -2px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.chip }}><Icon.x width={12} height={12} /></button>
        </span>
      ))}
      <button type="button" onClick={filter.clearAll} {...focusRing}
        style={{ ...TYPE.data, color: PAL.mut2, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, padding: "4px 6px", margin: "-4px -6px" }}>Tüm filtreleri temizle</button>
    </div>
  );
}


/* Telefonda ölçüt satırı (çip grupları + tarih) varsayılan KATLI: 390px'te 9 satıra
   yayılıp defteri ekranın altına itiyordu (ölçüldü, Giden). Açma düğmesi etkin ölçüt
   sayısını taşır; sonuç sayacı her zaman görünür. Masaüstünde satır hep açık. */
function etkinOlcutSayisi(filter) {
  const c = Object.values(filter.filters.chips || {}).reduce((a, set) => a + (set?.size || 0), 0);
  return c + (filter.filters.dateFrom != null || filter.filters.dateTo != null ? 1 : 0);
}

export default function FilterBar({ config, filter, compact = false, showResultCount = true }) {
  const dar = useDarEkran();
  const [olcutAcik, setOlcutAcik] = useState(false);
  const chips = config.chips || [];
  const olcutVar = chips.length > 0 || config.datePresets?.enabled || config.dateRange?.enabled || showResultCount;
  const olcutler = [
    ...chips.map((g) => <FilterChips key={g.id} group={g} filter={filter} />),
    ...(config.datePresets?.enabled ? [<FilterDatePresets key="dp" filter={filter} />] : []),
    ...(config.dateRange?.enabled ? [<FilterDateRange key="dr" dateRange={config.dateRange} filter={filter} />] : []),
  ];
  return (
    <section role="region" aria-labelledby="flt-h" style={{ marginBottom: compact ? SP.m : SP.l, display: "flex", flexDirection: "column", gap: SP.m }}>
      <h3 id="flt-h" style={SR_ONLY}>Filtreler</h3>
      <div style={{ display: "flex", gap: SP.s, flexWrap: "wrap", alignItems: "center" }}>
        {config.search?.enabled && <FilterInput config={config} filter={filter} />}
        {(config.select || []).map((s) => (
          <SecimKutusu key={s.id} id={`flt-${s.id}`} label={s.label} value={filter.filters.select[s.id] || ""}
            onChange={(e) => filter.setSelect(s.id, e.target.value)} options={s.options || []} />
        ))}
        {config.sort?.enabled && (
          <SecimKutusu id="flt-sort" label="Sıralama" onek="Sıra" value={filter.filters.sortBy} minW={200}
            onChange={(e) => filter.setSortBy(e.target.value)} options={config.sort.options} />
        )}
      </div>

      {olcutVar && (
        <div style={{ display: "flex", alignItems: "center", gap: `${SP.s}px ${SP.xl}px`, flexWrap: "wrap" }}>
          {dar && olcutler.length > 0 && (
            <GecisCip on={olcutAcik} onClick={() => setOlcutAcik((a) => !a)}
              ariaLabel={`Ölçütler${etkinOlcutSayisi(filter) ? ` — ${etkinOlcutSayisi(filter)} etkin` : ""}`}>
              Ölçütler{etkinOlcutSayisi(filter) ? ` · ${etkinOlcutSayisi(filter)}` : ""}
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" style={{ transform: olcutAcik ? "rotate(180deg)" : "none", transition: `transform .2s ${EASE.out}` }} />
            </GecisCip>
          )}
          {(!dar || olcutAcik) && olcutler}
          {showResultCount && (
            <span role="status" aria-live="polite" aria-atomic="true" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 6, fontFamily: MONO, fontSize: 12, color: PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>
              <strong style={{ color: PAL.ink, fontWeight: 600, fontSize: 13 }}>{filter.counts.filtered}</strong>
              <span>/ {filter.counts.total} kayıt</span>
            </span>
          )}
        </div>
      )}

      <ActiveState config={config} filter={filter} />
    </section>
  );
}
