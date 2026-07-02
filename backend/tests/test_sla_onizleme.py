"""POST /sla/onizleme — işlenmemiş kuyruk öğeleri için SLA rozet önizlemesi.

Gelen Evrak kuyruğu işlenmeden SLA verisi taşımaz; rozet için compute_sla'nın
(tek doğruluk kaynağı) hafif bir endpoint'le yeniden kullanılması gerekir.
Tarih YALNIZ "Tarih:" etiketli satırdan okunur — gövdedeki rastgele tarih
yakalanmaz (sla_triyaj.py'deki belgelenmiş riskle aynı kural).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def _onizle(client: TestClient, ogeler: list[dict]) -> dict:
    res = client.post("/sla/onizleme", json={"ogeler": ogeler})
    assert res.status_code == 200
    return res.json()


class TestSlaOnizleme:
    def test_gecmis_tarihli_dilekce_gecikmis(self, client: TestClient):
        body = _onizle(client, [{
            "id": "d1", "tur": "dilekce",
            "metin": "T.C. ...\nTarih: 12.03.2024\nSayın yetkili...",
        }])
        meta = body["sonuclar"][0]["sla_metadata"]
        assert body["sonuclar"][0]["id"] == "d1"
        assert meta["durum"] == "GECIKMIS"
        assert meta["kalan_gun"] < 0

    def test_gelecek_tarihli_dilekce_normal(self, client: TestClient):
        meta = _onizle(client, [{
            "id": "d2", "tur": "dilekce", "metin": "Tarih: 01.01.2030\n...",
        }])["sonuclar"][0]["sla_metadata"]
        assert meta["durum"] == "NORMAL"

    def test_tarih_satiri_yoksa_tarih_yok(self, client: TestClient):
        meta = _onizle(client, [{
            "id": "s1", "tur": "sikayet", "metin": "Şikayetimi bildiririm...",
        }])["sonuclar"][0]["sla_metadata"]
        assert meta["durum"] == "tarih_yok"

    def test_govdedeki_rastgele_tarih_yakalanmaz(self, client: TestClient):
        # "Tarih:" etiketi yok — gövdede geçen 12.03.2019 SLA hesabına girmemeli.
        meta = _onizle(client, [{
            "id": "s2", "tur": "dilekce",
            "metin": "12.03.2019 tarihli yazınıza istinaden başvuruyorum.",
        }])["sonuclar"][0]["sla_metadata"]
        assert meta["durum"] == "tarih_yok"

    def test_tablo_disi_tur_tanimsiz(self, client: TestClient):
        meta = _onizle(client, [{
            "id": "u1", "tur": "ust_yazi", "metin": "Tarih: 12.03.2024\n...",
        }])["sonuclar"][0]["sla_metadata"]
        assert meta["durum"] == "tanimsiz"

    def test_coklu_oge_sira_ve_id_korunur(self, client: TestClient):
        body = _onizle(client, [
            {"id": "a", "tur": "dilekce", "metin": "Tarih: 12.03.2024"},
            {"id": "b", "tur": "bilgi_edinme", "metin": "Tarih: 01.01.2030"},
        ])
        assert [s["id"] for s in body["sonuclar"]] == ["a", "b"]

    def test_oge_siniri_asilirsa_422(self, client: TestClient):
        cok = [{"id": str(i), "tur": "dilekce", "metin": "x"} for i in range(41)]
        assert client.post("/sla/onizleme", json={"ogeler": cok}).status_code == 422
