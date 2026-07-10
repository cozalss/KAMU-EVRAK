"""AI Bürokrasi Kurulu — DeepSeek destekli çok-ajanlı müzakere motoru testleri.

Sözleşme (muzakere.js ile hizalı + backend güven sınırı):
  - real_llm yok/mock → None (frontend deterministik muzakere.js'e düşer, mock ayakta).
  - LLM çıktısı normalize edilir: turlar/öneriler kapalı-küme üye+tip'e eşlenir, gövde temizlenir.
  - KARAR daima deterministik (risk bandı + çözülmemiş itiraz) — LLM'in dediği bağlamaz.
  - uzlaşı metni revize-guard'dan geçer; şüpheli kısalma/uzama → orijinal taslak korunur (uydurma yok).
  - Mevzuat/sinyal grounding: normalize LLM'in uydurduğu üye/tip'i düşürür.
"""

from __future__ import annotations

from yazi import kurul

TASLAK = (
    "T.C.\nANKARA VALİLİĞİ\nYazı İşleri Müdürlüğü\n\n"
    "Sayı : E-2026/1502\nKonu : Bilgi Edinme Başvurusu\n\n"
    "İlgi : 02.07.2026 tarihli başvurunuz.\n\n"
    "İşbu talebinize binaen, talep edilen bilgiler 4982 sayılı Kanun kapsamında "
    "değerlendirilmiştir. Söz konusu bilgiler 15 iş günü içinde iletilecektir.\n\n"
    "Bilgilerinize saygıyla sunulur."
)

META = {
    "yazi_turu": "cevabi_yazi", "evrak_turu": "dilekce", "hedef_birim": "yazi_isleri_evrak",
    "bilgi_unsurlari": {"konu": "Bilgi edinme"}, "evrak_text": "Bilgi talebi dilekçesi.",
    "mevzuat": [{"baslik": "4982 sayılı Bilgi Edinme Hakkı Kanunu m.11"}], "nli": [],
}
SINYAL_TEMIZ = {"verify_uyari": [], "lint_2646": {"kurallar": [], "uyari": []},
                "tutarlilik_uyari": [], "risk_metadata": {"bant": "yesil"}}
SINYAL_SARI = {"verify_uyari": ["'5018' kaynak evrakta geçmiyor"],
               "lint_2646": {"kurallar": [{"madde": "m.15", "durum": "uyari", "mesaj": "İlgi atfı eksik."}], "uyari": ["İlgi atfı eksik."]},
               "tutarlilik_uyari": [], "risk_metadata": {"bant": "sari"}}


def _fake_llm_obj(uzlasi=TASLAK, turlar=None, oneriler=None):
    return {
        "turlar": turlar if turlar is not None else [
            {"uye": "taslakci", "soz": "Taslağı 2646 formatında hazırladım."},
            {"uye": "vatandas", "soz": "'İşbu talebinize binaen' ağır; sadeleştirilebilir."},
            {"uye": "hukukcu", "soz": "4982 m.11 dayanağı sağlam."},
        ],
        "oneriler": oneriler if oneriler is not None else [
            {"tip": "duzelt", "dayanak": "uslup", "aciklama": "'İşbu talebinize binaen' yerine 'Başvurunuz üzerine'.", "uygula": True},
        ],
        "uzlasi_metni": uzlasi,
    }


class TestFallbackSozlesmesi:
    async def test_real_llm_yoksa_none(self, monkeypatch):
        # mock modda LLM yolu HİÇ açılmaz → None (frontend deterministik motora düşer)
        monkeypatch.setattr(kurul, "real_llm", lambda: None)
        sonuc = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert sonuc is None

    async def test_llm_json_bos_donerse_none(self, monkeypatch):
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _bos(*a, **k):
            return None
        monkeypatch.setattr(kurul, "llm_json", _bos)
        assert await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ) is None


class TestNormalize:
    async def test_turlar_ve_oneriler_normalize(self, monkeypatch):
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj()
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["kaynak"] == "llm"
        assert {t["who"] for t in r["turlar"]} <= {"taslakci", "hukukcu", "vatandas"}
        assert all(t["text"] for t in r["turlar"])
        assert r["oneriler"][0]["tip"] == "duzelt"
        assert r["oneriler"][0]["metin"]

    async def test_uydurma_uye_ve_tip_dusurulur(self, monkeypatch):
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(
                turlar=[{"uye": "baskan", "soz": "geçersiz üye"}, {"uye": "hukukcu", "soz": "geçerli"}],
                oneriler=[{"tip": "sil", "aciklama": "geçersiz tip"}, {"tip": "ekle", "dayanak": "verify", "aciklama": "İmza bloğu eklenmeli."}],
            )
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert all(t["who"] in {"taslakci", "hukukcu", "vatandas"} for t in r["turlar"])
        assert all(o["tip"] in {"duzelt", "ekle", "cikar"} for o in r["oneriler"])
        assert any(o["tip"] == "ekle" for o in r["oneriler"])


class TestKararDeterministik:
    async def test_yesil_uzlasti_kirmizi_sevk(self, monkeypatch):
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj()
        monkeypatch.setattr(kurul, "llm_json", _fake)
        temiz = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert temiz["karar"] == "uzlasti"
        sari = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_SARI)
        assert sari["karar"] == "serhli"
        kirmizi = await kurul.kurul_muzakere(
            TASLAK, meta=META, sinyaller={**SINYAL_TEMIZ, "risk_metadata": {"bant": "kirmizi"}})
        assert kirmizi["karar"] == "sevk"

    async def test_llm_karar_iddiasi_baglamaz(self, monkeypatch):
        # LLM "uzlaşıldı" dese bile kırmızı bant → sevk (karar sunucuda deterministik)
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return {**_fake_llm_obj(), "karar": "uzlasti"}
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(
            TASLAK, meta=META, sinyaller={**SINYAL_TEMIZ, "risk_metadata": {"bant": "kirmizi"}})
        assert r["karar"] == "sevk"


class TestUzlasiGrounding:
    async def test_yeni_mevzuat_atifi_reddedilir(self, monkeypatch):
        # Uzlaşı, orijinalde OLMAYAN "657 sayılı" kanunu ekliyorsa → uydurma; orijinal korunur.
        yeni = TASLAK.replace("4982 sayılı Kanun kapsamında",
                              "4982 ve 657 sayılı Kanunlar kapsamında")
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(uzlasi=yeni)
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["uzlasi_metni"] == TASLAK           # yeni kanun no eklenemez (grounding)
        assert r["uzlasi_degisti"] is False

    async def test_mevcut_mevzuatin_yeniden_ifadesi_gecer(self, monkeypatch):
        # Orijinalde ZATEN olan 4982'yi koruyup üslup değişikliği → grounding'i geçer.
        yeni = TASLAK.replace("İşbu talebinize binaen, talep edilen",
                              "Başvurunuz üzerine, talep edilen")
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(uzlasi=yeni)
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["uzlasi_degisti"] is True

    async def test_asiri_uzama_reddedilir(self, monkeypatch):
        yeni = TASLAK + ("\nEk paragraf. " * 200)   # ~2x üstü şişme → sessiz padding
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(uzlasi=yeni)
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["uzlasi_degisti"] is False


class TestKararIstemciyeBagliDegil:
    async def test_istemci_nli_karari_etkilemez(self, monkeypatch):
        # İstemci mevzuat_nli ile karar yumuşatamaz — itiraz yalnız SUNUCU sinyalinden.
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj()
        monkeypatch.setattr(kurul, "llm_json", _fake)
        meta_nli = {**META, "nli": [{"baslik": "x", "entailment": False}]}
        r = await kurul.kurul_muzakere(TASLAK, meta=meta_nli, sinyaller=SINYAL_TEMIZ)
        assert r["karar"] == "uzlasti"   # yeşil bant + sunucu itirazı yok → uzlaşı


class TestUzlasiGuard:
    async def test_supheli_kisalma_orijinali_korur(self, monkeypatch):
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(uzlasi="Kısa.")   # revize-guard şüpheli kısalmayı reddeder
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["uzlasi_metni"] == TASLAK           # orijinal korunur, sahte metin yok
        assert r["uzlasi_degisti"] is False

    async def test_gecerli_revizyon_uygulanir(self, monkeypatch):
        yeni = TASLAK.replace("İşbu talebinize binaen, talep edilen",
                              "Başvurunuz üzerine, talep edilen")
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(uzlasi=yeni)
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert "Başvurunuz üzerine" in r["uzlasi_metni"]
        assert r["uzlasi_degisti"] is True

    async def test_kirmizi_bantta_bile_revize_uygulanabilir(self, monkeypatch):
        # REVİZYON KURULU: yüksek riskte bile revize uygulanabilir (revizyon riski GİDERİR).
        yeni = TASLAK.replace("İşbu talebinize binaen, talep edilen",
                              "Başvurunuz üzerine, talep edilen")
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_llm_obj(uzlasi=yeni)
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(
            TASLAK, meta=META, sinyaller={**SINYAL_TEMIZ, "risk_metadata": {"bant": "kirmizi"}})
        assert r["uzlasi_uygulanabilir"] is True
        assert r["karar"] == "sevk"   # karar yalnız risk rozeti — uygulamayı engellemez
