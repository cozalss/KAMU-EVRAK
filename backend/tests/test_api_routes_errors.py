"""API route hata/kenar durumları — 422 (boş/eksik gövde), yazı taslak indirme, OCR akışı.

TestClient gerçek ASGI hattı (LLM_MODE=mock). yazi.py 422 (boş metin / render yok),
process_doc düz+stream başarı, multimodal boş/normal. Mevcut test_api_security.py /
test_api_health_ratelimit.py'yi TEKRARLAMAZ (farklı yol/iddialar).
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# /yazi/taslak — Görev 2 PDF/DOCX indirme + hata yolları
# ---------------------------------------------------------------------------
class TestYaziTaslak:
    """POST /yazi/taslak — geçerli indirme + boş/geçersiz girdi 422."""

    def test_bos_metin_422(self, client: TestClient):
        # Arrange — min_length=1 → pydantic 422 (boş string)
        resp = client.post("/yazi/taslak?format=pdf", json={"evrak_text": ""})
        # Assert
        assert resp.status_code == 422

    def test_eksik_alan_422(self, client: TestClient):
        # Arrange — evrak_text yok
        resp = client.post("/yazi/taslak?format=pdf", json={})
        # Assert
        assert resp.status_code == 422

    def test_gecersiz_format_422(self, client: TestClient):
        # Arrange — format pattern dışı (yalnız pdf|docx)
        resp = client.post("/yazi/taslak?format=txt",
                           json={"evrak_text": "Konu: aydınlatma talebi"})
        # Assert
        assert resp.status_code == 422

    def test_pdf_indirme_basarili_veya_422(self, client: TestClient):
        # Arrange — render altyapısı (reportlab) varsa PDF bytes; yoksa 422 (her ikisi geçerli)
        metin = ("Sayın yetkili, mahalle parkına aydınlatma talebimi arz ederim. "
                 "Ad-Soyad: Ali Veli, Atatürk Cad. No:5, imza.")
        # Act
        resp = client.post("/yazi/taslak?format=pdf", json={"evrak_text": metin})
        # Assert — 200 (bytes) veya 422 (render yok); 500 OLMAMALI
        assert resp.status_code in (200, 422)
        if resp.status_code == 200:
            assert resp.headers["content-type"] == "application/pdf"
            assert "attachment" in resp.headers.get("content-disposition", "")

    def test_docx_indirme_basarili_veya_422(self, client: TestClient):
        # Arrange
        metin = ("Sayın yetkili, talebimi arz ederim. Ad-Soyad: Ali Veli, "
                 "Atatürk Cad. No:5, imza.")
        # Act
        resp = client.post("/yazi/taslak?format=docx", json={"evrak_text": metin})
        # Assert
        assert resp.status_code in (200, 422)


# ---------------------------------------------------------------------------
# /process_doc/stream — SSE akış (dosya yükle → OCR + node event)
# ---------------------------------------------------------------------------
class TestProcessDocStream:
    """POST /process_doc/stream — SSE event akışı (start/node/done veya error)."""

    def test_metin_dosyasi_sse_akisi(self, client: TestClient):
        # Arrange — düz metin dosyası (OCR text yolu)
        metin = ("Konu: park aydınlatma talebi. Mahalle parkına aydınlatma "
                 "yapılmasını arz ederim. Ad-Soyad: Ali Veli, imza.")
        files = {"file": ("evrak.txt", io.BytesIO(metin.encode("utf-8")), "text/plain")}
        # Act
        resp = client.post("/process_doc/stream", files=files)
        # Assert — SSE content-type + start event
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        govde = resp.text
        assert '"event": "start"' in govde
        # OCR adımı (oku) + en az bir node veya done/error event'i
        assert '"node": "oku"' in govde

    def test_okunamayan_dosya_error_event(self, client: TestClient):
        # Arrange — metin çıkmayan ikili içerik (OCR boş döner)
        files = {"file": ("bos.bin", io.BytesIO(b"\x00\x01\x02\x03"),
                          "application/octet-stream")}
        # Act
        resp = client.post("/process_doc/stream", files=files)
        # Assert — 200 SSE; içerikte error veya done (OCR sonucuna göre)
        assert resp.status_code == 200
        assert '"event":' in resp.text


class TestStreamPersistSirasi:
    """SSE sözleşmesi: `done` DB persist'i BEKLEMEZ (uzak Supabase sonucu geciktirmesin);
    islem_id sonradan `persist` event'iyle tamamlanır."""

    def test_done_persistten_once_islem_id_persist_eventinde(
            self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        # Arrange — persist açık + sahte persist (uzak DB yok; sabit islem_id döner)
        from api.routes import process_doc as pd
        monkeypatch.setenv("DB_PERSIST", "1")

        async def sahte_persist(state, response, kaynak_metin, filename, owner_id=None):
            return "ISLEM-TEST-42"
        monkeypatch.setattr(pd, "_maybe_persist", sahte_persist)
        metin = ("Konu: park aydınlatma talebi. Mahalle parkına aydınlatma "
                 "yapılmasını arz ederim. Ad-Soyad: Ali Veli, imza.")
        files = {"file": ("evrak.txt", io.BytesIO(metin.encode("utf-8")), "text/plain")}
        # Act
        resp = client.post("/process_doc/stream", files=files)
        # Assert — done, persist'ten ÖNCE gelir; persist event'i islem_id taşır
        govde = resp.text
        done_idx = govde.find('"event": "done"')
        persist_idx = govde.find('"event": "persist"')
        assert done_idx != -1, "done event'i yok"
        assert persist_idx != -1, "persist event'i yok"
        assert done_idx < persist_idx, "done, persist'ten önce yayınlanmalı"
        assert '"islem_id": "ISLEM-TEST-42"' in govde

    def test_persist_kapaliyken_persist_eventi_yok(
            self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        # Arrange — DB_PERSIST kapalı → persist event'i hiç yayınlanmaz, done yine gelir
        monkeypatch.setenv("DB_PERSIST", "0")
        metin = ("Konu: park aydınlatma talebi. Mahalle parkına aydınlatma "
                 "yapılmasını arz ederim. Ad-Soyad: Ali Veli, imza.")
        files = {"file": ("evrak.txt", io.BytesIO(metin.encode("utf-8")), "text/plain")}
        # Act
        resp = client.post("/process_doc/stream", files=files)
        # Assert
        assert '"event": "done"' in resp.text
        assert '"event": "persist"' not in resp.text


# ---------------------------------------------------------------------------
# /multimodal/ocr — normal yol + sözleşme
# ---------------------------------------------------------------------------
class TestMultimodalOcr:
    """POST /multimodal/ocr — metin dosyası OCRResponse döndürür."""

    def test_metin_dosyasi_ocr_response(self, client: TestClient):
        # Arrange
        metin = "Bu bir test evrak metnidir."
        files = {"file": ("evrak.txt", io.BytesIO(metin.encode("utf-8")), "text/plain")}
        # Act
        resp = client.post("/multimodal/ocr", files=files)
        # Assert — OCRResponse şeması
        assert resp.status_code == 200
        body = resp.json()
        assert "text" in body
        assert "engine" in body
        assert "n_chars" in body


# ---------------------------------------------------------------------------
# /process_doc — düz JSON yol (uzun metin kırpma sözleşmesi)
# ---------------------------------------------------------------------------
class TestProcessDocJson:
    """POST /process_doc — düz JSON metin pipeline."""

    def test_bos_metin_422(self, client: TestClient):
        # Arrange — min_length=1
        resp = client.post("/process_doc", json={"evrak_text": ""})
        # Assert
        assert resp.status_code == 422

    def test_arsiv_metadata_doner(self, client: TestClient):
        # Arrange — yenilikçilik arşiv metadata sözleşmesi
        metin = "Konu: fatura ödenmesi. Malzeme alımı bedeli ödenmelidir."
        # Act
        resp = client.post("/process_doc", json={"evrak_text": metin})
        # Assert
        assert resp.status_code == 200
        body = resp.json()
        assert "arsiv_metadata" in body
