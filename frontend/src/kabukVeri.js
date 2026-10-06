/* kabukVeri — kabuğun kalıcı kayıt hidrasyonu (DashboardApp'tan ayrıldı; dosya 800 satır sınırı).
   /islemler ve /giden-evrak sorguları + DB snapshot'ını canlı oturum state'iyle BİRLEŞTİREN
   (union) reconcile. Saf yardımcılar (draftsFromHistory, SAMPLE_AD_ID) açılış hidrasyonunda da
   aynı eşlemeyle kullanılır → iki yol tutarlı kalır. */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./lib/authApi.js";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { sampleAdIndex, kuyrukDurumuTuret } from "./lib/kuyrukDurumu.js";

// DB geçmişinden taslak listesi türet: taslağı ÜRETİLMİŞ ve henüz KARAR VERİLMEMİŞ işlemler
// (onaylanmış/reddedilmiş işlemler Giden Evrak'a düşer — burada tekrar taslak sayılmaz;
// Panel'deki "karar bekleyen" tanımıyla birebir aynı süzgeç). Hem açılış hidrasyonunda
// hem de DB reconcile'ında aynı eşleme → iki yol tutarlı kalsın.
// Oturumluk satır id'si sentetiktir (`${Date.now()}-${sıra}-${ad}`) — önbellekten hidre
// edilince db-taslak- öneki bu sentetik id'yi DB islem id'si sanıp yanlış uca gönderiyordu
// (bug avı bulgusu: PATCH/DELETE 404, silinen taslak refresh'te diriliyordu). Önek daima
// GERÇEK islem id'siyle kurulur: result.islem_id (persist merge'i) varsa o, yoksa satır id.
export const draftsFromHistory = (items) =>
  (items || []).filter((x) => x.result?.yazi_taslak_md && !x.result?.onay_durumu).map((x) => ({
    ...x,
    id: `db-taslak-${x.result?.islem_id || x.id}`,
    name: x.name || "Kalıcı taslak",
  }));

// Kayıt kimliği — persist edilince result.islem_id, öncesinde satır id'si (sentetik).
const _kayitAnahtar = (r) => r?.result?.islem_id || r?.id;

// DB reconcile'ı in-session state ile BİRLEŞTİR (union): DB snapshot'ta OLMAYAN (henüz
// persist edilmemiş, islem_id'siz) canlı kayıtları KORU; eşleşenlerde DB gerçeğini al.
// Bug avı 2026-07-23 (CRITICAL): eski `setHistory(items)` tam-değiştirme, mount'ta ateşlenen
// islemlerQ persist penceresinden (~20-27sn) önce dönünce, az önce işlenen evrakı UI'dan
// KALICI siliyordu (islem_id yoktu → snapshot içermiyordu → replace ile kayboluyordu). Persist
// tamamlanınca kayıt islem_id kazanır → sonraki reconcile'da eşleşip DB sürümüne deduplike olur.
const _reconcileBirlestir = (mevcut, dbYeni) => {
  const dbAnahtar = new Set((dbYeni || []).map(_kayitAnahtar));
  const canliEkstra = (mevcut || []).filter((r) => !dbAnahtar.has(_kayitAnahtar(r)));
  return [...canliEkstra, ...dbYeni];
};

// Örnek evrak (dosya adı `${id}.txt` / etiket) → id — kuyruk durumunu DB geçmişinden
// türetmek için (bkz. lib/kuyrukDurumu): gönderilmiş örnek refresh'te kuyruğa GERİ DÜŞMEZ.
export const SAMPLE_AD_ID = sampleAdIndex(SAMPLE_DOCS);

/** Kalıcı kayıtları çeker ve oturum state'ine union ile işler. @returns {{islemlerQ, gidenQ}} */
export function useKaliciKayitlar({ user, setHistory, setDrafts, setProcessedIds, setSentSampleIds, setOutbox }) {
  const islemlerQ = useQuery({
    queryKey: ["islemler", user?.id],
    queryFn: () => apiGet("/islemler?limit=100"),
    enabled: !!user,
  });
  useEffect(() => {
    if (islemlerQ.error) { console.warn("Kalıcı işlem geçmişi alınamadı", islemlerQ.error); return; }
    if (!islemlerQ.data) return;
    const items = Array.isArray(islemlerQ.data.kayitlar) ? islemlerQ.data.kayitlar : [];
    // Union: DB gerçeğini al ama henüz persist edilmemiş canlı kayıtları KORU (bkz. _reconcileBirlestir).
    setHistory((prev) => _reconcileBirlestir(prev, items));
    setDrafts((prev) => _reconcileBirlestir(prev, draftsFromHistory(items)));
    // Kuyruk durumunu DB gerçeğiyle BİRLEŞTİR (union): canlı oturumda işaretlenenler
    // korunur, geçmiş oturumların kararları da yansır → gönderilmiş örnek geri düşmez.
    const { processed, sent } = kuyrukDurumuTuret(items, SAMPLE_AD_ID);
    if (processed.size) setProcessedIds((p) => new Set([...p, ...processed]));
    if (sent.size) setSentSampleIds((s) => new Set([...s, ...sent]));
  }, [islemlerQ.data, islemlerQ.error, setHistory, setDrafts, setProcessedIds, setSentSampleIds]);

  const gidenQ = useQuery({
    queryKey: ["giden-evrak", user?.id],
    queryFn: () => apiGet("/giden-evrak?limit=100"),
    enabled: !!user,
  });
  useEffect(() => {
    if (gidenQ.error) { console.warn("Kalıcı giden evrak alınamadı", gidenQ.error); return; }
    if (!gidenQ.data || !user) return;
    const rows = Array.isArray(gidenQ.data.kayitlar) ? gidenQ.data.kayitlar : [];
    setOutbox(rows.map((r) => ({
      id: r.giden_no || r.id,
      kaynak_evrak_adi: r.kaynak_evrak_adi || "Kalıcı kayıt",
      gonderim_tarihi: Date.parse(r.gonderim_tarihi || "") || Date.now(),
      evrak_turu: r.evrak_turu || "",
      tur: r.yazi_turu_kod || r.tur || "",
      konu: r.konu || "—",
      alici_birim: r.alici_birim || "",
      risk: r.risk || "yesil",
      durum: r.durum || "gonderildi",
      taslak: r.taslak || "",
      memor_adi: user.ad_soyad || "Memur",
      memor_unvan: user.unvan || "",
      son_hash: r.son_hash || "",
      guven: typeof r.guven === "number" ? r.guven : null,
    })));
  }, [gidenQ.data, gidenQ.error, user, setOutbox]);
  return { islemlerQ, gidenQ };
}
