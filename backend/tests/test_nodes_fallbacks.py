"""Node hata/fallback yolları — LLM-yok (mock) deterministik davranış + ENV-gated no-op.

LLM_MODE=mock (conftest); mock json_mode {"domain":...} döndürür → node'lar şemayı
tanımaz, deterministik keyword/regex/yapısal fallback'e düşer. Bu testler o fallback
katmanlarını ve ENV-gated (CRAG/Self-RAG/clarifier) no-op yollarını kilitler.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import pytest

import agents.nodes.self_rag as self_rag_mod
from agents.nodes._llm_extract import parse_json_object
from agents.nodes.clarifier import clarifier_node, kritik_eksikler
from agents.nodes.eksik_tespit import _fallback_sorular, _zorunlu_for, eksik_tespit_node
from agents.nodes.mevzuat_oner import (
    _baslik,
    _from_config,
    _kanun_nolari,
    _normalize_madde_refs,
    _tokenize,
)
from agents.nodes.ozetle import _fallback_ozet, _redact_pii, ozetle_node
from agents.nodes.self_rag import _alan_dolu, _eksik_alanlar, _mevzuat_dolu, self_rag_node
from agents.nodes.siniflandir import _from_llm, _heuristik, siniflandir_node


# ---------------------------------------------------------------------------
# parse_json_object — tolerant LLM çıktı parse
# ---------------------------------------------------------------------------
class TestParseJsonObject:
    def test_temiz_json(self):
        # Act + Assert
        assert parse_json_object('{"a": 1}') == {"a": 1}

    def test_fence_temizlenir(self):
        # Arrange — ```json çitli
        assert parse_json_object('```json\n{"x": 2}\n```') == {"x": 2}

    def test_gomulu_obje_cikarilir(self):
        # Arrange — metin içinde gömülü {}
        assert parse_json_object('cevap: {"k": "v"} son') == {"k": "v"}

    def test_bos_none(self):
        # Act + Assert
        assert parse_json_object("") is None

    def test_gecersiz_none(self):
        # Act + Assert
        assert parse_json_object("json değil") is None

    def test_liste_none(self):
        # Arrange — JSON liste (dict değil) → None
        assert parse_json_object("[1, 2, 3]") is None


# ---------------------------------------------------------------------------
# siniflandir — katmanlı heuristik fallback (LLM mock → fallback)
# ---------------------------------------------------------------------------
class TestSiniflandirHeuristik:
    def test_konu_tur_sozcugu(self):
        # Arrange — Konu satırı 'fatura'
        out = _heuristik("konu: malzeme alımı fatura ödenmesi")
        # Assert
        assert out["evrak_turu"] == "fatura"

    def test_oncelikli_govde_cimer(self):
        # Arrange — CİMER kanal vurgusu öncelikli
        out = _heuristik("çevrim içi başvuru sistemi üzerinden ilettim")
        # Assert
        assert out["evrak_turu"] == "cimer"

    def test_vatandas_blogu_dilekce(self):
        # Arrange — Ad-Soyad bloğu + serbest talep, açık keyword yok
        out = _heuristik("mahalledeki sorunun çözülmesini istiyorum ad-soyad: ali veli")
        # Assert — vatandaş → dilekçe (citizen/yapısal)
        assert out["evrak_turu"] in {"dilekce", "talep", "basvuru", "sikayet", "cimer", "ihbar"}

    def test_eslesme_yok_belirsiz(self):
        # Arrange — hiçbir sinyal
        out = _heuristik("xyzqw 999 zzz")
        # Assert — abstention
        assert out["evrak_turu"] == "belirsiz"
        assert out["tur_confidence"] < 0.45

    async def test_node_bos_metin_belirsiz(self):
        # Arrange + Act
        out = await siniflandir_node({"evrak_text": "   "})
        # Assert
        assert out["evrak_turu"] == "belirsiz"
        assert out["tur_confidence"] == 0.0

    async def test_node_fallback_calisir(self):
        # Arrange — mock LLM şemayı tanımaz → heuristik
        out = await siniflandir_node({"evrak_text": "Konu: haciz icra takibi başlatılması"})
        # Assert
        assert out["evrak_turu"] == "icra_evraki"


class TestFromLlm:
    """_from_llm — LLM JSON doğrulama + abstention kapısı."""

    def test_gecerli_tur(self):
        # Act
        out = _from_llm({"evrak_turu": "dilekce", "tur_confidence": 0.9, "tur_reasoning": "x"})
        # Assert
        assert out["evrak_turu"] == "dilekce"

    def test_gecersiz_tur_none(self):
        # Arrange — kapalı-küme dışı
        assert _from_llm({"evrak_turu": "uydurma_tur", "tur_confidence": 0.9}) is None

    def test_dusuk_guven_belirsize_duser(self):
        # Arrange — geçerli tür ama güven eşik altı
        out = _from_llm({"evrak_turu": "fatura", "tur_confidence": 0.2})
        # Assert
        assert out["evrak_turu"] == "belirsiz"

    def test_gecersiz_confidence_sifir(self):
        # Arrange — parse edilemez güven → 0.0 → belirsiz
        out = _from_llm({"evrak_turu": "fatura", "tur_confidence": "abc"})
        # Assert
        assert out["evrak_turu"] == "belirsiz"


# ---------------------------------------------------------------------------
# ozetle — fallback özet + PII redaksiyon
# ---------------------------------------------------------------------------
class TestOzetleFallback:
    def test_redact_tckn(self):
        # Arrange — 11 haneli geçerli TCKN
        out = _redact_pii("Başvuran 12345678901 numaralı")
        # Assert
        assert "[TCKN]" in out
        assert "12345678901" not in out

    def test_redact_telefon(self):
        # Arrange
        out = _redact_pii("Tel: 0555 123 45 67")
        # Assert
        assert "[TEL]" in out

    def test_fallback_ozet_tur_konu(self):
        # Arrange
        out = _fallback_ozet("Park aydınlatma talebi.", "dilekce", "Aydınlatma")
        # Assert — tür etiketi + konu + gövde
        assert "Dilekçe" in out
        assert "Aydınlatma" in out

    def test_fallback_uzun_metin_kisalir(self):
        # Arrange — 280+ karakter
        uzun = "kelime " * 100
        out = _fallback_ozet(uzun, "rapor", None)
        # Assert — kısaltma işareti
        assert "…" in out

    async def test_node_bos_metin(self):
        # Arrange + Act
        out = await ozetle_node({"evrak_text": "", "evrak_turu": "talep"})
        # Assert
        assert "metin boş" in out["ozet"]

    async def test_node_fallback_ozet_uretir(self):
        # Arrange — mock LLM şemayı tanımaz → fallback
        out = await ozetle_node({"evrak_text": "Mahalle parkı aydınlatma talebi.",
                                 "evrak_turu": "dilekce", "bilgi_unsurlari": {"konu": "park"}})
        # Assert
        assert out["ozet"]
        assert "Dilekçe" in out["ozet"]


# ---------------------------------------------------------------------------
# eksik_tespit — tür-bağımlı zorunlu + fallback sorular
# ---------------------------------------------------------------------------
class TestEksikTespit:
    def test_resmi_yazi_zorunlu(self):
        # Act — resmî yazı kümesi
        assert _zorunlu_for("ust_yazi") == ("konu", "tarih", "imza")

    def test_dilekce_tam_zorunlu(self):
        # Act — vatandaş evrakı tüm ZORUNLU_ALANLAR
        z = _zorunlu_for("dilekce")
        # Assert
        assert "iletisim_adres" in z
        assert "imza" in z

    def test_fallback_sorular_etiketli(self):
        # Arrange
        sorular = _fallback_sorular(["imza", "konu"])
        # Assert — bilinen alanlar Türkçe soru üretir
        assert len(sorular) == 2
        assert any("imza" in s.lower() for s in sorular)

    def test_fallback_bilinmeyen_alan_atlanir(self):
        # Arrange — haritada olmayan alan
        assert _fallback_sorular(["rastgele_alan"]) == []

    async def test_node_eksik_tespit(self):
        # Arrange — boş unsurlar → tüm alanlar eksik
        out = await eksik_tespit_node({"bilgi_unsurlari": {}, "evrak_turu": "ust_yazi"})
        # Assert
        assert set(out["eksik_alanlar"]) == {"konu", "tarih", "imza"}


# ---------------------------------------------------------------------------
# self_rag — ENV-gated reflection
# ---------------------------------------------------------------------------
class TestSelfRag:
    def test_alan_dolu_string(self):
        # Act + Assert
        assert _alan_dolu({"ozet": "dolu"}, "ozet") is True
        assert _alan_dolu({"ozet": "  "}, "ozet") is False
        assert _alan_dolu({"ozet": None}, "ozet") is False

    def test_alan_dolu_liste(self):
        # Act + Assert
        assert _alan_dolu({"x": [1]}, "x") is True
        assert _alan_dolu({"x": []}, "x") is False

    def test_mevzuat_dolu_corrected_oncelik(self):
        # Arrange — CRAG düzeltilmiş liste varsa o tercih edilir
        assert _mevzuat_dolu({"mevzuat_onerileri_corrected": [{"baslik": "x"}]}) is True

    def test_mevzuat_dolu_baseline(self):
        # Act + Assert
        assert _mevzuat_dolu({"mevzuat_onerileri": [{"baslik": "y"}]}) is True
        assert _mevzuat_dolu({}) is False

    def test_eksik_alanlar_tespit(self):
        # Arrange — yalnız evrak_turu dolu
        eksik = _eksik_alanlar({"evrak_turu": "dilekce"})
        # Assert — diğerleri eksik listede
        assert "özet" in eksik
        assert "ilgili mevzuat" in eksik

    async def test_node_kapali_no_op(self, monkeypatch):
        # Arrange — SELF_RAG_ENABLED kapalı (varsayılan) → boş dict
        monkeypatch.setattr(self_rag_mod, "SELF_RAG_ENABLED", False)
        # Act
        out = await self_rag_node({"evrak_turu": "dilekce"})
        # Assert
        assert out == {}

    async def test_node_acik_tam_cikti(self, monkeypatch):
        # Arrange — açık + tüm alanlar dolu
        monkeypatch.setattr(self_rag_mod, "SELF_RAG_ENABLED", True)
        state = {"evrak_turu": "dilekce", "hedef_birim": "x", "ozet": "özet",
                 "yazi_taslak_md": "taslak", "mevzuat_onerileri": [{"baslik": "m"}]}
        # Act
        out = await self_rag_node(state)
        # Assert
        assert out["self_rag_tam"] is True
        assert out["self_rag_eksikler"] == []

    async def test_node_acik_eksik_not(self, monkeypatch):
        # Arrange — açık + eksik alan
        monkeypatch.setattr(self_rag_mod, "SELF_RAG_ENABLED", True)
        # Act
        out = await self_rag_node({"evrak_turu": "dilekce"})
        # Assert
        assert out["self_rag_tam"] is False
        assert "eksik" in out["self_rag_notu"].lower()


# ---------------------------------------------------------------------------
# clarifier — kritik eksik dur-ve-sor
# ---------------------------------------------------------------------------
class TestClarifier:
    def test_kritik_eksikler_dilekce(self):
        # Arrange — dilekçe + imza eksik
        state = {"evrak_turu": "dilekce", "eksik_alanlar": ["imza", "konu"]}
        # Act
        kritik = kritik_eksikler(state)
        # Assert — yalnız CLARIFY_KRITIK_ALANLAR kesişimi
        assert "imza" in kritik
        assert "konu" not in kritik

    def test_kritik_yok_resmi_yazi(self):
        # Arrange — resmî yazıda kritik kabul edilmez
        assert kritik_eksikler({"evrak_turu": "ust_yazi", "eksik_alanlar": ["imza"]}) == []

    async def test_node_kritik_yoksa_passthrough(self):
        # Arrange — kritik eksik yok
        out = await clarifier_node({"evrak_turu": "dilekce", "eksik_alanlar": []})
        # Assert
        assert out["want_stop"] is False
        assert out["clarify_stop"] is False

    async def test_node_kritik_varsa_dur_ve_sor(self):
        # Arrange — imza + adres eksik
        state = {"evrak_turu": "dilekce",
                 "eksik_alanlar": ["imza", "iletisim_adres"],
                 "clarify_questions": ["İmza ekleyin", "Adres ekleyin"]}
        # Act
        out = await clarifier_node(state)
        # Assert
        assert out["want_stop"] is True
        assert "kritik" in out["response"].lower()


# ---------------------------------------------------------------------------
# mevzuat_oner — saf retrieval yardımcıları
# ---------------------------------------------------------------------------
class TestMevzuatHelpers:
    def test_normalize_madde_refs(self):
        # Act — m.4 / madde 4 → madde4
        norm = _normalize_madde_refs("3071 m.4 ile madde 5")
        # Assert
        assert "madde4" in norm
        assert "madde5" in norm

    def test_tokenize_stopword_elenir(self):
        # Arrange — boilerplate/stopword temizlenir
        tokens = _tokenize("dilekçe ve arz ederim için")
        # Assert — 'dilekçe' kalır; 've'/'arz'/'ederim'/'için' elenir
        assert "dilekçe" in tokens
        assert "ve" not in tokens
        assert "arz" not in tokens

    def test_kanun_nolari_tespit(self):
        # Arrange — 4 haneli kanun + 2005-7
        nolar = _kanun_nolari("3071 sayılı Kanun ve 2005/7 SDP")
        # Assert
        assert "3071" in nolar
        assert "2005-7" in nolar

    def test_baslik_madde_no_var(self):
        # Act
        b = _baslik({"mevzuat": "3071 sayılı Kanun", "madde_no": 4})
        # Assert
        assert "m.4" in b

    def test_baslik_madde_no_yok_dogrula(self):
        # Act — madde_no None → [DOĞRULA:]
        b = _baslik({"mevzuat": "X Kanun", "madde_no": None})
        # Assert
        assert "DOĞRULA" in b

    def test_from_config_bilinen_tur(self):
        # Act — dilekçe statik mevzuatı
        oneriler = _from_config("dilekce")
        # Assert
        assert oneriler
        assert "3071" in oneriler[0]["baslik"]

    def test_from_config_bilinmeyen_tur_varsayilan(self):
        # Act — haritada olmayan tür → varsayılan yönetmelik
        oneriler = _from_config("bilinmeyen")
        # Assert
        assert len(oneriler) == 1
        assert oneriler[0]["score"] == 0.3


@pytest.mark.parametrize("turu", ["dilekce", "bilgi_edinme", "tebligat", "ust_yazi"])
def test_from_config_kaynakli_oneriler(turu: str):
    # Arrange + Act — her bilinen tür kaynaklı başlık döndürür
    oneriler = _from_config(turu)
    # Assert — uydurma değil, başlık dolu
    assert all(o["baslik"] for o in oneriler)
