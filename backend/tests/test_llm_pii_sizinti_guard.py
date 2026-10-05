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

    async def test_decompose_llm_cagirmaz_ve_alt_talepte_ham_pii_yok(self):
        # 2026-10: decompose dış LLM'e hiç gitmez (talep kümesi cikar'da çıkarılır);
        # türettiği alt talep alanlarında (ozet/konu/kanit) ham PII bulunmamalı.
        assert not hasattr(decompose_mod, "llm_json"), "decompose yeniden LLM'e bağlanmış"
        out = await decompose_mod.decompose_node({"evrak_text": _METIN})
        assert len(out["alt_talepler"]) == 2
        _pii_yok(str(out["alt_talepler"]))

    async def test_talep_kumesinde_ham_pii_yok(self, monkeypatch):
        # LLM kanıtı maskeli metinden alıntılar; yine de çıktı alanları süzgeçten geçer.
        async def _fake(system, user, **kwargs):
            return {"talepler": [{"kanit": "Mahalledeki parkın onarılmasını talep ederim",
                                  "ozet": f"Park onarımı {_HAM_TCKN}", "tur": "talep"}]}
        monkeypatch.setattr(cikar_mod, "llm_json", _fake)
        bu = (await cikar_mod.cikar_node({"evrak_text": _METIN}))["bilgi_unsurlari"]
        _pii_yok(str(bu["talep_kumesi"]) + str(bu["gelen_evrak"]))

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


class TestKonuSatiriIsimSizintisi:
    """KİŞİ ADI da PII'dir — sayısal PII'nin maskelenmesi tek başına yetmez.

    2026-08-06 denetiminde ölçüldü: `route_ajan` gövdeyi `mask_for_llm(text, isim)` ile
    "[AD]" yaparken, `bilgi_unsurlari["konu"]` alanını HAM alıyordu. `cikar` konuya yalnız
    TCKN/telefon temizliği uyguluyor, ismi bırakıyor. Sonuç: aynı prompt'ta gövde
    "Konu: [AD]'in tahsis talebi" derken konu satırı "EVRAK KONUSU: Ayşe Yılmaz'ın tahsis
    talebi" yazıyordu — maskeleme tek satırla delinmişti.
    """

    async def test_konu_satirindaki_ISIM_llm_prompta_gitmez(self, monkeypatch):
        import agents.nodes.route_ajan as ajan_mod

        kayit, fake = _yakalayan()
        monkeypatch.setattr(ajan_mod, "llm_json", fake)
        monkeypatch.setattr(ajan_mod, "real_llm", lambda: object())
        await ajan_mod.route_ajan(
            {
                "evrak_text": _METIN,
                "bilgi_unsurlari": {
                    "gonderen": "Ayşe Yılmaz",
                    "konu": "Ayşe Yılmaz'ın park onarımı talebi",
                    "talepler": ["Ayşe Yılmaz için parkın onarılması"],
                },
            },
            {"birim_alternatifleri": []},
        )
        user = kayit.get("user", "")
        assert user, "LLM çağrılmadı — test anlamsız"
        assert "Ayşe Yılmaz" not in user, "konu/talep satırındaki ham İSİM dış LLM'e sızdı"
        _pii_yok(user)

    def test_isim_YOKKEN_de_sayisal_PII_maskelenir(self):
        """`isim` boşsa maskeleme TAMAMEN atlanıyordu — IBAN ham gidiyordu.

        `mask_for_llm` iki iş yapar: isim redaksiyonu (isim gerektirir) ve `mask_pii`
        (TCKN/telefon/IBAN, isim gerektirmez). İlk yazım `if isim else s` ile kısa devre
        yapıp ikisini birden atlıyordu. Gönderen adı çıkarılamayan evrak (hitapsız üst
        yazı, ödeme emri) hiç de nadir değil ve `cikar._PII_SCAN` yalnız TCKN/telefon
        tarar — IBAN'ın tek savunması burasıydı.
        """
        from agents.nodes.route_ajan import _arama_baglami

        iban = "TR33 0006 1005 1978 6457 8413 26"
        konu, arama = _arama_baglami(
            {"konu": f"{iban} IBAN'ına ödenek aktarımı, tel {_HAM_TEL}",
             "talepler": [f"TCKN {_HAM_TCKN} için işlem"]},
            "gövde metni",
        )
        assert iban not in konu, "HAM IBAN maskelenmedi (isim yokken maskeleme atlanıyor)"
        assert iban not in arama
        _pii_yok(konu)
        _pii_yok(arama)
        assert "ödenek aktarımı" in konu, "maskeleme metnin geri kalanını da silmiş"

    def test_arama_baglami_bos_girdide_cokmez(self):
        from agents.nodes.route_ajan import _arama_baglami

        konu, arama = _arama_baglami({"konu": "park onarımı"}, "gövde metni")
        assert konu == "park onarımı"
        assert "park onarımı" in arama


class TestYapisalMaskeleme:
    """`mask_yapisal` — dict/list araç çıktısındaki metin DEĞERLERİ maskelenmeli.

    Bu, `mask_for_llm`'in yapı-farkında karşılığı: araç çıktıları dize değil iç içe
    dict/list geliyor ve ekran bloğu maskelenirken bunlar ham gidiyordu.
    """

    def test_ic_ice_yapidaki_pii_maskelenir(self):
        from api.pii import mask_yapisal

        veri = {
            "kayitlar": [
                {"ad": "Ayşe Yılmaz", "tckn": _HAM_TCKN, "tel": _HAM_TEL},
                {"ad": "Mehmet Demir", "notlar": [f"iletişim: {_HAM_TEL}"]},
            ],
        }
        cikti = mask_yapisal(veri)
        duz = str(cikti)
        assert _HAM_TCKN not in duz, "iç içe yapıdan HAM TCKN sızdı"
        assert _HAM_TEL.replace(" ", "") not in duz.replace(" ", "").replace("-", "")

    def test_anahtarlar_ve_sayilar_korunur(self):
        """Alan adları kişisel veri değil ŞEMADIR; maskelenirse model alanı tanıyamaz."""
        from api.pii import mask_yapisal

        cikti = mask_yapisal({"tckn": "x", "adet": 11111111111, "acik": True, "yok": None})
        assert set(cikti) == {"tckn", "adet", "acik", "yok"}
        assert cikti["adet"] == 11111111111, "int alan dizeye çevrilmiş — şema bozuldu"
        assert cikti["acik"] is True
        assert cikti["yok"] is None

    def test_girdi_mutasyona_ugramaz(self):
        from api.pii import mask_yapisal

        veri = {"a": [{"t": _HAM_TCKN}]}
        mask_yapisal(veri)
        assert veri["a"][0]["t"] == _HAM_TCKN, "kaynak yapı MUTASYONA uğradı"

    def test_asiri_derin_yapi_cokmez(self):
        """Özyineleme tavanı: bozuk/kötü niyetli derin yapı RecursionError vermemeli."""
        from api.pii import mask_yapisal

        derin: dict = {"x": _HAM_TCKN}
        for _ in range(200):
            derin = {"n": derin}
        mask_yapisal(derin)   # patlamamalı


    def test_kompoz_prompt_ham_pii_tasimaz(self):
        """Yazılı yol da aynı sınırdan geçiyor: _kompoz_user'ın ürettiği payload temiz olmalı."""
        from api.routes.sohbet import _kompoz_user

        payload = _kompoz_user(
            "kayıtlarımı listele",
            [{"ad": "Ayşe Yılmaz", "tckn": _HAM_TCKN, "tel": _HAM_TEL}],
        )
        _pii_yok(payload)


class TestMevzuatYollariMaskeli:
    """2026-10-05 incelemesi: mevzuat mesele analizi + alaka yargıcı KİŞİ ADINI maskelemeden
    gönderiyordu (mask_for_llm isim=None); guard bu iki yolu kapsamıyordu."""

    @staticmethod
    def _ad_yok(user: str) -> None:
        assert "Ayşe" not in user and "Yılmaz" not in user, "kişi adı dış LLM'e sızdı"

    async def test_mevzuat_mesele_ham_pii_ve_ad_gitmez(self, monkeypatch):
        import agents.mevzuat_mesele as mesele_mod

        kayit, fake = _yakalayan()
        monkeypatch.setattr(mesele_mod, "llm_json", fake)
        state = {"evrak_text": _METIN, "evrak_turu": "dilekce",
                 "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Ayşe Yılmaz park onarımı"}}
        await mesele_mod.mesele_analizi(state, [{"id": "t1", "metin": "Ben Ayşe Yılmaz, "
                                                 f"TCKN {_HAM_TCKN}, park onarımı"}])
        assert "user" in kayit, "mesele analizi LLM'i çağrılmadı — test yolu kırık"
        _pii_yok(kayit["user"])
        self._ad_yok(kayit["user"])

    async def test_mevzuat_yargic_ham_pii_ve_ad_gitmez(self, monkeypatch):
        import agents.mevzuat_yargic as yargic_mod

        kayit, fake = _yakalayan()
        monkeypatch.setattr(yargic_mod, "llm_json", fake)
        havuz = [{"text": "Madde 4 — Dilekçede bulunması zorunlu şartlar",
                  "source": "3071_dilekce_hakki_kanunu.txt"}]
        await yargic_mod.alaka_yargici(
            [{"id": "t1", "metin": f"Ben Ayşe Yılmaz, TCKN {_HAM_TCKN}, tel {_HAM_TEL}"}],
            {}, havuz, "Ayşe Yılmaz")
        assert "user" in kayit, "yargıç LLM'i çağrılmadı — test yolu kırık"
        _pii_yok(kayit["user"])
        self._ad_yok(kayit["user"])

    async def test_icerik_odakli_yol_gonderen_adini_yargica_iletir(self, monkeypatch):
        """Uçtan uca: icerik_odakli_oneriler state'teki gönderen adını iki çağrıya da taşır."""
        import agents.mevzuat_mesele as mesele_mod
        import agents.mevzuat_yargic as yargic_mod

        giden: list[str] = []

        async def _mesele(system, user, **kwargs):
            giden.append(user)
            return {"talepler": [{"id": "t1", "mesele": "park bakımı", "terimler": ["park"],
                                  "dosyalar": []}]}

        async def _yargic(system, user, **kwargs):
            giden.append(user)
            return {"secim": []}

        monkeypatch.setattr(mesele_mod, "llm_json", _mesele)
        monkeypatch.setattr(yargic_mod, "llm_json", _yargic)
        state = {"evrak_text": _METIN, "evrak_turu": "dilekce",
                 "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "talepler": [
                     f"Ayşe Yılmaz (TCKN {_HAM_TCKN}) parkın onarılmasını talep ediyor"]}}
        await yargic_mod.icerik_odakli_oneriler(state)
        assert len(giden) == 2, "mesele + yargıç çağrılmadı — test yolu kırık"
        for user in giden:
            _pii_yok(user)
            self._ad_yok(user)
