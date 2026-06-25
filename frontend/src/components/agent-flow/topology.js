/* kamu-evrak pipeline topolojisi — canlı Ajan Akış Şeması için node tanımları.
   ADALET agent-flow/topology.js deseninden ADAPT: hukuk node'ları → evrak iş-akışı.
   Sıra backend agents/graph.py PIPELINE_NODES + "oku" (OCR, graf-öncesi) ile eşleşir.
   RED-LINE: yalnız ilerleme görselleştirir; sonuç backend'de üretilir.

   Görev ayrımı (şartname): gorev=1 Görev-1 (anlama/çıkarma), gorev=2 Görev-2 (üretim/yönlendirme).
   SVG için col/row koordinatları: backend grafındaki fan-out'u (eksik_tespit → mevzuat_oner ∥
   ozetle → route_birim) iki satıra (row 0/2) açar; kalan node'lar tek hatta (row 1) akar. */

export const PIPELINE = [
  { id: "oku", label: "Oku (OCR)", gorev: 1, desc: "PDF/görsel/Word → metin", col: 0, row: 1 },
  { id: "siniflandir", label: "Sınıflandır", gorev: 1, desc: "Evrak türü", col: 1, row: 1 },
  { id: "cikar", label: "Bilgi Çıkar", gorev: 1, desc: "Gönderen/tarih/sayı/konu", col: 2, row: 1 },
  { id: "eksik_tespit", label: "Eksik Tespit", gorev: 1, desc: "Zorunlu alan (3071 m.4)", col: 3, row: 1 },
  { id: "mevzuat_oner", label: "Mevzuat Öner", gorev: 1, desc: "İlgili mevzuat", col: 4, row: 0 },
  { id: "ozetle", label: "Özetle", gorev: 1, desc: "Kısa öz özet", col: 4, row: 2 },
  { id: "route_birim", label: "Birim Yönlendir", gorev: 2, desc: "Havale → doğru birim", col: 5, row: 1 },
  { id: "yazi_taslak", label: "Yazı Taslağı", gorev: 2, desc: "Resmî yazı (Yön. 2646)", col: 6, row: 1 },
  { id: "verify", label: "Doğrula", gorev: 2, desc: "Uydurma veto + format", col: 7, row: 1 },
  { id: "finalize", label: "Bilgilendir", gorev: 2, desc: "Bilgilendirme + eksik talebi", col: 8, row: 1 },
];

// Backend grafındaki kenarlar (graph.py add_edge ile birebir) — SVG ok çizimi için.
export const EDGES = [
  { from: "oku", to: "siniflandir" },
  { from: "siniflandir", to: "cikar" },
  { from: "cikar", to: "eksik_tespit" },
  { from: "eksik_tespit", to: "mevzuat_oner" },
  { from: "eksik_tespit", to: "ozetle" },
  { from: "mevzuat_oner", to: "route_birim" },
  { from: "ozetle", to: "route_birim" },
  { from: "route_birim", to: "yazi_taslak" },
  // Görev 2 kalite kapısı: taslak → doğrula → bilgilendir (graph.py ile birebir).
  { from: "yazi_taslak", to: "verify" },
  { from: "verify", to: "finalize" },
];

// Geriye-uyum: bazı bileşenler NODES bekleyebilir (col/row zaten PIPELINE'da).
export const NODES = PIPELINE.map((n) => ({ ...n, sub: n.desc }));
export const NODE_LABEL = Object.fromEntries(PIPELINE.map((n) => [n.id, n.label]));

// Görev başlıkları (şema üstü açıklama).
export const GOREV_LABEL = {
  1: "Görev 1 — Evrakı Anla & Çıkar",
  2: "Görev 2 — Yönlendir & Yazı Üret",
};

// Bir kenarın görsel durumu hedef düğümün durumundan türetilir (akış hissi).
export function edgeState(statusById, edge) {
  const t = statusById[edge.to];
  const f = statusById[edge.from];
  if (t === "active") return "flowing";
  if (f === "done" && t === "done") return "done";
  if (f === "done") return "ready";
  return "idle";
}

/* buildFigcaption → ekran-okuyucu için TR cümle özeti (animasyonsuz a11y eşdeğeri).
   statusById: { nodeId: "pending"|"active"|"done"|"error" }. */
export function buildFigcaption(statusById = {}) {
  const total = PIPELINE.length;
  const done = PIPELINE.filter((n) => statusById[n.id] === "done").length;
  const errored = PIPELINE.find((n) => statusById[n.id] === "error");
  if (errored) return `İşleme ${NODE_LABEL[errored.id]} adımında durdu.`;
  if (done === 0) return "Ajan akışı bekliyor; evrak yüklenince başlar.";
  if (done >= total) return "Tüm ajanlar tamamlandı; evrak işlendi ve sonuç hazır.";
  const active = PIPELINE.filter((n) => statusById[n.id] === "active").map((n) => n.label);
  if (active.length) {
    const ad = active.length > 1 ? active.join(" ve ") + " ajanları çalışıyor" : active[0] + " ajanı çalışıyor";
    return `${ad} (${done}/${total} tamamlandı).`;
  }
  return `${done}/${total} ajan tamamlandı.`;
}
