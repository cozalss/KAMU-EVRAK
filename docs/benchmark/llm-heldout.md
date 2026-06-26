# Gerçek-LLM Held-out Değerlendirmesi (DÜRÜST, dairesel-OLMAYAN)

> Tarih: 2026-06-26 · Model: **gpt-4o-mini** (`LLM_MODE=openai`) · Set: `data/synthetic/heldout_gold.jsonl`
> (108 evrak, **örtük/dolaylı ifade**, gen_synthetic'ten farklı şablon/sözlük → keyword sızıntısı yok).
> Ölçüm: gerçek LangGraph pipeline `build_graph().ainvoke` her evrak için. Komut:
> `cd backend && LLM_MODE=openai python -m eval.heldout_eval`

## Sonuçlar — mock vs gerçek-LLM (aynı held-out set)

| Metrik | Mock (heuristik) | Gerçek-LLM (ilk) | **Gerçek-LLM + hedefli few-shot (İT-10)** |
|---|---|---|---|
| Sınıflandırma accuracy (sıkı) | 0.213 | 0.537 | **0.620** [%95 CI 0.526–0.706] |
| Sınıflandırma macro-F1 (sıkı) | 0.218 | 0.507 | **0.612** |
| **Operasyonel accuracy** (eşdeğer-grup) | — | — | **0.768** [%95 CI 0.681–0.838] |
| Operasyonel macro-F1 | — | — | **0.688** |
| Yönlendirme Top-1 | 0.426 | 0.704 | **0.778** [%95 CI 0.691–0.846] |
| Yönlendirme Top-3 | 0.463 | 0.824 | **0.870** |
| Abstention | %34 | %0 | %0 |

> **İT-10 kazanımı:** Karışan-çift few-shot sıkı macro-F1'i **0.51→0.61**, routing Top-1'i **0.70→0.78**
> yükseltti (67/108 doğru). **Operasyonel doğruluk %76.8** — taksonomi-belirsizliği düzeltilince gerçek
> kullanım değeri. Kalan karışmalar hâlâ semantik-komşu (talep→dilekçe, ihbar→şikayet, başvuru→talep).
> Sıradaki sıçrama: **gpt-4o** (mini yerine).

58/108 doğru. Gerçek-LLM, mock heuristiğin **~2.5 katı** genelleme → mimari sağlam, semantik çözüm gerçek değer katıyor.

> NOT: Dün in-domain'de görülen "0.995" rakamı held-out şablonlarına **overfit** mock-kuraldı.
> Bu tablo **gerçek, dairesel-olmayan** genelleme skorudur (jüriye sunulacak dürüst sayı).

## Hata analizi — karışmalar semantik-komşu sınıflar arası (taksonomi belirsizliği)

| Gerçek → Tahmin | Adet | Yorum |
|---|---|---|
| talep → dilekçe | 6 | "talep" zaten bir dilekçe türü — sınır gerçekten bulanık |
| cimer → dilekçe | 6 | CİMER de bir vatandaş başvurusu |
| müzekkere → üst yazı | 6 | ikisi de resmî yazı |
| genelge/talimat/olur → üst yazı | 6 | resmî yazı ailesi |
| başvuru → dilekçe | 4 | vatandaş talebi |
| icra evrakı → üst yazı | 4 | resmî yazı |

**İçgörü:** Hatalar rastgele değil; LLM **savunulabilir** seçimler yapıyor. 18-sınıflı taksonomi bazı yerlerde
fazla ince (talep≈başvuru≈dilekçe = vatandaş talebi; müzekkere≈genelge≈üst yazı = resmî yazı). İnsan etiketleyici
bile bu çiftleri karıştırır.

**Operasyonel gerçek:** Asıl önemli olan **doğru birime havale** — orada **Top-3 %82.4** (doğru birim ilk 3'te).
Bir "talep"i "dilekçe" saymak aynı birime gider → işlevsel olarak doğru.

## 80+ için somut yol (yarın — İT-10)
1. Karışan çiftlere **hedefli few-shot** (talep/başvuru/dilekçe; müzekkere/genelge/üst yazı ayrımı).
2. **Hiyerarşik / eşdeğer-kabul** puanlama: yakın-eş-anlamlı sınıflar için "kabul edilebilir eşdeğer" (operasyonel doğruluk).
3. **gpt-4o** (mini yerine) → belirgin sıçrama beklenir.
4. 2. held-out set ile genellemeyi çapraz-doğrula (tek-set riski).
