"""Yazı türü seçimi + muhatap hitabı — 2026-07-09 canlı-demo düzeltmeleri.

Kullanıcının yakaladığı saçmalık: fatura/ödeme talebine 'gönderen kurumun antetine
cevabi yazı' üretiliyordu; kurum adına 'Sayın' ekleniyordu; LLM gövdesi + şablon
çift kapanış basıyordu. Bu testler üç düzeltmeyi kilitler:
  1. EVRAK_TO_YAZI: fatura/icra/dava/tebligat → İLETİM (ust_yazi, muhatap=hedef birim);
     gorus_mutalaa talebi → gorus_mutalaa şablonu.
  2. _muhatap: kurum/makam adına 'Sayın' öneki eklenmez (Yön. m.14).
  3. _kapanis_kuyrugu_kirp: gövde sonundaki bağımsız kapanış cümlesi kırpılır
     (şablon kapanışı ayrıca basar); cümle ortası ifadeye dokunulmaz.
AAA deseni; deterministik (LLM yok).
"""

from __future__ import annotations

import pytest

from agents.config import EVRAK_TO_YAZI
from yazi.yazi_render import _kapanis_kuyrugu_kirp, _kurum_adi_mi, _muhatap


class TestEvrakToYaziIletimAilesi:
    """Hukuki/mali belgeler gönderene YANITLANMAZ — sorumlu birime iletilir."""

    @pytest.mark.parametrize("turu", ["fatura", "icra_evraki", "dava_evraki", "tebligat"])
    def test_iletim_turleri_ust_yazi(self, turu):
        # ust_yazi → yazi_taslak_node muhatabı hedef_birim yapar (gönderen değil)
        assert EVRAK_TO_YAZI[turu] == "ust_yazi"

    def test_gorus_talebi_gorus_sablonuyla_yanitlanir(self):
        assert EVRAK_TO_YAZI["gorus_mutalaa"] == "gorus_mutalaa"

    def test_vatandas_ailesi_degismedi(self):
        # Regresyon: vatandaş yolu (cevap/bilgilendirme) bu düzeltmeden etkilenmez
        assert EVRAK_TO_YAZI["dilekce"] == "cevabi_yazi"
        assert EVRAK_TO_YAZI["bilgi_edinme"] == "bilgilendirme"
        assert EVRAK_TO_YAZI["sikayet"] == "cevabi_yazi"


class TestMuhatapKurumHitabi:
    def test_gercek_kisiye_sayin(self):
        assert _muhatap({"gonderen": "Ayşe Yılmaz"}) == "Sayın Ayşe Yılmaz"

    @pytest.mark.parametrize("kurum", [
        "Gazi Üniversitesi Rektörlüğü",
        "SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI",
        "İçişleri Bakanlığı",
        "Ankara 14. İcra Dairesi",
        "Keçiören Belediye Başkanlığı",
        "Örnek Kırtasiye Ltd. Şti.",
        "Ankara 5. İdare Mahkemesi",
    ])
    def test_kurum_adina_sayin_eklenmez(self, kurum):
        # Yön. m.14: makam/tüzel kişi adı AYNEN — "Sayın Gazi Üniversitesi" hatası önlenir
        assert _muhatap({"gonderen": kurum}) == kurum
        assert _kurum_adi_mi(kurum) is True

    def test_kisi_adi_kurum_sanilmaz(self):
        assert _kurum_adi_mi("Mehmet Demir") is False


class TestKapanisKuyruguKirp:
    def test_sondaki_bagimsiz_kapanis_kirpilir(self):
        # Kullanıcının ekranındaki gerçek desen: gövde + "Gereğinin yapılması arz olunur."
        govde = ("Ekte sunulan faturada belirtilen bedelin ödenmesi uygun görülmüştür. "
                 "Gereğinin yapılması arz olunur.")
        assert _kapanis_kuyrugu_kirp(govde) == (
            "Ekte sunulan faturada belirtilen bedelin ödenmesi uygun görülmüştür.")

    @pytest.mark.parametrize("kuyruk", [
        "Gereğini arz ederim.", "Gereğini rica ederim.", "Bilgilerinize arz ederim.",
        "Gereğini bilgilerinize arz ederim.", "Olurlarınıza arz ederim.",
        "Bilgilerine arz olunur.",
    ])
    def test_tum_kapanis_kaliplari_kirpilir(self, kuyruk):
        assert _kapanis_kuyrugu_kirp(f"Konu incelenmiştir. {kuyruk}") == "Konu incelenmiştir."

    def test_cumle_ortasi_ifadeye_dokunulmaz(self):
        # "hususunda gereğini arz ederim" AYNI cümlenin parçası → kırpılmaz
        govde = "İşlemlerin yapılması hususunda gereğini arz ederim."
        assert _kapanis_kuyrugu_kirp(govde) == govde

    def test_tamami_kapanis_ise_dokunulmaz(self):
        # Gövdenin tamamı tek kapanış cümlesi → boş gövde üretme, olduğu gibi bırak
        assert _kapanis_kuyrugu_kirp("Gereğini arz ederim.") == "Gereğini arz ederim."


class TestFaturaUcaUca:
    async def test_fatura_taslagi_mali_birime_ust_yazi(self):
        # Arrange — kullanıcının ekranındaki senaryo: fatura ödeme talebi
        from agents.nodes.yazi_taslak import yazi_taslak_node
        state = {
            "evrak_turu": "fatura", "hedef_birim": "mali_strateji_sgb",
            "bilgi_unsurlari": {"konu": "Kırtasiye alımı fatura bedelinin ödenmesi",
                                "gonderen": "Gazi Üniversitesi Rektörlüğü",
                                "tarih": "14.06.2026", "sayi": "E-15903742-841-2026/1156"},
            "evrak_text": "fatura bedelinin ödenmesi hususunda gereğini arz ederim.",
        }
        # Act
        out = await yazi_taslak_node(state)
        md = out["yazi_taslak_md"]
        # Assert — İLETİM üst yazısı: muhatap MALİ BİRİM; gönderen kuruma "cevap" YOK
        assert out["yazi_turu"] == "ust_yazi"
        assert "[Birim seçilecek — öneri: Strateji Geliştirme / Mali İşler]" in md  # kaba kategori birim ADI değildir (Yön. m.14): yalnız açık
        # yer tutucu içinde öneri olarak görünür (yazi.baslik, teşhis 2026-10-05)
        assert "Sayın Gazi Üniversitesi" not in md   # hatalı hitap asla
        # gövde/kapanış çift "arz ederim" içermez (aynı kalıp 2 kez alt alta değil)
        assert md.count("Gereğini arz ederim.") <= 1
