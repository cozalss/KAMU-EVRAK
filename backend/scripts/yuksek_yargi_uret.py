"""Yüksek yargı ve Sayıştay teşkilat dosyalarını kendi kuruluş mevzuatından yazar.

Karantinadaki dört dosya toplam 15 birim sayıyordu, hiçbirinin kaynağı yoktu. Her kurumun
teşkilatı KENDİ kanununda (AYM'de kendi hizmet birimleri yönetmeliğinde) sayılıdır:

  · Sayıştay  — 6085 m.11: kuruluşa dahil ON organ tek tek sayılır.
  · Yargıtay  — 2797 m.2/m.3/m.4/m.6 + Yargıtay İç Yönetmeliği m.3/B'nin on idarî birimi.
  · Danıştay  — 2575 m.5 (karar organları), m.6 (Genel Sekreterlik), m.7 (sekiz müdürlük).
  · AYM       — Hizmet Birimlerinin Görevleri, Çalışma Usul ve Esasları Hakkında Yönetmelik
                m.12: on dört hizmet birimi; GÖREV metinleri m.13-m.86'dan otomatik çıkarılır.

AYM görevleri neden elle yazılmıyor: on dört birimin görev fıkrası yönetmelikte zaten
lafzî olarak var; elle aktarmak transkripsiyon hatası riskidir. Metin PDF'ten çıkarılıp
birebir alınır — bu dosyada TEK BİR görev cümlesi uydurulmamıştır.

mevzuat.gov.tr TLS zinciri kırık olduğundan (bkz. mevzuat_pdf_cek.py) her kaynak, kurumun
kendi resmî .gov.tr alanından veya Adalet Bakanlığı yayınından alınmıştır.

Kullanım:  uv run python scripts/yuksek_yargi_uret.py --aym-metin <cikarilmis.txt> [--yaz]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from belediye_teskilat_yaz import kardes_uydurmalari_sil  # ortak koruma

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"
ERISIM = "2026-08-06"

SAYISTAY_URL = "https://www.sayistay.gov.tr/files/662_TBMM_Kabul_Edilen_Sayistay_Kanunu.pdf"
YARGITAY_URL = "https://www.yargitay.gov.tr/documents/mevzuat2015duzeltme.pdf"
DANISTAY_URL = ("https://rayp.adalet.gov.tr/resimler/522/dosya/"
                "5-2575-sayili-danistay-kanunu11-08-202010-23-am.pdf")
AYM_URL = ("https://www.anayasa.gov.tr/media/4233/"
           "anayasa-mahkemesi-hizmet-birimlerinin-gorevleri-calisma-usul-ve-esaslar.pdf")

# AYM Yönetmeliği m.12'de sayıldığı SIRAYLA. Sıra kaynaktandır, yeniden dizilmez.
AYM_BIRIMLER = (
    "Yazı İşleri Müdürlüğü", "İdari ve Mali İşler Müdürlüğü", "Personel Müdürlüğü",
    "Yayın ve Halkla İlişkiler Müdürlüğü", "Dış İlişkiler Müdürlüğü",
    "Strateji Geliştirme Müdürlüğü", "Teknik Hizmetler Müdürlüğü", "Özel Kalem Müdürlüğü",
    "Basın Müşavirliği", "Bireysel Başvuru Müdürlüğü", "Bilgi İşlem Müdürlüğü",
    "Kurum Hekimliği", "Sivil Savunma Uzmanlığı", "Anayasa Yargısı Araştırmaları Merkezi",
)
# Yönetmelikte görev maddesinin başlığı m.12'deki addan farklı yazılan birimler.
AYM_MADDE_BASLIGI = {
    "İdari ve Mali İşler Müdürlüğü": "İdari ve Mali işler Müdürlüğü",
    "Anayasa Yargısı Araştırmaları Merkezi": "Anayasa Yargısı Araştırmaları Merkezi (AYAM)",
}
_KOLONTITUL = ("ANAYASA MAHKEMESİ HİZMET BİRİMLERİNİN GÖREVLERİ, "
               "ÇALIŞMA USUL VE ESASLARI HAKKINDAYÖNETMELİK")
# "<Başlık> MADDE 19- (1) <görev>" — tire hem '-' hem '–' olabilir (kaynakta ikisi de geçer).
_MADDE_KALIP = r"\s*MADDE\s*(\d+)\s*[-–]\s*\(1\)\s*(.+?)(?=\s*\(\d+\)\s|\Z)"


def aym_gorevleri(metin: str) -> dict[str, tuple[str, str]]:
    """Yönetmelik metninden {birim: (madde_no, görev)} çıkar. Eksik kalan varsa hata verir."""
    duz = re.sub(r"\s+", " ", metin.replace(_KOLONTITUL, " "))
    sonuc: dict[str, tuple[str, str]] = {}
    for birim in AYM_BIRIMLER:
        baslik = AYM_MADDE_BASLIGI.get(birim, birim)
        eslesme = re.search(re.escape(baslik) + _MADDE_KALIP, duz)
        if not eslesme:
            raise ValueError(f"AYM görev maddesi bulunamadı: {birim}")
        gorev = re.sub(r"\s+", " ", eslesme.group(2)).strip()
        sonuc[birim] = (eslesme.group(1), gorev)
    return sonuc


def _dosya(kurum: str, belge: str, url: str, alias: str, notu: str,
           birimler: list[tuple[str, str]], kaynak_turu: str = "resmi_teskilat") -> str:
    satirlar = [
        f"@KURUM: {kurum}",
        f"@BELGE: {belge}",
        f"@KAYNAK_KIMLIK: {url}",
        f"@ERISIM: {ERISIM}",
        f"@KAYNAK_TURU: {kaynak_turu}",
        "@DOGRULAMA: resmi",
        f"@ALIAS: {alias}",
        f"@NOT: {notu}",
        "",
    ]
    for ad, gorev in birimler:
        satirlar += [f"BİRİM: {ad}", f"GÖREV: {gorev}", ""]
    return "\n".join(satirlar).rstrip("\n") + "\n"


def sayistay() -> str:
    birimler = [
        ("Başkanlık",
         "6085 m.11/1-a uyarınca Sayıştayın kuruluşuna dahil organlardan biridir. m.10 uyarınca "
         "Sayıştay Başkanı meslek mensuplarının başında gelir; denetim ve yönetim işlerinde "
         "kendisine yardımcı olmak üzere üyeler arasından iki başkan yardımcısı görevlendirir ve "
         "bunlar daire başkanı statüsündedir. Denetim ve denetim destek grup başkanlıkları ile "
         "yönetim birimleri doğrudan Başkanlığa bağlı olarak çalışır; daire başkanı ve üyelerin "
         "daireleri, ihtisas daireleri, dairelere iş dağılımı ve meslek mensuplarının görev yeri "
         "Sayıştay Başkanınca belirlenir. Kurumla yapılan genel yazışmaların muhatabıdır."),
        ("Daireler",
         "6085 m.11/1-b uyarınca kuruluşa dahil organlardan biridir. Hesap ve işlemlerin kesin "
         "hükme bağlanmasına ilişkin yargılama işleri dairelerde yürütülür; her dairede bir daire "
         "başkanı ile üyeler bulunur ve dairelere iş dağılımı Sayıştay Başkanınca yapılır."),
        ("Genel Kurul",
         "6085 m.11/1-c uyarınca kuruluşa dahil organlardan biridir; Kanunla kendisine verilen "
         "içtihat, yorum ve düzenleyici nitelikteki konuları karara bağlar."),
        ("Temyiz Kurulu",
         "6085 m.11/1-ç uyarınca kuruluşa dahil organlardan biridir; daire kararlarına karşı "
         "yapılan temyiz başvurularını inceler."),
        ("Daireler Kurulu",
         "6085 m.11/1-d uyarınca kuruluşa dahil organlardan biridir."),
        ("Rapor Değerlendirme Kurulu",
         "6085 m.11/1-e uyarınca kuruluşa dahil organlardan biridir; denetim ve incelemeler "
         "sonucu hazırlanan raporların değerlendirilmesi bu kurulda yapılır."),
        ("Yüksek Disiplin Kurulu",
         "6085 m.11/1-f uyarınca kuruluşa dahil organlardan biridir."),
        ("Meslek Mensupları Yükseltme ve Disiplin Kurulu",
         "6085 m.11/1-g uyarınca kuruluşa dahil organlardan biridir; meslek mensuplarının "
         "yükseltme ve disiplin işleri bu kurulda görülür."),
        ("Denetim, Planlama ve Koordinasyon Kurulu",
         "6085 m.11/1-ğ uyarınca kuruluşa dahil organlardan biridir; denetimin planlanması ve "
         "koordinasyonu bu kurulda yürütülür."),
        ("Başsavcılık",
         "6085 m.11/1-h uyarınca kuruluşa dahil organlardan biridir. m.10 uyarınca Başsavcı ve "
         "savcılar Sayıştay mensupları arasında ayrı bir grup olarak sayılmıştır."),
    ]
    notu = (
        "Birimler 6085 sayılı Sayıştay Kanunu m.11/1'de \"Sayıştayın kuruluşuna dahil organlar "
        "şunlardır\" denilerek TEK TEK sayılan on organdır; liste kaynaktaki bent sırasıyla ve "
        "eksiksiz alınmıştır. Kanun bu organların görevlerini ayrı bir teşkilat maddesinde "
        "toplamaz; görev metinleri m.10 (mensuplar) ve Kanunun ilgili bölümlerinden yazılmış, "
        "kanunda karşılığı bulunmayan yerlerde görev UYDURULMAMIŞ, yalnız organın hangi bende "
        "dayandığı belirtilmiştir. Denetim ve denetim destek GRUP BAŞKANLIKLARI ile yönetim "
        "birimleri m.10 uyarınca Başkanlığa bağlı çalışır; sayıları ve adları Sayıştay Başkanınca "
        "belirlendiği ve kanunda sayılmadığı için ayrı birim olarak listelenmemiştir. "
        "Sayıştay TBMM adına denetim yapan bir yüksek mahkemedir; idarî hiyerarşi içinde "
        "bir bakanlığa bağlı DEĞİLDİR."
    )
    return _dosya(
        "Sayıştay",
        "6085 sayılı Sayıştay Kanunu (Kabul 3/12/2010), m.10 ve m.11",
        SAYISTAY_URL, "sayistay, sayistay-baskanligi", notu, birimler)


def yargitay() -> str:
    birimler = [
        ("Birinci Başkanlık",
         "2797 m.2 uyarınca Yargıtayın kuruluş unsurlarından biridir. m.4: \"Birinci Başkanlık; "
         "Birinci Başkan ve başkanvekilleriyle Genel Sekreterden oluşur.\" Kurumla yapılan genel "
         "yazışmaların ve idarî işlerin muhatabıdır."),
        ("Daireler",
         "2797 m.2 uyarınca kuruluş unsurlarından, m.3/1 uyarınca karar organlarından biridir. "
         "m.5 (Değişik: 2/12/2014-6572/21): \"Yargıtayda on iki hukuk, on iki ceza dairesi ve her "
         "dairede bir daire başkanı ile yeteri kadar üye bulunur.\" Dairelerin iş bölümü Birinci "
         "Başkanlık Kurulu kararıyla belirlenir."),
        ("Yargıtay Cumhuriyet Başsavcılığı",
         "2797 m.2 uyarınca kuruluş unsurlarından biridir. m.6: \"Yargıtay Cumhuriyet "
         "Başsavcılığı; Cumhuriyet Başsavcısı, Cumhuriyet Başsavcıvekili, Cumhuriyet Başsavcı "
         "Başyardımcısı ile Cumhuriyet Başsavcı yardımcılarından oluşur.\""),
        ("Hukuk Genel Kurulu",
         "2797 m.3/2 uyarınca karar organlarından biridir. m.7: \"Hukuk Genel Kurulu, hukuk "
         "dairelerinin başkan ve üyelerinden ... oluşur.\""),
        ("Ceza Genel Kurulu",
         "2797 m.3/3 uyarınca karar organlarından biridir. m.7: \"Ceza Genel Kurulu, ceza "
         "dairelerinin başkan ve üyelerinden oluşur.\""),
        ("Büyük Genel Kurul", "2797 m.3/4 uyarınca karar organlarından biridir."),
        ("Başkanlar Kurulları", "2797 m.3/5 uyarınca karar organlarından biridir."),
        ("Birinci Başkanlık Kurulu",
         "2797 m.3/6 uyarınca karar organlarından biridir. Birinci Başkanın başkanlığında dördü "
         "daire başkanı, dördü Yargıtay üyesi olmak üzere sekiz asıl ve dört yedek üyeden oluşur; "
         "m.18 uyarınca daire başkanı, üye ve tetkik hâkimlerinin geçici görevlendirilmesi, "
         "dairelerdeki boşalmaların doldurulması, Yargıtay görevlilerinin denetlenmesi ve Genel "
         "Sekreterin Yargıtay üyeleri arasından seçilmesi görevlerini yürütür. Yeni hizmet "
         "birimleri de İç Yönetmelik m.4 uyarınca bu Kurulca kurulur."),
        ("Yüksek Disiplin Kurulu", "2797 m.3/7 uyarınca karar organlarından biridir."),
        ("Yönetim Kurulu", "2797 m.3/8 uyarınca karar organlarından biridir."),
        ("Yayın Kurulu", "Yargıtay İç Yönetmeliği m.3/B-1 uyarınca büro ve idarî birimlerdendir."),
        ("Tasnif Kurulu", "Yargıtay İç Yönetmeliği m.3/B-2 uyarınca büro ve idarî birimlerdendir."),
        ("Yayın İşleri Müdürlüğü",
         "Yargıtay İç Yönetmeliği m.3/B-3 uyarınca büro ve idarî birimlerdendir."),
        ("Sağlık Müdürlüğü", "Yargıtay İç Yönetmeliği m.3/B-4 uyarınca büro ve idarî birimlerdendir."),
        ("Eğitim ve Sosyal İşler Müdürlüğü",
         "Yargıtay İç Yönetmeliği m.3/B-5 uyarınca büro ve idarî birimlerdendir."),
        ("Yazı İşleri Büroları",
         "Yargıtay İç Yönetmeliği m.3/B-6 uyarınca büro ve idarî birimlerdendir; gelen-giden "
         "evrak ve yazı işleri bu bürolarda yürütülür."),
        ("Sivil Savunma Uzmanlığı",
         "Yargıtay İç Yönetmeliği m.3/B-7 uyarınca büro ve idarî birimlerdendir."),
        ("Özlük İşleri Müdürlüğü",
         "Yargıtay İç Yönetmeliği m.3/B-8 uyarınca büro ve idarî birimlerdendir; personel özlük "
         "işleri bu müdürlükte yürütülür."),
        ("Levazım Müdürlüğü", "Yargıtay İç Yönetmeliği m.3/B-9 uyarınca büro ve idarî birimlerdendir."),
        ("Daire Müdürlüğü", "Yargıtay İç Yönetmeliği m.3/B-10 uyarınca büro ve idarî birimlerdendir."),
    ]
    notu = (
        "Dayanak 2797 sayılı Yargıtay Kanunu m.2: \"Yargıtay; Birinci Başkanlık, daireler, "
        "Yargıtay Cumhuriyet Başsavcılığı, bürolar ve idari birimlerden oluşur.\" Karar organları "
        "m.3'te, büro ve idarî birimler Yargıtay İç Yönetmeliği m.3/B'de TEK TEK sayılmıştır; "
        "her ikisi de kaynaktaki sırayla ve eksiksiz alınmıştır. Kanun bu organların çoğunun "
        "görevlerini ayrı maddelerde düzenlediği için burada yalnız hangi bende dayandıkları ve "
        "kaynakta lafzî karşılığı olan tanımlar yazılmıştır — GÖREV UYDURULMAMIŞTIR. Daire "
        "SAYISI (on iki hukuk, on iki ceza) m.5'in 6572 sayılı Kanunla değişik hâlindendir; "
        "dairelerin İŞ BÖLÜMÜ kanunla değil Birinci Başkanlık Kurulu kararıyla belirlendiğinden "
        "hangi dairenin hangi uyuşmazlığa bakacağı bu dosyadan çıkarılamaz. İç Yönetmelik m.4 "
        "uyarınca yeni hizmet birimleri Birinci Başkanlık Kurulunca kurulabilir; bu liste "
        "normatif asgariyi gösterir. Yargıtay bir yüksek mahkemedir, idarî hiyerarşi içinde bir "
        "bakanlığa bağlı DEĞİLDİR."
    )
    return _dosya(
        "Yargıtay",
        "2797 sayılı Yargıtay Kanunu m.2-m.7 ve m.18 ile Yargıtay İç Yönetmeliği m.3-m.4 "
        "(Yargıtay Başkanlığı resmî mevzuat derlemesi)",
        YARGITAY_URL, "yargitay, yargitay-baskanligi", notu, birimler)


def danistay() -> str:
    birimler = [
        ("Daireler",
         "2575 m.5/a uyarınca Danıştayın karar organlarından biridir; idarî uyuşmazlıklar ile "
         "vergi uyuşmazlıklarına ilişkin dava ve inceleme işleri dairelerde görülür."),
        ("Danıştay Genel Kurulu", "2575 m.5/b uyarınca karar organlarından biridir."),
        ("İdari İşler Kurulu", "2575 m.5/c uyarınca karar organlarından biridir."),
        ("İdari Dava Daireleri Kurulu",
         "2575 m.5/d uyarınca karar organlarından biridir (5183 s. Kanun m.15 ile ad değişikliği)."),
        ("Vergi Dava Daireleri Kurulu",
         "2575 m.5/e uyarınca karar organlarından biridir (5183 s. Kanun m.15 ile ad değişikliği)."),
        ("İçtihatları Birleştirme Kurulu", "2575 m.5/f uyarınca karar organlarından biridir."),
        ("Başkanlar Kurulu",
         "2575 m.5/g uyarınca karar organlarından biridir (6494 s. Kanun m.3 ile yeniden "
         "düzenlenmiştir)."),
        ("Başkanlık Kurulu",
         "2575 m.5/h uyarınca karar organlarından biridir (6494 s. Kanun m.3 ile yeniden "
         "düzenlenmiştir)."),
        ("Yüksek Disiplin Kurulu", "2575 m.5/ı uyarınca karar organlarından biridir."),
        ("Disiplin Kurulu", "2575 m.5/i uyarınca karar organlarından biridir."),
        ("Danıştay Başsavcılığı",
         "2575 m.60-61 uyarınca Başsavcı, incelediği dava dosyaları hakkında düşüncesini bildirir "
         "ve kanunlarla kendisine verilen diğer görevleri yapar; Başsavcılıkta görevli memurların "
         "çalışmasını, gelen dosyaların kaydı ve saklanmasını, işi bitenlerin ilgili yerlere "
         "geciktirilmeden gönderilmesini sağlar. Başsavcı her takvim yılı sonunda işlerin durumu "
         "hakkında Danıştay Başkanlığına rapor verir."),
        ("Genel Sekreterlik",
         "2575 m.6: \"Danıştay Başkanının seçeceği bir üye Danıştay Genel Sekreterliği görevini "
         "yapar.\" Genel Sekreterlik hizmetleri için yeteri kadar savcı, tetkik hâkimi ve memur "
         "verilir. Kurumla yapılan idarî yazışmaların muhatabıdır."),
        ("Özlük İşleri Müdürlüğü", "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir."),
        ("Evrak Müdürlüğü",
         "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir; gelen ve giden evrak "
         "işlemleri bu müdürlükte yürütülür."),
        ("Levazım Müdürlüğü", "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir."),
        ("Kitaplık ve Yayın Müdürlüğü",
         "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir."),
        ("Tasnif Müdürlüğü", "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir."),
        ("Arşiv Müdürlüğü",
         "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir; arşiv ve saklama işlemleri "
         "bu müdürlükte yürütülür."),
        ("Sosyal ve İdari İşler Müdürlüğü",
         "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir."),
        ("Özel Kalem Müdürlüğü", "2575 m.7 uyarınca Danıştayda bulunan idarî hizmet birimidir."),
    ]
    notu = (
        "Karar organları 2575 sayılı Danıştay Kanunu m.5'te, idarî hizmet birimleri m.7'de TEK "
        "TEK sayılmıştır: \"Danıştayda Özlük İşleri, Evrak, Levazım, Kitaplık ve Yayın, Tasnif, "
        "Arşiv, Sosyal ve İdari İşler, Özel Kalem müdürlükleriyle bu Kanunda yazılı ve ihtiyaca "
        "göre kurulacak bürolar ve kalemler bulunur.\" Müdürlük adları bu cümledeki sırayla "
        "alınmış, her birine kaynak cümlesindeki \"müdürlükleri\" ibaresine uygun olarak "
        "\"Müdürlüğü\" unvanı verilmiştir. Aynı madde \"ihtiyaca göre kurulacak bürolar ve "
        "kalemler\"den söz ettiği için bu liste normatif asgariyi gösterir; fiilî teşkilat daha "
        "geniş olabilir. m.5/g ve m.5/h'deki Başkanlar Kurulu ve Başkanlık Kurulu, 650 sayılı "
        "KHK ile getirilip Anayasa Mahkemesinin 18/7/2012 tarihli E.2011/113 K.2012/108 sayılı "
        "kararıyla iptal edildikten sonra 6494 sayılı Kanun m.3 ile YENİDEN düzenlenmiştir; "
        "yürürlükteki hâlleriyle listelenmişlerdir. Danıştay bir yüksek mahkemedir, idarî "
        "hiyerarşi içinde bir bakanlığa bağlı DEĞİLDİR."
    )
    return _dosya(
        "Danıştay", "2575 sayılı Danıştay Kanunu m.5, m.6, m.7 ve m.60-61",
        DANISTAY_URL, "danistay, danistay-baskanligi", notu, birimler)


def aym(yonetmelik_metni: str) -> str:
    gorevler = aym_gorevleri(yonetmelik_metni)
    birimler = [
        (birim, f"AYM Hizmet Birimleri Yönetmeliği m.12/1 uyarınca Mahkemenin hizmet "
                f"birimlerinden biridir. m.{gorevler[birim][0]}/1: {gorevler[birim][1]}")
        for birim in AYM_BIRIMLER
    ]
    notu = (
        "Birimler, Anayasa Mahkemesi Hizmet Birimlerinin Görevleri, Çalışma Usul ve Esasları "
        "Hakkında Yönetmelik m.12/1'de \"Mahkemenin hizmet birimleri şunlardır\" denilerek TEK "
        "TEK sayılan on dört birimdir; liste kaynaktaki bent sırasıyla ve eksiksiz alınmıştır. "
        "GÖREV metinleri her birimin kendi maddesinden (m.13-m.86) LAFZÎ olarak çıkarılmıştır — "
        "elle aktarılmamış, bu yüzden transkripsiyon hatası taşımaz. Yönetmelik 6216 sayılı "
        "Kanun m.23/1 ve m.29/3 ile AYM İçtüzüğü m.35/4, m.85/1 ve m.89/2'ye dayanır. "
        "Mahkemenin YARGISAL yapısı (Genel Kurul, Bölümler, Komisyonlar) hizmet birimi DEĞİLDİR "
        "ve bu listede yer almaz; bireysel başvuru evrakının idarî muhatabı Bireysel Başvuru "
        "Müdürlüğüdür. Özel Kalem Müdürlüğü, Basın Müşavirliği ve Anayasa Yargısı Araştırmaları "
        "Merkezi m.12/3 uyarınca doğrudan Başkanın gözetiminde, diğerleri Genel Sekreter "
        "Yardımcısının gözetiminde çalışır. Anayasa Mahkemesi bir yüksek mahkemedir, idarî "
        "hiyerarşi içinde bir bakanlığa bağlı DEĞİLDİR."
    )
    return _dosya(
        "Anayasa Mahkemesi",
        "Anayasa Mahkemesi Hizmet Birimlerinin Görevleri, Çalışma Usul ve Esasları Hakkında "
        "Yönetmelik m.12 ve m.13-m.86 (dayanak: 6216 sayılı Kanun m.23/1, m.29/3)",
        AYM_URL, "aym, anayasa-mahkemesi-baskanligi", notu, birimler,
        kaynak_turu="resmi_yonetmelik")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--aym-metin", type=Path, required=True,
                    help="AYM hizmet birimleri yönetmeliğinden çıkarılmış metin")
    ap.add_argument("--yaz", action="store_true")
    args = ap.parse_args()

    aym_ham = args.aym_metin.read_text(encoding="utf-8")
    uretilen = {
        "sayistay": sayistay(),
        "yargitay": yargitay(),
        "danistay": danistay(),
        "anayasa-mahkemesi": aym(aym_ham),
    }
    for slug, metin in uretilen.items():
        yol = _TESKILAT_DIR / slug / "birimler.txt"
        sayi = metin.count("BİRİM: ")
        if args.yaz:
            yol.parent.mkdir(parents=True, exist_ok=True)
            # Manifestte kayıtlı kardeş dosyaya DOKUNULMAZ. Gerekçe ve olay kaydı
            # `belediye_teskilat_yaz.kardes_uydurmalari_sil` docstring'inde.
            for ad in kardes_uydurmalari_sil(yol):
                print(f"   silindi (manifestte yok): {ad}")
            yol.write_text(metin, encoding="utf-8", newline="\n")
        print(f"{'YAZILDI ' if args.yaz else 'HAZIR   '} {slug}: {sayi} birim")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
