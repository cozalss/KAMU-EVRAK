"""auth.security._secret_yukle — taze klon boot sözleşmesi.

.env'siz `uv run main.py` import-time RuntimeError ile ÇÖKMEMELİ: AUTH_JWT_SECRET yoksa
geçici rastgele secret üretilir (hardcode YOK — her süreçte taze), uyarı loglanır.
Gerçek değer varsa aynen kullanılır (üretim davranışı değişmez).
"""

from __future__ import annotations

from auth.security import _secret_yukle


def test_env_degeri_aynen_kullanilir(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", "gercek-uretim-secret-0123456789abcdef")
    assert _secret_yukle() == "gercek-uretim-secret-0123456789abcdef"


def test_yoksa_gecici_guclu_secret_uretilir(monkeypatch):
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    s = _secret_yukle()
    # 32 bayt hex = 64 karakter — kriptografik güçte, sabit değil
    assert len(s) == 64
    int(s, 16)  # hex olduğunu doğrula (değilse ValueError)


def test_gecici_secret_her_cagrida_farkli(monkeypatch):
    # Hardcoded/deterministik fallback OLMADIĞININ kanıtı
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    assert _secret_yukle() != _secret_yukle()


def test_bos_deger_yok_sayilir(monkeypatch):
    # .env'de 'AUTH_JWT_SECRET=' (değersiz satır) → boş string ile JWT imzalanmaz
    monkeypatch.setenv("AUTH_JWT_SECRET", "   ")
    assert len(_secret_yukle()) == 64
