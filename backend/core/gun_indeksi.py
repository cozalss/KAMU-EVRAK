"""UTC gün indeksi — günlük kota ve günlük bütçe penceresinin ortak zaman tabanı.

NEDEN AYRI BİR MODÜL (ve neden `core/tts_kota.py` deseni doğrudan kullanılamadı):
`tts_kota._simdi()` `time.monotonic()` döner. Monotonik saat SÜREÇ BAŞLANGICINA görelidir
ve yeniden başlatmada sıfırlanır; 60 saniyelik pencere için bu doğru tercihtir ama
24 SAATLİK bir pencere ifade edemez — süreç her yeniden başladığında "gün" başa döner.
Bu yüzden burada duvar saati kullanılır.

Duvar saatinin bedeli, saatin GERİ alınabilmesidir (NTP düzeltmesi, elle ayar, sanal
makine anlık görüntüsü). Geri giden bir gün indeksi, dolmuş kotayı ve dolmuş günlük
bütçeyi yeniden açardı. `_EN_YUKSEK_GUN` yüksek-su seviyesi bunu imkânsız kılar:
gün indeksi bu süreçte ASLA küçülmez. İleri sıçrama en fazla bir günü erken açar ve
ziyaretçi tarafından tetiklenemez — asimetri güvenli yönde.

Desen `kaynak_web_arama._SURECTE_HARCANAN` ile aynıdır: dışarıdan değiştirilebilen bir
kaynağa (dosya / saat) bağlı sınırı, süreç-içi bir alt sınırla çiviler.
"""

from __future__ import annotations

import threading
import time

_GUN_SN = 86_400.0

_KILIT = threading.Lock()
# Bu süreçte görülen en yüksek gün indeksi — geri gidişi engelleyen alt sınır.
_EN_YUKSEK_GUN = 0


def _simdi() -> float:
    """Duvar saati (epoch saniye). Testlerde monkeypatch edilir."""
    return time.time()


def bugun_indeksi() -> int:
    """UTC gün numarası (epoch // 86400). Bu süreçte ASLA küçülmez."""
    global _EN_YUKSEK_GUN
    ham = int(_simdi() // _GUN_SN)
    with _KILIT:
        if ham > _EN_YUKSEK_GUN:
            _EN_YUKSEK_GUN = ham
        return _EN_YUKSEK_GUN


def sifirla_test_icin() -> None:
    """Yüksek-su seviyesini sıfırla — YALNIZ test/bakım."""
    global _EN_YUKSEK_GUN
    with _KILIT:
        _EN_YUKSEK_GUN = 0


__all__ = ("bugun_indeksi", "sifirla_test_icin")
