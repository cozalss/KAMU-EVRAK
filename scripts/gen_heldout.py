#!/usr/bin/env python
"""Held-out (DÜRÜST, dairesel-OLMAYAN) kamu-evrak değerlendirme seti üreteci.

NEDEN AYRI BİR ÜRETEÇ?
  In-domain gold (`scripts/gen_synthetic.py`) ile sınıflandırma mock skoru (~0.92)
  DAİRESELDİR: gold şablonları tür-imzası anahtar sözcükleri (ör. "dilekçe",
  "müzekkere", "fatura", "şikâyet") AÇIKÇA içerir; heuristik fallback (siniflandir.py
  `_KEYWORDS`/`_KONU_KEYWORDS`) tam da o sözcüklere bakar → ezber. Skor yüksek ama
  GENELLEME ölçmez.

BU MODÜL FARKLI: aynı 18 config türünü üretir AMA
  - FARKLI fiiller / dolaylı (örtük) anlatım — heuristik keyword'lerinden kaçınır,
  - FARKLI kurum yelpazesi (bakanlık/genel müdürlük; gen_synthetic'teki "VALİLİĞİNE"
    vb. ile örtüşmez),
  - FARKLI konu sözcükleri (sınıf imzası AÇIKÇA geçmez — ör. fatura örneğinde "fatura"
    sözcüğü yok, ödeme/tahakkuk bağlamı dolaylı verilir),
  - bazı örneklerde "Konu:" satırı KASITEN YOK (heuristik en güçlü sinyalini kaybeder).

Sonuç: keyword sızıntısı MİNİMUM → mock-mod skoru DÜŞÜK ÇIKAR ve bu DÜRÜSTTÜR (raporlanır).
Gerçek-mod (LLM_MODE=openai/llamacpp; few-shot güçlendirildi) bu örnekleri semantik
anlamla çözer → held-out skor gerçek genelleme gücünü gösterir.

CLAUDE.md §2: gerçek PII ASLA → checksum-GEÇERLİ SAHTE TCKN + sahte telefon/isim.
Taksonomi TEK KAYNAK (agents.config) — uydurma sınıf YOK.

Çıktı (data/synthetic/heldout_gold.jsonl):
  her satır {id, evrak_turu, metin, beklenen_birim, beklenen_yazi_turu, kaynak:"heldout"}

Çalıştır (mutlak yol):
    python "C:\\Users\\cemmo\\Desktop\\kamu evrak\\scripts\\gen_heldout.py"
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path

# --- Kanonik backend modüllerini import edebilmek için sys.path'e backend ekle ---
_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.config import (  # noqa: E402  (sys.path ayarından sonra import)
    EVRAK_TO_BIRIM,
    EVRAK_TO_YAZI,
    EVRAK_TURLERI,
)

# Deterministik tekrar-üretilebilirlik (jüri: aynı tohum = aynı veri). gen_synthetic'ten
# FARKLI tohum → ad/tarih/numara çakışması olmasın (held-out gerçekten ayrı küme).
DEFAULT_SEED = 20260626
DEFAULT_PER_TYPE = 6

# 'belirsiz' abstention etiketi — sentetik veri üretilmez (gen_synthetic ile aynı politika).
URETILEN_TURLER: tuple[str, ...] = tuple(t for t in EVRAK_TURLERI if t != "belirsiz")


# ===========================================================================
# 1. SAHTE PII — checksum-geçerli sahte TCKN + sahte telefon/isim/kurum
# ===========================================================================
# gen_synthetic ile ÖRTÜŞMEYEN ad/kurum havuzu (held-out ayrı dağılım).
_AD = ("Berra", "Yusuf", "Nehir", "Eymen", "Defne", "Kuzey", "Azra", "Poyraz",
       "Masal", "Aras", "Duru", "Çınar", "Ela", "Toprak", "Mira", "Demir",
       "Asya", "Alp", "Naz", "Ege")
_SOYAD = ("Tunç", "Sönmez", "Yavuz", "Aksoy", "Güneş", "Çetin", "Ünal", "Taş",
          "Avcı", "Bilgin", "Sarı", "Türk", "Coşkun", "Eren", "Güler", "Keskin",
          "Tekin", "Yalçın", "Mutlu", "Özdemir")

# Kurum yelpazesi gen_synthetic'ten TAMAMEN farklı (bakanlık/genel müdürlük/kurul —
# orada il müdürlüğü/valilik vardı). T.C. başlık satırı sınıf sinyali taşımaz.
_KURUM = (
    "T.C. ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞI",
    "T.C. SANAYİ VE TEKNOLOJİ BAKANLIĞI",
    "T.C. TARIM VE ORMAN BAKANLIĞI",
    "KARAYOLLARI GENEL MÜDÜRLÜĞÜ",
    "DEVLET SU İŞLERİ GENEL MÜDÜRLÜĞÜ",
    "KAMU İHALE KURUMU",
    "SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI",
    "VAKIFLAR GENEL MÜDÜRLÜĞÜ",
    "AFET VE ACİL DURUM YÖNETİMİ BAŞKANLIĞI",
    "GENÇLİK VE SPOR BAKANLIĞI",
)


def fake_tckn(rng: random.Random) -> str:
    """Checksum-GEÇERLİ sahte TCKN (algoritma doğru, kişi gerçek DEĞİL)."""
    d = [rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(8)]
    odd = d[0] + d[2] + d[4] + d[6] + d[8]
    even = d[1] + d[3] + d[5] + d[7]
    d.append((odd * 7 - even) % 10)
    d.append(sum(d) % 10)
    return "".join(str(x) for x in d)


def fake_phone(rng: random.Random) -> str:
    return f"0{rng.randint(530, 559)} {rng.randint(100, 999)} {rng.randint(10, 99)} {rng.randint(10, 99)}"


def fake_name(rng: random.Random) -> str:
    return f"{rng.choice(_AD)} {rng.choice(_SOYAD)}"


def fake_date(rng: random.Random) -> str:
    return f"{rng.randint(1, 28):02d}.{rng.randint(1, 12):02d}.2027"  # 2027 → gen_synthetic 2026'dan ayrı


def fake_sayi(rng: random.Random) -> str:
    return f"E-{rng.randint(10000000, 99999999)}-{rng.randint(100, 999)}.99-{rng.randint(1000, 9999)}"


# ===========================================================================
# 2. TÜRE-ÖZEL HELD-OUT GÖVDE — DOLAYLI / ÖRTÜK ANLATIM
# ===========================================================================
# KURAL: gen_synthetic'in tür-imzası anahtar sözcüklerinden ve heuristik
#   _KEYWORDS/_KONU_KEYWORDS/_GOVDE_ONCELIKLI tablolarından KAÇIN. Her tür için
#   anlamı KORUNAN ama sözcükleri FARKLI dolaylı ifadeler. Bir insan etiketçi türü
#   bağlamdan rahat çıkarır; salt-keyword heuristik ÇIKARAMAZ (dürüst zorluk).
#
# Örn. dilekçe: "dilekçe" sözcüğü YOK → "tarafıma bir çözüm üretilmesini umuyorum".
#      fatura: "fatura"/"ödeme"/"tahakkuk" YOK → "düzenlenen belgeye karşılık gelen
#      meblağın hesabımıza aktarılması" (dolaylı mali bağlam).
_GOVDE: dict[str, tuple[str, ...]] = {
    "dilekce": (
        "Aşağıda belirttiğim hususun değerlendirilerek tarafıma bir çözüm "
        "üretilmesini umuyorum.",
        "Yaşadığım sıkıntının giderilmesi adına gerekenin yapılmasını bekliyorum.",
        "Konunun ilgili birimce ele alınıp neticesinin bana bildirilmesini diliyorum.",
        "Mahallemizdeki sorunun çözümü için elinizden geleni yapacağınıza inanıyorum.",
        "Bu meselede mağduriyetimin sonlandırılmasını içtenlikle istirham ediyorum.",
        "Söz konusu durumun düzeltilmesi yönünde adım atılmasını rica ediyorum.",
    ),
    "basvuru": (
        "Gerekli koşulları taşıdığımı belirtir, sürecin başlatılmasını istiyorum.",
        "Yeni iş yerim için aranan belgenin tanzim edilmesini bekliyorum.",
        "Şartları sağladığımı düşünerek hakkımın tesisini talep etmekteyim.",
        "İlgili hizmetten yararlanabilmem için kaydımın oluşturulmasını istiyorum.",
        "Mevzuatın öngördüğü izin için gerekli incelemenin yapılmasını arz ederim.",
        "Çocuğumun ilgili programa dahil edilmesi yönünde işlem yapılmasını istiyorum.",
    ),
    "sikayet": (
        "Aylardır süren bu rahatsız edici durumdan dolayı son derece bunaldım; "
        "gerekenin yapılmasını bekliyorum.",
        "Komşumuzun davranışları huzurumuzu kaçırıyor, bir an önce müdahale edilmesini istiyorum.",
        "Defalarca bildirmeme rağmen sonuç alamadım, bu kez yetkililerin harekete "
        "geçmesini umuyorum.",
        "Hizmetin bu denli aksamasını kabul edilemez buluyor, memnuniyetsizliğimi iletiyorum.",
        "Gece geç saatlere kadar süren bu durum uyku düzenimizi bozuyor, çözüm bekliyorum.",
        "Yapılan işten hiç memnun değilim; bu konunun üzerine gidilmesini talep ediyorum.",
    ),
    "ihbar": (
        "Dikkatinize sunduğum bu aykırılığın gizlilik içinde araştırılmasını arz ederim.",
        "Kamu kaynağının yerinde kullanılmadığına dair ciddi şüphelerim var, "
        "incelenmesini istiyorum.",
        "Ruhsatı bulunmayan bir işletmenin faaliyet gösterdiğini yetkililere bildiriyorum.",
        "İzinsiz biçimde yürütülen çalışmaların durdurulması için gereğini bildiririm.",
        "Çalışanların güvenliğini tehlikeye atan uygulamaları sizlere aktarmak istiyorum.",
        "Kayıt altına alınmadan çalıştırılan kişiler olduğunu bilgilerinize sunuyorum.",
    ),
    "talep": (
        "İhtiyacım olan desteğin sağlanmasını saygıyla istirham ediyorum.",
        "Bir nüsha belgenin tarafıma çıkarılmasını rica ediyorum.",
        "Görüşme için uygun bir gün ayarlanmasını bekliyorum.",
        "Aracın geçici olarak tahsis edilmesini umuyorum.",
        "Personelin görevlendirilmesi hususunda gerekenin yapılmasını istiyorum.",
        "Ek kaynağın ayrılması yönünde değerlendirme yapılmasını arz ederim.",
    ),
    "bilgi_edinme": (
        "Kurumunuzun elinde mevcut olan kayıtların bir suretine erişmek istiyorum.",
        "Daha önce tutulmuş belgelerin tarafıma sunulmasını yasal hakkım kapsamında istiyorum.",
        "Geçmiş döneme ait tutanakların birer örneğinin verilmesini rica ediyorum.",
        "Saklı bulunan dosyadaki verilere ulaşma talebimi iletiyorum.",
        "Yapılan harcamalara dair kayıtların açıklanmasını istemekteyim.",
        "Mevcut atama listesinin tarafıma iletilmesini bekliyorum.",
    ),
    "cimer": (
        "Cumhurbaşkanlığı iletişim sistemi üzerinden ilettiğim sorunun çözülmesini bekliyorum.",
        "Devletin tek kapı başvuru hattından gönderdiğim talebin sonuçlandırılmasını istiyorum.",
        "Elektronik başvuru kanalından ulaştırdığım meselenin takibe alınmasını rica ediyorum.",
        "Resmi başvuru portalı aracılığıyla bildirdiğim hususun değerlendirilmesini umuyorum.",
        "Çevrim içi ilettiğim talebime bir an önce dönüş yapılmasını bekliyorum.",
        "Halk başvuru merkezinden gönderdiğim konunun ele alınmasını istiyorum.",
    ),
    "ust_yazi": (
        "İlişikte sunulan belgenin gereği yapılmak üzere makamınıza takdim edilmiştir.",
        "Hazırlanan çalışmanın değerlendirilmesi amacıyla tarafınıza iletilmesi uygun görülmüştür.",
        "Konuya dair düzenlenen evrak, bilgi ve gereği için ekte sunulmaktadır.",
        "Söz konusu işin yürütülmesi hususu bilgilerinize saygıyla sunulur.",
        "İlgili çalışmanın koordinasyonu için gerekli belgeler ekte gönderilmektedir.",
        "Yürütülecek faaliyete ilişkin doküman değerlendirilmek üzere takdim olunur.",
    ),
    "cevabi_yazi": (
        "Daha önce göndermiş olduğunuz yazıda sorulan hususa ilişkin görüşümüz aşağıda yer almaktadır.",
        "Tarafınızca iletilen talep incelenmiş olup vardığımız sonuç şu şekildedir.",
        "Bizden istenen değerlendirme tamamlanmış, neticesi bilginize sunulmaktadır.",
        "Yazınızda dile getirilen soruya karşılık hazırladığımız açıklama ektedir.",
        "Sorduğunuz konuyla ilgili kurumumuzun yaklaşımı tarafınıza bildirilmektedir.",
        "İlettiğiniz başvuruya dönük incelememizin çıktısı aşağıda paylaşılmıştır.",
    ),
    "tebligat": (
        "Hakkınızda tesis edilen işlemin usulüne uygun biçimde size bildirildiğini "
        "belirtmek isteriz.",
        "Aşağıdaki kararın muhatabına resmen ulaştırılması gerekmektedir.",
        "İşbu yazı ile söz konusu idari işlem tarafınıza resmen duyurulmaktadır.",
        "Belirtilen yükümlülüğün size bildirildiği bu yazı ile sabit kılınmaktadır.",
        "Kararın size ulaştırıldığı tarihten itibaren süreniz başlayacaktır.",
        "Muhataba yapılan bu resmi bildirim ile sürecin işlemeye başladığı duyurulur.",
    ),
    "dava_evraki": (
        "Sayın heyetinize sunduğumuz beyanların dosya kapsamında değerlendirilmesini arz ederiz.",
        "Yargılamanın görüldüğü merci nezdinde ileri sürdüğümüz iddialar ektedir.",
        "Açtığımız uyuşmazlığa ilişkin gerekçeli dilekçemiz takdim olunmuştur.",
        "Esas hakkındaki savunmamızın duruşmada dikkate alınmasını talep ederiz.",
        "Karara karşı bir üst mercie taşıdığımız itirazımızın incelenmesini isteriz.",
        "Hukuki sürecin yürütüldüğü makama sunduğumuz delillerin değerlendirilmesini arz ederiz.",
    ),
    "icra_evraki": (
        "Borçlunun malvarlığına el konulması yönünde gerekli işlemlerin yürütülmesini rica ederiz.",
        "Alacağımızın tahsili amacıyla zorla tahsil sürecinin başlatılmasını istiyoruz.",
        "Takip dosyamız kapsamında borçluya ait taşınmazın kaydına şerh konulmasını talep ederiz.",
        "Ödenmeyen alacak için yasal zorlama yollarına başvurulmasını arz ederiz.",
        "Borçlunun banka hesaplarına bloke konulması hususunda gereğini rica ederiz.",
        "Tahsilat işlemleri için dosyanın ilgili daireye sevki talep olunur.",
    ),
    "muzekkere": (
        "İlgili esas dosyası için ihtiyaç duyulan bilginin makamımıza gönderilmesi rica olunur.",
        "Soruşturma kapsamında istenen kayıtların tarafımıza ulaştırılması gerekmektedir.",
        "Bir kişinin güncel ikamet bilgisinin dosyamıza bildirilmesi hususunda gereği rica olunur.",
        "Yürütülen iş kapsamında kurumunuzdaki belgelerin örneklerine ihtiyacımız bulunmaktadır.",
        "Talep edilen hususların resmi yazı ekinde tarafımıza iletilmesi beklenmektedir.",
        "Dosya için aranan verilerin ivedilikle gönderilmesi hususunda gereğini rica ederiz.",
    ),
    "fatura": (
        "Verilen hizmet karşılığında düzenlenen belgeye istinaden tutarın hesabımıza "
        "aktarılmasını bekliyoruz.",
        "Teslim edilen mal bedelinin ilgili birimce karşılanması gerekmektedir.",
        "Sözleşme gereği hak edilen meblağın tarafımıza yatırılmasını rica ederiz.",
        "Yapılan iş karşılığı doğan alacağın bütçeden karşılanması arz olunur.",
        "Kesilen belge uyarınca tahsilatımızın gerçekleştirilmesini bekliyoruz.",
        "Hizmet bedeline ilişkin meblağın ödeneğe bağlanması hususunu arz ederiz.",
    ),
    "tutanak": (
        "Olay yerinde yapılan tespitler taraflarca imza altına alınarak kayda geçirilmiştir.",
        "Aşağıdaki hususlar hazır bulunanlar huzurunda belgelendirilmiştir.",
        "Teslim sırasında saptanan durum yazılı olarak tespit edilmiştir.",
        "Sayım esnasında belirlenenler ilgililerce tutulan belgeye işlenmiştir.",
        "İnceleme sırasında gözlemlenen hususlar kayıt altına alınmıştır.",
        "Tarafların beyanları ve yerinde görülen durum belgelenerek imzalanmıştır.",
    ),
    "rapor": (
        "Yürütülen çalışmanın bulguları ve önerileri aşağıda ayrıntılı biçimde sunulmuştur.",
        "Yapılan incelemeye dair değerlendirmelerimiz ilişikteki belgede yer almaktadır.",
        "Dönem boyunca gerçekleştirilen faaliyetler özetlenerek değerlendirmeye sunulmuştur.",
        "Saha çalışmasının sonuçları ve tespit edilen hususlar ekte özetlenmiştir.",
        "Performans göstergelerine ilişkin analizimiz ilgili belgede sunulmaktadır.",
        "İzleme sürecinde elde edilen veriler değerlendirilerek görüşe bağlanmıştır.",
    ),
    "gorus_mutalaa": (
        "Söz konusu hukuki meselede uygulamanın ne yönde olması gerektiğine dair "
        "değerlendirmenizi rica ederiz.",
        "İlgili düzenlemenin yorumu konusunda hukuki kanaatinizin bildirilmesini bekliyoruz.",
        "Sözleşmedeki maddenin nasıl uygulanacağı hususunda hukukçu değerlendirmesi talep ederiz.",
        "Personel haklarına ilişkin tereddüdün giderilmesi için hukuki bakış açınızı istiyoruz.",
        "Tazminat hesabında izlenecek yol konusunda hukuki kanaatinize ihtiyaç duyulmaktadır.",
        "Mevzuatın bu hükmünün nasıl yorumlanması gerektiğine dair görüşünüzü rica ederiz.",
    ),
    "genelge_talimat_olur": (
        "Aşağıda belirtilen uygulamanın yürürlüğe konulması makamınızın onayına arz olunur.",
        "Tüm birimlerce uyulması gereken esasların duyurulması hususunda gereğini arz ederim.",
        "Belirtilen düzenlemenin uygulanması için makam onayının alınması arz olunur.",
        "Çalışma saatlerine ilişkin yeni esasların yürürlüğe alınması onayınıza sunulur.",
        "Birimlere iletilecek uygulama esaslarının onaylanmasını arz ederim.",
        "Söz konusu tedbirin tüm teşkilatça uygulanması için onay arz olunur.",
    ),
}

# Türe-özel "konu" — held-out: SINIF İMZASI sözcüğü taşımayan / gen_synthetic'ten
# FARKLI dolaylı konu ifadeleri. Bazı türlerde konu kasten None (Konu satırı atlanır →
# heuristik en güçlü sinyalini kaybeder; insan etiketçi bağlamdan çıkarır).
_KONULAR: dict[str, tuple[str | None, ...]] = {
    "dilekce": ("kaldırımdaki bozukluk", "mahalle aydınlatması", None, "geçiş güvenliği"),
    "basvuru": ("işletme açılışı", "öğrenim desteği", None, "tesis kullanım hakkı"),
    "sikayet": ("süregelen rahatsızlık", "hizmet aksaması", None, "çevredeki olumsuzluk"),
    "ihbar": ("kaynak kullanımı", "izinsiz faaliyet", None, "güvenlik açığı"),
    "talep": ("destek ihtiyacı", "belge örneği", None, "görüşme isteği"),
    "bilgi_edinme": ("geçmiş kayıtlar", "harcama dökümü", None, "atama bilgileri"),
    "cimer": ("ulaşım aksaklığı", "altyapı sorunu", None, "erişim güçlüğü"),
    "ust_yazi": ("koordinasyon", "belge sunumu", None, "iş birliği"),
    "cevabi_yazi": ("değerlendirme sonucu", "görüş bildirimi", None, "inceleme çıktısı"),
    "tebligat": ("idari işlem", "yükümlülük bildirimi", None, "karar duyurusu"),
    "dava_evraki": ("uyuşmazlık beyanı", "savunma sunumu", None, "itiraz dilekçesi"),
    "icra_evraki": ("alacak tahsili", "malvarlığı tespiti", None, "hesap blokesi"),
    "muzekkere": ("bilgi celbi", "kayıt isteme", None, "veri talebi"),
    "fatura": ("hizmet bedeli", "mal teslimi", None, "hak ediş"),
    "tutanak": ("yerinde tespit", "teslim kaydı", None, "olay belgesi"),
    "rapor": ("inceleme çıktısı", "dönem değerlendirmesi", None, "saha bulgusu"),
    "gorus_mutalaa": ("hukuki değerlendirme isteği", "mevzuat yorumu", None, "uygulama tereddüdü"),
    "genelge_talimat_olur": ("uygulama esası", "çalışma düzeni", None, "teşkilat duyurusu"),
}

# Vatandaş bloğu (Ad-Soyad/TCKN) taşıyan türler — kurum→kurum yazıda yoktur.
# gen_synthetic'le aynı gerçekçilik: vatandaş petisyonu kimlik bloğu içerir.
_VATANDAS_TURLER = {"dilekce", "basvuru", "sikayet", "ihbar", "talep", "bilgi_edinme", "cimer"}


@dataclass
class HeldoutOrnegi:
    """Tek held-out evrak + altın etiketler (config taksonomisi)."""

    id: str
    evrak_turu: str
    metin: str
    beklenen_birim: str
    beklenen_yazi_turu: str

    def to_record(self) -> dict:
        return {
            "id": self.id, "evrak_turu": self.evrak_turu, "metin": self.metin,
            "beklenen_birim": self.beklenen_birim,
            "beklenen_yazi_turu": self.beklenen_yazi_turu,
            "kaynak": "heldout",
        }


def _render_metin(turu: str, idx: int, rng: random.Random) -> str:
    """Held-out evrak metni — başlık + (opsiyonel) konu + dolaylı gövde + kimlik bloğu.

    SINIF İMZASI sözcükleri AÇIKÇA geçmez; konu bazen atlanır (heuristik zorlanır).
    Etiket formatları (Tarih:/Sayı:/Konu:/Ad-Soyad:) cikar.py regex'iyle uyumlu kalır
    (gerçek-mod alan çıkarımı + eksik tespiti çalışsın); sınıflandırma sinyali ise
    yalnız gövde semantiğindedir (keyword DEĞİL).
    """
    govde = rng.choice(_GOVDE[turu])
    konu = rng.choice(_KONULAR[turu])
    kurum = rng.choice(_KURUM)
    lines = [f"{kurum}", ""]
    lines.append(f"Tarih   : {fake_date(rng)}")
    lines.append(f"Sayı    : {fake_sayi(rng)}")
    if konu is not None:  # bazı örnekte Konu YOK → heuristik en güçlü sinyalini kaybeder
        lines.append(f"Konu    : {konu}")
    lines += ["", govde, ""]
    if turu in _VATANDAS_TURLER:
        lines.append(f"Ad-Soyad: {fake_name(rng)}")
        lines.append(f"T.C. Kimlik No: {fake_tckn(rng)}")
        lines.append(f"İletişim: {fake_phone(rng)}")
    else:  # kurum→kurum yazı: imza bloğu (ad-soyad yapısal alan, PII bloğu yok)
        lines.append(f"İmza: {fake_name(rng)} / e-imza")
    return "\n".join(lines)


def make_evrak(turu: str, idx: int, rng: random.Random) -> HeldoutOrnegi:
    return HeldoutOrnegi(
        id=f"ho_{turu}_{idx:02d}",
        evrak_turu=turu,
        metin=_render_metin(turu, idx, rng),
        beklenen_birim=EVRAK_TO_BIRIM[turu],
        beklenen_yazi_turu=EVRAK_TO_YAZI.get(turu, "cevabi_yazi"),
    )


def generate(per_type: int, seed: int) -> list[HeldoutOrnegi]:
    """18 üretilen tür × per_type → held-out evrak listesi (deterministik)."""
    rng = random.Random(seed)
    out: list[HeldoutOrnegi] = []
    for turu in URETILEN_TURLER:
        for i in range(per_type):
            out.append(make_evrak(turu, i, rng))
    return out


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Held-out (dürüst, dairesel-olmayan) kamu-evrak gold üreteci")
    ap.add_argument("--per-type", type=int, default=DEFAULT_PER_TYPE, help="tür-başı örnek (>=4)")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", type=str, default=None, help="çıktı dosyası (default data/synthetic/heldout_gold.jsonl)")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    per = max(4, args.per_type)
    samples = generate(per, args.seed)
    out_path = (Path(args.out) if args.out
                else Path(__file__).resolve().parent.parent / "data" / "synthetic" / "heldout_gold.jsonl")
    _write_jsonl(out_path, [s.to_record() for s in samples])

    print(f"\n  Held-out (dürüst) gold üretildi → {out_path}")
    print(f"  {len(URETILEN_TURLER)} tür × {per} = {len(samples)} evrak (seed={args.seed})")
    print("  NOT: gövde DOLAYLI/ÖRTÜK; sınıf-imzası keyword'leri MİNİMUM → mock-mod skoru")
    print("       DÜŞÜK çıkar (DÜRÜST, dairesel-olmayan). Gerçek-mod (LLM) semantik çözer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
