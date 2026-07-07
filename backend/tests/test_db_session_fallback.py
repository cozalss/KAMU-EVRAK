"""db.session._url_yukle — taze klon boot sözleşmesi (auth._secret_yukle deseninin eşi).

DATABASE_URL yokken import-time RuntimeError boot'u çökertiyordu; artık geçerli-sözdizimli
placeholder + uyarı (engine lazy bağlanır → API/pipeline çalışır, persist/auth ilk
kullanımda hızlı ve yakalanan hatayla düşer — .env.example kopyalanmış durumla birebir).
"""

from __future__ import annotations

from db.session import _url_yukle


def test_env_degeri_aynen_kullanilir(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@ornek:6543/db")
    assert _url_yukle() == "postgresql+asyncpg://u:p@ornek:6543/db"


def test_yoksa_gecerli_placeholder_doner(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    url = _url_yukle()
    # create_async_engine'in parse edebileceği geçerli asyncpg URL'i olmalı (boot kırılmaz)
    assert url.startswith("postgresql+asyncpg://")


def test_bos_deger_yok_sayilir(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "   ")
    assert _url_yukle().startswith("postgresql+asyncpg://")


def test_uretimde_eksik_url_fail_fast(monkeypatch):
    # Placeholder üretimde yanlış-konfigürasyonu maskelemesin (auth._secret_yukle ile aynı kapı)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    import pytest as _pytest

    with _pytest.raises(RuntimeError, match="DATABASE_URL"):
        _url_yukle()
