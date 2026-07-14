"""ProcessResponse → DB persistence (Faz 3). Lossless JSONB + normalize tablolar.

Tasarım: 4 metadata dict (arsiv/sla/risk/kanit) islem'e JSONB olarak AYNEN yazılır
(kayıpsız); ayrıca sorgulanan alanlar normalize tablolara açılır (risk_degerlendirme,
sla_takip, mevzuat_oneri, alt_talep, bilgi_unsuru, kanit_span). FK güvenliği: lookup
kodları (evrak_turu/yazi_turu/birim) önceden yüklenir; bilinmeyen kod → NULL (hata yok).
KVKK: değerler pipeline tarafından maskelenmiş gelir (PII yok).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import ProcessResponse
from db.models import (
    AltTalep,
    BilgiUnsuru,
    Birim,
    EvrakTuru,
    GelenEvrak,
    Islem,
    KanitSpan,
    MevzuatOneri,
    RiskDegerlendirme,
    SlaTakip,
    Taslak,
    YaziTuru,
)

# sla_metadata.durum (BÜYÜK/karışık) → sla_durumu enum (küçük).
_SLA_MAP = {
    "GECIKMIS": "gecikmis", "KRITIK": "kritik", "NORMAL": "normal",
    "tanimsiz": "tanimsiz", "tarih_yok": "tarih_yok",
}
_GECERLI_SLA = set(_SLA_MAP.values())


async def evrak_olustur(
    session: AsyncSession, *, evrak_no: str, ocr_metni: str, olusturan_id: uuid.UUID,
    baslik: str = "", kaynak: str = "yukleme", ocr_engine: str | None = None,
    ocr_confidence: float | None = None, sayfa_sayisi: int | None = None,
    gelis_birim_id: uuid.UUID | None = None, commit: bool = True,
) -> GelenEvrak:
    """Yeni gelen evrak satırı (ocr_metni MASKELİ olmalı — KVKK).

    commit=False: yalnız flush (evrak.id doldurulur), commit ÇAĞIRANA bırakılır —
    persist_pipeline_run birden çok yazımı (evrak+islem+denetim) TEK transaction'da
    toplar; her biri ayrı commit atarsa ara adım hatasında önceki commit'ler DB'de
    kalıcı kalır (yetim kayıt — regresyon bulgusu).
    """
    evrak = GelenEvrak(
        evrak_no=evrak_no, baslik=baslik, kaynak=kaynak, ocr_metni=ocr_metni,
        ocr_engine=ocr_engine, ocr_confidence=ocr_confidence, sayfa_sayisi=sayfa_sayisi,
        gelis_birim_id=gelis_birim_id, olusturan_id=olusturan_id,
    )
    session.add(evrak)
    if commit:
        await session.commit()
        await session.refresh(evrak)
    else:
        await session.flush()
    return evrak


async def _lookups(session: AsyncSession):
    evrak = set(await session.scalars(select(EvrakTuru.kod)))
    yazi = set(await session.scalars(select(YaziTuru.kod)))
    birimler = {kod: bid for kod, bid in (await session.execute(select(Birim.kod, Birim.id))).all()}
    return evrak, yazi, birimler


def _tarih(s: str | None) -> _dt.date | None:
    if not s:
        return None
    try:
        return _dt.datetime.strptime(s.strip(), "%d.%m.%Y").date()
    except (ValueError, AttributeError):
        return None


def _bilgi_unsurlari(islem_id: uuid.UUID, d: dict) -> list[BilgiUnsuru]:
    """dict → bilgi_unsuru satırları (best-effort; değer maskeli gelir)."""
    rows: list[BilgiUnsuru] = []
    for alan, val in (d or {}).items():
        if isinstance(val, dict):
            deger = val.get("deger") or val.get("maskeli") or val.get("value") or ""
            etiket = val.get("etiket") or val.get("label") or alan
            guven = float(val.get("guven", 0) or 0)
        else:
            deger, etiket, guven = (val, alan, 0.0)
        deger = "" if deger is None else str(deger)
        if not deger:
            continue
        rows.append(BilgiUnsuru(islem_id=islem_id, alan=str(alan),
                                etiket_tr=str(etiket), deger_maskeli=deger, guven=guven))
    return rows


def _kanit_spanlar(islem_id: uuid.UUID, meta: dict) -> list[KanitSpan]:
    rows: list[KanitSpan] = []
    for sp in (meta or {}).get("spanlar", []):
        try:
            rows.append(KanitSpan(
                islem_id=islem_id, alan=str(sp.get("alan", "")),
                etiket=str(sp.get("label") or sp.get("etiket") or ""),
                deger=str(sp.get("deger", "")),
                span_start=int(sp["start"]), span_end=int(sp["end"]),
            ))
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def _alt_talepler(islem_id, talepler, evrak_kods, yazi_kods, birimler) -> list[AltTalep]:
    rows: list[AltTalep] = []
    for i, t in enumerate(talepler or []):
        rows.append(AltTalep(
            islem_id=islem_id, sira=i + 1, ozet=t.ozet,
            tur_kod=t.tur if t.tur in evrak_kods else None,
            hedef_birim_id=birimler.get(t.birim),
            yazi_turu_kod=t.yazi_turu if t.yazi_turu in yazi_kods else None,
            cevap_suresi=t.cevap_suresi or None,
            sla_durum=_SLA_MAP.get(t.sla_durum, "tanimsiz" if t.sla_durum else None),
        ))
    return rows


def _mevzuat_oneri(islem_id, onerileri) -> list[MevzuatOneri]:
    return [
        MevzuatOneri(islem_id=islem_id, baslik=o.baslik, snippet=o.snippet,
                     url=o.url, score=o.score or 0)
        for o in (onerileri or [])
    ]


def _risk(islem_id, meta: dict) -> RiskDegerlendirme | None:
    bant = (meta or {}).get("bant")
    if bant not in {"yesil", "sari", "kirmizi"}:
        return None
    return RiskDegerlendirme(islem_id=islem_id, bant=bant,
                             skor=float(meta.get("skor", 0) or 0),
                             gerekceler=list(meta.get("gerekceler", [])))


def _konu(response) -> str:
    """Taslak konusu — bilgi_unsurlari.konu (maskeli) veya ilk alt-talep özeti."""
    konu = (response.bilgi_unsurlari or {}).get("konu")
    if isinstance(konu, dict):
        konu = konu.get("deger") or konu.get("value") or ""
    if not konu and response.alt_talepler:
        konu = response.alt_talepler[0].ozet
    return str(konu or "")[:500]


def _taslak(islem_id, response, yazi_kods) -> Taslak | None:
    """Tek-konulu evrakta yazi_taslak_md varsa taslak satırı (1 islem → 1 taslak)."""
    if not response.yazi_taslak_md or response.yazi_turu not in yazi_kods:
        return None
    return Taslak(
        islem_id=islem_id, yazi_turu_kod=response.yazi_turu, konu=_konu(response),
        metin_md=response.yazi_taslak_md, format_uyumlu=response.format_uyumlu,
    )


def _coklu_taslak(response) -> bool:
    """Çok-konulu (>=2 birim, en az biri taslak metni taşıyor) → N ayrı taslak yazılır."""
    return len(response.alt_talepler) >= 2 and any(t.yazi_taslak_md for t in response.alt_talepler)


def _alt_taslaklar(islem_id, talepler, alt_talep_rows, yazi_kods) -> list[Taslak]:
    """Çok-konulu evrakta HER alt-talebin kendi birimine giden taslağı (alt_talep_id bağlı).

    `talepler` ve `alt_talep_rows` AYNI sırada birebir eşleşir (_alt_talepler her ikisini
    de aynı enumerate ile kurar) → zip güvenli. Flush SONRASI çağrılmalı (alt.id dolu olsun).
    """
    rows: list[Taslak] = []
    for t, alt in zip(talepler, alt_talep_rows, strict=True):
        if not t.yazi_taslak_md or t.yazi_turu not in yazi_kods:
            continue
        rows.append(Taslak(
            islem_id=islem_id, alt_talep_id=alt.id, yazi_turu_kod=t.yazi_turu,
            konu=(t.ozet or "")[:500], metin_md=t.yazi_taslak_md,
            format_uyumlu=t.format_uyumlu,
        ))
    return rows


def _sla(islem_id, meta: dict) -> SlaTakip | None:
    durum_raw = (meta or {}).get("durum")
    if not durum_raw:
        return None
    durum = _SLA_MAP.get(durum_raw, durum_raw if durum_raw in _GECERLI_SLA else "tanimsiz")
    return SlaTakip(
        islem_id=islem_id, durum=durum,
        baslangic_tarihi=_tarih(meta.get("baslangic")),
        son_tarih=_tarih(meta.get("son_tarih")),
        kalan_gun=meta.get("kalan_gun"),
        dayanak=meta.get("dayanak") or meta.get("etiket"),
    )


async def persist_islem(
    session: AsyncSession, *, gelen_evrak_id: uuid.UUID, thread_id: str,
    response: ProcessResponse, durum: str = "tamamlandi", sure_ms: int | None = None,
    commit: bool = True,
) -> Islem:
    """ProcessResponse'u islem + normalize tablolara yazar.

    commit=False: bkz. evrak_olustur — persist_pipeline_run'ın tek-transaction'ı için.
    """
    evrak_kods, yazi_kods, birimler = await _lookups(session)
    islem = Islem(
        gelen_evrak_id=gelen_evrak_id, thread_id=thread_id, durum=durum,
        evrak_turu_kod=response.evrak_turu if response.evrak_turu in evrak_kods else None,
        tur_confidence=response.tur_confidence,
        bilgi_unsurlari=response.bilgi_unsurlari or {},
        eksik_alanlar=list(response.eksik_alanlar),
        clarify_questions=list(response.clarify_questions),
        ozet=response.ozet,
        hedef_birim_id=birimler.get(response.hedef_birim),
        birim_alternatifleri=list(response.birim_alternatifleri),
        format_uyumlu=response.format_uyumlu,
        verify_uyari=list(response.verify_uyari),
        verify_notes=response.verify_notes,
        bilgilendirme=response.bilgilendirme,
        arsiv_metadata=response.arsiv_metadata or {},
        sla_metadata=response.sla_metadata or {},
        risk_metadata=response.risk_metadata or {},
        kanit_metadata=response.kanit_metadata or {},
        bitis=_dt.datetime.now(_dt.UTC) if durum == "tamamlandi" else None,
        sure_ms=sure_ms,
    )
    session.add(islem)
    await session.flush()  # islem.id

    session.add_all(_bilgi_unsurlari(islem.id, response.bilgi_unsurlari))
    session.add_all(_kanit_spanlar(islem.id, response.kanit_metadata))
    alt_talep_rows = _alt_talepler(islem.id, response.alt_talepler, evrak_kods, yazi_kods, birimler)
    session.add_all(alt_talep_rows)
    session.add_all(_mevzuat_oneri(islem.id, response.mevzuat_onerileri))
    if (r := _risk(islem.id, response.risk_metadata)) is not None:
        session.add(r)
    if (sl := _sla(islem.id, response.sla_metadata)) is not None:
        session.add(sl)
    if _coklu_taslak(response):
        await session.flush()  # alt_talep_rows[i].id doldurulsun (taslak.alt_talep_id için)
        session.add_all(_alt_taslaklar(islem.id, response.alt_talepler, alt_talep_rows, yazi_kods))
    elif (ts := _taslak(islem.id, response, yazi_kods)) is not None:
        session.add(ts)

    if commit:
        await session.commit()
        await session.refresh(islem)
    else:
        await session.flush()
    return islem


__all__ = ("evrak_olustur", "persist_islem")
