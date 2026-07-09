"""servis_birim — içerikten türetilen hizmet müdürlüğü önerisi (ADDITIVE) testleri.

Deterministik/saf: eşleşme yoksa None (uydurma yok). route_birim'e eklenen alanın
ölçülen hedef_birim'i DEĞİŞTİRMEDİĞİ de doğrulanır. AAA deseni.
"""

from __future__ import annotations

import pytest

from agents.servis_birim import oner_servis_birimi


class TestOnerServisBirimi:
    @pytest.mark.parametrize(("metin", "beklenen_kod"), [
        ("Sokağımızdaki çukurun onarılması ve asfalt dökülmesi", "fen_isleri"),
        ("Komşu parseldeki ruhsatsız yapı / kaçak yapı hakkında", "imar_sehircilik"),
        ("Gece geç saatte gürültü ve kaldırım işgali şikâyeti", "zabita"),
        ("Fazla tahakkuk eden su faturası ve sayaç itirazı", "su_kanalizasyon"),
        ("Mahalledeki çöp ve atık toplama düzensizliği", "temizlik_cevre"),
        ("İşyeri açma ve çalışma ruhsatı başvurusu", "ruhsat_denetim"),
        ("Toplu taşıma otobüs sefer sıklığının artırılması", "ulasim"),
        ("Parktaki oyun grubu ve yeşil alan bakımı", "park_bahce"),
    ])
    def test_icerik_dogru_mudurluge_esler(self, metin, beklenen_kod):
        # Act
        sonuc = oner_servis_birimi(metin)
        # Assert
        assert sonuc is not None
        assert sonuc["kod"] == beklenen_kod
        assert sonuc["ad"]  # insan-okunur ad dolu
        assert isinstance(sonuc["sinyal"], list) and sonuc["sinyal"]  # tetikleyen anahtarlar

    def test_eslesme_yoksa_none_uydurma_yok(self):
        # Arrange — saf hukuk/dava metni; hiçbir hizmet-müdürlüğü anahtarı yok
        metin = "Mahkeme ara kararı gereği savunma ve işlem dosyasının gönderilmesi rica olunur."
        # Act + Assert
        assert oner_servis_birimi(metin) is None

    def test_bos_metin_none(self):
        assert oner_servis_birimi("") is None
        assert oner_servis_birimi(None) is None  # type: ignore[arg-type]

    def test_sinyal_en_fazla_uc(self):
        # Arrange — çok sayıda fen-işleri anahtarı içeren metin
        metin = "çukur asfalt yol onarımı kaldırım bordür altyapı kazı"
        # Act
        sonuc = oner_servis_birimi(metin)
        # Assert — sinyal listesi kısa tutulur (UI ipucu)
        assert sonuc is not None and len(sonuc["sinyal"]) <= 3


class TestRouteBirimAdditive:
    async def test_route_birim_servis_ekler_hedefi_degistirmez(self):
        # Arrange — belediyeye çukur onarımı dilekçesi (bilinen tür → deterministik hedef)
        from agents.config import EVRAK_TO_BIRIM
        from agents.nodes.route_birim import route_birim_node
        state = {"evrak_turu": "dilekce", "evrak_text": "Sokaktaki çukurun asfaltla onarılması talebi."}
        # Act
        out = await route_birim_node(state)
        # Assert — ölçülen hedef config ile AYNI (additive katman bozmadı) + servis eklendi
        assert out["hedef_birim"] == EVRAK_TO_BIRIM["dilekce"]
        assert out["servis_birimi"]["kod"] == "fen_isleri"

    async def test_route_birim_eslesme_yoksa_servis_alani_yok(self):
        # Arrange — saf kurum→kurum yazı (hizmet-müdürlüğü sinyali yok)
        from agents.nodes.route_birim import route_birim_node
        state = {"evrak_turu": "ust_yazi", "evrak_text": "Adres kayıt sistemi güncelleme çalışmaları hakkında."}
        # Act
        out = await route_birim_node(state)
        # Assert — servis_birimi hiç eklenmez (uydurma yok)
        assert "servis_birimi" not in out
        assert out["hedef_birim"]  # ölçülen hedef yine üretilir
