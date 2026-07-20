/* taslakId — taslak satır id'sinden DB islem id çözümü (saf, node --test'li).
   Bağlam: taslak kuyruğunda iki id kaynağı yaşar —
   · DB'den hidre: `db-taslak-<islem_uuid>` (draftsFromHistory öneki)
   · Oturumluk (canlı koşum): `${Date.now()}-${sıra}-${dosyaAdı}` sentetik satır id'si
   Önbellekten hidre edilen OTURUM satırları da db-taslak- öneki aldığından, önekten
   ayıklanan kısım sentetik olabilir; bunu DB islem id'si sanmak PATCH/DELETE'i yanlış
   uca gönderiyordu (bug avı bulgusu: 404, silinen taslak refresh'te diriliyordu).
   Kural: result.islem_id (persist merge'i) DAİMA birincil; önek kalıntısı yalnız
   sentetik desene uymuyorsa kullanılır. */

// Sentetik oturum id deseni: 13 hane epoch + "-" + sıra + "-" + ad.
export const SENTETIK_ID = /^\d{13}-\d+-/;

export const islemIdCoz = (id, draft) => {
  const ek = String(id).startsWith("db-taslak-") ? String(id).slice("db-taslak-".length) : null;
  return draft?.result?.islem_id || (ek && !SENTETIK_ID.test(ek) ? ek : null);
};
