"""Yazı kalitesi sertleştirmesi — kurum kimliği · konu kısaltma · çok-talep · çift kapanış.

Kullanıcı bulguları (2026-07-17):
  1. Antet "KAMU KURUMU" yer tutucusu → gerçek kurum yazılabilmeli (KURUM_ADI env).
  2. Konu tam cümle/paragraf değil KISA öz olmalı (Yön. 2646 m.13).
  3. Çok-talepli evrakta ("onarım olmazsa yeni direk") ikinci talep düşmemeli.
  4. "gereğinin yapılması arz edilir" + "Gereğini arz ederim" çift kapanış olmamalı.

Hepsi deterministik → mock modda (conftest LLM_MODE=mock) da geçer.
"""
from __future__ import annotations

import pytest

# ---------- #2 Konu kısaltma ----------

def test_uzun_konu_kisaltilir():
    from agents.nodes.cikar import _konu_kisa

    uzun = ("İkamet ettiğim sokaktaki aydınlatma direği uzun süredir arızalı olup "
            "akşam saatlerinden itibaren sokağımız tamamen karanlıkta kalmaktadır")
    kisa = _konu_kisa(uzun)
    assert len(kisa) < len(uzun)
    assert len(kisa.split()) <= 8


def test_kisa_konu_dokunulmaz():
    from agents.nodes.cikar import _konu_kisa

    assert _konu_kisa("Sokak Aydınlatması Arızası") == "Sokak Aydınlatması Arızası"


def test_konu_bos():
    from agents.nodes.cikar import _konu_kisa

    assert _konu_kisa("") == ""
    assert _konu_kisa("   ") == ""


# ---------- #3 Çok-talep çıkarımı ----------

def test_kosullu_ikinci_talep_yakalanir():
    """'onarım olmazsa yeni direk' — koşullu ikinci talep ayrı çıkmalı (decompose boşluğu)."""
    from agents.nodes.cikar import _talepleri_cikar

    metin = ("Sokağımızdaki aydınlatma direğinin onarılmasını, onarım mümkün değilse "
             "bölgeye yeni bir aydınlatma direği yerleştirilmesini talep ederim.")
    talepler = _talepleri_cikar(metin)
    assert len(talepler) >= 2, talepler
    birlesik = " ".join(talepler).lower()
    assert "onar" in birlesik and ("yeni" in birlesik or "direk" in birlesik)


def test_tek_talep_liste_uretmeyebilir():
    from agents.nodes.cikar import _talepleri_cikar

    talepler = _talepleri_cikar("Sokak lambasının onarılmasını arz ederim.")
    assert len(talepler) <= 1


def test_coklu_talep_govdeye_girer():
    """_fallback_body birden çok talep alınca hepsini özet cümlede yansıtmalı."""
    from yazi.yazi_render import _fallback_body

    govde = _fallback_body("cevabi_yazi", "Sokak Aydınlatması", has_ilgi=True,
                           talepler=["direğin onarılması", "yeni direk yerleştirilmesi"])
    assert "onar" in govde.lower() and "yeni direk" in govde.lower()


def test_fallback_karar_grounding_temiz():
    """Yeni fallback gövdeleri karar/inceleme uydurması içermemeli (verify KIRMIZI yapmasın)."""
    from agents.karar_grounding import karar_grounding_veto
    from yazi.yazi_render import _fallback_body

    for tur in ("cevabi_yazi", "gorus_mutalaa", "ust_yazi", "bilgilendirme"):
        g = _fallback_body(tur, "test konusu", has_ilgi=True, talepler=["onarılması", "yenilenmesi"])
        assert karar_grounding_veto(g, "test konusu talebi") == [], f"{tur}: {g}"


# ---------- #4 Çift kapanış kırpma ----------

@pytest.mark.parametrize("govde,kalan_var", [
    ("Söz konusu husus değerlendirilmiştir. Gereğinin yapılması arz edilir.", True),
    ("Konu ilgili birime iletilmiştir. Gereğinin yapılması arz olunur.", True),
    ("Başvuru kayda alınmıştır. Bilgilerinize arz edilir.", True),
])
def test_govde_ici_kapanis_kirpilir(govde, kalan_var):
    """Gövde sonundaki bağımsız kapanış cümlesi kırpılır (şablon kapanışı ayrıca basar)."""
    from yazi.yazi_render import _kapanis_kuyrugu_kirp

    kirpik = _kapanis_kuyrugu_kirp(govde)
    assert "arz edilir" not in kirpik.lower()
    assert "arz olunur" not in kirpik.lower()
    if kalan_var:
        assert kirpik.strip()  # gövdenin ilk cümlesi kalır


def test_cumle_ortasi_arz_korunur():
    """Cümle ORTASINDAKİ 'arz ederim' kırpılmaz — yalnız son bağımsız kapanış."""
    from yazi.yazi_render import _kapanis_kuyrugu_kirp

    g = "Talebin arz edilen gerekçelerle değerlendirilmesi uygun görülmektedir."
    assert _kapanis_kuyrugu_kirp(g) == g


# ---------- #1 Kurum kimliği ----------
# NOT: env→_DEMO_DEFAULTS bağı import-time okunur (models.py). importlib.reload İLE test etmek
# global state'i kirletir (diğer modüller eski referansı tutar → başka testler flaky) — bu yüzden
# reload YOK. _DEMO_DEFAULTS→antet bağı monkeypatch.setitem ile (reload'suz, otomatik geri alınır)
# test edilir; env→_DEMO_DEFAULTS bağı ayrıca canlı smoke ile kanıtlandı ("NİLÜFER BELEDİYE").

def test_kurum_kimligi_antete_yazilir(monkeypatch):
    """_DEMO_DEFAULTS'taki kurum kimliği antet çıktısına (jinja_vars) yansımalı + grounding muaf."""
    import yazi.models as m
    from yazi.yazi_render import build_context
    monkeypatch.setitem(m._DEMO_DEFAULTS, "idare_adi", "NİLÜFER BELEDİYE BAŞKANLIĞI")
    # jinja_vars fallback _DEMO_DEFAULTS'tan besleniyor → antet gerçek kurumu taşır (idare_adi).
    ctx = build_context("cevabi_yazi", {"konu": "test"}, "gövde")
    assert ctx.jinja_vars()["idare_adi"] == "NİLÜFER BELEDİYE BAŞKANLIĞI"
    # Grounding muafiyeti otomatik hizalanır (gerçek kurum adı uydurma sayılmaz).
    assert "NİLÜFER BELEDİYE BAŞKANLIĞI" in m.sablon_iskelet_degerleri()


def test_kurum_adi_bos_ise_jenerik_korunur():
    """ENV yokken (test ortamı) baseline jenerik değer korunur (baseline riski sıfır)."""
    import yazi.models as m
    assert m._DEMO_DEFAULTS["idare_adi"] == "KAMU KURUMU"


# ---------- antet birimi evrağa göre değişir (her evrakta aynı değil) ----------

def test_antet_birimi_hazirlayan_birimle_degisir():
    """Hazırlayan birim (servis_birimi) verilince antet o müdürlüğü yazar; boşsa jenerik/env."""
    from yazi.yazi_render import build_context

    unsur = {"konu": "Aydınlatma arızası", "gonderen": "Derya Aksoy", "tarih": "06.07.2026"}
    ctx_fen = build_context("cevabi_yazi", unsur, "gövde", hazirlayan_birim="Fen İşleri Müdürlüğü")
    assert ctx_fen.jinja_vars()["birim_adi"] == "Fen İşleri Müdürlüğü"
    ctx_ruhsat = build_context("cevabi_yazi", unsur, "gövde", hazirlayan_birim="Ruhsat Denetim Müdürlüğü")
    assert ctx_ruhsat.jinja_vars()["birim_adi"] == "Ruhsat Denetim Müdürlüğü"
    # Boş → jinja_vars _DEMO_DEFAULTS'a düşer (env/jenerik) — her evrakta sabit değil ama fallback var.
    ctx_bos = build_context("cevabi_yazi", unsur, "gövde")
    assert ctx_bos.jinja_vars()["birim_adi"]  # boş değil (fallback dolu)


def test_servis_birimi_grounding_muaf():
    """Antete giren servis birimi ('Fen İşleri Müdürlüğü') grounding'de uydurma sayılmamalı."""
    from agents.servis_birim import SERVIS_BIRIM_TR
    from yazi.models import sablon_iskelet_degerleri
    # verify iskelet_kaynak SERVIS_BIRIM_TR'yi de içerir (kod okunmuş; burada değer var mı bak).
    assert "Fen İşleri Müdürlüğü" in SERVIS_BIRIM_TR.values()
    # sablon_iskelet_degerleri kurum kimliğini taşır (kurum adı da muaf).
    assert sablon_iskelet_degerleri()  # non-empty
