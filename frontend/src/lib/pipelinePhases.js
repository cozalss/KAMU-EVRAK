/* Teknik ajanları memurun tanıdığı dört resmî işlem fazında toplar. */
export const PIPELINE_PHASES = Object.freeze([
  { id: "incele", no: 1, label: "Belgeyi incele", gorev: 1 },
  { id: "karar", no: 2, label: "Dayanak ve havale", gorev: 1 },
  { id: "yaz", no: 3, label: "Yaz ve doğrula", gorev: 2 },
  { id: "kaydet", no: 4, label: "Kayda al ve bildir", gorev: 2 },
]);

export const DEFAULT_PIPELINE_NODE_IDS = Object.freeze([
  "oku", "siniflandir", "cikar", "kanit_baglama", "eksik_tespit", "decompose",
  "mevzuat_oner", "ozetle", "route_birim", "yazi_taslak", "verify", "risk_guard",
  "arsiv", "sla_triyaj", "denetim_izi", "finalize",
]);

const NODE_PHASE = Object.freeze({
  oku: "incele", siniflandir: "incele", cikar: "incele",
  kanit_baglama: "incele", eksik_tespit: "incele", decompose: "incele",
  mevzuat_oner: "karar", crag: "karar", mevzuat_dogrula: "karar",
  ozetle: "karar", route_birim: "karar", clarifier: "karar",
  yazi_taslak: "yaz", verify: "yaz", risk_guard: "yaz",
  self_rag: "yaz", onay_kapisi: "yaz",
  arsiv: "kaydet", sla_triyaj: "kaydet", denetim_izi: "kaydet", finalize: "kaydet",
});

export function phaseForNode(id) {
  return NODE_PHASE[id] || "incele";
}

export function nodeDurationMs(node) {
  const serverMs = node?.durationMs == null ? null : Number(node.durationMs);
  if (serverMs != null && Number.isFinite(serverMs) && serverMs >= 0) return serverMs;
  if (node?.t0 == null || node?.t1 == null) return null;
  const clientMs = Number(node?.t1) - Number(node?.t0);
  return Number.isFinite(clientMs) && clientMs >= 0 ? clientMs : null;
}
