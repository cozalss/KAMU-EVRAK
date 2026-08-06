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
                "aktif_kurum": "Nilüfer Belediyesi",
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

    def test_arama_baglami_isim_verilmeden_de_cokmez(self):
        """`isim` bilinmiyorsa maskeleme atlanır ama fonksiyon çalışmaya devam eder."""
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
