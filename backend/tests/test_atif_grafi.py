"""GraphRAG-lite atıf grafiği testleri (S7) — 'sayılı'-çapalı atıf çıkarımı + 1-hop genişletme."""

from __future__ import annotations

from retrieval.atif_grafi import atif_ek_adaylar, atif_nolari


class TestAtifNolari:
    def test_sayili_kalibi_yakalanir(self):
        # Arrange / Act / Assert
        assert atif_nolari("3071 sayılı Kanun ve 4982 SAYILI Kanun uyarınca") == {"3071", "4982"}

    def test_ciplak_yil_atif_sayilmaz(self):
        # "2020" yıl, "1500" tutar — 'sayılı' çapası olmadan atıf DEĞİL (yanlış-pozitif koruması)
        assert atif_nolari("10.06.2020 tarihinde 1500 TL ödendi") == set()

    def test_sdp_genelgesi_yakalanir(self):
        assert atif_nolari("Standart Dosya Planı (2005/7) uygulanır") == {"2005-7"}


def _chunk(mevzuat, madde, text=""):
    return {"mevzuat": mevzuat, "madde_no": madde, "text": text}


class TestAtifEkAdaylar:
    def test_atif_verilen_mevzuattan_ek_aday(self):
        # Arrange — top: 7201 maddesi 3071'e atıf veriyor; havuzda 3071 chunk'ı var
        top = [(10.0, _chunk("7201 Tebligat Kanunu", 1, "3071 sayılı Kanun uyarınca tebliğ"))]
        havuz = [*top, (4.0, _chunk("3071 Dilekçe Hakkı Kanunu", 4, "dilekçede bulunması zorunlu"))]
        # Act
        ekler = atif_ek_adaylar(top, havuz)
        # Assert
        assert len(ekler) == 1
        assert ekler[0][1]["mevzuat"] == "3071 Dilekçe Hakkı Kanunu"

    def test_kendi_mevzuati_ek_sayilmaz(self):
        # Arrange — atıf kendi kanununa (7201) → genişletme YOK
        top = [(10.0, _chunk("7201 Tebligat Kanunu", 1, "7201 sayılı Kanun m.10"))]
        havuz = [*top, (4.0, _chunk("7201 Tebligat Kanunu", 10, "ikinci madde"))]
        # Act / Assert
        assert atif_ek_adaylar(top, havuz) == []

    def test_topta_olan_tekrar_eklenmez(self):
        # Arrange — atıf verilen chunk zaten top'ta
        c = _chunk("3071 Dilekçe Hakkı Kanunu", 4, "")
        top = [(10.0, _chunk("7201 Tebligat Kanunu", 1, "3071 sayılı Kanun")), (5.0, c)]
        havuz = top
        # Act / Assert
        assert atif_ek_adaylar(top, havuz) == []

    def test_k_ek_siniri_ve_no_basina_tek(self):
        # Arrange — iki farklı atıf + havuzda aynı kanundan iki chunk → no başına tek, en çok k_ek
        top = [(10.0, _chunk("7201 Tebligat Kanunu", 1, "3071 sayılı Kanun ve 4982 sayılı Kanun"))]
        havuz = [
            *top,
            (6.0, _chunk("3071 Dilekçe Hakkı Kanunu", 4, "")),
            (5.0, _chunk("3071 Dilekçe Hakkı Kanunu", 7, "")),
            (3.0, _chunk("4982 Bilgi Edinme Kanunu", 11, "")),
        ]
        # Act
        ekler = atif_ek_adaylar(top, havuz, k_ek=2)
        # Assert — 3071'den yalnız en yüksek skorlu (m.4) + 4982
        assert [(e[1]["mevzuat"], e[1]["madde_no"]) for e in ekler] == [
            ("3071 Dilekçe Hakkı Kanunu", 4), ("4982 Bilgi Edinme Kanunu", 11)]

    def test_bos_top_bos_doner(self):
        assert atif_ek_adaylar([], []) == []
