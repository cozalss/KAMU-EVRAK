/* panelKaynak — Panel'in veri kaynaklarının DURUMU, react-query önbelleğinden (tur 8).
   Neden: Panel eskiden "SLA yolda" kararını BOŞ DİZİDEN türetiyordu (kuyrukSla=[] + kuyruk
   dolu → iskelet). SLA servisi başarılı ama boş döndüğünde iskelet sonsuza dek "yükleniyor"
   diyordu; giden-evrak 500 dönerken nabız "0 · bugün henüz yok" basıyordu (bilinmeyen değer
   sıfır diye beyan ediliyordu). Artık her kaynak kendi durumunu söyler:
     "bekliyor" (veri yok, hata yok) · "ok" · "bayat" (eski veri + hata) · "yok" (veri yok + hata).
   Sözlük lib/kabukSicil.kaynakDurumu ile AYNI (kenar çubuğu ile Panel aynı sözü söyler). */
import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

function durumOku(qc, anahtar) {
  const sorgular = qc.getQueryCache().findAll({ queryKey: anahtar });
  const veriVar = sorgular.some((q) => q.state.data !== undefined);
  const hata = sorgular.some((q) => q.state.status === "error");
  if (veriVar) return hata ? "bayat" : "ok";
  return hata ? "yok" : "bekliyor";
}

/** Tek kaynağın durumu (string snapshot — useSyncExternalStore için kararlı). */
export function useKaynakDurumu(anahtar) {
  const qc = useQueryClient();
  const kok = anahtar[0];
  const abone = useCallback((cb) => qc.getQueryCache().subscribe(cb), [qc]);
  const oku = useCallback(() => durumOku(qc, [kok]), [qc, kok]);
  return useSyncExternalStore(abone, oku, oku);
}

/** Panel'in üç kaynağı. */
export function usePanelKaynaklari() {
  return {
    sla: useKaynakDurumu(["sla-onizleme"]),
    islemler: useKaynakDurumu(["islemler"]),
    giden: useKaynakDurumu(["giden-evrak"]),
  };
}

export const kaynakHazir = (d) => d === "ok" || d === "bayat";
