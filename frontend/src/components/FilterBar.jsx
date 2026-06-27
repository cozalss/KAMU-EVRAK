/* FilterBar — deklaratif, yeniden-kullanılabilir filtre çubuğu. config'te tanımlı kontroller
   render edilir (arama → çipler → select+sıralama satırı → tarih → aktif-filtre şeridi).
   filter = useFilter(...) çıktısı. Neon satır-içi stil + tam a11y (label, role, aria-live). */
import React from "react";
import { MONO, SANS, T, PAL, BANT, focusRing, SR_ONLY } from "./neonUi.jsx";

const inputBase = { background: PAL.bg2, border: `1px solid ${PAL.line}`, borderRadius: 9, color: PAL.ink2, fontFamily: MONO, fontSize: 12.5, padding: "9px 12px", outline: "none" };

// epoch ↔ <input type=date> (YYYY-MM-DD, yerel)
const toDateInput = (ms) => { if (ms == null) return ""; const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fromDateInput = (v, endOfDay) => { if (!v) return null; const t = new Date(v + (endOfDay ? "T23:59:59.999" : "T00:00:00")).getTime(); return Number.isNaN(t) ? null : t; };

function optionLabel(config, controlId, value) {
  const lists = [...(config.chips || []), ...(config.select || [])];
  for (const c of lists) if (c.id === controlId) { const o = (c.options || []).find((x) => x.value === value); if (o) return o.label; }
  return value;
}

function FilterInput({ config, filter }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
      <label htmlFor="flt-search" style={SR_ONLY}>Ara</label>
      <input id="flt-search" type="search" value={filter.filters.search} placeholder={config.search.placeholder || "Ara…"}
        onChange={(e) => filter.setSearch(e.target.value)} {...focusRing}
        style={{ ...inputBase, width: "100%", paddingRight: 30 }} />
      {filter.filters.search && (
        <button type="button" onClick={() => filter.setSearch("")} aria-label="Aramayı temizle" {...focusRing}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: PAL.mut2, cursor: "pointer", fontSize: 13, padding: 2 }}>✕</button>
      )}
    </div>
  );
}

function FilterChips({ group, filter }) {
  const set = filter.filters.chips[group.id] || new Set();
  return (
    <div role="group" aria-label={group.label} style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut2, letterSpacing: ".5px" }}>{group.label}:</span>
      {group.options.map((opt) => {
        const on = set.has(opt.value);
        const c = opt.color || BANT[opt.value]?.c || T;
        return (
          <button key={opt.value} type="button" aria-pressed={on} onClick={() => filter.toggleChip(group.id, opt.value)} {...focusRing}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 11, border: `1px solid ${on ? c + "55" : PAL.line}`, background: on ? c + "22" : PAL.bg2, color: on ? c : PAL.mut2 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: c, opacity: on ? 1 : 0.55 }} />{opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({ sel, filter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 190 }}>
      <label htmlFor={`flt-${sel.id}`} style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut2, letterSpacing: ".5px" }}>{sel.label}</label>
      <select id={`flt-${sel.id}`} value={filter.filters.select[sel.id] || ""} onChange={(e) => filter.setSelect(sel.id, e.target.value)} {...focusRing} style={{ ...inputBase, cursor: "pointer" }}>
        {sel.options.map((o) => <option key={o.value} value={o.value} style={{ background: "#141c30" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FilterDateRange({ dateRange, filter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut2, letterSpacing: ".5px" }}>{dateRange.label || "Tarih"}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor="flt-date-from" style={SR_ONLY}>Başlangıç tarihi</label>
        <input id="flt-date-from" type="date" value={toDateInput(filter.filters.dateFrom)} onChange={(e) => filter.setDateRange(fromDateInput(e.target.value, false), filter.filters.dateTo)} {...focusRing} style={{ ...inputBase, colorScheme: "dark" }} />
        <span style={{ color: PAL.mut2, fontFamily: MONO }}>—</span>
        <label htmlFor="flt-date-to" style={SR_ONLY}>Bitiş tarihi</label>
        <input id="flt-date-to" type="date" value={toDateInput(filter.filters.dateTo)} onChange={(e) => filter.setDateRange(filter.filters.dateFrom, fromDateInput(e.target.value, true))} {...focusRing} style={{ ...inputBase, colorScheme: "dark" }} />
      </div>
    </div>
  );
}

/* Hızlı tarih ön-ayarları (Bugün / Son 7 / Son 30 gün) — dateRange'i set eder (additive). */
function FilterDatePresets({ filter }) {
  const uygula = (gun) => {
    const now = Date.now();
    if (gun === 0) { const d = new Date(); d.setHours(0, 0, 0, 0); filter.setDateRange(d.getTime(), now); }
    else filter.setDateRange(now - gun * 86400000, now);
  };
  const presets = [["Bugün", 0], ["Son 7 gün", 7], ["Son 30 gün", 30]];
  const aktif = filter.filters.dateFrom != null || filter.filters.dateTo != null;
  return (
    <div role="group" aria-label="Hızlı tarih filtreleri" style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 10.5, color: PAL.mut2, letterSpacing: ".5px" }}>Hızlı tarih:</span>
      {presets.map(([lbl, g]) => (
        <button key={lbl} type="button" onClick={() => uygula(g)} {...focusRing}
          style={{ padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 11, border: `1px solid ${PAL.line}`, background: PAL.bg2, color: PAL.mut2 }}>{lbl}</button>
      ))}
      {aktif && (
        <button type="button" onClick={() => filter.setDateRange(null, null)} aria-label="Tarih filtresini temizle" {...focusRing}
          style={{ padding: "5px 8px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 11, border: "1px solid transparent", background: "none", color: PAL.mut3, textDecoration: "underline" }}>temizle</button>
      )}
    </div>
  );
}

function FilterSort({ sort, filter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 190 }}>
      <label htmlFor="flt-sort" style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut2, letterSpacing: ".5px" }}>Sıralama</label>
      <select id="flt-sort" value={filter.filters.sortBy} onChange={(e) => filter.setSortBy(e.target.value)} {...focusRing} style={{ ...inputBase, cursor: "pointer" }}>
        {sort.options.map((o) => <option key={o.value} value={o.value} style={{ background: "#141c30" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ActiveState({ config, filter }) {
  if (!filter.hasActiveFilters) return null;
  const pills = [];
  if (filter.filters.search.trim()) pills.push({ key: "search", label: `“${filter.filters.search.trim()}”`, clear: () => filter.setSearch("") });
  for (const [cid, set] of Object.entries(filter.filters.chips)) for (const v of set) pills.push({ key: `${cid}:${v}`, label: optionLabel(config, cid, v), clear: () => filter.toggleChip(cid, v) });
  for (const [sid, v] of Object.entries(filter.filters.select)) if (v) pills.push({ key: `${sid}:${v}`, label: optionLabel(config, sid, v), clear: () => filter.setSelect(sid, "") });
  if (filter.filters.dateFrom != null || filter.filters.dateTo != null) pills.push({ key: "date", label: `${toDateInput(filter.filters.dateFrom) || "…"} → ${toDateInput(filter.filters.dateTo) || "…"}`, clear: () => filter.setDateRange(null, null) });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      {pills.map((p) => (
        <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 7, background: T + "22", border: `1px solid ${T}55`, color: T, fontFamily: MONO, fontSize: 11 }}>
          {p.label}
          <button type="button" onClick={p.clear} aria-label={`Filtre kaldır: ${p.label}`} {...focusRing} style={{ background: "none", border: "none", color: T, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
        </span>
      ))}
      <button type="button" onClick={filter.clearAll} {...focusRing} style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tüm filtreleri temizle</button>
    </div>
  );
}

export default function FilterBar({ config, filter, compact = false, showResultCount = true }) {
  return (
    <section role="region" aria-labelledby="flt-h" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: 14, padding: compact ? "12px 14px" : "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 id="flt-h" style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: PAL.mut2, textTransform: "uppercase" }}>Filtreler</h3>
        {showResultCount && (
          <span role="status" aria-live="polite" aria-atomic="true" style={{ fontFamily: MONO, fontSize: 11.5 }}>
            <strong style={{ color: T }}>{filter.counts.filtered}</strong><span style={{ color: PAL.mut2 }}> / {filter.counts.total} sonuç</span>
          </span>
        )}
      </div>

      {config.search?.enabled && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FilterInput config={config} filter={filter} />
        </div>
      )}

      {(config.chips || []).map((g) => <FilterChips key={g.id} group={g} filter={filter} />)}

      {((config.select || []).length > 0 || config.sort?.enabled) && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {(config.select || []).map((s) => <FilterSelect key={s.id} sel={s} filter={filter} />)}
          {config.sort?.enabled && <FilterSort sort={config.sort} filter={filter} />}
        </div>
      )}

      {config.datePresets?.enabled && <FilterDatePresets filter={filter} />}

      {config.dateRange?.enabled && <FilterDateRange dateRange={config.dateRange} filter={filter} />}

      <ActiveState config={config} filter={filter} />
    </section>
  );
}
