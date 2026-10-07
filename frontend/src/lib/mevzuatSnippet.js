/**
 * Madde-içi arama alıntısı ayrıştırıcı (saf; node --test ile doğrulanır).
 * Backend alıntıyı "Madde 62 — Ödeme emrine itiraz\nBorçlu, …" biçiminde verir: ilk satır
 * madde başlığıdır. Başlık satırı yoksa tüm metin gövdedir; tek satıra yapışık biçim
 * yanlış kesilmesin diye bölünmez.
 * @param {string} snippet
 * @returns {{ baslik: string | null, govde: string }}
 */
export function snippetAyristir(snippet) {
  const s = String(snippet || "");
  const kes = s.indexOf("\n");
  const ilk = kes >= 0 ? s.slice(0, kes) : "";
  const m = ilk.match(/^(?:Ek\s+|Geçici\s+)?Madde\s+\S+\s+[—–-]\s+(.+)$/i);
  if (!m) return { baslik: null, govde: s };
  return { baslik: m[1].trim(), govde: s.slice(kes + 1).trim() };
}
