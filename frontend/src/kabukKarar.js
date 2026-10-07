/* kabukKarar — memur kararının (onay/ret/düzenle) DB'ye kalıcı yazımı + persist penceresi kuyruğu.
   DashboardApp'ten ayrıldı (tur 8, dosya < 800 satır kuralı); davranış BİREBİR aynı. */
import { useCallback, useRef } from "react";
import { apiPost } from "./lib/authApi.js";

export function useKararKaydi({ queryClient, showToast, setOutbox }) {
  // done→persist arası (~20-27 sn soğuk Supabase) islem_id henüz yok — bu pencerede verilen
  // karar eskiden SESSİZCE DB'siz kalıyordu (adversarial-verify bulgusu: 2. refresh'te evrak
  // kuyruğa geri düşüyordu). Artık karar beklemeye alınır; persist merge'i gelince yazılır.
  const bekleyenKararRef = useRef(new Map());   // result → secim
  // Seçilen tür + metin de gönderilir: memur tür kutucuğuyla taslağı değiştirdiyse
  // DB'deki taslak karar anında güncellenir → kalıcı kayıt gönderilen içeriği yansıtır.
  const persistDecision = useCallback(async (res, secim) => {
    if (!res) return;
    if (!res.islem_id) { bekleyenKararRef.current.set(res, secim); return; }
    try {
      const yanit = await apiPost(`/islem/${encodeURIComponent(res.islem_id)}/onayla`, {
        secim, yazi_turu: res.yazi_turu || "", metin: res.yazi_taslak_md || "",
      });
      // Gerçek resmî numara: optimistik satırın geçici numarasını DB'nin giden_no'suyla
      // değiştir (islem_id eşleşmesi; persist-penceresi akışında islem_id'siz açılan satır
      // için en yeni numarasız satıra düşülür). Ardından giden listesi DB gerçeğiyle tazelenir.
      if (yanit?.giden_no) {
        setOutbox((o) => {
          const hedef = o.find((x) => x.islem_id === res.islem_id)
            || o.find((x) => !x.islem_id);
          return hedef ? o.map((x) => (x === hedef
            ? { ...x, id: yanit.giden_no, islem_id: res.islem_id, numaraBekliyor: false } : x)) : o;
        });
        queryClient.invalidateQueries({ queryKey: ["giden-evrak"] });
      }
    } catch (err) {
      console.warn("Onay/giden evrak DB'ye yazılamadı", err);
      showToast("Evrak oturumda görünüyor; DB onay kaydı yazılamadı.");
    }
  }, [queryClient, showToast, setOutbox]);

  // Çok-konulu alt-talep kararı için persist — ana akıştaki persistDecision ile AYNI
  // done→persist yarışı koruması. islem_id henüz yoksa (~20-27 sn Supabase gecikmesi) karar
  // beklemeye alınır, persist merge'i gelince yazılır. Eskiden alt-talep yolu bu ağa BAĞLI
  // DEĞİLDİ: islem_id null'ken apiPost hiç denenmiyor ama başarı toast'ı + outbox commit
  // yapılıyordu → karar sessizce DB'siz kalıyor, refresh'te audit izinden düşüyordu (bug avı).
  const bekleyenAltKararRef = useRef(new Map());   // result → [{secim, sira, tur, metin}]
  const persistAltKarar = useCallback((res, karar) => {
    if (!res) return;
    if (!res.islem_id) {
      const liste = bekleyenAltKararRef.current.get(res) || [];
      liste.push(karar);
      bekleyenAltKararRef.current.set(res, liste);
      return;
    }
    apiPost(`/islem/${encodeURIComponent(res.islem_id)}/alt-talep/${karar.sira}/onayla`, {
      secim: karar.secim, yazi_turu: karar.tur || "", metin: karar.metin || "",
    }).then(() => queryClient.invalidateQueries({ queryKey: ["giden-evrak"] }))
      .catch((err) => {
        console.warn("Birim kararı DB'ye yazılamadı", err);
        showToast("Evrak oturumda görünüyor; birim kararı DB'ye yazılamadı.");
      });
  }, [queryClient, showToast]);

  return { bekleyenKararRef, bekleyenAltKararRef, persistDecision, persistAltKarar };
}
