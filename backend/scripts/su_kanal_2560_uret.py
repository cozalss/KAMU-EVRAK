"""Büyükşehir su ve kanalizasyon idaresi dosyalarını 2560 sayılı Kanundan yeniden yazar.

NEDEN YENİDEN YAZILIYOR: karantinadaki 30 dosya her biri 7 "daire başkanlığı" sayıyordu
(Abone İşleri, Su İşletme, Kanalizasyon, Atıksu Arıtma, Yatırım ve İnşaat, Emlak ve
İstimlak, Hukuk Müşavirliği). Bu adlar KANUNDA YOK. 2560 m.12 açıkça şunu der:

    "Genel Müdürlük, hizmetin gerektirdiği sayıda Daire Başkanlığı, Müdürlük ve bunlara
     bağlı alt kademe birimlerinden teşekkül eder"

— yani hangi dairelerin kurulacağı her idarenin kendi organlarınca belirlenir ve
mevzuattan BİLİNEMEZ. Dosyalar bunu kendi künyelerinde `[DOĞRULA: ... TİPİK şablondur]`
notuyla zaten itiraf ediyordu. Kaynaksız daire adları kaldırılır; yerine kanunun
KENDİSİNİN adıyla kurduğu birimler yazılır.

Kanunun adıyla kurduğu birimler (hepsi lafzî dayanaklı):
  · Genel Kurul, Yönetim Kurulu, Denetçiler, Genel Müdürlük   — m.3 (organlar)
  · Teftiş ve Kontrol Kurulu Başkanı, 1'nci Hukuk Müşaviri     — m.12 (atama usulü)

Denetçiler bilerek BİRİM olarak yazılmaz: m.10 onları "iki denetçi" diye KİŞİ olarak
düzenler ve Genel Kurula rapor verirler — yazışma muhatabı bir birim değildir.

KAPSAM: Ek Madde 4 — "Bu Kanun diğer Büyükşehir Belediyelerinde de uygulanır." Bu yüzden
30 büyükşehrin su idaresinin tamamı aynı kanuni teşkilata sahiptir.

Kaynak metin: 2560 sayılı Kanunun resmî PDF'i (eski.gov.tr — Eskişehir Su ve Kanalizasyon
İdaresi, .gov.tr). mevzuat.gov.tr TLS sertifika zinciri doğrulanamadığı için oradan
alınmadı; sertifika doğrulamasını kapatarak kaynak kaydetmek bu depoda yasaktır.

Kullanım:  uv run python scripts/su_kanal_2560_uret.py [--yaz]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"

KAYNAK_URL = "https://www.eski.gov.tr/kurumlar/eski.gov.tr/belgeler/kanunlar/2560-Sayili-Kanun.pdf"
ERISIM = "2026-08-06"

# İstanbul kanunun asıl muhatabıdır; diğerlerine Ek Madde 4 ile uygulanır.
ASIL_SLUG = "iski"

SLUGLAR = (
    "adana-aski", "aski", "asat", "aydin-aski", "baski", "buski", "deski", "diski",
    "erzurum-eski", "eskisehir-eski", "gaski", "hatsu", "iski", "isu", "izsu",
    "kahramanmaras-kaski", "kayseri-kaski", "koski", "malatya-maski", "manisa-maski",
    "marsu", "meski", "muski", "oski", "sakarya-saski", "samsun-saski", "suski",
    "teski", "tiski", "vaski",
)

_KURUM_RE = re.compile(r"^@KURUM:\s*(.+)$", re.M)
_ALIAS_RE = re.compile(r"^@ALIAS:\s*(.+)$", re.M)


def _il_adi(kurum_ad: str) -> str:
    """'Ankara Su ve Kanalizasyon İdaresi Genel Müdürlüğü' → 'Ankara'."""
    return kurum_ad.split(" Su ve ")[0].strip()


def _belge(slug: str, il: str) -> str:
    temel = ("2560 sayılı İstanbul Su ve Kanalizasyon İdaresi Genel Müdürlüğü Kuruluş ve "
             "Görevleri Hakkında Kanun (Kabul 20/11/1981, RG 23/11/1981-17523)")
    if slug == ASIL_SLUG:
        return temel
    return (f"{temel}; Ek Madde 4 uyarınca — \"Bu Kanun diğer Büyükşehir Belediyelerinde de "
            f"uygulanır\" — {il} Büyükşehir Belediyesinde de uygulanır")


def _not(il: str) -> str:
    return (
        "Bu dosyadaki birimler 2560 sayılı Kanunun KENDİSİNİN kurduğu birimlerdir. "
        "Kanun daire başkanlıklarını SAYMAZ: m.12 \"Genel Müdürlük, hizmetin gerektirdiği "
        "sayıda Daire Başkanlığı, Müdürlük ve bunlara bağlı alt kademe birimlerinden teşekkül "
        "eder\" der; hangi dairelerin kurulacağı her idarenin kendi organlarınca belirlenir ve "
        "mevzuattan bilinemez. Bu yüzden \"Abone İşleri Dairesi Başkanlığı\", \"Atıksu Arıtma "
        "Dairesi Başkanlığı\" gibi fiilî daire adları bu dosyaya ALINMAMIŞTIR — bu dosyanın "
        "önceki sürümü bunları kaynaksız listeliyor ve kendi künyesinde \"TİPİK şablondur\" "
        "diye işaretliyordu; kaldırıldılar. Su ve kanalizasyon hizmetine ilişkin yazışmanın "
        "kanuni muhatabı Genel Müdürlüktür (m.3, m.11, m.12). m.10'daki iki denetçi Genel "
        "Kurula rapor veren KİŞİdir, yazışma birimi değildir; bilerek listelenmemiştir. "
        f"HİZMET ALANI m.1: idarenin hizmeti {il} Büyükşehir Belediyesinin görev alanı ile "
        "sınırlıdır; ancak şehrin yararlandığı su kaynaklarının korunmasına ilişkin hizmetler "
        "bu sınır dışında da bu kuruluşça yürütülür. İdare, büyükşehir belediyesine bağlı, "
        "müstakil bütçeli ve kamu tüzel kişiliğine sahiptir; personeli 657 sayılı Kanuna tabidir."
    )


def _birimler(il: str) -> list[tuple[str, str]]:
    return [
        ("Genel Müdürlük",
         "2560 m.3 uyarınca idarenin organlarından biridir ve su-kanalizasyon hizmetini fiilen "
         "yürüten birimdir; m.12 uyarınca hizmetin gerektirdiği sayıda Daire Başkanlığı, "
         "Müdürlük ve bunlara bağlı alt kademe birimlerinden teşekkül eder. m.2'de sayılan görev "
         "ve yetkiler bu birimde yürütülür: içme, kullanma ve endüstri suyu ihtiyaçlarının her "
         "türlü yeraltı ve yerüstü kaynaklarından sağlanması ve ihtiyaç sahiplerine dağıtılması "
         "için kaynaklardan abonelere ulaşıncaya kadar her türlü tesisin etüt ve projesini yapmak "
         "veya yaptırmak, tesisleri kurmak, kurulu olanları devralıp işletmek, bakım ve onarımını "
         "yapmak; kullanılmış sular ile yağış sularının toplanması, yerleşim yerlerinden "
         "uzaklaştırılması ve zararsız bir biçimde boşaltma yerine ulaştırılması; bölge içindeki "
         "su kaynaklarının, deniz, göl ve akarsu kıyıları ile yeraltı sularının kullanılmış sular "
         "ve endüstri atıkları ile kirletilmesini önlemek ve bu konuda her türlü teknik, idari ve "
         "hukuki tedbiri almak; su ve kanalizasyon hizmetleri konusunda hizmet alanı içindeki "
         "belediyelere verilen görevleri yürütmek. Abonelik ve tarife (m.23), kanalizasyon "
         "şebekesine bağlanma zorunluluğu (m.17), su ve kanalizasyon durum belgesi (m.18) ve "
         "endüstriyel atıksu ön arıtma yükümlülüğü (m.19) konularındaki yazışmaların muhatabı bu "
         "birimdir. Genel Müdür, idare ve yargı organlarında üçüncü kişilere karşı idareyi temsil "
         "eder (m.11/b)."),
        ("Yönetim Kurulu",
         "2560 m.3 uyarınca idarenin organlarından biridir. m.9'da sayılan görevleri yürütür: "
         "kuruluş amacına uygun olarak idarenin çalışmasına ilişkin esasları tespit etmek ve "
         "bunların Genel Müdürlükçe uygulanmasını izlemek; yönetmelik, bütçe, bilanço ve kadro "
         "taslaklarının ön incelemesini yapıp Genel Kurula sunmak; bütçe fasılları arasında "
         "aktarma yapmak; beş yıllık ve yıllık yatırım plan ve programlarını inceleyip Genel "
         "Kurula sunmak; satma, satın alma ve ihale işlemlerini karara bağlamak; kamulaştırma "
         "işlerini karara bağlamak; su satışı ve kullanılmış suların boşaltılmasına ilişkin "
         "tarifeleri tespit ederek Genel Kurulun onayına sunmak. Kamulaştırma ve ihale kararı "
         "gerektiren yazışmalarda karar mercii bu kuruldur."),
        ("Genel Kurul",
         f"2560 m.3 uyarınca idarenin organlarından biridir. m.4: {il} Büyükşehir Belediye "
         "Meclisi, idarenin Genel Kurulu olarak görevli ve yetkilidir — yani bu organ ayrı bir "
         "kurul değil, büyükşehir belediye meclisinin kendisidir. m.5 uyarınca her yıl Mayıs ve "
         "Kasım aylarında özel gündemle toplanır. m.6'daki görevleri karara bağlar: beş yıllık "
         "yatırım planı, yıllık yatırım programları, bütçe, personel kadroları, faaliyet raporu "
         "ve bilanço ile denetçiler raporu, su satışı ve kullanılmış suların boşaltılmasına "
         "ilişkin tarifeler, denetçilerin seçimi ve yönetmeliklerin kabulü."),
        ("Teftiş ve Kontrol Kurulu Başkanlığı",
         "2560 m.12'de adıyla kurulan birimdir; Başkanı, Genel Müdürün teklifi, Yönetim Kurulunun "
         "kararı ve Büyükşehir Belediye Başkanının onayı ile atanır (m.12; atama önerisi m.9/m). "
         "Kanun bu birimin görevlerini ayrıca saymamıştır; kanunun müfettiş kadrosunu aynı usule "
         "bağlaması nedeniyle idarenin teftiş, denetim ve soruşturma işleri bu birimde yürütülür. "
         "Not: m.10'daki denetçilerden farklıdır — denetçiler Genel Kurula rapor verir, bu birim "
         "Genel Müdürlüğe bağlıdır."),
        ("1'inci Hukuk Müşavirliği",
         "2560 m.12'de adıyla kurulan birimdir; 1'inci Hukuk Müşaviri, Genel Müdürün teklifi, "
         "Yönetim Kurulunun kararı ve Büyükşehir Belediye Başkanının onayı ile atanır (m.12; "
         "atama önerisi m.9/m). Kanun bu birimin görevlerini ayrıca saymamıştır; kanunun avukat "
         "kadrosunu aynı usule bağlaması ve dava değerine göre sulh yetkisini paylaştırması "
         "(m.6/ı Genel Kurul, m.9/j Yönetim Kurulu) nedeniyle idarenin taraf olduğu dava ve icra "
         "işleri ile hukuki görüş talepleri bu birimde yürütülür."),
    ]


def dosya_metni(slug: str, kurum_ad: str, alias: str) -> str:
    il = _il_adi(kurum_ad)
    satirlar = [
        f"@KURUM: {kurum_ad}",
        f"@BELGE: {_belge(slug, il)}",
        f"@KAYNAK_KIMLIK: {KAYNAK_URL}",
        f"@ERISIM: {ERISIM}",
        "@KAYNAK_TURU: resmi_mevzuat_teskilat",
        "@DOGRULAMA: resmi",
        f"@ALIAS: {alias}",
        f"@NOT: {_not(il)}",
        "",
    ]
    for ad, gorev in _birimler(il):
        satirlar += [f"BİRİM: {ad}", f"GÖREV: {gorev}", ""]
    return "\n".join(satirlar).rstrip("\n") + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yaz", action="store_true", help="dosyaları gerçekten yaz")
    args = ap.parse_args()

    yazilan = 0
    for slug in SLUGLAR:
        yol = _TESKILAT_DIR / slug / "birimler.txt"
        if not yol.exists():
            print(f"ATLANDI  {slug}: dosya yok")
            continue
        eski = yol.read_text(encoding="utf-8")
        km = _KURUM_RE.search(eski)
        am = _ALIAS_RE.search(eski)
        if not km or not am:
            print(f"ATLANDI  {slug}: @KURUM/@ALIAS okunamadı")
            continue
        metin = dosya_metni(slug, km.group(1).strip(), am.group(1).strip())
        if args.yaz:
            yol.write_text(metin, encoding="utf-8", newline="\n")
            yazilan += 1
        print(f"{'YAZILDI ' if args.yaz else 'HAZIR   '} {slug}: {km.group(1).strip()}")

    print(f"\n{len(SLUGLAR)} idare · {'yazılan ' + str(yazilan) if args.yaz else 'kuru koşum'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
