"""Sohbet asistanı — deterministik niyet tespiti + filtre çıkarımı + şablon yanıt + bilgi tabanı.

LLM yok/mock/hata → bu modül asistanı TAM ayakta tutar (projedeki her LLM node'uyla aynı
sözleşme; CLAUDE.md "LLM entegrasyonu + fallback"). Saf fonksiyonlar: DB/ağ yok, birim-testli
(tests/test_sohbet.py). Route katmanı (api/routes/sohbet.py) LLM-birincil çalışır, None'da
buraya düşer. Bilgi tabanı YALNIZ site/işleyiş anlatır — mevzuat maddesi UYDURMAZ (§1).
Spec: docs/09-sohbet-asistani.md
"""

from __future__ import annotations

import re
from typing import Any

NIYETLER = frozenset({
    "gelen_evrak", "giden_evrak", "taslaklar", "islem_gecmisi",
    "panel_ozet", "mevzuat_ara", "site_yardim", "selamlama", "genel",
    # V2 — katalog/içerik okuma, işlem detayı, denetim doğrulama, HITL aksiyonları.
    "mevzuat_katalog", "mevzuat_icerik", "islem_detay", "denetim_dogrula",
    "taslak_onayla", "taslak_reddet",
    # V3 — SLA/yasal süre sorgusu (sla_triyaj zaten üretir; sohbet yüzeyi eklendi).
    "sla_durum",
})

# Veri-intent → (UI kart türü, "Görünüme git" hedefi). Route + frontend sözleşmesi.
KAYIT_TURU = {
    "gelen_evrak": ("gelen", "gelen"),
    "giden_evrak": ("giden", "giden"),
    "taslaklar": ("taslak", "taslaklar"),
    "islem_gecmisi": ("islem", "denetim"),
    "panel_ozet": (None, "panel"),
    "mevzuat_ara": ("mevzuat", "mevzuat"),
    "mevzuat_katalog": (None, "mevzuat"),
    "mevzuat_icerik": ("mevzuat", "mevzuat"),
    "islem_detay": ("islem", "denetim"),
    "denetim_dogrula": (None, "denetim"),
    "sla_durum": ("islem", "panel"),  # süresi geçen/kritik işlemler → Panel'de SLA rozeti
}

_LIMIT_MIN, _LIMIT_MAX, LIMIT_VARSAYILAN = 1, 20, 5

# Türkçe küçültme: str.lower() 'İ'→'i̇' (birleşik nokta) üretir → regex kaçırır.
_TR_MAP = str.maketrans({"İ": "i", "I": "ı"})


def _kucult(mesaj: str) -> str:
    return (mesaj or "").translate(_TR_MAP).lower()


_RE_SELAM = re.compile(r"\b(merhaba|selam|selamlar|günaydın|iyi (günler|akşamlar)|nasılsın)\b")
_RE_SORU = re.compile(r"\b(nedir|ne demek|ne işe|nasıl|anlat|açıkla|yardım)\b")
_RE_MEVZUAT = re.compile(r"\b(mevzuat\w*|kanun\w*|yönetmelik\w*|genelge\w*|tüzük\w*|kvkk|madde\w*)\b")
_RE_PANEL = re.compile(r"\b(kaç|istatistik\w*|dağılım\w*|toplam\w*|özet\w*|rapor\w*)\b")
_RE_GIDEN = re.compile(r"\b(giden\w*|gönderilen\w*|gönderdiğ\w*|reddedilen\w*)\b")
_RE_GELEN = re.compile(r"\b(gelen\w*|kuyru\w*|bekleyen\w*)\b")
_RE_TASLAK = re.compile(r"\btaslak\w*\b")
_RE_ISLEM = re.compile(r"\b(işlem\w*|işlenen\w*|geçmiş\w*)\b")
_RE_LIMIT = re.compile(r"\bson\s+(\d{1,3})\b|\b(\d{1,3})\s+(?:tane|adet)\b")
# Mevzuat sorgusundan atılacak dolgu kelimeler (q yalın kalsın → BM25 isabeti artar).
_RE_MEVZUAT_DOLGU = re.compile(
    r"\b(mevzuat\w*|kanun\w*|yönetmelik\w*|göster|getir|ara|bul|listele|hangi|ilgili|nedir"
    r"|sayılı|tam|met(?:in|n)\w*|oku|içeri\w*|detay\w*)\b")
# V2 tetikleyicileri — aksiyon (emir kipi) / katalog / içerik / detay / denetim.
_RE_ONAYLA = re.compile(r"\bonayla\b")
_RE_REDDET = re.compile(r"\breddet\b")
_RE_DENETIM = re.compile(r"\bdenetim\b.*\bdoğrula\w*|\bdoğrula\w*.*\bdenetim\b|\bdenetim izi")
_RE_MEVZUAT_NO = re.compile(r"\b(\d{3,5})\s*sayılı\b")
_RE_ICERIK = re.compile(r"\b(metn?i\w*|tam metin|içeri\w*|oku)\b")
_RE_KATALOG = re.compile(r"\b(katalo\w*|liste\w*|hangi|tüm|bütün)\b")  # katalog/kataloğu (yumuşak g)
_RE_DETAY = re.compile(r"\bdetay\w*\b")
# SLA / yasal süre — gecikmiş/kritik/vadesi yaklaşan evrak sorgusu (sla_triyaj: GECIKMIS/KRITIK).
_RE_SLA = re.compile(
    r"\b(gecik\w*|süresi geç\w*|süre(si)? dol\w*|vade\w*|yasal süre|son gün|kalan (gün|süre)"
    r"|zamanı geç\w*|deadline|geciken|kritik evrak\w*)\b")


def _parametre_cikar(mesaj: str) -> dict[str, Any]:
    """Filtreleri deterministik çıkar: durum / risk / limit / q."""
    durum = ""
    if re.search(r"\bredded\w*", mesaj):
        durum = "reddedildi"
    elif re.search(r"\bdüzenlen\w*", mesaj):
        durum = "duzenlendi"

    risk = ""
    if re.search(r"\b(kırmızı|yüksek risk\w*|riskli)\b", mesaj):
        risk = "kirmizi"
    elif re.search(r"\b(sarı|orta risk\w*)\b", mesaj):
        risk = "sari"
    elif re.search(r"\b(yeşil|düşük risk\w*)\b", mesaj):
        risk = "yesil"

    limit = LIMIT_VARSAYILAN
    if m := _RE_LIMIT.search(mesaj):
        limit = max(_LIMIT_MIN, min(int(m.group(1) or m.group(2)), _LIMIT_MAX))

    no = _RE_MEVZUAT_NO.search(mesaj)
    q = _RE_MEVZUAT_DOLGU.sub(" ", mesaj)
    q = re.sub(r"\s+", " ", q).strip()[:200]
    return {"durum": durum, "risk": risk, "limit": limit, "q": q,
            "mevzuat_no": no.group(1) if no else ""}


def fallback_niyet(mesaj: str) -> dict[str, Any]:
    """Anahtar-kelime/regex ile niyet tespiti — LLM'siz, deterministik.

    Sıra önemli: soru kipi ("nedir/nasıl") liste kelimelerini yener (kullanıcı görünümü
    SORUYOR, listelemiyor); "giden" "gelen"den önce denenir ("reddedilen giden ...").
    """
    m = _kucult(mesaj)
    params = _parametre_cikar(m)
    if _RE_SELAM.search(m):
        intent = "selamlama"
    elif _RE_SORU.search(m):
        # Mevzuat-içerikli soru ("kanunda ... nedir") bilgi tabanında karşılığı YOKSA
        # aramaya gider → kaynaklı cevap. Site kavramları (risk bandı, mevzuat görünümü)
        # bilgi tabanından yanıtlanmaya devam eder (davranış korunur).
        if _RE_MEVZUAT.search(m) and bilgi_yaniti(m) is None:
            intent = "mevzuat_ara"
        else:
            intent = "site_yardim"
    elif _RE_ONAYLA.search(m):          # emir kipi ("onayla") — "onaylanan" liste kalır
        intent = "taslak_onayla"
    elif _RE_REDDET.search(m):          # "reddet" emir; "reddedilen" sıfatı giden listesine gider
        intent = "taslak_reddet"
    elif _RE_DENETIM.search(m):
        intent = "denetim_dogrula"
    elif _RE_SLA.search(m):             # yasal süre sorgusu liste kelimelerini yener
        intent = "sla_durum"
    elif _RE_MEVZUAT_NO.search(m) or (_RE_MEVZUAT.search(m) and _RE_ICERIK.search(m)):
        intent = "mevzuat_icerik"
    elif _RE_MEVZUAT.search(m) and _RE_KATALOG.search(m):
        intent = "mevzuat_katalog"
    elif _RE_MEVZUAT.search(m):
        intent = "mevzuat_ara"
    elif _RE_DETAY.search(m):
        intent = "islem_detay"
    elif _RE_PANEL.search(m):
        intent = "panel_ozet"
    elif _RE_GIDEN.search(m):
        intent = "giden_evrak"
    elif _RE_GELEN.search(m):
        intent = "gelen_evrak"
    elif _RE_TASLAK.search(m):
        intent = "taslaklar"
    elif _RE_ISLEM.search(m):
        intent = "islem_gecmisi"
    else:
        intent = "genel"
    return {"intent": intent, "parametreler": params}


# Teyit sözlüğü — olumsuz kelime olumluyu VETO eder ("belki sonra" onay değildir).
_RE_TEYIT_OLUMSUZ = re.compile(r"\b(hayır|hayir|vazgeç|iptal|dur|istemiyorum|belki|sonra)\b")
_RE_TEYIT_OLUMLU = re.compile(r"\b(evet|onaylıyorum|onayla|tamam(dır)?|uygula|gönder|reddediyorum)\b")


def onay_teyit(mesaj: str) -> bool:
    """Sohbetten HITL aksiyonu teyidi — yalnız açık olumlu ifade True (temkinli varsayılan)."""
    m = _kucult(mesaj)
    if _RE_TEYIT_OLUMSUZ.search(m):
        return False
    return bool(_RE_TEYIT_OLUMLU.search(m))


# --------------------------------------------------------------------------
# Bilgi tabanı — site/işleyiş anlatımı (statik; mevzuat maddesi YOK)
# --------------------------------------------------------------------------
_BILGI: tuple[tuple[tuple[str, ...], str], ...] = (
    (("risk band", "risk seviye", "bant"),
     "**Risk bandı**, üretilen taslağın yayın güvenliği seviyesidir (trafik ışığı):\n"
     "**YEŞİL** — düşük risk, rutin memur onayı yeterli.\n"
     "**SARI** — orta risk, yayından önce inceleme önerilir.\n"
     "**KIRMIZI** — yüksek risk, otomatik gönderim durur; dikkatli memur kararı gerekir."),
    (("nasıl işl", "pipeline", "akış", "adım", "işliyor", "çalışıyor"),
     "Sistem her evrakı çok-ajanlı bir hatla işler: **oku (OCR)** → **tür sınıflandır** → "
     "**bilgi unsurlarını çıkar** → **eksik tespit** → **mevzuat öner (BM25 RAG)** → "
     "**özetle** → **yazı taslağı üret** → **birim yönlendir** → **memur onayı (HITL)**. "
     "Her adım LLM'siz de deterministik fallback ile çalışır."),
    (("gelen evrak", "kuyruk"),
     "**Gelen Evrak** görünümü işlenmeyi bekleyen evrak kuyruğudur. Bir evrakı seçtiğinizde "
     "canlı ajan akışında işlenir; sonuç Panel'e ve işlem geçmişine düşer."),
    (("giden evrak",),
     "**Giden Evrak** görünümü onaylanan/reddedilen yazıların kaydıdır — durum, risk bandı, "
     "alıcı birim ve denetim izi (hash) ile birlikte listelenir."),
    (("taslak",),
     "**Taslaklar** görünümü 'Düzenle' kararı verilen yazı taslaklarını tutar; metni "
     "düzenleyip yeniden onaya sunabilirsiniz."),
    (("mevzuat", "kvkk"),
     "**Mevzuat** görünümü, işlenen evraklara önerilen mevzuatı gösterir; arama BM25 tabanlı "
     "lokal mevzuat korpusunda çalışır. Şüpheli madde numaraları [DOĞRULA] etiketiyle işaretlenir "
     "— asistan mevzuat maddesi uydurmaz."),
    (("denetim", "hash", "iz"),
     "**Denetim** görünümü her işlemin adım adım denetim izini (hash zinciri, bütünlük "
     "doğrulaması) gösterir — kararlar sonradan değiştirilemez şekilde kayıt altındadır."),
    (("onay", "hitl", "insan", "reddet", "düzenle"),
     "Kritik kararlar **insan onayına (HITL)** bağlıdır: taslağı **Onayla** (Giden Evrak'a "
     "gider), **Düzenle** (Taslaklar'a düşer) veya **Reddet** (denetim iziyle kaydedilir)."),
    (("görev", "senaryo", "yarışma"),
     "Sistem iki zorunlu görevi kapsar: **Görev 1** — evrakı oku, sınıflandır, bilgi çıkar, "
     "eksik tespit et, mevzuat öner, özetle. **Görev 2** — resmî yazı taslağı üret, birim "
     "yönlendir, kullanıcıyı bilgilendir, gerekirse eksik bilgi iste."),
    (("pii", "kişisel veri", "maskele", "tckn"),
     "Çıkarılan kişisel veriler (TCKN, telefon) **otomatik maskelenir**; asistan ham kişisel "
     "veri döndürmez. Sistem yalnız sentetik/kurgu evrakla çalışır."),
    (("neler yapabilir", "sen kimsin", "ne yapabilir", "yetenekler", "yardım"),
     "Ben evrak asistanıyım. Şunları yapabilirim:\n"
     "• **Gelen/giden evrakları** listelemek (\"son gelen evraklar\", \"reddedilen gidenler\")\n"
     "• **Taslakları ve işlem geçmişini** göstermek\n"
     "• **Panel istatistiği** vermek (\"kaç evrak işledik?\")\n"
     "• **Yasal süre takibi** (\"hangi evrakların süresi geçti?\", \"vadesi yaklaşan işlemler\")\n"
     "• **Mevzuat aramak** (\"KVKK aydınlatma yükümlülüğü\")\n"
     "• **Siteyi anlatmak** (\"risk bandı nedir?\", \"sistem nasıl işliyor?\")"),
    (("yasal süre", "sla", "gecik", "vade", "deadline", "cevap süre"),
     "**Yasal süre (SLA)** takibi: her evrakın mevzuat kaynaklı cevap süresi (3071/4982/2429) "
     "izlenir. \"Süresi geçmiş\" (kırmızı), \"kritik\" (son gün yaklaşıyor) ve \"zamanında\" olarak "
     "işaretlenir; iş günü + resmî tatil duyarlı hesaplanır. \"Hangi evrakların süresi geçti?\" "
     "diye sorabilir, Panel'de birim-bazlı gecikme dökümünü görebilirsiniz."),
)


def bilgi_yaniti(mesaj: str) -> str | None:
    """Site bilgi tabanından yanıt — konu anahtarı eşleşmezse None (çağıran şablona düşer)."""
    m = _kucult(mesaj)
    for anahtarlar, yanit in _BILGI:
        if any(a in m for a in anahtarlar):
            return yanit
    return None


# --------------------------------------------------------------------------
# Şablon yanıt — LLM kompozisyonu yoksa deterministik Türkçe cevap
# --------------------------------------------------------------------------
_TUR_ETIKET = {
    "gelen_evrak": "gelen evrak", "giden_evrak": "giden evrak",
    "taslaklar": "taslak", "islem_gecmisi": "işlem", "mevzuat_ara": "mevzuat sonucu",
    "sla_durum": "süresi kritik/geçmiş işlem",
}

# SLA durum → memura okunur Türkçe etiket (sla_triyaj: GECIKMIS/KRITIK/NORMAL).
_SLA_ETIKET = {"GECIKMIS": "süresi geçmiş", "KRITIK": "süresi kritik", "NORMAL": "zamanında"}


def _kayit_satiri(intent: str, k: dict[str, Any]) -> str:
    """Tek kaydı tek satır özetle (tür-bilinçli alan seçimi, generic fallback)."""
    ad = k.get("baslik") or k.get("konu") or k.get("name") or k.get("evrak_no") or "kayıt"
    ekler: list[str] = []
    if intent == "giden_evrak":
        ekler += [e for e in (k.get("durum"), k.get("alici_birim")) if e]
    elif intent == "islem_gecmisi":
        ekler += [e for e in (k.get("evrak_turu"), k.get("hedef_birim"), k.get("bant")) if e]
    elif intent == "sla_durum":
        if durum := _SLA_ETIKET.get(str(k.get("sla_durum") or ""), ""):
            ekler.append(durum)
        kalan = k.get("kalan_gun")
        if kalan is not None:
            ekler.append(f"kalan {kalan} gün" if kalan >= 0 else f"{abs(kalan)} gün gecikme")
        if k.get("hedef_birim"):
            ekler.append(str(k["hedef_birim"]))
    elif intent == "mevzuat_ara" and k.get("madde_no"):
        ekler.append(f"m. {k['madde_no']}")
    tarih = (k.get("olusturuldu") or k.get("gonderim_tarihi") or "")[:10]
    if tarih:
        ekler.append(tarih)
    return f"• **{ad}**" + (f" ({', '.join(str(e) for e in ekler)})" if ekler else "")


def _sablon_v2(intent: str, veri: Any) -> str | None:
    """V2 tekil-veri şablonları (katalog / içerik / detay / denetim) — eşleşmezse None."""
    if not isinstance(veri, dict):
        return None
    if intent == "mevzuat_katalog":
        ornek = "\n".join(f"• **{o.get('baslik', '?')}**" + (f" ({o['no']} sayılı)" if o.get("no") else "")
                          for o in (veri.get("ornekler") or [])[:5])
        return (f"Sistemde **{veri.get('adet', 0)}** mevzuat kayıtlı. Kategoriler: "
                f"{', '.join(veri.get('kategoriler') or [])}." + (f"\nÖrnekler:\n{ornek}" if ornek else ""))
    if intent == "mevzuat_icerik":
        return (f"**{veri.get('baslik', 'Mevzuat')}**" + (f" ({veri['no']} sayılı)" if veri.get("no") else "")
                + (f"\n{veri['kunye']}" if veri.get("kunye") else "")
                + f"\nMadde sayısı: {veri.get('madde_sayisi', '?')}"
                + (f"\n\n{veri['metin_ozet']}…" if veri.get("metin_ozet") else ""))
    if intent == "islem_detay":
        eksik = ", ".join(veri.get("eksik_alanlar") or []) or "—"
        satirlar = [
            f"**{veri.get('name', 'işlem')}** — tür: {veri.get('evrak_turu', '?')}, "
            f"birim: **{veri.get('hedef_birim') or '—'}**, risk: {veri.get('bant') or '—'}.",
            f"Özet: {veri.get('ozet') or '—'}",
            f"Eksik alanlar: {eksik}",
        ]
        # "Neden bu risk / neden bu birim" — gerekçeler grounded (uydurmaz), varsa göster.
        if veri.get("risk_aciklama"):
            satirlar.append(f"Risk gerekçesi: {veri['risk_aciklama']}")
        if veri.get("birim_gerekce"):
            satirlar.append(f"Yönlendirme gerekçesi: {veri['birim_gerekce']}")
        return "\n".join(satirlar)
    if intent == "denetim_dogrula":
        ad = f" (**{veri['name']}**)" if veri.get("name") else ""
        if veri.get("butunluk"):
            return (f"✔ Denetim izi{ad} doğrulandı — **bütünlük sağlam**, "
                    f"{veri.get('adim_sayisi', '?')} adımlık hash zinciri tutarlı.")
        return f"⚠ Denetim izi{ad} doğrulanamadı — **bütünlük şüpheli**; Denetim görünümünden inceleyin."
    return None


def sablon_yanit(intent: str, veri: Any) -> str:
    """Araç sonucundan deterministik Türkçe yanıt (LLM fallback'i — asla boş dönmez)."""
    if v2 := _sablon_v2(intent, veri):
        return v2
    if intent == "selamlama":
        return ("Merhaba! Ben evrak asistanıyım. Gelen/giden evraklarınızı listeleyebilir, "
                "taslak ve işlem geçmişinizi gösterebilir, mevzuat arayabilir ve sistemin "
                "işleyişini anlatabilirim. Örn. \"son gelen evraklar\" ya da \"risk bandı nedir?\"")
    if intent == "site_yardim":
        return bilgi_yaniti("neler yapabilirsin") or ""
    if intent == "panel_ozet" and isinstance(veri, dict):
        riskler = veri.get("risk_dagilimi") or {}
        risk_txt = ", ".join(f"{ad}: {n}" for ad, n in riskler.items()) or "—"
        return ("**Panel özeti** — "
                f"gelen evrak: **{veri.get('gelen_evrak', 0)}**, "
                f"işlem: **{veri.get('islem', 0)}**, "
                f"giden evrak: **{veri.get('giden_evrak', 0)}**, "
                f"taslak: **{veri.get('taslak', 0)}**, "
                f"mevzuat korpusu: **{veri.get('mevzuat', 0)}** kayıt.\n"
                f"Risk dağılımı: {risk_txt}")
    if intent in _TUR_ETIKET:
        kayitlar = veri if isinstance(veri, list) else []
        etiket = _TUR_ETIKET[intent]
        if not kayitlar:
            return f"Bu ölçütlerle {etiket} kaydı bulunamadı."
        satirlar = "\n".join(_kayit_satiri(intent, k) for k in kayitlar)
        return f"**{len(kayitlar)}** {etiket} buldum:\n{satirlar}"
    if intent in KAYIT_TURU:  # detay/katalog intenti ama veri yok (kayıt bulunamadı)
        return "Bu ölçütlerle uygun kayıt bulunamadı."
    return ("Bunu tam anlayamadım. Şunları deneyebilirsiniz: \"son gelen evraklar\", "
            "\"reddedilen giden evraklar\", \"kaç evrak işledik?\", \"risk bandı nedir?\"")


__all__ = (
    "KAYIT_TURU", "LIMIT_VARSAYILAN", "NIYETLER",
    "bilgi_yaniti", "fallback_niyet", "onay_teyit", "sablon_yanit",
)
