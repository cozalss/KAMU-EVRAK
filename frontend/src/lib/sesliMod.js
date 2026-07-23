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
 * @param {{ onSonuc: (metin: string) => void, onBitti?: () => void, onHata?: (e: unknown) => void }} handlers
 * @returns {{ start: () => void, stop: () => void } | null}
 */
export function sesTanimaOlustur({ onSonuc, onBitti, onHata }) {
  if (!sttDestekleniyorMu()) return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const tanima = new Recognition();
  tanima.lang = "tr-TR";
  tanima.interimResults = false;
  tanima.maxAlternatives = 1;
  tanima.onresult = (e) => {
    const metin = e.results?.[0]?.[0]?.transcript?.trim();
    if (metin) onSonuc(metin);
  };
  tanima.onerror = (e) => onHata?.(e);
  tanima.onend = () => onBitti?.();
  return tanima;
}
