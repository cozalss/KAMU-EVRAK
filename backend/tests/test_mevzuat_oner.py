"""mevzuat_oner node testleri — BM25 korpus retrieval + config fallback.

LLM_MODE=mock (conftest) — node LLM'siz; korpus indeksinden BM25 ile madde-chunk
getirir. Korpus data/mevzuat/*.txt + seed indeksinden gelir (repo'da mevcut).

AAA deseni; gerçek korpus üzerinde davranış doğrulanır (mock yok — pipeline gerçek).
"""

from __future__ import annotations

from agents.config import EVRAK_TO_MEVZUAT
from agents.nodes.mevzuat_oner import (
    _baslik,
    _from_config,
    _load_index,
    _retrieval_query,
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
        # Arrange
        state = _state(
            "dilekce",
            "Yıllık izin talebi dilekçesi",
            "Konu: Yıllık izin talebi. Dilekçemde ad soyad imza ve adres "
            "bilgilerimle gereğinin yapılmasını arz ederim.",
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
        # Arrange — çok kısa metin → retrieval atlanır, config'e düşer
        state = {"evrak_turu": "cimer", "bilgi_unsurlari": {}, "evrak_text": "x"}
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — CİMER statik eşlemesi (5690)
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
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
