"""Canlı keşifle bulunup ELDEN doğrulanan 9 belediye — kaynak künyesi ve konu ayrımı.

Bu kurumlar `scripts/canli_kaynak_tara.py` ile bulundu: motor kurumun kendi resmî birim
sayfasını buldu, birimler `kurum_teskilat_cek.py` ile sayfadan birebir çıkarıldı, alt bilgi
ve sayfa başlığı artıkları elden ayıklandı, `kaynak_kaydet.py` ile manifeste (URL +
SHA-256 + tarih + yöntem) işlendi.

Keşif motoru bu zincirin yalnız İLK adımını hızlandırdı. Doğrulama zinciri değişmedi ve
bu dosya onu kilitler: kayıtlar `resmi_dogrulanmis` künyesi taşımalı, konuya göre DOĞRU
birimi vermeli ve kurumlar arasında sızıntı olmamalı.
"""
from __future__ import annotations

import pytest

from agents.resmi_kaynak import kaynak_ara, kurum_korpusta_var

# Dalgada doğrulanan kurumlar (slug, beklenen asgari birim sayısı).
DALGA = [
    ("seyhan-belediyesi", 40),
    ("mamak-belediyesi", 30),
    ("sisli-belediyesi", 30),
    ("maltepe-belediyesi", 30),
    ("umraniye-belediyesi", 28),
    ("van-buyuksehir-belediyesi", 28),
    ("cankaya-belediyesi", 28),
    ("pendik-belediyesi", 20),
    ("kahramanmaras-buyuksehir-belediyesi", 18),
]

# (kurum, konu, beklenen birim) — ölçüldü 2026-08-06, 11/11 doğrulanmış kaynaktan.
KONU_BIRIM = [
    ("seyhan-belediyesi", "işyeri kaynaklı gürültü şikâyeti ve çevresel ölçüm",
     "Çevre Koruma ve Kontrol Müdürlüğü"),
    ("sisli-belediyesi", "imar planı tadilatı başvurusu", "İmar ve Şehircilik Müdürlüğü"),
    ("cankaya-belediyesi", "park ve yeşil alan bakımı talebi", "Park ve Bahçeler Müdürlüğü"),
    ("mamak-belediyesi", "ruhsatsız işyeri denetimi ihbarı", "Ruhsat ve Denetim Müdürlüğü"),
    ("van-buyuksehir-belediyesi", "toplu taşıma hattı ve ulaşım talebi",
     "Ulaşım Dairesi Başkanlığı"),
    ("van-buyuksehir-belediyesi", "itfaiye ve yangın güvenliği ihbarı",
     "İtfaiye Dairesi Başkanlığı"),
    ("kahramanmaras-buyuksehir-belediyesi", "yol yapım bakım ve onarım talebi",
     "Yol Yapım, Bakım ve Onarım Dairesi Başkanlığı"),
    ("pendik-belediyesi", "sosyal yardım başvurusu", "Sosyal Hizmetler Müdürlüğü"),
    ("umraniye-belediyesi", "emlak ve istimlak işlemleri", "Emlak ve İstimlak Müdürlüğü"),
    ("maltepe-belediyesi", "kreş kaydı ve çocuk hizmetleri", "Kreş Müdürlüğü"),
]


def _kurum_kayitlari(slug: str) -> list[dict]:
    """Kurumun korpustaki TÜM birim kayıtları.

    Arama ile saymak yanlış olurdu: retrieval konuya göre süzer ve "müdürlük" gibi
    ayırt edici olmayan bir sorgu hiçbir şey döndürmez (ilk yazımda bu tuzağa düşüldü).
    Kapsam sorusu retrieval'a değil KORPUSA sorulmalı.
    """
    import json
    from pathlib import Path

    yol = Path(__file__).resolve().parents[2] / "data" / "teskilat" / "teskilat_index.json"
    veri = json.loads(yol.read_text(encoding="utf-8"))
    chunks = veri.get("chunks", veri) if isinstance(veri, dict) else veri
    return [c for c in chunks if c.get("kurum_slug") == slug]


@pytest.mark.parametrize("slug,asgari", DALGA)
class TestKorpusKaydi:
    def test_kurum_korpusta(self, slug: str, asgari: int) -> None:
        assert kurum_korpusta_var(slug), f"{slug} korpusta görünmüyor"

    def test_birim_sayisi_yeterli(self, slug: str, asgari: int) -> None:
        """Sayfa değişip liste daralırsa fark edilsin."""
        kayitlar = _kurum_kayitlari(slug)
        assert len(kayitlar) >= asgari, f"{slug}: {len(kayitlar)} birim (asgari {asgari})"

    def test_MANIFESTTE_url_ve_hash_ile_kayitli(self, slug: str, asgari: int) -> None:
        """Güven dosyanın konumundan değil, MANİFESTTEKİ parmak izinden gelir.

        Bu depoda dizine dayalı güven bir kez 1054 kurum için uydurma birim üretilmesine
        yol açmıştı (docs/11 §8). Kontrol bu yüzden doğrudan manifeste yapılır:
        resmî HTTPS kaynak + SHA-256 + doğrulayan + tarih + yöntem.
        """
        import json
        from pathlib import Path

        man_yolu = (Path(__file__).resolve().parents[2] / "data" / "teskilat"
                    / "kaynak_manifest.json")
        kayit = json.loads(man_yolu.read_text(encoding="utf-8"))["kaynaklar"].get(
            f"{slug}/birimler.txt")
        assert kayit, f"{slug} manifeste kaydedilmemiş"
        assert kayit["durum"] == "resmi_dogrulanmis"
        assert str(kayit["kaynak_url"]).startswith("https://")
        assert len(kayit["icerik_sha256"]) == 64
        assert kayit.get("dogrulayan") and kayit.get("dogrulama_yontemi")


@pytest.mark.parametrize("slug,konu,beklenen", KONU_BIRIM)
def test_konu_dogru_birime_gider(slug: str, konu: str, beklenen: str) -> None:
    """Hem SEÇİM hem KÜNYE aynı testte: doğru birim, doğrulanmış kaynaktan gelmeli.

    Künye ayrı bir testte sınanamaz — `kaynak_tipi`/`kaynak_guven` alanları korpus
    dosyasında değil, arama sırasında adapter tarafından eklenir. Yani sözleşme ancak
    gerçek arama yolunda görülebilir.
    """
    adaylar = kaynak_ara(slug, konu)
    assert adaylar, f"{slug}: hiç aday yok"
    ilk = adaylar[0]
    assert ilk["birim_ad"] == beklenen, (
        f"{slug} / {konu} → {ilk['birim_ad']} (beklenen {beklenen})"
    )
    # Manifest + SHA-256 olmadan üçlü grounding geçmez; künye zincirin kanıtıdır.
    assert ilk["kaynak_tipi"] == "kurum_ozel"
    assert ilk["kaynak_guven"] == "resmi_dogrulanmis"
    assert len(ilk.get("kaynak_sha256") or "") == 64


def test_kurumlar_arasi_sizinti_YOK() -> None:
    """Bir belediyenin birimi başka belediyenin cevabında çıkmamalı.

    Dalgadaki kurumların birim adları büyük ölçüde ortak ("Fen İşleri Müdürlüğü"), bu
    yüzden kontrol AD değil KAYNAK üzerinden yapılır: dönen her kaydın kurum_slug'ı
    sorulan kurum olmalı.
    """
    for slug, _asgari in DALGA:
        for aday in kaynak_ara(slug, "gürültü imar ulaşım sosyal yardım"):
            if aday.get("kaynak_tipi") == "kurum_ozel":
                assert aday.get("kurum_slug") == slug, (
                    f"{slug} sorgusunda {aday.get('kurum_slug')} kaydı döndü"
                )
