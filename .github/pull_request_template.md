<!-- Türkçe yazın. Başlık: <tür>: <kısa açıklama> (örn. feat: birim yönlendirme top-k öneri) -->

## Özet

<!-- Bu PR ne yapıyor? Hangi sorunu çözüyor / hangi özelliği ekliyor? 1-3 cümle. -->

## Değişiklik türü

- [ ] feat (yeni özellik)
- [ ] fix (hata düzeltme)
- [ ] refactor (davranış değiştirmeyen iyileştirme)
- [ ] docs (yalnız dokümantasyon)
- [ ] test (yalnız test)
- [ ] chore / ci (yapı, CI, bağımlılık)

## İlgili görev (şartname)

- [ ] Görev 1 — oku / sınıflandır / çıkar / eksik-tespit / mevzuat / özet
- [ ] Görev 2 — resmî yazı taslağı / birim yönlendirme / bilgilendirme
- [ ] İkisi de / hiçbiri (altyapı)

## Test planı

<!-- Nasıl doğruladınız? Lokal komutları yazın. -->

- [ ] `cd backend && uv run ruff check .` temiz
- [ ] `cd backend && uv run pytest -q` yeşil
- [ ] `cd frontend && npm run build` başarılı
- [ ] Yeni/değişen davranış için test eklendi (TDD)

## Kontrol listesi (CLAUDE.md kuralları)

- [ ] Gerçek PII / gerçek kamu verisi YOK (sahte: `Ayşe Yılmaz`, `0555-123-4567`, sahte TCKN)
- [ ] Uydurma mevzuat referansı YOK (şüpheli madde no → `[DOĞRULA: ...]`)
- [ ] Hardcoded secret YOK (`.env` kullanıldı)
- [ ] AGPL bağımlılık eklenmedi (PDF için `pypdfium2`)
- [ ] Dosya < 800 satır, fonksiyon < 50 satır
- [ ] Yanıtlarda yasal disclaimer korundu

## Ekran görüntüsü / not (opsiyonel)

<!-- UI değişikliği varsa görsel; başka bir not varsa buraya. -->
