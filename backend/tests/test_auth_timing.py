"""auth/service.giris() — bilinmeyen e-posta yolu zamanlama testi (regresyon).

Bilinmeyen e-posta yolu, gerçek "yanlış parola" yolu gibi TEK argon2 verify() maliyeti
taşımalı — SABİT _SAHTE_HASH'e karşı doğrular. Eskiden her istekte hash_parola() ile
YENİDEN (taze salt + tam hash) üretiyordu; bu, bilinmeyen-e-posta yolunu ~2 kat YAVAŞ
yapıp e-posta varlığını daha da ayırt edilebilir kılıyordu (niyetin tam tersi).
"""
from __future__ import annotations

import pytest

from auth import security, service


class _SahteSession:
    """giris()'in yalnız kullandığı session.scalar'ı taklit eder — gerçek DB gerekmez."""

    async def scalar(self, *a, **k):
        return None


async def test_bilinmeyen_eposta_yolu_hash_parola_yeniden_cagirmaz(monkeypatch):
    cagrilar = []
    gercek = security.hash_parola

    def _izlenen(*a, **k):
        cagrilar.append(1)
        return gercek(*a, **k)

    monkeypatch.setattr(security, "hash_parola", _izlenen)

    with pytest.raises(service.AuthError) as exc:
        await service.giris(_SahteSession(), eposta="olmayan@ornek.gov.tr", parola="herhangi-bir-sey")

    assert exc.value.kod == "kimlik_hatali"
    # SABİT _SAHTE_HASH kullanılmalı — hash_parola() giris() içinde TEKRAR çağrılmamalı.
    assert cagrilar == []


def test_sahte_hash_gercek_bir_argon2_hash(monkeypatch):
    # _SAHTE_HASH modül yüklenirken bir kez üretilmiş geçerli bir argon2 hash olmalı —
    # parola_dogrula onunla çalışabilsin (rastgele/placeholder string değil).
    assert security.parola_dogrula("zamanlama-sizintisi-icin-sabit-sahte-parola", service._SAHTE_HASH)
    assert not security.parola_dogrula("baska-bir-parola", service._SAHTE_HASH)
