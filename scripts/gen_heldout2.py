#!/usr/bin/env python
"""İKİNCİ held-out (çapraz-doğrulama) kamu-evrak değerlendirme seti üreteci.

NEDEN İKİNCİ BİR HELD-OUT?
  Birinci held-out (`scripts/gen_heldout.py`) ile gerçek-mod (gpt-4o) skoru TEK bir
  üretici + TEK bir şablon ailesinden gelir. Tek-set riski: skor o üreticinin üslup
  yanlılığını (kurum yelpazesi, cümle kalıpları, zorluk dengesi) ezberleyip yüksek
  çıkabilir. ÇAPRAZ-DOĞRULAMA için FARKLI bir üretici gerekir → bu modül.

BU SET 1. HELD-OUT'TAN DA FARKLI (üretici çeşitliliği):
  - FARKLI KURUM YELPAZESİ: 1. set bakanlık/genel müdürlük kullandı; bu set
    üniversite/belediye/hastane/vergi dairesi/il müdürlüğü/düzenleyici kurul →
    tamamen ayrı kurumsal kayıt (institutional register).
  - FARKLI CÜMLE KALIPLARI: gövdeler YENİDEN yazıldı; 1. set'in cümleleri AYNEN
    tekrarlanmaz. Heuristik tablolarına (siniflandir._GOVDE_ONCELIKLI / _CITIZEN_INTENT /
    _KONU_KEYWORDS) çarpan ifadelerden (ör. "tek kapı başvuru", "imza altına al",
    "çevrim içi") KAÇINILIR → daha da örtük.
  - FARKLI ZORLUK DENGESİ: Konu satırı DAHA SIK atlanır (5'te 2; 1. set'te 4'te 1),
    başlık etiketleri farklı biçimde (küçük harf 'tarih/sayı', bazen 'İlgi' satırı) →
    yapısal sızıntı daha da azalır; insan etiketçi yine bağlamdan çıkarır.
  - FARKLI PII HAVUZU + FARKLI YIL (2028) → set 1. held-out ve in-domain'den PROVABLY
    AYRIK (id ön-eki 'h2_', kaynak 'heldout2').

Sonuç: keyword sızıntısı MİNİMUM → mock-mod skoru DÜŞÜK ÇIKAR ve bu DÜRÜSTTÜR
(raporlanır). İki held-out arası gerçek-mod (LLM) skor TUTARLILIĞI = genelleme gücünün
TEK-SET-OLMAYAN kanıtıdır (çapraz-doğrulama).

CLAUDE.md §2: gerçek PII ASLA → checksum-GEÇERLİ SAHTE TCKN + sahte telefon/isim.
Taksonomi TEK KAYNAK (agents.config) — uydurma sınıf YOK.

Çıktı (data/synthetic/heldout2_gold.jsonl):
  her satır {id, evrak_turu, metin, beklenen_birim, beklenen_yazi_turu, kaynak:"heldout2"}

Çalıştır (mutlak yol):
    python "C:\\Users\\cemmo\\Desktop\\kamu evrak\\scripts\\gen_heldout2.py"
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

# Deterministik tekrar-üretilebilirlik (jüri: aynı tohum = aynı veri). gen_heldout
# (20260626) ve gen_synthetic'ten FARKLI tohum → ad/tarih/numara çakışması olmaz
# (2. held-out gerçekten ayrı, çapraz küme).
DEFAULT_SEED = 20280131
DEFAULT_PER_TYPE = 6

# 'belirsiz' abstention etiketi — sentetik veri üretilmez (diğer üreteçlerle aynı politika).
URETILEN_TURLER: tuple[str, ...] = tuple(t for t in EVRAK_TURLERI if t != "belirsiz")


# ===========================================================================
# 1. SAHTE PII — checksum-geçerli sahte TCKN + sahte telefon/isim/kurum
# ===========================================================================
# 1. held-out ve gen_synthetic ile ÖRTÜŞMEYEN ad havuzu (çapraz küme ayrı dağılım).
_AD = ("Selin", "Kerem", "Zeynep", "Burak", "Elif", "Onur", "Yağmur", "Cem",
       "İrem", "Barış", "Melis", "Tolga", "Sıla", "Kaan", "Derya", "Emre",
       "Pınar", "Serkan", "Bahar", "Murat")
_SOYAD = ("Arslan", "Doğan", "Kaya", "Şahin", "Yıldız", "Polat", "Erdem", "Korkmaz",
          "Aydın", "Çelik", "Demir", "Kurt", "Aslan", "Bozkurt", "Şimşek", "Akın",
          "Ozan", "Gül", "Kara", "Uçar")

# Kurum yelpazesi 1. held-out'tan TAMAMEN farklı: orada bakanlık/genel müdürlük vardı;
# burada üniversite/belediye/hastane/vergi dairesi/il müdürlüğü/düzenleyici kurul.
# T.C. başlık satırı sınıf sinyali taşımaz (yalnız gönderen kurumu).
_KURUM = (
    "GAZİ ÜNİVERSİTESİ REKTÖRLÜĞÜ",
    "İSTANBUL BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞI",
    "ANKARA ŞEHİR HASTANESİ BAŞHEKİMLİĞİ",
    "ÇANKAYA VERGİ DAİRESİ MÜDÜRLÜĞÜ",
    "İZMİR İL SAĞLIK MÜDÜRLÜĞÜ",
    "RADYO VE TELEVİZYON ÜST KURULU",
    "BURSA TİCARET VE SANAYİ ODASI",
    "KONYA İL MİLLİ EĞİTİM MÜDÜRLÜĞÜ",
    "ANTALYA SU VE ATIKSU İDARESİ GENEL MÜDÜRLÜĞÜ",
    "ENERJİ PİYASASI DÜZENLEME KURUMU",
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
    return f"0{rng.randint(500, 529)} {rng.randint(100, 999)} {rng.randint(10, 99)} {rng.randint(10, 99)}"


def fake_name(rng: random.Random) -> str:
    return f"{rng.choice(_AD)} {rng.choice(_SOYAD)}"


def fake_date(rng: random.Random) -> str:
    return f"{rng.randint(1, 28):02d}.{rng.randint(1, 12):02d}.2028"  # 2028 → diğer setlerden ayrı


def fake_sayi(rng: random.Random) -> str:
    return f"E-{rng.randint(10000000, 99999999)}-{rng.randint(100, 999)}.01-{rng.randint(1000, 9999)}"


# ===========================================================================
# 2. TÜRE-ÖZEL HELD-OUT-2 GÖVDE — DAHA DA DOLAYLI / ÖRTÜK ANLATIM
# ===========================================================================
# KURAL (çapraz-doğrulama): (a) gen_synthetic'in tür-imzası anahtar sözcüklerinden,
#   (b) heuristik _GOVDE_ONCELIKLI/_KONU_KEYWORDS/_CITIZEN_INTENT eşleşmelerinden VE
#   (c) 1. held-out'taki cümlelerin AYNISINDAN kaçın. Her tür için anlamı KORUNAN ama
#   sözcükleri YENİDEN seçilmiş, farklı üsluplu (üniversite/belediye/kurul dili)
#   ifadeler. İnsan etiketçi türü bağlamdan rahat çıkarır; salt-keyword heuristik
#   çıkaramaz (dürüst, çapraz zorluk).
_GOVDE: dict[str, tuple[str, ...]] = {
    "dilekce": (
        "Yaşadığım bu durumun makamınızca incelenip lehime sonuçlandırılmasını arz ederim.",
        "Karşılaştığım engelin ortadan kaldırılması için gereğinin yapılmasını saygıyla beklerim.",
        "Sokağımızdaki uzun süredir devam eden aksaklığın giderilmesini umut ediyorum.",
        "Tarafıma yaşatılan haksızlığın düzeltilmesi yönünde adım atılmasını diliyorum.",
        "Söz konusu sıkıntının çözüme kavuşturulmasını sizlerden istirham ediyorum.",
        "Bu hususun değerlendirmeye alınıp tarafıma olumlu dönüş yapılmasını rica ederim.",
    ),
    "basvuru": (
        "Aranan nitelikleri taşıdığımı belirtir, kaydımın açılmasını arz ederim.",
        "İlgili programdan yararlanabilmem için dosyamın işleme alınmasını istemekteyim.",
        "Gerekli evrakı tamamladığımı bildirir, hakkımın tanınmasını talep etmekteyim.",
        "Yeni faaliyetim için aranan onayın düzenlenmesini saygıyla beklemekteyim.",
        "Şartları yerine getirdiğimi düşünerek değerlendirmeye alınmayı arz ederim.",
        "Söz konusu haktan faydalanmak üzere durumumun incelenmesini istiyorum.",
    ),
    "sikayet": (
        "Aylardır tekrarlayan bu rahatsız edici durum yüzünden bezdim; çözüm bekliyorum.",
        "Karşı taraftan gördüğüm muameleden son derece rahatsızım, üzerine gidilmesini isterim.",
        "Defalarca dile getirmeme rağmen değişen bir şey olmadı; bu kez ciddiye alınmasını umuyorum.",
        "Verilen hizmetin niteliğini hiç beğenmiyor, bu durumu makamınıza iletiyorum.",
        "Komşu işletmenin yarattığı huzursuzluk günlük yaşamımızı olumsuz etkiliyor.",
        "Bu derece özensiz bir uygulamayı kabullenemiyor, hoşnutsuzluğumu bildiriyorum.",
    ),
    "ihbar": (
        "Kurallara aykırı yürütüldüğünü gördüğüm bir işi sessizce incelemenize sunuyorum.",
        "Devlete ait imkânların yerinde harcanmadığından kuşkulanıyor, araştırılmasını istiyorum.",
        "Gerekli onayı olmadan sürdürülen bir faaliyetin durdurulması için durumu aktarıyorum.",
        "Kayıt dışı çalıştırıldığını öğrendiğim kişiler bulunduğunu gizlice bildirmek isterim.",
        "Tehlike doğuran ve göz ardı edilen bir uygulamayı yetkili makama duyuruyorum.",
        "Görünürde gizlenen bir yolsuzluğun sessizce mercek altına alınmasını rica ederim.",
    ),
    "talep": (
        "İhtiyaç duyduğum kolaylığın tarafıma sağlanmasını saygıyla istemekteyim.",
        "Bir nüshasının elden tarafıma çıkarılmasını rica etmekteyim.",
        "Uygun bir tarihte görüşme ayarlanması hususunu arz ederim.",
        "Söz konusu malzemenin geçici süreyle kullanımıma verilmesini umuyorum.",
        "Görevlinin bu iş için yönlendirilmesi yönünde gereğini istemekteyim.",
        "İlave ödeneğin tahsis edilip edilemeyeceğinin değerlendirilmesini arz ederim.",
    ),
    "bilgi_edinme": (
        "Elinizde bulunan belgenin bir suretine yasal hakkım gereği ulaşmak isterim.",
        "Daha önce düzenlenmiş tutanakların birer kopyasının tarafıma çıkarılmasını arz ederim.",
        "Geçmişe dönük harcama dökümünün açıklanmasını mevzuat kapsamında istemekteyim.",
        "Saklanan dosyadaki verilere erişme isteğimi makamınıza iletiyorum.",
        "Mevcut görevlendirme listesinin bir örneğinin tarafıma sunulmasını talep ederim.",
        "Kurumunuzda kayıtlı verilere ulaşma hakkımı kullanmak istemekteyim.",
    ),
    "cimer": (
        "Cumhurbaşkanlığı iletişim merkezine ilettiğim sorunun ele alınmasını bekliyorum.",
        "Devletin halk masasına bildirdiğim hususun takibe alınmasını arz ederim.",
        "İletişim merkezi numarasından açtığım kaydın sonuçlandırılmasını istiyorum.",
        "Vatandaş danışma hattına aktardığım meselenin değerlendirilmesini umuyorum.",
        "İletişim merkezine yaptığım bildirime dönüş yapılmasını saygıyla beklerim.",
        "Halkın başvuru masasına ulaştırdığım talebin neticelendirilmesini rica ederim.",
    ),
    "ust_yazi": (
        "Hazırlanan dosya, gereği yapılmak üzere makamınızın takdirine sunulmuştur.",
        "Konuya ilişkin doküman, değerlendirilmek üzere ilişikte gönderilmektedir.",
        "Yürütülen iş için düzenlenen belgeler, bilgi ve gereği için takdim olunur.",
        "Söz konusu çalışmaya dair evrak, incelenmesi amacıyla tarafınıza iletilmektedir.",
        "İlgili faaliyetin yürütülmesi hususu, saygıyla bilgilerinize arz olunur.",
        "Düzenlenen metin, koordinasyon sağlanması için makamınıza takdim edilmiştir.",
    ),
    "cevabi_yazi": (
        "Önceki yazınızda yöneltilen hususa dair değerlendirmemiz aşağıda yer almaktadır.",
        "Tarafınızdan iletilen istem incelenmiş olup ulaştığımız netice şöyledir.",
        "İstenilen inceleme tamamlanmış, sonucu bilginize sunulmaktadır.",
        "Yazınızda gündeme getirilen soruya karşılık hazırladığımız açıklama ektedir.",
        "Sorduğunuz konuda kurumumuzun değerlendirmesi tarafınıza iletilmektedir.",
        "Gönderdiğiniz isteme yönelik incelememizin çıktısı aşağıda paylaşılmıştır.",
    ),
    "tebligat": (
        "Hakkınızda tesis edilen işlemin usulünce size duyurulduğunu belirtiriz.",
        "Aşağıdaki kararın muhatabına resmen ulaştırılması gerekmektedir.",
        "Bu yazı ile söz konusu idari işlem tarafınıza resmen bildirilmektedir.",
        "Belirtilen yükümlülüğün size duyurulduğu işbu yazı ile sabittir.",
        "Kararın elinize geçtiği tarihten itibaren süreniz işlemeye başlayacaktır.",
        "Muhataba yapılan bu resmi duyuru ile sürecin başladığı bildirilir.",
    ),
    "dava_evraki": (
        "Sayın heyetinize sunduğumuz beyanların dosyaya kazandırılmasını arz ederiz.",
        "Yargılamanın yürütüldüğü merci önünde ileri sürdüğümüz iddialar ektedir.",
        "Açtığımız uyuşmazlığa dair gerekçeli beyanımız takdim olunmuştur.",
        "Esasa ilişkin savunmamızın oturumda göz önünde tutulmasını talep ederiz.",
        "Verilen karara karşı üst mercie taşıdığımız itirazın görülmesini isteriz.",
        "Hukuki sürecin yürütüldüğü makama ibraz ettiğimiz delillerin tartışılmasını arz ederiz.",
    ),
    "icra_evraki": (
        "Borçlunun mal varlığına tedbir konulması yönünde işlem yapılmasını rica ederiz.",
        "Alacağımızın zorla tahsili için sürecin başlatılmasını istemekteyiz.",
        "Takip dosyamız kapsamında taşınmaza şerh işlenmesini talep ederiz.",
        "Tahsil edilemeyen alacak için yasal zorlama yoluna gidilmesini arz ederiz.",
        "Borçlunun hesaplarına tedbir uygulanması hususunda gereğini rica ederiz.",
        "Tahsilat için dosyanın yetkili daireye sevkini talep etmekteyiz.",
    ),
    "muzekkere": (
        "İlgili esas dosyası için gereksinim duyulan bilginin makamımıza ulaştırılması rica olunur.",
        "Soruşturma kapsamında istenen kayıtların tarafımıza gönderilmesi gerekmektedir.",
        "Bir kişinin güncel adres bilgisinin dosyamıza bildirilmesi hususu rica olunur.",
        "Yürütülen iş için kurumunuzdaki belgelerin örneklerine gereksinim bulunmaktadır.",
        "İstenen hususların resmi yazı ekinde tarafımıza ulaştırılması beklenmektedir.",
        "Dosya için aranan verilerin ivedilikle ulaştırılması hususu rica olunur.",
    ),
    "fatura": (
        "Sunulan hizmet karşılığı düzenlenen belge uyarınca tutarın hesabımıza geçirilmesini bekleriz.",
        "Teslim edilen ürünün karşılığının ilgili birimce ödeneğe bağlanması gerekmektedir.",
        "Sözleşme uyarınca hak edilen meblağın tarafımıza yatırılmasını arz ederiz.",
        "Yapılan iş karşılığı doğan alacağın bütçeden ödenmesini rica ederiz.",
        "Düzenlenen belgeye göre tahsilatımızın yapılmasını beklemekteyiz.",
        "Hizmet karşılığı tutarın tahakkuka bağlanması hususunu arz ederiz.",
    ),
    "tutanak": (
        "Yerinde saptanan hususlar hazır bulunanlarca belgeye geçirilip onaylanmıştır.",
        "Aşağıdaki tespitler katılanların huzurunda kayda alınmıştır.",
        "Teslim sırasında görülen durum yazıyla saptanarak belgelenmiştir.",
        "Sayım esnasında belirlenenler ilgililerce düzenlenen belgeye işlenmiştir.",
        "İnceleme boyunca gözlemlenen hususlar belge altına geçirilmiştir.",
        "Tarafların anlatımları ve yerinde görülen durum belgeye dökülerek onaylanmıştır.",
    ),
    "rapor": (
        "Yürütülen çalışmanın bulgu ve önerileri aşağıda ayrıntısıyla ortaya konmuştur.",
        "Yapılan incelemeye dair değerlendirmelerimiz ilişikteki metinde yer almaktadır.",
        "Dönem içinde gerçekleştirilen işler özetlenip değerlendirmeye sunulmuştur.",
        "Saha çalışmasının sonuçları ve saptanan hususlar ekte derlenmiştir.",
        "Başarım göstergelerine ilişkin çözümlememiz ilgili metinde sunulmaktadır.",
        "İzleme boyunca derlenen veriler değerlendirilerek görüşe bağlanmıştır.",
    ),
    "gorus_mutalaa": (
        "Söz konusu hukuki konuda uygulamanın ne yönde olması gerektiğine dair "
        "değerlendirmenizi rica ederiz.",
        "İlgili düzenlemenin nasıl anlaşılması gerektiğine dair hukuki kanaatinizi bekliyoruz.",
        "Sözleşmedeki hükmün ne şekilde işletileceği konusunda hukukçu değerlendirmesi isteriz.",
        "Personel haklarıyla ilgili duraksamanın giderilmesi için hukuki bakışınızı istiyoruz.",
        "Tazminatın hesabında izlenecek yola dair hukuki kanaatinize gereksinim duyulmaktadır.",
        "Mevzuatın bu hükmünün ne şekilde yorumlanacağına dair görüşünüz rica olunur.",
    ),
    "genelge_talimat_olur": (
        "Aşağıda belirtilen uygulamanın yürürlüğe alınması makamınızın onayına arz olunur.",
        "Tüm birimlerce uyulacak esasların duyurulması hususunda gereğini arz ederim.",
        "Belirtilen düzenlemenin işletilmesi için makam onayının alınması arz olunur.",
        "Mesai düzenine ilişkin yeni esasların yürürlüğe alınması onayınıza sunulur.",
        "Birimlere iletilecek uygulama ilkelerinin onaylanmasını arz ederim.",
        "Söz konusu önlemin tüm teşkilatça hayata geçirilmesi için onay arz olunur.",
    ),
}

# Türe-özel "konu" — held-out-2: SINIF İMZASI sözcüğü taşımayan / 1. held-out ve
# gen_synthetic'ten FARKLI dolaylı konu ifadeleri. Konu DAHA SIK None (5'te 2) →
# heuristik en güçlü sinyalini daha sık kaybeder; insan etiketçi bağlamdan çıkarır.
_KONULAR: dict[str, tuple[str | None, ...]] = {
    "dilekce": ("yol çukuru", None, "park sorunu", None, "gürültü rahatsızlığı"),
    "basvuru": ("burs talebi", None, "ruhsat işlemi", None, "kayıt isteği"),
    "sikayet": ("tekrar eden aksama", None, "kötü muamele", None, "komşu işletme"),
    "ihbar": ("usule aykırılık", None, "kayıt dışı çalışma", None, "tehlikeli durum"),
    "talep": ("kolaylık isteği", None, "nüsha çıkarma", None, "randevu"),
    "bilgi_edinme": ("kayıt sureti", None, "harcama bilgisi", None, "liste talebi"),
    "cimer": ("hat üzerinden bildirim", None, "danışma kaydı", None, "halk masası"),
    "ust_yazi": ("dosya gönderimi", None, "evrak takdimi", None, "koordinasyon"),
    "cevabi_yazi": ("istem sonucu", None, "değerlendirme dönüşü", None, "soru karşılığı"),
    "tebligat": ("işlem duyurusu", None, "yükümlülük bildirimi", None, "karar duyurusu"),
    "dava_evraki": ("uyuşmazlık beyanı", None, "esas savunması", None, "üst itiraz"),
    "icra_evraki": ("alacak takibi", None, "taşınmaz şerhi", None, "hesap tedbiri"),
    "muzekkere": ("bilgi isteme", None, "adres sorma", None, "belge örneği"),
    "fatura": ("hak ediş ödemesi", None, "mal karşılığı", None, "hizmet karşılığı"),
    "tutanak": ("yerinde saptama", None, "teslim kaydı", None, "sayım belgesi"),
    "rapor": ("çalışma çıktısı", None, "dönem özeti", None, "saha sonucu"),
    "gorus_mutalaa": ("hukuki kanaat isteği", None, "hüküm yorumu", None, "uygulama duraksaması"),
    "genelge_talimat_olur": ("uygulama esası", None, "mesai düzeni", None, "teşkilat duyurusu"),
}

# Vatandaş bloğu (Ad-Soyad/TCKN) taşıyan türler — kurum→kurum yazıda yoktur.
_VATANDAS_TURLER = {"dilekce", "basvuru", "sikayet", "ihbar", "talep", "bilgi_edinme", "cimer"}


@dataclass
class HeldoutOrnegi:
    """Tek held-out-2 evrak + altın etiketler (config taksonomisi)."""

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
            "kaynak": "heldout2",
        }


def _basliklar(turu: str, rng: random.Random) -> list[str]:
    """Başlık bloğu — 1. held-out'tan FARKLI biçim: küçük harf etiketler + ara sıra
    'İlgi' satırı (kurumlar arası atıf). Tarih/Sayı/Konu sırası ve label biçimi farklı
    → yapısal sızıntı azalır; cikar.py regex'i yine alanları yakalar (gerçek-mod çalışır).
    """
    lines = [_secili_kurum(rng), ""]
    lines.append(f"sayı : {fake_sayi(rng)}")
    lines.append(f"tarih: {fake_date(rng)}")
    konu = rng.choice(_KONULAR[turu])
    if konu is not None:  # 5'te 2 None → Konu satırı sık atlanır (heuristik zorlanır)
        lines.append(f"konu : {konu}")
    if turu not in _VATANDAS_TURLER and rng.random() < 0.4:
        lines.append("İlgi : önceki yazışmamız.")  # kurum→kurum atıf (sınıf sinyali değil)
    return lines


def _secili_kurum(rng: random.Random) -> str:
    return rng.choice(_KURUM)


def _imza_blogu(turu: str, rng: random.Random) -> list[str]:
    if turu in _VATANDAS_TURLER:
        return [
            f"Ad Soyad : {fake_name(rng)}",
            f"T.C. No  : {fake_tckn(rng)}",
            f"Telefon  : {fake_phone(rng)}",
        ]
    return [f"e-imza   : {fake_name(rng)}"]  # kurum→kurum: yapısal imza, PII bloğu yok


def _render_metin(turu: str, idx: int, rng: random.Random) -> str:
    """Held-out-2 evrak metni — başlık + (opsiyonel) konu + DAHA ÖRTÜK gövde + kimlik bloğu.

    SINIF İMZASI sözcükleri AÇIKÇA geçmez; konu sık atlanır; gövde ifadeleri 1. held-out
    ve heuristik tablolarından FARKLI seçilir. Etiket formatları cikar.py regex'iyle
    uyumlu kalır (gerçek-mod alan çıkarımı + eksik tespiti çalışsın).
    """
    govde = rng.choice(_GOVDE[turu])
    lines = _basliklar(turu, rng)
    lines += ["", govde, ""]
    lines += _imza_blogu(turu, rng)
    return "\n".join(lines)


def make_evrak(turu: str, idx: int, rng: random.Random) -> HeldoutOrnegi:
    return HeldoutOrnegi(
        id=f"h2_{turu}_{idx:02d}",
        evrak_turu=turu,
        metin=_render_metin(turu, idx, rng),
        beklenen_birim=EVRAK_TO_BIRIM[turu],
        beklenen_yazi_turu=EVRAK_TO_YAZI.get(turu, "cevabi_yazi"),
    )


def generate(per_type: int, seed: int) -> list[HeldoutOrnegi]:
    """18 üretilen tür × per_type → held-out-2 evrak listesi (deterministik)."""
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
        description="İkinci held-out (çapraz-doğrulama, dairesel-olmayan) kamu-evrak gold üreteci")
    ap.add_argument("--per-type", type=int, default=DEFAULT_PER_TYPE, help="tür-başı örnek (>=4)")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", type=str, default=None,
                    help="çıktı dosyası (default data/synthetic/heldout2_gold.jsonl)")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    per = max(4, args.per_type)
    samples = generate(per, args.seed)
    out_path = (Path(args.out) if args.out
                else Path(__file__).resolve().parent.parent / "data" / "synthetic" / "heldout2_gold.jsonl")
    _write_jsonl(out_path, [s.to_record() for s in samples])

    print(f"\n  İKİNCİ held-out (çapraz-doğrulama) gold üretildi → {out_path}")
    print(f"  {len(URETILEN_TURLER)} tür × {per} = {len(samples)} evrak (seed={args.seed})")
    print("  NOT: FARKLI üretici (kurum yelpazesi/cümle kalıbı/zorluk dengesi 1. held-out'tan")
    print("       ayrı); gövde DAHA örtük → mock-mod skoru DÜŞÜK çıkar (DÜRÜST, dairesel-olmayan).")
    print("       İki held-out arası gerçek-mod skor TUTARLILIĞI = tek-set-olmayan genelleme kanıtı.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
