"""TTS harcama kotası — KULLANICI BAŞINA, karakter üzerinden, kayan pencere.

Neden ayrı bir katman (slowapi limiti varken):
  · slowapi anahtarı IP'dir (api/middleware/ratelimit.py, key_func=get_remote_address).
    Aynı kurum ağındaki memurlar tek bütçeyi paylaşır; biri diğerlerini aç bırakabilir.
  · Maliyet İSTEK sayısıyla değil KARAKTER sayısıyla orantılıdır — 4000 karakterlik istek,
    200 karakterliğin 20 katıdır. Kota bu yüzden karakter sayar.
  · slowapi opsiyonel bağımlılıktır; kurulu değilse hız sınırı tamamen düşer, bu kota kalır.

Bilinçli sadelik: süreç-içi sözlük. Tek instance için yeterlidir; çok-instance dağıtımda
kota instance başına uygulanır (üst sınır instance sayısıyla çarpılır) — kabul edilen sınır,
bunun yerine paylaşımlı sayaç (Redis) gerekirse buradaki arayüz aynı kalır.
"""

from __future__ import annotations

import time

# Bir kullanıcının dakikada seslendirebileceği toplam karakter. Gerçek bir sesli görüşmede
# tur başına ~300 karakter konuşulur (dakikada 3-4 tur ≈ 1200); 4000 bunun rahat üstünde,
# kötüye kullanımın ise belirgin altındadır.
KOTA_KARAKTER_DAKIKA = 4000
_PENCERE_SN = 60.0

# kullanici_id -> [(zaman, karakter), ...]
_pencere: dict[str, list[tuple[float, int]]] = {}


def _simdi() -> float:
    """Monotonik saat — testte monkeypatch edilir (duvar saati kaymalarından etkilenmez)."""
    return time.monotonic()


def _suzgecten_gecir(simdi: float) -> None:
    """Pencere dışındaki kayıtları at; hiç kaydı kalmayan kullanıcıyı sözlükten düşür."""
    for anahtar in list(_pencere):
        kalan = [(t, n) for t, n in _pencere[anahtar] if simdi - t < _PENCERE_SN]
        if kalan:
            _pencere[anahtar] = kalan
        else:
            del _pencere[anahtar]


def kota_dus(kullanici_id: str, karakter: int) -> bool:
    """Bu isteği kotadan düş. İzin varsa True (ve harcama kaydedilir), aşımda False.

    karakter <= 0 ise kota yakılmaz (boş metin zaten seslendirilmez).
    """
    if karakter <= 0:
        return True
    simdi = _simdi()
    _suzgecten_gecir(simdi)
    kayitlar = _pencere.get(kullanici_id, [])
    harcanan = sum(n for _, n in kayitlar)
    if harcanan + karakter > KOTA_KARAKTER_DAKIKA:
        return False
    _pencere[kullanici_id] = [*kayitlar, (simdi, karakter)]
    return True


def kotayi_sifirla() -> None:
    """Tüm sayaçları sıfırla (yalnız test/bakım)."""
    _pencere.clear()


__all__ = ("KOTA_KARAKTER_DAKIKA", "kota_dus", "kotayi_sifirla")
