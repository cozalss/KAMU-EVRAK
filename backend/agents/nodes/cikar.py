"""Görev 1 — Bilgi unsuru çıkarma node'u (gönderen, tarih, sayı, konu, talep, kurum, iletişim).

Akış: LLM JSON-mode YAPISAL alanları (gonderen/konu/talep/kurum/iletisim_adres/imza) çıkarır;
tarih/sayı + PII (TCKN/telefon) HER ZAMAN regex ile tespit edilir. LLM yok/mock/hata →
tam regex+keyword fallback (deterministik, anahtarsız demo çalışır).

PII GÜVENLİĞİ (CLAUDE.md §2): TCKN/telefon ASLA ham saklanmaz/döndürülmez. LLM'in
maskelemesine GÜVENİLMEZ — maskeleme deterministik regex ile uygulanır; LLM'in döndürdüğü
gonderen/konu alanları da PII-tarayıcıdan geçirilip maskelenir (sızıntı önlenir).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from agents.config import LLM_DUSUNME_CIKARIMDA_KAPALI
from agents.nodes._llm_extract import llm_json
from api.pii import mask_for_llm

log = structlog.get_logger()

_RE_TARIH = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")          # E-45678257-622.03-12345 vb.
_RE_TCKN = re.compile(r"\b[1-9]\d{10}\b")                 # 11 haneli — MASKELENİR
_RE_TEL = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")
_RE_KONU = re.compile(r"konu\s*[:：]\s*(.+)", re.IGNORECASE)
_RE_TALEP = re.compile(r"(talep ederim|rica ederim|arz ederim|gereğini|bilgilerinize)", re.IGNORECASE)

# Konu ÖZ olmalı (Yön. 2646 m.13): tam cümle/paragraf değil kısa başlık. Uzun "Konu:" satırı
# veya dilekçe cümlesi ilk anlamlı öbeğe indirilir (deterministik → her modda çalışır; LLM
# kısa özü _merge_llm'de bunu ezebilir). İlk cümle-sonlandırıcı/bağlaç öncesi + kelime tavanı.
_KONU_KESME = re.compile(r"[.;,]|\s(?:olup|için|ancak|çünkü|zira|nedeniyle|dolayısıyla)\s")
_KONU_MAX_KELIME = 8
_KONU_MAX_KR = 64


def _konu_kisa(ham: str) -> str:
    """Uzun konu ifadesini kısa öz'e indir (case korunur — özel ad/kısaltma bozulmasın)."""
    k = re.sub(r"\s+", " ", ham or "").strip().rstrip(".;,: ")
    if not k:
        return k
    if len(k) <= _KONU_MAX_KR and len(k.split()) <= _KONU_MAX_KELIME:
        return k
    parca = _KONU_KESME.split(k, maxsplit=1)[0].strip()
    kelimeler = parca.split()
    if len(kelimeler) > _KONU_MAX_KELIME:
        parca = " ".join(kelimeler[:_KONU_MAX_KELIME])
    return parca.rstrip(".;,: ") or k[:_KONU_MAX_KR]


# Çok-talep tespiti (§ kullanıcı: "onarım OLMAZSA yeni direk" gibi tek konu içinde birden çok
# istek). Koşullu/alternatif bağlaçlar + numaralı maddeler + istek fiilleri → talep cümleleri.
# bilgi_unsurlari["talep"] tarihsel BOOLEAN kalır (geriye uyum); "talepler" LİSTESİ additive
# eklenir → build_body gövdeyi tüm taleplerle kurabilir (aksi halde ikinci talep düşüyordu).
_RE_TALEP_BOL = re.compile(
    r"(?:\s(?:ayrıca|bir de|bunun yanı sıra|ek olarak|aksi(?:\s+halde|\s+takdirde)?|"
    r"mümkün\s+(?:değilse|olmazsa|olmaması\s+h(?:âlinde|alinde))|olmaz(?:sa|ise)|"
    r"alternatif\s+olarak)\s)|(?:;\s*)|(?:\n\s*\d+[.)]\s*)", re.IGNORECASE)
_RE_ISTEK = re.compile(
    r"(onar[ıi]l|tamir|gideril|yenile|yeni(?:\s+\w+){0,3}?\s+(?:direk|direği|tesis|kurul)|"
    r"tesis\s+edil|yerle[şs]tir|düzenlen|incelen|değerlendiril|kald[ıi]r|temin\s+edil|"
    r"sağlan|yap[ıi]l|denetlen|bilgi\s+veril|kontrol\s+edil|başlat[ıi]l|kulland[ıi]r[ıi]l)", re.IGNORECASE)


# İstek CÜMLESİNİN biçimi: Türkçe dilekçede istek "-mAsInI/-mAsI" + talep fiiliyle kurulur.
# Yalnız istek kökü yetmez — "yapılmaktadır" (durum bildirimi) da "yapıl" içerir (tur4 bulgusu).
_RE_TALEP_FIIL = re.compile(
    r"(m[ae]s[ıi]n[ıi]|m[ae]s[ıi]\s+(?:hususunda|için|konusunda)|talep\s+ed|rica\s+ed|"
    r"arz\s+ed|istiyorum|istirham|bekliyorum)", re.IGNORECASE)
# Antet / künye / imza satırları istek değildir: "T.C.", büyük harfli kurum adı, Tarih/Konu/
# Sayı/İlgi alanları, hitap ve kimlik satırları. Eskiden metnin İLK cümlesi alınıyordu →
# 15 örnek evrakın 8'inde talep "T.C" çıkıyordu ve Kurul'a "talepler: 1) T.C" diye sızıyordu.
_RE_KUNYE_SATIR = re.compile(
    r"^\s*(?:T\.\s*C\.?|(?:Tarih|Konu|Sayı|İlgi|Ek(?:ler)?|Adres|Telefon|E-posta|Adı\s+Soyadı|"
    r"Ad-Soyad|T\.C\.\s*Kimlik\s+No|Başvuru\s+(?:No|Türü)|İlgili\s+Kurum|Dosya\s+No)\s*:.*|"
    r"Sayın\b.*|İmza\s*|[^a-zçğıöşü]+)\s*$")
_RE_CUMLE_SONU = re.compile(r"(?<=[.!?])[ \t]+|(?<=[.!?])\n|\n[ \t]*\n")


def _govde_cumleleri(text: str) -> list[str]:
    """Künye/antet satırlarını at, kalan gövdeyi cümlelere böl. Satır sonları KORUNUR
    (numaralı madde bölmesi `_RE_TALEP_BOL` satır başına bakar); boşluk sonra katlanır."""
    govde = "\n".join(s for s in text.splitlines() if not _RE_KUNYE_SATIR.match(s))
    return [c.strip() for c in _RE_CUMLE_SONU.split(govde) if c and c.strip()]


def _talepleri_cikar(text: str) -> list[str]:
    """Metinden ayrı istek cümlelerini çıkar (koşullu ikinci talep dahil). Boş → []."""
    if not text:
        return []
    talepler: list[str] = []
    gorulen: set[str] = set()
    for cumle_tam in _govde_cumleleri(text):
        if not (_RE_ISTEK.search(cumle_tam) and _RE_TALEP_FIIL.search(cumle_tam)):
            continue
        for p in _RE_TALEP_BOL.split(cumle_tam):
            p = (p or "").strip()
            if not (p and _RE_ISTEK.search(p)):
                continue
            cumle = re.sub(r"\s+", " ", p).strip().rstrip(".;, ")[:200]
            anahtar = cumle.lower()[:60]
            if cumle and anahtar not in gorulen:
                gorulen.add(anahtar)
                talepler.append(cumle)
    return talepler[:5]  # makul üst sınır (belge tek işleme; 5 talep pratikte yeter)


# Gönderen ad-soyad: "Ad-Soyad: <İsim>" / "Adı Soyadı: <İsim>" satırı (sentetik+gerçek desen).
# İsim: 2+ baş-harfi büyük Türkçe sözcük; parantezli sıfat (İlgili/Vatandaş) atılır.
_RE_AD_SOYAD = re.compile(
    r"ad[ıi]?[ \t-]*soyad[ıi]?[ \t]*[:：][ \t]*"
    # İsim AYNI satırda kalmalı ([ \t], \s DEĞİL) → newline'ı geçip sonraki "Konu" vb.
    # satırı yutmasın (bug: 'Ayşe Yılmaz\nKonu' yakalanıyordu).
    r"([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:[ \t]+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)",
    re.IGNORECASE,  # "Ad-Soyad:" (büyük harf) etiketi de eşleşsin (mock-mod gönderen çıkarımı)
)

# LLM'in serbest-metin alanlarına TCKN/telefon sızarsa maskelemek için (sızıntı önle).
_PII_SCAN: tuple[re.Pattern[str], ...] = (_RE_TCKN, _RE_TEL)

_SYSTEM = (
    "Sen kamu evrakından yapısal bilgi çıkaran bir asistansın. Verilen evrak metninden "
    "şu alanları çıkar (yoksa null/false bırak — UYDURMA, metinde GÖRÜNMEYENİ yazma):\n"
    "- gonderen: gönderen kişi adı-soyadı veya tüzel kişi (ör. 'Ad-Soyad:' satırı)\n"
    "- kurum: gönderen/muhatap kurum adı (T.C. başlık satırından, varsa)\n"
    "- konu: evrakın konusu (kısa öz; 'Konu:' satırı yoksa gövdeden çıkar)\n"
    "- talep/iletisim_adres/imza: her biri {\"deger\": true/false, \"kanit\": \"...\"} biçiminde "
    "döndür. deger=true ise kanit alanına metinden BİREBİR (aynen, parafraz etmeden) "
    "alıntılanmış kısa bir ifade yaz; deger=false ise kanit null.\n\n"
    "KURALLAR:\n"
    "- gonderen yalnız metinde AÇIKÇA yazan ad-soyad/kurumdur; tahmin etme.\n"
    "- talep: dolaylı olsa da gerçek bir istek/arz varsa true (ör. 'çözülmesini umuyorum'). "
    "Yüzeysel bakma, metinde gerçek bir talep ifadesi olup olmadığını dikkatle ARA.\n"
    "- iletisim_adres yalnız gerçek bir adres/iletişim satırı varsa true.\n"
    "- imza yalnız imza/e-imza/kapanış ifadesi varsa true.\n"
    "- kanit metinde GEÇMEYEN bir ifadeyse deger=false say (uydurmaktansa false de).\n"
    "- TCKN, telefon, tarih, sayı çıkarma — bunlar ayrıca regex ile işlenir, ATLAMA.\n\n"
    "ÖRNEK:\n"
    'Metin: "T.C. SANAYİ VE TEKNOLOJİ BAKANLIĞI\\nKonu: tesis izni\\nKaydımın oluşturulmasını '
    'istiyorum.\\nAd-Soyad: Naz Tekin\\nTCKN: ..."\n'
    '→ {"gonderen": "Naz Tekin", "kurum": "Sanayi ve Teknoloji Bakanlığı", '
    '"konu": "tesis izni", '
    '"talep": {"deger": true, "kanit": "Kaydımın oluşturulmasını istiyorum"}, '
    '"iletisim_adres": {"deger": false, "kanit": null}, '
    '"imza": {"deger": false, "kanit": null}}\n\n'
    "Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"gonderen": null, "kurum": null, "konu": null, '
    '"talep": {"deger": false, "kanit": null}, '
    '"iletisim_adres": {"deger": false, "kanit": null}, '
    '"imza": {"deger": false, "kanit": null}}'
)


def _mask(s: str) -> str:
    """PII maskesi — ilk 3 + son 2 görünür, ortası yıldız."""
    if len(s) <= 5:
        return "*" * len(s)
    return f"{s[:3]}{'*' * (len(s) - 5)}{s[-2:]}"


def _scrub_pii(value: str) -> str:
    """Serbest-metin alanındaki ham TCKN/telefon'u maskele (LLM sızıntısına karşı)."""
    out = value
    for pat in _PII_SCAN:
        out = pat.sub(lambda m: _mask(re.sub(r"\s", "", m.group(0))), out)
    return out


def _regex_unsurlar(text: str) -> dict[str, Any]:
    """Deterministik tespit: PII maskeleme ÖNCE + tarih/sayı/konu + adres/imza/talep keyword.

    PII (TCKN/telefon) ÖNCE tespit edilir ve metinden REDAKTE edilir; sayı/konu çıkarımı bu
    redakte metinde koşar → açgözlü 'sayi' regex'i TCKN'yi ham yakalayamaz (sızıntı önlenir).
    """
    unsurlar: dict[str, Any] = {}
    # 1) PII — varlık işaretlenir, değer MASKELENİR (asla ham) + redakte metin kurulur.
    redacted = text
    if tckn := _RE_TCKN.search(text):
        unsurlar["tckn_maskeli"] = _mask(tckn.group(0))
        unsurlar["pii_var"] = True
    if tel := _RE_TEL.search(text):
        unsurlar["telefon_maskeli"] = _mask(re.sub(r"\s", "", tel.group(0)))
        unsurlar["pii_var"] = True
    redacted = _scrub_pii(text)  # TCKN/telefon span'ları maskeyle değiştir

    # 2) Yapısal alanlar — redakte metinde (sayi/konu ham PII yakalayamaz).
    if m := _RE_TARIH.search(redacted):
        unsurlar["tarih"] = m.group(0)
    if m := _RE_SAYI.search(redacted):
        unsurlar["sayi"] = m.group(0)
    if m := _RE_KONU.search(redacted):
        unsurlar["konu"] = _konu_kisa(m.group(1))          # ham satır değil kısa öz (Yön. m.13)
    # Gönderen ad-soyad: "Ad-Soyad: <İsim>" satırı (mock modda LLM yok → eksik-tespit
    # gonderen_ad_soyad'ı yanlış-eksik işaretliyordu; deterministik regex bunu kapatır).
    if m := _RE_AD_SOYAD.search(redacted):
        unsurlar["gonderen"] = m.group(1).strip()[:80]
    if _RE_TALEP.search(text):
        unsurlar["talep"] = True
    # Talep LİSTESİ (additive; boolean 'talep' korunur) — gövde tüm talepleri yansıtabilsin
    # (koşullu "onarım olmazsa yeni direk" gibi ikinci talep düşmesin). Maskeli metinden.
    talepler = _talepleri_cikar(redacted)
    if talepler:
        unsurlar["talepler"] = talepler
    if re.search(r"\b(adres|mahalle|cadde|sokak|no:)\b", text, re.IGNORECASE):
        unsurlar["iletisim_adres"] = True
    if re.search(r"\b(imza|e-imza|elektronik imza)\b", text, re.IGNORECASE):
        unsurlar["imza"] = True
    return unsurlar


def _kanit_gecerli(kanit: Any, text: str) -> bool:
    """Kanıt span'ı kaynak metinde GERÇEKTEN geçiyor mu? (uydurma-karşıtı doğrulama).

    Boşluk/büyük-küçük harf farkına toleranslı, ama alıntı kaynakta yoksa asla true dönmez —
    LLM'in kanıt-alıntısına 'güvenilmez, doğrulanır' ilkesi (bkz. verify.py grounding deseni).
    Minimum 15 karakter + en az 2 kelime şartı: kısa/tek-kelimelik alıntılar ("için", "arz
    e") kaynakta hemen her zaman TESADÜFEN geçer — gerçek bir kanıt değil, sahte-pozitif
    "topraklama" riski.
    """
    if not isinstance(kanit, str):
        return False
    kanit_norm = re.sub(r"\s+", " ", kanit).strip().casefold()
    if len(kanit_norm) < 15 or kanit_norm.count(" ") < 1:
        return False
    return kanit_norm in re.sub(r"\s+", " ", text).casefold()


def _merge_llm(unsurlar: dict[str, Any], obj: dict[str, Any], text: str) -> None:
    """LLM yapısal alanlarını birleştir (regex'i ezmeden; serbest-metin PII-scrub'lanır).

    talep/iletisim_adres/imza: {"deger": bool, "kanit": str|null} kanıt-alıntılı biçimde gelir
    (Chain-of-Verification deseni). Eksik-bilgi F-beta(β=2) eval'inde bu üç alan çıplak
    boolean'ken precision 1.0 / recall 0.739 ölçülmüştü — model tek örneğe kalıp eşleştirip
    dolaylı sinyalleri kaçırıyordu. Artık deger bayrağı false olsa bile kanıt kaynak metinde
    GERÇEKTEN doğrulanıyorsa true sayılır (recall-öncelikli — kamuda FN>FP); kanıt yoksa/
    uydurmaysa yine false — recall'a ağırlık verir ama uydurmayı asla kabul etmez.
    """
    for key in ("gonderen", "kurum"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip() and not unsurlar.get(key):
            unsurlar[key] = _scrub_pii(val.strip()[:160])
    # Konu ayrı ele alınır: LLM'in kısa özü, regex'in ham (uzun) konusunu EZEBİLİR — regex
    # "Konu:" satırının tamamını alıp uzun bırakıyordu. LLM konu daha kısaysa/regex konu
    # uzunsa LLM tercih edilir; ikisi de _konu_kisa güvenlik ağından geçer.
    llm_konu = obj.get("konu")
    if isinstance(llm_konu, str) and llm_konu.strip():
        aday = _konu_kisa(_scrub_pii(llm_konu.strip()))
        mevcut = unsurlar.get("konu") or ""
        if not mevcut or (len(mevcut) > _KONU_MAX_KR and len(aday) < len(mevcut)):
            unsurlar["konu"] = aday
    for key in ("talep", "iletisim_adres", "imza"):
        if unsurlar.get(key):
            continue  # regex zaten tespit etti
        alan = obj.get(key)
        if isinstance(alan, dict):
            if _kanit_gecerli(alan.get("kanit"), text):
                unsurlar[key] = True
        elif alan is True:  # eski çıplak-boolean şekli (LLM şema dışına çıkarsa) — geriye uyum
            unsurlar[key] = True
            log.warning("cikar_kanitsiz_boolean_fallback", alan=key)


async def cikar_node(state: dict[str, Any]) -> dict[str, Any]:
    """Yapısal bilgi unsurlarını çıkar — LLM (semantik alanlar) + regex (tarih/sayı/PII)."""
    text = state.get("evrak_text", "")
    unsurlar = _regex_unsurlar(text)  # PII maskeleme HER ZAMAN deterministik

    # KVKK: dış servise (DeepSeek) ham TCKN/telefon/IBAN GİTMEZ (route_birim.py:218 deseni).
    # isim=None → ad korunur (LLM gonderen'i çıkarır); yalnız sayısal PII maskelenir → LLM
    # bunları zaten regex'e bıraktığı için işlevsel kayıp yok.
    llm_metin = mask_for_llm(text, None)
    obj = await llm_json(_SYSTEM, llm_metin[:6000], max_tokens=300,
                         dusunme_kapali=LLM_DUSUNME_CIKARIMDA_KAPALI)
    source = "regex"
    if obj is not None:
        _merge_llm(unsurlar, obj, text)
        source = "llm+regex"

    log.info("cikar", alanlar=list(unsurlar), pii=bool(unsurlar.get("pii_var")), source=source)
    return {"bilgi_unsurlari": unsurlar}


__all__ = ("cikar_node",)
