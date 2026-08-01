/* sesliKomut — söylenen cümleyi ÖNCE deterministik bir KOMUT olarak dener.

   Neden LLM'e sormuyoruz: "taslaklara geç" bir soru değil, bir emirdir. LLM'e sormak
   ölçülmüş 2-3 saniye (model turu) + seslendirme demek; oysa karar sabit bir sözcük
   kümesiyle verilebiliyor. Eşleşme olursa tur AĞA HİÇ ÇIKMAZ → komut anında uygulanır.
   Eşleşme yoksa {tur:"yok"} döner ve normal LLM yolu işler (deponun her yerindeki
   "deterministik birincil, LLM yedek" deseni).

   İKİ SERT KURAL:
   1. SORU ASLA KOMUT SAYILMAZ. "gelen evrakta kaç tane var?" ekranı değiştirmemeli —
      kullanıcı bilgi istiyor, gezinme değil. Soru işareti sesli girdide YOKTUR, bu yüzden
      soru sözcükleriyle ayırt edilir.
   2. BELİRSİZLİK VARSA KOMUT YOK. İki evrak başlığı aynı skorla eşleşiyorsa hiçbiri
      açılmaz — yanlış evrağı açmak, açmamaktan kötüdür (kullanıcı yanlış belgeye bakıp
      karar verebilir).
*/

// Türkçe harf-katlama (muzakere.js'teki desenle aynı): tr-TR küçültme + aksan sadeleştirme.
// tr-TR ZORUNLU: varsayılan locale "İ" harfini "i̇" yapar ve eşleşmeler sessizce kaçar.
const trKatla = (s) => String(s ?? "")
  .toLocaleLowerCase("tr-TR")
  .replace(/ö/g, "o").replace(/ü/g, "u").replace(/ç/g, "c")
  .replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ı/g, "i")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

/* Görünüm komutları — kod, sesli onay cümlesi ve kalıplar. Kalıplar KATLANMIŞ yazılır.
   KÖK kullanılır ("gelen evra"), tam sözcük değil: Türkçe ünsüz yumuşamasıyla "evrak"
   çekimlenince "evrağı/evrağa" olur ve katlanınca "evragi/evraga" verir — "gelen evrak"
   kalıbı bunların HİÇBİRİNİ yakalamaz (ilk testte tam da bu kaçtı). */
export const GORUNUM_KOMUTLARI = [
  { kod: "gelen", ad: "Gelen evrak", kaliplar: ["gelen evra", "gelen kutusu", "gelenler"] },
  { kod: "islenen", ad: "İşlenen evrak", kaliplar: ["islenen evra", "islenenler", "islenmis evra", "arsiv"] },
  { kod: "taslaklar", ad: "Taslaklar", kaliplar: ["taslaklar", "taslak listesi", "taslagim", "taslaklarim"] },
  { kod: "giden", ad: "Giden evrak", kaliplar: ["giden evra", "gidenler", "gonderilen evra"] },
  { kod: "mevzuat", ad: "Mevzuat", kaliplar: ["mevzuat", "kanunlar", "yonetmelikler"] },
  { kod: "denetim", ad: "Denetim izi", kaliplar: ["denetim izi", "denetim"] },
  { kod: "panel", ad: "Panel", kaliplar: ["panel", "ana ekran", "ana sayfa", "gosterge"] },
];

// Emir kipi gövdeleri. TAM SÖZCÜK eşleşmesi (\b...\b) zorunlu: serbest sonek bırakılsaydı
// "açıklama" → "ac" ile eşleşip her açıklama isteğini gezinme komutu sanırdık.
const FIIL = /\b(ac|acar|acsana|acalim|acabilir|aciver|gec|gecelim|gecsene|gecebilir|git|gidelim|goster|gostersene|gosterir|gosterebilir|don|donelim|donsene|bak|bakalim|getir|getirsene)\b/;

// Soru işaretleyicileri — bunlardan biri varsa cümle komut DEĞİL, sorudur.
// "misin/musun" BİLEREK yok: "açar mısın" kibar bir emirdir, soru değil.
const SORU = /\b(kac|kaci|ne|neyi|neler|neden|nicin|niye|nasil|hangi|hangisi|nerede|nereye|kim|kimin|mi|mu|midir|mudur)\b/;

// Görünüm kalıbından sonra kalabilecek dolgu sözcükleri (fiilsiz "taslaklar" da komuttur).
const DOLGU = new Set([
  "a", "e", "i", "ya", "ye", "yi", "yu", "u", "na", "ne", "ni",
  "ekran", "ekrani", "ekranina", "sayfa", "sayfasi", "sayfasina", "gorunum", "gorunumu",
  "bolum", "bolumu", "kismi", "listesi", "lutfen", "hadi", "simdi", "bana",
]);

// Başlık eşleşmesinde ayırt edici OLMAYAN sözcükler — hepsi her dosyada geçiyor.
const AYIRT_ETMEYEN = new Set(["ornek", "txt", "pdf", "docx", "evrak", "belge", "dosya", "db", "taslak"]);

const parcala = (s) => trKatla(s).split(" ").filter(Boolean);

/* Kalıp çıkarıldıktan sonra geriye yalnız dolgu kalıyorsa cümle "sadece görünüm adı"dır.
   Kalıplar KÖK olduğu için geriye çekim artığı kalır ("gelen evrak" → "k", "taslağa" → "a");
   3 harfe kadar artık yok sayılır, daha uzun bir sözcük ise cümle başka bir şey söylüyordur. */
function _sadeceGorunumMu(katlanmis, kalip) {
  const kalan = katlanmis.replace(kalip, " ").split(" ").filter(Boolean);
  return kalan.every((k) => DOLGU.has(k) || k.length <= 3);
}

/* Söylenen cümleyi ekrandaki başlıklarla eşleştir. Belirsizlikte null (yanlış açma yok). */
function _basligiBul(katlanmis, basliklar) {
  const puanlar = basliklar.map((baslik) => {
    const parcalar = parcala(baslik).filter((p) => p.length >= 4 && !AYIRT_ETMEYEN.has(p));
    const puan = parcalar.filter((p) => katlanmis.includes(p)).length;
    return { baslik, puan };
  }).filter((x) => x.puan > 0);
  if (!puanlar.length) return null;
  puanlar.sort((a, b) => b.puan - a.puan);
  // Beraberlik = belirsizlik → hiçbirini açma. AMA aynı BAŞLIK iki kez listelenmişse
  // (aynı örnek evraktan iki koşum) kullanıcı açısından belirsizlik yoktur — aksi halde
  // o evrak sesle HİÇ açılamazdı. Belirsizlik yalnız FARKLI başlıklar eşit puanlıysa vardır.
  const enYuksek = puanlar.filter((x) => x.puan === puanlar[0].puan);
  const farkliBasliklar = new Set(enYuksek.map((x) => x.baslik));
  if (farkliBasliklar.size > 1) return null;
  return puanlar[0].baslik;
}

/**
 * Sesli cümleyi komuta çevirir.
 * @param {string} metin konuşulan cümle (transcript)
 * @param {{basliklar?: string[]}} secenek ekranda GÖRÜNEN kayıt başlıkları
 * @returns {{tur:"gorunum",gorunum:string,ad:string}|{tur:"evrak_ac",baslik:string}|{tur:"yok"}}
 */
export function komutCoz(metin, { basliklar = [] } = {}) {
  const k = trKatla(metin);
  if (!k) return { tur: "yok" };
  if (SORU.test(k)) return { tur: "yok" };            // kural 1: soru gezinme yapmaz

  const fiilVar = FIIL.test(k);
  for (const g of GORUNUM_KOMUTLARI) {
    const kalip = g.kaliplar.find((p) => k.includes(p));
    if (kalip && (fiilVar || _sadeceGorunumMu(k, kalip))) {
      return { tur: "gorunum", gorunum: g.kod, ad: g.ad };
    }
  }
  if (fiilVar && basliklar.length) {
    const baslik = _basligiBul(k, basliklar);
    if (baslik) return { tur: "evrak_ac", baslik };
  }
  return { tur: "yok" };
}

/** Komutun onay cümlesi — GEÇMİŞ kipte. Komut 30 ms'de uygulanıyor; "açılıyor" demek
    kullanıcı ekranın çoktan değiştiğini görürken yanlış bilgi vermek olurdu (canlı bulgu:
    onay TTS turunu beklediği için 2-3 sn sonra geliyor ve o an iş çoktan bitmiş oluyordu).
    Bu cümle SESLENDİRİLMEZ — konuşma hafızasına ve ekran okuyucuya gider. */
export function komutOnayi(komut) {
  if (komut?.tur === "gorunum") return `${komut.ad} açıldı.`;
  if (komut?.tur === "evrak_ac") return `Açtım: ${komut.baslik}`;
  return "";
}
