"""Teşkilat aramasının puanlama ve önbellek değişmezleri.

İki ölçülmüş hata burada kilitlenir:

1. BM25 ÖNBELLEĞİ KİMLİKLE ANAHTARLANIYORDU. `_bm25_model` memo'su `id(chunks)` kullanıyordu
   ve bu, tuple'ın bellekte yaşamasına bağlıydı. `_slug_chunks` lru_cache'li olduğu için o
   yolda tutuyordu; ama `_resmi_slug_chunks` ile mevzuat şablonu genişletmesi HER ÇAĞRIDA
   yeni tuple kuruyor. Geçici tuple serbest kalınca CPython aynı adresi yeniden kullanıyor,
   `id()` çakışıyor ve önbellek BAŞKA bir kurumun modelini döndürüyordu. Chunk sayıları
   farklıysa IndexError; AYNIYSA sessizce yanlış puanlama — bir kurumun sorgusu başka
   kurumun terim istatistikleriyle skorlanıyordu.

2. BİRİM ADI GÖVDE İÇİNDE ERİYORDU. Ad, birimin ne işe baktığının en yoğun ifadesidir ama
   yüzlerce karakterlik görev metninin yanında BM25'te kayboluyordu. Ölçüldü: "vergi borcu
   tahsilatı ve ihtilaf" sorgusu "Tahsilat ve İhtilaflı İşler Daire Başkanlığı" yerine
   "Avrupa Birliği ve Dış İlişkiler Daire Başkanlığı"na gidiyordu — doğru birimin ADINDAKİ
   iki ayırt edici kelime Türkçe çekim eki yüzünden (tahsilatı/tahsilat, ihtilaf/ihtilaflı)
   yalnız KÖK eşleşiyor ve BM25'ten 0 alıyorken, yanlış birim görev metnindeki sıradan bir
   kelimeden ("vergi") tam eşleşme puanı topluyordu.
"""
from __future__ import annotations

from agents.nodes.teskilat_ara import (
    _bm25_anahtar,
    _resmi_slug_chunks,
    teskilat_birim_ara,
)


class TestBm25OnbellekAnahtari:
    def test_ayni_icerik_yeni_tuple_ayni_anahtar(self) -> None:
        """Önbellek işe yaramalı: aynı chunk kümesi yeniden kurulunca aynı anahtara düşer."""
        a = _resmi_slug_chunks("gelir-idaresi-baskanligi")
        b = tuple(list(a))            # yeni tuple nesnesi, aynı içerik
        assert a is not b
        assert _bm25_anahtar(a) == _bm25_anahtar(b)

    def test_farkli_kurum_farkli_anahtar(self) -> None:
        """Asıl koruma: iki farklı kurumun chunk'ları asla aynı modeli paylaşmaz."""
        a = _resmi_slug_chunks("gelir-idaresi-baskanligi")
        b = _resmi_slug_chunks("meteoroloji-genel-mudurlugu")
        assert a and b
        assert _bm25_anahtar(a) != _bm25_anahtar(b)

    def test_anahtar_id_ye_bagli_degil(self) -> None:
        """Aynı id'yi geri kullanan geçici tuple'lar farklı içerikte farklı anahtar üretmeli."""
        anahtarlar = set()
        for slug in ("iski", "sayistay", "kadikoy-belediyesi", "emniyet-genel-mudurlugu"):
            gecici = tuple(c for c in _resmi_slug_chunks(slug))   # her turda yeni nesne
            anahtarlar.add(_bm25_anahtar(gecici))
        assert len(anahtarlar) == 4

    def test_cok_kurumlu_ardisik_arama_cokmez(self) -> None:
        """id-çakışmasının uçtan uca belirtisi: sıralı çok-kurum sorgusu IndexError veriyordu."""
        sluglar = (
            "iski", "aski", "sayistay", "yargitay", "danistay", "anayasa-mahkemesi",
            "kadikoy-belediyesi", "konak-belediyesi", "emniyet-genel-mudurlugu",
            "diyanet-isleri-baskanligi", "sosyal-guvenlik-kurumu", "gelir-idaresi-baskanligi",
            "meteoroloji-genel-mudurlugu", "vakiflar-genel-mudurlugu", "cankaya-belediyesi",
        )
        for slug in sluglar:
            teskilat_birim_ara(slug, "evrak kayıt ve havale işlemi", top_k=3)

    def test_ayni_sorgu_tekrarinda_sonuc_kaymaz(self) -> None:
        """Önbellek kirlenirse aynı sorgu farklı cevap verirdi."""
        ilk = [a["birim_ad"] for a in teskilat_birim_ara("iski", "su arızası", top_k=3)]
        for _ in range(4):
            # araya başka kurumlar girsin ki geçici tuple'lar serbest kalsın
            teskilat_birim_ara("sayistay", "denetim raporu", top_k=3)
            teskilat_birim_ara("kadikoy-belediyesi", "ruhsat", top_k=3)
        assert [a["birim_ad"] for a in teskilat_birim_ara("iski", "su arızası", top_k=3)] == ilk


class TestBirimAdiSinyali:
    def test_addaki_ayirt_edici_kelime_govdedeki_siradan_kelimeyi_yener(self) -> None:
        """Ölçülen hata: doğru birim ilk dörde bile giremiyordu."""
        adaylar = teskilat_birim_ara(
            "gelir-idaresi-baskanligi", "vergi borcu tahsilatı ve ihtilaf", top_k=1
        )
        assert adaylar
        assert adaylar[0]["birim_ad"] == "Tahsilat ve İhtilaflı İşler Daire Başkanlığı"

    def test_turkce_cekim_eki_eslesmeyi_bozmaz(self) -> None:
        """Sorgu ve ad farklı çekimde olsa da birim bulunmalı."""
        for konu, beklenen in (
            ("kadastro sınırı", "Kadastro Dairesi Başkanlığı"),
            ("arşivden kayıt örneği", "Arşiv Dairesi Başkanlığı"),
        ):
            adaylar = teskilat_birim_ara("tapu-ve-kadastro-genel-mudurlugu", konu, top_k=1)
            assert adaylar and adaylar[0]["birim_ad"] == beklenen, (konu, adaylar)

    def test_ad_agirligi_govde_sinyalini_ezmiyor(self) -> None:
        """Ad bonusu, görev metninden gelen gerçek eşleşmeyi bastırmamalı.

        "zirai don" ifadesi hiçbir birim ADINDA geçmez; yalnız görev metninde geçer.
        Ad ağırlığı fazla büyütülürse bu tür sorgular kayar (1.3'te ölçüldü).
        """
        adaylar = teskilat_birim_ara(
            "meteoroloji-genel-mudurlugu", "zirai don raporu ve iklim verisi", top_k=1
        )
        assert adaylar
        assert adaylar[0]["birim_ad"] == "İklim ve Zirai Meteoroloji Dairesi Başkanlığı"
