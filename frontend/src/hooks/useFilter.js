/* useFilter — görünüm-bağımsız filtreleme/sıralama çekirdeği. Saf + useMemo (her render'da
   yeniden filtrelemeyi önler). Türkçe collation (İ/ı doğru). Deklaratif config (her görünüm
   kendi filtre setini verir). Tüm state immutable güncellenir (coding-style).

   config: { search, chips[], select[], dateRange, sort, dataMapping, persistKey } — bkz. tasarım
   spec §1.1/§3. persistKey verilirse filtre durumu localStorage'da saklanır ("kayıtlı görünüm"
   hafif hâli — Paperless-ngx saved-views deseni): yenilemede memurun çalışma filtresi korunur. */
import { useEffect, useMemo, useState, useCallback } from "react";
import Fuse from "fuse.js";

// Kalıcı filtre okuma — bozuk/kapalı storage sessizce yok sayılır (filtreler boş başlar).
const persistOku = (key) => {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(`ke-filtre-${key}`) || "null"); } catch { return null; }
};

const RISK_ORDER = { kirmizi: 3, sari: 2, yesil: 1 };
const trLow = (s) => String(s ?? "").toLocaleLowerCase("tr-TR");

// Sıralama alanı erişimcileri (item şekilleri farklı: history/sample/outbox).
const nameOf = (it) => it.name ?? it.label ?? it.konu ?? "";
const birimOf = (it) => it.alici_birim ?? it.hedef_birim ?? "";
const riskOf = (it) => it.bant ?? it.risk ?? "";
const tsOf = (it, dateField) => Number(it[dateField] ?? it.ts ?? 0) || 0;

function compareBy(sortBy, dateField) {
  switch (sortBy) {
    case "ts_asc": return (a, b) => tsOf(a, dateField) - tsOf(b, dateField);
    case "ts_desc": return (a, b) => tsOf(b, dateField) - tsOf(a, dateField);
    case "name_asc": return (a, b) => nameOf(a).localeCompare(nameOf(b), "tr-TR");
    case "name_desc": return (a, b) => nameOf(b).localeCompare(nameOf(a), "tr-TR");
    case "birim_asc": return (a, b) => birimOf(a).localeCompare(birimOf(b), "tr-TR");
    case "risk_desc": return (a, b) => (RISK_ORDER[riskOf(b)] || 0) - (RISK_ORDER[riskOf(a)] || 0);
    case "risk_asc": return (a, b) => (RISK_ORDER[riskOf(a)] || 0) - (RISK_ORDER[riskOf(b)] || 0);
    default: return null;
  }
}

// Yalnız veride GERÇEKTEN görünen değerlerden select option üret (boş kalabalık yok, sıralı).
export function deriveOptions(items, field, labelFn) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const v = it[field];
    if (v == null || v === "" || seen.has(v)) continue;
    seen.add(v);
    out.push({ value: v, label: labelFn ? labelFn(v) : String(v) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "tr-TR"));
}

export function useFilter(items, config) {
  // dataMapping kararlı referans tut → results useMemo gereksiz yeniden-hesaplanmasın.
  const dm = useMemo(() => config?.dataMapping || {}, [config]);
  const persistKey = config?.persistKey;
  // Kayıtlı görünüm: yalnız İLK kurulumda okunur (lazy init) — sonrası normal state akışı.
  const [kayitli] = useState(() => persistOku(persistKey));
  const [search, setSearchState] = useState(kayitli?.search || "");
  const [chips, setChips] = useState(() => {
    const m = {};
    for (const c of config?.chips || []) {
      // Kalıcı veri şekli doğrulanmadan Set'e verilmesin — dizi değilse (bozuk/eski
      // şema kalıntısı) new Set(nonArray) TypeError fırlatıp ilk render'ı çökertirdi.
      const kayitliChip = kayitli?.chips?.[c.id];
      m[c.id] = new Set(Array.isArray(kayitliChip) ? kayitliChip : []);
    }
    return m;
  });
  const [select, setSelectState] = useState(() => {
    const m = {};
    for (const s of config?.select || []) m[s.id] = kayitli?.select?.[s.id] || "";
    return m;
  });
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [sortBy, setSortByState] = useState(kayitli?.sortBy || config?.sort?.default || "ts_desc");

  // Filtre durumu değiştikçe kayıtlı görünümü tazele (Set → dizi; tarih aralığı oturumluk).
  useEffect(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem(`ke-filtre-${persistKey}`, JSON.stringify({
        search,
        chips: Object.fromEntries(Object.entries(chips).map(([k, v]) => [k, [...v]])),
        select, sortBy,
      }));
    } catch { /* storage dolu/kapalı — kalıcılık sessizce devre dışı */ }
  }, [persistKey, search, chips, select, sortBy]);

  const setSearch = useCallback((t) => setSearchState(t), []);
  const toggleChip = useCallback((chipId, value) => {
    setChips((prev) => {
      const next = { ...prev, [chipId]: new Set(prev[chipId]) };
      if (next[chipId].has(value)) next[chipId].delete(value); else next[chipId].add(value);
      return next;
    });
  }, []);
  const setSelect = useCallback((selectId, value) => setSelectState((p) => ({ ...p, [selectId]: value })), []);
  const setDateRange = useCallback((from, to) => { setDateFrom(from); setDateTo(to); }, []);
  const setSortBy = useCallback((k) => setSortByState(k), []);
  const clearAll = useCallback(() => {
    setSearchState("");
    setChips((prev) => { const m = {}; for (const k of Object.keys(prev)) m[k] = new Set(); return m; });
    setSelectState((prev) => { const m = {}; for (const k of Object.keys(prev)) m[k] = ""; return m; });
    setDateFrom(null); setDateTo(null);
    setSortByState(config?.sort?.default || "ts_desc");
  }, [config]);

  const hasActiveFilters = useMemo(() => {
    if (search.trim()) return true;
    for (const s of Object.values(chips)) if (s.size) return true;
    for (const v of Object.values(select)) if (v) return true;
    return dateFrom != null || dateTo != null;
  }, [search, chips, select, dateFrom, dateTo]);

  // Bulanık arama (fuse.js) — config.search.fuzzy açıkken: diakritik/yazım hatası affeder
  // ("dilekce" → "Dilekçe"). Kapalıyken eski birebir-içerir davranışı korunur.
  const fuzzy = !!config?.search?.fuzzy;
  const fuse = useMemo(() => {
    const keys = dm.search || [];
    if (!fuzzy || !keys.length) return null;
    return new Fuse(Array.isArray(items) ? items : [], {
      keys, threshold: 0.34, ignoreLocation: true, minMatchCharLength: 2,
    });
  }, [fuzzy, items, dm]);

  const results = useMemo(() => {
    let src = Array.isArray(items) ? items : [];
    const q = trLow(search.trim());
    const searchFields = dm.search || [];
    if (q && fuse) src = fuse.search(q).map((r) => r.item); // bulanık ön-eleme
    const out = src.filter((it) => {
      // arama (yalnız bulanık mod kapalıyken — açıkken üstte elendi)
      if (q && !fuse && !searchFields.some((f) => trLow(it[f]).includes(q))) return false;
      // çip (çoklu, OR-içi / AND-arası)
      for (const [chipId, set] of Object.entries(chips)) {
        if (set.size && !set.has(it[dm[chipId]])) return false;
      }
      // select (tekli)
      for (const [selId, val] of Object.entries(select)) {
        if (val && it[dm[selId]] !== val) return false;
      }
      // tarih aralığı
      if (dm.dateField && (dateFrom != null || dateTo != null)) {
        const t = tsOf(it, dm.dateField);
        if (dateFrom != null && t < dateFrom) return false;
        if (dateTo != null && t > dateTo) return false;
      }
      return true;
    });
    const cmp = compareBy(sortBy, dm.dateField);
    return cmp ? [...out].sort(cmp) : out;
  }, [items, search, chips, select, dateFrom, dateTo, sortBy, dm, fuse]);

  return {
    filters: { search, chips, select, dateFrom, dateTo, sortBy },
    results,
    counts: { total: (items || []).length, filtered: results.length },
    hasActiveFilters,
    setSearch, toggleChip, setSelect, setDateRange, setSortBy, clearAll,
  };
}
