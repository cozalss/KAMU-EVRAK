# Pipeline Hız Sadeleştirmesi

## Amaç

Canlı evrak akışını, sınıflandırma/yönlendirme doğruluğunu ve güvenlik kapılarını
koruyarak hızlandırmak. Hedef tek-konulu belgelerde P95 <= 12 sn, üç alt talepli
belgelerde P95 <= 18 sn ve sonuç hazırlandıktan sonraki UI gecikmesinde <= 300 ms.

## Ölçülen kök neden

- Mock graf P50 yaklaşık 56 ms; deterministik düğüm sayısı darboğaz değil.
- Canlı iki koşum yaklaşık 57 sn ve 33 sn sürdü; sırasıyla 13 ve 11 LLM çağrısı yaptı.
- Gizli `servis_birim` çağrısı bir koşumda JSON tekrarıyla yaklaşık 14,1 sn sürdü.
- `route_ajan` aynı koşumda yaklaşık 18,4 sn; plan/gövde/yeniden-gövde yaklaşık 10,4 sn sürdü.
- Frontend, paralel/gizli beklemeyi sıradaki görünür düğüme yazdığı için `Kanıt Bağla`
  gerçekte hızlı olduğu halde 11 sn sürmüş gibi görünüyordu.

## Onaylanan tasarım

1. Graf ve state sözleşmeleri korunur; ucuz güvenlik düğümleri silinmez.
2. Erken `servis_birim` dalı yalnız deterministik öneri üretir. Kaynak-doğrulanmış
   `route_ajan` sonucu varsa otoriterdir; yoksa deterministik öneri fallback'tir.
3. `finalize` yalnız mevcut yapısal/deterministik bildirimi üretir; süsleyici LLM yoktur.
4. Risk bandı ve açıklaması deterministiktir; bant/skor/gerekçe değişmez.
5. SDP LLM seçicisi yalnız birden fazla makul aday arasında gerçek belirsizlik varsa çalışır.
6. Çok-konulu alt taslak gövdeleri sınırlı paralellikle üretilir; sonuç sırası korunur.
7. Her düğüm gerçek `duration_ms` üretir ve SSE bunu frontend'e taşır.
8. UI teknik düğümleri dört evrak-işlem fazında gruplar; ayrıntılar erişilebilir kalır.

## Kalite kapıları

- Aynı model/config ile held-out sınıflandırma, macro-F1 ve routing Top-1 düşüşü <= 1 puan.
- Format uyumu 1,0; uydurma-veto false-positive 0; PII sızıntısı 0.
- Her graf düğümü tam bir kez çalışır; hızlı/seri deterministik alanlar eşdeğerdir.
- Tek-konulu LLM çağrısı P95 <= 5, üç-alt-talep P95 <= 7; JSON retry < %1.
- SSE `start.nodes`, node event'leri ve `ProcessResponse` geriye uyumludur.

## Karar günlüğü

- Fiziksel düğüm silmek reddedildi: ölçülen maliyetleri milisaniye, güvenlik değerleri yüksek.
- `VITRIN_MODU=1` reddedildi: hız dışında CRAG/HITL/clarifier davranışını da değiştiriyor.
- Dar ve geri alınabilir optimizasyonlar seçildi.
- Gerçek-model kalite A/B'si olmadan sınıflandırma/özetleme çağrıları birleştirilmeyecek.

## Uygulama doğrulaması

- Backend: 2.383 test geçti; topoloji, PII, uydurma-veto, format ve HITL korumaları dahil.
- Frontend: 376 test geçti; hedef dosyalarda ESLint hatası/uyarısı yok, üretim derlemesi başarılı.
- Mock sıcak koşu (n=30): P50 44,47 ms, P95 49,38 ms; 16 node'un tamamı gerçek
  `duration_ms` telemetrisi üretti.
- Gerçek model P50/P95 hedefleri, aynı model/config ve sabit corpus ile ayrıca A/B ölçülmelidir;
  mock sonucu gerçek-model kalite veya ağ gecikmesi kanıtı olarak kullanılmaz.
