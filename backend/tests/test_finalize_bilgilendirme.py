"""Finalize bilgilendirme — olaya-uygun "işlem sonucu bildirimi" testleri.

Şartname Görev 2: "kullanıcıya süreç hakkında açık ve anlaşılır bilgilendirme sunma"
+ "gerekli durumlarda eksik bilgi talep edebilme". Bilgilendirme metni:
  - olaya özgü bilgileri taşımalı (gönderen, taslak durumu, yasal cevap süresi),
  - eksik varsa somut sonuç uyarısı vermeli (neden tamamlanmalı),
  - LLM üslubu kurumsal-nötr olmalı (teşekkür/selamlama kalıpları prompt'ta YASAKLI).
"""

from __future__ import annotations

from agents.nodes import finalize as finalize_mod


def _state_tam() -> dict:
    """Ekran görüntüsündeki senaryo: kurum yazısı, taslak hazır, SLA hesaplı, eksik yok."""
    return {
        "evrak_turu": "ust_yazi",
        "hedef_birim": "strateji_mali",
        "bilgi_unsurlari": {"gonderen": "Gazi Üniversitesi Rektörlüğü"},
        "eksik_alanlar": [],
        "clarify_questions": [],
        "mevzuat_onerileri": [{"baslik": "5018 sayılı Kamu Mali Yönetimi ve Kontrol Kanunu m.33"}],
        "ozet": "Kırtasiye alımına ilişkin fatura bedelinin ödenmesi talebi.",
        "yazi_turu": "cevabi_yazi",
        "yazi_taslak_md": "# taslak",
        "sla_metadata": {
            "durum": "NORMAL", "etiket": "Normal", "son_tarih": "24.07.2026",
            "kalan_gun": 15, "baslangic": "09.07.2026", "sure": "30 gün",
            "mevzuat": "3071 m.7",
        },
    }


def _state_eksik() -> dict:
    """Eksik-bilgi senaryosu: taslak var ama iki zorunlu alan eksik."""
    state = _state_tam()
    state["eksik_alanlar"] = ["gonderen_ad_soyad", "iletisim_adres"]
    state["clarify_questions"] = [
        "Evrakı gönderenin adı-soyadı belirtilmemiş; ekler misiniz?",
        "İletişim/tebligat adresi (veya telefon) eksik.",
    ]
    return state


class TestDeterministikMetin:
    async def test_gonderen_taslak_ve_yasal_sure_metinde(self, monkeypatch):
        # Arrange — LLM atlanır → deterministik şablon tek başına olayı anlatabilmeli
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — olaya özgü üç bilgi: kimden geldi, taslak durumu, yasal son tarih
        metin = sonuc["bilgilendirme"]
        assert "Gazi Üniversitesi Rektörlüğü" in metin
        assert "Cevabi Yazı" in metin and "onay" in metin.lower()
        assert "24.07.2026" in metin

    async def test_eksikte_sonuc_uyarisi_var(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        sonuc = await finalize_mod.finalize_node(_state_eksik())
        # Assert — yalnız liste değil, tamamlanmazsa ne olacağı da söylenir
        metin = sonuc["bilgilendirme"]
        assert "tamamlanmadan" in metin
        assert "İletişim/tebligat adresi (veya telefon) eksik." in metin

    async def test_clarify_stopta_taslak_uretilmedi_denir(self, monkeypatch):
        # Arrange — dur-ve-sor: taslak üretilmeden kullanıcıya dönülür
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        state = _state_eksik()
        state["clarify_stop"] = True
        state.pop("yazi_taslak_md")
        # Act
        sonuc = await finalize_mod.finalize_node(state)
        # Assert
        assert "üretilmedi" in sonuc["bilgilendirme"]


class TestLlmPromptOlayaUygun:
    async def test_facts_olaya_ozgu_alanlari_icerir(self, monkeypatch):
        # Arrange — llm_text'e giden system+user yakalanır
        yakalanan: dict = {}

        async def _fake_llm(**kwargs):
            yakalanan.update(kwargs)
            return "LLM bilgilendirme metni"

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — LLM olayın tamamını görür (gönderen + taslak + yasal süre)
        assert sonuc["bilgilendirme"] == "LLM bilgilendirme metni"
        assert "Gazi Üniversitesi Rektörlüğü" in yakalanan["user"]
        assert "Yasal cevap süresi" in yakalanan["user"]
        assert "Yazı taslağı" in yakalanan["user"]

    async def test_system_prompt_uslup_kurallari(self, monkeypatch):
        # Arrange
        yakalanan: dict = {}

        async def _fake_llm(**kwargs):
            yakalanan.update(kwargs)
            return "x"

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        await finalize_mod.finalize_node(_state_tam())
        # Assert — teşekkür/selamlama kalıpları açıkça yasaklanır; hedef kitle memurdur
        system = yakalanan["system"]
        assert "teşekkür" in system.lower()
        assert "memur" in system.lower()
        assert "UYDURMA" in system
