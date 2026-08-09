# WSA 2026 başvurusu — hazır metinler

> **World Summit Awards 2026 · Türkiye ulusal turu**
> Kayıt: https://hub.wsa-global.org/Signup/WSA/2026/Turkey/
> Son tarih: **30 Eylül 2026** · Kategori: **Government & Citizen Engagement** · SDG **16**
> Ulusal Uzman: Mustafa Özer (imece) · Destek: `awards26@wsa-global.org`
>
> Başvuru **İngilizce**. WSA'nın kendi tavsiyesi: önce burada yaz, sonra forma yapıştır.

---

## Önce: uygunluk artık sorun değil

WSA'nın şartı *"market-ready or already on the market · no ideas, drafts, prototypes"*.
9 Ağustos 2026 itibarıyla durum:

| Şart | Durum |
|---|---|
| Kamuya açık ve çalışır | ✅ `https://kamu-evrak.onrender.com` |
| Herkes hesap açıp kullanabiliyor | ✅ açık kayıt |
| Uçtan uca işlevsel | ✅ ölçüldü: 16 adımlı ajan hattı, ~36 sn/belge |
| En fazla 3 yaşında | ✅ 2026 |

**Dürüst kalan sınır:** henüz bir kamu kurumunda pilot uygulaması yok ve değerlendirme
verisi sentetik. Metinlerde bu SAKLANMIYOR — aşağıdaki 3. bölümde açıkça yazılı.
Saklamak, jüri fark ettiğinde güveni tümden kaybettirir; açıkça söylemek ise veri
etiği farkındalığı olarak okunur.

**Açık kaynak İDDİA EDİLMİYOR.** Depo private tutulma kararı alındı; eski taslaklarda
geçen "open-source" ifadesi bu metinlerden çıkarıldı.

---

## 1. Solution Title

**English:**
```
Kamu Evrak - AI Assistant for Public Sector Correspondence
```

**Original (Turkish):**
```
Kamu Evrak - Kamu Yazışmaları için Yapay Zekâ Asistanı
```

---

## 2. Short description (2-3 cümle)

```
Kamu Evrak is a working web application that reads incoming Turkish official
documents, understands them, routes them to the correct administrative unit, and
drafts the official reply letter — grounding every legal reference in a legislation
corpus so the system cannot invent law. A civil servant who used to spend an hour
per document reviews a complete, sourced draft in under a minute. The officer
always decides; the system never sends anything on its own.
```

---

## 3. Problem & Context

> Jüri Türkiye'yi bilmiyor. Buradaki iş: sorunu **yerel** kılmak.

```
In Turkish public administration, incoming correspondence is still largely processed
by hand. A citizen's petition arrives, a clerk reads it, decides which unit should
handle it, and writes the reply from scratch in a highly formalised official register.

Three things go wrong, every day, in thousands of offices:

1. MISROUTING. A petition sent to the wrong unit can sit for weeks before anyone
   notices. The citizen has no visibility and simply waits.

2. MISSED LEGAL DEADLINES. Turkish law sets binding response times for citizen
   petitions and information requests (Law 3071 and Law 4982). Nothing in the paper
   workflow tracks them, so they are missed quietly rather than visibly.

3. UNSOURCED LEGAL REASONING. Official replies must cite legislation. Under time
   pressure, articles are cited from memory or copied from an old letter that may
   no longer be current.

Why this problem is specific to Türkiye and cannot be solved by importing a tool
built elsewhere: Turkish administrative correspondence has its own formal register
(fixed salutation and closing formulas, an official numbering scheme, a prescribed
document layout), its own legislation citation structure, and its own organisational
map of ministries, provincial directorates and municipal units. A general-purpose
English document assistant produces text that is immediately recognisable as
non-official and therefore unusable. The problem is linguistic, legal and
institutional at the same time.
```

---

## 4. Solution

> Jargon yok. Bir belgenin yolculuğu olarak anlat.

```
Kamu Evrak follows a single document through its entire journey.

A document enters — typed, scanned or photographed from a phone. The system reads it
(optical character recognition for scans), determines what kind of document it is,
extracts the key facts, and flags information that is missing and will block a proper
reply. It identifies which administrative unit should handle the case, retrieves the
relevant legislation, and writes the official reply letter in correct formal Turkish.
It then checks its own output: every legal citation is verified against the source
text, and anything it cannot ground is marked rather than published. Finally it
calculates the statutory response deadline and produces a tamper-evident audit trail.

The officer sees all of this happen live, step by step, and then decides. Three design
choices define the product:

THE OFFICER DECIDES. The system produces a draft. It never sends, never files, never
acts on its own. Every output is a proposal to a human with the authority to accept
or reject it.

IT CANNOT INVENT LAW. Legal references are retrieved from a legislation corpus and
verified against the source. A citation the system cannot ground is flagged in the
draft instead of being quietly presented as fact. This is the single most important
property for a public-sector tool: a plausible but fabricated legal article is worse
than no answer at all.

IT SHOWS ITS WORK. Every run produces a hash-chained audit trail, so a decision can
be reconstructed and verified afterwards. Personal data is masked before it reaches
any external model.
```

---

## 5. Traction, Impact & Success Metrics

> **En dikkatli yazılması gereken bölüm.** Kullanıcı sayınız yok; onun yerine
> ÖLÇÜLMÜŞ KANIT koyuyoruz — çoğu başvuruda bu hiç yoktur.

```
The system is publicly available and running at https://kamu-evrak.onrender.com.
Anyone can create an account and process a document.

We are at the pre-pilot stage: the product is built and operational, but it is not yet
deployed inside a public institution, and our evaluation set is synthetic by design —
we deliberately avoid processing real citizens' personal data before an institutional
pilot with a proper legal basis. We would rather report that plainly than imply
adoption we do not have.

What we can show instead is measurement. Every number below comes from a reproducible
evaluation run against a held-out gold set, reported with confidence intervals:

· Document type classification: 0.783 accuracy [95% CI 0.664-0.869, n=60]
· Legislation retrieval: Recall@1 0.750, Recall@3 0.938, MRR 0.812 [n=16]
· Fairness under counterfactual name and gender substitution: 0.9861 decision
  consistency [95% CI 0.951-0.996, n=144 documents]. Two documents showed the
  applicant's name leaking into the decision. We report this rather than omit it.
· Self-correction mechanism: triggered 0 times on the clean gold set and 4 out of 4
  times under a low-confidence control condition — evidence that it activates only
  under genuine uncertainty rather than firing indiscriminately.
· Engineering: 2,590 automated backend tests and 402 frontend tests, all passing.
· End-to-end latency measured on the live deployment: approximately 36 seconds for a
  full 16-step pipeline run on a single document.

The fairness measurement deserves emphasis. We tested whether changing only the
applicant's name and gender changes the system's routing and classification decisions.
It does, in about 1.4% of cases. In a public administration context that is exactly
the kind of quiet bias that decides who gets served well — so we measure it, publish
it, and treat it as a defect to be reduced rather than a footnote.

Cost per processed document is approximately 0.002 USD, with a hard daily spending
ceiling enforced in code.
```

---

## 6. Evaluation & Additional Materials

```
Live system:        https://kamu-evrak.onrender.com
                    (create an account and process a sample document)

Suggested review path for the jury, about five minutes:
  1. Create an account
  2. Open the workspace and upload one of the sample documents
  3. Watch the live agent pipeline — each step reports what it found
  4. Read the generated official letter and its legal grounding
  5. Open the audit trail view to verify the hash chain

Note for reviewers: please use sample or fictional documents. The system is built for
public-sector correspondence, but the public deployment is intended for evaluation,
not for processing real citizens' files.
```

> Ek olarak yüklenebilir: **ekran görüntüsü destesi** (belgenin yolculuğu: gelen evrak →
> sınıflandırma → birim → mevzuat dayanağı → taslak → denetim izi) ve varsa **kısa demo
> videosu**. WSA formu "projeniz küresel erişilebilir değilse ekran görüntüsü/sunum
> ekleyin" diyor — bizimki erişilebilir, ama görsel deste yine de puan getirir.

---

## 7. Form üstü alanlar

| Alan | Değer |
|---|---|
| Country | Türkiye |
| Category | **Government & Citizen Engagement** |
| SDG | **16 — Peace, Justice and Strong Institutions** |
| Language(s) of the product interface | Turkish |
| Type of organisation | University / Academia *(yoksa: Individual)* |
| Link to your Solution | `https://kamu-evrak.onrender.com` |
| Link to your Homepage | aynı adres |
| Facebook / X / YouTube / Instagram | **boş bırak** (uydurma) |
| Experts reason for nomination | **BOŞ** — burayı Ulusal Uzman doldurur |

---

## 8. WSA'nın kendi yazım kuralları (form içinde tekrar edilecek)

- **İngilizce** zorunlu
- **Kısa ve net** — jüri yüzlerce başvuru okuyor
- **Jargon yok** — teknik olmayan biri ne yaptığınızı anlamalı
- **Gerçek etki** — "5.000 indirme" değil, insanların hayatında ne değişti
- **Linkler çalışsın** — gizli sekmede test edin

---

## 9. Yapılacaklar

- [ ] `hub.wsa-global.org/Signup/WSA/2026/Turkey/` üzerinden kaydol (ücretsiz)
- [ ] Bu metinleri forma geçir (11 zorunlu soru, 30-90 dk)
- [ ] Ekran görüntüsü destesi hazırla (8-10 kare, belgenin yolculuğu)
- [ ] Tüm linkleri gizli sekmede test et
- [ ] Gönder — **son tarih 30 Eylül 2026**

**Sonrası:** Mustafa Özer (imece) Türkiye'ye gelen başvuruları okur, kategori başına
1 proje / ülke başına en fazla 8 aday seçer, seçilenler uluslararası jüriye gider.
Ödül para değil: 182 ülkelik ağda tanınırlık, mentorluk, Global Congress daveti.
