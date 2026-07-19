"""Kurum kimliği katmanı — evraktan MUHATAP kurumu belirle (deterministik + LLM birleşik).

Kaynak-doğrulamalı birim yönlendirmesi (route ajanı) için "hangi kurumun resmî
kaynağında aranacağını" bilmek gerekir. İki kavram AYRI tutulur (bkz. plan REVİZYON 1):

- **muhatap_kurum**: evrakın yazıldığı/hitap ettiği kurum (başlık/hitap satırından).
- **yetkili_kurum**: işlemin hukuken/idari yetkilisi. Başlangıçta = muhatap_kurum;
  route ajanı talebin muhatabın görevinde OLMADIĞINI tespit ederse kurum-DIŞI gerçek
  yetkiliye günceller (ör. sokak aydınlatması → belediye değil elektrik dağıtım şirketi).

Bu modül yalnız MUHATAP tespitini yapar (deterministik regex — mock/anahtarsız modda da
çalışır; CI determinizmi korunur). Yetkili-kurum yükseltmesi ajan katmanındadır.
Yalnız stdlib + core.text (tr_lower/sanitize) kullanır — ağır bağımlılık yok.
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

from core.text import sanitize_text, tr_lower, tr_upper


class KurumKimlik(TypedDict):
    """Tespit edilen kurum künyesi. Boş tespit → ad="" (slug="", tur="")."""

    ad: str      # kanonik ad, ör. "Yenimahalle Belediyesi"
    slug: str    # dosya-güvenli slug, ör. "yenimahalle-belediyesi" (data/teskilat/ dizini)
    tur: str     # belediye | valilik | kaymakamlik | bakanlik | mudurluk | il_ozel_idare | diger


# Türkçe büyük-harf başlıklarda bir özel-ad öbeği (il/ilçe/kurum adı): 1-6 sözcük,
# aralarında boşluk/virgül veya "VE" olabilir (ör. "ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ").
_AD = (
    r"[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]+"
    r"(?:[\s,]+(?:VE\s+)?[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]+){0,6}"
)

# Sıra ÖNEMLİ: en spesifik tip önce. Her desen 'ad' grubunu (önceki özel-ad öbeği) yakalar;
# kurum tipi stem + Türkçe çekim eki toleransı (\w*) ile eşleşir. Hitap eki (-NA/-NE) \w*'e girer.
_DESENLER: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("belediye", re.compile(
        rf"(?P<ad>{_AD})\s+(?P<buyuk>BÜYÜKŞEHİR\s+)?BELEDİYE(?:\s+BAŞKANLIĞ\w*|Sİ\w*|\s+MECLİS\w*)?",
    )),
    ("il_ozel_idare", re.compile(rf"(?P<ad>{_AD})\s+İL\s+ÖZEL\s+İDARE\w*")),
    ("valilik", re.compile(rf"(?P<ad>{_AD})\s+VALİLİĞ\w*")),
    ("kaymakamlik", re.compile(rf"(?P<ad>{_AD})\s+KAYMAKAMLIĞ\w*")),
    ("bakanlik", re.compile(rf"(?P<ad>{_AD})\s+BAKANLIĞ\w*")),
    # BAŞSAVCILIĞI, MÜDÜRLÜĞ'ten önce: "... CUMHURİYET BAŞSAVCILIĞINA" özgül kalıp.
    ("bassavcilik", re.compile(rf"(?P<ad>{_AD})\s+CUMHURİYET\s+BAŞSAVCILIĞ\w*")),
    # ÜNİVERSİTESİ (REKTÖRLÜĞÜNE opsiyonel) — "ANKARA ÜNİVERSİTESİ REKTÖRLÜĞÜNE".
    ("universite", re.compile(rf"(?P<ad>{_AD})\s+ÜNİVERSİTESİ(?:\s+REKTÖRLÜĞ\w*)?")),
    ("mudurluk", re.compile(rf"(?P<ad>{_AD})\s+MÜDÜRLÜĞ\w*")),
    ("defterdarlik", re.compile(rf"(?P<ad>{_AD})\s+DEFTERDARLIĞ\w*")),
)

_ASCII = str.maketrans("çğıöşüâîûÇĞİÖŞÜ", "cgiosuaiucgiosu")

# Slug'a girmemesi gereken bağlaç/gürültü sözcükleri (özel-ad öbeğinden temizlenir).
_SLUG_STOP = frozenset({"ve", "ile", "sayin", "tc"})


def _slug(s: str) -> str:
    """Dosya-güvenli slug: tr_lower + ASCII katlama + tire. Bağlaçlar elenir."""
    kok = tr_lower(s).translate(_ASCII)
    parcalar = [p for p in re.split(r"[^a-z0-9]+", kok) if p and p not in _SLUG_STOP]
    return "-".join(parcalar)


_tr_upper = tr_upper  # geriye-uyum yerel takma ad (tek kaynak core.text.tr_upper)


# Başlık kasasında küçük kalan bağlaçlar (resmî ad yazımı: "Çevre ve Şehircilik").
_TITLE_KUCUK = frozenset({"ve", "ile", "ya", "veya"})


def _tr_title(s: str) -> str:
    """Türkçe-duyarlı başlık kasası: her sözcüğün ilk harfi büyük (İ/ı doğru); bağlaçlar küçük."""
    def cap(w: str, ilk: bool) -> str:
        if not w:
            return w
        if not ilk and w in _TITLE_KUCUK:
            return w
        bas = w[0].replace("i", "İ").replace("ı", "I").upper()
        return bas + w[1:]
    return " ".join(cap(w, i == 0) for i, w in enumerate(tr_lower(s).split()))


def _kanonik(tur: str, ad_ham: str, buyuk: bool) -> tuple[str, str]:
    """Ham eşleşen özel-ad öbeğinden (ad, slug) türet — tipe göre kanonik son-ek ekler."""
    ad_ham = re.sub(r"\s+", " ", ad_ham).strip(" ,")
    if tur == "belediye":
        govde = f"{ad_ham} Büyükşehir" if buyuk else ad_ham
        ad = f"{_tr_title(govde)} Belediyesi"
        return ad, f"{_slug(govde)}-belediyesi"
    sonek = {
        "valilik": ("Valiliği", "valiligi"),
        "kaymakamlik": ("Kaymakamlığı", "kaymakamligi"),
        "bakanlik": ("Bakanlığı", "bakanligi"),
        "bassavcilik": ("Cumhuriyet Başsavcılığı", "cumhuriyet-bassavciligi"),
        "universite": ("Üniversitesi", "universitesi"),
        "mudurluk": ("Müdürlüğü", "mudurlugu"),
        "defterdarlik": ("Defterdarlığı", "defterdarligi"),
        "il_ozel_idare": ("İl Özel İdaresi", "il-ozel-idaresi"),
    }.get(tur)
    if sonek is None:  # diger
        return _tr_title(ad_ham), _slug(ad_ham)
    ad = f"{_tr_title(ad_ham)} {sonek[0]}"
    return ad, f"{_slug(ad_ham)}-{sonek[1]}"


def bos_kurum() -> KurumKimlik:
    """Tespit yoksa boş künye."""
    return KurumKimlik(ad="", slug="", tur="")


def ad_to_kurum(ad: str) -> KurumKimlik:
    """Serbest kurum ADINDAN künye — route ajanının yetkili-kurum yükseltmesi için.

    Önce tip kalıbı denenir (ör. 'Ankara Valiliği' → valilik); kalıp yoksa ad serbest
    slug'lanır (ör. 'Uludağ Elektrik Dağıtım A.Ş.' → 'uludag-elektrik-dagitim-a-s', tur='diger').
    """
    ad = (ad or "").strip()
    if not ad:
        return bos_kurum()
    for tur, desen in _DESENLER:
        m = desen.search(ad) or desen.search(_tr_upper(ad))
        if m:
            kad, slug = _kanonik(tur, m.group("ad"), bool(m.groupdict().get("buyuk")))
            if slug:
                return KurumKimlik(ad=kad, slug=slug, tur=tur)
    slug = _slug(ad)
    return KurumKimlik(ad=_tr_title(ad), slug=slug, tur="diger") if slug else bos_kurum()


def antet_idare_adi(kurum: KurumKimlik | dict[str, Any] | None) -> str:
    """Künyeden antet İDARE satırı — Yön. 2646 m.10: idare adı BÜYÜK harflerle yazılır.

    Tespit yoksa boş string → render katmanı KURUM_ADI env / jenerik varsayılana düşer.
    """
    ad = str((kurum or {}).get("ad", "") or "")
    return _tr_upper(ad) if ad else ""


# YARGI (adli/icra) kurumu göstergeleri — bunlar ASLA "bizim kurumumuz" (antet) olamaz:
# idari bir kamu kurumu bir mahkeme/icra dairesi/savcılık adına yazı üretmez. Bu kurumlardan
# gelen evrak (müzekkere/tebligat/dava/icra) DIŞ kaynaktır → antet KURUM_ADI env'e düşer.
_YARGI_GOSTERGE = re.compile(
    r"mahkeme|icra\s+(?:müdürlüğ|dairesi)|icra\s+ve\s+iflas|savcılığ|başsavcılığ|"
    r"adliye|hâkimliğ|hakimliğ|bölge\s+adliye|danıştay|yargıtay|noterliğ",
)


def is_yargi_kurumu(kurum: KurumKimlik | dict[str, Any] | None) -> bool:
    """Kurum adli/icra makamı mı — mahkeme/icra/savcılık/adliye. Antet OLAMAZ (dış kaynak)."""
    ad = str((kurum or {}).get("ad", "") or "")
    return bool(ad and _YARGI_GOSTERGE.search(tr_lower(ad)))


def kurum_uyusmazligi(
    evrak_text: str,
    bilgi_unsurlari: dict[str, Any] | None,
    aktif_kurum_adi: str,
) -> KurumKimlik | None:
    """Gelen evrak, aktif kurumdan FARKLI TÜRDE bir kuruma hitaben düzenlenmişse o
    kurumu döndür (kurum uyuşmazlığı → KIRMIZI + gönderim engeli). Yoksa None.

    TEK-KURUM MODELİ (19 Tem mimari kararı): antet HER ZAMAN aktif_kurum'dur (env
    KURUM_ADI; bkz. yazi/models.py _DEMO_DEFAULTS). Evrak başka bir kuruma hitap etse
    bile antet DEĞİŞMEZ — bunun yerine bu fonksiyon uyuşmazlığı bildirir; risk katmanı
    KIRMIZI verir ve onay kapısı gönderimi kilitler.

    Uyuşmazlık ÖLÇÜTÜ (tür-duyarlı, demo pragmatiği):
    - Aynı TÜR kurum (belediye ↔ belediye): kurgu aktif kurum (Örnekşehir), gerçek örnek
      belediyelerin (Odunpazarı/Nilüfer...) yerine geçen stand-in kabul edilir → uyuşmazlık YOK.
    - Farklı TÜR (belediye vs. bakanlık/müdürlük/valilik): gerçek yanlış-kurum riski —
      bir belediye, Sağlık Müdürlüğüne/Bakanlığa hitaben yazılmış evrağı işleyemez → uyuşmazlık.
    - Yargı kurumu (mahkeme/icra/savcılık): DIŞ kaynak olarak ayrı ele alınır → muaf.
    - aktif_kurum tanımsızsa (test/baseline, KURUM_ADI boş): kontrol yapılmaz → None.
    Yalnız HİTAP-EKLİ (dative) tespitte tetiklenir: evrak açıkça o kuruma yazılmış olmalı.
    """
    aktif = ad_to_kurum(aktif_kurum_adi or "")
    if not aktif.get("slug"):
        return None
    kurum, hitapli = muhatap_kurum_tespit_meta(evrak_text, bilgi_unsurlari)
    if not hitapli or not kurum.get("ad") or is_yargi_kurumu(kurum):
        return None
    if kurum.get("slug") == aktif.get("slug") or kurum.get("tur") == aktif.get("tur"):
        return None
    return kurum


# Antet idare satırından SONRAKİ satırda birim kalıbı (Yön. m.10 üçüncü satır) —
# "Strateji Geliştirme Başkanlığı" gibi. Sayı/Tarih/Konu meta satırları birim değildir.
_BIRIM_GOSTERGE = re.compile(
    r"başkanlığ|müdürlüğ|müşavirliğ|daire|genel sekreterl|kurul|koordinatörlüğ|dekanlığ",
)
_META_SATIR = re.compile(r"^\s*(sayı|tarih|konu|ilgi|t\.c\.)\s*[:.]?", re.IGNORECASE)


def gonderen_birim_tespit(evrak_text: str) -> str:
    """Gelen evrakın antetindeki GÖNDEREN BİRİM satırı (varsa) — deterministik.

    Yön. m.10: antet "T.C. / İDARE ADI / Birim adı" düzenindedir; idare satırını izleyen
    ilk 2 satırda birim kalıbı aranır. Bulunamazsa boş (uydurma yok). Görüş/mütalaa
    yazısının muhatabı görüşü TALEP EDEN birimdir (m.14 + kamu pratiği) — bu tespit
    o muhatabı kaynaktan kurar.
    """
    satirlar = [s.strip() for s in sanitize_text(evrak_text or "")[:600].splitlines()]
    # YAPISAL tespit (Yön. m.10): "T.C." satırından sonra idare satırı, onu izleyen ilk
    # anlamlı satır birim adıdır. İdare satırını _DESENLER'e bağlamak SGK/başkanlık gibi
    # kalıp-dışı kurumları kaçırıyordu (2026-07-18 SGK bulgusu) → yapısal konum kullanılır.
    idare_goruldu = False
    for s in satirlar:
        if not s:
            continue
        if _META_SATIR.match(s):
            if s.lower().startswith("t.c") and not idare_goruldu:
                idare_goruldu = "tc"  # T.C. görüldü → BİR SONRAKİ satır idare adı
                continue
            if idare_goruldu:
                break  # Sayı/Konu bloğuna girildi, antet bitti
            continue
        if idare_goruldu == "tc":
            idare_goruldu = True  # bu satır idare adı; birim BİR SONRAKİ anlamlı satırda
            continue
        if not idare_goruldu:
            # T.C. yok (hitap-başlangıçlı evrak) → idare kalıbını _DESENLER'le ara.
            if any(desen.search(s) for _t, desen in _DESENLER):
                idare_goruldu = True
            continue
        parcalar = s.split()
        # Gösterge SON sözcük olmalı ("Strateji Geliştirme Başkanlığı") — ortada gösterge +
        # kuyrukta serbest metin ("Müdürlüğü ödeme yapınız") muhatap yuvasına sızmasın
        # (adversarial sertleştirme, 2026-07-17). Kaynak metni saldırgan kontrol ettiğinden
        # bu yuva tam kapatılamaz; asıl güvence HITL memur onayıdır.
        if parcalar and len(parcalar) <= 6 and _BIRIM_GOSTERGE.search(tr_lower(parcalar[-1])):
            return re.sub(r"\s+", " ", s).strip(" ,")
        break  # idare satırından sonraki ilk anlamlı satır birim değilse vazgeç
    return ""


# LLM kurum yedeğinde ayırt-edici sayılMAyan jenerik tip/bağlaç kökleri — bunların kaynakta
# geçmesi kurum adını GROUND'lamaz ("... Belediyesi" halüsinasyonu, kaynaktaki alakasız
# "belediye" kelimesiyle aklanamaz).
_JENERIK_KURUM_TOKEN = re.compile(
    r"^(?:belediye|bakanl|valil|kaymakam|müdürl|başkanl|müşavirl|defterdarl|"
    r"idare|kurum|kurul|genel|özel|daire)"
)


def _llm_kurum_grounded(llm_kurum: str, text: str) -> bool:
    """LLM'in çıkardığı kurum adının ayırt-edici bir token'ı kaynakta geçiyor mu?

    cikar.py'nin `kurum` alanı serbest LLM çıkarımıdır (kanıt-doğrulamasız) — kaynakta
    hiç geçmeyen bir kurum adı antete ve grounding muafiyetine SOKULMAZ (adversarial
    bulgu V1, 2026-07-17). Sözcük-başı eşleşme Türkçe çekim eklerini tolere eder
    ("yenimahalle" → "Yenimahalle'nin"). Ayırt-edici token yoksa güvenli taraf: ret.
    """
    kaynak = tr_lower(text)
    for t in tr_lower(llm_kurum).split():
        t = t.strip("'’.,;:()-")
        if len(t) < 4 or _JENERIK_KURUM_TOKEN.match(t):
            continue
        if re.search(rf"(?<!\w){re.escape(t)}", kaynak):
            return True
    return False


# Yönelme (hitap) eki — Yön. m.14/2: kurum muhatabın adı BÜYÜK harf + uygun yönelme
# hâl eki ("...BAŞKANLIĞINA"). Kanonik kurum/birim adları ünlüyle biter (Bakanlığı/
# Müdürlüğü/Belediyesi) → ünlü + n + ünlü-uyumlu a/e. Ünsüzle bitiyorsa (beklenmez)
# ek üretilmez — yanlış çekim riskine girmektense ad aynen kullanılır.
_ARKA_UNLU = frozenset("aıouAIOU")
_ON_UNLU = frozenset("eiöüEİÖÜ")


def hitap_eki(ad: str) -> str:
    """Kurum/birim adına yönelme ekiyle BÜYÜK-harf hitap üret (m.14/2)."""
    ad = (ad or "").strip()
    if not ad:
        return ""
    buyuk = _tr_upper(ad)
    son = ad[-1]
    if son in _ARKA_UNLU:
        return f"{buyuk}NA"
    if son in _ON_UNLU:
        return f"{buyuk}NE"
    return buyuk  # ünlüyle bitmeyen ad: çekim uydurma, aynen bırak


# Ad zaten yönelme-ekli (hitap biçiminde) mi — "...BAŞKANLIĞINA"/"...Belediyesine" gibi.
# İkinci kez ek eklemeyi önler (idempotence): yalnız TR-upper uygulanır.
_HITAP_BICIMLI = re.compile(r"(?:ğına|ğine|ğuna|ğüne|sına|sine|ına|ine|una|üne)$")

# İyelik (genitive) eki — m.15/6: ilgi tutulan belge muhatabın belgesi DEĞİLSE gönderen
# idarenin adı yazılır: "Ticaret Bakanlığının ... tarihli ve ... sayılı yazısı."
# (Cumhurbaşkanlığı kılavuzu Örnek 7 birebir). Kanonik adlar ünlüyle biter → ünlü-uyumlu
# n+ın/in/un/ün; ünsüzle bitende ek üretilmez (çağıran düz kalıba düşer — yanlış çekim yok).
_GENITIVE_EK = {"a": "nın", "ı": "nın", "e": "nin", "i": "nin",
                "o": "nun", "u": "nun", "ö": "nün", "ü": "nün"}


def iyelik_eki(ad: str) -> str:
    """'Ankara 5. İcra Müdürlüğü' → 'Ankara 5. İcra Müdürlüğünün' (ekleyemezse ad aynen)."""
    ad = (ad or "").strip()
    if not ad:
        return ""
    ek = _GENITIVE_EK.get(tr_lower(ad[-1]))
    return f"{ad}{ek}" if ek else ad


def _hitap_idempotent(ad: str) -> str:
    """Adı m.14/2 hitap biçimine çevir; zaten yönelme-ekliyse yalnız TR-upper (çift ek yok)."""
    ad = (ad or "").strip()
    if not ad:
        return ""
    if _HITAP_BICIMLI.search(tr_lower(ad)):
        return _tr_upper(ad)
    return hitap_eki(ad)


# Kurum/makam görünümlü ad mı (gerçek kişi DEĞİL) — muhatap yuvasına vatandaş adı sızmasın.
_KURUM_GORUNUMLU = re.compile(
    r"bakanlı|müdürlü|başkanlı|müşavirli|rektörlü|valili|kaymakaml|belediye|kurum|kurul|"
    r"daire|mahkeme|icra|savcılı|başsavcılı|adliye|üniversite|genel sekreterl|müftülü|"
    r"defterdarlı|dekanlı|komutanlı|a\.ş\.|ltd|şti|enstitü|ajans|odası|müd.rl.ğ",
)


def _kurum_gorunumlu(ad: str) -> bool:
    """Ad bir kurum/makam adı gibi mi (gerçek kişi adı değil)?"""
    return bool(ad and _KURUM_GORUNUMLU.search(tr_lower(ad)))


def gorus_muhatabi(evrak_text: str, plan_muhatap: str = "") -> str:
    """Görüş/mütalaa yazısının muhatabı — m.14/2 hitap biçimli (BÜYÜK + yönelme eki).

    Görüşün muhatabı görüşü TALEP EDEN birimdir (Diyanet örneği deseni). Öncelik:
    gelen antetten deterministik gönderen-birim tespiti; yoksa dinamik planın grounded
    muhatabı hitap biçimine çevrilir. Biçimlendirme kaynaktan bağımsız TEK kapıdan geçer.
    """
    birim = gonderen_birim_tespit(evrak_text)
    if birim:
        return hitap_eki(birim)
    return _hitap_idempotent(plan_muhatap)


def muzekkere_muhatabi(evrak_text: str, gonderen: str = "") -> str:
    """Müzekkere CEVABININ muhatabı — m.14/2 hitap biçimli, kaynaktan deterministik.

    İki senaryo (2026-07-18 SGK bulgusu): (a) YARGI müzekkeresi (mahkeme/icra) → muhatap
    gönderen makamdır ("ANKARA 12. ASLİYE HUKUK MAHKEMESİNE"); (b) idari kurum İÇİ müzekkere
    (SGK Hukuk Müşavirliği bilgi/belge celbi) → muhatap TALEP EDEN birimdir, antet 3. satırı
    ("HUKUK MÜŞAVİRLİĞİNE"), tıpkı görüş gibi. Plan muhatabı yerine kaynaktan kurulur
    (LLM birim/kurum ayrımında güvenilmez).
    """
    kurum, _hitapli = muhatap_kurum_tespit_meta(
        evrak_text, {"kurum": gonderen} if gonderen else None)
    yargi = is_yargi_kurumu(kurum) or bool(
        gonderen and _YARGI_GOSTERGE.search(tr_lower(gonderen)))
    # Gönderen kurum/makam görünümlü DEĞİLSE (gerçek kişi adı) muhatap yuvasına sokma —
    # müzekkere kurum-içi/adli yazıdır, "Sayın Ayşe Yılmaz" sızmamalı (regresyon guard).
    kurum_ad = kurum.get("ad", "") if _kurum_gorunumlu(kurum.get("ad", "")) else ""
    gonderen_kurum = gonderen if _kurum_gorunumlu(gonderen) else ""
    if yargi:
        return _hitap_idempotent(gonderen_kurum or kurum_ad)
    birim = gonderen_birim_tespit(evrak_text)  # idari iç → talep eden birim (antet 3. satır)
    if birim:
        return hitap_eki(birim)
    return _hitap_idempotent(gonderen_kurum or kurum_ad)


def muhatap_kurum_tespit(
    evrak_text: str,
    bilgi_unsurlari: dict[str, Any] | None = None,
) -> KurumKimlik:
    """Evrakın MUHATAP kurumunu belirle — deterministik regex birincil, LLM kurum yedek.

    Deterministik başlık/hitap kalıpları (T.C. başlığı veya '...BAŞKANLIĞINA' hitabı) mock
    modda da çalışır. Regex bulamazsa LLM'in çıkardığı `bilgi_unsurlari['kurum']` serbest
    metni slug'lanır (tur='diger'). Hiçbiri yoksa boş künye (ajan `_genel-belediye`'ye düşer).
    """
    kurum, _hitapli = muhatap_kurum_tespit_meta(evrak_text, bilgi_unsurlari)
    return kurum


def muhatap_kurum_tespit_meta(
    evrak_text: str,
    bilgi_unsurlari: dict[str, Any] | None = None,
) -> tuple[KurumKimlik, bool]:
    """muhatap_kurum_tespit + hitap bilgisi: (künye, hitapli).

    hitapli=True → eşleşme YÖNELME-EKLİ hitap satırından geldi ("...BAŞKANLIĞINA"):
    evrak bu kuruma AÇIKÇA hitap ediyor. Hitap-ekli eşleşme, nominatif T.C. başlığından
    (gönderen kurum olabilir) ÖNCELİKLİDİR — "Sanayi Bakanlığı'ndan Nilüfer Belediyesine"
    yazısında muhatap belediyedir, bakanlık değil (fonksiyonun adı zaten MUHATAP).
    """
    bilgi_unsurlari = bilgi_unsurlari if isinstance(bilgi_unsurlari, dict) else {}
    text = sanitize_text(evrak_text or "")
    # Yalnız ilk ~1200 karakter: kurum başlığı/hitap evrağın başında olur; gövdedeki
    # kurum adı geçişleri (ör. "belediyeye başvurdum") yanlış-pozitif üretmesin.
    bas = text[:1200]
    # 1) Hitap-ekli (dative) eşleşme — konum olarak EN ERKEN olan kazanır.
    hitap_en_erken: tuple[int, str, re.Match[str]] | None = None
    for tur, desen in _DESENLER:
        for m in desen.finditer(bas):
            if not _HITAP_BICIMLI.search(tr_lower(m.group(0))):
                continue
            if hitap_en_erken is None or m.start() < hitap_en_erken[0]:
                hitap_en_erken = (m.start(), tur, m)
    if hitap_en_erken is not None:
        _poz, tur, m = hitap_en_erken
        ad, slug = _kanonik(tur, m.group("ad"), bool(m.groupdict().get("buyuk")))
        if slug:
            return KurumKimlik(ad=ad, slug=slug, tur=tur), True
    # 2) Nominatif başlık — mevcut desen-öncelik sırası (yönlendirme davranışı korunur).
    for tur, desen in _DESENLER:
        m = desen.search(bas)
        if not m:
            continue
        ad, slug = _kanonik(tur, m.group("ad"), bool(m.groupdict().get("buyuk")))
        if slug:
            return KurumKimlik(ad=ad, slug=slug, tur=tur), False

    # Yedek: LLM'in çıkardığı serbest-metin kurum (mock'ta boş olabilir). Kaynak-doğrulamalı:
    # ayırt-edici token'ı kaynakta geçmeyen kurum adı HALÜSİNASYON sayılır ve kullanılmaz.
    llm_kurum = ((bilgi_unsurlari or {}).get("kurum") or "").strip()
    if llm_kurum and _llm_kurum_grounded(llm_kurum, text):
        # LLM kurum metninde de tip kalıbı olabilir → aynı desenlerle dene (tr-upper: İ doğru).
        for tur, desen in _DESENLER:
            m = desen.search(llm_kurum) or desen.search(_tr_upper(llm_kurum))
            if m:
                ad, slug = _kanonik(tur, m.group("ad"), bool(m.groupdict().get("buyuk")))
                if slug:
                    return KurumKimlik(ad=ad, slug=slug, tur=tur), False
        return KurumKimlik(ad=_tr_title(llm_kurum), slug=_slug(llm_kurum), tur="diger"), False

    return bos_kurum(), False


__all__ = (
    "KurumKimlik", "ad_to_kurum", "antet_idare_adi", "bos_kurum",
    "gonderen_birim_tespit", "gorus_muhatabi", "hitap_eki", "is_yargi_kurumu",
    "iyelik_eki", "kurum_uyusmazligi", "muhatap_kurum_tespit",
    "muhatap_kurum_tespit_meta", "muzekkere_muhatabi",
)
