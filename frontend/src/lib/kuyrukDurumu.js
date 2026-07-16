/* Gelen Evrak kuyruk durumunu KALICI kayıttan (DB /islemler) türetir.
   Sorun: processedIds/sentSampleIds yalnız oturum state'iydi — sayfa yenilenince
   gönderilmiş örnek evrak kuyruğa GERİ düşüyordu. DB'deki islem kayıtları örnek
   evraka iki isimle bağlanır: baslik=`${id}.txt` (backend persist, usePipeline
   runSample'ın verdiği dosya adı) ve name=label (oturum geçmişi kayıtları).
   onay_durumu dolu (onaylandi/reddedildi/duzenlendi) = karar verilmiş → gönderilmiş. */

/** SAMPLE_DOCS → (dosya adı | etiket) → örnek id eşleme indeksi.

    "ornek-<id>.txt" güncel ad (usePipeline runSample); "<id>.txt" ESKİ kayıtlar için
    korunur (516 mevcut islem bu adla persist edildi) — bilinen kalıntı: kullanıcı birebir
    "dilekce.txt" adlı KENDİ dosyasını yüklerse eski-ad eşlemesi yanlış-pozitif verebilir;
    yeni koşumlar önek sayesinde çakışmaz. */
export const sampleAdIndex = (sampleDocs) => {
  const idx = new Map();
  for (const s of sampleDocs || []) {
    if (!s?.id) continue;
    idx.set(`ornek-${s.id}.txt`, s.id);
    idx.set(`${s.id}.txt`, s.id);
    if (s.label) idx.set(s.label, s.id);
  }
  return idx;
};

/** İşlem geçmişinden { processed, sent } Set'lerini türet (örnek-dışı kayıtlar yok sayılır). */
export const kuyrukDurumuTuret = (items, adIndex) => {
  const processed = new Set();
  const sent = new Set();
  for (const x of items || []) {
    const sid = adIndex.get(x?.name);
    if (!sid) continue;
    processed.add(sid);
    if (x?.result?.onay_durumu) sent.add(sid);
  }
  return { processed, sent };
};
