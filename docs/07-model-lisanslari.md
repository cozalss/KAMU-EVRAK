# 07 — Teknoloji / Model Lisansları + Açık-Kaynak Uyumu

> Şartname §7: tüm kod+veri açık lisansla (MIT/Apache/GNU) **TAKP GitHub**'a. Açık-tanıma
> uymayan / büyük model **ağırlıkları repoya YÜKLENMEZ** → yalnız link+sürüm+lisans+talimat.

## Bağımlılık tablosu

| Katman | Seçim | Lisans | Repoya? |
|---|---|---|---|
| Web API | FastAPI + uvicorn + pydantic + structlog + httpx | MIT/BSD/Apache | kod |
| Orkestrasyon | LangGraph | MIT | kod |
| Sınıflandırma | **BERTurk / DistilBERTurk** fine-tune (opsiyonel kademe) | **MIT** | ağırlık küçük → evet |
| NER/çıkarım | **Stanza-tr** (spaCy CC-BY-SA riskinden kaçın) | **Apache-2.0** | evet |
| Özetleme | **mukayese/mt5-base-turkish-summarization** | **Apache-2.0** | referans |
| OCR (offline) | **RapidOCR (onnxruntime)** + **Tesseract-tur** | **Apache-2.0** | evet |
| **Dijital PDF** | **pypdfium2** (PyMuPDF **AGPL** alternatifi) | **Apache/BSD** | evet |
| Word | python-docx | MIT | evet |
| Embedding | **BGE-M3** (dense+sparse+ColBERT) | MIT | referans |
| Vektör DB | Qdrant | Apache-2.0 | kod (servis) |
| Rerank | BGE-Reranker-v2-m3 | Apache-2.0 | referans |
| Mevzuat erişim | mevzuat-mcp (opsiyonel) | MIT | kod |
| Sentetik PII | **Faker tr_TR** + checksum-sahte-TCKN | MIT | kod |
| Taslak render | jinja2 + reportlab + python-docx | BSD/MIT | kod |
| Drafting LLM | **Qwen2.5/3** (Apache, lokal) veya gpt-4o (bulut, `.env`) | Apache / bulut | **ağırlık YÜKLENMEZ**, referans |

## ⚠️ Kritik lisans notları

1. **AGPL bulaşması — ÇÖZÜLDÜ:** ADALET `pdf_utils.py` **PyMuPDF (AGPL-3.0)** kullanıyordu →
   MIT repo iddiasını bozardı. kamu-evrak'ta **pypdfium2 (Apache/BSD)** ile yeniden yazıldı.
   `pyproject.toml`'da pymupdf YOK; `.gitignore` model ağırlıklarını dışlar.
2. **ADALET lisansı = MIT** (doğrulandı) → kopyalanan dosyalar yeniden-lisanslanabilir; yine de
   her dosya başına lisans-uyum gözden geçirilmeli (kopyalanan kodda 3. taraf parçası varsa).
3. **Ağırlık-vs-link:** küçük fine-tune (DistilBERTurk) ağırlığı repoya konabilir; büyük modeller
   (BGE-M3, Qwen, mT5) **link + sürüm + lisans** ile dokümante edilir, repoya yüklenmez.

## Doğrulanacak açık uçlar (üretimden önce)

- savasy-NER lisansı belirsiz → akdeniz27/MIT'e geç.
- Mecellem/HukukBERT model kartı lisansı.
- Turkish-NLI veri setleri lisansı.
- spaCy-tr **CC-BY-SA** türev-paylaşım etkisi → **Stanza-tr (Apache)** tercih edilerek bertaraf.
- Tüm `from_pretrained` çağrılarında **revision pin** (supply-chain).
