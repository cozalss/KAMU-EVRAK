"""Faz 3 persistence mapper — saf normalize yardımcıları (DB'siz, deterministik).

Uçtan-uca round-trip db/smoke_islem.py'de (canlı DB). Burada eşleme saf-fonksiyon
davranışı: FK kod doğrulama, enum eşleme, tarih ayrıştırma, maskeli değer aktarımı.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from api.schemas import AltTalepSchema
from db.models import AltTalep
from db.repositories.islem_repo import (
    _alt_talepler,
    _alt_taslaklar,
    _bilgi_unsurlari,
    _coklu_taslak,
    _kanit_spanlar,
    _risk,
    _sla,
    _tarih,
)

_IID = uuid.uuid4()


# --- tarih ayrıştırma ------------------------------------------------------
def test_tarih_gecerli():
    assert _tarih("27.06.2026") == _dt.date(2026, 6, 27)


def test_tarih_bos_ve_bozuk_none():
    assert _tarih(None) is None
    assert _tarih("") is None
    assert _tarih("2026-06-27") is None   # yanlış format
    assert _tarih("abc") is None


# --- bilgi_unsuru ----------------------------------------------------------
def test_bilgi_unsuru_dict_ve_skaler():
    rows = _bilgi_unsurlari(_IID, {
        "gonderen": {"deger": "Ayşe Y***z", "etiket": "Gönderen", "guven": 0.9},
        "konu": "İmar talebi",
    })
    by = {r.alan: r for r in rows}
    assert by["gonderen"].deger_maskeli == "Ayşe Y***z"
    assert by["gonderen"].etiket_tr == "Gönderen" and abs(by["gonderen"].guven - 0.9) < 1e-9
    assert by["konu"].deger_maskeli == "İmar talebi" and by["konu"].etiket_tr == "konu"


def test_bilgi_unsuru_bos_deger_atlanir():
    rows = _bilgi_unsurlari(_IID, {"x": "", "y": None, "z": "var"})
    assert {r.alan for r in rows} == {"z"}


# --- kanit_span ------------------------------------------------------------
def test_kanit_span_label_ve_eksik_atlama():
    rows = _kanit_spanlar(_IID, {"spanlar": [
        {"start": 4, "end": 13, "alan": "gonderen", "label": "Gönderen", "deger": "Ayşe Y***z"},
        {"alan": "bozuk"},  # start/end yok → atlanır
    ]})
    assert len(rows) == 1
    assert rows[0].etiket == "Gönderen" and rows[0].span_start == 4 and rows[0].span_end == 13


# --- alt_talep FK + enum ---------------------------------------------------
def test_alt_talep_kod_dogrulama_ve_sla_map():
    birimler = {"ilgili_teknik_daire": uuid.uuid4()}
    talepler = [
        AltTalepSchema(ozet="İmar", tur="talep", birim="ilgili_teknik_daire",
                       yazi_turu="cevabi_yazi", sla_durum="GECIKMIS"),
        AltTalepSchema(ozet="Geçersiz", tur="OLMAYAN_TUR", birim="OLMAYAN_BIRIM",
                       yazi_turu="OLMAYAN", sla_durum=""),
    ]
    rows = _alt_talepler(_IID, talepler, {"talep"}, {"cevabi_yazi"}, birimler)
    assert rows[0].tur_kod == "talep" and rows[0].yazi_turu_kod == "cevabi_yazi"
    assert rows[0].hedef_birim_id == birimler["ilgili_teknik_daire"]
    assert rows[0].sla_durum == "gecikmis"
    # bilinmeyen kodlar → NULL (FK güvenliği)
    assert rows[1].tur_kod is None and rows[1].yazi_turu_kod is None
    assert rows[1].hedef_birim_id is None and rows[1].sla_durum is None


# --- risk / sla ------------------------------------------------------------
def test_risk_gecerli_ve_gecersiz():
    r = _risk(_IID, {"bant": "kirmizi", "skor": 0.9, "gerekceler": ["uydurma"]})
    assert r is not None and r.bant == "kirmizi" and r.gerekceler == ["uydurma"]
    assert _risk(_IID, {"bant": "mor"}) is None
    assert _risk(_IID, {}) is None


def test_sla_durum_buyuk_harf_map():
    sl = _sla(_IID, {"durum": "NORMAL", "son_tarih": "27.07.2026", "kalan_gun": 30,
                     "dayanak": "3071 m.7"})
    assert sl is not None and sl.durum == "normal"
    assert sl.son_tarih == _dt.date(2026, 7, 27) and sl.kalan_gun == 30
    assert _sla(_IID, {}) is None


# --- çok-konulu evrak: her alt-talebin KENDİ taslağı, alt_talep_id ile bağlı --------------


def test_coklu_taslak_iki_taslak_metinliyse_true():
    talepler = [
        AltTalepSchema(ozet="A", yazi_taslak_md="metin A"),
        AltTalepSchema(ozet="B", yazi_taslak_md="metin B"),
    ]
    assert _coklu_taslak(_Sonuc(talepler)) is True


def test_coklu_taslak_tek_talepte_false():
    assert _coklu_taslak(_Sonuc([AltTalepSchema(ozet="A", yazi_taslak_md="metin A")])) is False


def test_coklu_taslak_metin_yoksa_false():
    talepler = [AltTalepSchema(ozet="A"), AltTalepSchema(ozet="B")]
    assert _coklu_taslak(_Sonuc(talepler)) is False


def test_alt_taslaklar_alt_talep_id_ile_esler_ve_metinsizi_atlar():
    alt1, alt2 = AltTalep(id=uuid.uuid4()), AltTalep(id=uuid.uuid4())
    talepler = [
        AltTalepSchema(ozet="çukur", yazi_turu="ust_yazi",
                       yazi_taslak_md="Birim 1 taslağı", format_uyumlu=True),
        AltTalepSchema(ozet="fatura", yazi_turu="ust_yazi", yazi_taslak_md=""),  # taslak yok → atlanır
    ]
    rows = _alt_taslaklar(_IID, talepler, [alt1, alt2], {"ust_yazi"})
    assert len(rows) == 1
    assert rows[0].alt_talep_id == alt1.id
    assert rows[0].metin_md == "Birim 1 taslağı" and rows[0].format_uyumlu is True
    assert rows[0].konu == "çukur"


class _Sonuc:
    """ProcessResponse'un _coklu_taslak için gereken tek alanının minimal test çifti."""

    def __init__(self, alt_talepler):
        self.alt_talepler = alt_talepler
