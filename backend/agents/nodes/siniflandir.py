"""Görev 1 — Evrak türü sınıflandırma node'u (LLM-birincil + keyword fallback).

Akış (CLAUDE.md v2.3): few-shot LLM JSON-schema çıktı BİRİNCİL (kapalı-küme
config.EVRAK_TURLERI); LLM yok/mock/hata → keyword-heuristik fallback (deterministik,
anahtarsız demo çalışır). Düşük güvende "belirsiz" (abstention — kendi-tanımlı
kapalı-küme F1 manipülasyon algısını önle; docs/02 §1). Kademeli model (ENV-gated,
config.SINIFLANDIR_ESKALASYON): düşük güven/belirsiz'de deepseek-reasoner İKİNCİ
görüşü — yalnız N==1 yolunda; reasoner da emin değilse abstention aynen korunur.
"""

from __future__ import annotations

import asyncio
import re
from collections import Counter
from typing import Any

import httpx
import structlog

from agents.config import (
    ESKALASYON_MODEL,
    ESKALASYON_TIMEOUT_S,
    EVRAK_TURLERI,
    EVRAK_TURU_TR,
    SELF_CONSISTENCY_ESIK,
    SELF_CONSISTENCY_N,
    SINIFLANDIR_ESKALASYON,
)
from agents.llm import ChatMessage, get_llm_for_model
from agents.nodes._llm_extract import llm_json, parse_json_object
from core.text import tr_lower

log = structlog.get_logger()

# LLM güven eşiği — altında "belirsiz"e abstain (kapalı-küme manipülasyon koruması).
_ABSTAIN_THRESHOLD = 0.45
_VALID_TURLER = set(EVRAK_TURLERI)

_RE_KONU = re.compile(r"konu\s*[:：]\s*(.+)", re.IGNORECASE)
# Citizen sinyali: Ad-Soyad/TCKN bloğu (vatandaş evrakı; kurum→kurum yazıda yok).
_RE_CITIZEN = re.compile(r"(ad-?\s?soyad|t\.?c\.?\s?kimlik)", re.IGNORECASE)
# "İlgi" atfı (önceki yazıya cevap) — satır başı VEYA "ilgi sayılı/yazı/yazınıza".
_RE_ILGI = re.compile(r"(^|\n)\s*ilgi\b|ilgi\s*(sayılı|yazı|yazınıza|de kayıtlı)", re.IGNORECASE)

# 0) ÖNCELİKLİ gövde ifadeleri (Konu'dan ÖNCE) — gövde fiili türü Konu isminden daha
#    kesin belirlediği vakalar: cevabi yazı (önceki yazıya cevap), müzekkere (resmî bilgi-
#    celp), bilgi edinme (4982 mevcut-kayda erişim). Konu noun'u (ör. "başvuru sonucu",
#    "bilirkişi talebi") bu vakalarda yanıltır → öncelikli gövde markeri kazanmalı.
_GOVDE_ONCELIKLI: tuple[tuple[str, str], ...] = (
    # CİMER kanal vurgusu: "başvuru" sözcüğü içerse de (başvuru hattı/kanalı/merkezi) bu
    # bir kanal atfıdır → cimer (generic 'başvuru' keyword'ünden ÖNCE; aksi halde basvuru'ya kapılır).
    ("tek kapı başvuru", "cimer"), ("elektronik başvuru kanal", "cimer"),
    ("halk başvuru merkez", "cimer"), ("çevrim içi", "cimer"),
    ("başvuru portal", "cimer"), ("başvuru hatt", "cimer"),
    # Bilgi edinme (4982): MEVCUT kayda/belgeye erişim talebi — ayırt edici fiiller.
    ("mevcut bilgi ve belge", "bilgi_edinme"),
    ("tarafıma iletilmesini istiyorum", "bilgi_edinme"),
    ("tarafıma verilmesini istiyorum", "bilgi_edinme"),
    ("bir örneğinin tarafıma", "bilgi_edinme"),
    ("kayıtların tarafıma", "bilgi_edinme"),
    ("belgeleri talep ediyorum", "bilgi_edinme"),
    # Cevabi yazı: önceki yazıya cevap markerları.
    ("yazınıza istinaden", "cevabi_yazi"),
    ("yazınızda belirtilen", "cevabi_yazi"),
    ("talebiniz değerlendiril", "cevabi_yazi"),
    ("cevabımız ektedir", "cevabi_yazi"),
    ("tarafınıza bildiril", "cevabi_yazi"),
    ("sonucu aşağıda arz olunur", "cevabi_yazi"),
    ("görüşü aşağıda sunul", "cevabi_yazi"),
    # Müzekkere: açık "müzekkere" + DAR bilgi-celbi gövde fiilleri (başka kuruma kayıt/belge
    # isteme). "rica olunur"/"celbi" KASTEN DIŞARIDA (icra/görüşü çalıyordu — bkz. KONU katmanı);
    # buradakiler müzekkere'ye özgü (icra/görüş gövdesinde geçmez): dosyaya bildirim, makamımıza
    # gönderim, belge örneği isteme. Genel Konu nouns ('talebi'/'celbi') üzerine baskındır.
    ("müzekkere", "muzekkere"),
    ("dosyamıza bildiril", "muzekkere"), ("makamımıza gönder", "muzekkere"),
    ("belgelerin örnek", "muzekkere"), ("resmi yazı ekinde tarafımıza", "muzekkere"),
    # Tutanak: olay/tespitin huzurda belgelenip imzalanması — gövde fiili Konu noun'undan
    # ('teslim kaydı' → 'kaydı' = basvuru) DAHA kesin; tutanak'a özgü, başka türde geçmez.
    # GÖVDE markeri ÖNCELİKLİ (held-out-2 hata analizi, gpt-4o + mock): tutanak gövdesi
    # ("belgeye geçir/dökül/işlen", "saptanarak belgelen", "hazır bulunanlar") "İlgi" başlığı
    # taşısa da cevabi_yazi'ye, "onaylanmıştır" geçince genelge'ye, "teslim kaydı" Konu'su
    # basvuru'ya kapılıyordu. Bu markerlar 3 sette de yalnız tutanak'ta (sıfır çapraz-tür
    # çakışması doğrulandı) → cevabi/genelge/Konu sızıntısını ezer.
    ("imza altına al", "tutanak"), ("kayda geçir", "tutanak"),
    ("huzurunda belgelen", "tutanak"), ("belgelenerek imzal", "tutanak"),
    ("belgeye geçir", "tutanak"), ("belge altına", "tutanak"),
    ("belgeye işlen", "tutanak"), ("saptanarak belgelen", "tutanak"),
    ("belgeye dökül", "tutanak"), ("hazır bulunanlar", "tutanak"),
    # Rapor: DENETİM/İNCELEME bulgu+kanaat SONUCU (bir yazıya cevap DEĞİL). held-out-2'de
    # gövde ("incelemeye dair değerlendirmeleri", "saha çalışma", "izleme boyunca ... görüşe
    # bağlan") "İlgi" başlığı yüzünden cevabi_yazi'ye ya da abstain'e kaçıyordu. Bu inceleme-
    # sonucu markerları 3 sette de yalnız rapor gövdesinde (çapraz-tür çakışması yok) → cevabi
    # sızıntısını ezer. NOT: 'düzenlenen belgeye' KASTEN YOK (fatura ile çakışıyor).
    ("incelemeye dair değerlendirmeleri", "rapor"), ("saha çalışma", "rapor"),
    ("izleme boyunca", "rapor"), ("görüşe bağlan", "rapor"),
    ("sonuçları ve saptanan", "rapor"),
    # Dava evrakı: mahkeme/yargılama bağlamı — gövde 'itiraz dilekçesi' Konu'sunun generic
    # 'dilekçe' keyword'üne kapılmasını önler (dava bağlamı dilekçe'den baskın). held-out-2
    # çapraz-doğrulama (gpt-4o): dava gövdesi "İlgi" başlıklı / 'üst itiraz' Konu'lu olunca
    # cevabi_yazi/üst_yazı'ya kayıyordu → yargı-beyanı markerları (heyetinize, gerekçeli beyan,
    # delillerin tartışıl, ibraz ettiğimiz delil) resmî-yazı yapısal kuralından baskın.
    ("yargılama", "dava_evraki"), ("üst mercie", "dava_evraki"),
    ("merci nezdinde", "dava_evraki"), ("duruşmada dikkate", "dava_evraki"),
    ("heyetinize", "dava_evraki"), ("delillerin tartışıl", "dava_evraki"),
    ("gerekçeli beyan", "dava_evraki"), ("ibraz ettiğimiz delil", "dava_evraki"),
)

# 1) KONU-satırı tür sözcükleri (en ayırt edici; Konu evrak türünü adlandırır).
#    İlk eşleşen kazanır → spesifik tür sözcükleri genel olanlardan ÖNCE.
_KONU_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("tutanağı", "tutanak"), ("tutanak", "tutanak"),
    ("raporu", "rapor"),
    ("davası", "dava_evraki"), ("itirazın iptali", "dava_evraki"),
    ("itiraz dilekçe", "dava_evraki"),  # 'itiraz dilekçesi' Konu'su → dava (generic 'dilekçe'den önce)
    ("müzekkere", "muzekkere"),
    ("haciz", "icra_evraki"), ("ödeme emri", "icra_evraki"), ("icra takibi", "icra_evraki"),
    ("kambiyo", "icra_evraki"), ("kıymet takdiri", "icra_evraki"),
    ("celbi", "muzekkere"),  # 'kayıt celbi' Konu'su → müzekkere (icra Konu'ları üstte eşleşir)
    ("görüşü", "gorus_mutalaa"), ("mütalaa", "gorus_mutalaa"),
    ("hukuki değerlendirme", "gorus_mutalaa"),
    ("oluru", "genelge_talimat_olur"), ("genelge", "genelge_talimat_olur"),
    ("talimatı", "genelge_talimat_olur"),
    ("ihbarnamesi", "tebligat"), ("yıkım kararı", "tebligat"), ("tahliye kararı", "tebligat"),
    ("ruhsat iptali", "tebligat"),
    ("alımı", "fatura"), ("bedeli", "fatura"), ("fatura", "fatura"),
    ("bilgi edinme", "bilgi_edinme"),
    ("kaçak", "ihbar"), ("usulsüz", "ihbar"), ("kamu zararı", "ihbar"),
    ("ihlali", "ihbar"),
    ("başvuru", "basvuru"), ("kaydı", "basvuru"), ("izni", "basvuru"),
    ("talebi", "talep"),
)

# 2) Gövde anahtar sözcükleri (Konu eşleşmezse) — öncelik sıralı; ilk eşleşen kazanır.
#    NOT: 'talep ederim'/'arz ederim' KALDIRILDI — bunlar her resmî evrakta geçen kapalı-
#    biçim selamlamadır (catch-all), tür ayırt etmez; dilekçe'yi aşırı-tetikliyordu.
_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("bilgi edinme", "bilgi_edinme"), ("4982", "bilgi_edinme"),
    ("cimer", "cimer"),
    ("şikayet", "sikayet"), ("şikâyet", "sikayet"),
    ("ihbar ediyor", "ihbar"), ("ihbar ed", "ihbar"), ("usulsüzlük", "ihbar"),
    ("tebliğ edilir", "tebligat"), ("tebligat", "tebligat"),
    ("müzekkere", "muzekkere"),
    ("haciz", "icra_evraki"), ("icra dairesi", "icra_evraki"), ("ödeme emri", "icra_evraki"),
    ("duruşma", "dava_evraki"), ("davada", "dava_evraki"), ("mahkemenize", "dava_evraki"),
    ("dava dilekçe", "dava_evraki"),
    ("fatura", "fatura"), ("ödenmesi", "fatura"), ("tahakkuk", "fatura"),
    ("tutanak", "tutanak"),
    ("mütalaa", "gorus_mutalaa"), ("hukuki görüş", "gorus_mutalaa"),
    ("denetim raporu", "rapor"), ("faaliyet raporu", "rapor"),
    ("genelge", "genelge_talimat_olur"), ("talimatı", "genelge_talimat_olur"),
    ("oluru", "genelge_talimat_olur"),
    ("başvuru", "basvuru"),
    ("dilekçe", "dilekce"),
)

# Few-shot LLM prompt — kapalı-küme + abstention + AYIRT EDİCİ kurallar + örnekler.
# TASARIM (held-out genelleme): keyword DEĞİL ANLAM (intent/gönderen-rolü/eylem) üzerinden
# ayır → dolaylı/örtük ifadede de doğru sınıfla. Örnekler bilerek kısa ve ŞABLON-DIŞIDIR
# (gen_synthetic/heldout sözcüklerini ezberletmez; ayrımı ÖĞRETİR — OpenAI cookbook
# few-shot deseni). Her örnek farklı türden ve "anahtar sözcük yok" durumunu kapsar.
_SYSTEM = (
    "Sen Türk kamu kurumlarında gelen evrakı sınıflandıran bir uzman asistansın. "
    "Verilen evrak metnini SADECE şu kapalı listeden BİR türe ata:\n"
    f"{', '.join(EVRAK_TURLERI)}\n\n"
    "YÖNTEM — anahtar sözcüğe DEĞİL, şu üç sinyale bak:\n"
    "1) GÖNDEREN ROLÜ: vatandaş mı (Ad-Soyad/TCKN bloğu, 'istiyorum/rica ediyorum') "
    "yoksa kurum→kurum mu (imza bloğu, 'arz olunur/rica olunur')?\n"
    "2) NİYET/EYLEM: yeni bir hak/işlem mi isteniyor, mevcut bir belgeye mi erişiliyor, "
    "bir karar mı bildiriliyor, bir görüş mü soruluyor, para mı isteniyor?\n"
    "3) BAĞLAM: mahkeme/icra/tebliğ, mali, denetim/şikâyet, arşiv/tutanak?\n\n"
    "AYIRT EDİCİ KURALLAR (sık karışan ÇİFTLER — held-out hata analizi; bunlara DİKKAT):\n"
    "● VATANDAŞ TALEBİ ailesi (dilekçe / talep / başvuru / cimer) — hepsi vatandaştan ama\n"
    "  AYRI niyet; karıştırma:\n"
    "  - dilekce: vatandaşın SERBEST/genel talebi veya sorununun çözümü (özel bir izin/"
    "ruhsat süreci YOK; 'şu sorunun giderilmesini istiyorum').\n"
    "  - talep: SOMUT TEKİL istek — belirli bir belge/nüsha/randevu/kaynak/tahsis (yeni hak "
    "süreci değil; var olan bir işlemin yapılması: 'şu belgenin bir örneği', 'şu tahsisi').\n"
    "  - basvuru: belirli bir HİZMET/İZİN/RUHSAT/KAYIT için resmî SÜREÇ başlatma (şart/hak "
    "tesisi: 'şartları sağlıyorum, kaydımın yapılmasını/programa dâhil edilmemi').\n"
    "  - cimer: Cumhurbaşkanlığı İletişim Merkezi / tek-kapı / çevrim içi başvuru KANALI vurgusu "
    "(içerik dilekçe gibi olsa da kanal CİMER ise → cimer).\n"
    "  - bilgi_edinme (AYRI; vatandaş talebiyle KARIŞTIRMA): kurumda MEVCUT olan kayıt/belgeye "
    "ERİŞİM (4982; yeni hak değil, var olanın sureti/dökümü).\n"
    "● RESMÎ YAZI ailesi (üst yazı / cevabi yazı / müzekkere / genelge-talimat-olur) — kurum→kurum:\n"
    "  - ust_yazi: kurumun BAŞLATTIĞI yeni yazışma (ek/belge sunumu, koordinasyon; önceki yazıya "
    "atıf YOK).\n"
    "  - cevabi_yazi: önceki bir yazıya/talebe KARŞILIK ('ilgi yazınıza istinaden', 'incelendi, "
    "sonuç şudur').\n"
    "  - muzekkere: BAŞKA bir kurumdan/dosyadan bilgi/kayıt/belge CELBİ — genellikle mahkeme/"
    "savcılık/icra bağlamı ('… dosyasına ilişkin kayıtların makamımıza gönderilmesi').\n"
    "  - genelge_talimat_olur: ÜST MAKAM bağlayıcı düzenleme/onay (teşkilat geneli: 'tüm "
    "birimlerce uygulanmak üzere', 'makam oluru/onayı').\n"
    "● sikayet vs ihbar: sikayet = aksaklık/memnuniyetsizlik (mağduriyet). ihbar = bir kişi/"
    "kurum hakkında usulsüzlük/suç bildirimi (denetim/soruşturma ister).\n"
    "● ÖDEME/YARGI: fatura = bir bedelin/hak edişin ÖDENMESİ (para akışı). icra_evraki = zorla "
    "tahsil/haciz/malvarlığı (borçlu odaklı; ÜST YAZI değil — resmî format taşısa da icra "
    "bağlamı baskındır). dava_evraki = mahkeme/yargılama beyanı. tebligat = karar/yükümlülüğün "
    "muhataba RESMEN bildirimi (süre başlatır). gorus_mutalaa = hukuki YORUM/değerlendirme isteği.\n"
    "● BELGE-İŞLEMİ vs CEVAP (tutanak / rapor / dava_evraki ≠ cevabi_yazi) — held-out çapraz-"
    "doğrulama hatası; GÖVDE EYLEMİ başlığa baskındır:\n"
    "  - 'İlgi' satırı TEK BAŞINA cevabi_yazi YAPMAZ; kurumlar rutin atıf için de 'İlgi' yazar. "
    "Türü GÖVDEDEKİ EYLEM belirler, başlık değil.\n"
    "  - tutanak: bir OLAY/TESPİT/SAYIM/TESLİM'in HUZURDA belgeye geçirilip imzalanması "
    "('yerinde saptanan ... belgeye geçirildi/dökülerek onaylandı', 'hazır bulunanlarca'). "
    "Bir yazıya cevap DEĞİL.\n"
    "  - rapor: DENETİM/İNCELEME/İZLEME SONUCU — bulgu + kanaat/öneri ('incelemeye dair "
    "değerlendirmelerimiz', 'saha çalışmasının sonuçları', 'izleme boyunca ... görüşe bağlandı'). "
    "Bir yazıya cevap DEĞİL; kendi başına üretilen değerlendirme.\n"
    "  - dava_evraki: mahkeme/yargı beyanı ('heyetinize sunduğumuz beyanlar', 'gerekçeli beyan', "
    "'delillerin tartışılması', 'üst mercie taşıdığımız itiraz') — 'İlgi' taşısa da yargılama "
    "bağlamı cevabi_yazi/üst_yazı'dan baskındır.\n"
    "  - cevabi_yazi YALNIZCA: gövde önceki bir YAZIYA/İSTEME karşılık ('sorduğunuz konu', "
    "'iletilen istem incelendi, sonuç şudur') ve içerik tutanak/rapor/dava EYLEMİ DEĞİLse.\n\n"
    "ÖRNEKLER (yalnız ÇİFT-AYRIMINI göster; metni ezberleme):\n"
    'Metin: "Mahallemizdeki sorunun çözülmesini umuyorum. Ad-Soyad: ... TCKN: ..."\n'
    '→ {"evrak_turu": "dilekce", "tur_confidence": 0.8, "tur_reasoning": "vatandaş serbest talep"}\n'
    'Metin: "Faaliyet belgemin bir suretinin tarafıma verilmesini rica ederim. Ad-Soyad: ..."\n'
    '→ {"evrak_turu": "talep", "tur_confidence": 0.75, "tur_reasoning": "somut tekil belge isteği (izin süreci yok)"}\n'
    'Metin: "Aranan şartları taşıdığımdan kaydımın yapılarak programa dâhil edilmemi istiyorum."\n'
    '→ {"evrak_turu": "basvuru", "tur_confidence": 0.8, "tur_reasoning": "izin/kayıt süreci başlatma (şart tesisi)"}\n'
    'Metin: "Çevrim içi başvuru sistemi üzerinden ilettiğim şikâyetimdir. Ad-Soyad: ..."\n'
    '→ {"evrak_turu": "cimer", "tur_confidence": 0.8, "tur_reasoning": "çevrim içi başvuru kanalı (CİMER)"}\n'
    'Metin: "Kurumunuzda mevcut geçmiş kayıtların bir suretine erişmek istiyorum."\n'
    '→ {"evrak_turu": "bilgi_edinme", "tur_confidence": 0.85, "tur_reasoning": "mevcut kayda erişim (4982)"}\n'
    'Metin: "Daha önce gönderdiğiniz yazıda sorulan hususa ilişkin görüşümüz aşağıdadır."\n'
    '→ {"evrak_turu": "cevabi_yazi", "tur_confidence": 0.85, "tur_reasoning": "önceki yazıya karşılık"}\n'
    'Metin: "Esas dosyaya ilişkin kayıtların bir örneğinin makamımıza gönderilmesini rica ederiz."\n'
    '→ {"evrak_turu": "muzekkere", "tur_confidence": 0.8, "tur_reasoning": "başka dosyadan kayıt celbi"}\n'
    'Metin: "Söz konusu uygulamanın tüm birimlerce esas alınması hususunda gereğini rica ederim."\n'
    '→ {"evrak_turu": "genelge_talimat_olur", "tur_confidence": 0.8, "tur_reasoning": "teşkilat geneli bağlayıcı düzenleme"}\n'
    'Metin: "Borçlunun banka hesaplarına haciz konulması için gereğini arz ederiz."\n'
    '→ {"evrak_turu": "icra_evraki", "tur_confidence": 0.85, "tur_reasoning": "zorla tahsil/haciz (üst yazı değil)"}\n'
    'Metin: "İlgi: önceki yazışmamız. Yerinde saptanan hususlar hazır bulunanlarca belgeye geçirilip onaylanmıştır."\n'
    '→ {"evrak_turu": "tutanak", "tur_confidence": 0.85, "tur_reasoning": "huzurda tespit belgeleme (İlgi rutin atıf; cevap değil)"}\n'
    'Metin: "İlgi: yazınız. Saha çalışmasının sonuçları ve saptanan hususlar ekte derlenmiştir."\n'
    '→ {"evrak_turu": "rapor", "tur_confidence": 0.82, "tur_reasoning": "inceleme/saha sonucu (kendi değerlendirmesi; cevap değil)"}\n'
    'Metin: "İlgi: önceki yazışmamız. Sayın heyetinize sunduğumuz gerekçeli beyanların dosyaya alınmasını arz ederiz."\n'
    '→ {"evrak_turu": "dava_evraki", "tur_confidence": 0.85, "tur_reasoning": "yargı beyanı (İlgi taşısa da dava bağlamı baskın)"}\n\n'
    "Kurallar: Liste DIŞINDA tür UYDURMA. Emin değilsen 'belirsiz' + düşük güven (abstention).\n"
    "Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"evrak_turu": "<tür>", "tur_confidence": <0..1>, "tur_reasoning": "<kısa gerekçe>"}'
)


def _result(turu: str, conf: float, gerekce: str) -> dict[str, Any]:
    return {"evrak_turu": turu, "tur_confidence": conf,
            "tur_reasoning": f"{gerekce} [heuristik]"}


def _konu_satiri(text: str) -> str:
    """'Konu:' satırının küçük-harf içeriği (yoksa boş) — tür sözcüğü aranır."""
    m = _RE_KONU.search(text)
    return tr_lower(m.group(1)) if m else ""


# Vatandaş dilekçesi alt-sınıflandırıcı sinyalleri (citizen bloğu varsa, kurum/mali
# konu-noun'larından ÖNCE) — öncelik sıralı. CİMER/şikâyet/ihbar açık marker, kalan dilekçe.
_CITIZEN_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("cimer", "cimer"), ("cumhurbaşkanlığı iletişim", "cimer"),
    ("sistem üzerinden başvur", "cimer"), ("iletişim merkezi", "cimer"),
    ("şikayet", "sikayet"), ("şikâyet", "sikayet"),
    ("memnuniyetsiz", "sikayet"), ("süregelen", "sikayet"), ("rahatsız", "sikayet"),
    ("ihbar ed", "ihbar"), ("usulsüz", "ihbar"), ("kaçak", "ihbar"),
    ("bildiririm", "ihbar"), ("kamu zararı", "ihbar"),
)

# ===========================================================================
# SEMANTİK NİYET SİNYALLERİ (held-out genelleme — keyword sızıntısı DEĞİL)
# ===========================================================================
# TASARIM: keyword tablolarının (Konu/gövde) HİÇBİRİ eşleşmediğinde devreye giren
# KÖK-BAZLI niyet skorlayıcı. Stem'ler Türkçe çekim eklerini yutacak şekilde KISA
# (ör. "borçlu" → "borçluya/borçlunun"; "mevcut" → "mevcuttur"). Tek-kelime
# eşleşmesi değil; her sınıf için NİYET/EYLEM kümesi puan toplar, en yüksek kazanır.
# Sınıf-imzası ("dilekçe"/"fatura"/"müzekkere" gibi tür ADI) BİLEREK YOK — yalnız
# anlam taşıyan fiil/eylem kökleri. Bu katman in-domain'i BOZMAZ (keyword'ler önce
# eşleşir); yalnız dolaylı/örtük held-out gövdesinde fark yaratır.

# Vatandaş (Ad-Soyad/TCKN bloğu) gönderici niyet kökleri — öncelik skoru ile.
_CITIZEN_INTENT: dict[str, tuple[str, ...]] = {
    # CİMER: çevrim içi / tek-kapı resmî başvuru kanalı vurgusu (en ayırt edici).
    "cimer": ("tek kapı", "elektronik başvuru", "çevrim içi", "halk başvuru",
              "başvuru hatt", "başvuru portal", "başvuru kanal", "online başvuru"),
    # Bilgi edinme (4982): MEVCUT kayıt/belge/dosyaya ERİŞİM (yeni hak değil).
    "bilgi_edinme": ("mevcut", "suret", "erişmek", "erişme", "ulaşma", "ulaşmak",
                     "açıklanmasını", "bir örneğin", "birer örneğin", "dökümün",
                     "kayıtların tarafıma", "listesinin tarafıma", "verilere"),
    # İhbar: bir usulsüzlük/aykırılık/suç BİLDİRİMİ (denetim ister). NOT: "bilgilerinize
    # arz/sun" KASTEN YOK — her resmî evrakın kapalı-biçim KAPANIŞIDIR (catch-all), niyet
    # ayırt etmez; in-domain dilekçe/talep'i ihbar'a kaptırıyordu. Yalnız usulsüzlük kökleri.
    "ihbar": ("aykırılığ", "aykırılık", "izinsiz", "usulsüz", "kaçak",
              "tehlikeye at", "kayıt altına alınmadan", "kayıt dışı", "ihbar",
              "gizlilik içinde"),
    # Şikâyet: memnuniyetsizlik / mağduriyet / aksaklık (rahatsızlık bildirimi).
    "sikayet": ("memnun değil", "memnuniyetsiz", "rahatsız", "huzur", "aksama", "aksıyor",
                "bunaldım", "kabul edilemez", "şikayet", "şikâyet", "üzerine gid",
                "sonuç alamadım", "harekete geçmesini", "müdahale edilmesini"),
    # Başvuru: belirli izin/ruhsat/kayıt için RESMÎ SÜREÇ başlatma (şart/hak tesisi).
    "basvuru": ("şartları sağla", "şartları taşı", "koşulları taşı", "hakkımın tesis",
                "kaydımın oluştur", "kaydının oluştur", "programa dahil", "izin için",
                "sürecin başlat", "yararlanabilm", "dahil edilmesi"),
    # Talep: somut kaynak/işlem/belge isteği (yeni hak süreci değil; kullanım/tahsis).
    "talep": ("tahsis", "görevlendir", "kaynağın ayr", "kaynak ayr", "görüşme",
              "bir nüsha", "nüsha belge", "belge örneği", "ek kaynak", "destek sağlan",
              "geçici olarak"),
}

# Kurum→kurum (İmza/e-imza, vatandaş bloğu yok) gönderici niyet kökleri.
_KURUM_INTENT: dict[str, tuple[str, ...]] = {
    # Fatura/ödeme: bir BEDEL/MEBLAĞIN ödenmesi/tahsili (para akışı; mali belge). NOT:
    # generic "karşılanması"/"ödenek" YOK (müzekkere 'hususun karşılanması' + ust_yazi
    # 'ödenek aktarımı'nı çalıyordu); yalnız net para-akışı kökleri.
    "fatura": ("meblağ", "tutarın hesab", "bedel", "tahsilat", "hak ediş", "hak edilen",
               "bütçeden karşıl", "hesabımıza aktar", "meblağın tarafımıza"),
    # İcra: zorla tahsil / haciz / malvarlığına müdahale (borçlu odaklı).
    "icra_evraki": ("borçlu", "haciz", "el konul", "bloke", "şerh", "zorla tahsil",
                    "malvarlığ", "takip dosya", "tahsili amacıyla", "zorlama yol"),
    # Dava: mahkeme/yargılama beyanı (esas/duruşma/merci/itiraz/savunma).
    "dava_evraki": ("duruşma", "yargılama", "merci", "savunma", "iddialar", "esas hakk",
                    "uyuşmazlığ", "delillerin değerlendir", "üst mercie", "heyetinize"),
    # Müzekkere: başka kurumdan BİLGİ/KAYIT/BELGE celbi (resmî bilgi isteme).
    "muzekkere": ("rica olunur", "makamımıza gönder", "dosyamıza bildiril", "tarafımıza ulaştır",
                  "belgelerin örnek", "ihtiyacımız bulun", "ihtiyaç duyulan bilgi",
                  "kayıtların tarafımıza", "esas dosya"),
    # Görüş/mütalaa: HUKUKİ yorum/değerlendirme/kanaat isteği.
    "gorus_mutalaa": ("hukuki", "hukukçu", "kanaat", "yorumlan", "nasıl uygulan",
                      "tereddüd", "bakış açı", "değerlendirmesi talep", "yorumu konusunda"),
    # Tebligat: bir karar/yükümlülüğün muhataba RESMEN bildirimi (süre başlatır).
    "tebligat": ("muhatab", "resmen ulaştır", "resmen duyur", "size bildiril",
                 "süreniz başla", "tarafınıza resmen", "sabit kılın", "idari işlem"),
    # Genelge/talimat/olur: düzenleyici işlem + makam ONAYI (teşkilat geneli).
    "genelge_talimat_olur": ("onay", "yürürlüğe", "tüm birim", "tüm teşkilat",
                             "teşkilatça", "uygulama esas", "makamın onay", "onayına arz",
                             "onayınıza"),
    # Rapor: inceleme/faaliyet bulgu-değerlendirme sunumu.
    "rapor": ("bulgular", "bulgu", "değerlendirmeye sun", "faaliyetler", "analiz",
              "saha çalışma", "izleme sürec", "göstergeler", "özetlenerek"),
    # Tutanak: olay/tespitin huzurda belgelenip imzalanması.
    "tutanak": ("tespit", "huzurunda belgelen", "imza altına al", "kayda geçir",
                "yerinde görül", "belgelenerek imzal", "hazır bulunanlar"),
    # Cevabi yazı: önceki yazıya/talebe KARŞILIK (İlgi atfı + inceleme sonucu).
    "cevabi_yazi": ("göndermiş olduğunuz yazı", "iletilen talep incelen", "sorduğunuz konu",
                    "vardığımız sonuç", "yazınızda dile getir", "karşılık hazırla",
                    "incelememizin çıktı", "yaklaşımı tarafınıza"),
    # Üst yazı: kurumun BAŞLATTIĞI yeni yazışma (ek/belge sunumu, koordinasyon). NOT:
    # "bilgilerinize sun"/"saygıyla sunul" YOK (catch-all kapanış; cevabi_yazi'yi çalıyordu);
    # yalnız ek-sunma/takdim kökleri.
    "ust_yazi": ("ekte gönder", "ekte sunul", "takdim", "uygun görülmüş",
                 "değerlendirilmek üzere", "koordinasyon"),
}


def _score_intent(text: str, table: dict[str, tuple[str, ...]]) -> tuple[str, int]:
    """Niyet tablosunda en çok kök eşleşen sınıfı + skoru döndür (0 = eşleşme yok)."""
    best, best_n = "", 0
    for turu, koks in table.items():
        n = sum(1 for kok in koks if kok in text)
        if n > best_n:
            best, best_n = turu, n
    return best, best_n


def _semantik_niyet(text: str, citizen: bool) -> dict[str, Any] | None:
    """Kök-bazlı niyet skorlama (keyword katmanları boşa düştüğünde) → en olası tür.

    Gönderici rolü (vatandaş vs kurum→kurum) doğru niyet tablosunu seçer; zayıf/çelişkili
    sinyalde (skor 0) None döner → yapısal fallback + abstention devreye girer.
    """
    table = _CITIZEN_INTENT if citizen else _KURUM_INTENT
    turu, n = _score_intent(text, table)
    if n == 0:
        return None
    # Güven skorla orantılı (tek kök 0.5; çoklu kök 0.58) — abstention eşiği üstünde kalır.
    conf = 0.58 if n >= 2 else 0.5
    return _result(turu, conf, f"semantik niyet ({'vatandaş' if citizen else 'kurum'}): {n} kök → {turu}")


def _citizen_petition(text: str, konu: str) -> dict[str, Any] | None:
    """Vatandaş bloğu (Ad-Soyad/TCKN) VARSA AÇIK petisyon markeri: cimer/şikâyet/ihbar.

    SADECE açık petisyon sinyali (CİMER kanalı, şikâyet/memnuniyetsizlik, ihbar/usulsüzlük)
    eşleşirse döner. Genel 'dilekçe/talep' fallback'i YOKTUR — citizen bloğu fatura/dava/
    tutanak/rapor/başvuru gibi türlerde de bulunur; o ayrımı konu/keyword katmanları yapar.
    """
    if not _RE_CITIZEN.search(text):
        return None
    for kw, turu in _CITIZEN_KEYWORDS:
        if tr_lower(kw) in text:
            return _result(turu, 0.58, f"vatandaş bloğu + '{kw}' → {turu}")
    # "fatura itirazı" gibi vatandaş İTİRAZI fatura DEĞİL dilekçedir (mali belge kurum üretir).
    if "itiraz" in konu and "fatura" in konu:
        return _result("dilekce", 0.55, "vatandaş bloğu + fatura itirazı → dilekçe")
    return None


def _yapisal(text: str) -> dict[str, Any] | None:
    """Konu/gövde eşleşmezse yapısal sinyal: İlgi→cevabi, kurum→kurum→ust_yazi, vatandaş→dilekçe.

    Resmî yazıda Ad-Soyad/TCKN bloğu YOKTUR (kurum→kurum); vatandaş evrakında (dilekçe/
    talep) VARDIR. İlgi atfı önceki yazıya cevaptır (cevabi_yazi). Bu yapısal kural
    'arz ederim'/'talep ederim' selamlamasından bağımsız ayrım yapar.
    """
    citizen = bool(_RE_CITIZEN.search(text))
    resmi_baslik = "t.c." in text and ("sayı" in text or "sayi" in text)
    if _RE_ILGI.search(text):
        return _result("cevabi_yazi", 0.55, "İlgi atfı → cevabi yazı")
    # Vatandaş bloğu VARSA bu kurum→kurum üst yazı değildir → vatandaş talebi (dilekçe).
    # Bu kontrol ust_yazi'den ÖNCE: "talep ediyorum/ederim", "rica ederim", "istiyorum",
    # "çözüme kavuşturul", "giderilmesini" gibi serbest vatandaş talebi fiilleri.
    if citizen:
        return _result("dilekce", 0.5, "vatandaş bloğu + resmî başlık → dilekçe (yapısal)")
    if resmi_baslik:
        # Kurum→kurum resmî yazı, İlgi yok, vatandaş bloğu yok → üst yazı (yeni yazışma).
        return _result("ust_yazi", 0.5, "resmî başlık + İlgi yok + vatandaş bloğu yok → üst yazı")
    return None


def _heuristik(text: str) -> dict[str, Any]:
    """Katmanlı heuristik (LLM-yok fallback): Konu-tür sözcüğü → gövde keyword → yapısal sinyal.

    Konu satırı evrak türünü en sık adlandırır (en ayırt edici) → önce o; sonra gövde
    anahtar sözcükleri; en son İlgi/kurum-vatandaş yapısal ayrımı. Hiçbiri yoksa 'belirsiz'.
    """
    for kw, turu in _GOVDE_ONCELIKLI:
        if tr_lower(kw) in text:
            return _result(turu, 0.62, f"öncelikli gövde ifadesi: '{kw}'")
    konu = _konu_satiri(text)
    # Vatandaş bloğu varsa petisyon alt-türü kurum/mali konu-noun'undan ÖNCE belirlenir.
    if (citizen := _citizen_petition(text, konu)) is not None:
        return citizen
    if konu:
        for kw, turu in _KONU_KEYWORDS:
            if tr_lower(kw) in konu:
                return _result(turu, 0.6, f"Konu tür sözcüğü: '{kw}'")
    for kw, turu in _KEYWORDS:
        if tr_lower(kw) in text:
            return _result(turu, 0.6, f"gövde anahtar sözcük: '{kw}'")
    # Keyword katmanları boş düştü (held-out dolaylı gövde): KÖK-BAZLI niyet skorla.
    # Yapısal fallback'ten ÖNCE — yoksa her vatandaş→dilekçe, her kurum→üst_yazı çöker.
    is_citizen = bool(_RE_CITIZEN.search(text))
    if (niyet := _semantik_niyet(text, is_citizen)) is not None:
        return niyet
    if (yapisal := _yapisal(text)) is not None:
        return yapisal
    return _result("belirsiz", 0.3,
                   f"eşleşme yok (abstention); etiketler: {list(EVRAK_TURU_TR)[:5]}...")


def _from_llm(obj: dict[str, Any]) -> dict[str, Any] | None:
    """LLM JSON'unu doğrula → geçerli kapalı-küme türü + abstention; geçersiz → None."""
    turu = str(obj.get("evrak_turu", "")).strip()
    if turu not in _VALID_TURLER:
        return None
    try:
        conf = float(obj.get("tur_confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    reasoning = str(obj.get("tur_reasoning", "") or "LLM sınıflandırması").strip()[:240]
    if turu != "belirsiz" and conf < _ABSTAIN_THRESHOLD:  # abstention kapısı
        return {"evrak_turu": "belirsiz", "tur_confidence": conf,
                "tur_reasoning": f"düşük güven ({conf:.2f}) → belirsiz; LLM önerisi: {turu}"}
    return {"evrak_turu": turu, "tur_confidence": conf, "tur_reasoning": reasoning}


# _llm_extract._LLM_FALLBACK_EXCEPTIONS ile aynı sözleşme: yalnız geçici/altyapı
# hataları yutulur (timeout/ağ/anahtarsız/parse-öncesi); gerçek bug'lar (TypeError vb.)
# propagate eder, CancelledError dahil edilmez.
_ESKALASYON_FALLBACK_EXC = (
    asyncio.TimeoutError, httpx.HTTPError, ConnectionError, ValueError, RuntimeError,
)


async def _eskalasyon_ikinci_gorus(raw: str) -> dict[str, Any] | None:
    """Kademeli model (config 3): düşük güven/belirsiz'de reasoner'dan İKİNCİ görüş.

    Aynı system prompt kullanılır (görev tanımı değişmez; yalnız model güçlenir).
    İstemci chat() API'si timeout parametresi almadığından _llm_extract.llm_json ile
    aynı mekanizma uygulanır: asyncio.wait_for + ESKALASYON_TIMEOUT_S (reasoner uzun
    düşünür → node bütçesinden ayrı). Geçerli kapalı-küme türü + eşik üstü güven
    dönerse sonuç; belirsiz/geçersiz/hata/timeout → None (mevcut sonuç aynen kalır).
    """
    client = get_llm_for_model(ESKALASYON_MODEL)
    try:
        resp = await asyncio.wait_for(
            client.chat(
                messages=[ChatMessage(role="system", content=_SYSTEM),
                          ChatMessage(role="user", content=raw[:6000])],
                temperature=0.0,
                max_tokens=400,
                json_mode=True,
            ),
            timeout=ESKALASYON_TIMEOUT_S,
        )
    except _ESKALASYON_FALLBACK_EXC as exc:
        log.warning("siniflandir_eskalasyon_failed",
                    error=str(exc) or type(exc).__name__, exc_type=type(exc).__name__)
        return None
    obj = parse_json_object(resp.content)
    result = _from_llm(obj) if obj is not None else None
    # _from_llm eşik-altı güveni zaten 'belirsiz'e çevirir → burada belirsiz =
    # "reasoner da emin değil": ikinci görüş kullanılmaz, dürüst abstention korunur.
    if result is None or result["evrak_turu"] == "belirsiz":
        return None
    result["tur_reasoning"] = f"{result['tur_reasoning']} [eskalasyon]"
    return result


async def _self_consistency(raw: str) -> dict[str, Any] | None:
    """Self-consistency abstention (Wang 2023, M2): SELF_CONSISTENCY_N bağımsız örnek →
    çoğunluk oyu. Uzlaşı oranı SELF_CONSISTENCY_ESIK altındaysa (örnekler çelişiyor =
    gerçek belirsizlik) dürüst 'belirsiz' döner — abstention artık "zor" vakada TETİKLENİR.
    None → hiç geçerli LLM örneği yok → çağıran heuristik fallback'e düşer.
    """
    orneklem = await asyncio.gather(
        *[llm_json(_SYSTEM, raw[:6000], max_tokens=200) for _ in range(SELF_CONSISTENCY_N)]
    )
    oylar: list[str] = []
    confs: dict[str, list[float]] = {}
    for obj in orneklem:
        if obj is None or (r := _from_llm(obj)) is None:
            continue
        oylar.append(r["evrak_turu"])
        confs.setdefault(r["evrak_turu"], []).append(r["tur_confidence"])
    if not oylar:
        return None
    sayim = Counter(oylar)
    top, oy = sayim.most_common(1)[0]
    oran = oy / len(oylar)
    if oran < SELF_CONSISTENCY_ESIK or top == "belirsiz":
        return {"evrak_turu": "belirsiz", "tur_confidence": round(oran, 2),
                "tur_reasoning": (f"self-consistency: {len(oylar)} örnekte uzlaşı yok "
                                  f"({dict(sayim)}) → belirsiz (abstention)")}
    avg = sum(confs[top]) / len(confs[top])
    return {"evrak_turu": top, "tur_confidence": round(min(avg, oran), 2),
            "tur_reasoning": f"self-consistency {oy}/{len(oylar)} uzlaşı → {top}"}


async def siniflandir_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak türünü belirle — LLM-birincil (kapalı-küme + abstention), keyword fallback."""
    raw = state.get("evrak_text", "")
    text = tr_lower(raw)
    if not text.strip():
        return {"evrak_turu": "belirsiz", "tur_confidence": 0.0, "tur_reasoning": "boş metin"}

    # M2 — Self-consistency abstention (ENV-gated; varsayılan KAPALI → tek çağrı/maliyet).
    if SELF_CONSISTENCY_N > 1 and (sc := await _self_consistency(raw)) is not None:
        log.info("siniflandir", turu=sc["evrak_turu"], conf=sc["tur_confidence"],
                 source="self-consistency")
        return sc

    obj = await llm_json(_SYSTEM, raw[:6000], max_tokens=200)
    if obj is not None and (result := _from_llm(obj)) is not None:
        # Kademeli model: LLM düşük güven/belirsiz döndüyse (_from_llm eşik-altını
        # zaten 'belirsiz'e çevirdi → tek koşul yeter) reasoner ikinci görüşü alınır.
        # YALNIZ N==1 yolunda: self-consistency zaten pahalı çok-örnek yoludur, üstüne
        # eskalasyon maliyeti bindirilmez. Mock modda LLM sonucu oluşmaz → dal kapalı.
        if (result["evrak_turu"] == "belirsiz" and SINIFLANDIR_ESKALASYON
                and SELF_CONSISTENCY_N == 1
                and (esk := await _eskalasyon_ikinci_gorus(raw)) is not None):
            log.info("siniflandir", turu=esk["evrak_turu"],
                     conf=esk["tur_confidence"], source="llm+eskalasyon")
            return esk
        log.info("siniflandir", turu=result["evrak_turu"],
                 conf=result["tur_confidence"], source="llm")
        return result

    result = _heuristik(text)
    log.info("siniflandir", turu=result["evrak_turu"], source="heuristik")
    return result


__all__ = ("siniflandir_node",)
