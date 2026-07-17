"""Karar/inceleme grounding + belirsiz makam guard'ları + prompt-injection savunması.

Kullanıcı şikâyetleri (yazı-türü sertleştirme spec'i):
  - "gerçekte incelenmeyen bir evrak için 'incelenmiştir'"
  - "yetkisi bilinmeden 'uygun bulunmuştur' / 'reddedilmiştir'"
  - "Yetkili İmza / İlgili Makama gibi belirsiz muhatap/imza"
  - TEST 7: kaynak metindeki "önceki talimatları unut" uygulanmamalı

Hepsi deterministik → mock modda (conftest LLM_MODE=mock) da geçer.
"""
from __future__ import annotations

import pytest

from agents.karar_grounding import belirsiz_makam_uyari, karar_grounding_veto

# ---------- karar_grounding_veto: tamamlanmış karar/inceleme iddiası ----------

@pytest.mark.parametrize("kalip", [
    "Başvurunuz incelenmiştir.",
    "Söz konusu talep tetkik edilmiştir.",
    "Evrak değerlendirilmiştir.",
    "Talebiniz uygun bulunmuştur.",
    "Başvurunuz uygun görülmüştür.",
    "Ruhsat başvurusu onaylanmıştır.",
    "Talebiniz kabul edilmiştir.",
    "Başvurunuz reddedilmiştir.",
    "İşyeri ruhsatı verilmiştir.",
    "Konu karara bağlanmıştır.",
])
def test_karar_iddiasi_kaynakta_yoksa_veto(kalip):
    """Tamamlanmış karar/inceleme iddiası + kaynakta yok → deterministik veto (KIRMIZI imza)."""
    kaynak = "Sokağımızdaki çukurun onarılmasını talep ederim. Ad-Soyad: Ayşe Yılmaz"
    uyari = karar_grounding_veto(kalip, kaynak)
    assert uyari, f"'{kalip}' veto üretmeliydi"
    # risk_guard._UYDURMA_IMZA ile aynı imza → deterministik KIRMIZI (HITL zorunlu).
    assert all("kaynak evrakta yok" in u for u in uyari)


def test_kaynakta_gecen_karar_muaf():
    """Gelen evrak zaten 'reddedilmiştir' diyorsa, taslak ona atıf yapabilir → veto YOK."""
    kaynak = "İlgi yazınızla başvurunuzun reddedilmiştir olduğu bildirilmiştir."
    taslak = "İlgi yazıda talebin reddedilmiştir olarak tarafımıza iletildiği anlaşılmıştır."
    assert karar_grounding_veto(taslak, kaynak) == []


@pytest.mark.parametrize("talep_kipi", [
    "Talebin değerlendirilmesi için ilgili birime iletilmiştir.",
    "Başvurunun incelenmesi hususunda gereğini arz ederim.",
    "Konunun uygun görülmesini olurlarınıza arz ederim.",  # OLUR kapanışı — talep, karar değil
    "Evrakın değerlendirilerek gereğinin yapılması rica olunur.",
    "İncelenmek üzere ilgili müdürlüğe gönderilmiştir.",
])
def test_talep_kipi_veto_uretmez(talep_kipi):
    """TALEP/GELECEK kipi (incelenmesi/değerlendirilmesi/görülmesi) meşru → veto YOK."""
    kaynak = "Sokağımızdaki çukurun onarılması talebi."
    assert karar_grounding_veto(talep_kipi, kaynak) == [], f"'{talep_kipi}' yanlış-pozitif"


def test_placeholder_muaf():
    """Doldurulmamış jinja placeholder → uydurma değil, muaf."""
    assert karar_grounding_veto("{{ karar }} incelenmiştir bilgisi.", "kaynak") != []  # düz metin yakalanır
    assert karar_grounding_veto("{{ incelenmistir_bloku }}", "kaynak") == []  # tümü placeholder


def test_bos_taslak():
    assert karar_grounding_veto("", "kaynak") == []


# ---------- belirsiz_makam_uyari: doldurulmamış iskelet ----------

@pytest.mark.parametrize("ifade,beklenen_alan", [
    ("İmza: Yetkili İmza", "İmzalayacak yetkilinin adı/unvanı"),
    ("Birim Yetkilisi", "İmzalayacak yetkilinin adı/unvanı"),
    ("İlgili Makama", "Kesin muhatap birim"),
    ("T.C.\nKAMU KURUMU\nYazı İşleri", "Kurum adı"),
])
def test_belirsiz_makam_uyari(ifade, beklenen_alan):
    uyari = belirsiz_makam_uyari(ifade)
    assert uyari and any(beklenen_alan in u for u in uyari)
    assert all("[BİLGİ GEREKLİ" in u for u in uyari)


def test_gercek_birim_etiketi_muaf():
    """'İlgili Teknik / Ana Hizmet Dairesi' GERÇEK 9-birim etiketi → belirsiz sayılmaz."""
    taslak = "Muhatap: İlgili Teknik / Ana Hizmet Dairesi\nGereğini arz ederim."
    assert belirsiz_makam_uyari(taslak) == []


# ---------- fallback body: karar-iddiası nötrlendi ----------

def test_fallback_cevabi_yazi_karar_iddiasi_icermez():
    """cevabi_yazi fallback gövdesi artık 'incelenmiştir/değerlendirilmiştir' iddia etmemeli
    (kullanıcı şikâyeti + karar_grounding vetosuyla tutarlı — aksi halde her fallback KIRMIZI)."""
    from yazi.yazi_render import _fallback_body

    govde = _fallback_body("cevabi_yazi", "çukur onarımı", has_ilgi=True)
    # Kendi vetomuzla temiz mi? (kaynakta karar yok → fallback de karar iddia etmemeli)
    assert karar_grounding_veto(govde, "çukur onarımı talebi") == [], (
        f"Fallback gövdesi karar iddiası içeriyor: {govde}")


# ---------- prompt injection savunması ----------

def test_body_system_injection_ve_karar_kurallari():
    """_BODY_SYSTEM promptu injection + karar-yasağı maddelerini içermeli (TEST 7 + §7)."""
    from yazi.yazi_render import _BODY_SYSTEM

    dusuk = _BODY_SYSTEM.lower()
    assert "yalnızca i̇şlenecek veri" in dusuk or "yalnızca işlenecek veri" in dusuk
    assert "uygulama" in dusuk  # "bunları UYGULAMA"
    assert "incelenmiştir" in dusuk  # karar-yasağı maddesi kalıpları sayıyor


# ---------- uçtan uca: verify_node → risk_guard KIRMIZI ----------

def test_karar_uydurmasi_uctan_uca_kirmizi_ve_hitl():
    """/yazi/dogrula: kaynakta karar yokken 'uygun bulunmuştur' → verify uyarısı + bant
    KIRMIZI (deterministik veto → HITL zorunlu, onaysız gönderilmez). Kullanıcının asıl
    şikâyetinin uçtan uca çözümü."""
    from fastapi.testclient import TestClient

    from main import app

    evrak = ("T.C. KURUM\nSayı: E-11111111-000-2026/1\nTarih: 01.06.2026\n"
             "Konu: Ruhsat başvurusu\nİşyeri ruhsatı talebimin değerlendirilmesini arz ederim.")
    # Taslakta kaynakta OLMAYAN karar iddiası — evrak sadece TALEP içeriyor, karar yok.
    taslak = ("T.C.\nKURUM\n\nSayı : E-11111111-000-2026/1\nKonu : Ruhsat başvurusu\n\n"
              "Sayın İlgili\n\nİlgi : 01.06.2026 tarihli başvurunuz.\n"
              "Başvurunuz uygun bulunmuştur.\n\nGereğini rica ederim.\n\nAd Soyad\nUnvan")
    with TestClient(app) as c:
        r = c.post("/yazi/dogrula", json={
            "taslak_md": taslak, "evrak_text": evrak, "yazi_turu": "cevabi_yazi",
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"tarih": "01.06.2026", "sayi": "E-11111111-000-2026/1"},
        })
    assert r.status_code == 200, r.text
    data = r.json()
    assert any("uygun bulunmuş" in u for u in data["verify_uyari"]), data["verify_uyari"]
    assert data["risk_metadata"]["bant"] == "kirmizi"  # deterministik veto → HITL zorunlu
