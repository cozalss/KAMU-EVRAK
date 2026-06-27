"""mevzuat_oner node testleri — BM25 korpus retrieval + config fallback.

LLM_MODE=mock (conftest) — node LLM'siz; korpus indeksinden BM25 ile madde-chunk
getirir. Korpus data/mevzuat/*.txt + seed indeksinden gelir (repo'da mevcut).

AAA deseni; gerçek korpus üzerinde davranış doğrulanır (mock yok — pipeline gerçek).
"""

from __future__ import annotations

from typing import ClassVar

from agents.config import EVRAK_TO_MEVZUAT
from agents.nodes.mevzuat_oner import (
    _baslik,
    _from_config,
    _load_index,
    _maybe_rerank,
    _retrieval_query,
    _tokenize,
    mevzuat_oner_node,
)


def _state(turu: str, konu: str, evrak_text: str) -> dict:
    return {
        "evrak_turu": turu,
        "bilgi_unsurlari": {"konu": konu},
        "evrak_text": evrak_text,
    }


# ---------------------------------------------------------------------------
# Return sözleşmesi
# ---------------------------------------------------------------------------


class TestMevzuatOnerSozlesme:
    async def test_mevzuat_onerileri_anahtari_doner(self):
        # Arrange
        state = _state("dilekce", "izin talebi", "Dilekçemde arz ederim.")
        # Act
        out = await mevzuat_oner_node(state)
        # Assert
        assert "mevzuat_onerileri" in out
        assert isinstance(out["mevzuat_onerileri"], list)

    async def test_her_oneri_baslik_icerir(self):
        # Arrange
        state = _state("dilekce", "izin talebi", "Dilekçemde arz ederim.")
        # Act
        out = await mevzuat_oner_node(state)
        # Assert
        assert out["mevzuat_onerileri"]
        for oneri in out["mevzuat_onerileri"]:
            assert oneri.get("baslik")
            assert isinstance(oneri.get("score"), (int, float))


# ---------------------------------------------------------------------------
# Korpus BM25 retrieval — türe göre doğru mevzuat üst sırada
# ---------------------------------------------------------------------------


class TestMevzuatOnerKorpusRetrieval:
    async def test_dilekce_3071_top1(self):
        # Arrange — dilekçe hakkına özgü ayırt edici terimler (dilekçe ile başvurma,
        # ad-soyad/imza/adres zorunlu). NOT: korpus 657 (yıllık izin) gibi alanları da
        # kapsadığından, "izin talebi" gibi alan-çakışan konu yerine dilekçe-hakkı
        # vokabülerini kullanırız → BM25 doğru biçimde 3071'i üst sıraya alır.
        state = _state(
            "dilekce",
            "dilekçe hakkı başvurusu",
            "Türk vatandaşları yetkili makamlara dilekçe ile başvurma hakkına "
            "sahiptir. Dilekçe sahibinin adı soyadı imzası ve adresi zorunludur.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — dilekçe → 3071 (Dilekçe Hakkı Kanunu) en üstte
        assert out["mevzuat_onerileri"][0]["baslik"].startswith("3071")

    async def test_bilgi_edinme_4982_getirilir(self):
        # Arrange
        state = _state(
            "bilgi_edinme",
            "belgeye erişim",
            "Bilgi edinme hakkı kapsamında belgeye erişim, on beş iş günü "
            "içinde cevap talebimdir.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
        assert any("4982" in b for b in basliklar)

    async def test_tebligat_7201_getirilir(self):
        # Arrange
        state = _state(
            "tebligat",
            "elektronik tebligat",
            "Elektronik tebligat muhatabın adresine ulaştığı tarihi izleyen "
            "beşinci günün sonunda yapılmış sayılır.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
        assert any("7201" in b for b in basliklar)

    async def test_top_k_uc_ile_sinirli(self):
        # Arrange
        state = _state(
            "dilekce",
            "dilekçe izin talebi",
            "Dilekçe konu talep ad soyad imza adres arz ederim gereği.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — en fazla 3 öneri (top-3)
        assert len(out["mevzuat_onerileri"]) <= 3

    async def test_madde_no_baslikta_gorunur(self):
        # Arrange
        state = _state(
            "dilekce",
            "Yıllık izin talebi dilekçesi",
            "Dilekçemde ad soyad imza adres ile arz ederim.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — madde başlıklı chunk "m.<no>" taşır
        basliklar = " ".join(o["baslik"] for o in out["mevzuat_onerileri"])
        assert "m." in basliklar


# ---------------------------------------------------------------------------
# Config fallback — kısa/boş sorgu korpusu atlar, statik eşleme döner
# ---------------------------------------------------------------------------


class TestMevzuatOnerConfigFallback:
    async def test_kisa_sorgu_config_fallback(self):
        # Arrange — tür/konu/domain-terim YOK + gövde boş → _retrieval_query "" döner →
        # retrieval ATLANIR (len<_MIN_QUERY_LEN=8 eşik-kapısı), statik config'e düşer.
        # Korpus boyutundan BAĞIMSIZ deterministik tetik (korpus 10→31 büyüyünce "belirsiz"
        # ×boost artık corpus-hit alıyordu; gerçek eşik-kapısı korpustan etkilenmez).
        state = {"evrak_turu": "", "bilgi_unsurlari": {}, "evrak_text": ""}
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — config kaynaklı (uydurma değil) varsayılan başlık döner
        assert out["mevzuat_onerileri"]
        assert out["mevzuat_onerileri"][0]["score"] in (0.3, 0.5)

    async def test_cimer_config_5690_eslemesi(self):
        # Arrange + Act — CİMER statik eşlemesi (5690) config yolundan ulaşılabilir.
        oneriler = _from_config("cimer")
        # Assert
        basliklar = [o["baslik"] for o in oneriler]
        assert any("5690" in b for b in basliklar)

    async def test_config_bilinmeyen_tur_varsayilan_doner(self):
        # Arrange
        # Act
        oneriler = _from_config("bilinmeyen_tur_xyz")
        # Assert — boş değil; varsayılan 2646 yönetmelik başlığı döner
        assert oneriler
        assert "2646" in oneriler[0]["baslik"]

    async def test_config_bilinen_tur_eslemeyi_doner(self):
        # Arrange + Act
        oneriler = _from_config("dilekce")
        # Assert — config'teki 3071 başlığı
        assert oneriler == [
            {"baslik": b, "score": 0.5} for b in EVRAK_TO_MEVZUAT["dilekce"]
        ]


# ---------------------------------------------------------------------------
# Başlık üretimi — madde_no varsa m.<no>, yoksa [DOĞRULA:]
# ---------------------------------------------------------------------------


class TestMevzuatOnerBaslik:
    def test_madde_no_var_m_formati(self):
        # Arrange + Act
        baslik = _baslik({"mevzuat": "3071 dilekce hakki kanunu", "madde_no": 4})
        # Assert
        assert baslik == "3071 dilekce hakki kanunu m.4"

    def test_madde_no_yok_dogrula_isareti(self):
        # Arrange + Act
        baslik = _baslik({"mevzuat": "7201 tebligat kanunu", "madde_no": None})
        # Assert — CLAUDE.md §1: madde no uydurulmaz, işaretlenir
        assert "[DOĞRULA: madde no]" in baslik


# ---------------------------------------------------------------------------
# İndeks + sorgu kurulumu
# ---------------------------------------------------------------------------


class TestMevzuatOnerIndeks:
    def test_indeks_dolu(self):
        # Arrange + Act
        _load_index.cache_clear()
        chunks = _load_index()
        # Assert — korpus seed edildi, chunk'lar var
        assert len(chunks) > 0
        assert any(c.get("madde_no") for c in chunks)

    def test_retrieval_query_turu_turkce_etikete_cevirir(self):
        # Arrange
        state = _state("dilekce", "izin", "metin")
        # Act
        query = _retrieval_query(state)
        # Assert — tür anahtarı (dilekce) Türkçe etikete (Dilekçe) genişler
        assert "Dilekçe" in query


# ---------------------------------------------------------------------------
# Ranking iyileştirmeleri — tür-boost, korpus genişleme, gürültü filtreleme
# ---------------------------------------------------------------------------


class TestMevzuatOnerRankingIyilestirme:
    async def test_cimer_5690_korpustan_getirilir(self):
        # Arrange — CİMER korpusu eklendi (5690); tür-boost ile öne alınmalı.
        state = _state(
            "cimer",
            "CİMER şikâyet başvurusu",
            "Cumhurbaşkanlığı İletişim Merkezi üzerinden yaptığım şikâyet "
            "başvurusunun otuz gün içinde sonuçlandırılmasını talep ediyorum.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — 5690 CİMER kararnamesi top-1 (baseline'da hiç gelmiyordu → 0%)
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
        assert basliklar and basliklar[0].startswith("5690")

    async def test_onsoz_chunk_dogrula_isareti_top1_olmaz(self):
        # Arrange — önsöz/künye chunk'ı (madde_no yok) artık ELENİR; top-1 gerçek
        # madde olmalı, "[DOĞRULA: madde no]" künye gürültüsü baş sıraya gelmemeli.
        state = _state(
            "dilekce",
            "dilekçe hakkı başvurusu",
            "Türk vatandaşları yetkili makamlara dilekçe ile başvurma hakkına "
            "sahiptir; adı soyadı imzası ve adresi zorunludur.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — top-1 madde no taşır ([DOĞRULA:] künye değil)
        assert "[DOĞRULA:" not in out["mevzuat_onerileri"][0]["baslik"]

    async def test_oneriler_dedup_ayni_madde_tekrar_etmez(self):
        # Arrange
        state = _state(
            "tebligat",
            "elektronik tebligat",
            "Elektronik tebligat muhatabın adresine ulaştığı tarihi izleyen "
            "beşinci günün sonunda yapılmış sayılır.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — aynı başlık iki kez listede olmaz
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
        assert len(basliklar) == len(set(basliklar))

    def test_tokenize_stopword_ve_boilerplate_eler(self):
        # Arrange + Act — "arz ederim" boilerplate + "ve" stopword elenir
        tokenlar = _tokenize("Gereğini arz ederim ve bilgilerinize sunarım")
        # Assert
        assert "arz" not in tokenlar
        assert "ederim" not in tokenlar
        assert "ve" not in tokenlar
        assert "sunarım" in tokenlar  # domain terimi korunur

    def test_tokenize_madde_atifi_normalize_eder(self):
        # Arrange + Act — "m.4" ve "madde 4" aynı tokene indirgenir (hizalama)
        t1 = _tokenize("3071 m.4 zorunlu unsurlar")
        t2 = _tokenize("3071 madde 4 zorunlu unsurlar")
        # Assert
        assert "madde4" in t1
        assert "madde4" in t2


# ---------------------------------------------------------------------------
# Cross-encoder rerank bağlama (opt-in + graceful) — gerçek model GEREKMEDEN
# wiring doğruluğu mock reranker ile kanıtlanır.
# ---------------------------------------------------------------------------


class _FakeReranker:
    """Aday sırasını TERSİNE çevirip RerankResult döndürür (deterministik test)."""

    def rerank(self, query, candidates, top_k=5):
        from retrieval.reranker import RerankResult

        out = []
        for i, c in enumerate(list(reversed(candidates))[:top_k]):
            out.append(RerankResult(
                chunk_id="", score=0.9 - i * 0.1, text=c["text"],
                source="", source_url="", domain="",
                metadata={"mevzuat": c["mevzuat"], "madde_no": c["madde_no"], "score": c["score"]},
                original_score=float(c["score"]),
            ))
        return out


class TestMevzuatOnerRerank:
    _DEDUP: ClassVar[list] = [
        (12.0, {"mevzuat": "3071 dilekce hakki kanunu", "madde_no": 4, "text": "dilekçe unsurları"}),
        (8.0, {"mevzuat": "4982 bilgi edinme kanunu", "madde_no": 11, "text": "bilgi edinme süresi"}),
    ]

    def test_rerank_kapali_none_doner(self, monkeypatch):
        # Arrange — RERANK_ENABLED=False → baseline BM25 (None ile sinyalle)
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_ENABLED", False)
        # Act + Assert
        assert _maybe_rerank("dilekçe", self._DEDUP) is None

    def test_rerank_model_yok_graceful_none(self, monkeypatch):
        # Arrange — açık ama get_reranker patlar (lib/model yok) → graceful None
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_ENABLED", True)

        def _boom():
            raise ImportError("sentence-transformers kurulu değil")

        monkeypatch.setattr("retrieval.reranker.get_reranker", _boom)
        # Act + Assert — patlamaz, BM25'e düşmek için None döner
        assert _maybe_rerank("dilekçe", self._DEDUP) is None

    def test_rerank_aktif_yeniden_siralar(self, monkeypatch):
        # Arrange — fake reranker adayları tersine çevirir → 4982 öne geçer
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_ENABLED", True)
        monkeypatch.setattr("retrieval.reranker.get_reranker", _FakeReranker)
        # Act
        out = _maybe_rerank("dilekçe", self._DEDUP)
        # Assert — rerank sonucu; cross-encoder skoru + BM25 raw taşınır
        assert out is not None and len(out) == 2
        assert out[0]["baslik"].startswith("4982")  # ters sıra → 4982 top-1
        assert out[0]["rerank"] is True
        assert out[0]["score"] == 0.9            # cross-encoder alaka
        assert out[0]["raw_score"] == 8.0        # taşınan BM25 ham skoru

    def test_rerank_bos_aday_none(self, monkeypatch):
        # Arrange — boş dedup → None (rerank denemez)
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_ENABLED", True)
        # Act + Assert
        assert _maybe_rerank("dilekçe", []) is None
