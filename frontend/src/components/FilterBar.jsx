/* FilterBar — deklaratif, yeniden-kullanılabilir filtre çubuğu. config'te tanımlı kontroller
   render edilir (arama → çipler → select+sıralama satırı → tarih → aktif-filtre şeridi).
   filter = useFilter(...) çıktısı. Hero Light v2 satır-içi stil + tam a11y (label, role, aria-live). */
import React from "react";
import { T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, Icon, focusRing, SR_ONLY } from "./neonUi.jsx";

const inputBase = { background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, color: PAL.ink2, ...TYPE.ui, padding: "8px 12px", outline: "none" };
const labelStyle = { ...TYPE.meta, fontWeight: 500, color: PAL.mut2 };

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
        style={{ ...inputBase, width: "100%", paddingRight: SP.xxl }} />
      {filter.filters.search && (
        <button type="button" onClick={() => filter.setSearch("")} aria-label="Aramayı temizle" {...focusRing}
          style={{ position: "absolute", right: SP.s, top: 0, bottom: 0, display: "flex", alignItems: "center", background: "none", border: "none", color: PAL.mut2, cursor: "pointer", padding: 0 }}><Icon.x /></button>
      )}
    </div>
  );
}

function FilterChips({ group, filter }) {
  const set = filter.filters.chips[group.id] || new Set();
  return (
    <div role="group" aria-label={group.label} style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
      <span style={labelStyle}>{group.label}:</span>
      {group.options.map((opt) => {
        const on = set.has(opt.value);
        const c = opt.color || BANT[opt.value]?.c || T;
        return (
          <button key={opt.value} type="button" aria-pressed={on} onClick={() => filter.toggleChip(group.id, opt.value)} {...focusRing}
            style={{ display: "inline-flex", alignItems: "center", gap: SP.s, padding: "4px 8px", borderRadius: RAD.ctl, cursor: "pointer", ...TYPE.data, fontWeight: 500, border: `1px solid ${on ? "transparent" : PAL.line}`, background: on ? ALFA(c) : PAL.surf, color: on ? DERIN_OF(c) : PAL.mut2, transition: "background .12s ease-out" }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: c, opacity: on ? 1 : 0.55, flexShrink: 0 }} />{opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({ sel, filter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, flex: 1, minWidth: 190 }}>
      <label htmlFor={`flt-${sel.id}`} style={labelStyle}>{sel.label}</label>
      <select id={`flt-${sel.id}`} value={filter.filters.select[sel.id] || ""} onChange={(e) => filter.setSelect(sel.id, e.target.value)} {...focusRing} style={{ ...inputBase, cursor: "pointer" }}>
        {sel.options.map((o) => <option key={o.value} value={o.value} style={{ background: PAL.surf }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FilterDateRange({ dateRange, filter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
      <span style={labelStyle}>{dateRange.label || "Tarih"}</span>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        <label htmlFor="flt-date-from" style={SR_ONLY}>Başlangıç tarihi</label>
        <input id="flt-date-from" type="date" value={toDateInput(filter.filters.dateFrom)} onChange={(e) => filter.setDateRange(fromDateInput(e.target.value, false), filter.filters.dateTo)} {...focusRing} style={{ ...inputBase, colorScheme: "light" }} />
        <span style={{ ...TYPE.data, color: PAL.mut2 }}>—</span>
        <label htmlFor="flt-date-to" style={SR_ONLY}>Bitiş tarihi</label>
        <input id="flt-date-to" type="date" value={toDateInput(filter.filters.dateTo)} onChange={(e) => filter.setDateRange(filter.filters.dateFrom, fromDateInput(e.target.value, true))} {...focusRing} style={{ ...inputBase, colorScheme: "light" }} />
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
    <div role="group" aria-label="Hızlı tarih filtreleri" style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
      <span style={labelStyle}>Hızlı tarih:</span>
      {presets.map(([lbl, g]) => (
        <button key={lbl} type="button" onClick={() => uygula(g)} {...focusRing}
          style={{ padding: "4px 8px", borderRadius: RAD.ctl, cursor: "pointer", ...TYPE.data, fontWeight: 500, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut2, transition: "background .12s ease-out" }}>{lbl}</button>
      ))}
      {aktif && (
        <button type="button" onClick={() => filter.setDateRange(null, null)} aria-label="Tarih filtresini temizle" {...focusRing}
          style={{ padding: "4px 8px", borderRadius: RAD.ctl, cursor: "pointer", ...TYPE.data, border: "1px solid transparent", background: "none", color: PAL.mut3, textDecoration: "underline" }}>Temizle</button>
      )}
    </div>
  );
}

function FilterSort({ sort, filter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, minWidth: 190 }}>
      <label htmlFor="flt-sort" style={labelStyle}>Sıralama</label>
      <select id="flt-sort" value={filter.filters.sortBy} onChange={(e) => filter.setSortBy(e.target.value)} {...focusRing} style={{ ...inputBase, cursor: "pointer" }}>
        {sort.options.map((o) => <option key={o.value} value={o.value} style={{ background: PAL.surf }}>{o.label}</option>)}
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
  if (filter.filters.dateFrom != null || filter.filters.dateTo != null) pills.push({ key: "date", label: `${toDateInput(filter.filters.dateFrom) || "…"} – ${toDateInput(filter.filters.dateTo) || "…"}`, clear: () => filter.setDateRange(null, null) });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.xs }}>
      {pills.map((p) => (
        <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(T), color: DERIN.T, ...TYPE.meta, fontWeight: 500 }}>
          {p.label}
          <button type="button" onClick={p.clear} aria-label={`Filtre kaldır: ${p.label}`} {...focusRing} style={{ background: "none", border: "none", color: DERIN.T, cursor: "pointer", padding: 0, display: "flex" }}><Icon.x width={12} height={12} /></button>
        </span>
      ))}
      <button type="button" onClick={filter.clearAll} {...focusRing} style={{ ...TYPE.data, color: PAL.mut2, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tüm filtreleri temizle</button>
    </div>
  );
}

export default function FilterBar({ config, filter, compact = false, showResultCount = true }) {
  return (
    <section role="region" aria-labelledby="flt-h" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: compact ? "12px 16px" : SP.l, marginBottom: SP.l, display: "flex", flexDirection: "column", gap: SP.m }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, flexWrap: "wrap" }}>
        <h3 id="flt-h" style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Filtreler</h3>
        {showResultCount && (
          <span role="status" aria-live="polite" aria-atomic="true" style={{ ...TYPE.data, ...TNUM }}>
            <strong style={{ color: DERIN.T, fontWeight: 600 }}>{filter.counts.filtered}</strong><span style={{ color: PAL.mut2 }}> / {filter.counts.total} sonuç</span>
          </span>
        )}
      </div>

      {config.search?.enabled && (
        <div style={{ display: "flex", gap: SP.m, flexWrap: "wrap" }}>
          <FilterInput config={config} filter={filter} />
        </div>
      )}

      {(config.chips || []).map((g) => <FilterChips key={g.id} group={g} filter={filter} />)}

      {((config.select || []).length > 0 || config.sort?.enabled) && (
        <div style={{ display: "flex", gap: SP.m, flexWrap: "wrap", alignItems: "flex-end" }}>
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
