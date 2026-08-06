"""Kurum sicil kaydından resmî web alan adı ADAYLARI türetir (ağ çağrısı YOK).

NEDEN: doğrulanmamış bir kurumun evrağı geldiğinde memura kuru bir tahmin yerine
KAYNAK LİNKİ göstermek istiyoruz. Bunun için kurumun resmî sitesinin adresi gerekir.
Sicilde `web` alanı 4066 kaydın yalnız 26'sında dolu (%0,6) — yani sicilden gelmiyor.

Ama Türk kamu kurumlarının alan adları KALIPLI. 2026-08-06'da ölçüldü (12 örnek, 9'u
tuttu); tutan kalıplar aşağıdaki tabloda, tutmayanlar `_OLCUM_NOTU`nda.

Bu modül AĞA ÇIKMAZ: yalnız aday üretir, sırayla dener çağıran katmandır. Böylece kalıp
mantığı testlerde ağsız doğrulanabilir ve bir kalıp bozulduğunda test kırılır.

ADAY ≠ KAYNAK. Üretilen adres yalnız nereye BAKILACAĞINI söyler; o adresten indirilen
sayfa, birim adlarını birebir içermiyorsa hiçbir şey yazılmaz (metin kapısı çağıranda).
"""
from __future__ import annotations

import re
from typing import Any

# Türkçe harfler alan adında ASCII'ye düşer. `tr_lower` bunu yapmaz (harfleri korur),
# bu yüzden ayrı bir çeviri gerekir — aksi hâlde "sanliurfa" yerine "şanlıurfa" üretilir.
_ASCII = str.maketrans("çğıöşüâîû", "cgiosuaiu")

# ÖLÇÜLEN KALIPLAR (2026-08-06). Her biri gerçek istekle sınandı; sonuç `_OLCUM_NOTU`.
# Değer: alan şablonu listesi. `{alan}` = slug'ın kurum kuyruğu atılmış hâli.
# Sıra ÖNEMLİ: en çok tutan kalıp başta olmalı, çağıran ilk çalışanı kullanır.
_KALIPLAR: dict[str, tuple[str, ...]] = {
    "belediye": ("www.{alan}.bel.tr", "{alan}.bel.tr"),
    "valilik": ("www.{alan}.gov.tr", "{alan}.gov.tr"),
    "kaymakamlik": ("{alan}.gov.tr", "www.{alan}.gov.tr"),
    "il_ozel_idare": ("www.{alan}ozelidare.gov.tr", "{alan}il.gov.tr"),
    "defterdarlik": ("{alan}.defterdarligi.gov.tr",),
    # MERKEZÎ KURUMLAR (KİT, üst kurul, bağlı/ilgili kuruluş, "diğer"): alan adı çoğunlukla
    # slug'ın KENDİSİDİR. `_MERKEZI_TURLER` üzerinden bağlanır — bkz. `_MERKEZI_OLCUMU`.
    # Bu kalıp tek başına GÜVENLİ DEĞİLDİR: kısaltmalar çakışıyor (ttk.gov.tr = Türk Tarih
    # Kurumu, oysa sicildeki `ttk` = Türkiye Taşkömürü Kurumu). Bu yüzden çağıran katman
    # `kurum_kimligi.kurum_sayfasi_mi` kapısını UYGULAMAK ZORUNDADIR.
    # ÜNİVERSİTE BİLEREK YOK. Alan adları kalıplı DEĞİL: kurumlar kendi kısaltmalarını
    # seçiyor (Abdullah Gül Üniversitesi → agu.edu.tr, Boğaziçi → boun.edu.tr, İTÜ →
    # itu.edu.tr) ama bazıları tam adı kullanıyor (hacettepe.edu.tr, ege.edu.tr). Addan
    # türetilemez; "abdullah-gul.edu.tr" denemek boşuna istek ve yanlış siteye düşme
    # riskidir. Üniversiteler zaten 124 s. KHK şablonuyla kapsanıyor; kapsam dışı vakıf
    # üniversiteleri için doğru yol LLM aramasıdır (allowed_domains=edu.tr).
}

# İl müdürlükleri bakanlığa göre AYRI alan kalıbı kullanır; tek bir kural yok.
# Anahtar: slug'ın il adından sonraki kuyruğu.
_IL_MUDURLUGU_KALIPLARI: dict[str, tuple[str, ...]] = {
    "il-saglik-mudurlugu": ("{alan}ism.saglik.gov.tr",),
    "il-milli-egitim-mudurlugu": ("{alan}.meb.gov.tr",),
    "il-tarim-orman-mudurlugu": ("{alan}.tarimorman.gov.tr",),
    "vergi-dairesi-baskanligi": ("{alan}vdb.gib.gov.tr",),
    "il-nufus-vatandaslik-mudurlugu": ("{alan}.nvi.gov.tr",),
    "il-kultur-turizm-mudurlugu": ("{alan}.ktb.gov.tr",),
    "cevre-sehircilik-iklim-degisikligi-il-mudurlugu": ("{alan}.csb.gov.tr",),
    "il-muftulugu": ("{alan}.diyanet.gov.tr",),
}

# Merkezî kurum türleri — bunlarda alan adı slug'ın kendisidir (`<slug>.gov.tr`).
# Özel şirketler (elektrik/doğalgaz dağıtım) BİLEREK DIŞARIDA: alan adları .com.tr ve
# ölçümde 21/21'i başarısız oldu; her biri için iki boş istek atmanın karşılığı yok.
_MERKEZI_TURLER = frozenset({
    "diger", "kit", "ust_kurul", "cumhurbaskanligi_ofis_kurul",
    "bagli_kurulus", "ilgili_kurulus", "iliskili_kurulus",
})
_MERKEZI_SABLONLAR = ("www.{alan}.gov.tr", "{alan}.gov.tr")

_MERKEZI_OLCUMU = """2026-08-06 ölçümü — 90 karantina kurumunda `<slug>.gov.tr`:
  TUTTU (19): botas · btk · dhmi · ego · epdk · eshot · euas · iett · kosgeb · mta ·
              osym · rtuk · spk · tcdd · teias · tihek · tki · tpao · tubitak
  ÇAKIŞMA (1): ttk → ttk.gov.tr AÇILDI ama Türk Tarih Kurumu'na ait; sicildeki `ttk`
              Türkiye Taşkömürü Kurumu. Kimlik kapısı yakaladı ve reddetti.
  TUTMADI (70): özel şirketler (.com.tr) · kısaltmayla anılan kurumlar
              (yuksekogretim-kurulu → yok.gov.tr, trt → trt.net.tr, tse → tse.org.tr).
              Bunlar için doğru yol web aramasıdır.
Kimlik kapısı ayrıca gerçek sayfalarda ölçüldü: 29 kurum, 0 yanlış-pozitif,
0 etkin yanlış-negatif (reddedilen tek sayfa zaten 0 birim veriyordu)."""

_OLCUM_NOTU = """2026-08-06 ölçümü (12 aday, 9 başarılı):
  TUTTU  : nilufer.bel.tr · selcuklu.bel.tr · kayseri.gov.tr · ordu.gov.tr ·
           tavsanli.gov.tr · izmirism.saglik.gov.tr · konyaism.saglik.gov.tr ·
           samsun.tarimorman.gov.tr · kayseri.meb.gov.tr
  TUTMADI: ankaravdb.gib.gov.tr (ConnectError) · tokat.defterdarligi.gov.tr
           (ConnectError; usak.defterdarligi.gov.tr da aynı) ·
           bursa.tarimorman.gov.tr (ConnectTimeout — ama samsun aynı kalıpta çalıştı,
           yani kalıp değil o site sorunlu)
Sonuç: kalıp yaklaşımı %75 ilk denemede tutuyor. Tutmayanlar için LLM araması
(allowed_domains ile resmî alanlara kilitli) yedek katmandır."""

# Kurum türünün slug kuyruğu — alan adını çıkarmak için atılır.
_KUYRUKLAR = (
    "-buyuksehir-belediyesi", "-belediyesi", "-valiligi", "-kaymakamligi",
    "-il-ozel-idaresi", "-defterdarligi", "-universitesi",
)

_TEMIZ_RE = re.compile(r"[^a-z0-9-]")


def _alan_kokü(slug: str) -> str:
    """'nilufer-belediyesi' → 'nilufer'. Kuyruk eşleşmezse slug olduğu gibi döner."""
    s = (slug or "").strip().lower().translate(_ASCII)
    for kuyruk in _KUYRUKLAR:
        if s.endswith(kuyruk):
            s = s[: -len(kuyruk)]
            break
    return _TEMIZ_RE.sub("", s)


def _il_mudurlugu_kuyrugu(slug: str, il_slug: str) -> str:
    """'adana-il-saglik-mudurlugu' + 'adana' → 'il-saglik-mudurlugu'."""
    s = (slug or "").strip().lower().translate(_ASCII)
    onek = f"{il_slug}-"
    return s[len(onek):] if il_slug and s.startswith(onek) else ""


def il_slugu(kayit: dict[str, Any]) -> str:
    """Sicil kaydından il adının slug hâli ('Şanlıurfa' → 'sanliurfa')."""
    il = (kayit.get("il") or "").strip().lower().translate(_ASCII)
    return _TEMIZ_RE.sub("", re.sub(r"\s+", "", il))


def aday_alanlar(kayit: dict[str, Any]) -> list[str]:
    """Sicil kaydı → denenecek resmî alan adı adayları (sıralı, tekilleştirilmiş).

    Ağa ÇIKMAZ. Boş liste = bu tür için ölçülmüş bir kalıp yok; çağıran LLM aramasına
    düşmelidir. Kalıp uydurmak yerine boş dönmek bilinçlidir: yanlış alan adı denemek
    hem zaman kaybı hem de yanlış kuruma ait bir siteye düşme riskidir.
    """
    slug = str(kayit.get("slug") or "")
    tur = str(kayit.get("tur") or "")
    if not slug:
        return []

    if tur == "il_mudurlugu":
        il = il_slugu(kayit)
        kuyruk = _il_mudurlugu_kuyrugu(slug, il)
        sablonlar = _IL_MUDURLUGU_KALIPLARI.get(kuyruk, ())
        alan = il
    elif tur in _MERKEZI_TURLER:
        sablonlar = _MERKEZI_SABLONLAR
        alan = _alan_kokü(slug)
    else:
        sablonlar = _KALIPLAR.get(tur, ())
        alan = _alan_kokü(slug)

    if not sablonlar or not alan:
        return []

    # ÇAKIŞMA KAPISI — merkez ilçe kaymakamlığı VALİLİĞİN adresine düşer.
    # "Adıyaman Kaymakamlığı" → adiyaman.gov.tr, ki bu Adıyaman VALİLİĞİ'nin sitesidir.
    # Kimlik kapısı (core.kurum_kimligi) bunu yakalayamaz: her iki kurumun adında da
    # ayırt edici kelime yalnız il adıdır ve valilik sayfasında da geçer. Yani memura
    # yanlış kurumun birim listesi resmî bir linkle sunulurdu.
    # Ayrıca kapsam çalışmasında ölçüldü: büyükşehir olmayan illerin merkez ilçesinde
    # kaymakamlık ZATEN YOKTUR (görevi vali yürütür). Boş dönmek iki sebeple de doğru.
    if tur == "kaymakamlik" and alan == il_slugu(kayit):
        return []
    # Çok kelimeli adlarda Türk kamu alan adları tireyi genelde ATAR ("19 Mayıs" →
    # 19mayis.bel.tr). Hangisinin kullanıldığı kurumdan kuruma değişir, bu yüzden ikisi de
    # denenir — maliyeti bir HTTP isteği, kazancı tek kelimeli olmayan ilçelerin tamamı.
    varyant = [alan] if "-" not in alan else [alan, alan.replace("-", "")]
    return list(dict.fromkeys(
        f"https://{s.format(alan=a)}" for a in varyant for s in sablonlar
    ))


def kalip_var_mi(tur: str, kuyruk: str = "") -> bool:
    """Bu tür (ve il müdürlüğünde kuyruk) için ölçülmüş bir kalıp tanımlı mı?"""
    if tur == "il_mudurlugu":
        return kuyruk in _IL_MUDURLUGU_KALIPLARI
    return tur in _KALIPLAR or tur in _MERKEZI_TURLER


__all__ = ("aday_alanlar", "il_slugu", "kalip_var_mi")
