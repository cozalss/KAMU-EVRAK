"""AI Bürokrasi Kurulu — YAKINSAMA DÖNGÜSÜ (2026-08-06): kurul kendi revizesini denetler.

Sözleşmenin özü tek cümle: LLM'in "düzelttim" iddiası KANIT DEĞİLDİR — kanıt, revize metin
üzerinde yeniden koşan sinyaldir (`olc` geri çağrısı: verify + risk_guard). Bu modül o kanıt
zincirini kilitler:

  - Ölçüm hâlâ kirliyse kurul DURMAZ → DENETİM turu koşar (3. LLM çağrısı, ayrı prompt).
  - Ölçüm temizse DURUR → devam etmek yalnız uydurma sorun üretir.
  - Ölçer yoksa/çökerse denetim turu KOŞMAZ ve kazanım İDDİA EDİLMEZ (kanıtsız iyileşme yok).
  - Turların TOPLAMI orijinale karşı sınanır (çok-turlu döngünün getirdiği YENİ risk).
  - Her tur canlı akışta ayrı yayılır (memur müzakereyi oluşurken izler).

Tek turlu (ölçersiz) eski davranışın kilidi `test_kurul_muzakere.py::TestDebate`dedir.
"""

from __future__ import annotations

from tests.test_kurul_muzakere import _ACILIS, FABRIK_META, FABRIK_SINYAL, FABRIK_TASLAK
from yazi import kurul


def _llm_sirasi(monkeypatch, *objeler):
    """Sıralı LLM mock'u: 1. çağrı açılış, 2. çağrı çapraz-eleştiri, 3+ denetim turları."""
    monkeypatch.setattr(kurul, "real_llm", lambda: object())
    calls = {"n": 0, "system": [], "user": []}

    async def _fake(system, user, **k):
        calls["n"] += 1
        calls["system"].append(system)
        calls["user"].append(user)
        i = calls["n"] - 1
        return objeler[i] if i < len(objeler) else {"turlar": [], "oneriler": []}

    monkeypatch.setattr(kurul, "llm_json", _fake)
    return calls


def _olcer_sirasi(*sinyaller):
    """Yeniden-ölçüm sahtesi: sıradaki sinyal kümesini döner; ÖLÇÜLEN METNİ kaydeder."""
    kayit: dict = {"n": 0, "taslaklar": []}

    async def olc(taslak: str):
        kayit["taslaklar"].append(taslak)
        i = kayit["n"]
        kayit["n"] += 1
        return sinyaller[i] if i < len(sinyaller) else sinyaller[-1]

    return olc, kayit


_SINYAL_TEK_UYARI = {
    "verify_uyari": ["Taslaktaki 'Sayı : EBYS-TASLAK' ifadesi kaynak evrakta yok"],
    "lint_2646": {"kurallar": [], "uyari": []}, "tutarlilik_uyari": [],
    "risk_metadata": {"bant": "sari"},
}
_SINYAL_SIFIR = {"verify_uyari": [], "lint_2646": {"kurallar": [], "uyari": []},
                 "tutarlilik_uyari": [], "risk_metadata": {"bant": "yesil"}}

# 1. tur: grounded çıkarma (FABRIK_SINYAL bu satırı işaretliyor → edit uygulanabilir).
_TUR1 = {
    "turlar": [{"uye": "hukukcu", "yanit": "taslakci", "tutum": "karsi",
                "soz": "Muhatap adı kaynak evrakta yok."}],
    "oneriler": [{"tip": "cikar", "dayanak": "verify", "capa": "Sayın Elif Doğan",
                  "aciklama": "Muhatap adı kaynak evrakta doğrulanamadı."}],
}
# 2. tur (denetim): ölçüme bakıp itirazın düştüğünü KABUL eder — yeni öneri yok.
_TUR2_KABUL = {
    "turlar": [{"uye": "hukukcu", "yanit": "taslakci", "tutum": "katil",
                "soz": "Satır kaldırıldı; ölçümde uyarı düştü."}],
    "oneriler": [],
}


class TestYakinsamaDongusu:
    async def test_denetim_turu_yeniden_olcumle_kosar(self, monkeypatch):
        """Ölçüm hâlâ kirliyse kurul DURMAZ: 3. çağrı DENETİM turudur, girdisi REVİZE metindir."""
        calls = _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        olc, kayit = _olcer_sirasi(_SINYAL_TEK_UYARI)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                       sinyaller=FABRIK_SINYAL, olc=olc)
        assert calls["n"] == 3                                  # açılış + çapraz + DENETİM
        assert calls["system"][2] is kurul._SYSTEM_DENETIM       # 3. çağrı denetim promptuyla
        assert kayit["n"] == 1                                  # revize BİR kez yeniden ölçüldü
        assert "Sayın Elif Doğan" not in kayit["taslaklar"][0]  # ölçülen metin = REVİZE metin
        assert any(t["tur"] == 2 for t in r["turlar"])          # denetim turu tutanakta
        # Rapor BAŞLANGICA karşı: 3 uyarının 2'si düştü, 1'i duruyor, yeni uyarı doğmadı.
        assert r["yakinsama"] == {"tur": 2, "olculdu": True, "itiraz_ilk": 3, "itiraz_son": 1,
                                  "dusen": 2, "duran": 1, "yeni": 0, "cozulen": 2, "kalan": 1}

    async def test_denetim_turuna_HAZIR_olcum_farki_gider(self, monkeypatch):
        """Denetim turunun girdisi: revize metin + DÜŞEN/DURAN/YENİ uyarı farkı + SON tur.

        Tüm transkripti yeniden göndermek iki şeyi birden bozuyordu (2026-08-06 canlı ölçümü):
        model farkı kendisi çıkarmaya çalışıp düşünme bütçesini tüketiyor ve yanıt kesilip TUR
        TAMAMEN KAYBOLUYORDU. Fark hazır verilir; kurul ölçüme bakar, belleğine değil.
        """
        calls = _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        olc, _kayit = _olcer_sirasi(_SINYAL_TEK_UYARI)
        await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                   sinyaller=FABRIK_SINYAL, olc=olc)
        denetim_user = calls["user"][2]
        assert "REVİZE METİN ÜZERİNDE YENİDEN ÖLÇÜM" in denetim_user
        assert "DÜŞEN uyarılar" in denetim_user and "DURAN uyarılar" in denetim_user
        # Giderilen uyarı DÜŞEN'de, duran uyarı DURAN'da görünür (fark gerçekten hesaplanmış).
        dusen_blok = denetim_user.split("DÜŞEN uyarılar")[1].split("DURAN uyarılar")[0]
        assert "Sayın Elif Doğan" in dusen_blok
        assert "Sayı : EBYS-TASLAK" in denetim_user.split("DURAN uyarılar")[1]
        assert "ÖNCEKİ TURDA UYGULANAN DÜZELTMELER" in denetim_user
        # Transkript KUYRUKLA sınırlı taşınır: girdi tur sayısıyla büyümez (kesilme riski sabit).
        kuyruk = denetim_user.split("SON TURDA SÖYLENENLER:\n")[1].strip().splitlines()
        assert 0 < len(kuyruk) <= kurul._SON_TUR_SOZ

    async def test_olcum_temizse_dongu_durur(self, monkeypatch):
        """Ölçüm sıfır itiraz gösteriyorsa devam etmek yalnız uydurma sorun üretir → dur."""
        calls = _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        olc, _kayit = _olcer_sirasi(_SINYAL_SIFIR)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                       sinyaller=FABRIK_SINYAL, olc=olc)
        assert calls["n"] == 2                                  # denetim turuna GEREK kalmadı
        assert r["yakinsama"] == {"tur": 1, "olculdu": True, "itiraz_ilk": 3, "itiraz_son": 0,
                                  "dusen": 3, "duran": 0, "yeni": 0, "cozulen": 3, "kalan": 0}
        amir = next(t for t in r["turlar"] if t["who"] == "birim_amiri")
        assert "3 uyarı düşüyor" in amir["text"] and "yeniden ölçüldü" in amir["text"]

    async def test_revizyonun_URETTIGI_yeni_uyari_gizlenmez(self, monkeypatch):
        """En kritik dürüstlük hâli — 2026-08-06 canlı koşumunda yakalandı.

        Kurul eski uyarıları düşürüp revizyonuyla YENİ uyarılar üretebilir. Yalnız NET fark
        raporlanırsa (düşen − yeni) sonuç 0 çıkar ve rapor "hiçbir şey çözülmedi" der; oysa
        gerçekte iki ayrı olay olmuştur ve memurun bilmesi gereken asıl şey revizyonun YENİ
        sorun ürettiğidir. Üç sayı ayrı ayrı taşınır ve kapanış sözü yeniyi AÇIKÇA söyler.
        """
        _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        yeni_sinyal = {
            "verify_uyari": ["Taslaktaki 'İlgi : Başvurunuz.' ifadesi kaynak evrakta yok",
                             "Taslaktaki 'onarılacaktır' taahhüdü kaynak evrakta yok"],
            "lint_2646": {"kurallar": [], "uyari": []}, "tutarlilik_uyari": [],
            "risk_metadata": {"bant": "sari"},
        }
        olc, _kayit = _olcer_sirasi(yeni_sinyal)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                       sinyaller=FABRIK_SINYAL, olc=olc)
        y = r["yakinsama"]
        assert (y["dusen"], y["duran"], y["yeni"]) == (3, 0, 2)
        assert y["itiraz_son"] == 2                      # net fark 1 — tek başına yanıltıcı
        amir = next(t for t in r["turlar"] if t["who"] == "birim_amiri")["text"]
        assert "3 uyarı düşüyor" in amir and "2 YENİ uyarı üretiyor" in amir
        assert "gönderilemez" in amir                    # temiz sayılmaz

    async def test_olcer_yoksa_tek_turda_kalir(self, monkeypatch):
        """Ölçüm yoksa denetim turu kanıtsız olurdu → koşmaz; kazanım da iddia edilmez."""
        calls = _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL)
        assert calls["n"] == 2
        assert r["yakinsama"]["olculdu"] is False and r["yakinsama"]["tur"] == 1
        assert r["uzlasi_degisti"] is True                       # 1. tur revizesi yine uygulanır

    async def test_tur_butcesi_env_ile_sinirlanir(self, monkeypatch):
        """KURUL_MUZAKERE_TURU LLM turunu sınırlar; RAPOR ölçümü yine koşar.

        Ayrım bilinçli: bütçe pahalı olanı (LLM turu) sınırlar. Son ölçüm bir sonraki turu
        beslemez ama memura verilen "revize uygulanırsa X uyarı düşer" cümlesinin KANITIDIR;
        onu da kesmek kurulu yeniden iddia-temelli hâle getirirdi.
        """
        monkeypatch.setenv("KURUL_MUZAKERE_TURU", "1")
        calls = _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        olc, kayit = _olcer_sirasi(_SINYAL_TEK_UYARI)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                       sinyaller=FABRIK_SINYAL, olc=olc)
        assert calls["n"] == 2                                   # DENETİM turu koşmadı (bütçe)
        assert kayit["n"] == 1 and r["yakinsama"]["olculdu"] is True   # rapor yine ölçülü

    async def test_olcum_hatasi_muzakereyi_dusurmez(self, monkeypatch):
        """Ölçüm çökerse körlemesine tartışılmaz — ama 1. turun kazanımı korunur."""
        _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)

        async def _patla(_taslak):
            raise RuntimeError("ölçüm çöktü")

        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                       sinyaller=FABRIK_SINYAL, olc=_patla)
        assert r is not None and r["uzlasi_degisti"] is True
        assert "Sayın Elif Doğan" not in r["uzlasi_metni"]
        assert r["yakinsama"]["olculdu"] is False               # ölçülemedi → kazanım iddiası yok

    async def test_tekrar_eden_oneri_ikinci_turda_dusurulur(self, monkeypatch):
        """Aynı satıra aynı işlem iki turda gelirse tutanak şişmez (tur-ötesi dedup)."""
        _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR1)
        olc, _kayit = _olcer_sirasi(_SINYAL_TEK_UYARI)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=FABRIK_META,
                                       sinyaller=FABRIK_SINYAL, olc=olc)
        assert len(r["oneriler"]) == 1

    async def test_kumulatif_guard_toplam_daralmayi_yakalar(self, monkeypatch):
        """Her tur tek başına makul, TOPLAM belgeyi çökertiyor → revizenin TAMAMI düşer.

        Bu, çok-turlu döngünün getirdiği YENİ risk: tur başına %20 kısalma iki turda %36 eder
        ve tur-içi guard'ların hiçbiri bunu göremez. Final metin daima ORİJİNALE sınanır.
        """
        satirlar = [f"Doğrulanamayan {i}. satır burada yer alıyor." for i in range(1, 11)]
        taslak = "T.C.\nKAMU KURUMU\n" + "\n".join(satirlar)
        sinyal = {
            "verify_uyari": [f"Taslaktaki '{s}' ifadesi kaynak evrakta yok" for s in satirlar],
            "lint_2646": {"kurallar": [], "uyari": []}, "tutarlilik_uyari": [],
            "risk_metadata": {"bant": "kirmizi"},
        }

        def _cikarlar(hedefler):
            return {"turlar": [{"uye": "hukukcu", "soz": "Bu satırlar doğrulanamadı."}],
                    "oneriler": [{"tip": "cikar", "dayanak": "verify", "capa": s,
                                  "aciklama": f"{s} doğrulanamadı"} for s in hedefler]}

        _llm_sirasi(monkeypatch, _ACILIS, _cikarlar(satirlar[:8]), _cikarlar(satirlar[8:]))
        olc, _kayit = _olcer_sirasi(sinyal, sinyal)
        r = await kurul.kurul_muzakere(taslak, meta=FABRIK_META, sinyaller=sinyal, olc=olc)
        assert r["uzlasi_metni"] == taslak                       # orijinal KORUNDU
        assert r["uzlasi_uygulanabilir"] is False
        assert not any(o["uygulanabilir"] for o in r["oneriler"])   # hiçbiri "işlendi" değil
        assert r["yakinsama"]["olculdu"] is False                # düşen revizenin kazanımı yok
        assert r["yakinsama"]["kalan"] == r["yakinsama"]["itiraz_ilk"]

    async def test_akista_her_tur_ayri_yayilir(self, monkeypatch):
        """Canlı akış: memur müzakereyi OLUŞURKEN izler — denetim turu da anında düşer."""
        _llm_sirasi(monkeypatch, _ACILIS, _TUR1, _TUR2_KABUL)
        olc, _kayit = _olcer_sirasi(_SINYAL_TEK_UYARI)
        olaylar = [(ad, veri) async for ad, veri in kurul.kurul_muzakere_stream(
            FABRIK_TASLAK, meta=FABRIK_META, sinyaller=FABRIK_SINYAL, olc=olc)]
        assert [a for a, _ in olaylar] == ["acilis", "tur", "tur", "sonuc"]
        assert [v["tur"] for a, v in olaylar if a == "tur"] == [1, 2]   # çapraz → denetim


class TestUyeSeritleri:
    """Roster sözleşmesi (6 Ağu 2026): her üye AYRI bir hata sınıfına ve o sınıfın GERÇEK
    sinyaline bağlıdır. Sinyale bağlı olmayan üye her belgede aynı genel cümleyi kurar —
    eski "Vatandaş Avukatı" dört canlı koşumda ölçülerek böyle bulundu ve şeridi
    "muhatabın talebi karşılandı mı"ya çevrildi. Digest o şeritleri BESLEMEK zorundadır.
    """

    def test_uc_uye_uc_ayri_serit(self):
        idler = [u["id"] for u in kurul.KURUL_UYELERI]
        assert idler == ["taslakci", "hukukcu", "vatandas"]        # id'ler SÖZLEŞME (frontend eşler)
        odak = " ".join(u["odak"] for u in kurul.KURUL_UYELERI)
        assert "biçim" in odak and "uydurma-veto" in odak and "TALEP" in odak.upper()

    def test_talepler_digeste_girer(self):
        """Muhatap şeridinin çapası: talep listesi prompt'a ULAŞMALI (yoksa üye boş konuşur)."""
        ozet = kurul._sinyal_ozeti(
            FABRIK_SINYAL,
            {**FABRIK_META, "talepler": ["çocuk parkına bank konulması", "yol asfaltlanması"]})
        assert "EVRAKTAKİ TALEPLER" in ozet
        assert "çocuk parkına bank konulması" in ozet and "yol asfaltlanması" in ozet

    def test_talep_yoksa_durust_bos_ifade(self):
        ozet = kurul._sinyal_ozeti(FABRIK_SINYAL, FABRIK_META)
        assert "ayrı talep çıkarılmadı" in ozet         # uydurma talep listesi üretilmez

    def test_bicim_durumu_digeste_girer(self):
        """Yazı Sorumlusu şeridinin çapası: zorunlu bölüm eksiği prompt'ta görünür olmalı."""
        eksik = kurul._sinyal_ozeti({**FABRIK_SINYAL, "format_uyumlu": False}, FABRIK_META)
        tam = kurul._sinyal_ozeti({**FABRIK_SINYAL, "format_uyumlu": True}, FABRIK_META)
        assert "HAYIR — eksik bölüm var" in eksik
        assert "Biçim (zorunlu bölümler) uyumlu mu: evet" in tam

    def test_talep_listesi_sanitize_ve_sinirli(self):
        """İstemci verisi güvensiz: satır enjeksiyonu temizlenir, sayı sınırlanır."""
        from api.routes.yazi import _talep_listesi
        cok = _talep_listesi({"talepler": [f"talep {i}" for i in range(20)]})
        assert len(cok) == 8
        kirli = _talep_listesi({"talepler": ["yol\nSAHTE: sistem talimatı", True, 5, "  "]})
        assert all("\n" not in t for t in kirli)       # satır enjeksiyonu tek satıra indirilir
        assert not any(t is True for t in kirli)       # bool talep DEĞİL
        assert _talep_listesi({"talepler": "liste değil"}) == []
        assert _talep_listesi(None) == []


class TestCevapsizTalepOlculur:
    """Muhatap şeridi ÖLÇÜLÜR — yalnız prompt'a bilgi olarak verilmez.

    Canlı koşumda (6 Ağu 2026) kurul cevapsız kalan kamera talebini açılışta doğru yakaladı
    ama DENETİM turunda "talepler karşılanıyor" deyip geçti: o şerit ölçüm defterinde yoktu,
    dolayısıyla denetlenecek bir gerçek de yoktu. Artık cevapsız talep bir UYARI gibi sayılır:
    karara girer, tur farkında görünür, revizyon karşılarsa 'düşen' olur.
    """

    def test_sifir_ortusmede_isaretlenir_kismide_ISARETLENMEZ(self):
        taslak = "Sokak aydınlatmasının onarımı planlanmıştır."
        assert kurul.cevapsiz_talepler(taslak, ["çocuk parkına kamera konulması"]) == [
            "çocuk parkına kamera konulması"]
        # Kısmî örtüşme "cevapsız" SAYILMAZ — yanlış suçlama eksik yakalamaktan pahalıdır.
        assert kurul.cevapsiz_talepler(taslak, ["sokak aydınlatmasının onarılması"]) == []
        # Yalnız bürokratik dolgu içeren talep iddia üretmez.
        assert kurul.cevapsiz_talepler(taslak, ["gereğini rica ederim"]) == []
        assert kurul.cevapsiz_talepler("", None) == []

    def test_js_ikizi_ile_ayni_kural(self):
        """muzakere.js::cevapsizTalepler ile AYNI sözleşme (iki motor aynı şeyi söylemeli)."""
        taslak = "\n".join(
            ["T.C.", "Konu : Aydınlatma", "", "Sokak aydınlatmasının onarımı planlanmıştır."])
        assert kurul.cevapsiz_talepler(taslak, [
            "sokak aydınlatmasının onarılması", "çocuk parkına bank yerleştirilmesi",
        ]) == ["çocuk parkına bank yerleştirilmesi"]

    def test_cevapsiz_talep_KARARA_girer(self):
        """Muhatabın sorusu yanıtsızken yazı 'uzlaşıldı' sayılamaz."""
        temiz = {"verify_uyari": [], "lint_2646": {"kurallar": [], "uyari": []},
                 "tutarlilik_uyari": [], "risk_metadata": {"bant": "yesil"}}
        assert kurul._itiraz_sayisi(temiz) == 0
        assert kurul._itiraz_sayisi(temiz, ["kamera talebi"]) == 1
        assert kurul.kurul_karar("yesil", 0) == "uzlasti"
        assert kurul.kurul_karar("yesil", 1) == "serhli"      # cevapsız talep → şerh

    def test_digestte_KARSILIGI_YOK_isareti(self):
        ozet = kurul._sinyal_ozeti(
            FABRIK_SINYAL,
            {**FABRIK_META, "talepler": ["çocuk parkına kamera konulması", "izin talebi"]},
            FABRIK_TASLAK)
        assert "← TASLAKTA KARŞILIĞI YOK" in ozet
        # İşaret YALNIZ karşılığı olmayana konur (körü körüne hepsine değil).
        assert ozet.count("← TASLAKTA KARŞILIĞI YOK") == 1

    async def test_karsilanan_talep_DUSEN_sayilir(self, monkeypatch):
        """Revizyon bir talebi karşılarsa ölçüm farkında 'düşen' olarak görünür."""
        talep = "kamerakonusu"                       # taslakta YOK → başlangıçta cevapsız
        meta = {**FABRIK_META, "talepler": [talep]}
        # 1. tur: çapayı 'Sayın Elif Doğan' satırını talebi karşılayan metinle DEĞİŞTİRİR.
        tur1 = {"turlar": [{"uye": "vatandas", "soz": "Talep cevapsız."}],
                "oneriler": [{"tip": "duzelt", "dayanak": "muzakere", "capa": "Sayın Elif Doğan",
                              "yeni": "kamerakonusu hakkında bilgi verilmiştir.",
                              "aciklama": "Cevapsız talep karşılandı."}]}
        _llm_sirasi(monkeypatch, _ACILIS, tur1, _TUR2_KABUL)
        olc, _kayit = _olcer_sirasi(_SINYAL_SIFIR)
        r = await kurul.kurul_muzakere(FABRIK_TASLAK, meta=meta, sinyaller=FABRIK_SINYAL, olc=olc)
        assert talep in r["uzlasi_metni"]                     # revizyon talebi karşıladı
        y = r["yakinsama"]
        assert y["dusen"] == 4 and y["kalan"] == 0            # 3 uyarı + 1 cevapsız talep düştü
        assert y["itiraz_ilk"] == 4                           # cevapsız talep başlangıçta sayıldı
