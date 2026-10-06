/* belgeModalDikte — BelgeModal'ın sesle dikte kancası (BelgeModal.jsx'ten ayrıldı: fonksiyon
   bütçesi). Davranış birebir korunur.

   "Canlı bölge" (liveRef) konuşulan ama henüz kesinleşmemiş metnin kâğıttaki aralığını tutar:
   her ara-sonuç o aralığı günceller (konuştukça kâğıda akar), kesinleşince aralık kalıcı metne
   dönüşür ve bir sonraki cümle için sıfırlanır. Dikte başlarken (mic düğmesine ilk basışta)
   imleç konumu yakalanır (`baslat`); sonrasında aralık kendi kendini ilerletir.

   NOT: setMetinD fonksiyonel updater olarak ÇAĞRILMAZ — StrictMode updater'ları iki kez
   çağırır; updater içinde liveRef gibi bir yan etki olsaydı imleç yanlış konuma sıçrardı.
   Aynı `onresult` olayı ≥2 parça taşıyabilir (final + ara): iki senkron çağrı da render
   kapanışındaki AYNI metni okursa ikincisi ilkinin kesinleşen cümlesini ezerdi (dikte kaybı).
   Çözüm: metnin senkron ref aynası (metinDRef) — olay içi ardışık çağrılar günceli okur. */
import { useEffect, useRef } from "react";
import { useSpeechToText } from "../hooks/useSpeechToText.js";

export function useDikte({ metinD, setMetinD, alanRef, onDegis }) {
  const liveRef = useRef({ start: 0, len: 0 });
  const metinDRef = useRef(metinD);
  useEffect(() => { metinDRef.current = metinD; });   // elle yazım dahil her commit'te aynala

  const sesSonucu = (parca, { finalMi }) => {
    if (!parca.trim() && !finalMi) return;
    const kaynakMetin = metinDRef.current;
    const { start, len } = liveRef.current;
    const b = Math.min(start, kaynakMetin.length);
    const s = Math.min(b + len, kaynakMetin.length);
    const bosluk = len === 0 && b > 0 && !/\s/.test(kaynakMetin[b - 1] || "") ? " " : "";
    const ekIcerik = finalMi ? `${bosluk}${parca.trim()} ` : `${bosluk}${parca}`;
    liveRef.current = finalMi ? { start: b + ekIcerik.length, len: 0 } : { start: b, len: ekIcerik.length };
    const yeniMetin = kaynakMetin.slice(0, b) + ekIcerik + kaynakMetin.slice(s);
    metinDRef.current = yeniMetin;
    setMetinD(yeniMetin);
    onDegis?.();
    // İmleci canlı bölgenin sonuna taşı — konuştukça imleç metnin ardından ilerler.
    const konum = liveRef.current.start + liveRef.current.len;
    requestAnimationFrame(() => {
      const el = alanRef.current;
      el?.focus();
      el?.setSelectionRange(konum, konum);
    });
  };
  const stt = useSpeechToText({ lang: "tr-TR", onSonuc: sesSonucu });

  /* Mic düğmesi: dinlemiyorsa imleç konumunu yakalayıp başlatır; dinliyorsa durdurur. */
  const degistir = () => {
    if (!stt.dinliyor) {
      const el = alanRef.current;
      const metin = metinDRef.current;
      const pos = Math.min(el ? el.selectionStart : metin.length, metin.length);
      liveRef.current = { start: pos, len: 0 };
    }
    stt.toggle();
  };
  return { stt, degistir };
}
