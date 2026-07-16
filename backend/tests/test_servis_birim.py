"""servis_birim — içerikten türetilen hizmet müdürlüğü önerisi (ADDITIVE) testleri.

Deterministik/saf: eşleşme yoksa None (uydurma yok). route_birim'e eklenen alanın
ölçülen hedef_birim'i DEĞİŞTİRMEDİĞİ de doğrulanır. AAA deseni.
"""

from __future__ import annotations

import pytest

import agents.servis_birim as sb
from agents.servis_birim import (
    SERVIS_BIRIM_TR,
    TAM_BIRIM_KATALOG,
    oner_servis_birimi,
    oner_servis_birimi_llm,
)


def _sahte_llm(payload):
    """llm_json imzasında sabit payload döndüren sahte async LLM."""
    async def _fake(system, user, **kwargs):
        return payload
    return _fake


class TestOnerServisBirimi:
    @pytest.mark.parametrize(("metin", "beklenen_kod"), [
        ("Sokağımızdaki çukurun onarılması ve asfalt dökülmesi", "fen_isleri"),
        ("Komşu parseldeki ruhsatsız yapı / kaçak yapı hakkında", "imar_sehircilik"),
        ("Gece geç saatte gürültü ve kaldırım işgali şikâyeti", "zabita"),
        ("Fazla tahakkuk eden su faturası ve sayaç itirazı", "su_kanalizasyon"),
        ("Mahalledeki çöp ve atık toplama düzensizliği", "temizlik_cevre"),
        ("İşyeri açma ve çalışma ruhsatı başvurusu", "ruhsat_denetim"),
        ("Toplu taşıma otobüs sefer sıklığının artırılması", "ulasim"),
        ("Parktaki oyun grubu ve yeşil alan bakımı", "park_bahce"),
    ])
    def test_icerik_dogru_mudurluge_esler(self, metin, beklenen_kod):
        # Act
        sonuc = oner_servis_birimi(metin)
        # Assert
        assert sonuc is not None
        assert sonuc["kod"] == beklenen_kod
        assert sonuc["ad"]  # insan-okunur ad dolu
        assert isinstance(sonuc["sinyal"], list) and sonuc["sinyal"]  # tetikleyen anahtarlar

    def test_eslesme_yoksa_none_uydurma_yok(self):
        # Arrange — saf hukuk/dava metni; hiçbir hizmet-müdürlüğü anahtarı yok
        metin = "Mahkeme ara kararı gereği savunma ve işlem dosyasının gönderilmesi rica olunur."
        # Act + Assert
        assert oner_servis_birimi(metin) is None

    def test_bos_metin_none(self):
        assert oner_servis_birimi("") is None
        assert oner_servis_birimi(None) is None  # type: ignore[arg-type]

    def test_sinyal_en_fazla_uc(self):
        # Arrange — çok sayıda fen-işleri anahtarı içeren metin
        metin = "çukur asfalt yol onarımı kaldırım bordür altyapı kazı"
        # Act
        sonuc = oner_servis_birimi(metin)
        # Assert — sinyal listesi kısa tutulur (UI ipucu)
        assert sonuc is not None and len(sonuc["sinyal"]) <= 3


class TestTamBirimKatalog:
    """LLM'in seçebileceği kombine katalog: kurum daireleri + hizmet müdürlükleri."""

    def test_katalog_kurum_ve_mudurluk_birlesimi(self):
        # kurum-düzeyi daire (BIRIM_TR) + somut müdürlük (SERVIS_BIRIM_TR) birlikte
        from agents.config import BIRIM_TR
        assert "hukuk_musavirligi" in TAM_BIRIM_KATALOG  # kurum dairesi
        assert "zabita" in TAM_BIRIM_KATALOG  # hizmet müdürlüğü
        # her müdürlük + her kurum dairesi kataloğa dahil
        for kod in SERVIS_BIRIM_TR:
            assert kod in TAM_BIRIM_KATALOG
        for kod in BIRIM_TR:
            assert kod in TAM_BIRIM_KATALOG
        # TAM boyut = 9 + 11 (çakışma YOK) — gelecekte bir anahtar çakışması sessizce
        # birim düşürürse bu assertion kırılır (zayıf ">=" bunu kaçırırdı).
        assert len(TAM_BIRIM_KATALOG) == len(BIRIM_TR) + len(SERVIS_BIRIM_TR)


class TestOnerServisBirimiLlm:
    """LLM-birincil birim seçimi (kapalı-küme, gerçek-anahtar varken)."""

    async def test_llm_kurum_dairesi_secebilir(self, monkeypatch):
        # Arrange — gerçek LLM varmış gibi + kurum dairesi (hukuk) seçiyor
        monkeypatch.setattr(sb, "real_llm", lambda: object())
        monkeypatch.setattr(sb, "llm_json",
                            _sahte_llm({"kod": "hukuk_musavirligi", "sinyal": ["dava", "haciz"]}))
        # Act
        out = await oner_servis_birimi_llm("Mahkeme kararı ve icra takibi hakkında.")
        # Assert — kurum dairesi de dönebilir (katalog genişledi)
        assert out is not None
        assert out["kod"] == "hukuk_musavirligi"
        assert out["ad"] == TAM_BIRIM_KATALOG["hukuk_musavirligi"]
        assert out["sinyal"] == ["dava", "haciz"]

    async def test_llm_hizmet_mudurlugu_secebilir(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(sb, "real_llm", lambda: object())
        monkeypatch.setattr(sb, "llm_json",
                            _sahte_llm({"kod": "zabita", "sinyal": ["gürültü"]}))
        # Act
        out = await oner_servis_birimi_llm("Gece geç saatte gürültü şikâyeti.")
        # Assert
        assert out is not None and out["kod"] == "zabita"

    async def test_havuz_disi_kod_reddedilir(self, monkeypatch):
        # Arrange — LLM uydurma/havuz-dışı kod dönerse elenir (deterministik fallback'e düşer)
        monkeypatch.setattr(sb, "real_llm", lambda: object())
        monkeypatch.setattr(sb, "llm_json",
                            _sahte_llm({"kod": "uydurma_birim_xyz", "sinyal": ["x"]}))
        # Act + Assert
        assert await oner_servis_birimi_llm("herhangi bir metin") is None

    async def test_bos_kod_none(self, monkeypatch):
        monkeypatch.setattr(sb, "real_llm", lambda: object())
        monkeypatch.setattr(sb, "llm_json", _sahte_llm({"kod": "", "sinyal": []}))
        assert await oner_servis_birimi_llm("hiçbirine uymuyor") is None

    async def test_mock_modda_none_deterministige_birakir(self, monkeypatch):
        # Arrange — real_llm None (mock/anahtarsız) → LLM yolu hiç açılmaz
        monkeypatch.setattr(sb, "real_llm", lambda: None)
        # Act + Assert — None → route_birim keyword fallback'e düşer (CI deterministik)
        assert await oner_servis_birimi_llm("Sokaktaki çukurun onarımı.") is None


class TestRouteBirimAdditive:
    # NOT (hız dalgası 15a): PARALEL_TRIYAJ açıkken servis önerisi route_birim'de DEĞİL
    # ayrı paralel node'dadır (nodes/servis_birim_oneri.py; graf kilidi test_paralel_hiz).
    # Bu sınıf BASELINE (bayrak kapalı) sözleşmesini sabitler → bayrak testte kapatılır.

    async def test_route_birim_servis_ekler_hedefi_degistirmez(self, monkeypatch):
        # Arrange — belediyeye çukur onarımı dilekçesi (bilinen tür → deterministik hedef)
        import agents.nodes.route_birim as route_mod
        from agents.config import EVRAK_TO_BIRIM
        monkeypatch.setattr(route_mod, "PARALEL_TRIYAJ", False)
        state = {"evrak_turu": "dilekce", "evrak_text": "Sokaktaki çukurun asfaltla onarılması talebi."}
        # Act
        out = await route_mod.route_birim_node(state)
        # Assert — ölçülen hedef config ile AYNI (additive katman bozmadı) + servis eklendi
        assert out["hedef_birim"] == EVRAK_TO_BIRIM["dilekce"]
        assert out["servis_birimi"]["kod"] == "fen_isleri"

    async def test_route_birim_triyaj_acikken_servis_ayri_nodda(self):
        # Arrange — bayrak açık (varsayılan): route servis EKLEMEZ, ayrı node üretir
        from agents.nodes.route_birim import route_birim_node
        from agents.nodes.servis_birim_oneri import servis_birim_oneri_node
        state = {"evrak_turu": "dilekce", "evrak_text": "Sokaktaki çukurun asfaltla onarılması talebi."}
        # Act
        route_out = await route_birim_node(state)
        servis_out = await servis_birim_oneri_node(state)
        # Assert — aynı sonuç, farklı üretici (paralel dal); hedef değişmedi
        assert "servis_birimi" not in route_out
        assert servis_out["servis_birimi"]["kod"] == "fen_isleri"

    async def test_route_birim_eslesme_yoksa_servis_alani_yok(self, monkeypatch):
        # Arrange — saf kurum→kurum yazı (hizmet-müdürlüğü sinyali yok); baseline yol
        import agents.nodes.route_birim as route_mod
        monkeypatch.setattr(route_mod, "PARALEL_TRIYAJ", False)
        state = {"evrak_turu": "ust_yazi", "evrak_text": "Adres kayıt sistemi güncelleme çalışmaları hakkında."}
        # Act
        out = await route_mod.route_birim_node(state)
        # Assert — servis_birimi hiç eklenmez (uydurma yok)
        assert "servis_birimi" not in out
        assert out["hedef_birim"]  # ölçülen hedef yine üretilir
