"""CORS yapılandırması regresyon testleri.

İki bug avı bulgusunu kilitler:
- 20eb433a (HIGH): CORS PATCH/DELETE'i dışlıyordu → taslak Kaydet(PATCH)/Sil(DELETE) uçları
  gerçek cross-origin dağıtımda preflight'ta engelleniyordu.
- d95de652 (HIGH): CORS_ORIGINS='*' + allow_credentials=True kombinasyonu (Starlette'in
  sessizce reddettiği güvensiz kombinasyon) artık startup'ta RuntimeError ile reddedilir.
"""

from __future__ import annotations

import importlib
import os

import pytest
from starlette.testclient import TestClient

import main


class TestCorsPreflight:
    def test_patch_ve_delete_preflightta_izinli(self):
        # Arrange
        client = TestClient(main.app)
        # Act — PATCH için CORS preflight (taslak Kaydet ucu)
        r = client.options(
            "/islem/deadbeef/taslak",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        # Assert — izin verilen metotlar PATCH ve DELETE'i içermeli
        izin = r.headers.get("access-control-allow-methods", "")
        assert "PATCH" in izin, f"PATCH preflight'ta reddedildi: {izin!r}"
        assert "DELETE" in izin, f"DELETE preflight'ta reddedildi: {izin!r}"


class TestCorsStartupGuvenligi:
    def test_yildiz_origin_credentials_ile_startupta_reddedilir(self, monkeypatch):
        # Arrange — güvensiz kombinasyon
        monkeypatch.setenv("CORS_ORIGINS", "*")
        try:
            # Act + Assert — modül yeniden yüklenince RuntimeError yükselmeli
            with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
                importlib.reload(main)
        finally:
            # Teardown — temiz env ile main'i yeniden yükleyip diğer testler için geri yükle
            monkeypatch.delenv("CORS_ORIGINS", raising=False)
            os.environ.pop("CORS_ORIGINS", None)
            importlib.reload(main)
