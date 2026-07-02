"""verify LLM katmanı testleri — 2646 lint auto-fix (Madde 2) + iddia-düzeyi grounding (Madde 6).

Üç yol da kanıtlanır (CLAUDE.md fallback sözleşmesi):
  1. mock yolu     — LLM_MODE=mock (conftest): MockLLM şema tutmaz → mevcut davranış BİREBİR.
  2. sahte-LLM yolu — llm_json monkeypatch: geçerli çıktı → additive alan/uyarı eklenir.
  3. bozuk-çıktı yolu — None / yanlış tip → öneri düşürülür, deterministik davranış korunur.

Güvenlik asimetrisi: LLM yalnız uyarı EKLER / öneri SUNAR; yazi_taslak_md hiçbir
durumda otomatik değişmez, deterministik regex veto hiçbir durumda silinmez.
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import pytest

import agents.nodes.verify as verify_mod
from agents.nodes.risk_guard import _UYDURMA_IMZA
from agents.nodes.verify import verify_node

# Kaynak evrak — taslaklardaki meşru tarih/sayı buradan gelir.
KAYNAK = "01.03.2026 tarihli E-1234567 sayılı park aydınlatma talebi (sentetik)."

# Kirli taslak — 3 lint uyarısı: T.C. başlığı yok (m.10), tarih yok (m.12), kapanış yok (m.16).
KIRLI = "Sayı: {{ ebys }}\nKonu: Park aydınlatma talebi\nGövde metni."

# Düzeltilmiş taslak — başlık + kapanış + imza eklenmiş, YENİ tarih/sayı YOK → 1 uyarı kalır.
DUZGUN = (
    "T.C.\nANKARA VALİLİĞİ\nSayı: {{ ebys }}\nKonu: Park aydınlatma talebi\n"
    "Gövde metni.\nArz ederim.\nAyşe YILMAZ\nMüdür"
)

# Tam-bölümlü temiz taslak (mevcut test seti ile aynı) — deterministik uyarı üretmez.
TEMIZ = "T.C.\nSayı: 1\nKonu: x\narz ederim\nimza"


def _fake_llm(cevap):
    """llm_json yerine geçen sahte — sabit JSON nesnesi (veya None) döndürür."""
    async def _f(system, user, **kw):
        return cevap
    return _f


def _patlat_llm():
    """Çağrılırsa test patlar — LLM yolunun HİÇ açılmadığının kanıtı."""
    async def _f(system, user, **kw):
        raise AssertionError("Bu yolda llm_json çağrılmamalıydı")
    return _f


@pytest.fixture()
def acik(monkeypatch):
    """VERIFY açık; her test kendi LLM bayrağını ayarlar (izolasyon)."""
    monkeypatch.setattr(verify_mod, "VERIFY_ENABLED", True)
    return monkeypatch


# ---------------------------------------------------------------------------
# GÖREV A — 2646 lint auto-fix (lint_duzeltme_md)
# ---------------------------------------------------------------------------
class TestLintAutofix:
    async def test_duzeltme_linti_azaltiyorsa_oneri_yazilir(self, acik):
        # Arrange — sahte LLM lint uyarılarını gerçekten azaltan düzeltme döndürür
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        acik.setattr(verify_mod, "llm_json", _fake_llm({"duzeltilmis_taslak": DUZGUN}))
        state = {"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK}
        # Act
        out = await verify_node(state)
        # Assert — additive öneri dolu; mevcut taslak ASLA otomatik değişmez
        assert out["lint_duzeltme_md"] == DUZGUN
        assert "yazi_taslak_md" not in out
        assert state["yazi_taslak_md"] == KIRLI

    async def test_duzeltme_linti_azaltmiyorsa_dusurulur(self, acik):
        # Arrange — sahte LLM aynı kirli taslağı geri döndürür (iyileşme yok)
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        acik.setattr(verify_mod, "llm_json", _fake_llm({"duzeltilmis_taslak": KIRLI}))
        # Act
        out = await verify_node({"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK})
        # Assert
        assert "lint_duzeltme_md" not in out

    async def test_yeni_sayi_uyduran_duzeltme_reddedilir(self, acik):
        # Arrange — düzeltme lint'i azaltıyor AMA kaynakta olmayan sayı ekliyor → veto
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        uydurmali = DUZGUN + "\nİlgi: E-9998887 sayılı yazı."
        acik.setattr(verify_mod, "llm_json", _fake_llm({"duzeltilmis_taslak": uydurmali}))
        # Act
        out = await verify_node({"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK})
        # Assert
        assert "lint_duzeltme_md" not in out

    async def test_yeni_tarih_uyduran_duzeltme_reddedilir(self, acik):
        # Arrange — kaynakta (ve bugünde) olmayan tarih eklendi → veto
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        uydurmali = DUZGUN.replace("Gövde metni.", "Gövde metni. 09.09.2031 tarihinde.")
        acik.setattr(verify_mod, "llm_json", _fake_llm({"duzeltilmis_taslak": uydurmali}))
        # Act
        out = await verify_node({"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK})
        # Assert
        assert "lint_duzeltme_md" not in out

    async def test_bayrak_kapaliyken_llm_hic_cagrilmaz(self, acik):
        # Arrange — LINT_AUTOFIX kapalı: llm_json çağrılırsa test patlar
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        acik.setattr(verify_mod, "llm_json", _patlat_llm())
        # Act
        out = await verify_node({"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK})
        # Assert
        assert "lint_duzeltme_md" not in out

    async def test_mock_modda_alan_uretilmez(self, acik):
        # Arrange — llm_json PATCH'siz: MockLLM şeması 'duzeltilmis_taslak' içermez
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        # Act
        out = await verify_node({"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK})
        # Assert — mock yolda mevcut davranış birebir (additive alan yok)
        assert "lint_duzeltme_md" not in out

    async def test_bozuk_cikti_dusurulur(self, acik):
        # Arrange — LLM None (hata/timeout) veya yanlış tip döndürür
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        for bozuk in (None, {"duzeltilmis_taslak": 42}, {"duzeltilmis_taslak": "  "}, {}):
            acik.setattr(verify_mod, "llm_json", _fake_llm(bozuk))
            # Act
            out = await verify_node({"yazi_taslak_md": KIRLI, "evrak_text": KAYNAK})
            # Assert
            assert "lint_duzeltme_md" not in out

    async def test_lint_temizse_llm_hic_cagrilmaz(self, acik):
        # Arrange — lint uyarısı olmayan taslakta düzeltme çağrısı YAPILMAZ (maliyet)
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        acik.setattr(verify_mod, "llm_json", _patlat_llm())
        temiz_lintli = ("T.C.\nANKARA VALİLİĞİ\nSayı: {{ ebys }}\nKonu: x\n"
                        "01.03.2026\nArz ederim.\nAyşe YILMAZ\nMüdür")
        # Act — lint uyarısı yok → autofix atlanır
        out = await verify_node({"yazi_taslak_md": temiz_lintli, "evrak_text": KAYNAK})
        # Assert
        assert "lint_duzeltme_md" not in out


# ---------------------------------------------------------------------------
# GÖREV B — iddia-düzeyi grounding (verify_uyari + risk imzası)
# ---------------------------------------------------------------------------
class TestGroundingLLM:
    async def test_desteklenmeyen_iddia_dogru_imzayla_eklenir(self, acik):
        # Arrange — sahte LLM kaynakta olmayan bir iddia raporlar
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        acik.setattr(verify_mod, "llm_json",
                     _fake_llm({"desteklenmeyen_iddialar": ["Ankara Valiliği onayı alınmıştır"]}))
        # Act
        out = await verify_node({"yazi_taslak_md": TEMIZ, "evrak_text": KAYNAK})
        # Assert — risk_guard'ın KIRMIZI imzası mesajda birebir var
        eslesen = [u for u in out["verify_uyari"] if "Ankara Valiliği onayı" in u]
        assert len(eslesen) == 1
        assert _UYDURMA_IMZA in eslesen[0]

    async def test_sanite_liste_5_ile_sinirli_uzunlar_kirpilir(self, acik):
        # Arrange — string olmayan atılır, 200+ karakter kırpılır, en çok 5 iddia
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        iddialar = [42, "", "a" * 300, "b", "c", "d", "e", "f"]
        acik.setattr(verify_mod, "llm_json", _fake_llm({"desteklenmeyen_iddialar": iddialar}))
        # Act
        out = await verify_node({"yazi_taslak_md": TEMIZ, "evrak_text": KAYNAK})
        # Assert
        grounding = [u for u in out["verify_uyari"] if _UYDURMA_IMZA in u]
        assert len(grounding) == 5
        assert any("a" * 200 in u for u in grounding)
        assert all("a" * 201 not in u for u in grounding)
        assert not any(u == "f" for u in grounding)  # 6. iddia kesildi

    async def test_llm_none_yalniz_regex_veto(self, acik):
        # Arrange — LLM hata/timeout (None) → temiz taslakta uyarı üretilmez
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        acik.setattr(verify_mod, "llm_json", _fake_llm(None))
        # Act
        out = await verify_node({"yazi_taslak_md": TEMIZ, "evrak_text": KAYNAK})
        # Assert — baseline davranış birebir
        assert out["verify_uyari"] == []

    async def test_deterministik_veto_her_durumda_durur(self, acik):
        # Arrange — LLM 'sorun yok' dese bile regex veto uydurma tarihi YAKALAR
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        acik.setattr(verify_mod, "llm_json", _fake_llm({"desteklenmeyen_iddialar": []}))
        taslak = TEMIZ + "\n99.12.2099 tarihli."
        # Act
        out = await verify_node({"yazi_taslak_md": taslak, "evrak_text": KAYNAK})
        # Assert — güvenlik asimetrisi: deterministik veto silinmez
        assert any("99.12.2099" in u and _UYDURMA_IMZA in u for u in out["verify_uyari"])

    async def test_bayrak_kapaliyken_llm_hic_cagrilmaz(self, acik):
        # Arrange — VERIFY_GROUNDING_LLM kapalı: llm_json çağrılırsa test patlar
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", False)
        acik.setattr(verify_mod, "llm_json", _patlat_llm())
        # Act
        out = await verify_node({"yazi_taslak_md": TEMIZ, "evrak_text": KAYNAK})
        # Assert
        assert out["verify_uyari"] == []

    async def test_mock_modda_davranis_birebir(self, acik):
        # Arrange — llm_json PATCH'siz: MockLLM şeması 'desteklenmeyen_iddialar' içermez
        acik.setattr(verify_mod, "LINT_AUTOFIX", True)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        # Act
        out = await verify_node({"yazi_taslak_md": TEMIZ, "evrak_text": KAYNAK})
        # Assert — mevcut test_temiz_taslak_uyari_yok ile aynı sonuç
        assert out["verify_uyari"] == []
        assert "tamam" in out["verify_notes"].lower()

    async def test_bozuk_tip_liste_degil_atilir(self, acik):
        # Arrange — 'desteklenmeyen_iddialar' liste değil → sessizce yok sayılır
        acik.setattr(verify_mod, "LINT_AUTOFIX", False)
        acik.setattr(verify_mod, "VERIFY_GROUNDING_LLM", True)
        acik.setattr(verify_mod, "llm_json",
                     _fake_llm({"desteklenmeyen_iddialar": "tek string"}))
        # Act
        out = await verify_node({"yazi_taslak_md": TEMIZ, "evrak_text": KAYNAK})
        # Assert
        assert out["verify_uyari"] == []
