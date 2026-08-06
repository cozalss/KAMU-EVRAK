"""Büyükşehir su ve kanalizasyon idareleri — 2560 sayılı Kanundan doğrulanmış teşkilat.

Burada kilitlenen şey KAPSAM SINIRI ve UYDURMAMA disiplinidir:

  · 2560 m.12 daire başkanlıklarını SAYMAZ ("hizmetin gerektirdiği sayıda Daire Başkanlığı,
    Müdürlük ... teşekkül eder"). Bu dosyaların önceki sürümü 7 daire adı sayıyor ve kendi
    künyesinde "TİPİK şablondur" diye itiraf ediyordu. O adlar geri gelmemelidir — geri
    gelirlerse kaynağı olmayan bir adrese evrak yönlendiririz.
  · m.10'daki denetçiler KİŞİdir (iki denetçi, Genel Kurula rapor verir), yazışma birimi
    değildir; birim olarak listelenmemelidir.
  · Kapsam Ek Madde 4'tür: "Bu Kanun diğer Büyükşehir Belediyelerinde de uygulanır." Otuz
    büyükşehrin tamamı kapsamdadır; büyükşehir olmayan il bu kanuna tabi değildir.
"""
from __future__ import annotations

import pytest

from agents.nodes.teskilat_ara import teskilat_birim_ara
from core.kaynak_guveni import RESMI_DOGRULANMIS

# 2560'ın adıyla kurduğu birimler — m.3 organları + m.12'de atama usulü düzenlenenler.
KANUNI_BIRIMLER = frozenset({
    "Genel Müdürlük",
    "Yönetim Kurulu",
    "Genel Kurul",
    "Teftiş ve Kontrol Kurulu Başkanlığı",
    "1'inci Hukuk Müşavirliği",
})

# Önceki (kaynaksız) sürümde sayılan ve KALDIRILAN daire adları.
KALDIRILAN_UYDURMA = (
    "Abone İşleri Dairesi Başkanlığı",
    "Su İşletme Dairesi Başkanlığı",
    "Kanalizasyon Dairesi Başkanlığı",
    "Atıksu Arıtma Dairesi Başkanlığı",
    "Yatırım ve İnşaat Dairesi Başkanlığı",
    "Emlak ve İstimlak Dairesi Başkanlığı",
)

TUM_IDARELER = (
    "adana-aski", "aski", "asat", "aydin-aski", "baski", "buski", "deski", "diski",
    "erzurum-eski", "eskisehir-eski", "gaski", "hatsu", "iski", "isu", "izsu",
    "kahramanmaras-kaski", "kayseri-kaski", "koski", "malatya-maski", "manisa-maski",
    "marsu", "meski", "muski", "oski", "sakarya-saski", "samsun-saski", "suski",
    "teski", "tiski", "vaski",
)

# Konu → kanunun o konuyu bağladığı birim. Ayrım kanunun KENDİ iş bölümünden gelir.
KONU_BIRIM = (
    ("su faturama itiraz ediyorum, tarife yanlış hesaplanmış", "Genel Müdürlük"),
    ("kanalizasyon tıkandı, foseptik taşıyor", "Genel Müdürlük"),
    ("inşaat ruhsatı için su ve kanalizasyon durum belgesi", "Genel Müdürlük"),
    ("kamulaştırma işleminin karara bağlanması", "Yönetim Kurulu"),          # m.9/f
    ("beş yıllık yatırım planının karara bağlanması", "Genel Kurul"),        # m.6/a
    ("müfettiş incelemesi ve personel hakkında soruşturma", "Teftiş ve Kontrol Kurulu Başkanlığı"),
    ("idare aleyhine açılan davanın takibi ve hukuki görüş", "1'inci Hukuk Müşavirliği"),
)


def _birimler(slug: str, konu: str, top_k: int = 10) -> list[dict]:
    return teskilat_birim_ara(slug, konu, top_k=top_k)


class TestKapsam:
    @pytest.mark.parametrize("slug", TUM_IDARELER)
    def test_her_idare_dogrulanmis_birim_dondurur(self, slug: str) -> None:
        adaylar = _birimler(slug, "su ve kanalizasyon hizmeti talebi")
        assert adaylar, slug
        assert adaylar[0]["kaynak_guven"] == RESMI_DOGRULANMIS, (slug, adaylar[0])

    def test_otuz_idare_kapsamda(self) -> None:
        """Ek Madde 4 kapsamı = 30 büyükşehir. Sayı kayarsa kapsam sessizce değişmiş demektir."""
        assert len(TUM_IDARELER) == 30
        assert len(set(TUM_IDARELER)) == 30


class TestUydurmaGeriGelmez:
    @pytest.mark.parametrize("slug", ("iski", "aski", "izsu", "asat", "buski"))
    def test_kaynaksiz_daire_adlari_listelenmez(self, slug: str) -> None:
        """Kanun daire başkanlıklarını saymadığı için hiçbiri korpusta olmamalı.

        Sorgu bilerek o dairelerin KENDİ konularıyla yapılır; adlar hâlâ dosyada olsaydı
        en yüksek skoru bunlar alırdı.
        """
        adaylar = _birimler(slug, "abone işleri, atıksu arıtma, emlak istimlak, yatırım inşaat")
        adlar = {a["birim_ad"] for a in adaylar}
        for uydurma in KALDIRILAN_UYDURMA:
            assert uydurma not in adlar, (slug, uydurma)

    def test_yalnizca_kanuni_birimler_var(self) -> None:
        """Şablonun ürettiği TÜM birim kümesi, kanunun adıyla kurduğu kümeye eşit olmalı."""
        bulunan: set[str] = set()
        for konu, _ in KONU_BIRIM:
            for a in _birimler("iski", konu):
                if a["kaynak_guven"] == RESMI_DOGRULANMIS:
                    bulunan.add(a["birim_ad"])
        assert bulunan == KANUNI_BIRIMLER, bulunan

    def test_denetciler_birim_olarak_yazilmaz(self) -> None:
        """m.10 denetçileri KİŞİ olarak düzenler; birim değildir."""
        adaylar = _birimler("iski", "denetçi raporu ve denetim")
        assert not any("Denetçi" in a["birim_ad"] for a in adaylar)


class TestKanuniIsBolumu:
    @pytest.mark.parametrize("konu,beklenen", KONU_BIRIM)
    def test_konu_kanunun_bagladigi_birime_gider(self, konu: str, beklenen: str) -> None:
        adaylar = _birimler("iski", konu, top_k=1)
        assert adaylar, konu
        assert adaylar[0]["birim_ad"] == beklenen, (konu, adaylar[0]["birim_ad"])
        assert adaylar[0]["kaynak_guven"] == RESMI_DOGRULANMIS
