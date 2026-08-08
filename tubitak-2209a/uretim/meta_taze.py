import sys, json
sys.stdout.reconfigure(encoding="utf-8")
yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))
ic["_meta"]["guclendirme_turu"]["taze_olcum"] = {
  "durum": "8 Ağustos 2026'da GÜNCEL kod tabanında koşuldu (LLM gerektirmeyen yol)",
  "mevzuat_erisimi_n16": {"Recall@1": "0,750 [0,505-0,898]",
                          "Recall@3": "0,938 [0,717-0,989]", "MRR": "0,812"},
  "not": "Önerideki TEK güncel ölçüm. 2.7'ye işlendi. Diğer metrikler LLM API anahtarı "
         "olmadığı için tazelenemedi."
}
ic["_meta"]["kalan_riskler"][3] = (
  "ÖN ÇALIŞMA SAYILARI KISMEN TAZELENDİ — mevzuat erişimi 8 Ağustos 2026'da güncel kod "
  "tabanında yeniden ölçüldü (Recall@1 0,750, Recall@3 0,938, MRR 0,812; n=16) ve 2.7'ye "
  "işlendi. LLM'li metrikler (sınıflandırma, yönlendirme, özet, taslak) hâlâ bayat çünkü "
  ".env dosyasında OPENAI_API_KEY satırı YOK. Anahtar eklenirse bu zayıflık TAMAMEN kapanır."
)
json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("meta güncellendi")
