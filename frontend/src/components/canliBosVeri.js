/* canliBosVeri — İşleniyor BOŞ hâlinin (CanliBosHal) gerçek veri künyesi (tur 8, D-canli).
   Boş masa bir davet olmalı ama uydurma olmamalı: "son işlem" saati ve "bugün işlenen" sayısı
   kabuğun zaten çektiği /islemler sorgusunun react-query önbelleğinden okunur (yeni istek YOK).
   Önbellek boşsa/hatalıysa değer BİLİNMİYOR'dur → null döner, ekranda "—" yazar (00 değil). */
import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sonKayitlar } from "../lib/kabukSicil.js";

const bugunMu = (ts, simdi) => {
  const a = new Date(Number(ts)), b = new Date(simdi);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

function oku(qc) {
  const q = qc.getQueryCache().findAll({ queryKey: ["islemler"] }).find((x) => Array.isArray(x.state.data?.kayitlar));
  return q ? q.state.data.kayitlar : null;
}

/** @returns {{ son: Array<{id, ts, ad}>, bugun: number|null }} — veri yoksa son=[] · bugun=null */
export function useMasaKunyesi(adet = 3) {
  const qc = useQueryClient();
  const abone = useCallback((cb) => qc.getQueryCache().subscribe(cb), [qc]);
  const anlik = useCallback(() => oku(qc), [qc]);
  const kayitlar = useSyncExternalStore(abone, anlik, anlik);
  if (!kayitlar) return { son: [], bugun: null };
  const simdi = Date.now();
  return { son: sonKayitlar(kayitlar, adet), bugun: kayitlar.filter((k) => Number.isFinite(k?.ts) && bugunMu(k.ts, simdi)).length };
}
