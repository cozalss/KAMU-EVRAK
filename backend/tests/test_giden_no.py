"""Giden evrak numarası — yıl içi en büyük sıra +1 (count+1 değil).

Eski hâl tüm yılların satır SAYISINI kullanıyordu: yıl dönümünde sıfırlanmıyor, silinen bir
kayıttan sonra count+1 mevcut numarayla çakışıp gönderimi kilitliyordu."""

from __future__ import annotations

import datetime as _dt

from db.repositories import karar_repo


class _SahteOturum:
    def __init__(self, son: str | None) -> None:
        self.son = son
        self.sorgu = None

    async def scalar(self, stmt):
        self.sorgu = str(stmt)
        return self.son


async def test_en_buyuk_sira_arti_bir():
    yil = _dt.datetime.now(_dt.UTC).year
    o = _SahteOturum(f"E-G-{yil}/0035")
    assert await karar_repo._giden_no(o) == f"E-G-{yil}/0036"
    assert "LIKE" in o.sorgu.upper()          # yıl öneki ile süzülür


async def test_yilin_ilk_kaydi_0001():
    yil = _dt.datetime.now(_dt.UTC).year
    assert await karar_repo._giden_no(_SahteOturum(None)) == f"E-G-{yil}/0001"


async def test_dort_haneyi_asan_sira():
    yil = _dt.datetime.now(_dt.UTC).year
    assert await karar_repo._giden_no(_SahteOturum(f"E-G-{yil}/9999")) == f"E-G-{yil}/10000"


def test_birim_adi_arsiv_ust_verisinden():
    from db.repositories.sorgu_repo import _birim_adi

    assert _birim_adi({"birim": " Fen İşleri Müdürlüğü "}) == "Fen İşleri Müdürlüğü"
    assert _birim_adi(None) == "" and _birim_adi({}) == ""
