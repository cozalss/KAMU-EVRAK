"""Yazı kalitesi sertleştirmesi — kurum kimliği · konu kısaltma · çok-talep · çift kapanış.

Kullanıcı bulguları (2026-07-17):
  1. Antet "KAMU KURUMU" yer tutucusu → gerçek kurum yazılabilmeli (KURUM_ADI env).
  2. Konu tam cümle/paragraf değil KISA öz olmalı (Yön. 2646 m.13).
  3. Çok-talepli evrakta ("onarım olmazsa yeni direk") ikinci talep düşmemeli.
  4. "gereğinin yapılması arz edilir" + "Gereğini arz ederim" çift kapanış olmamalı.

Hepsi deterministik → mock modda (conftest LLM_MODE=mock) da geçer.
"""
from __future__ import annotations

import importlib

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

def test_kurum_adi_env_ile_yazilir(monkeypatch):
    """KURUM_ADI/KURUM_BIRIM env doluysa antet gerçek kurumu yazar; boşsa jenerik korunur."""
    monkeypatch.setenv("KURUM_ADI", "NİLÜFER BELEDİYE BAŞKANLIĞI")
    monkeypatch.setenv("KURUM_BIRIM", "Yazı İşleri Müdürlüğü")
    import yazi.models as m
    importlib.reload(m)
    try:
        assert m._DEMO_DEFAULTS["idare_adi"] == "NİLÜFER BELEDİYE BAŞKANLIĞI"
        assert m._DEMO_DEFAULTS["birim_adi"] == "Yazı İşleri Müdürlüğü"
        # Grounding muafiyeti otomatik hizalanır (gerçek kurum adı uydurma sayılmaz).
        assert "NİLÜFER BELEDİYE BAŞKANLIĞI" in m.sablon_iskelet_degerleri()
    finally:
        monkeypatch.delenv("KURUM_ADI", raising=False)
        monkeypatch.delenv("KURUM_BIRIM", raising=False)
        importlib.reload(m)  # global durumu geri al (test izolasyonu)


def test_kurum_adi_bos_ise_jenerik_korunur():
    import yazi.models as m
    importlib.reload(m)  # env yok → baseline
    assert m._DEMO_DEFAULTS["idare_adi"] == "KAMU KURUMU"
