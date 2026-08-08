"""SDP kapalı-küme LLM seçici testleri (S1 madde 10).

Sözleşme: (1) evrak sayısından regex okuma HER ZAMAN önce (LLM hiç çağrılmaz);
(2) config.SDP_LLM_SECICI açık + gerçek LLM varken llm_json'a KAPALI KÜME aday havuzu
gider — havuz-dışı kod Python tarafında REDDEDİLİR (halüsinasyon imkânsız);
(3) bayrak kapalı / mock / bozuk çıktı → mevcut deterministik seçim BİREBİR korunur.
"""

from __future__ import annotations

import pytest

import agents.nodes.arsiv as A
from agents import config
from agents.sdp_katalog import llm_aday_havuzu

# ---------------------------------------------------------------------------
# Yardımcılar — sahte LLM + "LLM çağrılmamalı" kanıtı
# ---------------------------------------------------------------------------


class _SahteLLM:
    """real_llm() non-None dönsün diye minimal nesne (gerçek inference yok)."""


@pytest.fixture
def llm_acik(monkeypatch):
    """Bayrak açık + gerçek LLM 'var' senaryosu (llm_json ayrıca patch'lenir)."""
    monkeypatch.setattr(config, "SDP_LLM_SECICI", True)
    monkeypatch.setattr(A, "real_llm", lambda: _SahteLLM())


def _sabit_json(obj):
    async def _fake(*_args, **_kwargs):
        return obj

    return _fake


def _patlayan_llm_json(*_args, **_kwargs):
    raise AssertionError("llm_json çağrılmamalıydı (öncelik/bayrak sözleşmesi)")


# ---------------------------------------------------------------------------
# (1) Sayı-okuma önceliği — LLM açıkken bile regex üstte kalır
# ---------------------------------------------------------------------------


class TestSayiOnceligi:
    async def test_sayidan_okunan_kod_llm_cagirmadan_kazanir(self, llm_acik, monkeypatch):
        # Arrange — sayıda SDP kodu var; llm_json çağrılırsa test patlar
        monkeypatch.setattr(A, "llm_json", _patlayan_llm_json)
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "bilgi edinme", "sayi": "E-11112222-622.03-9999"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert — regex yolu AYNEN üstte
        assert am["sdp_kodu"] == "622.03"
        assert "sayısından" in am["sdp_gerekce"]


# ---------------------------------------------------------------------------
# (2) LLM seçimi — kapalı küme içinden kod + 'LLM seçimi: <gerekce>'
# ---------------------------------------------------------------------------


class TestLlmSecimi:
    async def test_listeden_kod_secilir_gerekce_yazilir(self, llm_acik, monkeypatch):
        # Arrange — içerik iki kodu da eşler (622.03 + 640); deterministik yol 622.03
        # seçerdi (skor eşit → kod sırası). Sahte LLM 640 seçiyor → LLM kararı kullanılmalı.
        monkeypatch.setattr(A, "llm_json", _sabit_json(
            {"kod": "640", "gerekce": "İcra dosyası talebi hukuk işleri dosyasına girer."}
        ))
        state = {
            "evrak_turu": "belirsiz",
            "bilgi_unsurlari": {"konu": "icra dosyası hakkında bilgi edinme"},
            "hedef_birim": "hukuk_musavirligi",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"] == "640"
        assert am["sdp_gerekce"].startswith("LLM seçimi: ")
        assert "hukuk" in am["sdp_gerekce"].lower()
        assert am["sdp_adi"]  # katalog adı çözülür

    async def test_ui_aday_listesi_deterministik_kalir(self, llm_acik, monkeypatch):
        # Arrange — LLM seçse bile sdp_adaylari UI sözleşmesi (top-3, det.) değişmez
        monkeypatch.setattr(A, "llm_json", _sabit_json({"kod": "622.03", "gerekce": "x"}))
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "4982 bilgi edinme başvurusu"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert 1 <= len(am["sdp_adaylari"]) <= 3
        assert am["sdp_adaylari"][0]["kod"] == "622.03"

    async def test_ana_hizmet_seciminde_dogrula_korunur(self, llm_acik, monkeypatch):
        # Arrange — LLM 100'ü seçse de [DOĞRULA:] bayrağı mevcut kuralla aynen uygulanır
        monkeypatch.setattr(A, "llm_json", _sabit_json(
            {"kod": "100", "gerekce": "Ruhsat başvurusu ana hizmet işlemidir."}
        ))
        state = {
            "evrak_turu": "basvuru",
            "bilgi_unsurlari": {"konu": "imar ruhsat başvurusu"},
            "hedef_birim": "ilgili_teknik_daire",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert — kuruma-özgü ana hizmet kodu doğrulanmalı (CLAUDE.md §1)
        assert am["sdp_kodu"].startswith("100")
        assert "DOĞRULA" in am["sdp_kodu"]
        # Açık ara tek kazanan: danışma LLM'i atlanır, doğrulama işareti yine korunur.
        assert not am["sdp_gerekce"].startswith("LLM seçimi: ")


# ---------------------------------------------------------------------------
# (3) Fallback sözleşmesi — liste-dışı kod / bozuk çıktı / bayrak kapalı / mock
# ---------------------------------------------------------------------------


class TestFallback:
    async def test_liste_disi_kod_reddedilir(self, llm_acik, monkeypatch):
        # Arrange — sahte LLM aday havuzunda OLMAYAN kod uyduruyor → reddedilmeli
        monkeypatch.setattr(A, "llm_json", _sabit_json({"kod": "999", "gerekce": "uydurma"}))
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "bilgi edinme başvurusu"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert — deterministik seçim birebir (LLM izi yok)
        assert am["sdp_kodu"] == "622.03"
        assert "LLM seçimi" not in am["sdp_gerekce"]
        assert "bilgi edinme" in am["sdp_gerekce"]

    @pytest.mark.parametrize("bozuk", [None, {}, {"gerekce": "kod alanı yok"}, {"kod": ""}])
    async def test_bozuk_cikti_deterministik_fallback(self, llm_acik, monkeypatch, bozuk):
        # Arrange — llm_json None/eksik-alan döndürüyor (timeout/parse-fail eşdeğeri)
        monkeypatch.setattr(A, "llm_json", _sabit_json(bozuk))
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "bilgi edinme başvurusu"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"] == "622.03"
        assert "LLM seçimi" not in am["sdp_gerekce"]

    async def test_bayrak_kapali_llm_cagrilmaz(self, monkeypatch):
        # Arrange — LLM 'var' ama bayrak kapalı → eski yol, çağrı sıfır
        monkeypatch.setattr(config, "SDP_LLM_SECICI", False)
        monkeypatch.setattr(A, "real_llm", lambda: _SahteLLM())
        monkeypatch.setattr(A, "llm_json", _patlayan_llm_json)
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "bilgi edinme başvurusu"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"] == "622.03"
        assert "LLM seçimi" not in am["sdp_gerekce"]

    async def test_mock_modda_eski_yol(self, monkeypatch):
        # Arrange — bayrak açık ama LLM_MODE=mock (conftest) → real_llm None → eski yol
        monkeypatch.setattr(config, "SDP_LLM_SECICI", True)
        monkeypatch.setattr(A, "llm_json", _patlayan_llm_json)
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "bilgi edinme başvurusu"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await A.arsiv_node(state))["arsiv_metadata"]
        # Assert — CI/mock deterministik davranış birebir
        assert am["sdp_kodu"] == "622.03"
        assert "LLM seçimi" not in am["sdp_gerekce"]


# ---------------------------------------------------------------------------
# llm_aday_havuzu — kapalı küme havuz kuralları (sdp_katalog yardımcısı)
# ---------------------------------------------------------------------------


class TestLlmAdayHavuzu:
    def test_eslesme_arti_kaba_kod(self):
        # Arrange / Act — 'fatura' 841'i eşler; kaba kod 010 eşleşmese de havuza eklenir
        havuz = llm_aday_havuzu(["fatura ödemesi hakkında"], "bilinmeyen_tur", "010")
        # Assert
        kodlar = [a["kod"] for a in havuz]
        assert "841" in kodlar
        assert "010" in kodlar

    def test_sifir_eslesme_kaba_kod_ve_genel_kodlar(self):
        # Arrange / Act — keyword 0 aday → tür kaba-kodu + ortak (genel) kodlar havuz olur
        havuz = llm_aday_havuzu(["nötr metin"], "bilinmeyen_tur", "100")
        # Assert — LLM'e yine kapalı küme gider (boş havuz yok)
        kodlar = {a["kod"] for a in havuz}
        assert "100" in kodlar
        assert {"000", "010"} <= kodlar  # ortak aralık temsilcileri

    def test_havuz_kaydi_sozlesmesi(self):
        # Arrange / Act — prompt'a girecek alanlar: kod + ad + anahtarlar (+dogrula bayrağı)
        havuz = llm_aday_havuzu(["ruhsat başvurusu"], "basvuru", "100")
        # Assert
        kayit = next(a for a in havuz if a["kod"] == "100")
        assert kayit["ad"]
        assert isinstance(kayit["anahtar"], list)
        assert kayit["dogrula"] is True  # ana hizmet aralığı HER ZAMAN doğrulanır

    def test_katalog_disi_kaba_kod_havuza_giremez(self):
        # Arrange / Act — katalogda olmayan kaba kod sessizce atlanır (kapalı küme disiplini)
        havuz = llm_aday_havuzu(["fatura"], "bilinmeyen_tur", "777")
        # Assert
        assert "777" not in {a["kod"] for a in havuz}
