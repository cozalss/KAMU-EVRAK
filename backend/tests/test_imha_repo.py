"""Faz 8 imha — saklama yılı parsing (saf, config-bazlı, DB'siz).

Uçtan-uca imha/anonimleştirme db/smoke_imha.py'de (canlı). Burada süre çıkarımı:
'N yıl' → N; 'Süresiz'/'[DOĞRULA]'/bilinmeyen-davranış doğrulanır.
"""
from __future__ import annotations

from db.repositories.imha_repo import saklama_yil


def test_yillik_sureler():
    assert saklama_yil("dilekce") == 5
    assert saklama_yil("dava_evraki") == 10
    assert saklama_yil("fatura") == 10


def test_suresiz_asla_imha():
    # genelge_talimat_olur = 'Süresiz (devamlı)' → None (asla imha edilmez)
    assert saklama_yil("genelge_talimat_olur") is None


def test_belirsiz_dogrula_isaretli_none():
    # belirsiz = '[DOĞRULA: saklama süresi tür belirsiz]' → yıl yok → None (güvenli)
    assert saklama_yil("belirsiz") is None


def test_none_ve_bilinmeyen():
    assert saklama_yil(None) is None
    # bilinmeyen tür → config varsayılanı '5 yıl' → 5
    assert saklama_yil("olmayan_tur") == 5
