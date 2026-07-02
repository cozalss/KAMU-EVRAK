"""Taranmış-görünümlü SENTETİK evrak üreteci (S8 — OCR yeteneği kanıtı).

Şartname Görev 1.1 "OCR/metin okuma (taranmış + dijital)" ister; demo verisinin
tamamı temiz dijital metindi → OCR yolu hiç sergilenmiyordu. Bu script sentetik
evrak metinlerini METİN KATMANI OLMAYAN (salt görüntü) PDF'lere çevirir: hafif
eğim + gri zemin + nokta gürültüsü ile "tarayıcı çıktısı" görünümü. Yanına gold
.txt yazar → backend/eval/ocr_eval.py CER/WER ölçer.

Veri kuralı (şartname §6.5): içerik %100 kurgu — sahte isim/checksum-geçerli sahte
TCKN, gerçek kişi/kurum verisi YOK.

Kullanım:  python scripts/gen_taranmis.py   → data/synthetic/taranmis/*.pdf + *.gold.txt
Determinizm: sabit seed → aynı çıktı (CI/tekrar üretilebilirlik).
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CIKTI = ROOT / "data" / "synthetic" / "taranmis"
FONT_YOLU = ROOT / "data" / "fonts"

# A4 @ ~150dpi — OCR için yeterli çözünürlük, dosya boyutu küçük kalır.
SAYFA = (1240, 1754)
KENAR = 110
SATIR_YUK = 42

BELGELER: dict[str, str] = {
    "taranmis_dilekce": """T.C.
ANKARA VALİLİĞİ
İl Yazı İşleri Müdürlüğüne

Konu : Su baskını hasar tespiti talebi

Sayın Yetkili,

15.06.2026 tarihinde mahallemizde yaşanan sağanak sonrası bodrum katımda
su baskını meydana gelmiştir. 3071 sayılı Dilekçe Hakkının Kullanılmasına
Dair Kanun kapsamında hasar tespitinin yapılmasını ve tarafıma yazılı bilgi
verilmesini arz ederim. 25.06.2026

Ad Soyad : Ayşe Yılmaz
T.C. Kimlik No : 10000000146
Adres : Çankaya Mah. Kurgu Sok. No:7 Çankaya/Ankara
Telefon : 0555 123 45 67
İmza : (imzalı)""",
    "taranmis_bilgi_edinme": """T.C.
KOCAELİ BÜYÜKŞEHİR BELEDİYESİ
Bilgi Edinme Birimine

Konu : Bilgi edinme başvurusu

4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında, Bilişim Vadisi bağlantı
yolu projesinin güncel durumu ve ihale sonucuna ilişkin bilgi ve belgelerin
tarafıma verilmesini talep ederim. 20.06.2026

Ad Soyad : Mehmet Kurgu
T.C. Kimlik No : 10000000138
Adres : Kurgu Cad. No:12 İzmit/Kocaeli
İmza : (imzalı)""",
    "taranmis_fatura": """KURGU OFİS MALZEMELERİ A.Ş.
Fatura No : KRG-2026-0042            Tarih : 18.06.2026

Sayın KAMU KURUMU Destek Hizmetleri Dairesi,

Aşağıda dökümü verilen malzemelerin bedeli olan 12.450,00 TL'nin
5018 sayılı Kanun kapsamında tarafımıza ödenmesini rica ederiz.

1- A4 Fotokopi Kağıdı (200 paket)  .......  6.200,00 TL
2- Toner Kartuş (12 adet)          .......  6.250,00 TL

Yetkili : Zeynep Kurgu (imzalı)""",
}


def _font(boyut: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Repo fontu (IBM Plex Mono vb.) varsa onu, yoksa PIL varsayılanını kullan."""
    for aday in sorted(FONT_YOLU.glob("*.ttf")) + sorted(FONT_YOLU.glob("*.otf")):
        try:
            return ImageFont.truetype(str(aday), boyut)
        except OSError:
            continue
    return ImageFont.load_default()


def _tarama_efekti(img: Image.Image, rng: random.Random) -> Image.Image:
    """Hafif eğim + nokta gürültüsü — 'tarayıcı çıktısı' hissi (OCR'ı öldürmeden)."""
    px = img.load()
    for _ in range(2600):  # toz/benek
        x, y = rng.randrange(img.width), rng.randrange(img.height)
        g = rng.randrange(120, 210)
        px[x, y] = (g, g, g)
    img = img.rotate(rng.uniform(-1.1, 1.1), expand=False, fillcolor=(233, 230, 224))
    return img


def uret(ad: str, metin: str, rng: random.Random) -> None:
    img = Image.new("RGB", SAYFA, (238, 235, 229))  # hafif gri-krem tarama zemini
    ciz = ImageDraw.Draw(img)
    font = _font(26)
    y = KENAR
    for satir in metin.splitlines():
        ciz.text((KENAR, y), satir, fill=(28, 26, 24), font=font)
        y += SATIR_YUK
    img = _tarama_efekti(img, rng)
    CIKTI.mkdir(parents=True, exist_ok=True)
    # PIL "PDF" kaydı görüntüyü gömer → METİN KATMANI YOK → OCR yolu zorunlu tetiklenir.
    img.save(CIKTI / f"{ad}.pdf", "PDF", resolution=150.0)
    (CIKTI / f"{ad}.gold.txt").write_text(metin, encoding="utf-8")
    print(f"  {ad}.pdf + {ad}.gold.txt")


def main() -> None:
    rng = random.Random(42)
    print(f"Taranmis sentetik evrak -> {CIKTI}")  # ASCII: Windows cp1254 konsol uyumu
    for ad, metin in BELGELER.items():
        uret(ad, metin, rng)


if __name__ == "__main__":
    main()
