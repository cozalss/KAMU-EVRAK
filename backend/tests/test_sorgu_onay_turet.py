"""onay_durumu_turet — işlem-düzeyi onay türetimi (sorgu_repo saf mantık).

Regresyon: karar temsilci-olmayan taslağa yazıldığında işlem 'karar bekliyor'da
takılı kalıyor, gönderilen/silinen taslak refresh'te geri diriliyordu.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace

from db.repositories.sorgu_repo import onay_durumu_turet


def _onay(taslak_id: uuid.UUID, karar: str) -> SimpleNamespace:
    return SimpleNamespace(taslak_id=taslak_id, karar=karar)


def test_tek_taslak_karar_verildi() -> None:
    islem, taslak = uuid.uuid4(), uuid.uuid4()
    onay, bekleyen = onay_durumu_turet({taslak: islem}, [_onay(taslak, "onaylandi")])
    assert onay[islem].karar == "onaylandi"
    assert bekleyen == set()


def test_tek_taslak_kararsiz_bekliyor() -> None:
    islem, taslak = uuid.uuid4(), uuid.uuid4()
    onay, bekleyen = onay_durumu_turet({taslak: islem}, [])
    assert onay == {}
    assert bekleyen == {islem}


def test_bekliyor_karari_karar_sayilmaz() -> None:
    islem, taslak = uuid.uuid4(), uuid.uuid4()
    onay, bekleyen = onay_durumu_turet({taslak: islem}, [_onay(taslak, "bekliyor")])
    assert onay == {}
    assert bekleyen == {islem}


def test_cok_konulu_kismi_karar_bekliyor_sayilir() -> None:
    """İki birim taslağından yalnız biri kararlı → işlem hâlâ karar bekliyor."""
    islem, t1, t2 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    onay, bekleyen = onay_durumu_turet(
        {t1: islem, t2: islem}, [_onay(t1, "onaylandi")])
    assert onay == {}
    assert bekleyen == {islem}


def test_cok_konulu_tum_kararlar_verildi_sonuncu_kazanir() -> None:
    islem, t1, t2 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    onay, bekleyen = onay_durumu_turet(
        {t1: islem, t2: islem},
        [_onay(t1, "onaylandi"), _onay(t2, "reddedildi")])  # kronolojik artan
    assert onay[islem].karar == "reddedildi"
    assert bekleyen == set()


def test_taslaksiz_islem_listede_yok() -> None:
    """Taslağı hiç olmayan işlem ne onaylı ne bekleyen — çağıran '' gösterir."""
    onay, bekleyen = onay_durumu_turet({}, [])
    assert onay == {} and bekleyen == set()


def test_liste_disi_taslagin_onayi_yok_sayilir() -> None:
    """Sayfalama dışındaki işleme ait onay satırı sızsa bile patlamaz/etkilemez."""
    islem, taslak, yabanci = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    onay, bekleyen = onay_durumu_turet(
        {taslak: islem}, [_onay(yabanci, "onaylandi")])
    assert onay == {}
    assert bekleyen == {islem}
