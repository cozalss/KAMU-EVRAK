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
  // VİTRİN — çok-konulu ayrıştırma: tek dilekçedeki N isteği ayırır → paralel fan-out kaynağı.
  { id: "decompose", label: "Çok-Konulu Ayır", gorev: 1, desc: "Alt-taleplere böl → ayrı havale", col: 4, row: 1 },
  { id: "mevzuat_oner", label: "Mevzuat Öner", gorev: 1, desc: "İlgili mevzuat", col: 5, row: 0 },
  { id: "ozetle", label: "Özetle", gorev: 1, desc: "Kısa öz özet", col: 5, row: 2 },
  { id: "route_birim", label: "Birim Yönlendir", gorev: 2, desc: "Havale → doğru birim", col: 6, row: 1 },
  { id: "yazi_taslak", label: "Yazı Taslağı", gorev: 2, desc: "Resmî yazı (Yön. 2646)", col: 7, row: 1 },
  { id: "verify", label: "Doğrula", gorev: 2, desc: "Uydurma veto + format", col: 8, row: 1 },
  // Risk bandı (trafik ışığı): verify sinyallerini yeşil/sarı/kırmızı'ya çevirir → koşullu onay.
  { id: "risk_guard", label: "Risk Bandı", gorev: 2, desc: "Trafik ışığı + koşullu onay", col: 9, row: 1 },
  { id: "finalize", label: "Bilgilendir", gorev: 2, desc: "Bilgilendirme + eksik talebi", col: 10, row: 1 },
];

// Backend grafındaki kenarlar (graph.py add_edge ile birebir) — SVG ok çizimi için.
// decompose AÇIKKEN (varsayılan) fan-out kaynağıdır; KAPALIYKEN backend eksik_tespit'ten
// fan-out yapar ve decompose SSE'de hiç "yanmaz" (düğüm pending kalır — kabul edilebilir).
export const EDGES = [
  { from: "oku", to: "siniflandir" },
  { from: "siniflandir", to: "cikar" },
  { from: "cikar", to: "eksik_tespit" },
  { from: "eksik_tespit", to: "decompose" },
  { from: "decompose", to: "mevzuat_oner" },
  { from: "decompose", to: "ozetle" },
  { from: "mevzuat_oner", to: "route_birim" },
  { from: "ozetle", to: "route_birim" },
  { from: "route_birim", to: "yazi_taslak" },
  // Görev 2 kalite kapısı: taslak → doğrula → risk bandı → bilgilendir (graph.py ile birebir).
  { from: "yazi_taslak", to: "verify" },
  { from: "verify", to: "risk_guard" },
  { from: "risk_guard", to: "finalize" },
];

// Geriye-uyum: bazı bileşenler NODES bekleyebilir (col/row zaten PIPELINE'da).
export const NODES = PIPELINE.map((n) => ({ ...n, sub: n.desc }));
export const NODE_LABEL = Object.fromEntries(PIPELINE.map((n) => [n.id, n.label]));

// Görev başlıkları (şema üstü açıklama).
export const GOREV_LABEL = {
  1: "I. Anlama — evrakı oku ve çıkar",
  2: "II. Yazı üretimi — yönlendir ve yaz",
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

/* PARAF — havale pusulasında (canlı sahne slip'i) her masanın imza baş harfleri. YALNIZ görsel
   üst veri: hangi adımın koştuğu/atlandığı bilgisi buradan DEĞİL, akisKatman.adimDurumu'ndan
   gelir. Bilinmeyen id için etiketten türetilir (parafUret). */
export const PARAF = {
  oku: "OK", siniflandir: "SN", cikar: "BÇ", kanit_baglama: "KB", eksik_tespit: "ET",
  decompose: "ÇA", mevzuat_oner: "MÖ", ozetle: "ÖZ", route_birim: "BY", yazi_taslak: "YT",
  verify: "DĞ", risk_guard: "RB", arsiv: "AR", sla_triyaj: "SL", denetim_izi: "Dİ",
  finalize: "BL", clarifier: "NT", onay_kapisi: "OY",
};
export function parafUret(id, label = "") {
  if (PARAF[id]) return PARAF[id];
  const k = String(label).replace(/[^\p{L}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  const s = k.length > 1 ? k[0][0] + k[1][0] : (k[0] || id || "?").slice(0, 2);
  return s.toLocaleUpperCase("tr-TR");
}
