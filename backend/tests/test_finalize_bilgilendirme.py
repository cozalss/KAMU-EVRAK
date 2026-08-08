"""Finalize bilgilendirme — olaya-uygun "işlem sonucu bildirimi" testleri.

Şartname Görev 2: "kullanıcıya süreç hakkında açık ve anlaşılır bilgilendirme sunma"
+ "gerekli durumlarda eksik bilgi talep edebilme". Bilgilendirme metni:
  - olaya özgü bilgileri taşımalı (gönderen, taslak durumu, yasal cevap süresi),
  - eksik varsa somut sonuç uyarısı vermeli (neden tamamlanmalı),
  - üslup kurumsal-nötr olmalı (teşekkür/selamlama kalıbı yok).

NOT: finalize'ın LLM yolu kaldırıldı — bildirimin TAMAMI (iskelet + 'ne oldu' anlatısı)
deterministik şablondan render edilir. Bu yüzden testler LLM patch'lemez; sıfır-uydurma
sözleşmesi artık şablonun kendisine uygulanır (bkz. TestLlmsizAnlatiSozlesmesi).
"""

from __future__ import annotations

import json
import re

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
    async def test_gonderen_taslak_ve_yasal_sure_metinde(self):
        # Act — deterministik şablon tek başına olayı anlatabilmeli
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — olaya özgü üç bilgi: kimden geldi, taslak durumu, yasal son tarih
        metin = sonuc["bilgilendirme"]
        assert "Gazi Üniversitesi Rektörlüğü" in metin
        assert "Cevabi Yazı" in metin and "onay" in metin.lower()
        assert "24.07.2026" in metin

    async def test_eksikte_sonuc_uyarisi_var(self):
        # Act
        sonuc = await finalize_mod.finalize_node(_state_eksik())
        # Assert — yalnız liste değil, tamamlanmazsa ne olacağı da söylenir
        metin = sonuc["bilgilendirme"]
        assert "tamamlanmadan" in metin
        assert "İletişim/tebligat adresi (veya telefon) eksik." in metin

    async def test_clarify_stopta_taslak_uretilmedi_denir(self):
        # Arrange — dur-ve-sor: taslak üretilmeden kullanıcıya dönülür
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

    async def test_tam_evrakta_yapi_hazir(self):
        # Arrange
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert — durum + üç bölüm de dolu
        assert y["durum"] == "hazir"
        assert "Gazi Üniversitesi Rektörlüğü" in y["ne_oldu"]
        assert y["referans"]["birim"] == "Strateji Geliştirme / Mali İşler"
        assert y["referans"]["dayanak"] == ["5018 sayılı Kamu Mali Yönetimi ve Kontrol Kanunu m.33"]
        assert y["yapilacak"] is None
        assert y["sure"]["son_tarih"] == "24.07.2026"

    async def test_sirada_havale_tamam_onay_bekliyor(self):
        # Arrange — GOV.UK "what happens next": tamamlanan + bekleyen adımlar ayrışır
        # Act
        sirada = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]["sirada"]
        # Assert
        durumlar = [a["durum"] for a in sirada]
        assert durumlar[0] == "tamam" and "havale" in sirada[0]["adim"].lower()
        assert "bekliyor" in durumlar[1:]
        assert any("onay" in a["adim"].lower() for a in sirada)
        # Yasal süreli adım AÇIK bayrak taşır — UI gecikme vurgusu metne değil buna bağlanır.
        assert any(a.get("sureli") for a in sirada)

    async def test_eksikte_yapilacak_ve_sonuc_uyarisi(self):
        # Arrange — GOV.UK "what you need to do": maddeler + eylemsizliğin sonucu
        # Act
        y = (await finalize_mod.finalize_node(_state_eksik()))["bilgilendirme_yapisal"]
        # Assert
        assert y["durum"] == "eksik"
        assert "İletişim/tebligat adresi (veya telefon) eksik." in y["yapilacak"]["maddeler"]
        assert "tamamlanmadan" in y["yapilacak"]["sonuc"]
        assert any("eksik" in a["adim"].lower() for a in y["sirada"])

    async def test_bilgi_edinmede_itiraz_yolu_notu(self):
        # Arrange — 4982 m.12: olumsuz cevapta gerekçe + başvuru yolları belirtilir
        state = _state_tam()
        state["evrak_turu"] = "bilgi_edinme"
        # Act
        notlar = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]["notlar"]
        # Assert
        assert any("4982" in n and "itiraz" in n.lower() for n in notlar)

    async def test_dilekce_ailesinde_gerekce_notu(self):
        # Arrange — 3071 m.7: cevap gerekçeli verilir
        state = _state_tam()
        state["evrak_turu"] = "dilekce"
        # Act
        notlar = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]["notlar"]
        # Assert
        assert any("3071" in n and "gerekçe" in n.lower() for n in notlar)

    async def test_metin_yapidan_uretilir_tek_kaynak(self):
        # Arrange — string bilgilendirme yapıdan render edilir (çift kaynak drift'i yok)
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — anlatı + süre + sıradaki adım string'de de var
        y, metin = sonuc["bilgilendirme_yapisal"], sonuc["bilgilendirme"]
        assert y["ne_oldu"] in metin
        assert "24.07.2026" in metin

    async def test_metin_ozet_ve_mevzuat_listesini_korur(self):
        # Arrange — DB'ye persist edilen düz metin SÖZLEŞMESİ: özet + mevzuat listesi
        # eski _det_metin'de vardı, yapısal geçişte sessizce düşmemeli (review bulgusu).
        # Act
        metin = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme"]
        # Assert
        assert "Kırtasiye alımına ilişkin fatura bedelinin ödenmesi talebi." in metin
        assert "5018 sayılı Kamu Mali Yönetimi ve Kontrol Kanunu m.33" in metin

    async def test_eksik_sayisi_iki_bolumde_tutarli(self):
        # Arrange — clarify soruları eksik alanlardan FAZLA olabilir; iki bölüm aynı sayıyı demeli
        state = _state_eksik()
        state["clarify_questions"] = state["clarify_questions"] + ["İçerik sorusu: hangi dönem?"]
        # Act
        y = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]
        # Assert — sirada'daki bekleyen sayısı == yapilacak madde sayısı (3)
        eksik_adim = next(a for a in y["sirada"] if "eksik" in a["adim"].lower())
        assert str(len(y["yapilacak"]["maddeler"])) in eksik_adim["detay"]

    async def test_bozuk_mevzuat_girisi_dusurulur(self):
        # Arrange — 'baslik'sız / dict-olmayan mevzuat girdisi terminal node'u ASLA düşürmemeli
        state = _state_tam()
        state["mevzuat_onerileri"] = [{"skor": 1.0}, "çöp", {"baslik": "5018 s.K. m.33"}]
        # Act — crash yok
        y = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]
        # Assert — yalnız geçerli girdi dayanakta
        assert y["referans"]["dayanak"] == ["5018 s.K. m.33"]


class TestLlmsizAnlatiSozlesmesi:
    """Finalize'ın LLM yolu KALDIRILDI: 'ne oldu' anlatısı da deterministik şablondur.

    Bu sınıf eskiden sahte bir ``llm_text`` patch'leyip "uydurma anlatı reddedildi" derdi.
    Çağrılan bir kod yolu kalmadığı için o testler HER hâlükârda geçiyordu (boş kapı).
    Yerine iki gerçek sözleşme sınanır: (a) modül bir LLM yardımcısı import etmez,
    (b) şablonun kendisi olgularda olmayan bilgi üretmez.
    """

    async def test_llm_yardimcisi_import_edilmez(self):
        # LLM yolu geri gelirse önce bu isim modül ad alanına döner — yapısal guard.
        assert not hasattr(finalize_mod, "llm_text")

    async def test_ne_oldu_kaynagi_sablondur(self):
        # Act
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert y["ne_oldu_kaynak"] == "sablon"

    async def test_kaynak_kurum_sablonda_korunur(self):
        # Act — gönderen kurum LLM olmadan da anlatıda görünmeli
        y = (await finalize_mod.finalize_node(_state_tam()))["bilgilendirme_yapisal"]
        # Assert
        assert "Gazi Üniversitesi Rektörlüğü" in y["ne_oldu"]

    async def test_sablon_olgularda_olmayan_sayi_uretmez(self):
        # Arrange — CLAUDE.md §1 sıfır-uydurma, artık ŞABLONA uygulanıyor: anlatıdaki her
        # sayı state'ten gelmeli (tutar/tarih/madde no şablon metnine sızmamalı).
        state = _state_tam()
        olgular = json.dumps(state, ensure_ascii=False)
        # Act
        y = (await finalize_mod.finalize_node(state))["bilgilendirme_yapisal"]
        # Assert
        for sayi in re.findall(r"\d+", y["ne_oldu"]):
            assert sayi in olgular, f"şablon olgularda olmayan sayı üretti: {sayi}"

    async def test_sablon_kurumsal_notr_uslubu_korur(self):
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — selamlama/teşekkür/imza eklenmez (CİMER kurumsal-nötr ilkesi).
        metin = sonuc["bilgilendirme_yapisal"]["ne_oldu"].lower()
        assert "teşekkür" not in metin
        assert "sayın " not in metin

    async def test_yapisal_alanlar_olaya_ozgu_bilgileri_icerir(self):
        # Act
        sonuc = await finalize_mod.finalize_node(_state_tam())
        # Assert — gönderici, taslak ve süre yapısal kaynaklardan render edilir.
        assert "Gazi Üniversitesi Rektörlüğü" in sonuc["bilgilendirme"]
        assert "Yasal cevap süresi" in sonuc["bilgilendirme"]
        assert "Yazı taslağı" in sonuc["bilgilendirme"]
