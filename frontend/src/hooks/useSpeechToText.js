/* useSpeechToText — tarayıcı native Web Speech API sarmalayıcısı (sunucu çağrısı YOK,
   internet-kesinti offline yoluna dokunmaz). Sürekli dinler; HER sonuç parçası (ara/kesin)
   onSonuc(metin, { finalMi }) ile bildirilir — çağıran taraf ara-sonucu "canlı" gösterip
   kesinleşince kalıcı hâle getirmekten sorumludur (bkz. BelgeModal.sesSonucu). Desteklenmeyen
   tarayıcıda (örn. Firefox) destekleniyor=false — çağıran taraf mikrofon düğmesini gizler. */
import { useCallback, useEffect, useRef, useState } from "react";

export function useSpeechToText({ lang = "tr-TR", onSonuc } = {}) {
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [dinliyor, setDinliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const tanimaRef = useRef(null);
  // onSonuc her render'da değişebilir (çağıranın kapsadığı state'e erişmesi gerekir) — ref'te
  // tutup en güncelini çağırmak, tanıma nesnesini her seferinde yeniden kurmadan çalışır.
  const onSonucRef = useRef(onSonuc);
  onSonucRef.current = onSonuc;

  useEffect(() => () => tanimaRef.current?.stop(), []);

  const baslat = useCallback(() => {
    if (!SR || dinliyor) return;
    setHata(null);
    const tanima = new SR();
    tanima.lang = lang;
    tanima.continuous = true;
    tanima.interimResults = true;
    tanima.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const parca = e.results[i];
        onSonucRef.current?.(parca[0].transcript, { finalMi: parca.isFinal });
      }
    };
    tanima.onerror = (e) => {
      setHata(
        e.error === "not-allowed" || e.error === "permission-denied" ? "Mikrofon izni reddedildi."
        : e.error === "no-speech" ? "Ses algılanamadı, tekrar deneyin."
        : "Ses tanıma hatası."
      );
      setDinliyor(false);
    };
    tanima.onend = () => setDinliyor(false);
    tanimaRef.current = tanima;
    tanima.start();
    setDinliyor(true);
  }, [SR, lang, dinliyor]);

  const durdur = useCallback(() => { tanimaRef.current?.stop(); }, []);
  const toggle = useCallback(() => (dinliyor ? durdur() : baslat()), [dinliyor, baslat, durdur]);

  return { destekleniyor: !!SR, dinliyor, hata, baslat, durdur, toggle };
}
