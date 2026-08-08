"""AI Bürokrasi Kurulu — DeepSeek destekli çok-ajanlı taslak müzakeresi (Görev 2 yenilikçilik).

Kurul, GÜNCEL resmî yazı taslağını üç uzman üyenin gözünden ÇOK-TURLU DEBATE ile değerlendirir.
Her üye AYRI bir hata sınıfından sorumludur ve o sınıfın GERÇEK sinyaline bağlıdır (bkz.
KURUL_UYELERI gerekçesi): Yazı Sorumlusu biçim bütünlüğü (2646 zorunlu bölümleri), Hukuk
Denetimi doğruluk/dayanak (uydurma-veto, mevzuat, tutarlılık), Muhatap Temsilcisi karşılık
(talep cevapsız mı, hak arama yolu, anlaşılırlık). Birim Amiri tartışmaz: riski deterministik söyler.

YAKINSAMA DÖNGÜSÜ (2026-08-06) — kurul artık KENDİ İŞİNİ DENETLER:
  (1) AÇILIŞ — üç üye birbirini görmeden ilk pozisyon.
  (2) ÇAPRAZ-ELEŞTİRİ — GERÇEK açılışı görüp birbirine AD'la yanıt (karşı/katıl/geliştir) + öneriler.
  (3..N) DENETİM TURU — önerilerin çapalı-edit'i uygulanır, taslağın sinyalleri **YENİDEN ÖLÇÜLÜR**
      (`olc` geri çağrısı: verify + risk_guard, revize metin üzerinde) ve kurul ölçüme bakarak
      devam eder: itiraz gerçekten düştü mü, hangisi duruyor, biçim bozuldu mu.
  Döngü şu üç koşuldan biriyle biter: itiraz sayısı 0 · yeni uygulanabilir edit üretilmedi ·
  tur bütçesi doldu (`KURUL_MUZAKERE_TURU`, varsayılan 2). "Çözülmedi" GEÇERLİ bir sonuçtur —
  sahte uzlaşı üretilmez.

Neden ayrı çağrılar: tek çağrıda self-debate anlaşmaya çöker; ayrı çağrı gerçek karşı-çıkış üretir
(araştırma: Du et al. MAD, sycophancy çalışmaları). Denetim turunun ayrı olmasının sebebi daha
sert: LLM'in "düzelttim" iddiası KANIT DEĞİLDİR — kanıt, revize metnin yeniden ölçülmüş sinyalidir.
Maliyet ~$0.002/tur (tipik toplam ~$0.006). Öneriler → DETERMİNİSTİK anchored-edit (grounding tek
yerde, debate NASIL'ı tartışır).

Güven sınırı + sıfır-uydurma (CLAUDE.md §1):
  - real_llm yok/mock/hata → None; çağıran (endpoint) deterministik muzakere.js'e düşer (mock ayakta).
  - KARAR daima deterministik: risk bandı + çözülmemiş SUNUCU itirazından (LLM/istemci bağlamaz).
  - Uzlaşı metni `_uzlasi_gecerli`'den geçer: boş/şüpheli-kısalma + aşırı-uzama + orijinalde
    OLMAYAN kanun/madde atıfı reddedilir → orijinal korunur, sahte/uydurma "revize" üretilmez.
  - Normalize: LLM'in uydurduğu üye/öneri-tipi kapalı-kümeye eşlenmezse DÜŞÜRÜLÜR.
"""

from __future__ import annotations

import os
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import structlog

from agents.nodes._llm_extract import llm_json, real_llm
from yazi.yazi_render import _REVIZE_MAX_TASLAK_CHARS, _revize_metin_gecerli, _tek_satir

log = structlog.get_logger()

# Yeniden-ölçüm geri çağrısı: revize taslak metni → GÜNCEL sinyaller (verify + risk_guard).
# Enjeksiyon bilinçli: kurul motoru route/verify katmanına bağlanmaz (bugünkü bağımlılık yönü
# korunur) ve testler ölçümü determinist bir sahteyle sürebilir.
Olcer = Callable[[str], Awaitable[dict[str, Any]]]

# Mevzuat atıf tespiti — NORMALİZE TOKEN kümesi (yüzeysel biçim değil, ATIF NUMARASI karşılaştırılır).
# Uzlaşı metni, orijinalde OLMAYAN bir atıf EKLİYORSA uydurmadır (CLAUDE.md §1) → reddedilir.
# Türkçe'nin YAYGIN biçimlerini kapsar: "12 sayılı" (1-2 haneli CBK dahil), "657 sayılı",
# "madde 4", "madde-4", "4. madde", "4 üncü madde", "m.102", "m 102", "md.5", "90. maddesi",
# "375 sayılı KHK / Cumhurbaşkanlığı Kararnamesi". Amaç GENİŞ tutmak — fazla eşleşme GÜVENLİdir
# (revizeyi reddeder, orijinali korur); eksik eşleşme uydurma atfın kaçmasına yol açar (adversarial bulgu).
_ATIF_DESENLERI = (
    re.compile(r"(\d{1,5})\s*sayılı", re.IGNORECASE),                         # "N sayılı" (N≥1 — CBK 1-99 dahil)
    re.compile(r"madde\w*\s*[-\s]?\s*(\d+)", re.IGNORECASE),                   # "madde 4", "madde-4", "maddesi 4"
    re.compile(r"(\d+)\s*(?:['’]?\s*(?:[iıuü]nc[iıuü]|üncü|ncı|nci|ncu|ncü))?\s*\.?\s*madde", re.IGNORECASE),  # "4. madde", "4 üncü madde", "90. maddesi"
    re.compile(r"\bm[dD]?\.?\s*(\d+)", re.IGNORECASE),                        # "m.102", "m 102", "md.5"
    re.compile(r"(?:kararname\w*|k\.?h\.?k\.?)\s*\D{0,15}?(\d{1,5})", re.IGNORECASE),  # "K.H.K. 375", "Kararnamesi 12"
)
_UZLASI_MAKS_ORAN = 2.2   # aşırı-uzama (sessiz padding) sınırı — orijinalin katı
_CIKAR_MIN_KAPSAM = 0.6   # 'cikar' bir satırı ancak çapa satırın ≥%60'ını kaplarsa siler (aşırı-silme guard)
_MIN_CAPA = 8             # daha kısa çapa belirsiz sayılır — edit üretmez
# Türkçe harf-katlama (çapa ↔ taslak satırı eşleştirme) — frontend muzakere.js trKatla ile birebir.
_KATLA_MAP = {"ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "İ": "i", "I": "i",
              "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u"}

# Kurul üyeleri — kapalı küme (LLM buraya EŞLENMELİ). Üye eklemek/çıkarmak için tek yer:
# id frontend UYE eşlemesiyle birebir; 'odak' prompt'ta üyenin bakış açısını sabitler.
#
# ROSTER GEREKÇESİ (6 Ağu 2026 — ölçüme dayalı yeniden tasarım). Kural: bir üye ancak GERÇEK
# bir sinyale bağlıysa koltuk hak eder; bağlı olmayan üye her belgede aynı genel cümleyi kurar
# (eski "Vatandaş Avukatı" dört canlı koşumda tam olarak bunu yaptı: 9 uygulanan düzeltmenin
# yalnız 1'i onun şeridindendi). Üç şerit, ÜÇ AYRI hata sınıfını kapatır:
#   · taslakci  → BİÇİM: EBYS'nin/2646'nın reddedeceği eksik (zorunlu bölüm, ilgi, kapanış).
#   · hukukcu   → DOĞRULUK: kaynakta olmayan iddia/tarih/karar + dayanak + veri tutarlılığı.
#   · vatandas  → KARŞILIK: muhatabın TALEBİNİN cevapsız kalması + hak arama yolu + anlaşılırlık.
# Dördüncü ses (Birim Amiri) tartışmaz, riski deterministik söyler.
#
# "Düz avukat" ayrı üye olarak EKLENMEDİ: hukukcu zaten odur, ikinci hukuk sesi paneli
# birbirini onaylayan bir bloğa çevirir (kurulun tek varlık sebebi görüş ÇEŞİTLİLİĞİ) ve her
# ek üye tur JSON'unu büyütür — çıktı tavanı aşılınca tur tamamen kayboluyor (ölçüldü).
# Dava-riski merceği bunun yerine hukukcu'nun görev tanımına girdi.
KURUL_UYELERI: tuple[dict[str, str], ...] = (
    {"id": "taslakci", "ad": "Yazı Sorumlusu",
     "odak": "biçim bütünlüğü — Yön. 2646 zorunlu bölümleri (antet/sayı/konu/ilgi/muhatap/"
             "kapanış/imza); taslağı savunur, revizyon yapıyı bozarsa İLK O itiraz eder"},
    {"id": "hukukcu", "ad": "Hukuk Denetimi",
     "odak": "doğruluk + dayanak — uydurma-veto, mevzuat/NLI, veri tutarlılığı; ayrıca "
             "'bu işlem iptal davasına konu olsa neresi zayıf' (gerekçe yeterliliği)"},
    {"id": "vatandas", "ad": "Muhatap Temsilcisi",
     "odak": "muhatabın karşılığı — evraktaki TALEPLERİN cevapsız kalıp kalmadığı, hak arama "
             "yolu/süre bildirimi, vatandaşın anlayacağı dil"},
)
_UYE_ID = {u["id"] for u in KURUL_UYELERI}
_ONERI_TIP = {"duzelt", "ekle", "cikar"}
_DAYANAK = {"verify", "lint_2646", "nli", "tutarlilik", "uslup", "dayanak", "muzakere"}

_MAKS_TUR = 8
_MAKS_ONERI = 8
# ÇIKTI BÜTÇESİ — 2026-08-06 canlı ölçümü: müzakere turu `tokens_out=4796` ile tam tavana
# (4096 + LLM_DUSUNME_MARJI 700) dayandı, JSON ORTADAN KESİLDİ, parse-retry aynı duvara çarptı
# (50 sn × 2 boşa) ve kurul sessizce deterministik yedeğe düştü. DeepSeek REASONING modelidir:
# düşünme token'ları da bu bütçeden yer, yani "yeterli görünen" bir tavan pratikte yetmez.
# Açılış da 1682 token üretip 1024'lük tavanın kıyısına geldi. İkisi de ölçüme göre büyütüldü.
_MAKS_TOKENS = 7000
_ACILIS_TOKENS = 1600            # açılış turu kısa (3 pozisyon) ama düşünme payı gerçek

# Müzakere (LLM) turu sayısı: 1 = yalnız çapraz-eleştiri (eski davranış), 2 = + bir DENETİM turu.
# Üst sınır 4 — her tur bir LLM çağrısı + bir yeniden-ölçüm demek; sınırsız döngü hem para hem
# gecikme riskidir. Alt sınır 1: kurul asla sıfır turla "uzlaştı" diyemez.
_MUZAKERE_TURU_VARSAYILAN = 2
_MUZAKERE_TURU_TAVAN = 4
_SON_TUR_SOZ = 6                 # denetim turuna taşınan transkript kuyruğu (girdi şişmesin)

# Debate tur etiketleri (frontend şeridiyle sözleşme): 0=açılış · 1=çapraz eleştiri ·
# 2+=denetim turu · 9=karar (Birim Amiri). Denetim turları 2'den ARTARAK numaralanır.
_TUR_ACILIS, _TUR_CAPRAZ, _TUR_DENETIM_BAS, _TUR_KARAR = 0, 1, 2, 9


# Kurulun KENDİ süre bütçesi. Node varsayılanı (EVRAK_LLM_TIMEOUT_S=20 sn) küçük çıkarım
# çağrıları içindir; müzakere turu 4096 token'lık yapılandırılmış çıktı üretir ve DeepSeek
# REASONING modelidir (düşünme token'ları da bu süreye girer). 2026-08-06 canlı koşumunda
# ölçüldü: açılış 7,5 sn geçti, çapraz tur 20 sn'de TIMEOUT'a düştü → kurul sessizce
# deterministik yedeğe iniyordu. Kurul opt-in ve memur müzakereyi izliyor: derinlik hızdan
# önce gelir (kullanıcı kararı), o yüzden tur başına cömert bütçe.
_TUR_SURE_VARSAYILAN = 120.0
_ACILIS_SURE_VARSAYILAN = 30.0


def _sure(ad: str, varsayilan: float) -> float:
    """ENV'den saniye bütçesi — geçersiz/negatif değer varsayılana düşer."""
    try:
        v = float(os.getenv(ad, "") or varsayilan)
    except ValueError:
        return varsayilan
    return v if v > 0 else varsayilan


def _muzakere_turu() -> int:
    """Tur bütçesi (ENV `KURUL_MUZAKERE_TURU`) — geçersiz/aralık dışı değer varsayılana düşer."""
    try:
        n = int(os.getenv("KURUL_MUZAKERE_TURU", "") or _MUZAKERE_TURU_VARSAYILAN)
    except ValueError:
        return _MUZAKERE_TURU_VARSAYILAN
    return max(1, min(n, _MUZAKERE_TURU_TAVAN))
_AD = {u["id"]: u["ad"] for u in KURUL_UYELERI}    # transkript etiketi (çağrı-2'ye açılışı geçirirken)
_TUTUM = {"katil", "karsi", "gelistir"}            # çapraz-tur duruşu: katıl · karşı çık · geliştir

# Çapalı-edit kuralları — YALNIZ müzakere (2.) çağrısında; öneriler oradan gelir (grounding tek yerde).
_EDIT_KURAL = (
    "Ardından taslakta NEYİN düzeltilmesi/eklenmesi/çıkarılması gerektiğini SATIRA ÇAPALAYARAK öner; "
    "sistem DETERMİNİSTİK uygular (metni SEN yeniden yazmazsın):\n"
    "  • 'capa': dokunulan satırı BİREBİR taslaktan al (uydurma/yaklaşık çapa yok; satır yoksa öneri verme).\n"
    "  • tip='cikar': doğrulanamayan TÜM bir satırı kaldır ('capa'=satırın tamamı). Satır içi ifade için 'duzelt' kullan.\n"
    "  • tip='duzelt': 'capa'=eski satır, 'yeni'=düzeltilmiş TAM satır. 'yeni'de taslakta OLMAYAN "
    "kanun/madde/tarih/sayı/kişi EKLEME (eklersen uygulanmaz, tavsiye kalır).\n"
    "  • tip='ekle': eksik bölüm önerisi (tavsiye — otomatik eklenmez).\n"
    "Taslakta ZATEN olan kurum/kişi/tarih/sayı/madde'yi UYDURMA/değiştirme. 'İlgili mevzuat' listesi "
    "yalnız BAĞLAM, atıf ekleme lisansı DEĞİL."
)

# ÇAĞRI 1 — AÇILIŞ turu: üç üye birbirini görmeden İLK pozisyonunu açıklar (çeşitlilik en yüksek burada;
# araştırma: bağımsız açılış = konformizm öncesi en değerli tur). Roller SERT ve FARKLI (yumuşak nudge
# çalışmaz — Devil's-Advocate mandate'i şüpheciyi gerçekten karşı çıkmaya zorlar).
_SYSTEM_ACILIS = (
    "Sen bir kamu kurumu 'Bürokrasi Kurulu' müzakeresinin AÇILIŞ turunu canlandıran uzman bir asistansın. "
    "Sana GÜNCEL resmî yazı taslağı + taslağın GERÇEK doğrulama sinyalleri verilecek. ÜÇ üye, birbirini "
    "GÖRMEDEN İLK pozisyonunu açıklar. Her üye YALNIZ KENDİ ŞERİDİNDE konuşur (başkasının işini "
    "tekrarlamak turu boşa harcar) ve konuştuğu şeyi VERİLEN SİNYALE dayandırır:\n"
    "  • taslakci (BİÇİM — savunucu): Yön. 2646 zorunlu bölümleri tam mı (antet/sayı/konu/ilgi/"
    "muhatap/kapanış/imza), biçim sinyali ne diyor. Taslağın SAĞLAM yanlarını da GEREKÇESİYLE savunur.\n"
    "  • hukukcu (DOĞRULUK — şüpheci): kaynakta OLMAYAN iddia/tarih/karar, dayanak (mevzuat/NLI), "
    "veri tutarlılığı; ayrıca gerekçe yeterli mi (bu işlem iptal davasına konu olsa neresi zayıf). "
    "Kanıtla zorlanmadıkça 'sorun yok' DEME.\n"
    "  • vatandas (KARŞILIK — muhatap temsilcisi): EVRAKTAKİ TALEPLER listesine bak ve her talebin "
    "taslakta KARŞILANIP karşılanmadığını söyle (karşılanmayanı ADIYLA an); vatandaşa giden yazıda "
    "başvuru/itiraz yolu ve süresi bildirilmiş mi; dil muhatabın anlayacağı gibi mi. "
    "Kaynakta olmayan bir taahhüt/bilgi EKLETME — eksikliği SÖYLE, uydurma.\n"
    "Her üye 1-2 cümle, Türkçe, resmî, 3. tekil. YALNIZ sinyallerde/taslakta OLAN'ı konuş — UYDURMA YOK. Emoji yok.\n"
    'YALNIZ şu şemada JSON döndür: {"turlar": [{"uye": "taslakci", "soz": "..."}, '
    '{"uye": "hukukcu", "soz": "..."}, {"uye": "vatandas", "soz": "..."}]}'
)

# ÇAĞRI 2 — ÇAPRAZ-ELEŞTİRİ + YAKINSAMA + öneriler. Üyelerin GERÇEK açılış pozisyonlarını görür →
# genuine yanıt (tek-çağrı self-debate anlaşmaya çöker; ayrı çağrı gerçek karşı-çıkış üretir).
# Tit-for-tat Level-2: anlaşmazlık zorunlu ama amaç DOĞRULUK, kazanmak değil. Sahte oybirliği yok.
_SYSTEM_MUZAKERE = (
    "Sen bir kamu kurumu 'Bürokrasi Kurulu' müzakeresinin ÇAPRAZ-ELEŞTİRİ ve YAKINSAMA turunu canlandıran "
    "uzman bir asistansın. Sana taslak + sinyaller + üyelerin AÇILIŞ pozisyonları verilecek. Şimdi üyeler "
    "BİRBİRİNE YANIT VERİR — gerçek bir tartışma, herkes aynı şeyi söylemez:\n"
    "  • Her tur BİR başka üyeye yanıttır: 'yanit'=yanıt verilen üye id'si (taslakci|hukukcu|vatandas), "
    "'tutum'={katil|karsi|gelistir}.\n"
    "  • Önce o üyenin SOMUT noktasına AD'la değin, sonra KENDİ gerekçeni ver. Amaç DOĞRU sonuç — "
    "tartışmayı KAZANMAK değil. Fikir değiştiriyorsan NEYİN değiştirdiğini söyle.\n"
    "  • hukukcu şüpheci kalır; taslakci biçimi savunur ama kanıt karşısında düzeltmeyi kabul "
    "edebilir; vatandas muhatabın karşılığını (cevapsız talep, hak arama yolu, anlaşılırlık) "
    "kovalar. Herkes KENDİ ŞERİDİNDE kalır. 3-4 çapraz tur üret (üye başına 1-2 CÜMLE — uzun paragraf yazma, "
    "yanıtın kesilirse tur tamamen kaybolur); SAHTE OYBİRLİĞİ YAPMA — çözülmemiş itiraz varsa "
    "açıkça bırak. En çok 4 öneri ver: aynı satıra iki öneri yazma.\n"
    + _EDIT_KURAL + "\n"
    "Türkçe, resmî, 3. tekil/edilgen. Emoji yok. Karar/oy verme (sistem hesaplar).\n"
    'YALNIZ şu şemada JSON döndür (örnek): {"turlar": [{"uye": "hukukcu", "yanit": "taslakci", '
    '"tutum": "karsi", "soz": "Yapıyı savundun ama İlgi tarihi kaynakta yok; bu satır kalamaz."}], '
    '"oneriler": [{"tip": "cikar", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.", '
    '"aciklama": "İlgi tarihi doğrulanamadı."}, {"tip": "duzelt", "dayanak": "uslup", '
    '"capa": "Gereğini rica ederim.", "yeni": "Bilgilerinize rica ederim.", "aciklama": "Cevabi yazı kapanışı."}]}'
)


# ÇAĞRI 3+ — DENETİM turu: kurul KENDİ REVİZESİNİ ölçüme karşı sınar. Buradaki tek yeni bilgi
# YENİDEN ÖLÇÜLMÜŞ sinyallerdir; "düzelttim" iddiası değil ölçüm konuşur. Hukukçunun itirazı
# gerçekten düştüyse bunu AÇIKÇA kabul etmesi istenir (sahte şüphecilik de sahte uzlaşı kadar
# zararlı: memur her turda aynı uyarıyı görürse kurula güvenmeyi bırakır).
_SYSTEM_DENETIM = (
    "Sen bir kamu kurumu 'Bürokrasi Kurulu' müzakeresinin DENETİM turunu canlandıran uzman bir "
    "asistansın. Önceki turun önerileri taslağa DETERMİNİSTİK olarak uygulandı ve taslağın "
    "doğrulama sinyalleri REVİZE METİN ÜZERİNDE YENİDEN ÖLÇÜLDÜ. Sana revize taslak, ölçümün "
    "DÜŞEN/DURAN/YENİ uyarı listesi ve son turun sözleri veriliyor. Ölçüm HAZIR verilmiştir: "
    "yeniden hesaplama, kendi belleğinden itiraz üretme. Kurul şimdi KENDİ İŞİNİ DENETLER:\n"
    "  • hukukcu: itirazların GERÇEKTEN düştü mü? Yeni ölçüme bak. Düşenleri AÇIKÇA kabul et "
    "(tutum='katil'), DURAN itirazı adıyla söyle ve ancak o zaman yeni öneri ver.\n"
    "  • taslakci: revizyon biçimi bozdu mu — satır düştü mü, zorunlu bölüm eksildi mi.\n"
    "  • vatandas: ölçümde CEVAPSIZ TALEP kaldıysa onu adıyla söyle (kalmadıysa kabul et); "
    "revizyon metni muhatap için anlaşılmaz hâle getirdi mi.\n"
    "KURAL: ölçüm temizse 'giderildi' demek GEÇERLİ ve yeterli bir turdur — devam etmek için "
    "sorun UYDURMA. Ölçümde DURAN uyarı varsa sahte uzlaşı da yapma. 2-3 tur, üye başına "
    "1 CÜMLE (kesilirse tur tamamen kaybolur); yalnız DURAN/YENİ uyarılar için, en çok 2 öneri.\n"
    + _EDIT_KURAL + "\n"
    "Türkçe, resmî, 3. tekil/edilgen. Emoji yok. Karar/oy verme (sistem hesaplar).\n"
    'YALNIZ şu şemada JSON döndür: {"turlar": [{"uye": "hukukcu", "yanit": "taslakci", '
    '"tutum": "katil", "soz": "İlgi satırı kaldırıldı; doğrulama uyarısı ölçümde düştü."}], '
    '"oneriler": []}'
)


def kurul_karar(bant: str, itiraz_sayisi: int) -> str:
    """Risk etiketi (yalnız frontend ROZETİNE çevrilir): kırmızı→sevk · sarı/itiraz→şerhli ·
    yeşil→uzlaşı. Sevk/mühür TÖRENİ yok — revize taslağı her bantta uygulanabilir."""
    if bant == "kirmizi":
        return "sevk"
    if bant == "sari" or itiraz_sayisi:
        return "serhli"
    return "uzlasti"


# Talep eşleştirmede AYIRT EDİCİ olmayan bürokratik dolgu — "talep/rica/gereği" her dilekçede
# geçer; eşleşme sayılırsa her talep "karşılanmış" görünür. muzakere.js DOLGU_TOKEN ikizi.
_DOLGU_TOKEN = frozenset({
    "talep", "talebi", "talebim", "rica", "gerek", "geregi", "geregini", "husus", "hususunda",
    "konu", "konusunda", "ilgili", "yapilmasini", "yapilmasi", "edilmesi", "edilmesini",
    "ederim", "arz", "basvuru", "basvurum", "dilekce", "tarafinizca", "tarafimiza",
})


def cevapsiz_talepler(taslak_md: str, talepler: list[str] | tuple[str, ...] | None) -> list[str]:
    """Taslakta HİÇ izi olmayan talepler — muhatabın sorusunun cevapsız kalması.

    Kurulun "Muhatap Temsilcisi" şeridinin ÖLÇÜLEBİLİR çapası. Deterministik ve YÜKSEK
    KESİNLİK: yalnız SIFIR örtüşmede işaretlenir (talebin ayırt edici sözcüklerinden hiçbiri
    taslakta geçmiyorsa o talep hiç ele alınmamıştır). Kısmî/dolaylı cevap bilerek
    işaretlenmez — yanlış suçlama, eksik yakalamaktan daha pahalıdır (projenin guard
    felsefesi). `frontend/src/lib/muzakere.js::cevapsizTalepler` ile aynı kural.

    Ölçüme girmesi ŞART: yalnız prompt'a bilgi olarak verilseydi, denetim turunda kurul
    "talepler karşılanıyor" deyip geçebilirdi (2026-08-06 canlı koşumunda tam olarak bu oldu).
    """
    govde = _katla(taslak_md or "")
    out: list[str] = []
    for ham in (talepler or []):
        metin = str(ham or "").strip()
        if not metin:
            continue
        tokenlar = [k for k in (_katla(w) for w in metin.split())
                    if len(k) >= 5 and k not in _DOLGU_TOKEN]
        if tokenlar and not any(k in govde for k in tokenlar):
            out.append(metin)
    return out


def _itiraz_sayisi(sinyaller: dict[str, Any], cevapsiz: list[str] | None = None) -> int:
    """Çözülmemiş itiraz sayısı — şerh/uzlaşı ayrımının deterministik kaynağı (LLM değil).

    Cevapsız talep de itirazdır: muhatabın sorusu yanıtsızken yazı 'uzlaşıldı' sayılamaz.
    """
    lint = sinyaller.get("lint_2646") or {}
    kurallar = lint.get("kurallar") if isinstance(lint, dict) else None
    lint_n = (sum(1 for k in kurallar if isinstance(k, dict) and k.get("durum") == "uyari")
              if isinstance(kurallar, list) else len(lint.get("uyari") or []) if isinstance(lint, dict) else 0)
    nli = sinyaller.get("nli") or []
    nli_zayif = sum(1 for n in nli if isinstance(n, dict) and n.get("entailment") is False)
    return (len(sinyaller.get("verify_uyari") or []) + lint_n + nli_zayif
            + len(sinyaller.get("tutarlilik_uyari") or []) + len(cevapsiz or []))


def _sinyal_ozeti(sinyaller: dict[str, Any], meta: dict[str, Any], taslak_md: str = "") -> str:
    """LLM'e verilen sinyal digest'i — grounding (öneriler yalnız bunlara dayanabilir).

    Her üyenin şeridi burada BESLENİR; digest'te karşılığı olmayan rol boş konuşur. `talepler`
    2026-08-06'da eklendi: muhatabın ne istediği kurula hiç ULAŞMIYORDU (`_skaler_unsurlar`
    listeleri eliyor), dolayısıyla "vatandaşın talebi cevapsız kalmış" hatası — bu sistemin
    en pahalı hata sınıflarından biri, çünkü vatandaş tekrar başvurur — hiç görülemiyordu.
    """
    lint = sinyaller.get("lint_2646") or {}
    lint_uyari = lint.get("uyari") if isinstance(lint, dict) else None
    # İstemci-kontrollü başlıklar → temizle + kısalt (enjeksiyon/DoS guard); yalnız bağlam.
    mevzuat = [_tek_satir(str(m.get("baslik") or ""), 160)
               for m in (meta.get("mevzuat") or [])[:10] if isinstance(m, dict) and m.get("baslik")]
    talepler = [_tek_satir(str(t), 200) for t in (meta.get("talepler") or [])[:8] if str(t).strip()]
    # Her talebin yanına ÖLÇÜLMÜŞ durumu yazılır — üye "karşılandı mı" sorusunu tahminle
    # değil, deterministik kontrolle yanıtlar (aynı kontrol ölçüm defterine de girer).
    bos = set(cevapsiz_talepler(taslak_md, talepler)) if taslak_md else set()
    talep_blok = ("\n".join(
        f"  {i}) {t}" + ("   ← TASLAKTA KARŞILIĞI YOK" if t in bos else "")
        for i, t in enumerate(talepler, 1))
        if talepler else "  (evraktan ayrı talep çıkarılmadı)")
    satir = [
        f"Uydurma-veto/doğrulama uyarıları: {'; '.join(sinyaller.get('verify_uyari') or []) or 'yok'}",
        f"Yönetmelik-2646 lint uyarıları: {'; '.join(lint_uyari or []) or 'yok'}",
        f"Biçim (zorunlu bölümler) uyumlu mu: "
        f"{'HAYIR — eksik bölüm var' if sinyaller.get('format_uyumlu') is False else 'evet'}",
        f"Veri tutarlılığı uyarıları: {'; '.join(sinyaller.get('tutarlilik_uyari') or []) or 'yok'}",
        f"İlgili mevzuat (yalnız BAĞLAM — atıf lisansı değil): {'; '.join(mevzuat[:3]) or 'yok'}",
        f"Risk bandı: {(sinyaller.get('risk_metadata') or {}).get('bant', 'yok')}",
        f"Yazı türü: {meta.get('yazi_turu') or 'belirsiz'}",
        f"EVRAKTAKİ TALEPLER (muhatabın istedikleri — taslakta KARŞILIĞI var mı?):\n{talep_blok}",
    ]
    return "\n".join(satir)


def _normalize_turlar(
    ham: Any, *, tur: int = 0, capraz: bool = False, hedefler: set[str] | None = None,
) -> list[dict[str, Any]]:
    """LLM turlarını kapalı-küme üyeye eşle + gövde temizle; 'tur' etiketi eklenir (0=açılış,
    1=çapraz-eleştiri, 2=moderatör). capraz=True: 'yanit' (kime yanıt) + 'tutum'
    (katil|karsi|gelistir) çözülür — frontend çapraz-referans/durum-geçişi render'ı için.

    'yanit' YALNIZ `hedefler` (gerçekten konuşan üyeler) içinde geçerlidir — transkriptte
    GÖRÜNMEYEN üyeye sarkan referans üretilmez (review bulgusu). 'tutum' 'yanit'a ATOMİK bağlı:
    geçerli yanit yoksa öksüz duruş bırakılmaz.
    """
    hedef_kume = hedefler if hedefler else _UYE_ID
    out: list[dict[str, Any]] = []
    for t in (ham if isinstance(ham, list) else [])[:_MAKS_TUR]:
        if not isinstance(t, dict):
            continue
        who = str(t.get("uye") or "").strip()
        soz = _tek_satir(str(t.get("soz") or ""), 400)
        if who not in _UYE_ID or not soz:
            continue
        item: dict[str, Any] = {"who": who, "kaynak": "muzakere", "text": soz, "tur": tur}
        if capraz:
            yanit = str(t.get("yanit") or "").strip()
            if yanit in hedef_kume and yanit != who:
                item["yanit"] = yanit
                tutum = str(t.get("tutum") or "").strip().lower()
                if tutum in _TUTUM:
                    item["tutum"] = tutum   # tutum yalnız geçerli yanit ile birlikte
        out.append(item)
    return out


def _normalize_oneriler(ham: Any) -> list[dict[str, Any]]:
    """LLM önerilerini kapalı-küme tip/dayanağa eşle + gövde temizle; geçersiz tip düşer.

    `_capa`/`_yeni` transient alanları edit motoruna taşınır; `uygulanabilir` BURADA
    belirlenmez — LLM'in 'uygula' öz-iddiasına GÜVENİLMEZ, final diff'e karşı uzlaştırılır.
    """
    out: list[dict[str, Any]] = []
    for o in (ham if isinstance(ham, list) else [])[:_MAKS_ONERI]:
        if not isinstance(o, dict):
            continue
        tip = str(o.get("tip") or "").strip().lower()
        metin = _tek_satir(str(o.get("aciklama") or ""), 300)
        if tip not in _ONERI_TIP or not metin:
            continue
        dayanak = str(o.get("dayanak") or "muzakere").strip().lower()
        out.append({
            "tip": tip, "kaynak": dayanak if dayanak in _DAYANAK else "muzakere",
            "metin": metin, "uygulanabilir": False,
            "_capa": _tek_satir(str(o.get("capa") or ""), 400),
            "_yeni": _tek_satir(str(o.get("yeni") or ""), 400),
        })
    return out


def _katla(s: str) -> str:
    """Türkçe harf-katlamalı normalize — muzakere.js trKatla ikizi (çapa eşleştirme)."""
    return "".join(
        c for c in (_KATLA_MAP.get(ch, ch).lower() for ch in str(s)) if c.isalnum()
    )


def _capa_coz(satirlar: list[str], capa: str) -> tuple[int, float] | None:
    """Çapayı TEK kesin satıra çöz → (idx, kapsam); yok/çoklu eşleşme → None (yanlış-satır guard).

    kapsam = çapanın o satırı ne kadar kapladığı (aşırı-silme guard'ı 'cikar'da bunu kullanır).
    """
    c = _katla(capa)
    if len(c) < _MIN_CAPA:
        return None
    # Çapa herhangi bir TEK satırdan uzunsa satırlara yayılıyordur (LLM iki satırı birleştirmiş) —
    # "en büyük parça"yı kazandırıp YANLIŞ satırı silmek yerine belirsiz say (adversarial bulgu).
    if len(c) > max((len(_katla(s)) for s in satirlar), default=0):
        return None
    eslesme: list[tuple[int, float]] = []
    for i, s in enumerate(satirlar):
        ks = _katla(s)
        if len(ks) < 4:
            continue
        if c in ks:
            eslesme.append((i, len(c) / len(ks)))
        elif ks in c and len(ks) >= 0.6 * len(c):
            eslesme.append((i, 1.0))
    return eslesme[0] if len(eslesme) == 1 else None


# Ad/kurum/unvan adayı: 2+ ardışık Büyük-harf sözcük dizisi ("Ahmet Yılmaz", "Şube Müdürü").
# Tek Büyük-harf sözcük (cümle başı "Başvurunuz") üslup değişikliğidir, uydurma sayılmaz.
_BUYUK_DIZI = re.compile(r"(?:[A-ZÇĞİÖŞÜ][^\W\d_]+['’]?\s+){1,}[A-ZÇĞİÖŞÜ][^\W\d_]+")


def _atiflar(metin: str) -> set[str]:
    """Kanun/madde atıflarını NORMALİZE token kümesine indir — yüzeysel biçimden bağımsız
    ("657 sayılı" ↔ "657 Sayılı", "m.11" ↔ "11 inci madde" aynı token). Grounding karşılaştırması."""
    out: set[str] = set()
    for i, desen in enumerate(_ATIF_DESENLERI):
        etiket = "s" if i in (0, 4) else "m"   # 0=sayılı, 4=kararname → 's'; madde/m. → 'm'
        out.update(etiket + m.group(1) for m in desen.finditer(metin))
    return out


def _yeni_uydurma(orijinal: str, yeni: str) -> bool:
    """duzelt 'yeni'si, orijinalde OLMAYAN somut olgu ekliyor mu (CLAUDE.md §1 — SIFIR UYDURMA).

    Üslup değişikliği (küçük-harf yeniden ifade, sözcük atma) SERBEST; ama yeni bir SAYISAL token
    (tarih/sayı/kimlik), yeni kanun/madde ATFI ya da yeni AD/KURUM/UNVAN dizisi eklemek uydurmadır
    → edit reddedilir, tavsiye kalır. (Yalnız kanun/madde bakmak yetmez — adversarial bulgu:
    'Ahmet Yılmaz'ın 10.01.2020 tarihli' gibi ad+tarih enjeksiyonu da yakalanmalı.)
    """
    if set(re.findall(r"\d+", yeni)) - set(re.findall(r"\d+", orijinal)):
        return True                                    # yeni sayı/tarih/kimlik
    if _atiflar(yeni) - _atiflar(orijinal):
        return True                                    # yeni kanun/madde atfı
    o_fold = _katla(orijinal)
    return any(_katla(m.group(0)) not in o_fold for m in _BUYUK_DIZI.finditer(yeni))  # yeni ad/unvan


_SINYAL_ESIK = 8   # çapa satırı ↔ uyarı ortak-katlanmış-substring eşiği (kısa ortak sözcük çakışmasını eler)


def _cikar_sinyalli(satir: str, sinyaller: dict[str, Any]) -> bool:
    """cikar YALNIZ gerçek sinyalin (verify/tutarlılık) işaretlediği içeriği kaldırır — LLM'in
    satır seçimine körü körüne güvenilmez (adversarial bulgu). Uyarılar işaretli içeriği ALINTILAR;
    satırın katlanmış hâli uyarı metinleriyle ≥8 karakter ortak dizi paylaşıyorsa grounded'dır
    (kısa ortak sözcük — 'ilgi' vb. — çakışmasını eler; meşru gövde/imza tavsiyede kalır)."""
    uyari_fold = _katla(" ".join(
        (sinyaller.get("verify_uyari") or []) + (sinyaller.get("tutarlilik_uyari") or [])
    ))
    if not uyari_fold:
        return False
    sf = _katla(satir)
    if len(sf) < _SINYAL_ESIK:
        return len(sf) >= 5 and sf in uyari_fold          # çok kısa satır → tam eşleşme
    return any(sf[i:i + _SINYAL_ESIK] in uyari_fold for i in range(len(sf) - _SINYAL_ESIK + 1))


# Yapısal satır — biçimin taşıyıcısı; risk sinyali işaretlese bile ASLA çıkarılmaz (duzelt olabilir).
_KORUNAN_SATIR = re.compile(r"^\s*(T\.C\.|Konu\s*:)", re.IGNORECASE)

# Etiketli alan satırı (Yön. 2646 zorunlu/yaygın alanlar) — cikar bu satırı TAMAMEN SİLMEZ,
# DOLDURULACAK yer tutucuya çevirir: taslak yapısal olarak eksiksiz/gönderime-yakın kalır,
# memur eksik alanı "yok olmuş" değil "tamamlanacak" olarak görür ([DOĞRULA] deseni, CLAUDE.md §1).
_ETIKET_SATIR = re.compile(r"^\s*(Sayı|İlgi|Koordinasyon|Belge Doğrulama Kodu)\s*:\s*", re.IGNORECASE)
_DOGRULA_YER_TUTUCU = "[DOĞRULA: kaynak evrakta doğrulanamadı]"


def _capali_edit(
    oneri: dict[str, Any], satirlar: list[str], taslak_md: str, sinyaller: dict[str, Any],
) -> dict[str, Any] | None:
    """Öneriyi grounded bir edit'e çöz (uygulanabilirse) ya da None (tavsiye kalır).

    cikar = tam satır sil — YALNIZ (a) çapa satırın ≥%60'ı, (b) yapısal DEĞİL, (c) gerçek sinyalin
            işaretlediği içerik; ETİKETLİ ALAN satırıysa (Sayı/İlgi/…) silinmez, alan adı korunarak
            '[DOĞRULA: …]' yer tutucusuyla değiştirilir (taslak gönderime-hazır KALIR — boş alan
            değil, görünür TODO). duzelt = satırı 'yeni' ile değiştir — 'yeni' uydurma olgu (sayı/
            tarih/ad/atıf) EKLEMEZ. ekle = yeni içerik enjeksiyonu (uydurma riski) → ASLA otomatik.
    Dönen edit `oneri`yi taşır (attribution) — uygulanabilirlik metin-çıkarımıyla DEĞİL, hangi
    önerinin hangi edit'i ürettiğiyle belirlenir.
    """
    tip = oneri.get("tip", "")
    if tip == "ekle":
        return None
    coz = _capa_coz(satirlar, oneri.get("_capa", ""))
    if coz is None:
        return None
    idx, kapsam = coz
    satir = satirlar[idx]
    if tip == "cikar":
        if kapsam < _CIKAR_MIN_KAPSAM or _KORUNAN_SATIR.match(satir) or not _cikar_sinyalli(satir, sinyaller):
            return None
        etiket = _ETIKET_SATIR.match(satir)
        if etiket:
            oneri["tip"] = "duzelt"   # gerçekte uygulanan işlemi yansıt (rozet artık 'Düzelt')
            return {"idx": idx, "op": "duzelt", "yeni": f"{etiket.group(0)}{_DOGRULA_YER_TUTUCU}", "oneri": oneri}
        return {"idx": idx, "op": "cikar", "oneri": oneri}
    yeni = oneri.get("_yeni", "")
    if not yeni or _katla(yeni) == _katla(satir) or _yeni_uydurma(taslak_md, yeni):
        return None
    return {"idx": idx, "op": "duzelt", "yeni": yeni, "oneri": oneri}


def _editleri_uygula(
    satirlar: list[str], editler: list[dict[str, Any]],
) -> tuple[list[str], list[dict[str, Any]]]:
    """Grounded editleri DETERMİNİSTİK uygula (saf) → (yeni satırlar, UYGULANAN editler).
    Satır başına ilk edit kazanır (dedup); dönen 'uygulanan' attribution'ın tek kaynağıdır —
    aynı satıra iki öneri çarparsa yalnız kazanan 'işlendi' sayılır (adversarial bulgu: dup-çapa)."""
    idx_edit: dict[int, dict[str, Any]] = {}
    for e in editler:
        idx_edit.setdefault(e["idx"], e)
    out: list[str] = []
    uygulanan: list[dict[str, Any]] = []
    for i, s in enumerate(satirlar):
        e = idx_edit.get(i)
        if e is None:
            out.append(s)
            continue
        uygulanan.append(e)
        if e["op"] == "duzelt":
            out.append(e["yeni"])
        # cikar → satır düşürülür
    return out, uygulanan


# Birim Amiri (4. üye) sözü DETERMİNİSTİK — gerçek risk bandından türer (LLM üretmez; kapalı-küme
# dışıdır). Risk sesi asla halüsinasyon olmaz, hem LLM hem deterministik fallback yolunda tutarlı.
_RISK_SOZ = {
    "kirmizi": ("Risk bandı kırmızı — doğrulanamayan/uydurma bilgi şüphesi var. Bu yazı memur "
                "teyidi olmadan gönderilmemeli; kuruldaki revize düzeltmelerini destekliyorum."),
    "sari": ("Risk bandı sarı — çekinceler giderilmeden gönderime çıkmamalı; revize sonrası "
             "tekrar değerlendirilmeli."),
    "yesil": ("Risk bandı yeşil — biçim ve dayanak yönünden gönderime engel görmüyorum; "
              "revize önerileri son hâli güçlendirir."),
}


def _yakinsama_cumlesi(y: dict[str, Any] | None) -> str:
    """Müzakerenin ÖLÇÜLEN sonucu — LLM iddiası değil, yeniden ölçüm.

    "revize uygulanırsa" şart kipi bilinçli: taslak henüz DEĞİŞMEDİ (kalıcı yazım memurun
    kararı — HITL). Ölçüm yoksa (tek tur / ölçer yok) cümle üretilmez: kanıtsız kazanım
    iddia edilmez.

    ÜÇ SAYI ayrı ayrı söylenir (2026-08-06 canlı koşum bulgusu): yalnız NET fark söylemek
    yanıltıyordu — kurulun 2 uyarıyı düşürüp revizyonuyla 2 YENİ uyarı ürettiği koşumda
    net fark 0 çıkıyor ve rapor "hiçbir şey çözülmedi" diyordu; oysa gerçek olay bambaşka
    ve memurun bilmesi gereken şey tam olarak "revizyon yeni sorun üretti" bilgisiydi.
    """
    if not y or not y.get("olculdu"):
        return ""
    tur, dusen, duran, yeni = y.get("tur", 0), y.get("dusen", 0), y.get("duran", 0), y.get("yeni", 0)
    bas = f"Kurul {tur} turda çalıştı: revize uygulanırsa "
    parcalar = []
    if dusen:
        parcalar.append(f"işaretli {dusen} uyarı düşüyor")
    if duran:
        parcalar.append(f"{duran} uyarı DURUYOR")
    if yeni:
        parcalar.append(f"revizyonun kendisi {yeni} YENİ uyarı üretiyor")
    if not parcalar:
        return f"{bas}ölçülen uyarı tablosu değişmiyor (yeniden ölçüldü)."
    son = "; ".join(parcalar)
    kuyruk = (" — bu hâliyle gönderilemez, kalanı memur değerlendirmeli."
              if (duran or yeni) else " (revize metin üzerinde yeniden ölçüldü).")
    return f"{bas}{son}{kuyruk}"


def _birim_amiri_turu(bant: str, yakinsama: dict[str, Any] | None = None) -> dict[str, str]:
    """Risk bandını sahiplenen kapanış sesi — bant'a göre deterministik (LLM'e bırakılmaz).
    Müzakere ölçüldüyse kazanım/kalan cümlesi eklenir (yine deterministik, sayımdan)."""
    soz = _RISK_SOZ.get(bant, "Risk değerlendirmesi için yeterli sinyal yok; gönderim öncesi "
                              "memur kontrolü önerilir.")
    ek = _yakinsama_cumlesi(yakinsama)
    return {"who": "birim_amiri", "kaynak": "risk_guard", "text": f"{soz} {ek}".strip()}


def _uzlasi_gecerli(orijinal: str, uzlasi: str) -> bool:
    """Uzlaşı metni güvenli mi — revize-guard + aşırı-uzama + mevzuat GROUNDING.

    Yalnız-uzunluk yetmez (adversarial bulgu): (1) revize-guard (boş/şüpheli-kısalma),
    (2) aşırı-uzama (sessiz padding), (3) orijinalde OLMAYAN kanun/madde atıfı → uydurma,
    reddedilir (CLAUDE.md §1). Reddedilirse çağıran orijinali korur (sahte revizyon yok).
    """
    if not _revize_metin_gecerli(orijinal, uzlasi):
        return False
    if len(uzlasi) > _UZLASI_MAKS_ORAN * max(len(orijinal), 1):
        log.warning("kurul_uzlasi_asiri_uzama", n_once=len(orijinal), n_sonra=len(uzlasi))
        return False
    yeni_atif = _atiflar(uzlasi) - _atiflar(orijinal)
    if yeni_atif:
        log.warning("kurul_uzlasi_uydurma_atif", atiflar=sorted(yeni_atif)[:5])
        return False
    return True


def _user_mesaji(taslak_md: str, sinyaller: dict[str, Any], meta: dict[str, Any]) -> str:
    """Her turun ortak girdisi: O ANKİ taslak + O ANKİ (denetim turunda yeniden ölçülmüş) sinyaller."""
    return (
        f"GÜNCEL TASLAK:\n{taslak_md}\n\n"
        f"GERÇEK DOĞRULAMA SİNYALLERİ:\n{_sinyal_ozeti(sinyaller, meta, taslak_md)}"
    )


def _kurul_hazirla(
    taslak_md: str, meta: dict[str, Any], sinyaller: dict[str, Any],
) -> tuple[str, int, str, str] | None:
    """Guard + ortak hazırlık → (bant, itiraz, karar, user); LLM yok / taslak uzun → None.
    KARAR daima SUNUCU sinyalinden (istemci mevzuat_nli karara girmez — adversarial bulgu)."""
    if real_llm() is None:
        return None
    if len(taslak_md) > _REVIZE_MAX_TASLAK_CHARS:
        log.warning("kurul_taslak_cok_uzun", n_char=len(taslak_md))
        return None
    bant = str((sinyaller.get("risk_metadata") or {}).get("bant") or "")
    # Cevapsız talep KARARA girer: muhatabın sorusu yanıtsızken yazı "uzlaşıldı" sayılamaz.
    itiraz = _itiraz_sayisi(sinyaller, cevapsiz_talepler(taslak_md, meta.get("talepler")))
    karar = kurul_karar(bant, itiraz)
    return bant, itiraz, karar, _user_mesaji(taslak_md, sinyaller, meta)


async def _kurul_acilis(user: str) -> list[dict[str, Any]] | None:
    """ÇAĞRI 1 — AÇILIŞ turu: bağımsız ilk pozisyonlar (temp↑ → çeşitlilik). Boş → None.

    Süre bütçesi müzakere turundan KISA: açılış 3 kısa pozisyondur, uzaması bir sorun
    işaretidir ve tüm turların bütçesini yemeden fallback'e düşmesi daha iyidir.
    """
    obj0 = await llm_json(_SYSTEM_ACILIS, user, max_tokens=_ACILIS_TOKENS, temperature=0.5,
                          timeout_s=_sure("KURUL_ACILIS_TIMEOUT_S", _ACILIS_SURE_VARSAYILAN))
    return _normalize_turlar(obj0.get("turlar") if isinstance(obj0, dict) else None, tur=0) or None


def _uyarilar(sinyaller: dict[str, Any], cevapsiz: list[str] | None = None) -> list[str]:
    """Kurulun ÖLÇÜM DEFTERİ: verify + lint + tutarlılık + cevapsız talep — tur-arası fark için.

    Cevapsız talep buraya girer ki üç üyenin şeridi de AYNI ölçüme tabi olsun: revizyon bir
    talebi karşıladıysa "düşen", karşılamadıysa "duran" olarak sayılır ve denetim turunda
    Muhatap Temsilcisi ölçümle yüzleşir (yoksa "karşılanıyor" deyip geçiyordu).
    """
    lint = sinyaller.get("lint_2646") or {}
    return [
        *(sinyaller.get("verify_uyari") or []),
        *((lint.get("uyari") or []) if isinstance(lint, dict) else []),
        *(sinyaller.get("tutarlilik_uyari") or []),
        *(f"Cevapsız talep: {t}" for t in (cevapsiz or [])),
    ]


def _olcum_notu(once: list[str], sonra: list[str], editler: list[dict[str, Any]]) -> str:
    """Denetim turunun ÇEKİRDEK girdisi: ne yapıldı ve ölçüm ne dedi — HAZIR fark.

    Farkı modele hesaplatmak yerine vermek iki şeyi birden düzeltir: (1) kalite — kurul
    "giderildi mi" sorusunu ölçüme bakarak yanıtlar, kendi belleğine göre değil; (2) maliyet —
    2026-08-06 ölçümünde denetim turu tüm transkripti yeniden akıl yürüterek 7700 token'lık
    tavanı aşıp KESİLİYOR ve tur tamamen kayboluyordu.
    """
    dusen = [u for u in once if u not in sonra]
    duran = [u for u in sonra if u in once]
    yeni = [u for u in sonra if u not in once]
    yapilan = "\n".join(
        f"  - {'ÇIKARILDI' if e['op'] == 'cikar' else 'DÜZELTİLDİ'}: "
        f"{_tek_satir(str(e['oneri'].get('metin', '')), 160)}" for e in editler) or "  - (yok)"
    def _blok(ad: str, liste: list[str]) -> str:
        return f"{ad}:\n" + ("\n".join(f"  - {_tek_satir(u, 200)}" for u in liste) or "  - (yok)")
    return (
        f"ÖNCEKİ TURDA UYGULANAN DÜZELTMELER:\n{yapilan}\n\n"
        "REVİZE METİN ÜZERİNDE YENİDEN ÖLÇÜM (sistemin ölçtüğü GERÇEK sonuç):\n"
        f"{_blok('  DÜŞEN uyarılar (giderildi)', dusen)}\n"
        f"{_blok('  DURAN uyarılar (giderilemedi)', duran)}\n"
        f"{_blok('  YENİ çıkan uyarılar (revizyonun yan etkisi)', yeni)}"
    )


def _oneri_anahtar(o: dict[str, Any]) -> tuple[str, str]:
    """Tur-ötesi tekrar guard'ı: aynı satıra aynı işlemi öneren tur, tutanağı şişirmesin."""
    return o.get("tip", ""), _katla(o.get("_capa", ""))


def _tur_editleri(
    ham_oneriler: list[dict[str, Any]], taslak_md: str, sinyaller: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    """Bir turun önerilerini GÜNCEL taslağa çöz → (yeni taslak, UYGULANAN editler).

    Revize = grounded çapalı editlerin DETERMİNİSTİK toplamı, NE FAZLA NE EKSİK. LLM'in
    holistik yeniden-yazımı KULLANILMAZ (attribution kopar + uydurma sızabilir).
    """
    satirlar = taslak_md.split("\n")
    editler = [
        e for o in ham_oneriler
        if (e := _capali_edit(o, satirlar, taslak_md, sinyaller)) is not None
    ]
    yeni_satirlar, uygulanan = _editleri_uygula(satirlar, editler)
    return "\n".join(yeni_satirlar), uygulanan


async def _kurul_akisi(
    taslak_md: str, *, meta: dict[str, Any], sinyaller: dict[str, Any], bant: str, karar: str,
    itiraz: int, acilis: list[dict[str, Any]], olc: Olcer | None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """YAKINSAMA DÖNGÜSÜ — her tur bitince ('tur', {...}), sonunda ('sonuc', kurgu) yield eder.

    Tur 1 çapraz-eleştiri, tur 2+ DENETİM: önceki turun editleri uygulanmış taslağın sinyalleri
    `olc` ile YENİDEN ÖLÇÜLÜR ve kurul ölçüme bakarak devam eder. Döngü üç koşuldan biriyle biter:
      · itiraz sayısı 0 (ölçüm temiz — sürdürmek uydurma üretir),
      · turda uygulanabilir yeni edit çıkmadı (tartışacak somut bir şey kalmadı),
      · tur bütçesi doldu (`KURUL_MUZAKERE_TURU`).
    `olc` yoksa döngü İLK turdan sonra durur: ölçüm olmadan denetim turu KANITSIZ olur ve
    "düzelttim" iddiasını doğrulayamaz — kurulun bütün değeri ölçüme dayanmasıdır.
    """
    orijinal = taslak_md
    talepler = meta.get("talepler") or []
    # Ölçüm defteri = doğrulama sinyalleri + CEVAPSIZ TALEPLER (üç şerit de aynı ölçüme tabi).
    ilk_uyari = _uyarilar(sinyaller, cevapsiz_talepler(taslak_md, talepler))  # fark BAŞLANGICA karşı
    guncel, guncel_sinyaller, itiraz_son = taslak_md, sinyaller, itiraz
    turlar_hepsi = list(acilis)
    oneriler_hepsi: list[dict[str, Any]] = []
    uygulanan_id: set[int] = set()
    gorulen: set[tuple[str, str]] = set()
    transkript = [f"{_AD.get(t['who'], t['who'])}: {t['text']}" for t in acilis]
    olculdu, n_tur, olcum_notu = False, 0, ""

    for i in range(_muzakere_turu()):
        capraz_tur = i == 0
        etiket = _TUR_CAPRAZ if capraz_tur else _TUR_DENETIM_BAS + (i - 1)
        if capraz_tur:
            user = (f"{_user_mesaji(guncel, guncel_sinyaller, meta)}\n\n"
                    "AÇILIŞ TURU (üyelerin ilk pozisyonları):\n" + "\n".join(transkript))
        else:
            # Denetim turuna TÜM transkript gitmez: girdi her turda büyürse hem düşünme
            # maliyeti hem kesilme riski büyür (ölçüldü). Gereken üç şey verilir: revize
            # metin, HAZIR ölçüm farkı ve son turun sözleri.
            user = (f"{_user_mesaji(guncel, guncel_sinyaller, meta)}\n\n{olcum_notu}\n\n"
                    "SON TURDA SÖYLENENLER:\n" + "\n".join(transkript[-_SON_TUR_SOZ:]))
        # Düşünme YALNIZ çapraz turda açık: orada kurul gerçekten muhakeme eder (kim haklı,
        # hangi itiraz taşır). Denetim turunda gerçekler HAZIR verilir (ölçüm farkı) ve iş
        # "ölçüme bakıp kabul et ya da duran itirazı söyle"ye iner; düşünme orada katkı
        # üretmeden çıktı bütçesini tüketip yanıtı KESİYORDU (2026-08-06: iki denemede de
        # tokens_out=7700 tavan, JSON yarım, tur tamamen kayboldu).
        obj = await llm_json(
            _SYSTEM_MUZAKERE if capraz_tur else _SYSTEM_DENETIM,
            user, max_tokens=_MAKS_TOKENS, temperature=0.45,
            timeout_s=_sure("KURUL_TUR_TIMEOUT_S", _TUR_SURE_VARSAYILAN),
            dusunme_kapali=not capraz_tur)
        if not isinstance(obj, dict):
            break
        # 'yanit' YALNIZ ŞİMDİYE KADAR KONUŞAN üyelere geçerli (sarkan referans yok — review bulgusu).
        konusanlar = {t["who"] for t in turlar_hepsi}
        yeni_turlar = _normalize_turlar(obj.get("turlar"), tur=etiket, capraz=True, hedefler=konusanlar)
        ham = [o for o in _normalize_oneriler(obj.get("oneriler"))
               if _oneri_anahtar(o) not in gorulen]
        gorulen.update(_oneri_anahtar(o) for o in ham)
        if not yeni_turlar and not ham:
            break            # boş/kullanışsız tur — sürdürmek yalnız gecikme üretir
        n_tur += 1
        turlar_hepsi.extend(yeni_turlar)
        oneriler_hepsi.extend(ham)
        transkript.extend(f"{_AD.get(t['who'], t['who'])}: {t['text']}" for t in yeni_turlar)
        aday, uygulanan = _tur_editleri(ham, guncel, guncel_sinyaller)
        # Turu HEMEN yayınla (canlı akış): memur müzakereyi oluşurken izler, sonuç beklemez.
        yield "tur", {"tur": etiket, "turlar": yeni_turlar}
        if not uygulanan:
            break            # yeni uygulanabilir edit yok → denetlenecek değişiklik de yok
        onceki_taslak, guncel = guncel, aday
        uygulanan_id |= {id(e["oneri"]) for e in uygulanan}
        if olc is None:
            break            # ölçüm yok → denetim turu kanıtsız kalırdı (dürüstlük sınırı)
        # Ölçüm SON turdan sonra da koşar: bir sonraki turu beslemese bile memura verilen
        # "revize uygulanırsa şu kadar uyarı düşer" raporunun KANITI budur. verify+risk_guard
        # varsayılan yapılandırmada deterministiktir (LLM çağrısı değil) — bedeli düşük.
        onceki_uyari = _uyarilar(guncel_sinyaller, cevapsiz_talepler(onceki_taslak, talepler))
        try:
            guncel_sinyaller = await olc(guncel)
        except Exception as exc:
            log.warning("kurul_yeniden_olcum_failed", error=str(exc) or type(exc).__name__)
            break            # ölçemiyorsak körlemesine tartışmayız
        olculdu = True
        cevapsiz = cevapsiz_talepler(guncel, talepler)   # revizyon talebi karşıladı mı — ÖLÇÜLÜR
        olcum_notu = _olcum_notu(onceki_uyari, _uyarilar(guncel_sinyaller, cevapsiz), uygulanan)
        itiraz_son = _itiraz_sayisi(guncel_sinyaller, cevapsiz)
        if itiraz_son == 0:
            break            # ölçüm temiz — kurul işini bitirdi

    if not turlar_hepsi[len(acilis):] and not oneriler_hepsi:
        return               # hiç müzakere olmadı → deterministik fallback daha iyi

    # KÜMÜLATİF GUARD: her tur tek başına makul görünse de TOPLAM daralma/uydurma belgeyi
    # çökertebilir (tur başına %20 kısalma iki turda %36 eder). Bu yüzden final metin daima
    # ORİJİNALE karşı sınanır; geçmezse revizenin TAMAMI düşer, orijinal korunur.
    if uygulanan_id and _uzlasi_gecerli(orijinal, guncel):
        uzlasi_metni = guncel
    else:
        uzlasi_metni, uygulanan_id, itiraz_son = orijinal, set(), itiraz

    oneriler = [
        {k: v for k, v in o.items() if k not in ("_capa", "_yeni")}
        | {"uygulanabilir": id(o) in uygulanan_id}
        for o in oneriler_hepsi
    ]
    # Rapor farkı: BAŞLANGIÇ uyarıları ↔ SON ölçüm. Üç sayı ayrı taşınır (net fark yanıltır).
    son_uyari = (_uyarilar(guncel_sinyaller, cevapsiz_talepler(guncel, talepler))
                 if uygulanan_id else ilk_uyari)
    yakinsama = {
        "tur": n_tur, "olculdu": olculdu and bool(uygulanan_id),
        "itiraz_ilk": itiraz, "itiraz_son": itiraz_son,
        "dusen": sum(1 for u in ilk_uyari if u not in son_uyari),
        "duran": sum(1 for u in son_uyari if u in ilk_uyari),
        "yeni": sum(1 for u in son_uyari if u not in ilk_uyari),
        # Geriye-uyum: 'cozulen' = gerçekten DÜŞEN uyarı sayısı (net fark değil), 'kalan' =
        # revize sonrası toplam. Frontend üç sayıyı ayrı gösterir.
        "cozulen": sum(1 for u in ilk_uyari if u not in son_uyari), "kalan": itiraz_son,
    }
    uzlasi_degisti = uzlasi_metni.strip() != orijinal.strip()
    # Turlar = AÇILIŞ (0) + ÇAPRAZ (1) + DENETİM (2+) + Moderatör/Birim Amiri (9, deterministik).
    # KARAR ilk sinyalden gelir ve DEĞİŞMEZ: rozet ELDEKİ taslağı anlatır, revize henüz
    # uygulanmadı (uygulanırsa ne olacağı `yakinsama`da ayrıca ve ölçümle söylenir).
    turlar = [*turlar_hepsi, {**_birim_amiri_turu(bant, yakinsama), "tur": _TUR_KARAR}]

    log.info("kurul_muzakere", karar=karar, n_tur=n_tur, n_turlar=len(turlar),
             n_oneri=len(oneriler), n_edit=len(uygulanan_id), uzlasi_degisti=uzlasi_degisti,
             itiraz_ilk=itiraz, itiraz_son=itiraz_son, olculdu=yakinsama["olculdu"])
    yield "sonuc", {
        "kaynak": "llm", "karar": karar, "turlar": turlar, "oneriler": oneriler,
        "uzlasi_metni": uzlasi_metni, "uzlasi_degisti": uzlasi_degisti,
        # Revize her bantta uygulanabilir (yüksek riskte bile: revizyon riski GİDERİR). Karar yalnız rozet.
        "uzlasi_uygulanabilir": uzlasi_degisti, "yakinsama": yakinsama,
    }


async def kurul_muzakere(
    taslak_md: str, *, meta: dict[str, Any], sinyaller: dict[str, Any], olc: Olcer | None = None,
) -> dict[str, Any] | None:
    """DeepSeek çok-turlu debate (açılış → çapraz → denetim…) → tam kurgu; LLM yok/mock/hata → None.

    `olc`: revize taslağın sinyallerini YENİDEN ÖLÇEN geri çağrı (api.routes.yazi enjekte eder).
    Verilmezse döngü tek turda kalır — bugünkü davranış korunur (ölçümsüz denetim yapılmaz).
    Karar sunucuda deterministik; öneriler anchored-edit'ten geçer (sahte/uydurma revizyon yok)."""
    sonuc: dict[str, Any] | None = None
    async for tip, veri in kurul_muzakere_stream(taslak_md, meta=meta, sinyaller=sinyaller, olc=olc):
        if tip == "sonuc":
            sonuc = veri
    return sonuc


async def kurul_muzakere_stream(
    taslak_md: str, *, meta: dict[str, Any], sinyaller: dict[str, Any], olc: Olcer | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """CANLI AKIŞ: ('acilis', {turlar}) → her müzakere turu için ('tur', {tur, turlar}) →
    ('sonuc', tam kurgu). LLM yok/hata → hiçbir şey yield etmez (çağıran deterministik fallback'e
    düşer). `kurul_muzakere` bu akışın son adımını döndürür — TEK kod yolu, iki sözleşme."""
    hz = _kurul_hazirla(taslak_md, meta, sinyaller)
    if hz is None:
        return
    bant, itiraz, karar, user = hz
    acilis = await _kurul_acilis(user)
    if not acilis:
        return
    yield "acilis", {"turlar": acilis}
    async for tip, veri in _kurul_akisi(taslak_md, meta=meta, sinyaller=sinyaller, bant=bant,
                                        karar=karar, itiraz=itiraz, acilis=acilis, olc=olc):
        yield tip, veri


__all__ = ("KURUL_UYELERI", "Olcer", "kurul_karar", "kurul_muzakere", "kurul_muzakere_stream")
