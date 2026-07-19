/* useAktifKurum — demo kurumu ayarı (localStorage-kalıcı, oturumlar arası korunur).
   19 Tem revizyon: sabit tek-tenant ZORUNLU DEĞİL — her demo senaryosu kendi aktif
   kurumunu seçebilir (ör. Odunpazarı örneğiyle çalışırken aktif kurumu Odunpazarı
   Belediye Başkanlığı yapmak, o senaryoyu happy-path'e döndürür). Backend'e her
   koşumda `aktif_kurum` alanıyla geçirilir; boşsa backend env KURUM_ADI'ya düşer. */
import { useCallback, useState } from "react";

const KEY = "ke-aktif-kurum";
export const VARSAYILAN_AKTIF_KURUM = "Örnekşehir Belediye Başkanlığı";

export function useAktifKurum() {
  const [aktifKurum, setAktifKurumState] = useState(() => {
    try { return localStorage.getItem(KEY) || VARSAYILAN_AKTIF_KURUM; }
    catch { return VARSAYILAN_AKTIF_KURUM; }
  });

  const setAktifKurum = useCallback((deger) => {
    const temiz = String(deger || "").trim().slice(0, 200) || VARSAYILAN_AKTIF_KURUM;
    setAktifKurumState(temiz);
    try { localStorage.setItem(KEY, temiz); } catch { /* özel mod — tercih oturumluk kalır */ }
  }, []);

  return [aktifKurum, setAktifKurum];
}
