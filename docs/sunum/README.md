# Sunum Çıktıları (PDF + PPTX) — TEKNOFEST teslim formatı

Bu klasör, anlatım Markdown'larından üretilen **gerçek sunum dosyalarını** içerir.
Şartname §7 teslim formatı: ön + final sunum **PDF VE PPTX**.

| Dosya | Kaynak Markdown | İçerik |
|---|---|---|
| `on-degerlendirme.pdf` / `.pptx` | `docs/sunum-on-degerlendirme.md` | Ön değerlendirme (10 slayt + ek) |
| `final.pdf` / `.pptx` | `docs/sunum-final.md` | Final (10 dk akış + slayt iskeleti + jüri S-C + kontrol listesi) |

> Üretilen dosyalar deterministiktir (aynı Markdown → aynı içerik). Kaynak
> Markdown güncellenince **yeniden üretin** (aşağı). Çıktılar repoya commit'lenebilir.

## Yeniden üretim

```bash
cd backend
uv sync --extra docs        # python-pptx kurar (PDF için reportlab zaten çekirdek)

# Her iki sunumu birden üret (varsayılan → docs/sunum/):
python ../scripts/export_sunum.py --all

# Tek sunum (uzantısız çıktı tabanı; .pdf + .pptx eklenir):
python ../scripts/export_sunum.py docs/sunum-on-degerlendirme.md \
    --out docs/sunum/on-degerlendirme
python ../scripts/export_sunum.py docs/sunum-final.md --out docs/sunum/final
```

> Script repo kökünden de çalışır: `python scripts/export_sunum.py --all`.
> Görsel yolları (`docs/img/*.png`) **repo köküne göredir**.

## Markdown → slayt kuralları

Script `scripts/export_sunum.py` şu deseni ayrıştırır:

- `## Başlık`  → **yeni slayt** (başlık).
- `- madde` / `* madde`  → **bullet** (2+ boşluk girinti = alt-bullet).
- `**Etiket:** değer`  → bullet (kalın/kod/link işaretleri düz metne indirgenir).
- `> ...`  → **konuşmacı notu** (PPTX speaker notes + PDF'te küçük italik blok).
- `![alt](docs/img/x.png)` veya satır-içi `docs/img/*.png`  → **görsel gömülür**.
- Markdown tablosu (`| a | b |`)  → satırlar okunur bullet'lara indirgenir.
- ` ``` ` kod blokları (ASCII mimari diyagramı vb.) **atlanır** (PDF/PPTX'te taşmasın).

## Türkçe font notu (KRİTİK)

Türkçe karakterlerin (ç, ş, ğ, ı, İ, ö, ü) PDF'te **doğru** görünmesi için, PDF
üretiminde bir **TrueType font gömülür** (reportlab `registerFont(TTFont(...))`).
Script şu adayları sırayla dener ve **ilk bulunanı** gömer:

1. **Arial** (`C:/Windows/Fonts/arial.ttf` + `arialbd.ttf`) — Windows varsayılan.
2. **DejaVu Sans** (`/usr/share/fonts/truetype/dejavu/...`) — Linux/CI.
3. **Verdana**, 4. **Tahoma** — Windows yedekleri.

Hiçbiri bulunamazsa script **NET bir hata** verir (sessizce bozuk PDF üretmez).
Yeni bir font yolu eklemek için `export_sunum.py` içindeki `_FONT_ADAYLARI`
listesini düzenleyin.

> PPTX tarafında font gömme gerekmez: metin Unicode olarak saklanır; PowerPoint
> sistemdeki uygun fontla render eder.

## Doğrulama (üretim sonrası)

```bash
# Magic byte: PDF "%PDF", PPTX "PK" (zip) ile başlamalı.
# Türkçe kontrolü (PDF metnini çıkar):
python -c "import pypdfium2 as p; d=p.PdfDocument('docs/sunum/on-degerlendirme.pdf'); \
print(d[0].get_textpage().get_text_range()[:200])"
```
