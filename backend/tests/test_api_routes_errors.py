"""API route hata/kenar durumları — 422 (boş/eksik gövde), yazı taslak indirme, OCR akışı.

TestClient gerçek ASGI hattı (LLM_MODE=mock). yazi.py 422 (boş metin / render yok),
process_doc düz+stream başarı, multimodal boş/normal. Mevcut test_api_security.py /
test_api_health_ratelimit.py'yi TEKRARLAMAZ (farklı yol/iddialar).
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import io
import operator
from typing import Annotated, TypedDict

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


def _sse_olaylari(govde: str) -> list[dict]:
    """SSE gövdesini `data: {...}` satırlarından olay listesine çevir."""
    import json
    return [json.loads(s[len("data: "):]) for s in govde.splitlines() if s.startswith("data: ")]


class TestStreamAdimBasladi:
    """Canlı sahne o an HANGİ adımın çalıştığını gösterebilsin diye her pipeline node'u
    başlarken `status: active` yayılır (LangGraph `tasks` akış modu). Sözleşme: başladı
    olayı yalnız GERÇEKTEN koşan node için gelir ve bitişinden ÖNCE gelir; gizli yardımcı
    dallar (servis_birim) adım listesinde olmadığı için ne başladı ne bitti yayar."""

    METIN = ("Konu: park aydınlatma talebi. Mahalle parkına aydınlatma "
             "yapılmasını arz ederim. Ad-Soyad: Ali Veli, imza.")

    def _olaylar(self, client: TestClient) -> list[dict]:
        files = {"file": ("evrak.txt", io.BytesIO(self.METIN.encode("utf-8")), "text/plain")}
        return _sse_olaylari(client.post("/process_doc/stream", files=files).text)

    def test_her_biten_node_once_basladi_yayar(self, client: TestClient):
        # Act
        olaylar = self._olaylar(client)
        # Assert — oku dışındaki her `done`dan önce aynı node için `active` gelmiş olmalı
        node_olay = [(o["node"], o["status"]) for o in olaylar if o.get("event") == "node"]
        bitenler = [n for n, st in node_olay if st == "done" and n != "oku"]
        assert bitenler, "pipeline node'u bitmedi"
        for n in bitenler:
            i_aktif = node_olay.index((n, "active")) if (n, "active") in node_olay else -1
            assert i_aktif != -1, f"{n} başladı olayı yok"
            assert i_aktif < node_olay.index((n, "done")), f"{n} başladı, bitti'den sonra geldi"

    def test_basladi_yalniz_duyurulan_adimlar_icin(self, client: TestClient):
        # Arrange
        from agents.graph import GIZLI_NODELAR
        olaylar = self._olaylar(client)
        duyurulan = set(next(o for o in olaylar if o.get("event") == "start")["nodes"])
        # Assert — başladı olayları duyurulan listede; gizli dallar hiç yayılmaz
        aktifler = {o["node"] for o in olaylar if o.get("event") == "node" and o["status"] == "active"}
        assert aktifler <= duyurulan
        assert not aktifler & set(GIZLI_NODELAR)

    def test_basladi_olayi_veri_tasimaz(self, client: TestClient):
        # Başladı olayı node girdisini (ham evrak metni, maskesiz PII) SIZDIRMAZ — yalnız ad+durum.
        olaylar = self._olaylar(client)
        for o in olaylar:
            if o.get("event") == "node" and o["status"] == "active" and o["node"] != "oku":
                assert set(o) == {"event", "node", "status"}


class _SahteDurum(TypedDict, total=False):
    """Hata-adımı testindeki sahte grafın durumu (modül düzeyinde: `from __future__
    import annotations` altında yerel tanım Annotated'ı çözemiyor)."""

    x: Annotated[list, operator.add]


class TestStreamHataAdimi:
    """Akış bir adımda patlarsa `error` olayı HANGİ adımda durduğunu (`node`) ve o an
    eşzamanlı koşup yarıda kalan kardeşleri (`kesilen`) söyler; canlı sahne hatalı masayı
    kırmızı, yarıda kalanları "işlenmedi" gösterir. Ham istisna metni SIZMAZ (PII/iç yol)."""

    def _sahte_graf(self):
        from langgraph.checkpoint.memory import InMemorySaver
        from langgraph.graph import END, START, StateGraph


        def patla(_s):
            raise RuntimeError("GIZLI-IC-AYRINTI Ayşe Yılmaz 0555-123-4567")

        async def yavas(_s):
            import asyncio
            await asyncio.sleep(0.3)
            return {"x": ["b"]}

        g = StateGraph(_SahteDurum)
        g.add_node("siniflandir", lambda s: {"x": ["a"]})
        g.add_node("verify", patla)
        g.add_node("ozetle", yavas)
        g.add_edge(START, "siniflandir")
        g.add_edge("siniflandir", "verify")
        g.add_edge("siniflandir", "ozetle")
        g.add_edge(["verify", "ozetle"], END)
        return g.compile(checkpointer=InMemorySaver())

    def test_hata_olayi_adimi_ve_kesilenleri_soyler(
            self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        # Arrange
        from api.routes import process_doc as pd
        graf = self._sahte_graf()
        monkeypatch.setattr(pd, "_get_hitl_graph", lambda: graf)
        metin = "Konu: park aydınlatma talebi. Gereğini arz ederim."
        files = {"file": ("evrak.txt", io.BytesIO(metin.encode("utf-8")), "text/plain")}
        # Act
        olaylar = _sse_olaylari(client.post("/process_doc/stream", files=files).text)
        hata = next(o for o in olaylar if o.get("event") == "error")
        # Assert
        assert hata["node"] == "verify"
        assert hata["kesilen"] == ["ozetle"]
        assert hata["tur"] == "RuntimeError"
        govde = str(hata)
        assert "GIZLI-IC-AYRINTI" not in govde and "0555" not in govde


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


class TestResumePersist:
    """resume() artık process()/process_stream() ile AYNI persist kapısından geçer —
    daha önce memur kararı (HITL'in var olma sebebi) hiç DB'ye yazılmıyordu (regresyon testi).
    Gerçek graf/checkpointer devre dışı bırakılır (LLM_MODE=mock'ta bile DB gerektirmesin);
    yalnız resume()'un _persist_sonrasi'yi DOĞRU argümanlarla çağırdığı kanıtlanır."""

    def test_resume_persist_sonrasini_dogru_argumanlarla_cagirir(
            self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        # Arrange — sahte graf: resume edilen state, orijinal evrak_text/filename'i taşır
        # (OnayResumeRequest bunları taşımaz; LangGraph checkpoint'i korur — bkz. process_doc.py).
        from api.routes import process_doc as pd

        class _SahteGraph:
            async def ainvoke(self, komut, cfg):
                return {"evrak_text": "Konu: izin talebi.", "filename": "izin.txt",
                        "onay_durumu": "onaylandı", "yazi_taslak_md": "..."}

        cagrildi = {}

        async def _sahte_persist_sonrasi(request, state, response, kaynak_metin, filename):
            cagrildi.update({"kaynak_metin": kaynak_metin, "filename": filename})
            return "ISLEM-TEST-99"

        monkeypatch.setattr(pd, "HITL_ENABLED", True)
        monkeypatch.setattr(pd, "_get_hitl_graph", lambda: _SahteGraph())
        monkeypatch.setattr(pd, "_persist_sonrasi", _sahte_persist_sonrasi)
        # Act
        resp = client.post("/process_doc/resume", json={"thread_id": "t1", "secim": "onayla"})
        # Assert — persist ARTIK çağrılıyor, orijinal metin/dosya adıyla
        assert resp.status_code == 200
        assert cagrildi["kaynak_metin"] == "Konu: izin talebi."
        assert cagrildi["filename"] == "izin.txt"


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
