"""Mevzuat korpusu yapısal sözleşmeleri — madde no tekilliği, atıf cümlesi, çerçeve maddesi,
evrakın kendi atfı (2026-10-05 incelemesi).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from agents.mevzuat_atif import atif_onerileri, cerceve_maddesi_mi, evrak_atiflari
from agents.nodes import mevzuat_oner as mo
from retrieval.chunker import chunk_mevzuat
from scripts.seed_mevzuat import madde_no_tekrari

_KORPUS = Path(__file__).resolve().parents[2] / "data" / "mevzuat"


class TestMaddeNoTekilligi:
    @pytest.mark.parametrize("yol", sorted(_KORPUS.glob("*.txt")), ids=lambda p: p.name)
    def test_dosyada_madde_no_tekil(self, yol: Path):
        chunks = chunk_mevzuat(yol.read_text(encoding="utf-8"), subchunk=False)
        anahtar = [(c.metadata.get("madde_no"), c.metadata.get("madde_tur") or "madde")
                   for c in chunks]
        assert madde_no_tekrari(yol.name, anahtar) == []

    def test_lint_tekrari_yakalar(self):
        hatalar = madde_no_tekrari("x.txt", [(42, "madde"), (42, "madde"), (42, "ek")])
        assert len(hatalar) == 1 and "42" in hatalar[0]


class TestChunkerBaslik:
    def test_satir_basi_atif_cumlesi_yeni_madde_degil(self):
        metin = ("Madde 14 — Yasaklar\nMilli parkta avlanmak yasaktır.\n"
                 "Madde 14 ve ilgili hükümlerle yasaklanan fiiller cezalandırılır.\n"
                 "Madde 15 — Ceza\nPara cezası verilir.")
        nolar = [c.metadata.get("madde_no") for c in chunk_mevzuat(metin, subchunk=False)]
        assert nolar == [14, 15]

    def test_parantezli_ve_birlesik_baslik_korunur(self):
        metin = ("Madde 31 — Önceki\nmetin metin.\nMadde 32 / Madde 33 — Yürürlük ve yürütme\n"
                 "Yürürlüğe girer.\nEk Madde 5 (5. fıkra) — Bilgi talebi\nYazılı talep.")
        nolar = [(c.metadata.get("madde_tur"), c.metadata.get("madde_no"))
                 for c in chunk_mevzuat(metin, subchunk=False)]
        assert nolar == [("madde", 31), ("madde", 32), ("ek", 5)]


class TestCerceveMaddesi:
    @pytest.mark.parametrize("baslik", ["Madde 1 — Amaç", "MADDE 2 — Kapsam",
                                        "Madde 3 — Tanımlar (Çiftçi kayıt)",
                                        "Madde 1 — Amaç ve kapsam", "Madde 40 — Yürürlük"])
    def test_cerceve(self, baslik: str):
        assert cerceve_maddesi_mi({"text": f"{baslik}\nmetin"})

    @pytest.mark.parametrize("baslik", ["Madde 7 — Dilekçelerin sonuçlandırılması",
                                        "Madde 18 — Kapsamlı denetim yetkisi"])
    def test_esas_madde_cerceve_degil(self, baslik: str):
        assert not cerceve_maddesi_mi({"text": f"{baslik}\nmetin"})

    def test_bm25_yolu_amac_maddesi_onermez(self):
        oneriler = mo._from_corpus("hasta hakları yönetmeliğinin amacı hasta hakları", "sikayet")
        assert all(not str(o.get("snippet", "")).lower().startswith("amaç") for o in oneriler)
        for o in oneriler:
            chunk = next(c for c in mo._load_index()
                         if mo._kaynak_dosya(c) == o["kaynak_dosya"]
                         and c.get("madde_no") == o["madde_no"]
                         and c.get("madde_tur") == o["madde_tur"])
            assert not cerceve_maddesi_mi(chunk)


class TestEvrakAtfi:
    def test_kisaltma_korpustan_turetilir(self):
        assert ("6100", 389) in evrak_atiflari("HMK'nın 389. maddesi uyarınca tedbir kararı")

    def test_sayili_kanun_atfi(self):
        assert ("3071", 7) in evrak_atiflari(
            "3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 7 nci maddesi")

    def test_korpusta_olan_atif_oneri_olur(self):
        oneriler, eksik = atif_onerileri("3071 sayılı Kanunun 7 nci maddesi gereğince")
        assert [o["madde_no"] for o in oneriler] == [7]
        assert oneriler[0]["katman"] == "atif" and oneriler[0]["yargic"] is False
        assert eksik == []

    def test_korpusta_olmayan_atif_uydurulmaz_dogrula_olur(self):
        oneriler, eksik = atif_onerileri("HMK'nın 389. maddesi gereğince")
        assert oneriler == []
        assert len(eksik) == 1 and eksik[0].startswith("[DOĞRULA:") and "389" in eksik[0]

    async def test_bm25_yolu_atfi_one_alir(self):
        state = {"evrak_turu": "dilekce",
                 "evrak_text": "3071 sayılı Kanunun 7 nci maddesi gereğince cevap bekliyorum.",
                 "bilgi_unsurlari": {"konu": "park onarımı talebi"}}
        out = await mo.mevzuat_oner_node(state)
        ilk = out["mevzuat_onerileri"][0]
        assert ilk["kaynak_dosya"].startswith("3071_") and ilk["madde_no"] == 7


class TestKapsamBoslugu:
    async def test_yargic_bos_donunce_kapsam_boslugu_ve_aranan_kaynak(self, monkeypatch):
        from agents import mevzuat_mesele, mevzuat_yargic

        dosya = next(mo._kaynak_dosya(c) for c in mo._load_index()
                     if "hasta_haklari" in mo._kaynak_dosya(c))

        async def _mesele(system, user, **kwargs):
            return {"talepler": [{"id": "t1", "mesele": "hasta hakkı ihlali şikayeti",
                                  "terimler": ["hasta hakları"], "dosyalar": [dosya]}]}

        gorulen: list[str] = []

        async def _yargic(system, user, **kwargs):
            gorulen.append(user)
            return {"secim": []}

        monkeypatch.setattr(mevzuat_mesele, "llm_json", _mesele)
        monkeypatch.setattr(mevzuat_yargic, "llm_json", _yargic)
        state = {"evrak_turu": "sikayet", "evrak_text": "Hastanede kötü muamele gördüm.",
                 "bilgi_unsurlari": {"talepler": ["Hastanedeki muamelenin incelenmesi"]}}
        out = await mevzuat_yargic.icerik_odakli_oneriler(state)
        d = out["mevzuat_talep_durumu"][0]
        assert d["bulundu"] is False and d["kapsam_boslugu"] is True
        assert d["aranan_kaynaklar"] and "Hasta" in d["aranan_kaynaklar"][0]
        assert not [o for o in out["mevzuat_onerileri"] if o.get("katman") == "esas"]
        # çerçeve maddeleri (m.1 Amaç) yargıca aday olarak bile gitmez
        assert "Amaç" not in gorulen[0]
