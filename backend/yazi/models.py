"""Resmî yazı render girdi/çıktı modelleri — immutable dataclass'lar.

ADALET `dilekce/models.py` deseninden ADAPT: `DilekceContext`/`DilekceResult`
(hukuk: Domain/Citation) yerine kamu-evrak resmî yazı bağlamı (Yön. 2646
zorunlu unsurları: idare/birim/sayı/tarih/konu/muhatap/ilgi/metin/imza).

SIFIR UYDURMA (CLAUDE.md §1): YaziContext yalnız evraktan ÇIKARILAN veya
heuristik/LLM ile RESMÎ ÜSLUBA çevrilen alanlardan kurulur. Eksik alanlar
jüri demosunda Jinja placeholder olarak gösterilmez; sahte DETSİS/SDP/TC yerine
nötr taslak/EBYS/yetkili makam ifadeleri kullanılır.
Render aşamasında LLM çağrılmaz (jinja2 string interpolation deterministiktir);
metin gövdesi node tarafında üretilip `metin` alanına konur.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


_DEMO_DEFAULTS: dict[str, str] = {
    "idare_adi": "KAMU KURUMU",
    "birim_adi": "YAZI İŞLERİ BİRİMİ",
    "sayi_satiri": "EBYS-TASLAK",
    "konu": "Başvuru değerlendirmesi",
    "metin": "Konuya ilişkin gerekli değerlendirme yapılmıştır.",
    "ad_soyad": "Yetkili İmza",
    "unvan": "Birim Yetkilisi",
    "teklif_eden": "Hazırlayan Birim",
    "teklif_unvan": "Birim Yetkilisi",
    "onay_makami": "Onay Makamı",
    "onay_unvan": "Yetkili Makam",
}


def _demo_muhatap(yazi_turu: str) -> str:
    if yazi_turu == "bilgilendirme":
        return "Dağıtım yerlerine"
    return "İlgili Makama"


def _demo_ilgi_satiri(tarih: str, sayi: str) -> str:
    tarih = tarih.strip()
    sayi = sayi.strip()
    if tarih and sayi:
        return f"{tarih} tarihli ve {sayi} sayılı yazınız."
    if tarih:
        return f"{tarih} tarihli başvurunuz."
    if sayi:
        return f"{sayi} sayılı başvurunuz."
    return "Başvurunuz."


@dataclass(frozen=True)
class YaziContext:
    """Resmî yazı render'ı için doğrulanmış girdi paketi (Yön. 2646 unsurları).

    Tüm string alanlar opsiyonel: boş bırakılan alanlar render sırasında
    demo-güvenli taslak ifadeleriyle tamamlanır (uydurma yok). `metin` gövdesi
    node tarafında (LLM veya deterministik şablon) üretilir.

    Args:
        yazi_turu: YAZI_TURLERI'nden biri (ust_yazi/cevabi_yazi/bilgilendirme/olur).
        konu: Yazının konusu (Yön. m.13 — nokta ile bitmez).
        metin: Gövde metni (giriş/gelişme/sonuç) — node üretir.
        muhatap: Hedef makam (Yön. m.14). bilgilendirme'de "Dağıtım yerlerine".
        ilgi_tarih / ilgi_sayi: Cevabi yazıda atıf yapılan belge (Yön. m.15).
        ilgi_satirlari: Çok-ilgili belge için hazır "a) ... b) ..." satırları
            (verilirse ilgi_tarih/ilgi_sayi yerine bunlar render edilir).
        kapanis: Hiyerarşiye göre "Gereğini arz/rica ederim." vb. (Yön. m.16).
        idare_adi / birim_adi: Antet (Yön. m.10) — bilinmiyorsa nötr taslak değer.
        sayi_satiri: Hazır "E-DETSİS-SDP-KAYIT" sayı dizgesi (Yön. m.11). OUR
            yazının sayısı EBYS'ce atanır → genelde bilinmez → EBYS-TASLAK yazılır.
        ad_soyad / unvan: İmza bloğu (Yön. m.17).
        ekler / dagitim: Yön. m.18-19 (opsiyonel).
        olur_alanlari: olur türü için teklif_eden/onay_makami vb.
        tarih: ISO veya gg.aa.yyyy — render saatinde set edilir.
    """

    yazi_turu: str
    tarih: str
    konu: str = ""
    metin: str = ""
    muhatap: str = ""
    ilgi_tarih: str = ""
    ilgi_sayi: str = ""
    ilgi_satirlari: tuple[str, ...] = ()
    kapanis: str = ""
    idare_adi: str = ""
    birim_adi: str = ""
    sayi_satiri: str = ""
    detsis: str = ""
    sdp: str = ""
    kayit_no: str = ""
    ad_soyad: str = ""
    unvan: str = ""
    ekler: tuple[str, ...] = ()
    dagitim: dict[str, list[str]] | None = None
    olur_alanlari: dict[str, str] = field(default_factory=dict)

    def jinja_vars(self) -> dict[str, Any]:
        """Template'e geçecek değişken sözlüğü.

        Boş string alanlar jüri demosunda Jinja placeholder olarak görünmesin diye
        nötr taslak değerlerle doldurulur. Bu değerler sahte DETSİS/kişi/kurum
        numarası değildir; EBYS veya yetkili makam tarafından tamamlanacak slotu
        görünür ve resmî format içinde tutar.
        """
        out: dict[str, Any] = {"tarih": self.tarih, "yazi_turu": self.yazi_turu}
        scalar_fields = (
            "konu", "metin", "muhatap", "ilgi_tarih", "ilgi_sayi", "kapanis",
            "idare_adi", "birim_adi", "sayi_satiri", "detsis", "sdp", "kayit_no",
            "ad_soyad", "unvan",
        )
        for name in scalar_fields:
            val = getattr(self, name)
            if not val:
                if name == "muhatap" and self.yazi_turu != "olur":
                    val = _demo_muhatap(self.yazi_turu)
                else:
                    val = _DEMO_DEFAULTS.get(name, "")
            if val:
                out[name] = val
        if self.ilgi_satirlari:
            out["ilgi_satirlari"] = list(self.ilgi_satirlari)
        elif self.yazi_turu in {"cevabi_yazi", "ust_yazi"}:
            out["ilgi_satirlari"] = [_demo_ilgi_satiri(self.ilgi_tarih, self.ilgi_sayi)]
        if self.ekler:
            out["ekler"] = list(self.ekler)
        if self.dagitim:
            out["dagitim"] = self.dagitim
            if self.dagitim.get("bilgi"):
                out["dagitim_bilgi"] = self.dagitim["bilgi"]
        # olur türüne özgü alanlar (teklif_eden/onay_makami/talep vb.)
        for key in ("teklif_eden", "teklif_unvan", "onay_makami", "onay_unvan", "talep", "uygun_gorus"):
            val = self.olur_alanlari.get(key, "")
            if not val:
                val = _DEMO_DEFAULTS.get(key, "")
            if val:
                out[key] = val
        return out


@dataclass(frozen=True)
class YaziResult:
    """Render çıktısı — markdown/metin kaynağı + PDF/DOCX bytes + audit metadata.

    DOCX, memur düzenleyebilsin diye PDF'e ek olarak üretilir (aynı metin
    kaynağından). bytes None ise o format istenmedi (formats kısıtı).
    """

    yazi_turu: str
    metin: str                          # render edilen düz-metin (state['yazi_taslak_md'])
    format_uyumlu: bool                 # zorunlu-alan checklist sonucu
    eksik_format_alanlari: tuple[str, ...] = ()
    pdf_bytes: bytes | None = None
    pdf_filename: str = ""
    docx_bytes: bytes | None = None
    docx_filename: str = ""


__all__ = ("YaziContext", "YaziResult")
