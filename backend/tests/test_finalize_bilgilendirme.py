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
        "hedef_birim": "mali_strateji_sgb",
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


class TestYapisalBilgilendirme:
    """GOV.UK 3'lü bildirim yapısı (ne oldu / sırada ne var / ne yapılmalı) — deterministik
    iskelet. Kaynaklar: GOV.UK service manual "sending emails/text messages" + confirmation
    pages; 3071 m.7 / 4982 m.12 gerekçe-itiraz zorunluları (docs/arastirma)."""

    async def test_tam_evrakta_yapi_hazir(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert — durum + üç bölüm de dolu
        assert y["durum"] == "hazir"
        assert "Gazi Üniversitesi Rektörlüğü" in y["ne_oldu"]
        assert y["referans"]["birim"] == "Strateji Geliştirme / Mali İşler"
        assert y["referans"]["dayanak"] == ["5018 sayılı Kamu Mali Yönetimi ve Kontrol Kanunu m.33"]
        assert y["yapilacak"] is None
        assert y["sure"]["son_tarih"] == "24.07.2026"

    async def test_sirada_havale_tamam_onay_bekliyor(self, monkeypatch):
        # Arrange — GOV.UK "what happens next": tamamlanan + bekleyen adımlar ayrışır
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        sirada = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]["sirada"]
        # Assert
        durumlar = [a["durum"] for a in sirada]
        assert durumlar[0] == "tamam" and "havale" in sirada[0]["adim"].lower()
        assert "bekliyor" in durumlar[1:]
        assert any("onay" in a["adim"].lower() for a in sirada)
        # Yasal süreli adım AÇIK bayrak taşır — UI gecikme vurgusu metne değil buna bağlanır.
        assert any(a.get("sureli") for a in sirada)

    async def test_eksikte_yapilacak_ve_sonuc_uyarisi(self, monkeypatch):
        # Arrange — GOV.UK "what you need to do": maddeler + eylemsizliğin sonucu
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        y = (await finalize_mod.finalize_node(_state_eksik()))["bilgilendirme_yapisal"]
        # Assert
        assert y["durum"] == "eksik"
        assert "İletişim/tebligat adresi (veya telefon) eksik." in y["yapilacak"]["maddeler"]
        assert "tamamlanmadan" in y["yapilacak"]["sonuc"]
        assert any("eksik" in a["adim"].lower() for a in y["sirada"])

    async def test_bilgi_edinmede_itiraz_yolu_notu(self, monkeypatch):
        # Arrange — 4982 m.12: olumsuz cevapta gerekçe + başvuru yolları belirtilir
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        state = _state_tam()
        state["evrak_turu"] = "bilgi_edinme"
        # Act
        notlar = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]["notlar"]
        # Assert
        assert any("4982" in n and "itiraz" in n.lower() for n in notlar)

    async def test_dilekce_ailesinde_gerekce_notu(self, monkeypatch):
        # Arrange — 3071 m.7: cevap gerekçeli verilir
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        state = _state_tam()
        state["evrak_turu"] = "dilekce"
        # Act
        notlar = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]["notlar"]
        # Assert
        assert any("3071" in n and "gerekçe" in n.lower() for n in notlar)

    async def test_metin_yapidan_uretilir_tek_kaynak(self, monkeypatch):
        # Arrange — string bilgilendirme yapıdan render edilir (çift kaynak drift'i yok)
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — anlatı + süre + sıradaki adım string'de de var
        y, metin = sonuc["bilgilendirme_yapisal"], sonuc["bilgilendirme"]
        assert y["ne_oldu"] in metin
        assert "24.07.2026" in metin

    async def test_metin_ozet_ve_mevzuat_listesini_korur(self, monkeypatch):
        # Arrange — DB'ye persist edilen düz metin SÖZLEŞMESİ: özet + mevzuat listesi
        # eski _det_metin'de vardı, yapısal geçişte sessizce düşmemeli (review bulgusu).
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        # Act
        metin = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme"]
        # Assert
        assert "Kırtasiye alımına ilişkin fatura bedelinin ödenmesi talebi." in metin
        assert "5018 sayılı Kamu Mali Yönetimi ve Kontrol Kanunu m.33" in metin

    async def test_eksik_sayisi_iki_bolumde_tutarli(self, monkeypatch):
        # Arrange — clarify soruları eksik alanlardan FAZLA olabilir; iki bölüm aynı sayıyı demeli
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        state = _state_eksik()
        state["clarify_questions"] = state["clarify_questions"] + ["İçerik sorusu: hangi dönem?"]
        # Act
        y = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]
        # Assert — sirada'daki bekleyen sayısı == yapilacak madde sayısı (3)
        eksik_adim = next(a for a in y["sirada"] if "eksik" in a["adim"].lower())
        assert str(len(y["yapilacak"]["maddeler"])) in eksik_adim["detay"]

    async def test_bozuk_mevzuat_girisi_dusurulur(self, monkeypatch):
        # Arrange — 'baslik'sız / dict-olmayan mevzuat girdisi terminal node'u ASLA düşürmemeli
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        state = _state_tam()
        state["mevzuat_onerileri"] = [{"skor": 1.0}, "çöp", {"baslik": "5018 s.K. m.33"}]
        # Act — crash yok
        y = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]
        # Assert — yalnız geçerli girdi dayanakta
        assert y["referans"]["dayanak"] == ["5018 s.K. m.33"]


class TestLlmAnlatiGuard:
    """LLM yalnız 'ne oldu' anlatısını yazar; iskelet deterministik kalır. Anlatı,
    olgularda OLMAYAN sayı/tarih içerirse REDDEDİLİR (CLAUDE.md §1 — sıfır uydurma)."""

    async def test_temiz_anlati_icin_bile_llm_cagrilmaz(self, monkeypatch):
        # Arrange — finalize artık yalnız doğrulanabilir deterministik şablonu kullanır.
        anlati = ("Gazi Üniversitesi Rektörlüğü tarafından gönderilen fatura talebi "
                  "Cevabi Yazı olarak sınıflandırılarak Strateji birimine havale edilmiştir.")

        async def _fake_llm(**kwargs):
            raise AssertionError("finalize LLM çağırmamalı")

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — dış anlatı yok; yapı ile düz metin aynı şablon kaynağından.
        assert sonuc["bilgilendirme_yapisal"]["ne_oldu_kaynak"] == "sablon"
        assert anlati not in sonuc["bilgilendirme"]

    async def test_uydurma_sayili_anlati_reddedilir(self, monkeypatch):
        # Arrange — olgularda olmayan tutar/tarih → şablona düşülür
        async def _fake_llm(**kwargs):
            return "Evrak 1.250.000 TL bedelle 09.09.2027 tarihinde işleme alınmıştır."

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert y["ne_oldu_kaynak"] == "sablon"
        assert "1.250.000" not in y["ne_oldu"]

    async def test_kalip_ihlalinde_reddedilir(self, monkeypatch):
        # Arrange — selamlama/teşekkür kalıbı (CİMER kurumsal-nötr ilkesi) → şablon
        async def _fake_llm(**kwargs):
            return "Sayın ilgili, başvurunuz alınmıştır. İlginize teşekkür ederiz."

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert y["ne_oldu_kaynak"] == "sablon"

    async def test_buyuk_harf_kalip_reddedilir(self, monkeypatch):
        # Arrange — Türkçe İ/I katlama tuzağı: "SAYIN İLGİLİ" ascii-lower'da yakalanmazdı
        async def _fake_llm(**kwargs):
            return "SAYIN İLGİLİ, evrak işleme alınmıştır."

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert y["ne_oldu_kaynak"] == "sablon"

    async def test_uydurma_ad_kurum_reddedilir(self, monkeypatch):
        # Arrange — sayı İÇERMEYEN uydurma: olgularda olmayan kurum adı (adversarial bulgu)
        async def _fake_llm(**kwargs):
            return ("Ankara Büyükşehir Belediyesi tarafından gönderilen evrak "
                    "ilgili birime havale edilmiştir.")

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert y["ne_oldu_kaynak"] == "sablon"
        assert "Ankara Büyükşehir" not in y["ne_oldu"]

    async def test_ekli_kurum_adi_sablonda_kaynaktan_gelir(self, monkeypatch):
        # Arrange — eski LLM anlatısı çalıştırılmasa da kaynak kurum şablonda korunur.
        anlati = ("Gazi Üniversitesi Rektörlüğüne ait talep, Cevabi Yazı kapsamında "
                  "ilgili birime havale edilmiştir.")

        async def _fake_llm(**kwargs):
            raise AssertionError("finalize LLM çağırmamalı")

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert y["ne_oldu_kaynak"] == "sablon"
        assert "Gazi Üniversitesi Rektörlüğü" in y["ne_oldu"]
        assert y["ne_oldu"] != anlati


class TestDeterministikAnlatiOlayaUygun:
    async def test_yapisal_alanlar_olaya_ozgu_bilgileri_icerir(self, monkeypatch):
        # Arrange

        async def _fake_llm(**kwargs):
            raise AssertionError("finalize LLM çağırmamalı")

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — gönderici, taslak ve süre yapısal kaynaklardan render edilir.
        assert "Gazi Üniversitesi Rektörlüğü" in sonuc["bilgilendirme"]
        assert "Yasal cevap süresi" in sonuc["bilgilendirme"]
        assert "Yazı taslağı" in sonuc["bilgilendirme"]

    async def test_sablon_kurumsal_notr_uslubu_korur(self, monkeypatch):
        # Arrange

        async def _fake_llm(**kwargs):
            raise AssertionError("finalize LLM çağırmamalı")

        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(finalize_mod, "llm_text", _fake_llm)
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — selamlama/teşekkür/imza eklenmez.
        metin = sonuc["bilgilendirme_yapisal"]["ne_oldu"].lower()
        assert "teşekkür" not in metin
        assert "sayın " not in metin
