"""Faz 5 denetim izi smoke — persist + bağımsız bütünlük doğrulama + değiştirilemezlik.

CI'da DEĞİL (canlı). Akış: islem oluştur → hash-zinciri persist → DB'den yeniden hesapla
(butunluk True) → UPDATE dene (trigger ENGELLER) → GUC ile kontrollü imha temizliği.
Çalıştır: uv run python -m db.smoke_denetim
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, select, text

from agents.nodes.denetim_izi import denetim_izi_node
from api.schemas import ProcessResponse
from auth import service
from db.models import Birim, DenetimAdimi, GelenEvrak, Kullanici
from db.repositories import dogrula_denetim, evrak_olustur, persist_denetim, persist_islem
from db.session import engine, session_factory

_EPOSTA = "smoke.denetim@kamu-evrak.local"
_EVRAK_NO = "E-SMOKE-DEN/0001"

_STATE = {
    "evrak_turu": "dilekce", "tur_confidence": 0.91,
    "bilgi_unsurlari": {"gonderen": "Ayşe Y***z", "konu": "imar"},
    "eksik_alanlar": ["imza"],
    "mevzuat_onerileri": [{"baslik": "3071 s.K. m.4"}],
    "ozet": "İmar durumu talebi.", "hedef_birim": "ilgili_teknik_daire",
    "yazi_turu": "cevabi_yazi", "format_uyumlu": True, "verify_uyari": [],
    "risk_metadata": {"bant": "sari", "gerekceler": ["imza eksik"]},
    "onay_durumu": "", "arsiv_metadata": {"sdp_kodu": "010"},
    "sla_metadata": {"durum": "NORMAL"},
}


async def _temizle(s):
    await s.rollback()  # varsa açık okuma txn'ini kapat → temiz txn
    # SET LOCAL + DELETE aynı transaction'da (kontrollü imha GUC'si).
    await s.execute(text("SET LOCAL app.denetim_silmeye_izin = 'on'"))
    await s.execute(delete(GelenEvrak).where(GelenEvrak.evrak_no == _EVRAK_NO))
    await s.execute(delete(Kullanici).where(Kullanici.eposta == _EPOSTA))
    await s.commit()


async def main() -> int:
    async with session_factory() as s:
        await _temizle(s)
        birim = await s.scalar(select(Birim).limit(1))
        k = await service.kayit(s, eposta=_EPOSTA, parola="Smoke.Den.1!",
                                ad_soyad="Smoke", birim_kod=birim.kod)
        evrak = await evrak_olustur(s, evrak_no=_EVRAK_NO, ocr_metni="... maskeli ...",
                                    olusturan_id=k.id, gelis_birim_id=birim.id)
        islem = await persist_islem(s, gelen_evrak_id=evrak.id, thread_id="den-1",
                                    response=ProcessResponse(evrak_turu="dilekce"))
        print(f"1. islem OK ({str(islem.id)[:8]}…)")

        meta = (await denetim_izi_node(_STATE))["denetim_izi"]
        izi = await persist_denetim(s, islem_id=islem.id, denetim_izi=meta)
        print(f"2. denetim persist OK ({izi.adim_sayisi} adım, son_hash={izi.son_hash[:12]}…)")

        # Bağımsız yeniden-hesap doğrulama
        sonuc = await dogrula_denetim(s, islem_id=islem.id)
        print(f"3. doğrulama: butunluk={sonuc['butunluk']} adım={sonuc['adim_sayisi']} "
              f"son_hash_eşleşme={sonuc['son_hash_eslesme']}")
        assert sonuc["butunluk"] and sonuc["son_hash_eslesme"], "bütünlük doğrulanamadı"
        await s.commit()  # okuma txn'ini kapat (sonraki test bloklarına temiz başla)

        # Değiştirilemezlik: UPDATE → trigger RAISE
        immutable_ok = False
        try:
            await s.execute(text(
                "UPDATE denetim_adimi SET hash='SAHTE' WHERE islem_id=:i"), {"i": islem.id})
            await s.commit()
            print("4. HATA: UPDATE engellenmedi!")
        except Exception as e:
            await s.rollback()
            immutable_ok = "değiştirilemez" in str(e) or "tamper" in str(e).lower()
            print(f"4. değiştirilemezlik {'OK' if immutable_ok else 'HATALI'} "
                  f"(UPDATE trigger ile engellendi)")

        # DELETE de varsayılan engelli (GUC olmadan)
        delete_blocked = False
        try:
            await s.execute(delete(DenetimAdimi).where(DenetimAdimi.islem_id == islem.id))
            await s.commit()
            print("5. HATA: GUC'siz DELETE engellenmedi!")
        except Exception:
            await s.rollback()
            delete_blocked = True
            print("5. GUC'siz DELETE engellendi (varsayılan-deny OK)")

        await _temizle(s)
        print("6. kontrollü imha (GUC) temizlik OK")
        ok = sonuc["butunluk"] and immutable_ok and delete_blocked
    await engine.dispose()
    print("\nSONUÇ:", "✅ DENETİM İZİ PERSISTENCE + TAMPER-EVIDENT ÇALIŞIYOR" if ok else "⚠️ kontrol et")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
