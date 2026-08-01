/* ekranBaglami — "asistan ekranı takip etsin": kullanıcının O AN gördüğü şeyin sunucuya
   gönderilebilir, KÜÇÜK ve maskelenmiş özeti.

   Neden var: kullanıcı "bu evrak ne?", "buradaki risk neden kırmızı?", "şu listede kaç tane
   var?" diye sorduğunda asistanın DB'ye gidip aramasına gerek kalmasın — cevap zaten ekranda.
   Bu, bir tur içinde araç çağrısı + LLM niyet turu KADAR gecikme siler.

   İki sert kural:
   1. BÜTÇE: bağlam prompt'a giriyor; sınırsız büyürse hem gecikme hem maliyet artar. Her alan
      ayrı ayrı kırpılır (aşağıdaki sabitler) — backend şeması da aynı sınırları DOĞRULAR,
      yani istemciye güvenilmez, burada kırpmak yalnız ağ/token israfını önler.
   2. PII: ham evrak metni GÖNDERİLMEZ. Yalnız zaten türetilmiş üst-veri (tür, birim, bant,
      dosya adı, sayılar) taşınır; serbest metin alanı özet ile sınırlıdır ve backend
      mask_for_llm'den geçirir.
*/

// Alan bütçeleri — backend EkranBaglam şemasıyla BİREBİR aynı olmalı (ikisi de değişirse
// birlikte değişsin; backend sınırı aşan isteği reddeder, sessizce kırpmaz).
export const SINIR = { baslik: 120, ad: 160, ozet: 600, metin: 60, liste: 8 };

const kirp = (deger, sinir) => {
  const s = String(deger ?? "").replace(/\s+/g, " ").trim();
  return s.length > sinir ? `${s.slice(0, sinir)}…` : s;
};

// Görünüm kodu → kullanıcının gördüğü başlık. Asistan "Taslaklar ekranındasın" diyebilsin diye
// koda değil ADA çevrilir (LLM'e kod sızdırmak teknik terim kaçağı üretiyordu).
const GORUNUM_ADI = {
  panel: "Panel (genel durum)",
  islenen: "İşlenen evrak arşivi",
  gelen: "Gelen evrak kuyruğu",
  isleniyor: "İşleniyor (canlı ajan akışı)",
  taslaklar: "Taslaklar (karar bekleyen yazılar)",
  giden: "Giden evrak arşivi",
  mevzuat: "Mevzuat kataloğu",
  denetim: "Denetim izi",
};

export function gorunumAdi(gorunum) {
  return GORUNUM_ADI[gorunum] || kirp(gorunum, 40) || "Bilinmeyen ekran";
}

/* Bir kaydın kullanıcıya GÖRÜNEN başlığı. Tek kaynak: ekran bağlamı ve sesli komut eşleşmesi
   AYNI başlığı görmeli, yoksa asistan "aç" dediğin kaydı bulamaz. Gelen evrak örnekleri
   `label`/`konu` taşır (lib/sampleDocs), işlenen/taslak kayıtları `name`/`dosya_adi`. */
export function baslikAl(kayit) {
  const r = kayit?.result || kayit || {};
  return kayit?.name || kayit?.ad || r.dosya_adi || kayit?.baslik || kayit?.label || kayit?.konu || "";
}

/* Tek evrak kartının bağlam satırı — yalnız türetilmiş üst-veri (ham metin YOK). */
export function evrakOzeti(kayit) {
  if (!kayit) return null;
  const r = kayit.result || kayit;
  const alanlar = {
    ad: kirp(baslikAl(kayit), SINIR.ad),
    tur: kirp(r.evrak_turu, SINIR.metin),
    birim: kirp(r.hedef_birim || r.hedef_kategori, SINIR.ad),
    bant: kirp(r.risk_metadata?.bant || kayit.bant, SINIR.metin),
    ozet: kirp(r.ozet || r.yonetici_ozeti, SINIR.ozet),
    durum: kirp(kayit.onay_durumu || r.onay_durumu, SINIR.metin),
  };
  // Boş alan taşıma: prompt'ta "tur: " gibi yarım satırlar modeli yanıltıyor.
  const dolu = Object.fromEntries(Object.entries(alanlar).filter(([, v]) => v));
  return Object.keys(dolu).length ? dolu : null;
}

/* Ekranda görünen listenin BAŞLIKLARI — kaç tane var + ilk birkaçı (hepsi değil: bütçe). */
export function listeOzeti(kayitlar) {
  const dizi = Array.isArray(kayitlar) ? kayitlar : [];
  if (!dizi.length) return null;
  return {
    adet: dizi.length,
    ilkler: dizi.slice(0, SINIR.liste)
      .map((k) => kirp(baslikAl(k), SINIR.ad))
      .filter(Boolean),
  };
}

/* Asistana gönderilecek nihai bağlam. Hiçbir anlamlı alan yoksa null döner — boş bir
   "ekran" nesnesi göndermek prompt'a gürültüden başka bir şey eklemez. */
export function ekranBaglamiOlustur({ gorunum, secili, liste, notlar } = {}) {
  const baglam = {
    gorunum: gorunumAdi(gorunum),
    secili: evrakOzeti(secili),
    liste: listeOzeti(liste),
    notlar: kirp(notlar, SINIR.baslik) || undefined,
  };
  const anlamli = baglam.secili || baglam.liste || baglam.notlar;
  if (!anlamli && !gorunum) return null;
  return JSON.parse(JSON.stringify(baglam));   // undefined alanları at (JSON gövdesi temiz kalsın)
}
