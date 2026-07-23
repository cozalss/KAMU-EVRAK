/**
 * Sesli mod — push-to-talk STT (tarayıcı SpeechRecognition) + backend TTS (OpenAI, /sohbet/
 * seslendir) oynatma yardımcıları. `sesliMetneCevir`/`sttDestekleniyorMu` saf/test edilebilir;
 * `sesTanimaOlustur` gerçek tarayıcı API'sine bağlanır (jsdom'da SpeechRecognition yok — o kısım
 * yalnız gerçek tarayıcıda manuel doğrulanır, bkz. ChatbotWidget entegrasyonu).
 */

/**
 * Asistan yanıtındaki hafif markdown'ı (**kalın**, • madde, --- ayraç) TTS'in düzgün
 * okuyabileceği düz metne çevirir — yıldız/madde işareti SESLENDİRİLMEZ.
 * @param {string} md
 * @returns {string}
 */
export function sesliMetneCevir(md) {
  return (md || "")
    .split("\n")
    .map((satir) => {
      const s = satir.trim();
      if (s === "---" || s === "———") return "";
      const maddesiz = s.startsWith("• ") ? s.slice(2) : s;
      return maddesiz.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
    })
    .filter(Boolean)
    .join(". ");
}

/** Tarayıcı SpeechRecognition (STT) destekliyor mu — Chrome/Edge evet, Firefox genelde hayır. */
export function sttDestekleniyorMu() {
  return typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Push-to-talk ses tanıma nesnesi oluşturur (tr-TR, tek-seferlik sonuç). Desteklenmiyorsa
 * null döner (çağıran mikrofon butonunu hiç göstermez — sessiz devre dışı).
 * onAra verilirse anlık (interim) sonuçlar açılır — kullanıcı konuşurken kelimeler canlı akar
 * (sesli görüşmede "canlı" his); verilmezse yalnız kesin sonuç (metin sohbet mikrofonu böyle).
 * @param {{ onSonuc: (metin: string) => void, onAra?: (metin: string) => void, onBitti?: () => void, onHata?: (e: unknown) => void }} handlers
 * @returns {{ start: () => void, stop: () => void } | null}
 */
export function sesTanimaOlustur({ onSonuc, onAra, onBitti, onHata }) {
  if (!sttDestekleniyorMu()) return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const tanima = new Recognition();
  tanima.lang = "tr-TR";
  tanima.interimResults = !!onAra;   // interim yalnız istenirse (opt-in)
  tanima.maxAlternatives = 1;
  tanima.onresult = (e) => {
    let ara = "", son = "";
    const bas = e.resultIndex ?? 0;
    for (let i = bas; i < (e.results?.length ?? 0); i++) {
      const r = e.results[i];
      const t = r?.[0]?.transcript ?? "";
      if (r?.isFinal === false) ara += t; else son += t;   // isFinal undefined → kesin (geriye uyum)
    }
    if (ara.trim() && onAra) onAra(ara.trim());
    if (son.trim()) onSonuc(son.trim());
  };
  tanima.onerror = (e) => onHata?.(e);
  tanima.onend = () => onBitti?.();
  return tanima;
}
