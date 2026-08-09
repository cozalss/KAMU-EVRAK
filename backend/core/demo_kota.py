"""Günlük belge kotası — kullanıcı + ziyaretçi + ağ, üç eksenli.

DÜRÜST SINIR ÖNCE: kimliksiz bir ziyaretçide kota ATLATILAMAZ YAPILAMAZ. Herhangi bir
anonim kimlik ya ziyaretçinin sildiği bir şeydir (çerez) ya da satın alabildiği bir
şeydir (IP). Gerçek bir proxy havuzu bu kotayı yener. Kota bir ADALET aracıdır; para
garantisini `core/demo_butce.py` defteri verir ve o aşılamaz — sınırsız kimlik de günlük
tavandan fazlasını harcayamaz.

ÜÇ EKSEN NEDEN:
· yalnız çerez    → temizle, sınırsız hak. NAT arkasındaki ofis ise adil bölünür.
· yalnız IP       → NAT arkasındaki 4 kişilik ofis TEK ziyaretçi sayılır, biri
                    diğerlerini aç bırakır.
· yalnız hesap    → çıkış yap, anonim kovadan taze hak.
Üçü BİRDEN sayılınca: 4 kişilik ofis 4 ayrı çerezle 3'er hak alır (toplam 12 = ağ
tavanı), çerez silen ağ tavanına takılır, GİRİŞ YAPMIŞ kullanıcı ise çerezini silse de
tarayıcı değiştirse de kendi hesabının 3 hakkını taşır.

HESAP EKSENİ NEDEN ZİYARETÇİ EKSENİNİ *EKLER*, DEĞİŞTİRMEZ: yalnız hesaba bakılsaydı
"çıkış yap → anonim kovada taze 3 hak" açığı kalırdı. İkisi birden sayıldığı için
kullanıcının oturumdayken harcadığı hak tarayıcı kovasından da düşer; çıkış yapmak yeni
hak üretmez.

HEP YA HİÇ: eksenler tek kararda ÖNCE hepsi kontrol edilir, SONRA hepsi artırılır. Ağ
kovası doluyken ziyaretçi hakkının yanması, hakkı olan kullanıcıyı başkasının davranışı
yüzünden cezalandırırdı.

KALICILIK (9 Ağu 2026): sayaçların TEK GERÇEĞİ `demo_kota` tablosudur
(`core/demo_kota_kalici`). Buradaki sözlük artık yalnız DB erişilemezken devreye giren
YEDEKTİR. Sebep ölçüldü: Render ücretsiz katmanı 15 dk hareketsizlikte uyuyor, süreç
belleği her uyanışta sıfırlanıyor ve "günde 3" fiilen "uyanış başına 3" oluyordu.
"""

from __future__ import annotations

import os
import threading
from typing import NamedTuple

import structlog

from core.gun_indeksi import bugun_indeksi

log = structlog.get_logger()

# Bellek tavanı — sözlük büyütme saldırısına karşı. Dolduğunda YENİ anahtar REDDEDİLİR
# (fail-closed); `api/routes/mobil.py` MAX_AKTIF_OTURUM deseniyle aynı.
_AZAMI_ANAHTAR = 50_000

_KILIT = threading.Lock()
# anahtar -> (gun, sayac)
_SAYAC: dict[str, tuple[int, int]] = {}


class KotaSonucu(NamedTuple):
    izin: bool
    kalan_ziyaretci: int
    kalan_ag: int
    sebep: str          # "" | "kullanici" | "ziyaretci" | "ag" | "bellek"
    kalan_kullanici: int = 0


def gunluk_ziyaretci() -> int:
    try:
        return max(0, int(os.getenv("DEMO_KOTA_BELGE_GUN", "3")))
    except ValueError:
        return 3


def gunluk_ag() -> int:
    try:
        return max(0, int(os.getenv("DEMO_KOTA_AG_GUN", "12")))
    except ValueError:
        return 12


class _Eksen(NamedTuple):
    anahtar: str
    tavan: int
    ad: str             # "kullanici" | "ziyaretci" | "ag"


def _eksenler(ziyaretci_anahtari: str, ag_anahtari: str, kullanici_anahtari: str) -> tuple[_Eksen, ...]:
    """Kontrol edilecek eksenler, ÖNCELİK SIRASINDA (mesaj bu sıradan seçilir).

    Kullanıcı ekseninin tavanı ziyaretçininkiyle aynıdır: ürün sözü "günde 3 belge"dir ve
    o söz hesabın kendisi için de geçerli olmalı.
    """
    z_tavan, a_tavan = gunluk_ziyaretci(), gunluk_ag()
    liste = []
    if kullanici_anahtari:
        liste.append(_Eksen(kullanici_anahtari, z_tavan, "kullanici"))
    liste.append(_Eksen(ziyaretci_anahtari, z_tavan, "ziyaretci"))
    liste.append(_Eksen(ag_anahtari, a_tavan, "ag"))
    return tuple(liste)


def _tekil(eksenler: tuple[_Eksen, ...]) -> tuple[tuple[str, int], ...]:
    """Artırılacak (anahtar, tavan) çiftleri — aynı anahtar bir kez.

    Çerezsiz istekte ziyaretçi ve ağ anahtarı AYNIDIR; iki kez artırmak tek isteği iki
    belge saydırırdı. Aynı anahtar iki eksende görünürse en DÜŞÜK tavan geçerlidir
    (daha kısıtlayıcı yön).
    """
    en_dusuk: dict[str, int] = {}
    for e in eksenler:
        mevcut = en_dusuk.get(e.anahtar)
        en_dusuk[e.anahtar] = e.tavan if mevcut is None else min(mevcut, e.tavan)
    return tuple(en_dusuk.items())


def _sonuc(sayaclar: dict[str, int], eksenler: tuple[_Eksen, ...], sebep: str) -> KotaSonucu:
    """Eksen sayaçlarından UI'nin okuduğu kalan-hak görünümü."""
    def kalan(ad: str) -> int:
        for e in eksenler:
            if e.ad == ad:
                return max(0, e.tavan - sayaclar.get(e.anahtar, 0))
        return 0
    return KotaSonucu(
        izin=not sebep,
        kalan_ziyaretci=kalan("ziyaretci"),
        kalan_ag=kalan("ag"),
        sebep=sebep,
        # Hesap ekseni yoksa (anonim) kalan_kullanici ziyaretçi hakkıyla aynı görünür —
        # UI tek sayı gösterir ve giriş yapmamış kullanıcıya "0 hak" demek yanlış olurdu.
        kalan_kullanici=kalan("kullanici") if any(e.ad == "kullanici" for e in eksenler)
        else kalan("ziyaretci"),
    )


# --- Bellek katmanı (DB erişilemezken YEDEK) --------------------------------

def _oku(anahtar: str, bugun: int) -> int:
    """Anahtarın bugünkü sayacı (gün dönmüşse 0)."""
    gun, sayac = _SAYAC.get(anahtar, (bugun, 0))
    return sayac if gun == bugun else 0


def _supur(bugun: int) -> None:
    """Eski güne ait anahtarları at (bellek sınırlı kalsın)."""
    eski = [a for a, (g, _) in _SAYAC.items() if g != bugun]
    for a in eski:
        del _SAYAC[a]


def bellegi_esitle(sayaclar: dict[str, int]) -> None:
    """Kalıcı katmandan okunan sayaçları belleğe YANSIT (asla azaltmaz).

    Neden: DB gün ortasında düşerse yedek katman sıfırdan değil, o ana kadar GÖRÜLEN
    sayaçtan devam etsin. Azaltmama şartı `demo_harcama_kalici.gunluk_yaz`'daki
    yüksek-su seviyesi disipliniyle aynı.
    """
    bugun = bugun_indeksi()
    with _KILIT:
        for anahtar, sayac in sayaclar.items():
            if anahtar and sayac > _oku(anahtar, bugun):
                _SAYAC[anahtar] = (bugun, sayac)


def kota_bak(ziyaretci_anahtari: str, ag_anahtari: str,
             kullanici_anahtari: str = "") -> KotaSonucu:
    """Hak YAKMADAN durumu döndür (UI sayacı için) — bellek katmanı."""
    bugun = bugun_indeksi()
    eksenler = _eksenler(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)
    with _KILIT:
        sayaclar = {e.anahtar: _oku(e.anahtar, bugun) for e in eksenler}
    dolu = next((e.ad for e in eksenler if sayaclar[e.anahtar] >= e.tavan), "")
    return _sonuc(sayaclar, eksenler, dolu)


def kota_dus(ziyaretci_anahtari: str, ag_anahtari: str,
             kullanici_anahtari: str = "") -> KotaSonucu:
    """Bir belge hakkı düş — bellek katmanı. Tüm eksenler müsaitse hepsi artar."""
    bugun = bugun_indeksi()
    eksenler = _eksenler(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)
    with _KILIT:
        _supur(bugun)
        sayaclar = {e.anahtar: _oku(e.anahtar, bugun) for e in eksenler}

        dolu = next((e.ad for e in eksenler if sayaclar[e.anahtar] >= e.tavan), "")
        if dolu:
            # Dolu OLMAYAN eksenlerin hakkı YANMAZ — başkasının davranışı (ya da başka bir
            # eksen) hak sahibini cezalandırmamalı.
            return _sonuc(sayaclar, eksenler, dolu)

        artacak = _tekil(eksenler)
        yeni_anahtar = sum(1 for a, _ in artacak if a not in _SAYAC)
        if yeni_anahtar and len(_SAYAC) + yeni_anahtar > _AZAMI_ANAHTAR:
            log.error("demo.kota_bellek_tavani", anahtar_sayisi=len(_SAYAC))
            return _sonuc(sayaclar, eksenler, "bellek")

        for anahtar, _tavan in artacak:
            sayaclar[anahtar] = _oku(anahtar, bugun) + 1
            _SAYAC[anahtar] = (bugun, sayaclar[anahtar])
        return _sonuc(sayaclar, eksenler, "")


# --- Dayanıklı katman (DB birincil, bellek yedek) ---------------------------

async def kota_bak_dayanikli(ziyaretci_anahtari: str, ag_anahtari: str,
                             kullanici_anahtari: str = "") -> KotaSonucu:
    """Hak yakmadan durum — kalıcı sayaçtan. DB yoksa bellek yedeğine düşer."""
    from core import demo_kota_kalici as kalici

    eksenler = _eksenler(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)
    anahtarlar = tuple(a for a, _ in _tekil(eksenler) if kalici.gecerli_anahtar(a))
    sayaclar = await kalici.sayaclari_oku(bugun_indeksi(), anahtarlar)
    if sayaclar is None:
        return kota_bak(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)
    bellegi_esitle(sayaclar)
    dolu = next((e.ad for e in eksenler if sayaclar.get(e.anahtar, 0) >= e.tavan), "")
    return _sonuc(sayaclar, eksenler, dolu)


async def kota_dus_dayanikli(ziyaretci_anahtari: str, ag_anahtari: str,
                             kullanici_anahtari: str = "") -> KotaSonucu:
    """Bir belge hakkı düş — KALICI sayaçta. DB yoksa bellek yedeğine düşer.

    Kalıcı yol başarılı olduğunda bellek de eşitlenir; DB gün ortasında düşerse yedek
    sıfırdan değil son görülen sayaçtan devam eder.
    """
    from core import demo_kota_kalici as kalici

    eksenler = _eksenler(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)
    artacak = tuple((a, t) for a, t in _tekil(eksenler) if kalici.gecerli_anahtar(a))
    if not artacak:
        return kota_dus(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)

    sonuc = await kalici.dus(bugun_indeksi(), artacak)
    if sonuc is None:                       # DB erişilemedi → yedek katman
        return kota_dus(ziyaretci_anahtari, ag_anahtari, kullanici_anahtari)
    bellegi_esitle(sonuc.sayaclar)
    # Dolu anahtarları EKSEN ÖNCELİĞİNE çevir: birden fazla eksen doluysa kullanıcıya
    # gösterilecek mesaj en anlamlı olandır (kendi hakkın > ağın hakkı).
    dolu = next((e.ad for e in eksenler if e.anahtar in sonuc.dolu), "")
    return _sonuc(sonuc.sayaclar, eksenler, dolu)


def kotayi_sifirla() -> None:
    """YALNIZ test/bakım."""
    with _KILIT:
        _SAYAC.clear()


__all__ = ("KotaSonucu", "bellegi_esitle", "gunluk_ag", "gunluk_ziyaretci", "kota_bak",
           "kota_bak_dayanikli", "kota_dus", "kota_dus_dayanikli", "kotayi_sifirla")
