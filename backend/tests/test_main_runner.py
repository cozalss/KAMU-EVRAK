"""main._dev_host_port — standart komutun (uv run main.py) LAN sözleşmesi.

Mobil QR akışının 'taze klon → tek komut → telefon erişir' garantisi bu fonksiyona
dayanır: varsayılan 0.0.0.0 (uv --env-file parse edilemese ya da .env hiç olmasa bile),
UVICORN_HOST/PORT ile ezilebilir, bozuk girdi sessizce güvenli varsayılana döner.
"""

from __future__ import annotations

import pytest

from main import _dev_host_port


@pytest.fixture(autouse=True)
def _temiz_env(monkeypatch):
    """UVICORN_* değişkenlerini temizle — geliştirici makinesindeki .env testi kirletmesin."""
    monkeypatch.delenv("UVICORN_HOST", raising=False)
    monkeypatch.delenv("UVICORN_PORT", raising=False)


def test_varsayilan_lan_binding():
    # .env yok / uv parse edemedi → yine de 0.0.0.0 (mobil QR sözleşmesi)
    assert _dev_host_port() == ("0.0.0.0", 8000)


def test_uvicorn_host_ile_ezilir(monkeypatch):
    # Güvenilmeyen ağda kısıtlama: UVICORN_HOST=127.0.0.1 aynen uygulanır
    monkeypatch.setenv("UVICORN_HOST", "127.0.0.1")
    host, _ = _dev_host_port()
    assert host == "127.0.0.1"


def test_uvicorn_port_ile_ezilir(monkeypatch):
    monkeypatch.setenv("UVICORN_PORT", "9000")
    assert _dev_host_port()[1] == 9000


def test_bozuk_port_guvenli_varsayilana_doner(monkeypatch):
    monkeypatch.setenv("UVICORN_PORT", "sekiz-bin")
    assert _dev_host_port()[1] == 8000


@pytest.mark.parametrize("aralik_disi", ["0", "-1", "99999"])
def test_aralik_disi_port_guvenli_varsayilana_doner(monkeypatch, aralik_disi):
    # int'e çevrilebilen ama geçersiz TCP portu → bind hatası yerine güvenli varsayılan
    monkeypatch.setenv("UVICORN_PORT", aralik_disi)
    assert _dev_host_port()[1] == 8000


def test_bos_host_guvenli_varsayilana_doner(monkeypatch):
    # .env'de 'UVICORN_HOST=' (değersiz satır) → boş string binding hatası vermesin
    monkeypatch.setenv("UVICORN_HOST", "   ")
    assert _dev_host_port()[0] == "0.0.0.0"
