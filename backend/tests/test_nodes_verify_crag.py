"""verify + crag node davranış testleri — format-uyum/uydurma-veto + CRAG güven/sorgu.

agents/nodes/verify.py + crag.py: deterministik (regex/state). verify uydurma-veto
(taslakta olup kaynakta olmayan tarih/sayı), eksik-bölüm, placeholder muafiyeti,
VERIFY_ENABLED no-op; crag retrieval güveni + genişletilmiş sorgu + ENV-gated no-op.
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import agents.nodes.crag as crag_mod
import agents.nodes.verify as verify_mod
from agents.nodes.crag import _genisletilmis_sorgu, _retrieval_guveni, crag_node
from agents.nodes.verify import (
    _eksik_bolumler,
    _kaynak_tokenlar,
    _uydurma_veto,
    verify_node,
)


# ---------------------------------------------------------------------------
# verify — saf yardımcılar
# ---------------------------------------------------------------------------
class TestEksikBolumler:
    def test_tam_taslak_eksik_yok(self):
        # Arrange — tüm zorunlu bölümler (küçük harf)
        taslak = "t.c. başkanlığı sayı: 1 konu: x arz ederim ad soyad"
        # Act
        eksik = _eksik_bolumler(taslak)
        # Assert
        assert eksik == []

    def test_eksik_sayi_yakalanir(self):
        # Arrange — Sayı yok
        taslak = "t.c. konu: x arz ederim imza"
        # Act
        eksik = _eksik_bolumler(taslak)
        # Assert
        assert "Sayı" in eksik


class TestKaynakTokenlar:
    def test_evrak_ve_unsurlardan_toplar(self):
        # Arrange — ham metin + bilgi_unsurlari tarih/sayı
        state = {"evrak_text": "01.01.2026 tarihli E-1234567 sayılı yazı.",
                 "bilgi_unsurlari": {"tarih": "02.02.2026"}}
        # Act
        tarihler, sayilar = _kaynak_tokenlar(state)
        # Assert
        assert "01.01.2026" in tarihler
        assert "02.02.2026" in tarihler
        assert "1234567" in sayilar or "E-1234567" in sayilar


class TestUydurmaVeto:
    def test_kaynakta_olmayan_tarih_veto(self):
        # Arrange — taslakta 99.99.9999, kaynakta yok
        taslak = "Taslak 99.12.2099 tarihli."
        state = {"evrak_text": "tarih içermeyen kaynak"}
        # Act
        uyarilar = _uydurma_veto(taslak, state)
        # Assert
        assert any("99.12.2099" in u for u in uyarilar)

    def test_kaynakta_olan_tarih_veto_yok(self):
        # Arrange — taslaktaki tarih kaynakta da var
        taslak = "Taslak 01.01.2026 tarihli."
        state = {"evrak_text": "01.01.2026 tarihli evrak"}
        # Act
        uyarilar = _uydurma_veto(taslak, state)
        # Assert — false-veto yok
        assert uyarilar == []

    def test_placeholder_muaf(self):
        # Arrange — {{ }} içindeki değer uydurma sayılmaz
        taslak = "Tarih: {{ 12.12.2099 }} burada."
        state = {"evrak_text": "kaynak metni"}
        # Act
        uyarilar = _uydurma_veto(taslak, state)
        # Assert
        assert uyarilar == []


class TestVerifyNode:
    async def test_kapali_no_op(self, monkeypatch):
        # Arrange — VERIFY_ENABLED kapalı → boş dict
        monkeypatch.setattr(verify_mod, "VERIFY_ENABLED", False)
        # Act
        out = await verify_node({"yazi_taslak_md": "taslak"})
        # Assert
        assert out == {}

    async def test_taslak_yoksa_atlanir(self, monkeypatch):
        # Arrange — açık ama taslak boş
        monkeypatch.setattr(verify_mod, "VERIFY_ENABLED", True)
        # Act
        out = await verify_node({"yazi_taslak_md": ""})
        # Assert
        assert "atlandı" in out["verify_notes"]
        assert out["verify_uyari"] == []

    async def test_eksik_bolum_format_uyumlu_false(self, monkeypatch):
        # Arrange — açık + eksik bölümlü taslak
        monkeypatch.setattr(verify_mod, "VERIFY_ENABLED", True)
        # Act — yalnız T.C. var, Sayı/Konu/imza yok
        out = await verify_node({"yazi_taslak_md": "T.C. başlığı", "evrak_text": "kaynak"})
        # Assert
        assert out["format_uyumlu"] is False
        assert any("Eksik bölüm" in u for u in out["verify_uyari"])

    async def test_temiz_taslak_uyari_yok(self, monkeypatch):
        # Arrange — açık + tam bölümlü taslak (uydurma yok)
        monkeypatch.setattr(verify_mod, "VERIFY_ENABLED", True)
        taslak = "T.C.\nSayı: 1\nKonu: x\narz ederim\nimza"
        # Act
        out = await verify_node({"yazi_taslak_md": taslak, "evrak_text": "kaynak"})
        # Assert
        assert out["verify_uyari"] == []
        assert "tamam" in out["verify_notes"].lower()


# ---------------------------------------------------------------------------
# crag — retrieval güveni + sorgu genişletme + ENV-gated
# ---------------------------------------------------------------------------
class TestRetrievalGuveni:
    def test_bos_oneri_sifir(self):
        # Act + Assert
        assert _retrieval_guveni([]) == 0.0

    def test_raw_score_normalize(self):
        # Arrange — güçlü ham BM25 → CRAG_RAW_ESIK üstü → ~1.0
        guven = _retrieval_guveni([{"baslik": "x", "raw_score": 30.0}])
        # Assert — min(30/12, 1.0) = 1.0
        assert guven == 1.0

    def test_config_fallback_score_proxy(self):
        # Arrange — raw_score yok → normalize score güven proxy'si
        guven = _retrieval_guveni([{"baslik": "x", "score": 0.3}])
        # Assert
        assert guven == 0.3

    def test_zayif_raw_dusuk_guven(self):
        # Arrange — zayıf ham skor → oransal düşük
        guven = _retrieval_guveni([{"baslik": "x", "raw_score": 6.0}])
        # Assert — 6/12 = 0.5
        assert guven == 0.5


class TestGenisletilmisSorgu:
    def test_konu_tur_domain_birlesir(self):
        # Arrange — dilekçe + konu → tür etiketi + domain terimleri
        state = {"evrak_turu": "dilekce",
                 "bilgi_unsurlari": {"konu": "park aydınlatma"},
                 "evrak_text": "Mahalle parkına aydınlatma talebi."}
        # Act
        sorgu = _genisletilmis_sorgu(state)
        # Assert — tür etiketi + konu sorguda
        assert "Dilekçe" in sorgu
        assert "aydınlatma" in sorgu

    def test_bos_state_bos_sorgu(self):
        # Act — hiçbir alan yok
        sorgu = _genisletilmis_sorgu({})
        # Assert
        assert sorgu == ""


class TestCragNode:
    async def test_kapali_no_op(self, monkeypatch):
        # Arrange — CRAG_ENABLED kapalı → boş dict
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", False)
        # Act
        out = await crag_node({"mevzuat_onerileri": [{"baslik": "x", "score": 0.3}]})
        # Assert
        assert out == {}

    async def test_yuksek_guven_atlanir(self, monkeypatch):
        # Arrange — açık ama retrieval güçlü (raw yüksek) → düzeltme atlanır
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        # Act
        out = await crag_node({"mevzuat_onerileri": [{"baslik": "x", "raw_score": 30.0}]})
        # Assert
        assert out["crag_corrected"] is False
