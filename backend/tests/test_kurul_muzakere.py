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
# TASLAK'ın gövde satırı — çapalı üslup düzeltmesi (4982/15 KORUNUR, yeni sayı/atıf/ad YOK → grounding'i geçer).
_BODY = ("İşbu talebinize binaen, talep edilen bilgiler 4982 sayılı Kanun kapsamında "
         "değerlendirilmiştir. Söz konusu bilgiler 15 iş günü içinde iletilecektir.")
_USLUP_ONERI = {"tip": "duzelt", "dayanak": "uslup", "capa": _BODY,
                "yeni": _BODY.replace("İşbu talebinize binaen, talep edilen", "Başvurunuz üzerine, talep edilen"),
                "aciklama": "Ağır kalıp sadeleştirilmeli."}
_UYELER = {"taslakci", "hukukcu", "vatandas", "birim_amiri"}   # birim_amiri = 4. üye (kapanış risk sesi)


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
        assert {t["who"] for t in r["turlar"]} <= _UYELER
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
        assert all(t["who"] in _UYELER for t in r["turlar"])
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
        # Çapalı duzelt 'yeni'si orijinalde OLMAYAN "657 sayılı" ekliyorsa → uydurma; orijinal korunur.
        oneri = {**_USLUP_ONERI, "yeni": _USLUP_ONERI["yeni"].replace(
            "4982 sayılı Kanun", "4982 ve 657 sayılı Kanunlar")}
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_capali([oneri])
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["uzlasi_metni"] == TASLAK           # yeni kanun no eklenemez (grounding)
        assert r["uzlasi_degisti"] is False
        assert r["oneriler"][0]["uygulanabilir"] is False

    async def test_mevcut_mevzuatin_yeniden_ifadesi_gecer(self, monkeypatch):
        # Orijinalde ZATEN olan 4982/15'i koruyup üslup değişikliği (çapalı duzelt) → grounding'i geçer.
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_capali([_USLUP_ONERI])
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert r["uzlasi_degisti"] is True
        assert "Başvurunuz üzerine" in r["uzlasi_metni"]

    def test_asiri_uzama_reddedilir(self):
        # _uzlasi_gecerli backstop: aşırı-uzama (sessiz padding) reddedilir.
        assert kurul._uzlasi_gecerli(TASLAK, TASLAK + ("\nEk paragraf. " * 200)) is False


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


FABRIK_TASLAK = (
    "T.C.\nKAMU KURUMU\nYAZI İŞLERİ BİRİMİ\n\n"
    "Sayı : EBYS-TASLAK\n"
    "Konu : Yıllık izin talebi\n\n"
    "Sayın Elif Doğan\n\n"
    "İlgi : 25.05.2026 tarihli başvurunuz.\n"
    "İlgi yazı ile talep edilen yıllık iznin kullanılması uygun görülmüştür.\n\n"
    "Gereğini rica ederim.\n\n"
    "Yetkili İmza\nBirim Yetkilisi"
)
FABRIK_META = {**META, "yazi_turu": "cevabi_yazi", "evrak_text": "Yıllık izin talebi dilekçesi."}
# cikar artık gerçek sinyale bağlı (grounded) — uyarılar çıkarılacak satırların içeriğini işaretler.
FABRIK_SINYAL = {"verify_uyari": [
                    "Taslaktaki 'Sayı : EBYS-TASLAK' ifadesi kaynak evrakta yok",
                    "Taslaktaki 'Sayın Elif Doğan' ifadesi kaynak evrakta yok",
                    "Taslaktaki 'İlgi : 25.05.2026 tarihli başvurunuz.' ifadesi kaynak evrakta yok",
                 ],
                 "lint_2646": {"kurallar": [], "uyari": []}, "tutarlilik_uyari": [],
                 "risk_metadata": {"bant": "kirmizi"}}


def _fake_capali(oneriler, *, turlar=None, uzlasi=None):
    """Yeni sözleşme: öneriler `capa` (taslaktan birebir satır) + `yeni` taşır; sunucu
    çapayı deterministik çözüp uygular. `uzlasi_metni` verilmez — motor editlerden ASSEMBLE eder."""
    return {
        "turlar": turlar if turlar is not None else [{"uye": "hukukcu", "soz": "İncelendi."}],
        "oneriler": oneriler,
        **({"uzlasi_metni": uzlasi} if uzlasi is not None else {}),
    }


def _capali_llm(monkeypatch, obj):
    monkeypatch.setattr(kurul, "real_llm", lambda: object())
    async def _fake(*a, **k):
        return obj
    monkeypatch.setattr(kurul, "llm_json", _fake)


class TestCapaliEditler:
    """ÇEKİRDEK: 'işlendi' bayrağı = gerçekten uygulanan edit. Öneri ⟺ revize diff DAİMA tutarlı.
    Uygulama sunucuda deterministik (çapa çöz → satır sil/değiştir); LLM yalnız yargı verir."""

    async def test_cikar_tam_satir_capasi_uygulanir_ve_diffte(self, monkeypatch):
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "Sayın Elif Doğan",
             "aciklama": "'Sayın Elif Doğan' kaynak evrakta yok, çıkarılmalı."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is True       # edit gerçekten uygulandı
        assert "Sayın Elif Doğan" not in r["uzlasi_metni"]     # satır revize taslaktan çıktı
        assert r["uzlasi_degisti"] is True
        assert r["uzlasi_uygulanabilir"] is True

    async def test_cikar_etiketli_alani_silmez_dogrula_yer_tutucusuna_cevirir(self, monkeypatch):
        # Taslak gönderime-hazır KALMALI: doğrulanamayan Sayı/İlgi alanı SİLİNMEZ, alan adı
        # korunarak '[DOĞRULA: …]' ile işaretlenir (kullanıcı isteği — cikar bir alanı yok etmemeli).
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.",
             "aciklama": "'İlgi' tarihi kaynak evrakta yok, çıkarılmalı."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["tip"] == "duzelt"             # gerçekte uygulanan işlem — rozet artık 'Düzelt'
        assert r["oneriler"][0]["uygulanabilir"] is True
        assert "İlgi : 25.05.2026" not in r["uzlasi_metni"]    # doğrulanamayan içerik kalmadı
        assert "İlgi : [DOĞRULA: kaynak evrakta doğrulanamadı]" in r["uzlasi_metni"]  # alan KORUNDU
        assert len(r["uzlasi_metni"].split("\n")) == len(FABRIK_TASLAK.split("\n"))   # satır sayısı SABİT

    async def test_duzelt_satiri_yeni_ile_degistirir(self, monkeypatch):
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "duzelt", "dayanak": "uslup", "capa": "Gereğini rica ederim.",
             "yeni": "Bilgilerinize rica ederim.", "aciklama": "Cevabi yazıda 'Bilgilerinize' uygundur."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is True
        assert "Bilgilerinize rica ederim." in r["uzlasi_metni"]
        assert "Gereğini rica ederim." not in r["uzlasi_metni"]

    async def test_duzelt_yeni_atif_ekliyorsa_tavsiyeye_duser(self, monkeypatch):
        # duzelt 'yeni'si orijinalde OLMAYAN 657 atfı ekliyor → grounding reddeder, satır korunur.
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "duzelt", "dayanak": "dayanak",
             "capa": "İlgi yazı ile talep edilen yıllık iznin kullanılması uygun görülmüştür.",
             "yeni": "Talep edilen izin 657 sayılı Kanun m.102 uyarınca uygun görülmüştür.",
             "aciklama": "657 dayanağı eklenmeli."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False      # uydurma atıf → uygulanmaz (tavsiye)
        assert "657 sayılı" not in r["uzlasi_metni"]
        assert "uygun görülmüştür." in r["uzlasi_metni"]        # orijinal satır korunur

    async def test_ekle_daima_tavsiye_yeni_icerik_enjekte_edilmez(self, monkeypatch):
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "ekle", "dayanak": "dayanak", "yeni": "657 sayılı Kanun m.102-103 dayanağı",
             "aciklama": "Dayanak eklenmeli."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False      # yeni içerik otomatik eklenmez
        assert "657 sayılı" not in r["uzlasi_metni"]
        assert r["uzlasi_degisti"] is False

    async def test_belirsiz_capa_hicbir_satir_degistirmez(self, monkeypatch):
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "taslakta bulunmayan bir satir xyz",
             "aciklama": "..."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False
        assert r["uzlasi_degisti"] is False

    async def test_phrase_capa_mesru_satiri_nuke_etmez(self, monkeypatch):
        # 'uygun görülmüştür' bir cümle-içi ifade; TAM satır değil → çıkar meşru satırı silmez (aşırı-silme guard).
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "uygun görülmüştür",
             "aciklama": "..."},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False
        assert "yıllık iznin kullanılması uygun görülmüştür" in r["uzlasi_metni"]

    async def test_koherans_invariant_karma_oneriler(self, monkeypatch):
        # Karma set: 2 çözülür-çıkar (uygulanır) + 1 ekle (tavsiye) + 1 belirsiz-çıkar (tavsiye).
        # INVARIANT: uygulanabilir == True ⟺ öneri revize diff'te GERÇEKTEN bir satır değiştirdi.
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "Sayın Elif Doğan", "aciklama": "a"},
            {"tip": "cikar", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.", "aciklama": "b"},
            {"tip": "ekle", "dayanak": "dayanak", "yeni": "657 sayılı Kanun", "aciklama": "c"},
            {"tip": "cikar", "dayanak": "verify", "capa": "olmayan satir", "aciklama": "d"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        uz, ta = r["uzlasi_metni"], FABRIK_TASLAK
        uygulanan = [o for o in r["oneriler"] if o["uygulanabilir"]]
        assert len(uygulanan) == 2                              # yalnız iki çözülür-çıkar
        assert "Sayın Elif Doğan" not in uz
        assert "İlgi : 25.05.2026" not in uz
        assert "İlgi : [DOĞRULA:" in uz                         # etiketli alan SİLİNMEDİ, yer tutucuya çevrildi
        assert "657 sayılı Kanun" not in uz                     # ekle tavsiye → enjekte edilmedi
        # in-diff invariant: "Sayın Elif Doğan" (etiketsiz) TAM SATIR silindi (-1); "İlgi :" (etiketli
        # alan) SİLİNMEDİ, yerinde '[DOĞRULA]' yer tutucusuyla değişti (satır sayısı sabit) → toplam -1.
        assert len(uz.split("\n")) == len(ta.split("\n")) - 1
        assert r["uzlasi_degisti"] is True

    async def test_uydurma_taslak_gercek_grounded_revize_uretir(self, monkeypatch):
        # DEMO YILDIZI: kırmızı-bant uydurma taslak → kurul uydurma satırları GERÇEKTEN çıkarır.
        _capali_llm(monkeypatch, _fake_capali(
            oneriler=[
                {"tip": "cikar", "dayanak": "verify", "capa": "Sayı : EBYS-TASLAK", "aciklama": "a"},
                {"tip": "cikar", "dayanak": "verify", "capa": "Sayın Elif Doğan", "aciklama": "b"},
                {"tip": "cikar", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.", "aciklama": "c"},
            ],
            turlar=[{"uye": "hukukcu", "soz": "Tarih ve kişi adı kaynakta yok."},
                    {"uye": "vatandas", "soz": "Doğrulanamayan bilgiler çıkmalı."}]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["karar"] == "sevk"                             # kırmızı bant rozeti
        assert r["uzlasi_uygulanabilir"] is True               # ama revize YİNE uygulanabilir (risk giderir)
        assert all(o["uygulanabilir"] for o in r["oneriler"])  # üçü de çözüldü ve uygulandı
        assert "EBYS-TASLAK" not in r["uzlasi_metni"]
        assert "Sayın Elif Doğan" not in r["uzlasi_metni"]


def _debate_llm(monkeypatch, acilis, muzakere):
    """2-çağrı debate mock'u: 1. çağrı AÇILIŞ objesini, 2. çağrı ÇAPRAZ-ELEŞTİRİ+öneriler objesini döner."""
    monkeypatch.setattr(kurul, "real_llm", lambda: object())
    calls = {"n": 0}
    async def _fake(system, user, **k):
        calls["n"] += 1
        return acilis if calls["n"] == 1 else muzakere
    monkeypatch.setattr(kurul, "llm_json", _fake)
    return calls


_ACILIS = {"turlar": [
    {"uye": "taslakci", "soz": "Taslağı 2646 formatında hazırladım; yapı yerinde."},
    {"uye": "hukukcu", "soz": "İlgi satırındaki tarih kaynak evrakta doğrulanamıyor."},
    {"uye": "vatandas", "soz": "Kapanış kalıbı cevabi yazı için ağır."},
]}


class TestDebate:
    """Çok-turlu DEBATE: açılış (tur 0) → çapraz-eleştiri (tur 1, yanit+tutum) → moderatör (tur 9).
    Araştırma-kilitli (MAD/Du et al.): 2. çağrı GERÇEK açılışı görür → genuine yanıt; grounding
    değişmez (öneriler hâlâ anchored-edit), moderatör deterministik, sahte oybirliği yok.
    Ölçer (`olc`) verilmediğinde döngü tek turda kalır — bu sınıf o (eski) yolu kilitler."""

    async def test_iki_cagri_cok_turlu_turlar(self, monkeypatch):
        muz = {"turlar": [
            {"uye": "hukukcu", "yanit": "taslakci", "tutum": "karsi", "soz": "Yapıyı savundun ama tarih uydurma."},
            {"uye": "taslakci", "yanit": "hukukcu", "tutum": "katil", "soz": "Haklısın, o satırı çıkaralım."},
            {"uye": "vatandas", "yanit": "hukukcu", "tutum": "gelistir", "soz": "Ayrıca kapanışı sadeleştirelim."},
        ], "oneriler": [
            {"tip": "cikar", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.", "aciklama": "tarih doğrulanamadı"},
        ]}
        calls = _debate_llm(monkeypatch, _ACILIS, muz)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert calls["n"] == 2                                  # İKİ çağrı (açılış + müzakere)
        turlar = r["turlar"]
        assert {t["tur"] for t in turlar} == {0, 1, 9}          # açılış · çapraz · karar
        assert sum(1 for t in turlar if t["tur"] == 0) == 3     # 3 açılış
        assert sum(1 for t in turlar if t["tur"] == 1) == 3     # 3 çapraz-eleştiri
        assert len(turlar) >= 7                                 # açılış+çapraz+moderatör (kısa değil)

    async def test_capraz_referans_yanit_ve_tutum(self, monkeypatch):
        muz = {"turlar": [
            {"uye": "hukukcu", "yanit": "taslakci", "tutum": "karsi", "soz": "Karşı çıkıyorum."},
            {"uye": "baskan", "yanit": "x", "tutum": "yok", "soz": "geçersiz üye düşer"},
        ], "oneriler": []}
        _debate_llm(monkeypatch, _ACILIS, muz)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        capraz = [t for t in r["turlar"] if t["tur"] == 1]
        assert len(capraz) == 1                                 # uydurma üye düştü
        assert capraz[0]["yanit"] == "taslakci" and capraz[0]["tutum"] == "karsi"
        assert all(t["who"] in _UYELER for t in r["turlar"])

    async def test_grounding_debate_yolunda_korunur(self, monkeypatch):
        # Debate 2. çağrısındaki öneriler HÂLÂ anchored-edit'ten geçer; uydurma atıf reddedilir.
        muz = {"turlar": [{"uye": "hukukcu", "yanit": "taslakci", "tutum": "karsi", "soz": "x"}],
               "oneriler": [
                   {"tip": "cikar", "dayanak": "verify", "capa": "Sayın Elif Doğan", "aciklama": "kaynakta yok"},
                   {"tip": "duzelt", "dayanak": "dayanak", "capa": "Gereğini rica ederim.",
                    "yeni": "657 sayılı Kanun uyarınca gereği rica edilir.", "aciklama": "uydurma atıf"},
               ]}
        _debate_llm(monkeypatch, _ACILIS, muz)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        uyg = [o for o in r["oneriler"] if o["uygulanabilir"]]
        assert any(o["metin"] and "657" not in r["uzlasi_metni"] for o in uyg)  # 657 sızmadı
        assert "Sayın Elif Doğan" not in r["uzlasi_metni"]      # grounded çıkar uygulandı
        assert "657 sayılı" not in r["uzlasi_metni"]            # uydurma atıf duzelt reddedildi

    async def test_moderator_kapanista_karar_turu(self, monkeypatch):
        _debate_llm(monkeypatch, _ACILIS, {"turlar": [{"uye": "hukukcu", "soz": "x"}], "oneriler": []})
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        amir = [t for t in r["turlar"] if t["who"] == "birim_amiri"]
        assert len(amir) == 1 and amir[0]["tur"] == 9 and amir[0]["kaynak"] == "risk_guard"
        # Ölçüm yoksa kazanım cümlesi de YOK — kanıtsız iyileşme iddia edilmez.
        assert "yeniden ölçüldü" not in amir[0]["text"]

    async def test_acilis_yoksa_none(self, monkeypatch):
        _debate_llm(monkeypatch, {"turlar": []}, {"turlar": [{"uye": "hukukcu", "soz": "x"}], "oneriler": []})
        assert await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL) is None

    async def test_stream_acilis_sonra_sonuc(self, monkeypatch):
        # CANLI AKIŞ: önce 'acilis' (açılış turları) sonra 'sonuc' (tam kurgu) yield edilir.
        muz = {"turlar": [{"uye": "hukukcu", "yanit": "taslakci", "tutum": "karsi", "soz": "Tarih uydurma."}],
               "oneriler": [{"tip": "cikar", "dayanak": "verify", "capa": "Sayın Elif Doğan", "aciklama": "a"}]}
        _debate_llm(monkeypatch, _ACILIS, muz)
        olaylar = [(ad, veri) async for ad, veri in
                   kurul.kurul_muzakere_stream(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)]
        # Her müzakere turu HAZIR OLDUKÇA yayılır ('tur'), sonda tam kurgu ('sonuc') gelir.
        assert [a for a, _ in olaylar] == ["acilis", "tur", "sonuc"]
        assert len(olaylar[0][1]["turlar"]) == 3                 # 3 açılış turu önce gelir
        assert olaylar[1][1]["tur"] == 1 and olaylar[1][1]["turlar"]          # çapraz tur canlı
        assert olaylar[2][1]["kaynak"] == "llm" and olaylar[2][1]["turlar"]   # sonra tam kurgu
        assert "Sayın Elif Doğan" not in olaylar[2][1]["uzlasi_metni"]        # grounding stream'de de korunur

    async def test_stream_acilis_yoksa_bos(self, monkeypatch):
        _debate_llm(monkeypatch, {"turlar": []}, {"turlar": [{"uye": "hukukcu", "soz": "x"}], "oneriler": []})
        olaylar = [x async for x in kurul.kurul_muzakere_stream(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)]
        assert olaylar == []   # açılış yoksa hiçbir şey yayılmaz → frontend deterministik fallback

    async def test_muzakere_bozuksa_none(self, monkeypatch):
        _debate_llm(monkeypatch, _ACILIS, None)
        assert await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL) is None


class TestSertlestirme:
    """Adversarial + fastapi-reviewer bulgularının regresyon kilitleri (CLAUDE.md §1 + koherans)."""

    async def test_duzelt_uydurma_ad_tarih_ekleyemez(self, monkeypatch):
        # CRITICAL: duzelt 'yeni'si uydurma AD + TARİH enjekte ediyor → reddedilir (yalnız atıf değil).
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "duzelt", "dayanak": "verify", "capa": "İlgi : 25.05.2026 tarihli başvurunuz.",
             "yeni": "İlgi : 25.05.2026 tarihli başvurunuz ve Ahmet Yılmaz'ın 10.01.2020 tarihli yazısı.",
             "aciklama": "ek atıf"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False
        assert "Ahmet Yılmaz" not in r["uzlasi_metni"]
        assert "10.01.2020" not in r["uzlasi_metni"]

    async def test_duzelt_ciplak_uydurma_ad_reddedilir(self, monkeypatch):
        # Tarih olmasa bile 2+ Büyük-harf ad/unvan dizisi (Ahmet Yılmaz) uydurma sayılır.
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "duzelt", "dayanak": "uslup", "capa": "Gereğini rica ederim.",
             "yeni": "Ahmet Yılmaz tarafından gereği rica edilir.", "aciklama": "x"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False
        assert "Ahmet Yılmaz" not in r["uzlasi_metni"]

    async def test_holistik_uzlasi_kullanilmaz(self, monkeypatch):
        # CRITICAL: obj.uzlasi_metni (LLM holistik yeniden-yazımı) ARTIK YOK SAYILIR — yalnız
        # ekle önerisi + uydurma içeren holistik metin → revize orijinal kalır (attribution korunur).
        kirli = FABRIK_TASLAK + "\nAhmet Yılmaz, Şube Müdürü, 10.01.2020"
        _capali_llm(monkeypatch, _fake_capali(
            [{"tip": "ekle", "dayanak": "dayanak", "yeni": "İmza bloğu", "aciklama": "ekle"}],
            uzlasi=kirli))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["uzlasi_metni"] == FABRIK_TASLAK        # holistik metin kullanılmadı
        assert r["uzlasi_degisti"] is False
        assert "Ahmet Yılmaz" not in r["uzlasi_metni"]

    async def test_cok_satir_capa_yanlis_satir_silmez(self, monkeypatch):
        # CRITICAL: iki satırı birleştiren çapa → belirsiz sayılır, YANLIŞ (karar) satırını silmez.
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify",
             "capa": "İlgi : 25.05.2026 tarihli başvurunuz. İlgi yazı ile talep edilen yıllık iznin kullanılması uygun görülmüştür.",
             "aciklama": "x"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False
        assert "uygun görülmüştür" in r["uzlasi_metni"]   # karar satırı KORUNDU

    async def test_dup_capa_yalniz_kazanan_islenir(self, monkeypatch):
        # HIGH: aynı satıra iki duzelt → yalnız biri uygulanır, DİĞERİ 'işlendi' işaretlenmez.
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "duzelt", "dayanak": "uslup", "capa": "Gereğini rica ederim.",
             "yeni": "Bilgilerinize rica ederim.", "aciklama": "a"},
            {"tip": "duzelt", "dayanak": "uslup", "capa": "Gereğini rica ederim.",
             "yeni": "Saygılarımla arz ederim.", "aciklama": "b"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert sum(o["uygulanabilir"] for o in r["oneriler"]) == 1   # yalnız kazanan
        assert "Bilgilerinize rica ederim." in r["uzlasi_metni"]

    async def test_cikar_sinyalsiz_satiri_kaldirmaz(self, monkeypatch):
        # cikar YALNIZ gerçek sinyalin işaretlediği içeriği kaldırır — meşru gövde satırı KORUNUR.
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify",
             "capa": "İlgi yazı ile talep edilen yıllık iznin kullanılması uygun görülmüştür.",
             "aciklama": "x"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False   # bu satır hiçbir uyarıda yok
        assert "uygun görülmüştür" in r["uzlasi_metni"]

    async def test_yapisal_satir_cikarilamaz(self, monkeypatch):
        # T.C./Konu satırı sinyalde geçse bile ASLA çıkarılmaz (biçim taşıyıcısı).
        sinyal = {**FABRIK_SINYAL, "verify_uyari": ["Taslaktaki 'Konu : Yıllık izin talebi' doğrulanamadı"]}
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "Konu : Yıllık izin talebi", "aciklama": "x"},
        ]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=sinyal)
        assert r["oneriler"][0]["uygulanabilir"] is False
        assert "Konu : Yıllık izin talebi" in r["uzlasi_metni"]

    async def test_birim_amiri_turu_risk_bandindan_deterministik(self, monkeypatch):
        # Birim Amiri (4. üye) her zaman kapanışta konuşur; sözü gerçek risk bandından türer (LLM değil).
        _capali_llm(monkeypatch, _fake_capali([{"tip": "duzelt", "dayanak": "uslup",
            "capa": "Gereğini rica ederim.", "yeni": "Bilgilerinize rica ederim.", "aciklama": "x"}]))
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        amir = [t for t in r["turlar"] if t["who"] == "birim_amiri"]
        assert len(amir) == 1 and amir[0]["kaynak"] == "risk_guard"
        assert "kırmızı" in amir[0]["text"]                 # bant=kirmizi → kırmızı sözü
        yesil = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                           sinyaller={**FABRIK_SINYAL, "risk_metadata": {"bant": "yesil"}})
        assert "yeşil" in next(t for t in yesil["turlar"] if t["who"] == "birim_amiri")["text"]

    def test_atiflar_yaygin_turkce_formlari_yakalar(self):
        # CRITICAL: 1-2 haneli CBK ("3 sayılı"), ters madde ("125 inci maddesi"), "m.11", "madde-4".
        assert kurul._atiflar("3 sayılı Cumhurbaşkanlığı Kararnamesi") == {"s3"}
        assert "m125" in kurul._atiflar("657 sayılı Kanunun 125 inci maddesi")
        assert "m11" in kurul._atiflar("4982 sayılı Kanun m.11")
        assert "m4" in kurul._atiflar("madde-4 uyarınca")
        # grounding: orijinalde olmayan yeni atıf yakalanır
        assert kurul._yeni_uydurma("... değerlendirilmiştir.",
                                   "... 3 sayılı Kararname kapsamında değerlendirilmiştir.") is True


class TestUzlasiGuard:
    def test_supheli_kisalma_reddedilir(self):
        # _uzlasi_gecerli backstop: şüpheli kısalma (çöküş/kesilme) reddedilir.
        assert kurul._uzlasi_gecerli(TASLAK, "Kısa.") is False

    async def test_gecerli_revizyon_uygulanir(self, monkeypatch):
        # Çapalı üslup düzeltmesi uygulanır (4982/15 korunur, yeni olgu yok → grounding'i geçer).
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_capali([_USLUP_ONERI])
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(TASLAK, meta=META, sinyaller=SINYAL_TEMIZ)
        assert "Başvurunuz üzerine" in r["uzlasi_metni"]
        assert r["uzlasi_degisti"] is True
        assert r["oneriler"][0]["uygulanabilir"] is True

    async def test_kirmizi_bantta_bile_revize_uygulanabilir(self, monkeypatch):
        # REVİZYON KURULU: yüksek riskte bile revize uygulanabilir (revizyon riski GİDERİR).
        monkeypatch.setattr(kurul, "real_llm", lambda: object())
        async def _fake(*a, **k):
            return _fake_capali([_USLUP_ONERI])
        monkeypatch.setattr(kurul, "llm_json", _fake)
        r = await kurul.kurul_muzakere(
            TASLAK, meta=META, sinyaller={**SINYAL_TEMIZ, "risk_metadata": {"bant": "kirmizi"}})
        assert r["uzlasi_uygulanabilir"] is True
        assert r["karar"] == "sevk"   # karar yalnız risk rozeti — uygulamayı engellemez


TARIHLI_TASLAK = (
    "T.C.\nKAMU KURUMU\nYAZI İŞLERİ BİRİMİ\n\n"
    "Sayı : E-[DETSİS No]-622-[Kayıt No]            03.10.2026\n"
    "Konu : Park aydınlatma talebi\n\n"
    "Sayın Fatma Öztürk\n\n"
    "Başvurunuz incelenmiştir.\n\n"
    "Bilgilerinize rica ederim.\n\n"
    "Yetkili İmza\nBirim Yetkilisi"
)
TARIH_SINYAL = {**FABRIK_SINYAL, "verify_uyari": [
    "Taslaktaki '03.10.2026' tarihi kaynak evrakta yok",
    "Taslaktaki 'Sayı : E-[DETSİS No]-622-[Kayıt No]            03.10.2026' ifadesi kaynak evrakta yok",
]}


class TestYaziTarihiKorunur:
    """tur4 regresyonu: Kurul revizesi yazının KENDİ tarihini 'kaynakta doğrulanamadı' diye siliyordu.
    Düzenlenme tarihi kaynak evraktan gelmez (Yön. 2646) — hiçbir çapalı edit onu düşüremez."""

    async def test_duzelt_sayi_satirindan_tarihi_dusuremez(self, monkeypatch):
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "duzelt", "dayanak": "verify", "capa": "Sayı : E-[DETSİS No]-622-[Kayıt No]            03.10.2026",
             "yeni": "Sayı : E-[DETSİS No]-622-[Kayıt No]",
             "aciklama": "'03.10.2026' tarihi kaynak evrakta doğrulanamadığından satırdan çıkarılmıştır."},
        ]))
        r = await kurul.kurul_muzakere(TARIHLI_TASLAK, meta=FABRIK_META, sinyaller=TARIH_SINYAL)
        assert r["oneriler"][0]["uygulanabilir"] is False      # tavsiye kalır, uygulanmaz
        assert "03.10.2026" in r["uzlasi_metni"]

    async def test_cikar_sayi_satiri_yer_tutucuya_doner_tarih_kalir(self, monkeypatch):
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "Sayı : E-[DETSİS No]-622-[Kayıt No]            03.10.2026",
             "aciklama": "Sayı satırı kaynakta yok."},
        ]))
        r = await kurul.kurul_muzakere(TARIHLI_TASLAK, meta=FABRIK_META, sinyaller=TARIH_SINYAL)
        assert "03.10.2026" in r["uzlasi_metni"]
        assert "Sayı : [DOĞRULA:" in r["uzlasi_metni"]

    async def test_olur_blogu_tarih_satiri_silinmez(self, monkeypatch):
        taslak = TARIHLI_TASLAK + "\n\nOLUR\n03.10.2026\nOnay Makamı"
        _capali_llm(monkeypatch, _fake_capali([
            {"tip": "cikar", "dayanak": "verify", "capa": "03.10.2026", "aciklama": "tarih kaynakta yok"},
        ]))
        r = await kurul.kurul_muzakere(taslak, meta=FABRIK_META, sinyaller=TARIH_SINYAL)
        assert r["uzlasi_metni"].count("03.10.2026") == 2

    def test_yazi_tarihleri_yalniz_sayi_ve_tek_tarih_satiri(self):
        t = "Sayı : X  03.10.2026\nİlgi : 25.05.2026 tarihli başvurunuz.\n  04.10.2026  "
        assert kurul._yazi_tarihleri(t) == {"03.10.2026", "04.10.2026"}
