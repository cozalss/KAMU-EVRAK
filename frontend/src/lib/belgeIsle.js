/**
 * Sohbette belge işleme yardımcıları — /process_doc yanıtını Görev-1 özetine çevirir.
 *
 * Saf fonksiyonlar (DB/ağ yok) → node --test ile doğrulanır. Widget yalnız bu katmanı
 * çağırır; böylece eşleme mantığı bileşenden ayrı ve test edilebilir kalır.
 */

const _MIN_BELGE_UZUNLUK = 120; // kısa sohbet sorgusu değil, evrak gövdesi eşiği

/**
 * Girdi işlenmeye değer bir belge metni mi? (kısa sorgu → chat; uzun metin → belge işle)
 * @param {string} metin
 * @returns {boolean}
 */
export function belgeMetniMi(metin) {
  return (metin || "").trim().length >= _MIN_BELGE_UZUNLUK;
}

/**
 * /process_doc ProcessResponse → sohbet balonunda gösterilecek Görev-1 özet markdown'ı.
 * Alan yoksa o satır atlanır (uydurma yok). Boş/geçersiz yanıt → dürüst hata satırı.
 * @param {Record<string, unknown>} resp
 * @returns {string}
 */
export function belgeOzetiMd(resp) {
  if (!resp || typeof resp !== "object") return "Belge işlenemedi — boş yanıt.";
  const satir = [`**Belge işlendi** — tür: **${resp.evrak_turu || "belirsiz"}**.`];
  if (resp.ozet) satir.push(`Özet: ${resp.ozet}`);
  const birim = resp.hedef_birim || resp.hedef_kategori || "";
  if (birim) satir.push(`Önerilen birim: **${birim}**`);
  const eksik = Array.isArray(resp.eksik_alanlar) ? resp.eksik_alanlar : [];
  if (eksik.length) satir.push(`Eksik alanlar: ${eksik.join(", ")}`);
  const mevzuat = Array.isArray(resp.mevzuat_onerileri) ? resp.mevzuat_onerileri : [];
  if (mevzuat.length) {
    const baslik = mevzuat.slice(0, 3).map((m) => m.baslik || m.kanun_no || "?").join("; ");
    satir.push(`İlgili mevzuat: ${baslik}`);
  }
  if (resp.yazi_taslak_md) {
    satir.push("✎ Yanıt taslağı üretildi — **Taslaklar** ekranından görüp gönderebilirsiniz.");
  }
  return satir.join("\n");
}

/**
 * /process_doc/stream SSE olayını sınıfla (canlı pipeline akışı). JSX-bağımsız (node etiketi
 * çağıranda çözülür → bu lib node --test ile test edilebilir kalır).
 * @param {Record<string, unknown>} ev
 * @returns {{tip: "node"|"sonuc"|"hata"|"yoksay", node?: string, sonuc?: object, mesaj?: string}}
 */
export function pipelineOlay(ev) {
  if (!ev || typeof ev !== "object") return { tip: "yoksay" };
  if (ev.event === "node" && ev.status === "done") return { tip: "node", node: String(ev.node || "") };
  if (ev.event === "done") return { tip: "sonuc", sonuc: ev.result || {} };
  if (ev.event === "error") return { tip: "hata", mesaj: String(ev.message || "işleme hatası") };
  return { tip: "yoksay" };
}
