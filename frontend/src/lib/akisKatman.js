/* akisKatman — canlı akış ekranının eşzamanlılık katmanı.

   SORUN: ekran 15 adımı düz 01→15 dizisi olarak sunuyordu. Backend grafı bir DAG'dır ve üç
   yerde dallanır; düz liste iki ayrı yanlış üretiyordu:
     (a) paralel adımlar seri gösteriliyordu — mühendislik yapılmış ama vitrinlenmemişti;
     (b) sıra yanlıştı: liste `eksik_tespit`i `decompose`tan önce sayar, oysa graf
         `decompose → eksik_tespit` koşar.
   Ayrıca faz süresi paralel dalları TOPLUYORDU → geçen süre olduğundan uzun görünüyordu.

   ÇÖZÜM: gruplama, koşan grafın kendi kenarlarından hesaplanan katman (superstep)
   haritasından türer. Harita SSE `start` olayıyla gelir (backend `katman_haritasi`), yani
   ENV bayrakları topolojiyi değiştirdiğinde gösterim kendiliğinden düzelir.

   DÜRÜSTLÜK KURALI: harita yoksa VEYA eksikse hiçbir paralellik İDDİA EDİLMEZ — düz listeye
   düşülür. Yarım bilgiyle "bunlar aynı anda koştu" demek, hiç söylememekten kötüdür. */
import { nodeDurationMs } from "./pipelinePhases.js";

/* YEDEK HARİTA YOKTUR — bilerek. Bir ara burada varsayılan ENV topolojisini yansıtan sabit
   bir `VARSAYILAN_KATMAN` duruyordu. İki sebeple kaldırıldı:
     · Tüketicisi kalmadı: örnek (JSON) yolu da aynı SSE akışından geçiyor (usePipeline
       `runSample` metni bir .txt File'a sarıp `streamRun`e veriyor) → her gerçek koşumda
       backend haritası zaten geliyor.
     · Yalan kaynağıydı: `VITRIN_MODU=1` gibi farklı ENV'de sabit harita başka bir topolojiyi
       anlatıyordu ve TAM olduğu için "eksik harita → düz listeye düş" emniyeti devreye
       girmiyordu; koşum başlamadan ekranda yanlış bir eşzamanlılık tahmini çiziliyordu.
   Harita gelene kadar paralellik İDDİA EDİLMEZ (katmanlar=null → düz liste). */

/* OCR motorunun ADI, gerçekten tarama yapılıp yapılmadığını söyler: bu üçünde belgede
   hazır metin katmanı vardır ve hiçbir tanıma motoru koşmaz (multimodal/ocr.py). */
const METIN_MOTORLARI = new Set(["text-plain", "pdf-text", "docx-text"]);

/** Adımları GERÇEK çalışma sırasında, eşzamanlı olanları tek grupta döndür.
 *
 * @param {Array<{id:string}>} nodes  gösterilecek düğümler (görünme sırasında)
 * @param {Object<string,number>|null} katmanlar  node → superstep; SSE `start`ten gelir
 * @returns {Array<{katman:number|null, paralel:boolean, items:Array}>}
 *
 * Harita eksikse (bir düğümün katmanı yoksa) gruplama YAPILMAZ: her düğüm kendi grubunda,
 * girdi sırasında döner — mevcut düz davranışla birebir aynı.
 */
export function katmanGruplari(nodes, katmanlar) {
  const liste = Array.isArray(nodes) ? nodes : [];
  if (!liste.length) return [];
  const tam = katmanlar && liste.every((x) => Number.isFinite(katmanlar[x?.id]));
  if (!tam) return liste.map((x) => ({ katman: null, paralel: false, items: [x] }));

  // Katman artan; eşit katmanda girdi sırası korunur (kararlı gösterim).
  const sirali = liste
    .map((x, i) => ({ x, i, k: katmanlar[x.id] }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i));
  const gruplar = [];
  for (const { x, k } of sirali) {
    const son = gruplar[gruplar.length - 1];
    if (son && son.katman === k) son.items.push(x);
    else gruplar.push({ katman: k, paralel: false, items: [x] });
  }
  return gruplar.map((g) => ({ ...g, paralel: g.items.length > 1 }));
}

/** Adım koştu ama yapacak işi YOKTU mu? (yeşil tik hak etmeyen adım)
 *
 * Yalnız TAMAMLANMIŞ adım için ve yalnız veriye dayanarak karar verilir — veri yoksa
 * "gerekmedi" İDDİA EDİLMEZ (yokluktan olumlu iddia türetilmez).
 *   · oku       → belgede hazır metin katmanı vardı, hiçbir OCR motoru koşmadı
 *   · decompose → ≥2 talep zenginleştirilmedi; bu adım LLM ÇAĞIRMAZ (talep kümesini cikar
 *                 çıkarır, LLM emeği orada görünür) → backend `ayristirma_denendi=false` der
 */
export function gerekmediMi(node) {
  if (!node || node.status !== "done") return false;
  const d = node.data;
  if (!d) return false;
  if (node.id === "oku") return METIN_MOTORLARI.has(d.engine);
  // decompose: karar backend'in `ayristirma_denendi` bayrağına aittir (2026-10: node LLM
  // çağırmaz; true yalnız ≥2 alt talep zenginleştirildiğinde). Boş listeden çıkarım YAPILMAZ.
  // Alan yoksa (eski yük — o sürümde node kendi LLM çağrısını yapıyordu) "gerekmedi" İDDİA
  // EDİLMEZ: gerçek bir çağrıyı "iş yapılmadı" diye göstermektense susmak doğrudur.
  if (node.id === "decompose") return d.ayristirma_denendi === false;
  return false;
}

/** Adım GERÇEKTEN koştu mu? (`atlandi` = akış başka dala saptı, bu adım hiç çalışmadı) */
export const kostuMu = (node) => node?.status === "done";

/** Adımın memura gösterilecek nihai durumu — TEK karar noktası.
 *
 *   calisti   — koştu ve iş üretti (yeşil tik)
 *   gerekmedi — koştu ama yapacak işi yoktu (gri tire)
 *   atlandi   — HİÇ koşmadı; akış koşullu dalda başka yere gitti (gri eğik çizgi)
 *   hata · isleniyor · bekliyor
 *
 * `atlandi` neden şart: backend akışın BAŞINDA tüm olası adımları duyurur (hangi koşullu
 * dalın seçileceğini o an bilemez). Bunlar eskiden koşum bitince topluca "done" işaretleniyordu
 * → dur-ve-sor dalında hiç çalışmamış 7 adım yeşil tik alıyordu (2026-08-12 ölçümü).
 */
export function adimDurumu(node) {
  const st = node?.status;
  if (st === "error") return "hata";
  if (st === "atlandi") return "atlandi";
  if (st === "active") return "isleniyor";
  if (st !== "done") return "bekliyor";
  return gerekmediMi(node) ? "gerekmedi" : "calisti";
}

/** Akış terminal (`done`) olayında düğüm durumlarını kapat — SAF, test edilebilir kural.
 *
 * Backend akışın BAŞINDA tüm olası adımları duyurur; hangi koşullu dalın seçileceğini o an
 * bilemez. Üç ayrı son vardır ve üçü FARKLI şey söyler:
 *   · `active`  → gerçekten başlamıştı, akış kapandı           → `done`
 *   · `active`  + koşum DURAKLADI → interrupt'ta duran adım     → `pending` (bekliyor)
 *   · `pending` + koşum BİTTİ    → o dal hiç seçilmedi          → `atlandi`
 *   · `pending` + koşum DURAKLADI (memur onayı bekleniyor)      → `pending` KALIR
 *
 * Üçüncü ayrım canlı ölçümle bulundu (2026-08-12, sarı bantta HITL): onay bekleyen koşumda
 * `onay_kapisi`/`denetim_izi`/`finalize` henüz koşmamıştır ama ATLANMAMIŞTIR da — memur
 * karar verince koşacaklardır. Onlara "bu koşumda çalışmadı" demek, "tamamlandı" demek
 * kadar yanlış olurdu; doğru cevap "sırada".
 *
 * Backend her node BAŞLARKEN `active` yayar (2026-10, LangGraph `tasks` modu). Onay
 * kapısı başlar, interrupt'ta durur ve `done` yaymaz → duraklamada `active` kalan adım
 * bitmemiştir; "tamamlandı" demek memur karar vermeden kararı varsaymak olurdu.
 *
 * @param {Array} nodes         mevcut düğümler
 * @param {number} t            koşum başına göreli kapanış damgası
 * @param {{duraklatildi?: boolean}} opt  duraklatildi = memur onayı bekleniyor
 */
export function kapanisDurumlari(nodes, t, { duraklatildi = false } = {}) {
  return (Array.isArray(nodes) ? nodes : []).map((n) => {
    if (n?.status === "active") return duraklatildi
      ? { ...n, status: "pending" }
      : { ...n, status: "done", t0: n.t0 ?? t, t1: t };
    if (n?.status === "pending" && !duraklatildi) return { ...n, status: "atlandi" };
    return n;
  });
}

/** Eşzamanlı grubun süresi = EN UZUN dal (toplam değil). Hiç ölçüm yoksa null. */
export function grupSuresiMs(items) {
  const olculen = (items || [])
    .map((a) => nodeDurationMs(a))
    .filter((ms) => Number.isFinite(ms));
  return olculen.length ? Math.max(...olculen) : null;
}

/** Akışın geçen süresi: gruplar arası TOPLAM, grup içi EN UZUN. Hiç ölçüm yoksa null. */
export function akisSuresiMs(gruplar) {
  let toplam = null;
  for (const g of gruplar || []) {
    const ms = grupSuresiMs(g.items);
    if (ms != null) toplam = (toplam || 0) + ms;
  }
  return toplam;
}

/** Eşzamanlı bloğun GERÇEKTEN üst üste binen üyeleri (canlı koşum için).
 *
 * Backend her adım BAŞLARKEN `active` yayar → usePipeline o an `t0`, bitişte `t1` damgalar.
 * İki üyenin [t0, t1) aralığı kesişiyorsa ikisi aynı anda çalışmıştır — bu bir OLGU, katman
 * haritasından TAHMİN değil. Hâlâ çalışan üyenin aralığı açıktır (t1 = +∞). Hiç başlamamış
 * (`pending`/`atlandi`) ya da damgasız üye sayılmaz.
 *
 * @param {Array<{status:string, t0?:number, t1?:number}>} items  bir katmanın üyeleri
 * @returns {Array} en az bir başka üyeyle kesişen üyeler (girdi sırasında)
 */
export function ortusenAdimlar(items) {
  const basladi = (items || []).filter((a) => ["active", "done", "error"].includes(a?.status) && Number.isFinite(a.t0));
  const son = (a) => (a.status === "active" || !Number.isFinite(a.t1) ? Infinity : a.t1);
  return basladi.filter((a) => basladi.some((b) => b !== a && a.t0 < son(b) && b.t0 < son(a)));
}

/** Koşum hata ile DURDUYSA akışın kesildiği masa — hatadan sonra hiç başlamamış ilk adımın
 * sırası (`sira`). Hata yoksa null. Sahne bu masayı "kesildi", sonrakileri "işlenmedi"
 * gösterir; hiçbiri tamamlandı/atlandı DEĞİLDİR (CLAUDE.md §9). */
export function kesimSirasi(display) {
  const liste = Array.isArray(display) ? display : [];
  if (!liste.some((a) => a?.status === "error")) return null;
  const ilk = liste.find((a) => a?.status === "pending");
  return ilk && Number.isFinite(ilk.sira) ? ilk.sira : null;
}

/** SSE `error` olayında düğüm durumlarını kapat — SAF, test edilebilir kural.
 *
 * Backend (2026-10) hangi adımda durduğunu (`ev.node`) ve o an eşzamanlı koşup yarıda
 * kalan kardeşleri (`ev.kesilen`) söyler. Patlayan adım `error`; kesilen kardeş HATA
 * DEĞİLDİR (kendisi başarısız olmadı, koşumu kesildi) → `pending` ("işlenmedi"), başarı
 * sayısına da girmez. Adım bilgisi yoksa ya da duyurulmamış bir ad gelirse hangi adımın
 * patladığı UYDURULMAZ: eski davranış — o an koşan her adım `error`.
 */
export function hataDurumlari(nodes, ev, t) {
  const liste = Array.isArray(nodes) ? nodes : [];
  const hatali = ev?.node;
  const bilinir = hatali && liste.some((n) => n?.id === hatali);
  const kesilen = new Set(Array.isArray(ev?.kesilen) ? ev.kesilen : []);
  return liste.map((n) => {
    if (bilinir) {
      if (n.id === hatali) return { ...n, status: "error", t1: t };
      if (n.status === "active" || kesilen.has(n.id)) return n.status === "done" ? n : { ...n, status: "pending" };
      return n;
    }
    return n.status === "active" ? { ...n, status: "error", t1: t } : n;
  });
}

/** Hata çubuğu metni: adım biliniyorsa etiketiyle ("Doğrula adımında durdu — …"). */
export function hataMesaji(nodes, ev) {
  const mesaj = ev?.message || "İşleme hatası";
  const adim = ev?.node && (Array.isArray(nodes) ? nodes : []).find((n) => n?.id === ev.node);
  return adim ? `${adim.label} adımında durdu — ${mesaj}` : mesaj;
}
