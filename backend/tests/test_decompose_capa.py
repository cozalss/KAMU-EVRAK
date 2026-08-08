"""decompose kaynak çapası — LLM'in ürettiği segment metni kaynakta GEÇMELİ.

NEDEN GEREKLİ (2026-08-07 gecikme denetimi sırasında bulundu):
`_llm_talep` `tur` ve `birim` alanlarını kapalı-küme ile doğruluyor, ama serbest-metin
`metin` alanı yalnız uzunluk kontrolünden geçiyordu. O metin zararsız bir "özet" değil:
çok-konulu evrakta her segmentin metni yazi_render'da ayrı bir RESMÎ YAZI'nın Konu satırına
ve gövde tohumuna geçiyor — üstelik 2..N alt-taslakları verify'ın uydurma vetosunu görmüyor.
Yani uydurulmuş bir segment doğrudan resmî çıktıya sızabiliyordu.

Çapa bunu EK LLM ÇAĞRISI OLMADAN kapatır: kaynakta karşılığı olmayan segment düşer;
2'nin altına inilirse tüm LLM segmenti reddedilir ve deterministik heuristik yol çalışır
(fallback sözleşmesi korunur).
"""
from __future__ import annotations

import pytest

from agents import config
from agents.nodes import decompose as D

KAYNAK = (
    "Mahallemizdeki park aydınlatmaları uzun süredir arızalı, onarılmasını talep ederim. "
    "Ayrıca kaldırım işgali nedeniyle yaya geçişi engelleniyor, denetim yapılmasını "
    "istiyorum. Yapılan işlem hakkında tarafıma bilgi verilmesini rica ederim."
)


class TestCapaOrani:
    """Saf ölçüm — Türkçe eklemeli olduğu için kök eşleşmesi aranır."""

    def _norm(self, metin: str) -> str:
        return " ".join(D._KELIME.findall(D.tr_lower(metin)))

    def test_kaynaktan_alinan_segment_tam_capali(self):
        oran = D._capa_orani("park aydınlatmaları arızalı onarılmasını", self._norm(KAYNAK))
        assert oran == 1.0

    def test_turkce_ek_farki_capayi_bozmaz(self):
        # Kaynakta "onarılmasını" geçiyor; segment "onarım" yazsa da kök tutar.
        oran = D._capa_orani("kaldırım işgali denetim", self._norm(KAYNAK))
        assert oran == 1.0

    def test_uydurulmus_segment_capasiz(self):
        oran = D._capa_orani(
            "belediye başkanlığına ruhsat harcı iadesi ödenmesi", self._norm(KAYNAK))
        assert oran < 0.5, f"uydurma segment çapalı sayıldı (oran={oran})"

    def test_bos_segment_sifir(self):
        assert D._capa_orani("", self._norm(KAYNAK)) == 0.0
        assert D._capa_orani("ve ile bir", self._norm(KAYNAK)) == 0.0


class TestLlmSegmentCapasi:
    """Uçtan uca: LLM cevabı taklit edilir, guard'ın gerçekten devrede olduğu gösterilir."""

    @pytest.fixture(autouse=True)
    def _esik_acik(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(D, "DECOMPOSE_CAPA_ESIGI", 0.7)
        monkeypatch.setattr(D, "DECOMPOSE_KESIKTE_DUSUNMESIZ", True)

    def _llm_dondur(self, monkeypatch: pytest.MonkeyPatch, talepler: list) -> None:
        async def _sahte(*args, **kwargs):
            return {"talepler": talepler}
        monkeypatch.setattr(D, "llm_json", _sahte)

    @pytest.mark.asyncio
    async def test_capali_segmentler_gecer(self, monkeypatch: pytest.MonkeyPatch):
        self._llm_dondur(monkeypatch, [
            {"metin": "park aydınlatmaları arızalı onarılmasını talep ederim",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
            {"metin": "kaldırım işgali nedeniyle denetim yapılmasını istiyorum",
             "tur": "sikayet", "birim": "ilgili_teknik_daire"},
        ])

        sonuc = await D._llm_segment(KAYNAK)

        assert sonuc is not None
        assert len(sonuc) == 2

    @pytest.mark.asyncio
    async def test_uydurulmus_segment_DUSER(self, monkeypatch: pytest.MonkeyPatch):
        """Bir segment uydurma → o segment atılır, kalan ikisi geçer."""
        self._llm_dondur(monkeypatch, [
            {"metin": "park aydınlatmaları arızalı onarılmasını talep ederim",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
            {"metin": "kaldırım işgali nedeniyle denetim yapılmasını istiyorum",
             "tur": "sikayet", "birim": "ilgili_teknik_daire"},
            {"metin": "emlak vergisi borcunun taksitlendirilmesi ve gecikme faizi silinmesi",
             "tur": "talep", "birim": "mali_strateji_sgb"},
        ])

        sonuc = await D._llm_segment(KAYNAK)

        assert sonuc is not None
        assert len(sonuc) == 2, "kaynakta geçmeyen segment resmî yazıya sızdı"
        assert all("emlak" not in s["metin"] for s in sonuc)

    @pytest.mark.asyncio
    async def test_ikiden_aza_dusen_LLM_ciktisi_tumden_reddedilir(
        self, monkeypatch: pytest.MonkeyPatch,
    ):
        """Tek segment 'ayrıştırma' değildir → None dön, heuristik yol çalışsın."""
        self._llm_dondur(monkeypatch, [
            {"metin": "park aydınlatmaları arızalı onarılmasını talep ederim",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
            {"metin": "ruhsat harcı iadesi ve imar planı değişikliği başvurusu",
             "tur": "talep", "birim": "mali_strateji_sgb"},
        ])

        sonuc = await D._llm_segment(KAYNAK)

        assert sonuc is None, "tek çapalı segment kaldı, yine de LLM çıktısı kabul edildi"

    @pytest.mark.asyncio
    async def test_esik_sifirken_guard_kapali(self, monkeypatch: pytest.MonkeyPatch):
        """Geri alma yolu gerçekten geri alıyor mu (bayrak sözleşmesi)."""
        monkeypatch.setattr(D, "DECOMPOSE_CAPA_ESIGI", 0.0)
        self._llm_dondur(monkeypatch, [
            {"metin": "park aydınlatmaları arızalı onarılmasını talep ederim",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
            {"metin": "emlak vergisi borcunun taksitlendirilmesi gecikme faizi silinmesi",
             "tur": "talep", "birim": "mali_strateji_sgb"},
        ])

        sonuc = await D._llm_segment(KAYNAK)

        assert sonuc is not None and len(sonuc) == 2, "DECOMPOSE_CAPA_ESIGI=0 guard'ı kapatmalı"


class TestKesikKurtarmaBaglantisi:
    """decompose kesik-kurtarmaya bağlı, route_ajan BAĞLI DEĞİL — taksonomi kilidi."""

    def test_decompose_kesikte_dusunmesiz_gecer(self):
        kaynak = (config.__file__, D.__file__)
        assert all(kaynak)
        import inspect
        govde = inspect.getsource(D._llm_segment)
        assert "kesikte_dusunmesiz=DECOMPOSE_KESIKTE_DUSUNMESIZ" in govde

    def test_route_ajan_kesik_kurtarmaya_BAGLANMAZ(self):
        """YARGI işi: düşünme kapatmak yanlış birime resmî görünümlü havale riskidir."""
        import inspect

        from agents.nodes import route_ajan

        govde = inspect.getsource(route_ajan)
        assert "kesikte_dusunmesiz" not in govde, (
            "route_ajan kesik-kurtarmaya bağlanmış — yetki kararı YARGI işidir, "
            "düşünmesiz çalıştırılamaz (bkz. config LLM_DUSUNME_CIKARIMDA_KAPALI taksonomisi)"
        )
