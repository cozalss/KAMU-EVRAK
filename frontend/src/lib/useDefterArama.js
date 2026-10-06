/* useDefterArama — evrak defterlerinin arama katmanı (lib/defterArama üstünde).

   useFilter'ın (paylaşılan çekirdek; Taslaklar/Denetim de kullanır) çip/seçim/sıralama
   işi aynen kalır; yalnız ARAMA buraya alınır: fuse.js'in tüm sorguyu tek bulanık desen
   sayması anlamsız sorguya sonuç döndürüyordu (jüri tur 6). Dönen nesne useFilter çıktısının
   aynı şeklidir (FilterBar ikisini ayırt etmez) + `jetonlar` (satırda vurgu için).

   Kalıcılık: arama metni kullanıcıya özel anahtarla saklanır (persistKey yoksa saklanmaz —
   kiosk tarayıcıda başka memurun araması sızmasın). Erişim hatası sessizce yok sayılır. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { defterAra, jetonlar as jetonla } from "./defterArama.js";

const anahtar = (k) => (k ? `ke-filtre-${k}-ara` : null);
const oku = (k) => { if (!k) return ""; try { return localStorage.getItem(anahtar(k)) || ""; } catch { return ""; } };

/**
 * @param {object} filter useFilter çıktısı (search alanı KULLANILMAZ)
 * @param {{metinOf:(it:object)=>string, noOf?:(it:object)=>string, persistKey?:string}} secenek
 */
export function useDefterArama(filter, { metinOf, noOf, persistKey }) {
  const [q, setQ] = useState(() => oku(persistKey));
  useEffect(() => {
    if (!persistKey) return;
    try { localStorage.setItem(anahtar(persistKey), q); } catch { /* storage kapalı — kalıcılık yok */ }
  }, [persistKey, q]);
  // useFilter'ın eski kayıtlı araması (fuse dönemi) görünmez bir süzgeç olarak kalmasın.
  const eskiArama = filter.filters.search;
  const { setSearch } = filter;
  useEffect(() => { if (eskiArama) setSearch(""); }, [eskiArama, setSearch]);

  const results = useMemo(() => defterAra(filter.results, q, metinOf, noOf), [filter.results, q, metinOf, noOf]);
  const js = useMemo(() => jetonla(q), [q]);
  const { clearAll: tabanTemizle } = filter;
  const clearAll = useCallback(() => { tabanTemizle(); setQ(""); }, [tabanTemizle]);
  return useMemo(() => ({
    ...filter,
    filters: { ...filter.filters, search: q },
    setSearch: setQ,
    results,
    counts: { ...filter.counts, filtered: results.length },
    hasActiveFilters: filter.hasActiveFilters || !!q.trim(),
    clearAll,
    jetonlar: js,
  }), [filter, q, results, clearAll, js]);
}
