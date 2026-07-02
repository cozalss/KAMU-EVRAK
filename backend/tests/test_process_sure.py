"""ProcessResponse.sure_ms — işlem süresi veri hattı (Panel süre grafiği kaynağı).

Süre alanı bugüne dek hiçbir yerde ölçülmüyordu (DB islem.sure_ms hep NULL).
/process_doc yanıtı uçtan-uca süreyi ms cinsinden taşımalı; DB persist açıkken
persist_islem'e geçirilir ve islem_listele result'ında geri döner (ayrı entegrasyon).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main

_ORNEK = (
    "T.C. ÖRNEK BELEDİYESİ\nTarih: 12.03.2026\nKonu: Park aydınlatması talebi\n"
    "Sayın yetkili, mahallemizdeki parkın aydınlatılmasını talep ederim.\n"
    "Ayşe Yılmaz — imza"
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


class TestProcessSure:
    def test_process_yaniti_sure_ms_tasir(self, client: TestClient):
        # Act — mock modda blocking pipeline (conftest LLM_MODE=mock → deterministik)
        res = client.post("/process_doc", json={"evrak_text": _ORNEK, "filename": "ornek.txt"})
        body = res.json()
        # Assert — süre ölçülmüş ve makul (0 ≤ ms < 5 dk); HITL interrupt yolunda da dolu
        assert res.status_code == 200
        assert isinstance(body.get("sure_ms"), int)
        assert 0 <= body["sure_ms"] < 300_000
