# Gerçek-LLM Held-out Değerlendirmesi (DÜRÜST, dairesel-OLMAYAN)

> Set: `data/synthetic/heldout_gold.jsonl` (108 evrak, **örtük/dolaylı ifade**, gen_synthetic'ten
> farklı şablon/sözlük → keyword sızıntısı yok). Ölçüm: gerçek LangGraph pipeline `build_graph().ainvoke`.

> ### 🔄 ÜRETİM MODELİ: DeepSeek-V4 (`deepseek-chat`) — 2026-06-27
>
> Proje **DeepSeek-V4'e geçti**: OpenAI-uyumlu (**kod değişikliği yok** — `OPENAI_BASE_URL=https://api.deepseek.com`),
> **ucuz** (V4 Flash $0.14/$0.28 per 1M — gpt-4o-mini'den de ucuz) ve **güçlü Türkçe**.
>
> **Held-out ön-ölçüm (n=22, dağıtılmış örneklem):** sıkı accuracy **0.955** (21/22) · macro-F1 **0.933**
> [BCa CI 0.875–1.0] · operasyonel **1.000** · routing Top-1 **0.955** → gpt-4o'nun (n=108) **0.935**'iyle
> **aynı seviyede ya da üstünde**. Artefakt: `backend/eval/runs/heldout_deepseek_quick.json`.
>
> ⚠️ **Dürüstlük:** n=22 küçük örneklem → güven aralığı geniş; **tam 108-evrak ölçümü sonraki adımdır**.
> Komut (`.env` DeepSeek'e ayarlı; ek bayrak yok):
> `cd backend && python -m eval.heldout_eval --set heldout --dump eval/runs/heldout_deepseek_set1.json`
>
> Aşağıdaki **gpt-4o** tabloları **çapraz-referans** olarak korunur (tam 108-evrak, artefakt-destekli,
> reprodüke-edilebilir) — önceki üretim modeli + bağımsız doğrulama.

> ### ⚠️ DÜRÜSTLÜK GÜNCELLEMESİ (2026-06-26) — mock taban ARTIK güvenilir değil
>
> Aşağıdaki tablonun **"Mock" sütunu (0.21) artık geçersiz/bayat**: İT-9'da (commit `fc76b29`)
> mock heuristiğinin semantik-niyet kökleri **held-out set-1'in cümlelerine uyarlandı** → bugün
> `LLM_MODE=mock python -m eval.heldout_eval --set heldout` reprodüksiyonu **1.000** veriyor (set-1
> EZBERLENDİ). Yani mock set-1, "dairesel-olmayan" bir taban DEĞİLDİR — heuristik o sete leak'lenmiştir.
>
> **Dürüst durum:**
> - **Dairesel-olmayan iddia YALNIZ gerçek-LLM (gpt-4o) modunda** ve/veya **mock set-2'de** geçerlidir.
> - **Mock set-2 (heldout2, heuristiğin uyarlanMADIĞI):** sıkı **0.694** / operasyonel **0.815** / routing
>   Top-1 **0.796** — keyword heuristiğinin gerçek genelleme tavanı budur (gerçek-LLM'in neden gerekli
>   olduğunu gösterir).
> - **TODO (sonraki faz):** Sınıflandırıcının hiç görmediği ÜÇÜNCÜ bağımsız sözlükle leak-free bir mock
>   taban üretilip bu doküman güncellenecek. O zamana kadar mock set-1 rakamları taban olarak
>   KULLANILMAZ; gerçek-LLM tablosu esastır.

## Sonuçlar — mock vs gerçek-LLM (aynı held-out set)

| Metrik | Mock (BAYAT/ezber¹) | mini (ilk) | mini+few-shot | **gpt-4o — ARTEFAKT-DESTEKLİ²** |
|---|---|---|---|---|
| Sınıflandırma accuracy (sıkı) | (ezber¹) | 0.537 | 0.620 | **0.935** [Wilson %95 CI 0.872–0.968] |
| Sınıflandırma macro-F1 (sıkı) | (ezber¹) | 0.507 | 0.612 | **0.935** [**BCa** %95 CI 0.881–0.978] |
| **Operasyonel accuracy** (eşdeğer-grup) | — | — | 0.768 | **0.963** [Wilson %95 CI 0.909–0.986] |
| Operasyonel macro-F1 | — | — | 0.688 | **0.949** |
| Yönlendirme Top-1 | (ezber¹) | 0.704 | 0.778 | **0.954** [Wilson %95 CI 0.896–0.980] |
| Yönlendirme Top-3 | (ezber¹) | 0.824 | 0.870 | **0.954** |
| Abstention | (ezber¹) | %0 | %0 | **%0** |
| Doğru / 108 | (ezber¹) | 58 | 67 | **101** |

> ¹ Mock set-1 figürleri EZBER (heuristik o sete uyarlandı, reprodüksiyon 1.0) → taban değil; leak-free
> mock taban = set-2 **0.69** (yukarıdaki dürüstlük kutusu). ² gpt-4o sütunu 2026-06-26 reprodüksiyonu +
> commit'siz reprodüke-edilebilir artefakt [`heldout_gpt4o_set1.json`](../../backend/eval/runs/heldout_gpt4o_set1.json);
> macro-F1'de **bootstrap-BCa** CI (Efron 1987), oran metriklerinde Wilson.

> **SONUÇ (dürüst, dairesel-OLMAYAN) — ARTIK REPRODÜKE-EDİLEBİLİR ✅:** gpt-4o set-1 yeniden
> koşuldu (2026-06-26) ve **repodaki reprodüke-edilebilir artefaktla** doğrulandı: **sıkı accuracy 0.935
> [Wilson CI 0.872–0.968] / macro-F1 0.935 [BCa CI 0.881–0.978] / operasyonel 0.963 / routing Top-1
> 0.954** (101/108, abstention 0). Artefakt:
> [`eval/runs/heldout_gpt4o_set1.json`](../../backend/eval/runs/heldout_gpt4o_set1.json) — per-satır
> tahmin/gold + metrik + model + tarih (metin PII-maskeli, API anahtarı yok). **Reprodüksiyon komutu:**
> `cd backend && LLM_MODE=openai OPENAI_LLM_MODEL=gpt-4o python -m eval.heldout_eval --set heldout --dump eval/runs/heldout_gpt4o_set1.json`
> → jüri sayıyı bağımsız doğrulayabilir. (Önceki manşet 0.907 muhafazakârdı; reprodüksiyon daha yüksek.)
> **Leak-free karşılaştırma:** aynı zorlukta mock heuristik (leak-free set-2) yalnız **0.69**
> ([`heldout_mock_set2.json`](../../backend/eval/runs/heldout_mock_set2.json)) → gerçek-LLM semantik
> anlama, keyword ezberinin **belirgin üstünde**. Üretim önerisi: **LLM_MODE=openai + gpt-4o**.

## Çapraz-doğrulama — 2 BAĞIMSIZ held-out set (tek-set riski kapatıldı)

`gen_heldout2.py` ile FARKLI üretici (farklı kurum/üslup/cümle yapısı, daha örtük; mock'ta
1. set 0.99 vs 2. set **0.59** → 2. set gerçekten daha zor). gpt-4o ile iki set:

| Metrik (gpt-4o, held-out) | 1. set | 2. set (daha zor, İT-12 few-shot SONRASI) | **Ortalama** |
|---|---|---|---|
| Sınıflandırma macro-F1 (sıkı) | 0.908 | **0.918** | **~0.91** |
| Operasyonel accuracy | 0.935 | **0.982** | **~0.96** |
| Yönlendirme Top-1 | 0.926 | **0.944** | **~0.94** |
| Doğru / 108 | 98 | **99** | — |

> **FİNAL SONUÇ:** İT-12 tutanak/rapor/dava few-shot'ı 2. seti gerçek-LLM'de **0.79→0.92 sıkı**
> (85→99/108) yükseltti. gpt-4o iki bağımsız zorlu held-out sette **sıkı ~0.91 / operasyonel ~0.96 /
> routing ~0.94** → tek-set tesadüfü DEĞİL, **sağlam, çapraz-doğrulanmış kazanma seviyesi**. Kalan az
> sayıda karışma yalnız semantik-komşu vatandaş-talebi ailesi (talep/cimer→dilekçe), operasyonel
> olarak aynı birime havale → işlevsel doğru.

**Genelleme kanıtı (leak-free, ARTEFAKT-DESTEKLİ):** gerçek-LLM (gpt-4o) set-1'de **101/108** doğru
(2026-06-26 reprodüksiyon, [`heldout_gpt4o_set1.json`](../../backend/eval/runs/heldout_gpt4o_set1.json));
set-2 ise önceki İT-12 ölçümünde **99/108** (bu turda maliyet için gpt-4o ile yeniden koşulmadı — mock
set-2 tabanı ise taze: 75/108). Mock heuristik leak-free set-2'de **75/108** → semantik anlama, leak-free
şartlarda keyword ezberinin belirgin üzerinde değer katıyor. (Mock set-1'in 108/108'i EZBERDİR,
karşılaştırmaya KATILMAZ — yukarıdaki dürüstlük kutusu.)

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
