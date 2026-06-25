#!/usr/bin/env python
"""Sentetik kamu-evrak veri üreteci — TEKNOFEST 2026 1. Senaryo (Kamu Evrak ve Yazışma).

Yarışma şartnamesi (§6.5): GERÇEK kamu verisi YASAK → tüm evraklar KURGU. Bu modül
KANONİK taksonomi için (agents/config.py — tek kaynak) şablon-tabanlı sahte resmî
evrak üretir, **checksum-geçerli SAHTE TCKN** + sahte telefon/adres ekler
(CLAUDE.md §2: gerçek PII ASLA), zorluk stratifikasyonu (kolay/orta/zor) ve
eksik-alan enjeksiyonu uygular.

ÖNEMLİ DEĞİŞİKLİK (eval gerçek pipeline'ı ölçmeli):
  - Bu modülün ESKİ "kendi uydurma taksonomisi" (itiraz/basvuru_izin/...) ve mock
    ajan boru hattı KALDIRILDI. Artık taksonomi TEK KAYNAKTAN gelir:
        from agents.config import EVRAK_TURLERI, BIRIMLER, EVRAK_TO_BIRIM,
                                   ZORUNLU_ALANLAR, EVRAK_TO_YAZI, EVRAK_TO_MEVZUAT
  - Eval scriptleri ARTIK gerçek LangGraph pipeline'ı (agents/graph.py) koşar; bu
    modül YALNIZ veri + altın etiket üreticisidir (gold gerçek config türleri/birim
    key'leri ile etiketlenir).
  - Gold `eksik_alanlar`, gerçek pipeline'ın MOCK modda (LLM yok) gerçekten tespit
    edebileceği alanlara göre türetilir (cikar regex/keyword görünürlüğü simüle
    edilir) → missing_info_eval anlamlı set-P/R ölçer, tavan 1.0'a sahte sabitlenmez.

Çıktı (data/synthetic/):
  evrak_class_gold.jsonl   — Görev 1 sınıflandırma + özet + eksik-alan altın seti
  routing_gold.jsonl       — Görev 2 birim yönlendirme altın seti
  ozet_gold.jsonl          — özet anahtar-unsur (key-fact) altın seti
  yazi_taslak_gold.jsonl   — resmî yazı taslağı format-uyum altın seti
  eksik_bilgi_gold.jsonl   — eksik-bilgi tespit (set-P/R) altın seti
  e2e_scenarios.jsonl      — uçtan-uca senaryo (her iki görev birlikte)

Çalıştır (mutlak yol; PYTHONPATH=...\\backend):
    python scripts/gen_synthetic.py [--per-type N] [--seed S] [--out DIR]
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path

# --- Kanonik backend modüllerini import edebilmek için sys.path'e backend ekle ---
_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from agents.config import (  # noqa: E402  (sys.path ayarından sonra import)
    BIRIMLER,
    EVRAK_TO_BIRIM,
    EVRAK_TO_MEVZUAT,
    EVRAK_TO_YAZI,
    EVRAK_TURLERI,
    EVRAK_TURU_TR,
    ZORUNLU_ALANLAR,
)

# Deterministik tekrar-üretilebilirlik (jüri: aynı tohum = aynı veri).
DEFAULT_SEED = 20260625
# Tür-başı varsayılan 12 → 18 üretilen tür × 12 = 216 örnek (Wilson %95 CI anlamlı
# daralsın; docs/05 hedefi ≥180 class). Çeşitlilik (kurum/konu/ifade varyantları)
# her tür için artırıldı → gold daha gerçekçi, eval ezber-tavanına oturmaz.
DEFAULT_PER_TYPE = 12

ZORLUK = ("kolay", "orta", "zor")

# 'belirsiz' kapalı-küme abstention etiketidir — sentetik veri ÜRETMEYİZ (gold'da
# karşılığı yok; pipeline düşük-güvende buraya düşer, bu davranış sınıflandırma
# eval'inde abstention oranı olarak ölçülür). Kalan 18 tür için kurgu üretilir.
URETILEN_TURLER: tuple[str, ...] = tuple(t for t in EVRAK_TURLERI if t != "belirsiz")


# ===========================================================================
# 1. SAHTE PII — CLAUDE.md §2: gerçek TCKN/telefon/isim ASLA. Hep sahte.
# ===========================================================================
_AD = ("Ayşe", "Mehmet", "Fatma", "Ali", "Zeynep", "Mustafa", "Elif", "Hüseyin",
       "Emine", "Ahmet", "Hatice", "İbrahim", "Meryem", "Hasan", "Şükran", "Cem",
       "Selin", "Burak", "Derya", "Onur", "Gül", "Kerem", "Nida", "Tolga")
_SOYAD = ("Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım",
          "Öztürk", "Aydın", "Özkan", "Arslan", "Doğan", "Kılıç", "Aslan",
          "Koç", "Erdoğan", "Polat", "Acar", "Bulut", "Korkmaz")
_IL = ("Ankara", "İstanbul", "İzmir", "Bursa", "Konya", "Antalya", "Adana",
       "Gaziantep", "Kayseri", "Trabzon", "Eskişehir", "Samsun", "Diyarbakır",
       "Malatya", "Van", "Aydın", "Denizli", "Sakarya")
_MAHALLE = ("Cumhuriyet", "Fatih", "Yeni", "Bağlıca", "Çamlıca", "Gül", "Bahçelievler",
            "Atatürk", "İstiklal", "Yeşilyurt", "Karşıyaka", "Hürriyet")

# Resmî muhatap kurum başlıkları — sınıflandırma sinyalini bozmaz; çeşitlilik için
# T.C. başlık satırı varyasyonu (tek-tip 'VALİLİĞİNE' yerine gerçekçi kurum yelpazesi).
_MUHATAP = (
    "{il} VALİLİĞİNE", "{il} BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA",
    "{il} İL MİLLÎ EĞİTİM MÜDÜRLÜĞÜNE", "{il} İL SAĞLIK MÜDÜRLÜĞÜNE",
    "{il} DEFTERDARLIĞINA", "{il} İL ÖZEL İDARESİNE",
    "{il} ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ İL MÜDÜRLÜĞÜNE",
    "{il} SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜNE",
)
# Gönderen sıfatı (kurumsal vs. vatandaş) — yapısal alan değil, üslup çeşitliliği.
_GONDEREN_SIFAT = ("", "", "", " (Vatandaş)", " (İlgili)")


def fake_tckn(rng: random.Random) -> str:
    """Checksum-GEÇERLİ sahte TCKN (algoritma doğru ama kişi gerçek DEĞİL).

    Kural: 11 hane, ilk hane ≠ 0; d10 = ((tek-haneler*7)-(çift-haneler))%10;
    d11 = (ilk 10 hane toplamı)%10. Gerçek TCKN doğrulamasını GEÇER ama rastgele
    üretildiği için gerçek bir vatandaşa ait DEĞİLDİR (sahte-ama-format-doğru).
    """
    d = [rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(8)]
    odd = d[0] + d[2] + d[4] + d[6] + d[8]
    even = d[1] + d[3] + d[5] + d[7]
    d10 = (odd * 7 - even) % 10
    d.append(d10)
    d.append(sum(d) % 10)
    return "".join(str(x) for x in d)


def fake_phone(rng: random.Random) -> str:
    """Sahte cep telefonu — 05XX formatı, gerçek operatör bloğu değil (rastgele)."""
    return f"0{rng.randint(530, 559)} {rng.randint(100, 999)} {rng.randint(10, 99)} {rng.randint(10, 99)}"


def fake_name(rng: random.Random) -> str:
    return f"{rng.choice(_AD)} {rng.choice(_SOYAD)}"


def fake_address(rng: random.Random) -> str:
    return (f"{rng.choice(_MAHALLE)} Mah. {rng.randint(1, 99)}. Sok. "
            f"No:{rng.randint(1, 120)} {rng.choice(_IL)}")


def fake_date(rng: random.Random) -> str:
    return f"{rng.randint(1, 28):02d}.{rng.randint(1, 12):02d}.2026"


def fake_evrak_no(rng: random.Random) -> str:
    return f"E-{rng.randint(10000000, 99999999)}-{rng.randint(100, 999)}.03-{rng.randint(1000, 9999)}"


# ===========================================================================
# 2. TÜRE-ÖZEL İÇERİK — gövde cümleleri + konular (sınıflandırma sinyali)
# ===========================================================================
# kolay = belirgin tür-imzası (anahtar sözcük); orta = orta; zor = örtük ifade
# (heuristik fallback kaçırabilir → gerçekçi düşük skor, abstention sinyali).
#
# ÇEŞİTLİLİK (eval ezber-tavanına oturmasın): her (tür, zorluk) için BİRDEN ÇOK
# ifade varyantı; üretimde rng ile biri seçilir (deterministik). 'kolay' varyantların
# HEPSİ tür-imzası anahtar sözcüğü taşır (siniflandir._KEYWORDS ile uyum → kolay yüksek
# acc korunur); 'zor' varyantlar örtük (anahtar sözcük yok → gerçekçi düşük skor).
_GOVDE: dict[str, dict[str, tuple[str, ...]]] = {
    "dilekce": {
        "kolay": (
            "Bu dilekçe ile {konu} hakkındaki talebimin değerlendirilmesini arz ederim.",
            "İşbu dilekçe ekinde {konu} konusunda gereğinin yapılmasını talep ederim.",
            "{konu} hususundaki dilekçemin ivedilikle işleme alınmasını arz ederim.",
        ),
        "orta": (
            "{konu} konusundaki başvurumun ilgili birimce incelenmesini talep ederim.",
            "{konu} ile ilgili talebimin değerlendirilerek tarafıma bilgi verilmesini arz ederim.",
        ),
        "zor": (
            "Bahsi geçen mesele ile ilgili gereğinin yapılmasını saygılarımla rica ederim.",
            "Yukarıda arz ettiğim hususun çözüme kavuşturulmasını talep ediyorum.",
        ),
    },
    "basvuru": {
        "kolay": (
            "{konu} için gerekli işlemin yapılmasını başvuru ile talep ederim.",
            "{konu} hakkında işbu başvuruyu yaparak gereğinin yapılmasını arz ederim.",
            "{konu} başvurusunda bulunuyor, evrakımın işleme alınmasını talep ederim.",
        ),
        "orta": (
            "{konu} işlemi için başvuruda bulunuyorum; gereğini arz ederim.",
            "{konu} için müracaatımın değerlendirilmesini saygıyla arz ederim.",
        ),
        "zor": (
            "İlgili konuda gerekli onayın tarafıma verilmesini rica ederim.",
            "Söz konusu işlemin tarafıma sağlanması için gereğini arz ederim.",
        ),
    },
    "sikayet": {
        "kolay": (
            "{konu} nedeniyle mağdur olduğumu bildirir, şikâyet konusunun "
            "incelenmesini talep ederim.",
            "{konu} hakkında şikâyetimi iletiyor, gerekli işlemin yapılmasını arz ederim.",
            "{konu} sebebiyle yaşadığım mağduriyeti şikâyet eder, çözümünü talep ederim.",
        ),
        "orta": (
            "{konu} ile ilgili yaşadığım olumsuzluğu şikâyet ederek bildiririm.",
            "{konu} hususunda gerekli tedbirlerin alınmamasından memnuniyetsizliğimi bildiririm.",
        ),
        "zor": (
            "Komşu parselde süregelen durumun giderilmesini arz ederim.",
            "Mahallemizde devam eden olumsuzluğun bir an önce sona erdirilmesini istiyorum.",
        ),
    },
    "ihbar": {
        "kolay": (
            "{konu} hususunu ihbar eder, gerekli denetimin yapılmasını talep ederim.",
            "{konu} ile ilgili usulsüzlüğü ihbar ediyor, incelenmesini arz ederim.",
            "{konu} konusunu ihbar eder, ilgili birimce işlem yapılmasını rica ederim.",
        ),
        "orta": (
            "{konu} konusunda usulsüzlük olduğunu bildiririm.",
            "{konu} ile ilgili mevzuata aykırı bir durum tespit ettiğimi bildiririm.",
        ),
        "zor": (
            "Söz konusu durumun ilgili birimce araştırılmasını rica ederim.",
            "Dikkatinize sunduğum hususun gizlilik içinde incelenmesini talep ederim.",
        ),
    },
    "talep": {
        "kolay": (
            "{konu} hakkındaki talebimin yerine getirilmesini arz ve talep ederim.",
            "{konu} konusundaki talebimin karşılanmasını saygıyla talep ederim.",
            "{konu} için gerekli desteğin sağlanmasını talep ederim.",
        ),
        "orta": (
            "{konu} ile ilgili gereğinin yapılmasını talep ederim.",
            "{konu} konusunda tarafıma yardımcı olunmasını rica ederim.",
        ),
        "zor": (
            "İlgili hususta tarafıma gerekli desteğin sağlanmasını rica ederim.",
            "Söz konusu ihtiyacımın giderilmesi için gereğini arz ederim.",
        ),
    },
    "bilgi_edinme": {
        "kolay": (
            "4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında {konu} hakkında "
            "bilgi/belge talep ederim.",
            "Bilgi edinme hakkım kapsamında {konu} konusundaki belgelerin tarafıma "
            "verilmesini talep ederim.",
            "4982 sayılı Kanun gereği {konu} ile ilgili kayıtlara erişim talep ederim.",
        ),
        "orta": (
            "Kurumunuzdan {konu} konusuna ilişkin bilgi edinmek istiyorum.",
            "{konu} hakkında kurumunuzdaki mevcut bilgi ve belgeleri talep ediyorum.",
        ),
        "zor": (
            "Söz konusu işleme ait kayıtların tarafıma iletilmesini istiyorum.",
            "İlgili dosyada yer alan belgelerin bir örneğinin tarafıma verilmesini istiyorum.",
        ),
    },
    "cimer": {
        "kolay": (
            "CİMER üzerinden {konu} hakkındaki başvurumun değerlendirilmesini talep ederim.",
            "CİMER başvurum kapsamında {konu} sorununun çözülmesini talep ederim.",
            "CİMER aracılığıyla {konu} konusunu iletiyor, gereğini arz ederim.",
        ),
        "orta": (
            "{konu} konulu CİMER başvurum hakkında gereğini arz ederim.",
            "Cumhurbaşkanlığı İletişim Merkezi üzerinden ilettiğim {konu} talebimi arz ederim.",
        ),
        "zor": (
            "İletmiş olduğum talebin sonuçlandırılmasını rica ederim.",
            "Sistem üzerinden başvurduğum hususun değerlendirilmesini bekliyorum.",
        ),
    },
    "ust_yazi": {
        "kolay": (
            "İlgi'de kayıtlı {konu} konusunda gereği için bilgilerinize sunulur.",
            "İlgi yazıya istinaden {konu} hususu gereği için makamınıza arz olunur.",
            "{konu} konusunda hazırlanan ekli yazımız gereği için sunulur.",
        ),
        "orta": (
            "{konu} konulu yazımız ekte gönderilmiş olup gereğini arz ederim.",
            "{konu} ile ilgili işlemlerin yürütülmesi hususunu bilgilerinize sunarım.",
        ),
        "zor": (
            "Söz konusu hususun gereği için tarafınıza iletilmesi uygun görülmüştür.",
            "Konuya ilişkin ekli belgelerin değerlendirilmesini arz ederim.",
        ),
    },
    "cevabi_yazi": {
        "kolay": (
            "İlgi sayılı yazınıza istinaden {konu} hakkında kurumumuz görüşü "
            "aşağıda sunulmuştur.",
            "İlgi'de kayıtlı yazınıza cevaben {konu} konusundaki değerlendirmemiz aşağıdadır.",
            "İlgi yazınıza karşılık {konu} hususundaki cevabımız bilgilerinize sunulur.",
        ),
        "orta": (
            "İlgi yazınızda belirtilen {konu} konusu incelenmiş olup cevabımız ektedir.",
            "{konu} ile ilgili talebiniz değerlendirilmiş olup sonucu aşağıda arz olunur.",
        ),
        "zor": (
            "İlgide kayıtlı talebe ilişkin değerlendirmemiz aşağıda yer almaktadır.",
            "Yazınızda yer alan hususa dair görüşümüz tarafınıza bildirilmektedir.",
        ),
    },
    "tebligat": {
        "kolay": (
            "7201 sayılı Tebligat Kanunu uyarınca {konu} hususu tarafınıza "
            "tebliğ olunur.",
            "{konu} konulu işlem 7201 sayılı Kanun gereği tarafınıza tebliğ edilir.",
            "İşbu tebligat ile {konu} hususu muhataba tebliğ olunur.",
        ),
        "orta": (
            "{konu} konusu işbu yazı ile tarafınıza tebliğ edilir.",
            "{konu} ile ilgili kararın tarafınıza tebliği için yazımız gönderilmiştir.",
        ),
        "zor": (
            "Aşağıda belirtilen hususun tarafınıza bildirilmesi gerekmektedir.",
            "Söz konusu işlemin muhataba usulüne uygun bildirilmesi sağlanacaktır.",
        ),
    },
    "dava_evraki": {
        "kolay": (
            "Mahkemenizde görülen {konu} konulu davaya ilişkin dava dilekçemiz ektedir.",
            "{konu} konulu davada mahkemenize sunulmak üzere dilekçemiz ektedir.",
            "Sayın mahkemenizde {konu} davasına dair beyan dilekçemiz sunulmuştur.",
        ),
        "orta": (
            "{konu} hakkındaki dava dilekçesi gereği için sunulmuştur.",
            "{konu} konulu uyuşmazlığa ilişkin dosyamız mahkemeye iletilmiştir.",
        ),
        "zor": (
            "İlgili dosya kapsamında duruşma için gereğinin yapılması talep edilir.",
            "Esas dosyasındaki beyanlarımızın dikkate alınmasını arz ederiz.",
        ),
    },
    "icra_evraki": {
        "kolay": (
            "{konu} kapsamında haciz işleminin icra dairesince yürütülmesi rica olunur.",
            "{konu} için icra takibi başlatılması ve haciz uygulanması talep edilir.",
            "{konu} konulu icra takibine ilişkin haciz talebimiz ektedir.",
        ),
        "orta": (
            "{konu} konulu icra takibine ilişkin yazımız ektedir.",
            "{konu} alacağının tahsili için icra dosyası işlemleri rica olunur.",
        ),
        "zor": (
            "İlgili takip dosyası kapsamında gereğinin yapılması talep edilir.",
            "Borçluya ait kayıtların dosyamıza celbi hususunda gereği rica olunur.",
        ),
    },
    "muzekkere": {
        "kolay": (
            "{konu} esas sayılı dosyaya ilişkin müzekkere gereğinin yerine "
            "getirilmesi rica olunur.",
            "{konu} konulu müzekkereye istinaden gerekli bilginin gönderilmesi rica olunur.",
            "İşbu müzekkere ile {konu} hususunda kayıtların gönderilmesi rica olunur.",
        ),
        "orta": (
            "{konu} hakkındaki müzekkerenin gereği için yazımız ektedir.",
            "{konu} ile ilgili olarak istenen bilgilerin gönderilmesi rica olunur.",
        ),
        "zor": (
            "İlgili dosya kapsamında istenen hususun karşılanması rica olunur.",
            "Yazımız eki listede belirtilen bilgilerin iletilmesi rica olunur.",
        ),
    },
    "fatura": {
        "kolay": (
            "{konu} kapsamında düzenlenen faturanın ödenmesi için gereğini arz ederim.",
            "{konu} hizmetine ait fatura tutarının ödenmesi hususunu arz ederim.",
            "{konu} için kesilen faturanın tahakkuk ve ödemesi rica olunur.",
        ),
        "orta": (
            "{konu} bedeline ilişkin fatura ekte sunulmuş olup ödemesi rica olunur.",
            "{konu} alımına ait ödeme belgesi tahakkuka esas olarak sunulmuştur.",
        ),
        "zor": (
            "Söz konusu hizmete ait ödeme belgesi tarafınıza iletilmiştir.",
            "Düzenlenen belgeye istinaden ödemenin gerçekleştirilmesi beklenmektedir.",
        ),
    },
    "tutanak": {
        "kolay": (
            "{konu} hakkında düzenlenen işbu tutanak gereği için sunulmuştur.",
            "{konu} ile ilgili tutulan tutanak ekte gereği için arz olunur.",
            "{konu} konusunda taraflarca imza altına alınan tutanak sunulmuştur.",
        ),
        "orta": (
            "{konu} konulu tutanağın ilgili işleme esas alınması arz olunur.",
            "{konu} ile ilgili tespitler kayıt altına alınarak ekte sunulmuştur.",
        ),
        "zor": (
            "Söz konusu hususa ilişkin tespit aşağıda kayıt altına alınmıştır.",
            "Olaya dair belirlemeler taraf beyanlarıyla birlikte tespit edilmiştir.",
        ),
    },
    "rapor": {
        "kolay": (
            "{konu} hakkında hazırlanan denetim raporu gereği için sunulmuştur.",
            "{konu} ile ilgili inceleme raporu ekte gereği için arz olunur.",
            "{konu} konusunda düzenlenen rapor değerlendirilmek üzere sunulmuştur.",
        ),
        "orta": (
            "{konu} konulu inceleme raporumuz ekte arz edilmiştir.",
            "{konu} ile ilgili bulgularımız ekli raporda özetlenmiştir.",
        ),
        "zor": (
            "İlgili konuya ilişkin değerlendirmelerimiz raporda yer almaktadır.",
            "Yapılan çalışmanın sonuçları ekli belgede ayrıntılı sunulmuştur.",
        ),
    },
    "gorus_mutalaa": {
        "kolay": (
            "{konu} hakkında hukuki görüş/mütalaa talebimiz gereği için sunulur.",
            "{konu} konusunda hukuki mütalaanızın bildirilmesi rica olunur.",
            "{konu} ile ilgili hukuki görüşünüzün tarafımıza iletilmesi arz olunur.",
        ),
        "orta": (
            "{konu} konusunda hukuki görüşünüze ihtiyaç duyulmaktadır.",
            "{konu} hususunda mevzuat çerçevesinde değerlendirmeniz beklenmektedir.",
        ),
        "zor": (
            "Söz konusu mesele hakkında değerlendirmenizin tarafımıza iletilmesi rica olunur.",
            "Konuya ilişkin uygulamanın ne yönde olması gerektiği hususunda görüş beklenir.",
        ),
    },
    "genelge_talimat_olur": {
        "kolay": (
            "{konu} hakkında Makam Olur'u alınmak üzere gereği arz olunur.",
            "{konu} konulu uygulama talimatının yürürlüğe konulması için olur arz olunur.",
            "{konu} ile ilgili genelgenin tüm birimlere tebliği için gereği arz olunur.",
        ),
        "orta": (
            "{konu} konulu genelge/talimatın uygulanması için gereğini arz ederim.",
            "{konu} hususunda alınan kararın birimlere duyurulması için arz olunur.",
        ),
        "zor": (
            "İlgili hususun uygulamaya konulması için onayınıza arz olunur.",
            "Söz konusu düzenlemenin yürürlüğe alınması makamınızın takdirine arz olunur.",
        ),
    },
}

# Türe-özel "konu" örnekleri (anahtar-unsur + sınıflandırma sinyali kaynağı).
# Genişletilmiş yelpaze (≥6/tür) → gold konu çeşitliliği artar, eval ezberlemez.
_KONULAR: dict[str, tuple[str, ...]] = {
    "dilekce": ("park yeri tahsisi", "yol bakımı", "kaldırım onarımı", "su faturası itirazı",
                "ağaç budama talebi", "sokak aydınlatması", "engelli rampası", "otopark düzenlemesi"),
    "basvuru": ("iş yeri açma izni", "tabela ruhsatı", "hafriyat izni", "kayıt yenileme",
                "imar durumu belgesi", "yapı ruhsatı", "burs başvurusu", "kreş kaydı"),
    "sikayet": ("gürültü kirliliği", "çöp toplama aksaklığı", "park işgali", "imar aykırılığı",
                "kaçak elektrik", "su kesintisi", "hizmet gecikmesi", "haşere sorunu"),
    "ihbar": ("kaçak yapı", "usulsüz harcama", "ruhsatsız işyeri", "kamu zararı",
              "çevre kirliliği", "iş güvenliği ihlali", "haksız menfaat", "kayıt dışı istihdam"),
    "talep": ("hizmet talebi", "belge talebi", "randevu talebi", "yardım talebi",
              "araç tahsisi", "personel görevlendirme", "ödenek talebi", "eğitim talebi"),
    "bilgi_edinme": ("ihale sözleşme tutarı", "personel atama listesi", "harcama kalemleri",
                     "denetim sonuçları", "ruhsat kayıtları", "proje ödenekleri", "atama kriterleri"),
    "cimer": ("ulaşım sorunu", "altyapı şikâyeti", "hizmet talebi", "personel tutumu",
              "park sorunu", "yol bozukluğu", "engelli erişimi", "internet altyapısı"),
    "ust_yazi": ("görüş talebi", "bilgi paylaşımı", "ortak protokol", "koordinasyon",
                 "personel görevlendirme", "ödenek aktarımı", "eğitim programı"),
    "cevabi_yazi": ("görüş bildirimi", "bilgi yanıtı", "talep değerlendirmesi",
                    "itiraz cevabı", "başvuru sonucu", "inceleme sonucu"),
    "tebligat": ("ödeme emri", "yıkım kararı", "idari para cezası tebliği",
                 "ruhsat iptali", "tahliye kararı", "vergi ihbarnamesi"),
    "dava_evraki": ("tam yargı davası", "iptal davası", "itirazın iptali",
                    "tazminat davası", "yürütmenin durdurulması", "istinaf başvurusu"),
    "icra_evraki": ("haciz talebi", "icra takibi", "ödeme emri tebliği",
                    "kıymet takdiri", "tahliye taahhüdü", "kambiyo takibi"),
    "muzekkere": ("haciz müzekkeresi", "tedbir kararı", "bilirkişi talebi",
                  "kayıt celbi", "müzekkere cevabı", "adres tespiti"),
    "fatura": ("temizlik hizmeti bedeli", "kırtasiye alımı", "araç kiralama bedeli",
               "yemek hizmeti bedeli", "akaryakıt alımı", "danışmanlık bedeli"),
    "tutanak": ("tespit tutanağı", "teslim tutanağı", "kaza tutanağı",
                "sayım tutanağı", "denetim tutanağı", "olay tutanağı"),
    "rapor": ("denetim raporu", "inceleme raporu", "faaliyet raporu",
              "performans raporu", "izleme raporu", "değerlendirme raporu"),
    "gorus_mutalaa": ("sözleşme görüşü", "mevzuat yorumu", "hukuki değerlendirme",
                      "ihale itirazı görüşü", "personel hakları görüşü", "tazminat görüşü"),
    "genelge_talimat_olur": ("mesai düzenlemesi", "uygulama talimatı", "harcama oluru",
                             "görevlendirme oluru", "tasarruf genelgesi", "izin talimatı"),
}


# ===========================================================================
# 3. ALAN MODELİ — kanonik ZORUNLU_ALANLAR (tek-kaynak; düz tuple)
# ===========================================================================
# config.ZORUNLU_ALANLAR (3071 m.4):
#   gonderen_ad_soyad, tckn_veya_kurum, tarih, konu, talep, iletisim_adres, imza
# Sentetik metin bu alanları gerçek pipeline'ın MOCK modda görebileceği biçimde
# render eder (cikar.py regex/keyword görünürlüğü ile uyumlu etiketler).
# 'gonderen_ad_soyad': mock cikar (LLM yok) gönderen adını regex ile ÇIKARMAZ →
# bu alan mock modda DAİMA eksik tespit edilir; gold bu davranışı yansıtır.

# Eksik enjeksiyonunda silinebilen alanlar (konu asla silinmez — sınıflandırma
# çökmesin; gonderen_ad_soyad zaten mock'ta görünmez, ekstra silmeyiz).
_SILINEBILIR_ALANLAR = ("tarih", "tckn_veya_kurum", "iletisim_adres", "imza")

# Resmî yazı türleri — eksik_tespit_node bunlarda DARALTILMIŞ zorunlu küme
# kullanır (konu/tarih/imza); gold de aynı kümeyi uygular (pipeline ile birebir).
_RESMI_YAZI_TURLER = {"ust_yazi", "cevabi_yazi", "muzekkere", "genelge_talimat_olur",
                      "tebligat", "gorus_mutalaa"}
_RESMI_YAZI_ZORUNLU = ("konu", "tarih", "imza")


def _zorunlu_for(turu: str) -> tuple[str, ...]:
    """Tür-bağımlı zorunlu alan kümesi — eksik_tespit_node._zorunlu_for ile birebir."""
    if turu in _RESMI_YAZI_TURLER:
        return _RESMI_YAZI_ZORUNLU
    return ZORUNLU_ALANLAR


@dataclass
class EvrakOrnegi:
    """Üretilen tek sentetik evrak + altın etiketler (config taksonomisi)."""

    id: str
    evrak_turu: str          # config.EVRAK_TURLERI'nden biri (gold etiket)
    zorluk: str
    metin: str
    mevcut_alanlar: list[str]        # metinde GÖRÜNÜR (pipeline tespit edebilir) alanlar
    eksik_alanlar: list[str]         # zorunlu − görünür (gerçek pipeline beklenen çıktısı)
    anahtar_unsurlar: list[str]      # özet key-fact'ler (summary_eval gold)
    beklenen_birim: str              # config.BIRIMLER key (route_birim hedef_birim gold)
    beklenen_mevzuat: list[str]
    beklenen_yazi_turu: str          # EVRAK_TO_YAZI gold

    def to_record(self) -> dict:
        return {
            "id": self.id, "evrak_turu": self.evrak_turu, "zorluk": self.zorluk,
            "metin": self.metin, "mevcut_alanlar": self.mevcut_alanlar,
            "eksik_alanlar": self.eksik_alanlar, "anahtar_unsurlar": self.anahtar_unsurlar,
            "beklenen_birim": self.beklenen_birim,
            "beklenen_mevzuat": self.beklenen_mevzuat,
            "beklenen_yazi_turu": self.beklenen_yazi_turu,
        }


# ===========================================================================
# 4. METİN RENDER — pipeline-tespit-edilebilir etiketlerle resmî evrak gövdesi
# ===========================================================================
def _pick_govde(turu: str, zorluk: str, konu: str, rng: random.Random) -> str:
    """(tür, zorluk) için ifade varyantlarından birini deterministik seç + render et."""
    varyantlar = _GOVDE[turu][zorluk]
    return rng.choice(varyantlar).format(konu=konu)


def _render_metin(turu: str, zorluk: str, alanlar: dict[str, str],
                  mevcut: set[str], rng: random.Random) -> str:
    """Resmî evrak metni — başlık + alan-blokları + gövde.

    Yalnız `mevcut` kümesindeki alanlar metne yazılır (eksik olanlar yazılmaz →
    pipeline onları eksik tespit eder). Etiketler cikar.py'nin regex/keyword
    görünürlük varsayımlarıyla uyumludur (Tarih:/Konu:/Adres:/T.C. Kimlik No: ...).

    Çeşitlilik: muhatap kurum başlığı + gövde ifadesi rng ile seçilir (deterministik);
    `Ad-Soyad:` / `Konu:` etiket formatları KORUNUR (fairness_eval._swap_name + cikar
    regex bağımlılığı). 'kolay' gövde tür-imzası anahtar sözcüğü taşır (sınıflandırma).
    """
    konu = alanlar.get("konu", "muhtelif")
    govde = _pick_govde(turu, zorluk, konu, rng)
    muhatap = rng.choice(_MUHATAP).format(il=rng.choice(_IL))
    lines = [f"T.C. {muhatap}", ""]
    if "tarih" in mevcut:
        lines.append(f"Tarih   : {alanlar['tarih']}")
    lines.append(f"Sayı    : {alanlar['sayi']}")  # sayı her zaman var (resmî evrak)
    if "konu" in mevcut:
        lines.append(f"Konu    : {alanlar['konu']}")
    # Standart resmî kapanış — somut talep/arz ibaresi (cikar._RE_TALEP tespit eder;
    # gerçek evrak da böyle biter). 'talep' alanı bu sayede DAİMA ground-truth mevcut.
    lines += ["", govde, "", "Gereğini bilgilerinize arz ederim.", ""]
    # Kimlik/iletişim bloğu — yalnız mevcut alanlar.
    if "gonderen_ad_soyad" in mevcut:
        sifat = rng.choice(_GONDEREN_SIFAT)
        lines.append(f"Ad-Soyad: {alanlar['gonderen_ad_soyad']}{sifat}")
    if "tckn_veya_kurum" in mevcut:
        lines.append(f"T.C. Kimlik No: {alanlar['tckn_veya_kurum']}")
    if "iletisim_adres" in mevcut:
        lines.append(f"Adres   : {alanlar['adres']}")
        lines.append(f"İletişim: {alanlar['telefon']}")
    if "imza" in mevcut:
        lines.append("İmza / e-imza")
    return "\n".join(lines)


def _build_alan_degerleri(turu: str, rng: random.Random) -> dict[str, str]:
    """Türün tüm olası alanları için sahte değerler (eksik enjeksiyonu öncesi havuz)."""
    konu = rng.choice(_KONULAR[turu])
    return {
        "tarih": fake_date(rng),
        "konu": konu,
        "gonderen_ad_soyad": fake_name(rng),
        "tckn_veya_kurum": fake_tckn(rng),
        "adres": fake_address(rng),
        "telefon": fake_phone(rng),
        "sayi": fake_evrak_no(rng),
    }


def _ground_truth_present(turu: str, rendered_present: set[str]) -> set[str]:
    """Metinde OBJEKTİF olarak bulunan zorunlu alanlar (ground truth — pipeline'dan bağımsız).

    Gold = insan-doğrulanabilir gerçek; pipeline'ın bu gerçeğe ne kadar yakınsadığı
    eval'in ÖLÇTÜĞÜ şeydir (mismatch = pipeline'ın gerçek hata oranı, kasıtlı değil).
    - 'talep': standart kapanış ("Gereğini bilgilerinize arz ederim.") her metinde
      yazılır → DAİMA ground-truth mevcut.
    - konu/gonderen_ad_soyad: çekirdek (silinmez) → daima mevcut.
    - tarih/tckn_veya_kurum/iletisim_adres/imza: yalnız render'a yazıldıysa mevcut.

    NOT: mock pipeline (LLM yok) gönderen adını regex ile ÇIKARAMAZ → gold'da mevcut
    olsa bile pipeline eksik işaretler. Bu, mock taban için DÜRÜST bir recall açığıdır
    (gerçek LLM modunda kapanır); eval bunu olduğu gibi raporlar (taban ≠ tavan).
    """
    present = set(rendered_present)
    present.add("talep")  # standart kapanış → objektif olarak talep mevcut
    return present


def _inject_missing(turu: str, zorluk: str, rng: random.Random) -> set[str]:
    """Zorluk'a göre METNE YAZILACAK (mevcut) silinebilir alanları belirle.

    kolay: 0-1 alan eksik; orta: 1; zor: 1-2. konu/talep asla eksiltilmez.
    Döndürülen küme: metne YAZILACAK silinebilir alanlar (geri kalanı render'dan
    çıkarılır → pipeline eksik tespit eder).
    """
    zorunlu = set(_zorunlu_for(turu))
    silinebilir = [a for a in _SILINEBILIR_ALANLAR if a in zorunlu]
    n_eksik = {"kolay": rng.choice([0, 0, 1]), "orta": 1, "zor": rng.choice([1, 2])}[zorluk]
    n_eksik = min(n_eksik, len(silinebilir))
    silinecek = set(rng.sample(silinebilir, n_eksik)) if n_eksik else set()
    return {a for a in silinebilir if a not in silinecek}


def make_evrak(turu: str, idx: int, rng: random.Random) -> EvrakOrnegi:
    """Tek sentetik evrak + altın etiketleri (config taksonomisi) üret."""
    zorluk = ZORLUK[idx % 3]
    degerler = _build_alan_degerleri(turu, rng)
    zorunlu = set(_zorunlu_for(turu))

    # Daima metne yazılacak çekirdek alanlar (silinmez): konu + gonderen_ad_soyad.
    # gonderen mock'ta tespit edilmese de metinde bulunsun (gerçek LLM modu için).
    cekirdek = {a for a in ("konu", "gonderen_ad_soyad") if a in zorunlu}
    # Silinebilir alanlardan zorluk'a göre yazılacaklar.
    yazilacak_silinebilir = _inject_missing(turu, zorluk, rng)
    rendered_present = cekirdek | yazilacak_silinebilir

    metin = _render_metin(turu, zorluk, degerler, rendered_present, rng)

    # Ground truth: metinde objektif bulunan alanlar → eksik = zorunlu − mevcut.
    mevcut_set = zorunlu & _ground_truth_present(turu, rendered_present)
    eksik = sorted(zorunlu - mevcut_set)
    mevcut = sorted(mevcut_set)

    # Anahtar unsurlar = özetin kapsaması gereken çekirdek bilgiler (key-fact recall gold).
    # konu (daima) + tür-TR-etiketi (özet '**Tür**' önekiyle daima kapsar) + tarih (varsa).
    # NOT: tür etiketi 'kolay' demografik ezber DEĞİL; özetin konuyu+belge türünü doğru
    # yansıtması beklenir (kapsama ölçülebilir, yapay 1.0 tavanına oturmaz).
    unsurlar = [degerler["konu"], EVRAK_TURU_TR.get(turu, turu)]
    if "tarih" in rendered_present:
        unsurlar.append(degerler["tarih"])

    return EvrakOrnegi(
        id=f"{turu}_{idx:03d}", evrak_turu=turu, zorluk=zorluk, metin=metin,
        mevcut_alanlar=mevcut, eksik_alanlar=eksik, anahtar_unsurlar=unsurlar,
        beklenen_birim=EVRAK_TO_BIRIM[turu],
        beklenen_mevzuat=list(EVRAK_TO_MEVZUAT.get(turu, [])),
        beklenen_yazi_turu=EVRAK_TO_YAZI.get(turu, "cevabi_yazi"),
    )


def generate(per_type: int, seed: int) -> list[EvrakOrnegi]:
    """18 üretilen tür × per_type → stratifiye sentetik evrak listesi (deterministik)."""
    rng = random.Random(seed)
    out: list[EvrakOrnegi] = []
    for turu in URETILEN_TURLER:
        for i in range(per_type):
            out.append(make_evrak(turu, i, rng))
    return out


# ===========================================================================
# 5. GOLD SET YAZIMI
# ===========================================================================
def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _e2e_record(e: EvrakOrnegi) -> dict:
    """Uçtan-uca senaryo (her iki görev): evrak metni + tüm beklenen çıktılar."""
    return {
        "id": e.id, "metin": e.metin, "evrak_turu": e.evrak_turu, "zorluk": e.zorluk,
        "beklenen_birim": e.beklenen_birim,
        "beklenen_mevzuat": e.beklenen_mevzuat, "eksik_alanlar": e.eksik_alanlar,
        "anahtar_unsurlar": e.anahtar_unsurlar, "beklenen_yazi_turu": e.beklenen_yazi_turu,
    }


def write_all(samples: list[EvrakOrnegi], out_dir: Path) -> dict[str, int]:
    """Tüm gold setleri yaz → {dosya: satır_sayısı}."""
    counts: dict[str, int] = {}

    def emit(name: str, recs: list[dict]) -> None:
        _write_jsonl(out_dir / name, recs)
        counts[name] = len(recs)

    emit("evrak_class_gold.jsonl", [s.to_record() for s in samples])
    emit("routing_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "beklenen_birim": s.beklenen_birim} for s in samples])
    emit("ozet_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "anahtar_unsurlar": s.anahtar_unsurlar} for s in samples])
    emit("yazi_taslak_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "beklenen_yazi_turu": s.beklenen_yazi_turu} for s in samples])
    emit("eksik_bilgi_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "zorunlu_alanlar": list(_zorunlu_for(s.evrak_turu)),
         "eksik_alanlar": s.eksik_alanlar} for s in samples])
    emit("e2e_scenarios.jsonl", [_e2e_record(s) for s in samples])
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Sentetik kamu-evrak gold üreteci (TEKNOFEST 1. Senaryo, kanonik taksonomi)")
    ap.add_argument("--per-type", type=int, default=DEFAULT_PER_TYPE, help="tür-başı örnek (>=4)")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", type=str, default=None, help="çıktı dizini (default repo/data/synthetic)")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    per = max(4, args.per_type)
    samples = generate(per, args.seed)
    out_dir = Path(args.out) if args.out else (Path(__file__).resolve().parent.parent / "data" / "synthetic")
    counts = write_all(samples, out_dir)

    print(f"\n  Sentetik kamu-evrak gold üretildi → {out_dir}")
    print(f"  Kanonik taksonomi: {len(URETILEN_TURLER)} üretilen tür "
          f"(config.EVRAK_TURLERI {len(EVRAK_TURLERI)}; 'belirsiz' abstention)")
    print(f"  {len(URETILEN_TURLER)} tür × {per} = {len(samples)} evrak (seed={args.seed})")
    zorluk_dag: dict[str, int] = {z: sum(1 for s in samples if s.zorluk == z) for z in ZORLUK}
    eksikli = sum(1 for s in samples if s.eksik_alanlar)
    print(f"  Zorluk dağılımı: {zorluk_dag} · eksik-alanlı evrak: {eksikli}/{len(samples)}")
    for name, n in counts.items():
        print(f"    {name:28s} {n:4d} satır")
    return 0


if __name__ == "__main__":
    sys.exit(main())
