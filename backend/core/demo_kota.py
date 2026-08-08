"""Demo günlük belge kotası — ziyaretçi + ağ, iki eksenli.

DÜRÜST SINIR ÖNCE: kimliksiz bir demoda kota ATLATILAMAZ YAPILAMAZ. Herhangi bir anonim
kimlik ya ziyaretçinin sildiği bir şeydir (çerez) ya da satın alabildiği bir şeydir (IP).
Gerçek bir proxy havuzu bu kotayı yener. Kota bir ADALET aracıdır; para garantisini
`core/demo_butce.py` defteri verir ve o aşılamaz — sınırsız kimlik de günlük tavandan
fazlasını harcayamaz.

İKİ EKSEN NEDEN:
· yalnız çerez → temizle, sınırsız hak. NAT arkasındaki ofis ise adil bölünür.
· yalnız IP    → NAT arkasındaki 4 kişilik ofis TEK ziyaretçi sayılır, biri diğerlerini
                 aç bırakır.
İkisi BİRDEN sayılınca: 4 kişilik ofis 4 ayrı çerezle 3'er hak alır (toplam 12 = ağ
tavanı, kimse kimseyi aç bırakmaz), çerez silen ise ağ tavanına takılır (3 → 12, sınırlı).

HEP YA HİÇ: iki kova tek kilit altında ÖNCE ikisi birden kontrol edilir, SONRA ikisi
birden artırılır. Ağ kovası doluyken ziyaretçi hakkının yanması, hakkı olan kullanıcıyı
başkasının davranışı yüzünden cezalandırırdı.
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
    sebep: str          # "" | "ziyaretci" | "ag" | "bellek"


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


def _oku(anahtar: str, bugun: int) -> int:
    """Anahtarın bugünkü sayacı (gün dönmüşse 0)."""
    gun, sayac = _SAYAC.get(anahtar, (bugun, 0))
    return sayac if gun == bugun else 0


def _supur(bugun: int) -> None:
    """Eski güne ait anahtarları at (bellek sınırlı kalsın)."""
    eski = [a for a, (g, _) in _SAYAC.items() if g != bugun]
    for a in eski:
        del _SAYAC[a]


def kota_bak(ziyaretci_anahtari: str, ag_anahtari: str) -> KotaSonucu:
    """Hak YAKMADAN durumu döndür (UI sayacı için)."""
    bugun = bugun_indeksi()
    z_tavan, a_tavan = gunluk_ziyaretci(), gunluk_ag()
    with _KILIT:
        z = _oku(ziyaretci_anahtari, bugun)
        a = _oku(ag_anahtari, bugun)
    return KotaSonucu(
        izin=z < z_tavan and a < a_tavan,
        kalan_ziyaretci=max(0, z_tavan - z),
        kalan_ag=max(0, a_tavan - a),
        sebep="" if (z < z_tavan and a < a_tavan) else ("ziyaretci" if z >= z_tavan else "ag"),
    )


def kota_dus(ziyaretci_anahtari: str, ag_anahtari: str) -> KotaSonucu:
    """Bir belge hakkı düş. İki kova da müsaitse TRUE ve İKİSİ birden artar."""
    bugun = bugun_indeksi()
    z_tavan, a_tavan = gunluk_ziyaretci(), gunluk_ag()
    with _KILIT:
        _supur(bugun)
        z = _oku(ziyaretci_anahtari, bugun)
        a = _oku(ag_anahtari, bugun)

        if z >= z_tavan:
            return KotaSonucu(False, 0, max(0, a_tavan - a), "ziyaretci")
        if a >= a_tavan:
            # Ziyaretçi hakkı YANMAZ — ağ tavanı başkasının davranışıdır.
            return KotaSonucu(False, max(0, z_tavan - z), 0, "ag")

        yeni_anahtar = sum(1 for k in (ziyaretci_anahtari, ag_anahtari) if k not in _SAYAC)
        if yeni_anahtar and len(_SAYAC) + yeni_anahtar > _AZAMI_ANAHTAR:
            log.error("demo.kota_bellek_tavani", anahtar_sayisi=len(_SAYAC))
            return KotaSonucu(False, max(0, z_tavan - z), max(0, a_tavan - a), "bellek")

        _SAYAC[ziyaretci_anahtari] = (bugun, z + 1)
        if ag_anahtari != ziyaretci_anahtari:
            _SAYAC[ag_anahtari] = (bugun, a + 1)
            kalan_ag = max(0, a_tavan - (a + 1))
        else:
            # Çerezsiz istekte iki anahtar aynıdır → tek artış, çift sayma yok.
            kalan_ag = max(0, a_tavan - (z + 1))
        return KotaSonucu(True, max(0, z_tavan - (z + 1)), kalan_ag, "")


def kotayi_sifirla() -> None:
    """YALNIZ test/bakım."""
    with _KILIT:
        _SAYAC.clear()


__all__ = ("KotaSonucu", "gunluk_ag", "gunluk_ziyaretci", "kota_bak", "kota_dus",
           "kotayi_sifirla")
