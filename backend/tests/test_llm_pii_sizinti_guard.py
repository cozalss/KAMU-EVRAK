"""Regresyon guard: dış LLM'e (DeepSeek) HAM TCKN/telefon SIZMAMALI (KVKK, CLAUDE.md §2/§5).

Bu testler ed9a8666 (exhaustive bug avı 2. dalga, CRITICAL) düzeltmesini kilitler:
anlama/üretim node'ları evrak metnini `llm_json`'a **mask_for_llm'den geçirerek** gönderir.
Düzeltme öncesi kod ham metni gönderiyordu → aşağıdaki assert'ler kırılırdı (Prove-It).

Yöntem: node'un modül ad-alanındaki `llm_json` yakalayıcı sahte ile değiştirilir; sahte,
gerçekten gönderilen `user` payload'unu saklar ve None döndürür (node deterministik
fallback'e düşer, çökme olmaz). PII sentetik/sahtedir (CLAUDE.md §2).
"""

from __future__ import annotations

import agents.nodes.cikar as cikar_mod
import agents.nodes.crag as crag_mod
import agents.nodes.decompose as decompose_mod
import agents.nodes.eksik_tespit as eksik_mod
import agents.nodes.ozetle as ozetle_mod
import agents.nodes.route_birim as route_mod
import agents.nodes.siniflandir as siniflandir_mod

# Sentetik SAHTE PII (checksum-geçerli değil, kurgu — CLAUDE.md §2)
_HAM_TCKN = "12345678901"
_HAM_TEL = "0532 111 22 33"

# Çok-konulu + PII içeren sentetik dilekçe metni (decompose için "ayrıca" ile iki talep)
_METIN = (
    "Sayın Yetkili,\n"
    f"Başvuru sahibi Ayşe Yılmaz (TCKN: {_HAM_TCKN}, Tel: {_HAM_TEL}).\n"
    "Mahalledeki parkın onarılmasını talep ederim. Ayrıca su faturamdaki "
    "hatanın düzeltilmesini de rica ederim."
)


def _yakalayan():
    """llm_json imzasında yakalayıcı sahte — gönderilen `user` payload'unu saklar, None döndürür."""
    kayit: dict[str, str] = {}

    async def _fake(system, user, **kwargs):
        kayit["user"] = user
        return None

    return kayit, _fake


def _pii_yok(user: str) -> None:
    """Payload'ta ham TCKN ve telefon (boşluk/tire duyarsız) bulunmamalı."""
    assert _HAM_TCKN not in user, "HAM TCKN dış LLM'e sızdı"
    duz = user.replace(" ", "").replace("-", "")
    assert _HAM_TEL.replace(" ", "") not in duz, "HAM telefon dış LLM'e sızdı"


class TestLlmPiiSizintiGuard:
    """8 çekirdek node'un dış LLM çağrısında ham sayısal PII maskeli gitmeli."""

    async def test_cikar_llm_ye_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(cikar_mod, "llm_json", fake)
        await cikar_mod.cikar_node({"evrak_text": _METIN})
        assert "user" in kayit, "cikar llm_json'u çağırmadı — test yolu kırık"
        _pii_yok(kayit["user"])

    async def test_ozetle_llm_ye_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(ozetle_mod, "llm_json", fake)
        await ozetle_mod.ozetle_node({"evrak_text": _METIN, "evrak_turu": "dilekce"})
        assert "user" in kayit, "ozetle llm_json'u çağırmadı — test yolu kırık"
        _pii_yok(kayit["user"])

    async def test_siniflandir_llm_ye_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(siniflandir_mod, "llm_json", fake)
        await siniflandir_mod.siniflandir_node({"evrak_text": _METIN})
        assert "user" in kayit, "siniflandir llm_json'u çağırmadı — test yolu kırık"
        _pii_yok(kayit["user"])

    async def test_eksik_tespit_llm_ye_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(eksik_mod, "llm_json", fake)
        # bilgi_unsurlari boş → zorunlu alanlar eksik → _llm_sorular çağrılır
        await eksik_mod.eksik_tespit_node({"evrak_text": _METIN, "evrak_turu": "dilekce"})
        assert "user" in kayit, "eksik_tespit llm_json'u çağırmadı — test yolu kırık"
        _pii_yok(kayit["user"])

    async def test_decompose_llm_ye_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(decompose_mod, "llm_json", fake)
        await decompose_mod.decompose_node({"evrak_text": _METIN})
        assert "user" in kayit, "decompose çok-konulu LLM segmentini çağırmadı — test yolu kırık"
        _pii_yok(kayit["user"])

    # --- Bug-avı 2026-07-23: yan LLM yolları da maskeli (eskalasyon/route/crag) ---

    async def test_siniflandir_eskalasyon_ham_pii_gitmez(self, monkeypatch):
        # Birincil LLM 'belirsiz' → reasoner eskalasyonu; ona da maskeli metin gitmeli.
        kayit = {}

        async def _esk_yakala(raw):
            kayit["raw"] = raw
            return None

        async def _fake_llm(system, user, **kwargs):
            return {"evrak_turu": "belirsiz", "tur_confidence": 0.5}

        monkeypatch.setattr(siniflandir_mod, "llm_json", _fake_llm)
        monkeypatch.setattr(siniflandir_mod, "_eskalasyon_ikinci_gorus", _esk_yakala)
        monkeypatch.setattr(siniflandir_mod, "SINIFLANDIR_ESKALASYON", True)
        monkeypatch.setattr(siniflandir_mod, "SELF_CONSISTENCY_N", 1)
        await siniflandir_mod.siniflandir_node({"evrak_text": _METIN})
        assert "raw" in kayit, "eskalasyon tetiklenmedi — test yolu kırık"
        _pii_yok(kayit["raw"])

    async def test_route_birim_llm_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(route_mod, "llm_json", fake)
        monkeypatch.setattr(route_mod, "real_llm", lambda: object())  # LLM dalını aç
        await route_mod._route_birim_impl({"evrak_text": _METIN, "evrak_turu": "belirsiz"})
        assert "user" in kayit, "route_birim LLM dalı çağrılmadı — test yolu kırık"
        _pii_yok(kayit["user"])

    async def test_crag_mevzuat_terimleri_ham_pii_gitmez(self, monkeypatch):
        kayit, fake = _yakalayan()
        monkeypatch.setattr(crag_mod, "llm_json", fake)
        await crag_mod._llm_mevzuat_terimleri({"evrak_text": _METIN, "evrak_turu": "dilekce"})
        assert "user" in kayit, "crag terimler LLM'i çağrılmadı — test yolu kırık"
        _pii_yok(kayit["user"])
