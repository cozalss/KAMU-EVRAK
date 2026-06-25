"""Resmî yazı render girdi/çıktı modelleri — immutable dataclass'lar.

ADALET `dilekce/models.py` deseninden ADAPT: `DilekceContext`/`DilekceResult`
(hukuk: Domain/Citation) yerine kamu-evrak resmî yazı bağlamı (Yön. 2646
zorunlu unsurları: idare/birim/sayı/tarih/konu/muhatap/ilgi/metin/imza).

SIFIR UYDURMA (CLAUDE.md §1): YaziContext yalnız evraktan ÇIKARILAN veya
heuristik/LLM ile RESMÎ ÜSLUBA çevrilen alanlardan kurulur. Eksik alanlar
template'te `{{ ALAN }}` placeholder olarak kalır — sahte DETSİS/SDP/TC YAZILMAZ.
Render aşamasında LLM çağrılmaz (jinja2 string interpolation deterministiktir);
metin gövdesi node tarafında üretilip `metin` alanına konur.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class YaziContext:
    """Resmî yazı render'ı için doğrulanmış girdi paketi (Yön. 2646 unsurları).

    Tüm string alanlar opsiyonel: boş bırakılan alan template'te
    `{{ ... }}` placeholder olarak kalır (uydurma yok). `metin` gövdesi
    node tarafında (LLM veya deterministik şablon) üretilir.

    Args:
        yazi_turu: YAZI_TURLERI'nden biri (ust_yazi/cevabi_yazi/bilgilendirme/olur).
        konu: Yazının konusu (Yön. m.13 — nokta ile bitmez).
        metin: Gövde metni (giriş/gelişme/sonuç) — node üretir.
        muhatap: Hedef makam (Yön. m.14). bilgilendirme'de "Dağıtım yerlerine".
        ilgi_tarih / ilgi_sayi: Cevabi yazıda atıf yapılan belge (Yön. m.15).
        kapanis: Hiyerarşiye göre "Gereğini arz/rica ederim." vb. (Yön. m.16).
        idare_adi / birim_adi: Antet (Yön. m.10) — bilinmiyorsa placeholder.
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
    kapanis: str = ""
    idare_adi: str = ""
    birim_adi: str = ""
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

        Boş string alanlar SÖZLÜĞE KONMAZ → jinja `| default(...)` placeholder'a
        düşer (lenient Undefined). Bu, ham `{{ KONU }}` gibi placeholder'ların
        template'te görünmesini sağlar (CLAUDE.md — uydurma yok).
        """
        out: dict[str, Any] = {"tarih": self.tarih, "yazi_turu": self.yazi_turu}
        scalar_fields = (
            "konu", "metin", "muhatap", "ilgi_tarih", "ilgi_sayi", "kapanis",
            "idare_adi", "birim_adi", "detsis", "sdp", "kayit_no",
            "ad_soyad", "unvan",
        )
        for name in scalar_fields:
            val = getattr(self, name)
            if val:
                out[name] = val
        if self.ekler:
            out["ekler"] = list(self.ekler)
        if self.dagitim:
            out["dagitim"] = self.dagitim
            if self.dagitim.get("bilgi"):
                out["dagitim_bilgi"] = self.dagitim["bilgi"]
        # olur türüne özgü alanlar (teklif_eden/onay_makami/talep vb.)
        for key, val in self.olur_alanlari.items():
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
