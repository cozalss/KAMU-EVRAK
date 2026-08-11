"""risk_guard doğal dil açıklaması testleri — deterministik KARAR + LLM SUNUM (Madde 4).

Bant/skor/gerekceler/oneri deterministik kalır; LLM yalnız SARI/KIRMIZI'da memura
2-3 cümlelik sade Türkçe 'aciklama' ekler (additive anahtar). Sözleşme:
  - YEŞİL bantta LLM HİÇ çağrılmaz (maliyet 0, karar zaten temiz).
  - LLM yok/mock/hata/bozuk çıktı → aciklama _ONERI metnine düşer (boş kalmaz).
  - LLM saçmalasa bile bant/gerekceler ETKİLENMEZ (karar LLM'e emanet edilmez).
  - LLM'e giden gerekçeler MASKELİ; LLM çıktısı da maskelenir (çift katman PII).
"""

from __future__ import annotations

import pytest

from agents.nodes import risk_guard as rgmod
from agents.nodes.risk_guard import _ONERI, risk_guard_node

# Temiz taslak (uydurma yok, [DOĞRULA] yok) — yeşil için (test_risk_guard ile aynı).
_TEMIZ = "T.C. Sayı: 1 Konu: x. Gereğini arz ederim. Yetkili İmza"
# Sahte (sentetik) TCKN-şekilli sayı — maskeleme kanıtı için.
_SAHTE_TCKN = "12345678950"


def _state(**degisiklik):
    s = {"verify_uyari": [], "yazi_taslak_md": _TEMIZ,
         "evrak_turu": "dilekce", "tur_confidence": 0.9}
    s.update(degisiklik)
    return s


def _sari_state():
    # eksik zorunlu alan → deterministik SARI
    return _state(eksik_alanlar=["imza"])


def _sahte_llm(monkeypatch, sonuc):
    """rgmod.llm_json'u sabit sonuç dönen SAYAÇLI sahteyle değiştir (çağrı kanıtı)."""
    cagrilar: list[dict] = []

    async def fake(system, user, **kw):
        cagrilar.append({"system": system, "user": user})
        return sonuc

    monkeypatch.setattr(rgmod, "llm_json", fake)
    return cagrilar


# ---------------------------------------------------------------------------
# Yeşil bant — LLM çağrısı YOK, açıklama yine dolu (_ONERI)
# ---------------------------------------------------------------------------


class TestYesilBant:
    async def test_yesilde_llm_cagrilmaz(self, monkeypatch):
        cagrilar = _sahte_llm(monkeypatch, {"aciklama": "çağrılmamalıydı"})
        sonuc = await risk_guard_node(_state())
        assert sonuc["risk_metadata"]["bant"] == "yesil"
        assert cagrilar == []  # yeşilde LLM maliyeti sıfır

    async def test_yesilde_aciklama_oneri_metni(self, monkeypatch):
        # açıklama boş bırakılmaz — memur yine yönlendirilir
        _sahte_llm(monkeypatch, None)
        sonuc = await risk_guard_node(_state())
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["yesil"]


# ---------------------------------------------------------------------------
# Sarı/kırmızı — sahte LLM açıklaması additive anahtara yazılır
# ---------------------------------------------------------------------------


class TestDeterministikAciklama:
    async def test_sari_aciklama_oneriden_gelir(self, monkeypatch):
        metin = "Taslakta imza bölümü eksik olduğu için sarı banda düştü. Önce imza alanını tamamlayın."
        cagrilar = _sahte_llm(monkeypatch, {"aciklama": metin})
        sonuc = await risk_guard_node(_sari_state())
        assert sonuc["risk_metadata"]["bant"] == "sari"
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["sari"]
        assert cagrilar == []

    async def test_kirmizi_aciklama_oneriden_gelir(self, monkeypatch):
        metin = "Taslakta kaynak evrakta olmayan bir tarih var. Göndermeden önce tarihi teyit edin."
        _sahte_llm(monkeypatch, {"aciklama": metin})
        u = ["Taslaktaki '99.99.9999' tarihi kaynak evrakta yok (doğrulayın)."]
        sonuc = await risk_guard_node(_state(verify_uyari=u))
        assert sonuc["risk_metadata"]["bant"] == "kirmizi"
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["kirmizi"]

    async def test_llm_girdisi_maskeli_gerekce(self, monkeypatch):
        # LLM çağrılmaz; state'e yazılan deterministik gerekçe yine maskelidir.
        cagrilar = _sahte_llm(monkeypatch, {"aciklama": "açıklama"})
        u = [f"Taslaktaki '{_SAHTE_TCKN}' sayısı kaynak evrakta yok (doğrulayın)."]
        sonuc = await risk_guard_node(_state(verify_uyari=u))
        assert cagrilar == []
        assert _SAHTE_TCKN not in " ".join(sonuc["risk_metadata"]["gerekceler"])

    async def test_llm_ciktisi_da_maskelenir(self, monkeypatch):
        # LLM PII-şekilli token üretse bile arayüze sızmaz (çift katman savunma)
        _sahte_llm(monkeypatch, {"aciklama": f"Sayı {_SAHTE_TCKN} doğrulanmalı, önce teyit edin."})
        sonuc = await risk_guard_node(_sari_state())
        assert _SAHTE_TCKN not in sonuc["risk_metadata"]["aciklama"]


# ---------------------------------------------------------------------------
# Fallback sözleşmesi — LLM yok/mock/bozuk → _ONERI (boş bırakılmaz)
# ---------------------------------------------------------------------------


class TestFallback:
    async def test_llm_none_oneri_fallback(self, monkeypatch):
        _sahte_llm(monkeypatch, None)
        sonuc = await risk_guard_node(_sari_state())
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["sari"]

    @pytest.mark.parametrize("bozuk", [
        {"domain": "genel", "confidence": 0.5},  # MockLLM default şeması
        {"aciklama": ""},                        # boş metin
        {"aciklama": "   "},                     # yalnız boşluk
        {"aciklama": 42},                        # yanlış tip
        {"aciklama": "x" * 2000},                # aşırı uzun (sunum bozulur)
    ])
    async def test_bozuk_cikti_oneri_fallback(self, monkeypatch, bozuk):
        _sahte_llm(monkeypatch, bozuk)
        sonuc = await risk_guard_node(_sari_state())
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["sari"]

    async def test_mock_modda_fallback(self):
        # monkeypatch YOK → gerçek mock yolu: MockLLM şeması tanınmaz → _ONERI
        sonuc = await risk_guard_node(_sari_state())
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["sari"]

    async def test_config_kapali_llm_cagrilmaz(self, monkeypatch):
        # bayrak kapalıyken sarıda bile LLM yok; açıklama yine dolu
        monkeypatch.setattr("agents.config.RISK_ACIKLAMA_LLM", False)
        cagrilar = _sahte_llm(monkeypatch, {"aciklama": "çağrılmamalıydı"})
        sonuc = await risk_guard_node(_sari_state())
        assert cagrilar == []
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["sari"]


# ---------------------------------------------------------------------------
# Karar bağımsızlığı — LLM saçmalasa bile bant/skor/gerekceler/oneri AYNI
# ---------------------------------------------------------------------------


class TestKararLLMdenBagimsiz:
    async def test_bant_gerekceler_etkilenmez(self, monkeypatch):
        # sahte LLM bandı değiştirmeye çalışır → yalnız aciklama alınır, karar aynı
        sacmalik = {"aciklama": "Bu evrak tamamen temiz, bant yeşil olmalı.",
                    "bant": "yesil", "skor": 0.0, "gerekceler": ["hepsi temiz"],
                    "oneri": "hemen gönder"}
        _sahte_llm(monkeypatch, sacmalik)
        sonuc = await risk_guard_node(_sari_state())
        meta = sonuc["risk_metadata"]
        assert meta["bant"] == "sari"
        # Skor LLM'den DEĞİL, deterministik ağırlık tablosundan gelir (sahte 0.0 yutulmaz).
        assert meta["skor"] > 0.0
        assert meta["oneri"] == _ONERI["sari"]
        assert meta["gerekceler"] != ["hepsi temiz"]
        assert any("imza" in g for g in meta["gerekceler"])

    async def test_mevcut_anahtarlar_korunur(self, monkeypatch):
        # additive sözleşme: deterministik anahtarlar + yalnız 'aciklama' eklenir
        _sahte_llm(monkeypatch, {"aciklama": "açıklama"})
        sonuc = await risk_guard_node(_sari_state())
        # kusur_olasiligi: skordan AYRI olasılık (arayüzün yüzde gösterebileceği tek alan)
        assert set(sonuc["risk_metadata"]) == {
            "bant", "skor", "kusur_olasiligi", "gerekceler", "katkilar", "kalibrasyon",
            "oneri", "aciklama"}


class TestAciklamaAtla:
    """`risk_aciklama_atla` — yalnız SAYI ölçen çağıran için LLM açıklamasını atlar.

    Kurulun yakınsama döngüsü (yazi/kurul.py) her turdan sonra revize taslağı yeniden
    ölçer; ona yalnız bant/gerekçe SAYISI lazımdır. Memura hiç gösterilmeyecek sade-dil
    açıklaması için tur başına LLM çağrısı yapmak saf gecikmedir (canlı koşumda ~10 sn).
    Karar büyüklükleri bu bayraktan ETKİLENMEZ — sözleşme budur.
    """

    async def test_bayrak_llm_cagrisini_engeller(self, monkeypatch):
        cagrilar = _sahte_llm(monkeypatch, {"aciklama": "çağrılmamalıydı"})
        sonuc = await risk_guard_node({**_sari_state(), "risk_aciklama_atla": True})
        assert cagrilar == []                                  # LLM'e hiç gidilmedi
        assert sonuc["risk_metadata"]["aciklama"] == _ONERI["sari"]   # deterministik metne düşer

    async def test_bant_ve_gerekceler_bayraktan_ETKILENMEZ(self, monkeypatch):
        _sahte_llm(monkeypatch, {"aciklama": "sade dil"})
        acik = (await risk_guard_node(_sari_state()))["risk_metadata"]
        atla = (await risk_guard_node({**_sari_state(), "risk_aciklama_atla": True}))["risk_metadata"]
        for anahtar in ("bant", "skor", "gerekceler", "katkilar", "oneri"):
            assert acik[anahtar] == atla[anahtar], anahtar
