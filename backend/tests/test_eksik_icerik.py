"""eksik_tespit içerik-analizi testleri — genişletilmiş LLM şeması (aynı TEK çağrı).

Sözleşme: soru-nazikleştirme çağrısının şeması {"sorular": [...], "icerik_eksikleri": [...]}
olarak genişler. icerik_eksikleri ('bu tür evrakını işleme almak için içerikte eksik somut
bilgi') clarify_questions listesine EK madde olur; eksik_alanlar listesine ASLA dokunulmaz
(risk_guard/clarifier sözleşmesi). LLM None/bozuk → mevcut şablon sorular birebir.
"""

from __future__ import annotations

import agents.nodes.eksik_tespit as et
from agents.nodes.eksik_tespit import _fallback_sorular, eksik_tespit_node

# gonderen/tckn/talep/adres/imza eksik bir dilekçe state'i (tarih+konu mevcut).
_EKSIKLI_STATE = {
    "evrak_turu": "dilekce",
    "evrak_text": "Mahallemizdeki su kesintisinin giderilmesini istiyorum.",
    "bilgi_unsurlari": {"tarih": "25.06.2026", "konu": "Su kesintisi"},
}
_BEKLENEN_EKSIK = ["gonderen_ad_soyad", "tckn_veya_kurum", "talep", "iletisim_adres", "imza"]


def _sahte_llm(payload):
    """llm_json imzasında sahte async LLM — sabit payload döndürür."""

    async def _fake(system, user, **kwargs):
        return payload

    return _fake


async def _patlat(*args, **kwargs):
    raise AssertionError("eksik alan yokken LLM çağrılmamalıydı")


# ---------------------------------------------------------------------------
# icerik_eksikleri → clarify_questions'a EK madde
# ---------------------------------------------------------------------------


class TestIcerikEksikleriEklenir:
    """Geçerli LLM çıktısında sorular + içerik-eksik maddeleri birlikte döner."""

    async def test_icerik_eksikleri_sorulara_eklenir(self, monkeypatch):
        # Arrange
        payload = {
            "sorular": ["Adınızı ve soyadınızı ekler misiniz?", "Islak imzanızı ekler misiniz?"],
            "icerik_eksikleri": ["Kesintinin yaşandığı sokak/apartman adresini belirtir misiniz?"],
        }
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        # Assert — sorular önce, içerik-eksik maddesi EK olarak sonda
        assert out["clarify_questions"] == [
            "Adınızı ve soyadınızı ekler misiniz?",
            "Islak imzanızı ekler misiniz?",
            "Kesintinin yaşandığı sokak/apartman adresini belirtir misiniz?",
        ]

    async def test_eksik_alanlar_asla_degismez(self, monkeypatch):
        # Arrange — LLM içerik-eksik önerse bile eksik_alanlar deterministik kalır
        payload = {"sorular": ["Soru?"], "icerik_eksikleri": ["Olay tarihini belirtir misiniz?"]}
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        # Assert — risk_guard/clarifier sözleşmesi: alan listesi VARLIK kontrolünden
        assert out["eksik_alanlar"] == _BEKLENEN_EKSIK

    async def test_icerik_eksikleri_ust_sinirli(self, monkeypatch):
        # Arrange — taşkın LLM listesi soru listesini boğmasın (üst sınır 3)
        payload = {"sorular": ["Soru?"],
                   "icerik_eksikleri": [f"İstek {i}" for i in range(1, 8)]}
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        # Assert
        assert out["clarify_questions"] == ["Soru?", "İstek 1", "İstek 2", "İstek 3"]

    async def test_icerik_eksikleri_bozuksa_yalniz_sorular(self, monkeypatch):
        # Arrange — icerik_eksikleri liste değil / kirli öğeler → sessizce yok sayılır
        payload = {"sorular": ["Soru?"], "icerik_eksikleri": "adres eksik"}
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act / Assert
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        assert out["clarify_questions"] == ["Soru?"]

    async def test_icerik_eksikleri_string_olmayan_ogeler_elenir(self, monkeypatch):
        # Arrange — karışık tipli liste: yalnız temiz string'ler geçer
        payload = {"sorular": ["Soru?"],
                   "icerik_eksikleri": [42, "  ", None, "Başvuru numaranızı yazar mısınız?"]}
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act / Assert
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        assert out["clarify_questions"] == ["Soru?", "Başvuru numaranızı yazar mısınız?"]

    async def test_eski_clarify_questions_anahtari_kabul(self, monkeypatch):
        # Arrange — eski şema anahtarıyla dönen LLM çıktısı hâlâ kullanılır (geriye uyum)
        payload = {"clarify_questions": ["Eski şema sorusu?"]}
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act / Assert
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        assert out["clarify_questions"] == ["Eski şema sorusu?"]


# ---------------------------------------------------------------------------
# LLM None / bozuk çıktı → mevcut şablon sorular birebir
# ---------------------------------------------------------------------------


class TestFallbackKorunur:
    """LLM yok/bozuk → sabit Türkçe şablon sorular (eski davranış)."""

    async def test_llm_none_sablon_sorular(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(et, "llm_json", _sahte_llm(None))
        # Act
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        # Assert — şablon sorular birebir
        assert out["clarify_questions"] == _fallback_sorular(_BEKLENEN_EKSIK)
        assert out["eksik_alanlar"] == _BEKLENEN_EKSIK

    async def test_sorular_anahtari_yoksa_sablon(self, monkeypatch):
        # Arrange — mock LLM'in jenerik şeması ({"domain": ...}) tanınmaz → fallback
        monkeypatch.setattr(et, "llm_json", _sahte_llm({"domain": "kamu", "confidence": 0.9}))
        # Act / Assert
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        assert out["clarify_questions"] == _fallback_sorular(_BEKLENEN_EKSIK)

    async def test_sorular_bos_ise_sablon_icerik_dusurulur(self, monkeypatch):
        # Arrange — 'sorular' boş → çıktı bütünüyle güvensiz sayılır (içerik de düşer)
        payload = {"sorular": [], "icerik_eksikleri": ["Adres belirtir misiniz?"]}
        monkeypatch.setattr(et, "llm_json", _sahte_llm(payload))
        # Act / Assert
        out = await eksik_tespit_node(dict(_EKSIKLI_STATE))
        assert out["clarify_questions"] == _fallback_sorular(_BEKLENEN_EKSIK)

    async def test_eksik_yoksa_llm_hic_cagrilmaz(self, monkeypatch):
        # Arrange — tam dilekçe: eksik alan yok → LLM çağrısı YAPILMAMALI (sıfır ek maliyet)
        monkeypatch.setattr(et, "llm_json", _patlat)
        state = {
            "evrak_turu": "dilekce",
            "evrak_text": "Tam evrak metni.",
            "bilgi_unsurlari": {
                "gonderen": "Ayşe Yılmaz", "tckn_maskeli": "345***01",
                "tarih": "25.06.2026", "konu": "İzin", "talep": True,
                "iletisim_adres": True, "imza": True,
            },
        }
        # Act
        out = await eksik_tespit_node(state)
        # Assert
        assert out["clarify_questions"] == []
        assert out["eksik_alanlar"] == []
