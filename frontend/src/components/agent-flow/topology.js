/* kamu-evrak pipeline topolojisi — canlı Ajan Akış Şeması için node tanımları.
   ADALET agent-flow/topology.js deseninden ADAPT: hukuk node'ları → evrak iş-akışı.
   Sıra backend agents/graph.py PIPELINE_NODES + "oku" (OCR, graf-öncesi) ile eşleşir.
   RED-LINE: yalnız ilerleme görselleştirir; sonuç backend'de üretilir. */

export const PIPELINE = [
  { id: "oku", label: "Oku (OCR)", gorev: 1, desc: "PDF/görsel/Word → metin" },
  { id: "siniflandir", label: "Sınıflandır", gorev: 1, desc: "Evrak türü" },
  { id: "cikar", label: "Bilgi Çıkar", gorev: 1, desc: "Gönderen/tarih/sayı/konu (PII maskeli)" },
  { id: "eksik_tespit", label: "Eksik Tespit", gorev: 1, desc: "Zorunlu alan (3071 m.4)" },
  { id: "mevzuat_oner", label: "Mevzuat Öner", gorev: 1, desc: "İlgili mevzuat/yazışma kuralı" },
  { id: "ozetle", label: "Özetle", gorev: 1, desc: "Kısa öz özet" },
  { id: "route_birim", label: "Birim Yönlendir", gorev: 2, desc: "Havale → doğru birim" },
  { id: "yazi_taslak", label: "Yazı Taslağı", gorev: 2, desc: "Resmî yazı (Yön. 2646)" },
  { id: "finalize", label: "Bilgilendir", gorev: 2, desc: "Bilgilendirme + eksik bilgi talebi" },
];

// Geriye-uyum: bazı bileşenler NODES bekleyebilir.
export const NODES = PIPELINE.map((n, i) => ({ ...n, col: i, row: 1, sub: n.desc }));
export const NODE_LABEL = Object.fromEntries(PIPELINE.map((n) => [n.id, n.label]));
