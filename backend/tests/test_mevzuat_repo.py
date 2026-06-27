"""Mevzuat arama tsquery builder — saf sanitizasyon (DB'siz, deterministik).

Hibrit arama uçtan-uca db/smoke_api.py'de (canlı). Burada to_tsquery injection-güvenliği
+ OR semantiği + Türkçe karakter korunumu test edilir.
"""
from __future__ import annotations

from db.repositories.mevzuat_repo import _tsquery


def test_or_birlestirme():
    assert _tsquery("dilekçe hakkı süre") == "dilekçe | hakkı | süre"


def test_noktalama_ve_ozel_karakter_temizlenir():
    # to_tsquery'yi bozacak özel karakterler (&|!():*) ayraç sayılır → injection yok.
    # Küçültme PG 'simple' tarafında yapılır → Python çıktısı özgün büyük/küçük korur.
    assert _tsquery("3071 s.K. m.4 (zorunlu)!") == "3071 | s | K | m | 4 | zorunlu"


def test_turkce_karakter_korunur():
    # İ/â bozulmadan korunur (NFC + lower YOK → 'İ' birleşik-nokta üretmez).
    assert _tsquery("İmar Çevre Şikâyet") == "İmar | Çevre | Şikâyet"


def test_bos_ve_sadece_simge_bos_string():
    assert _tsquery("") == ""
    assert _tsquery("   ") == ""
    assert _tsquery("!@#$%^&*()") == ""


def test_tek_kelime():
    assert _tsquery("tebligat") == "tebligat"
