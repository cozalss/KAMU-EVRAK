"""mevzuat_oner node testleri — BM25 korpus retrieval + config fallback.

LLM_MODE=mock (conftest) — node LLM'siz; korpus indeksinden BM25 ile madde-chunk
getirir. Korpus data/mevzuat/*.txt + seed indeksinden gelir (repo'da mevcut).

AAA deseni; gerçek korpus üzerinde davranış doğrulanır (mock yok — pipeline gerçek).
"""

from __future__ import annotations

from typing import ClassVar

from agents.config import EVRAK_TO_MEVZUAT, EVRAK_TO_YAZI
from agents.nodes.mevzuat_oner import (
    _baslik,
    _dedup,
    _domain_terimleri,
    _from_config,
    _load_index,
    _maybe_rerank,
    _retrieval_query,
    _snippet,
    _tokenize,
    mevzuat_oner_node,
)


def _state(turu: str, konu: str, evrak_text: str) -> dict:
    return {
        "evrak_turu": turu,
        "bilgi_unsurlari": {"konu": konu},
        "evrak_text": evrak_text,
    }


# Korpus retrieval'ı tetikleyecek kadar somut metin (çok kısa metinde config fallback'e düşer).
_UZUN_DILEKCE = (
    "İşbu dilekçemle, tarafıma ait imar durumu belgesinin düzenlenmesini talep ediyorum. "
    "Dilekçemin 3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun kapsamında "
    "değerlendirilmesini ve sonucundan yazılı olarak bilgilendirilmemi arz ederim."
)


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
# Domain sorgu-genişletme hijyeni — config başlıkları sorguya OLDUĞU GİBİ girince
# "m.4" → "madde4" tokeni HER kanunun 4. maddesiyle eşleşiyor (5176 etik kurulu m.4,
# dilekçe-ailesi sorgularında öne geçti; eval'de talep→657/4734 tamamen kaçtı) ve
# muzekkere/gorus_mutalaa'nın "[DOĞRULA: ...]" meta-notu sorguya sızıyordu.
# ---------------------------------------------------------------------------


class TestDomainTerimHijyeni:
    def test_madde_referansi_domain_teriminden_elenir(self):
        # Arrange + Act — dilekce başlığı "m.4 (zorunlu unsurlar)" taşır
        terimler = _domain_terimleri("dilekce")
        # Assert — kanun adı kalır, madde-atıfı sorguya girmez
        assert "Dilekçe" in terimler
        assert "madde4" not in _tokenize(terimler)

    def test_dogrula_notu_domain_terimine_girmez(self):
        # Arrange + Act — muzekkere girdisi başlık değil "[DOĞRULA: ...]" meta-notudur
        terimler = _domain_terimleri("muzekkere")
        # Assert
        assert "DOĞRULA" not in terimler

    def test_retrieval_query_madde_token_uretmez(self):
        # Arrange — konu/gövde boş → sorgu yalnız tür+domain teriminden kurulur
        state = _state("dilekce", "", "")
        # Act
        query = _retrieval_query(state)
        # Assert — config'ten sızan "madde4" tokeni yok (evrak metnindeki atıflar serbest)
        assert "madde4" not in _tokenize(query)

    def test_kanun_numarasi_domain_teriminden_elenir(self):
        # Kanun no kanunun KENDİ maddelerinde geçmez; yalnız onu adıyla anan çapraz-atıf
        # chunk'larıyla eşleşir (5690 CİMER m.1 "...Kanun (3071)" alıntısı dilekçe
        # sorgusunda 3071'i geçti). Numara sorguya girmez — yönlendirme boost'un işi.
        terimler = _domain_terimleri("dilekce")
        assert "3071" not in terimler

    def test_tebligat_domain_terimi_ve_boost_kapsami(self):
        # Arrange + Act — tebligat eşlemesi eklendi (eksikti → boost/genişletme almıyordu)
        from agents.nodes.mevzuat_oner import _beklenen_kanun_nolari

        terimler = _domain_terimleri("tebligat")
        # Assert — domain kelimesi sorguda, kanun no boost kümesinde
        assert "Tebligat" in terimler
        assert "7201" in _beklenen_kanun_nolari("tebligat")


class TestEvrakToMevzuatKapsami:
    def test_tum_uretilen_turler_mevzuat_eslemesi_tasir(self):
        """Kapalı-döngü kör noktası korumalı: EVRAK_TO_YAZI'daki her tür (belirsiz hariç)
        EVRAK_TO_MEVZUAT'ta anahtar taşımalı — anahtarı olmayan tür retrieval boost'undan
        ve domain genişletmeden SESSİZCE düşer (tebligat regresyonu, eval'de 7/10 kaçış)."""
        eksik = set(EVRAK_TO_YAZI) - {"belirsiz"} - set(EVRAK_TO_MEVZUAT)
        assert not eksik, f"EVRAK_TO_MEVZUAT eksik tür: {sorted(eksik)}"


class TestIcerikSinyaliBoostaEzilmez:
    async def test_talep_yillik_izin_657_top3(self):
        # Arrange — eval mg_personel_izin_01 regresyonu: talep türünün 3071 domain
        # gürültüsü ("madde4" ×3) içerik sinyalini (657 yıllık izin) tamamen eziyordu.
        state = _state(
            "talep",
            "yıllık izin talebi",
            "Devlet memuru olarak hizmet süresi on yıldan fazla olduğum için "
            "yıllık izin talebimde bulunuyorum. İzin sürelerinin hizmet yılına "
            "göre hesaplanmasını arz ederim.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert — 657 (Devlet Memurları Kanunu) top-3'te görünür
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
        assert any("657" in b for b in basliklar), basliklar

    async def test_tebligat_7201_top1(self):
        # Arrange — tebligat eşlemesi + boost sonrası 7201 baş sıraya gelmeli
        # (eval'de kabahatler/DSİ gürültüsünün altında kalıyordu).
        state = _state(
            "tebligat",
            "vergi ihbarnamesi tebliği",
            "Aşağıda belirtilen muhataba vergi ihbarnamesinin tebliğ edilmesi, "
            "tebliğ tarihinin bildirilmesi hususunda gereğini arz ederim.",
        )
        # Act
        out = await mevzuat_oner_node(state)
        # Assert
        basliklar = [o["baslik"] for o in out["mevzuat_onerileri"]]
        assert basliklar and "7201" in basliklar[0], basliklar


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
        # (provider varsayılanı 'deepseek' → cross-encoder yolu açıkça seçilir)
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_ENABLED", True)
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_PROVIDER", "cross-encoder")

        def _boom():
            raise ImportError("sentence-transformers kurulu değil")

        monkeypatch.setattr("retrieval.reranker.get_reranker", _boom)
        # Act + Assert — patlamaz, BM25'e düşmek için None döner
        assert _maybe_rerank("dilekçe", self._DEDUP) is None

    def test_rerank_aktif_yeniden_siralar(self, monkeypatch):
        # Arrange — fake reranker adayları tersine çevirir → 4982 öne geçer
        # (provider varsayılanı 'deepseek' → cross-encoder yolu açıkça seçilir)
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_ENABLED", True)
        monkeypatch.setattr("agents.nodes.mevzuat_oner.RERANK_PROVIDER", "cross-encoder")
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


# ---------------------------------------------------------------------------
# Şeffaflık alanları — norm_score (güven bandının kaynağı) + kaynak doğrulama bağı
# ---------------------------------------------------------------------------


class TestSeffaflikAlanlari:
    """`score` GÖRELİ (top daima 1.0); mutlak sinyal `norm_score`, kaynak bağı kaynak_dosya."""

    async def test_top1_score_daima_1_0_bu_yuzden_mutlak_degil(self):
        # Bu test, `score`u mutlak alaka sanan her tüketiciye karşı bir sözleşmedir.
        out = await mevzuat_oner_node(_state("dilekce", "izin talebi", _UZUN_DILEKCE))
        oneriler = out["mevzuat_onerileri"]
        assert oneriler[0]["score"] == 1.0

    async def test_norm_score_uretilir_ve_pozitif(self):
        out = await mevzuat_oner_node(_state("dilekce", "izin talebi", _UZUN_DILEKCE))
        for oneri in out["mevzuat_onerileri"]:
            assert oneri["norm_score"] > 0
            # norm = raw / sorgu_token → ham skordan KÜÇÜK (payda >1 token)
            assert oneri["norm_score"] < oneri["raw_score"]

    async def test_kaynak_dosya_ve_madde_no_dolu(self):
        out = await mevzuat_oner_node(_state("dilekce", "izin talebi", _UZUN_DILEKCE))
        ilk = out["mevzuat_onerileri"][0]
        assert ilk["kaynak_dosya"] and " " not in ilk["kaynak_dosya"]
        assert not ilk["kaynak_dosya"].endswith(".txt")   # katalog anahtarı (uzantısız)

    async def test_config_fallback_norm_score_tasimaz(self):
        """Statik eşleme retrieval değildir → mutlak bant iddia edilemez."""
        for oneri in _from_config("dilekce"):
            assert "norm_score" not in oneri


# ---------------------------------------------------------------------------
# Snippet — kelime ortasından kesme yok (memur yarım maddeyi doğrulayamaz)
# ---------------------------------------------------------------------------


class TestSnippetSiniri:
    def test_kisa_metin_oldugu_gibi(self):
        assert _snippet("Madde 1 — Kısa hüküm.") == "Madde 1 — Kısa hüküm."

    def test_cumle_sinirinda_kesilir(self):
        metin = ("Madde 60 — Ödeme emri ve içeriği. " + "Takip talebi şartları taşır. " * 8
                 + "Son cümle buraya düşmez.")
        out = _snippet(metin)
        assert out.endswith(" …")
        assert out.rstrip(" …").endswith(".")     # cümle sonunda kesildi

    def test_kelime_ortasindan_kesmez(self):
        # Cümle sonu hiç yok → kelime sınırına düşer; yarım kelime bırakmaz.
        metin = "kambiyo senedi vadesi " * 40
        out = _snippet(metin)
        assert out.endswith(" …")
        govde = out[:-2].rstrip()
        assert not govde.endswith("kam") and govde.split()[-1] in {"kambiyo", "senedi", "vadesi"}

    def test_ust_sinir_asilmaz(self):
        out = _snippet("a" * 500)
        assert len(out) <= 282 + 2   # _SNIPPET_CHARS + " …"


# ---------------------------------------------------------------------------
# Ek/Geçici madde kimliği — "Ek Madde 1" ile "Madde 1" AYNI madde_no'yu taşır
# (13 kanunda çakışma). madde_tur olmadan dedup/başlık/link yanlış maddeyi hedefler.
# ---------------------------------------------------------------------------


class TestMaddeTurKimligi:
    def test_baslik_ek_madde_onekli(self):
        assert _baslik({"mevzuat": "2985 toplu konut kanunu", "madde_no": 1, "madde_tur": "ek"}) \
            == "2985 toplu konut kanunu ek m.1"

    def test_baslik_gecici_madde_onekli(self):
        assert _baslik({"mevzuat": "X kanunu", "madde_no": 2, "madde_tur": "gecici"}) \
            == "X kanunu geç. m.2"

    def test_baslik_normal_madde_oneksiz(self):
        assert _baslik({"mevzuat": "X kanunu", "madde_no": 1, "madde_tur": "madde"}) == "X kanunu m.1"
        # madde_tur hiç yoksa da normal madde gibi davranır (geriye uyum)
        assert _baslik({"mevzuat": "X kanunu", "madde_no": 1}) == "X kanunu m.1"

    def test_dedup_ek_ve_normal_ayni_no_ayrilir(self):
        """REGRESYON: (mevzuat, madde_no) anahtarı 'Madde 1' ile 'Ek Madde 1'i birbirine eziyordu."""
        normal = {"mevzuat": "2985 toplu konut kanunu", "madde_no": 1, "madde_tur": "madde"}
        ek = {"mevzuat": "2985 toplu konut kanunu", "madde_no": 1, "madde_tur": "ek"}
        out = _dedup([(9.0, normal), (7.0, ek)])
        assert len(out) == 2   # ikisi de KORUNUR — biri diğerini elemez

    def test_dedup_gercek_tekrari_hala_indirger(self):
        c = {"mevzuat": "X", "madde_no": 5, "madde_tur": "madde"}
        out = _dedup([(9.0, c), (3.0, dict(c))])
        assert len(out) == 1 and out[0][0] == 9.0   # en yüksek skor kalır
