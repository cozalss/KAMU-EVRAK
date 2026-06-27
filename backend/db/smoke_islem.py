"""Faz 3 round-trip smoke — ProcessResponse → DB → geri-oku → temizlik (canlı Supabase).

CI'da DEĞİL (canlı yazma). Tüm normalize dallarını (bilgi_unsuru/kanit_span/alt_talep/
mevzuat_oneri/risk/sla) dolduran örnek yanıtı persist eder, sayar, doğrular, siler.
Çalıştır: uv run python -m db.smoke_islem
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, func, select

from api.schemas import AltTalepSchema, MevzuatOneriSchema, ProcessResponse
from auth import service
from db.models import (
    AltTalep,
    BilgiUnsuru,
    GelenEvrak,
    KanitSpan,
    Kullanici,
    MevzuatOneri,
    RiskDegerlendirme,
    SlaTakip,
)
from db.repositories import evrak_olustur, persist_islem
from db.session import engine, session_factory

_EPOSTA = "smoke.islem@kamu-evrak.local"
_EVRAK_NO = "E-SMOKE/0001"


def _ornek_yanit() -> ProcessResponse:
    return ProcessResponse(
        evrak_turu="dilekce", tur_confidence=0.91,
        bilgi_unsurlari={"gonderen": {"deger": "Ayşe Y***z", "etiket": "Gönderen", "guven": 0.9},
                         "tckn": {"deger": "123****8901", "etiket": "T.C. Kimlik No"},
                         "konu": "İmar durumu talebi"},
        eksik_alanlar=["imza"], clarify_questions=["İmza eksik, tamamlar mısınız?"],
        mevzuat_onerileri=[
            MevzuatOneriSchema(baslik="3071 s.K. m.4", snippet="zorunlu unsurlar", score=12.3),
            MevzuatOneriSchema(baslik="3071 s.K. m.7", snippet="otuz gün", score=9.1)],
        ozet="Vatandaş imar durumu talep ediyor.", hedef_birim="ilgili_teknik_daire",
        birim_alternatifleri=["yazi_isleri_evrak"], yazi_turu="cevabi_yazi",
        format_uyumlu=True, verify_uyari=[],
        arsiv_metadata={"sdp_kodu": "010", "saklama_suresi": "5 yıl"},
        sla_metadata={"durum": "NORMAL", "son_tarih": "27.07.2026", "kalan_gun": 30,
                      "dayanak": "3071 s.K. m.7 (30 gün)", "baslangic": "27.06.2026"},
        risk_metadata={"bant": "sari", "skor": 0.5, "gerekceler": ["İmza eksik"]},
        kanit_metadata={"metin": "... Ayşe Y***z, TC 123****8901 ...",
                        "spanlar": [{"start": 4, "end": 13, "alan": "gonderen",
                                     "label": "Gönderen", "deger": "Ayşe Y***z"}]},
        alt_talepler=[AltTalepSchema(ozet="İmar durumu", tur="talep", birim="ilgili_teknik_daire",
                                     yazi_turu="cevabi_yazi", cevap_suresi="30 gün",
                                     sla_durum="NORMAL")],
        thread_id="smoke-thread-1",
    )


async def _temizle(s):
    await s.execute(delete(GelenEvrak).where(GelenEvrak.evrak_no == _EVRAK_NO))
    await s.execute(delete(Kullanici).where(Kullanici.eposta == _EPOSTA))
    await s.commit()


async def main() -> int:
    async with session_factory() as s:
        await _temizle(s)
        from sqlalchemy import select as _sel

        from db.models import Birim
        birim = await s.scalar(_sel(Birim).limit(1))
        k = await service.kayit(s, eposta=_EPOSTA, parola="Smoke.Islem.1!",
                                ad_soyad="Smoke", birim_kod=birim.kod)
        evrak = await evrak_olustur(s, evrak_no=_EVRAK_NO, ocr_metni="... maskeli metin ...",
                                    olusturan_id=k.id, baslik="smoke", gelis_birim_id=birim.id)
        print(f"1. gelen_evrak OK  ({evrak.evrak_no})")
        islem = await persist_islem(s, gelen_evrak_id=evrak.id, thread_id="smoke-thread-1",
                                    response=_ornek_yanit(), sure_ms=1234)
        print(f"2. islem OK  (id={str(islem.id)[:8]}…, durum={islem.durum}, tür={islem.evrak_turu_kod})")

        async def say(M):
            return await s.scalar(select(func.count()).select_from(M).where(M.islem_id == islem.id))
        bu = await say(BilgiUnsuru); ks = await say(KanitSpan); at = await say(AltTalep)
        mo = await say(MevzuatOneri); ri = await say(RiskDegerlendirme); sl = await say(SlaTakip)
        print(f"3. normalize: bilgi_unsuru={bu} kanit_span={ks} alt_talep={at} "
              f"mevzuat_oneri={mo} risk={ri} sla={sl}")
        # JSONB kayıpsızlık + FK çözüm doğrula
        assert islem.hedef_birim_id is not None, "hedef_birim çözülmedi"
        assert islem.arsiv_metadata.get("sdp_kodu") == "010", "JSONB kayıpsız değil"
        ri_row = await s.get(RiskDegerlendirme, islem.id)
        sl_row = await s.get(SlaTakip, islem.id)
        assert ri_row.bant == "sari" and sl_row.durum == "normal", "risk/sla normalize hatası"
        ok = (bu == 3 and ks == 1 and at == 1 and mo == 2 and ri == 1 and sl == 1)
        print("4. doğrulama: hedef_birim çözüldü, JSONB kayıpsız, risk=sari, sla=normal")
        await _temizle(s)
        print("5. temizlik OK (gelen_evrak cascade + kullanıcı silindi)")
    await engine.dispose()
    print("\nSONUÇ:", "✅ PIPELINE PERSISTENCE ÇALIŞIYOR" if ok else "⚠️ sayı uyuşmuyor")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
