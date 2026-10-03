"""EYP 2.0-uyumlu elektronik yazışma paketi İSKELETİ (e-Yazışma Teknik Rehberi S2.0).

YENİLİKÇİLİK/TİCARİLEŞME GEREKÇESİ: Kamu kurumları arası resmî yazışma EYP
(Elektronik Yazışma Paketi) formatıyla taşınır (CBDDO e-Yazışma Projesi; EYP 2.0
Teknik Rehberi, Ağustos 2020). Bu modül Görev 2 çıktısını EBYS'ye DOĞRUDAN
girebilecek pakete hazırlar: Üst Yazı + üstveri + EYP 2.0'ın zorunlu kıldığı
SHA-512 + ikinci özet algoritmalı Nihai Özet bileşeni.

DÜRÜSTLÜK SINIRI (uydurma yok):
  - Bu bir İSKELETTİR: resmî XSD şemasıyla birebir XML üretimi ve e-imza/e-mühür,
    üretim entegrasyonunda CBDDO'nun açık kaynak e-Yazışma API'lerine (Java/.NET)
    bırakılır — paket içindeki BENIOKU.txt bunu açıkça söyler.
  - İmza bileşeni HİÇ üretilmez (sahte imza yok): imza_bilgisi.durum = IMZASIZ-TASLAK.
  - Üstveri alan adları Türkçe/JSON'dur; EYP bileşen KAVRAMLARIYLA (ÜstYazı, Üstveri,
    BelgeHedef, NihaiÖzet) hizalanır ama resmî şema iddiası taşımaz.

Deterministik + saf stdlib (zipfile/json/hashlib) → mock/CI'da birebir çalışır.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from datetime import UTC, datetime
from typing import Any

# arsiv._sdp_secimi ana-hizmet kodlarına insan-inceleme işareti ekler; EBYS üstverisine
# HAM işaret girmez — kod temizlenir, işaret ayrı 'dogrulama_gerekli' bayrağına çevrilir.
_DOGRULA_RE = re.compile(r"\s*\[DOĞRULA:[^\]]*\]")

BENIOKU = """EYP 2.0 UYUMLU YAZIŞMA PAKETİ — TASLAK İSKELETİ
================================================

Bu paket, kamu-evrak ajanının ürettiği resmî yazı taslağını e-Yazışma
Teknik Rehberi (EYP 2.0, CBDDO) bileşen yapısına hizalı olarak dışa aktarır:

  UstYazi/          Üst yazı (PDF varsa PDF, yoksa düz metin taslak)
  Ustveri.json      Belge üstverisi (konu, tür, SDP dosya planı kodu, dağıtım)
  NihaiOzet.json    Bütünlük özetleri — SHA-512 + ikinci algoritma (EYP 2.0 gereği)
  BENIOKU.txt       Bu dosya

ÖNEMLİ — İMZA/MÜHÜR: Paket İMZASIZ TASLAKTIR. Elektronik imza (5070) ve kurum
e-mühürü, üretim entegrasyonunda CBDDO'nun açık kaynak e-Yazışma API'leri
(Java/.NET) veya kurum EBYS'si üzerinden eklenir. Resmî XSD şemalı Ustveri.xml
üretimi de aynı entegrasyon noktasına bırakılmıştır (şema iddiası taşınmaz).

Örnek içerik SENTETİKTİR (gerçek kamu verisi kullanılmaz).
"""


def _ozet(veri: bytes) -> dict[str, str]:
    """EYP 2.0 Nihai Özet: SHA-512 birincil + SHA-256 ikinci algoritma (rehber gereği çift özet)."""
    return {
        "algoritma": "SHA-512",
        "ozet_sha512": hashlib.sha512(veri).hexdigest(),
        "ikinci_algoritma": "SHA-256",
        "ozet_sha256": hashlib.sha256(veri).hexdigest(),
    }


def build_eyp_paket(meta: dict[str, Any], *, taslak_md: str = "",
                    pdf_bytes: bytes | None = None) -> bytes:
    """Üst yazı + üstveri + nihai özetten in-memory EYP iskelet ZIP'i üret.

    meta: {konu, yazi_turu, sdp_kodu, sdp_adi, hedef_birim, ilgi_tarih, ilgi_sayi, filename}
    — hepsi opsiyonel; boşlar üstveride boş bırakılır (uydurulmaz).
    """
    if pdf_bytes:
        ust_yazi_ad, ust_yazi_veri = "UstYazi/resmi-yazi-taslak.pdf", pdf_bytes
    else:
        ust_yazi_ad = "UstYazi/resmi-yazi-taslak.txt"
        ust_yazi_veri = (taslak_md or "").encode("utf-8")

    ustveri = {
        "paket_tipi": "EYP-2.0-uyumlu-iskelet",
        "rehber": "e-Yazışma Teknik Rehberi Sürüm 2.0 (CBDDO, 2020-08)",
        "olusturma_zamani": datetime.now(UTC).isoformat(timespec="seconds"),
        "belge": {
            "konu": str(meta.get("konu") or ""),
            "belge_turu": str(meta.get("yazi_turu") or ""),
            "dil": "tur",
            "dosya_plani_kodu": _DOGRULA_RE.sub("", str(meta.get("sdp_kodu") or "")).strip(),
            "dosya_plani_adi": str(meta.get("sdp_adi") or ""),
            # Kod [DOĞRULA] işaretliyse (kuruma-özgü ana hizmet aralığı) EBYS operatörü
            # onaylamadan kullanılmamalı — işaret üstveriye bayrak olarak taşınır.
            "dosya_plani_dogrulama_gerekli": "[DOĞRULA" in str(meta.get("sdp_kodu") or ""),
        },
        "olusturan": {
            "kurum_adi": "KAMU KURUMU (sentetik demo)",
            "detsis_no": "",  # üretimde kurum DETSİS numarası (detsis.gov.tr)
        },
        "dagitim": [{"hedef": str(meta.get("hedef_birim") or ""), "amac": "Gereği"}]
        if meta.get("hedef_birim") else [],
        "ilgi": {
            "tarih": str(meta.get("ilgi_tarih") or ""),
            "sayi": str(meta.get("ilgi_sayi") or ""),
        },
        "imza_bilgisi": {
            "durum": "IMZASIZ-TASLAK",
            "not": "e-imza/e-mühür üretim entegrasyonunda eklenir (CBDDO e-Yazışma API).",
        },
        "kaynak_dosya": str(meta.get("filename") or ""),
    }
    nihai_ozet = {"bilesen": ust_yazi_ad, **_ozet(ust_yazi_veri)}

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(ust_yazi_ad, ust_yazi_veri)
        zf.writestr("Ustveri.json", json.dumps(ustveri, ensure_ascii=False, indent=2))
        zf.writestr("NihaiOzet.json", json.dumps(nihai_ozet, ensure_ascii=False, indent=2))
        zf.writestr("BENIOKU.txt", BENIOKU)
    return buf.getvalue()


__all__ = ("build_eyp_paket",)
