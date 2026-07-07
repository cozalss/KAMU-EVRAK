"""Auth uçlarında IP-başı hız sınırı — güvenlik denetimi HIGH-1 bulgusu.

/auth/giris·kayit·yenile·cikis auth'suz açık ve (giris/kayit) kasıtlı-pahalı argon2
koşturur → sınırsız istek = parola deneme + CPU-DoS. Diğer tüm upload/işlem uçlarındaki
`@rate_limit` deseni buraya da uygulanır.

Test deseni: service katmanı monkeypatch'lenir (DB'ye inmeden deterministik yanıt);
TestClient gerçek ASGI hattını koşar → slowapi limiter aktif (conftest env'i değiştirmez).
NOT: limiter süreç-içi paylaşımlı sayaç tutar — her uca TEK test, sıkı döngüyle vurur.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from auth import service


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_giris_hiz_siniri(client: TestClient, monkeypatch):
    async def _kimlik_hatali(*a, **k):
        raise service.AuthError("kimlik_hatali", "test")

    monkeypatch.setattr(service, "giris", _kimlik_hatali)
    govde = {"eposta": "a@b.gov.tr", "parola": "yanlis-parola-123"}
    kodlar = [client.post("/auth/giris", json=govde).status_code for _ in range(6)]
    assert kodlar[:5] == [401] * 5          # sınır altı: normal akış (kimlik hatası)
    assert kodlar[5] == 429                 # 6. istek: hız sınırı


def test_kayit_hiz_siniri(client: TestClient, monkeypatch):
    async def _eposta_kayitli(*a, **k):
        raise service.AuthError("eposta_kayitli", "test")

    monkeypatch.setattr(service, "kayit", _eposta_kayitli)
    govde = {"eposta": "a@b.gov.tr", "parola": "Gecerli-Parola-123",
             "ad_soyad": "Ayşe Yılmaz", "birim_kod": "HUKUK"}
    kodlar = [client.post("/auth/kayit", json=govde).status_code for _ in range(4)]
    assert kodlar[:3] == [409] * 3
    assert kodlar[3] == 429


def test_yenile_hiz_siniri(client: TestClient, monkeypatch):
    async def _oturum_gecersiz(*a, **k):
        raise service.AuthError("oturum_gecersiz", "test")

    monkeypatch.setattr(service, "yenile", _oturum_gecersiz)
    govde = {"refresh_token": "gecersiz-token"}
    kodlar = [client.post("/auth/yenile", json=govde).status_code for _ in range(6)]
    assert kodlar[:5] == [401] * 5
    assert kodlar[5] == 429


def test_cikis_hiz_siniri(client: TestClient, monkeypatch):
    async def _sessiz(*a, **k):
        return None

    monkeypatch.setattr(service, "cikis", _sessiz)
    govde = {"refresh_token": "herhangi-gecerli-uzunlukta-token"}
    kodlar = [client.post("/auth/cikis", json=govde).status_code for _ in range(11)]
    assert kodlar[:10] == [204] * 10
    assert kodlar[10] == 429
