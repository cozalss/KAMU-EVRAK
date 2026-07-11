"""Standart Dosya Planı (SDP) — resmî yazı Sayı satırının konu-kodu bileşeni (Yön. 2646 m.11).

Yön. 2646 m.11 f.1: Sayı = "E-" + DETSİS no + "-" + **SDP kodu** + "-" + kayıt no.
DETSİS ve kayıt no kuruma/EBYS'ye özgüdür (taslakta bilinmez → placeholder); SDP kodu ise
belgenin KONUSUNDAN türetilebilen, kamuya açık STANDART bir sınıflandırmadır. Bu modül evrak
türü + konudan doğru SDP kodunu deterministik seçer → taslak Sayı satırı "EBYS-TASLAK"
placeholder'ından çıkıp gerçek konu-kodlu, m.11-uyumlu bir yapıya kavuşur.

KAYNAK (SIFIR UYDURMA — CLAUDE.md §1): tüm kod→başlık çiftleri Başbakanlık Devlet Arşivleri
Genel Müdürlüğü **"Standart Dosya Planı" (2005/7 sayılı Genelge, 24.03.2005)** "Ortak Alanlar"
(000-099 / 600-999) bölümünden BİREBİR alınmıştır. Kurum-özel alanlar (100-599) DAHİL EDİLMEZ
(kuruma göre değişir → uydurma riski). Kod tablosu genişletilecekse yalnız aynı kaynaktan eklenir.
"""

from __future__ import annotations

from core.text import tr_lower

# --- SDP "Ortak Alanlar" kod → başlık (2005/7 Genelge; sistemin ele aldığı konularla sınırlı) ---
SDP_TABLOSU: dict[str, str] = {
    "010": "Mevzuat İşleri",
    "020": "Olurlar, Onaylar",
    "040": "Faaliyet Raporları",
    "050": "Toplantılar",
    "600": "Araştırma-Planlama ve Koordinasyon İşleri",
    "620": "Basınla ve Halkla İlişkiler",
    "622": "Halkla İlişkiler",
    "640": "Hukuk İşleri",
    "641": "Dava Dosyaları",
    "642": "İcra Takipleri",
    "645": "Tebligatlar",
    "647": "Hukuki ve İstişari Görüşler",
    "660": "Teftiş İşleri",
    "700": "Bilgi İşlem İşleri",
    "705": "Sistem ile ilgili talepler",
    "707": "Arızalar",
    "800": "İdari İşler",
    "804": "Evrak ve Dosyalama İşlemleri",
    "807": "Bakım-Onarım İşleri",
    "840": "Mali İşler",
    "841": "Bütçe İşleri",
    "848": "Personel Tahakkuk ve Ödeme İşleri",
    "900": "Personel İşleri",
    "902": "Personel Alımı",
    "903": "Atama İşleri",
    "904": "Görevlendirmeler",
    "906": "İzin İşleri",
    "908": "Terfi ve İntibak İşlemleri",
    "911": "Emeklilik İşlemleri",
    "930": "Satınalma ve Satış İşleri",
}

# Evrak TÜRÜ → taban SDP kodu. Anahtarlar agents.config.EVRAK_TURLERI ile BİREBİR (dava_evraki,
# icra_evraki, genelge_talimat_olur — bare 'dava'/'olur' YOK). Tür sınıflandırması sistemin
# ölçülmüş-güvenilir sinyalidir → spesifik konu kökünden SONRA, genel kökten ÖNCE gelir.
TUR_SDP: dict[str, str] = {
    "dava_evraki": "641", "icra_evraki": "642", "tebligat": "645",
    "sikayet": "622", "cimer": "622", "dilekce": "622", "bilgi_edinme": "622",
    "basvuru": "622", "fatura": "848", "gorus_mutalaa": "647",
    "genelge_talimat_olur": "010", "rapor": "040", "ihbar": "660",
}

# SPESİFİK konu kökleri → SDP (türden öncelikli — konu daha spesifiktir). İlk eşleşen kazanır.
# Kökler tr_lower + ekleri kapsar (substring); geniş/çok-anlamlı kelime YOK (yanlış eşleşme önlenir).
KONU_SDP_SPESIFIK: tuple[tuple[tuple[str, ...], str], ...] = (
    (("nakil", "naklen", "tayin", "atama", "atanma"), "903"),
    (("görevlendir", "vekalet"), "904"),
    (("emekli",), "911"),
    (("terfi", "intibak"), "908"),
    (("personel alım", "işe alım", "işe alınma"), "902"),
    (("izin talebi", "yıllık izin", "mazeret izni", "ücretsiz izin"), "906"),
    (("icra", "haciz"), "642"),
    (("dava", "mahkeme", "duruşma", "savunma"), "641"),
    (("tebligat", "tebliğ"), "645"),
    (("hukuki görüş", "mütalaa", "istişari"), "647"),
    (("teftiş", "denetim", "soruşturma"), "660"),
    (("bütçe", "ödenek", "tahsisat"), "841"),
    (("fatura", "tahakkuk", "ödeme emri", "maaş"), "848"),
    (("satınalma", "satın alma", "ihale", "mal alım"), "930"),
    (("yazılım", "bilgi işlem", "sistem talebi", "yazıcı", "donanım"), "705"),
    (("arıza", "bozuk", "çalışmıyor"), "707"),
    (("onarım", "tamir", "bakım", "aydınlatma", "çukur"), "807"),
    (("mevzuat", "genelge", "talimat", "yönetmelik"), "010"),
    (("şikayet", "cimer", "memnuniyet"), "622"),
    (("bilgi edinme", "4982"), "622"),
)

# GENEL/geniş kökler — YALNIZ spesifik konu + güvenilir tür EŞLEŞMEZSE son çare. Bu kökler
# (personel/evrak) tek başına baskın olursa güvenilir tür sınıflandırmasını ezerdi (ör. tebligat
# gövdesinde 'personel' geçince yanlış '900'); bu yüzden en düşük öncelikte + YALNIZ konuda taranır.
KONU_SDP_GENEL: tuple[tuple[tuple[str, ...], str], ...] = (
    (("özlük", "sicil", "kadro", "personel", "memur"), "900"),
    (("dosyalama", "belge talebi", "evrak"), "804"),
    (("halkla ilişkiler", "başvuru"), "622"),
    (("olur", "onay"), "020"),
)


def _tara(metin: str, tablo: tuple[tuple[tuple[str, ...], str], ...]) -> dict[str, str] | None:
    for kokler, kod in tablo:
        if any(k in metin for k in kokler):
            return {"kod": kod, "baslik": SDP_TABLOSU[kod]}
    return None


def sdp_bul(evrak_turu: str, konu: str, *, ek_metin: str = "") -> dict[str, str] | None:
    """Evrak türü + konudan SDP kodu seç (deterministik, kapalı-küme, uydurmasız).

    Öncelik (yanlış sınıflandırmayı önlemek için katmanlı):
      1. KONU'daki spesifik kök (en güvenilir + spesifik sinyal),
      2. evrak TÜRÜ tabanı (sistemin ölçülmüş sınıflandırması),
      3. konu zayıf/eşleşmedi + tür yok → GÖVDEDE spesifik kök (son çare — genel kök gövdede
         TARANMAZ, aksi halde alakasız 'personel'/'evrak' geçişi yanlış kod verirdi),
      4. KONU'daki genel kök (en düşük öncelik).
    Hiçbiri eşleşmezse None → Sayı placeholder kalır (uydurma kod ASLA; dönen kod DAİMA tabloda).
    """
    konu_l = tr_lower(konu)
    return (
        _tara(konu_l, KONU_SDP_SPESIFIK)
        or ({"kod": (k := TUR_SDP[evrak_turu]), "baslik": SDP_TABLOSU[k]}
            if evrak_turu in TUR_SDP else None)
        or (_tara(tr_lower(ek_metin), KONU_SDP_SPESIFIK) if ek_metin else None)
        or _tara(konu_l, KONU_SDP_GENEL)
    )


__all__ = ("SDP_TABLOSU", "sdp_bul")
