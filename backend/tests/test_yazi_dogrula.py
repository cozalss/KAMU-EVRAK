"""POST /yazi/dogrula — taslağı (opsiyonel AI-revizyon sonrası) verify+risk_guard'dan
yeniden geçirme.

Bu uç, sendDraft'ın önceki davranışındaki bir güvenlik açığını kapatır: elle düzenlenen
taslak Giden Evrak'a yazılmadan önce doğrudan client'tan geliyordu, uydurma-veto/2646-lint/
risk-bandı kapılarından HİÇ geçmiyordu. Mock modda deterministik → CI güvenli.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

_EVRAK = (
    "T.C. SANAYİ VE TEKNOLOJİ BAKANLIĞI\nSayı: E-12345678-622.03-99999\n"
    "Tarih: 01.06.2026\nKonu: Çukur onarımı\n"
    "Sokağımızın başındaki çukurun onarılmasını arz ederim.\nAd-Soyad: Ayşe Yılmaz"
)

# Basit el-yazımı zorunlu-4-bölüm taslağı (yalnız format_uyumlu/eksik-bölüm testleri için —
# 2646 lint'in İNCE kurallarını (muhatap biçimi vb.) garanti karşılamaz, bkz. _tam_taslak()).
_TAM_TASLAK = (
    "T.C.\nSANAYİ VE TEKNOLOJİ BAKANLIĞI\n\n"
    "Sayı : E-12345678-622.03-99999\nKonu : Çukur onarımı\n\n"
    "Sayın Ayşe Yılmaz\n\nİlgi yazı ile bildirilen çukur onarımı konusuna ilişkin "
    "gerekli iş ve işlemlerin yapılması hususunda gereğini arz ederim.\n\n"
    "Ad Soyad\nUnvan"
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _tam_taslak(client):
    """Gerçek renderer'dan (2646-lint'in ince kurallarına gerçekten uyan) taslak üret."""
    r = client.post("/yazi/taslak-turu", json={
        "evrak_text": _EVRAK, "yazi_turu": "cevabi_yazi",
        "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Çukur onarımı",
                             "tarih": "01.06.2026", "sayi": "E-12345678-622.03-99999"},
    })
    assert r.status_code == 200, r.text
    return r.json()["yazi_taslak_md"]


def _dogrula(client, taslak_md, **ekstra):
    return client.post("/yazi/dogrula", json={
        "taslak_md": taslak_md, "evrak_text": _EVRAK, "yazi_turu": "cevabi_yazi",
        "evrak_turu": "dilekce", "bilgi_unsurlari": {"tarih": "01.06.2026",
        "sayi": "E-12345678-622.03-99999"}, **ekstra,
    })


class TestGirdiDogrulama:
    def test_bos_taslak_422(self, client):
        r = client.post("/yazi/dogrula", json={"taslak_md": "   "})
        assert r.status_code == 422


class TestVerifyRiskGuardEntegrasyonu:
    """Ana amaç: taslak_md verify_node + risk_guard_node'dan GERÇEKTEN geçiyor mu."""

    def test_tam_ve_tutarli_taslak_temiz_doner(self, client):
        # Gerçek renderer çıktısı (2646-uyumlu) + kaynakla tutarlı unsurlar → tertemiz sonuç.
        taslak = _tam_taslak(client)
        r = _dogrula(client, taslak, bilgi_unsurlari={
            "gonderen": "Ayşe Yılmaz", "tarih": "01.06.2026",
            "sayi": "E-12345678-622.03-99999",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["format_uyumlu"] is True
        assert data["verify_uyari"] == []
        assert data["risk_metadata"] is not None
        assert data["risk_metadata"]["bant"] == "yesil"

    def test_eksik_bolum_format_uyumsuz(self, client):
        # "Sayı" bölümü hiç yok → format_uyumlu False (Yön. 2646 zorunlu alan).
        eksik = "T.C.\nKonu : Çukur onarımı\n\nGereğini arz ederim.\nAd Soyad"
        r = _dogrula(client, eksik)
        assert r.status_code == 200, r.text
        assert r.json()["format_uyumlu"] is False

    def test_kaynakta_olmayan_tarih_uydurma_veto_tetikler(self, client):
        # Taslakta kaynak evrakta/bilgi_unsurlarında HİÇ olmayan bir tarih → uydurma uyarısı.
        uydurma = _TAM_TASLAK.replace("Sayı : E-12345678-622.03-99999",
                                       "Sayı : E-12345678-622.03-99999\nTarih : 09.09.2099")
        r = _dogrula(client, uydurma)
        assert r.status_code == 200, r.text
        data = r.json()
        assert any("09.09.2099" in u for u in data["verify_uyari"])
        # Uydurma tespit edilince risk bandı artık yeşil kalmamalı.
        assert data["risk_metadata"]["bant"] != "yesil"

    def test_risk_metadata_daima_dondurulur(self, client):
        r = _dogrula(client, _TAM_TASLAK)
        meta = r.json()["risk_metadata"]
        assert meta is not None
        assert meta["bant"] in ("yesil", "sari", "kirmizi")


class TestAiRevizyon:
    """talimat alanı — mock modda LLM revizyon yapmaz, orijinal taslak korunur."""

    def test_talimat_mock_modda_revize_edilmez(self, client):
        r = _dogrula(client, _TAM_TASLAK, talimat="daha resmi yap")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["revize_edildi"] is False
        assert data["taslak_md"] == _TAM_TASLAK

    def test_talimatsiz_istekte_revize_edildi_false(self, client):
        r = _dogrula(client, _TAM_TASLAK)
        assert r.json()["revize_edildi"] is False


class TestGuvenlik:
    """İstemci girdisi (bilgi_unsurlari/hedef_birim) enjeksiyona karşı sanitize edilir."""

    def test_ic_ice_unsur_patlamiyor(self, client):
        # dict/bool unsur değerleri _skaler_unsurlar tarafından elenir (bkz. taslak-turu testleri).
        r = _dogrula(client, _TAM_TASLAK, bilgi_unsurlari={"ic_ice": {"a": 1}, "imza": True})
        assert r.status_code == 200, r.text
