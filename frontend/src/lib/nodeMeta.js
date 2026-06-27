/* Dashboard pipeline node metadata — TÜM olası backend node'ları (ENV-gated dahil).
   Backend SSE `start.nodes` dinamik gelir (varsayılan 16: oku + 15 PIPELINE_NODES);
   ENV değişirse (CRAG/NLI/SELF_RAG/HITL açılırsa) yeni node ID'leri de gelebilir →
   burada hepsinin etiketi tanımlı, böylece "bilinmeyen node" boş satır olmaz (R1/R7).

   gorev: 1 = Görev-1 (Anla/Çıkar), 2 = Görev-2 (Üret/Yönlendir).
   summarize/nodeDataFromResult: AgentFlowGraph + App.jsx'ten taşındı, yeni node'larla genişletildi. */
import { EVRAK_TR, BIRIM_LBL, YAZI_TR } from "../components/result-cards.jsx";

// Her node için kısa TR etiket + görev + açıklama. (İkon dashboard'da numara ile gösterilir.)
export const NODE_META = {
  oku:            { label: "Oku (OCR)",       gorev: 1, desc: "PDF/görsel/Word → metin" },
  siniflandir:    { label: "Sınıflandır",     gorev: 1, desc: "Evrak türü" },
  cikar:          { label: "Bilgi Çıkar",     gorev: 1, desc: "Gönderen/tarih/sayı/konu" },
  kanit_baglama:  { label: "Kanıt Bağla",     gorev: 1, desc: "Çıkarımı metne demirle" },
  eksik_tespit:   { label: "Eksik Tespit",    gorev: 1, desc: "Zorunlu alan (3071 m.4)" },
  decompose:      { label: "Çok-Konulu Ayır", gorev: 1, desc: "Alt-taleplere böl" },
  mevzuat_oner:   { label: "Mevzuat Öner",    gorev: 1, desc: "İlgili mevzuat" },
  crag:           { label: "Öz-Düzelt (CRAG)",gorev: 1, desc: "Getirimi öz-değerlendir" },
  mevzuat_dogrula:{ label: "Atıf Doğrula",    gorev: 1, desc: "NLI entailment" },
  ozetle:         { label: "Özetle",          gorev: 1, desc: "Kısa öz özet" },
  route_birim:    { label: "Birim Yönlendir", gorev: 2, desc: "Havale → doğru birim" },
  clarifier:      { label: "Dur ve Sor",      gorev: 2, desc: "Eksik bilgi sorusu" },
  yazi_taslak:    { label: "Yazı Taslağı",    gorev: 2, desc: "Resmî yazı (Yön. 2646)" },
  verify:         { label: "Doğrula",         gorev: 2, desc: "Uydurma veto + format" },
  risk_guard:     { label: "Risk Bandı",      gorev: 2, desc: "Trafik ışığı + koşullu onay" },
  self_rag:       { label: "Öz-RAG Denetim",  gorev: 2, desc: "Yanıt yeterlilik denetimi" },
  onay_kapisi:    { label: "Memur Onayı",     gorev: 2, desc: "Koşullu HITL kapısı" },
  arsiv:          { label: "Arşivle (SDP)",   gorev: 2, desc: "Saklama planı 2005/7" },
  sla_triyaj:     { label: "Yasal Süre",      gorev: 2, desc: "SLA triyaj (gün)" },
  denetim_izi:    { label: "Denetim İzi",     gorev: 2, desc: "SHA-256 hash-zincir" },
  finalize:       { label: "Bilgilendir",     gorev: 2, desc: "Bilgilendirme + eksik talebi" },
};

// Varsayılan ENV pipeline (DECOMPOSE=1, RISK_GUARD=1; CRAG/NLI/SELF_RAG/HITL=0) — 16 node.
// Sample (JSON) yolunda SSE start event'i yok → bu sırayı kullan (dosya yolunda gerçek
// start.nodes gelir, ENV ne olursa olsun ona uyarız).
export const DEFAULT_NODE_IDS = [
  "oku", "siniflandir", "cikar", "kanit_baglama", "eksik_tespit", "decompose",
  "mevzuat_oner", "ozetle", "route_birim", "yazi_taslak", "verify", "risk_guard",
  "arsiv", "sla_triyaj", "denetim_izi", "finalize",
];

// Bir node ID'sinden taze düğüm nesnesi (etiket bilinmiyorsa ID'yi okunur yap).
export function makeNode(id) {
  const m = NODE_META[id] || { label: prettyNodeId(id), gorev: 1, desc: "" };
  return { id, label: m.label, gorev: m.gorev, desc: m.desc, status: "pending", data: null, t0: null, t1: null };
}

function prettyNodeId(id) {
  return String(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const pct = (x) => Math.round((Number(x) || 0) * 100);

/* Node "done" olunca gösterilecek kompakt TR özet (SSE data alanından). */
export function summarize(id, d) {
  if (!d) return "";
  switch (id) {
    case "oku": {
      const conf = d.ocr_confidence != null ? ` · %${pct(d.ocr_confidence)} güven` : "";
      return `${d.engine || "metin"} · ${d.n_chars ?? 0} krk${conf}`;
    }
    case "siniflandir":
      return d.evrak_turu ? `${EVRAK_TR(d.evrak_turu)} · %${pct(d.tur_confidence)}` : "";
    case "cikar": {
      const n = d.bilgi_unsurlari ? Object.keys(d.bilgi_unsurlari).length : 0;
      const pii = d.bilgi_unsurlari?.pii_var ? " · PII maskeli" : "";
      return n ? `${n} alan${pii}` : "";
    }
    case "kanit_baglama": {
      const n = (d.kanit_metadata?.spanlar || []).length;
      return n ? `${n} kanıt bağlandı` : "kanıt yok";
    }
    case "eksik_tespit": {
      const n = (d.eksik_alanlar || []).length;
      return n ? `${n} eksik alan` : "tam ✓";
    }
    case "decompose": {
      const n = (d.alt_talepler || []).length;
      return n >= 2 ? `${n} alt-talep` : "tek-konulu";
    }
    case "mevzuat_oner": {
      const n = (d.mevzuat_onerileri || []).length;
      return n ? `${n} mevzuat önerisi` : "öneri yok";
    }
    case "crag":
      return d.crag_corrected ? "getirim düzeltildi" : "getirim yeterli ✓";
    case "mevzuat_dogrula": {
      const n = (d.mevzuat_nli || []).length;
      return n ? `${n} atıf doğrulandı` : "";
    }
    case "ozetle": return d.ozet ? "özet hazır ✓" : "";
    case "route_birim": return d.hedef_birim ? `${BIRIM_LBL(d.hedef_birim)}` : "";
    case "clarifier": {
      const n = (d.clarify_questions || []).length;
      return n ? `${n} soru` : "bilgi tam ✓";
    }
    case "yazi_taslak":
      return d.yazi_turu ? `${YAZI_TR(d.yazi_turu)}${d.format_uyumlu ? " · format ✓" : ""}` : (d.format_uyumlu ? "taslak ✓" : "taslak");
    case "verify": {
      const n = (d.verify_uyari || []).length;
      if (n) return `${n} uyarı ⚠`;
      return d.format_uyumlu === false ? "format ⚠" : "doğrulandı ✓";
    }
    case "risk_guard": {
      const bant = d.risk_metadata?.bant;
      const skor = d.risk_metadata?.skor;
      const tr = { yesil: "yeşil ✓", sari: "sarı ⚠", kirmizi: "kırmızı ⚠" }[bant];
      return bant ? `${tr || bant}${skor != null ? ` (skor ${skor})` : ""}` : "";
    }
    case "self_rag":
      return d.self_rag_tam ? "yanıt yeterli ✓" : "eksik tespit edildi";
    case "onay_kapisi":
      return d.onay_durumu ? `${d.onay_durumu}` : "onaya sunuldu";
    case "arsiv": {
      const sdp = d.arsiv_metadata?.sdp_kodu || d.arsiv_metadata?.sdp;
      return sdp ? `SDP ${sdp}` : "arşivlendi";
    }
    case "sla_triyaj": {
      const durum = d.sla_metadata?.durum;
      const gun = d.sla_metadata?.kalan_gun ?? d.sla_metadata?.sure_gun;
      return durum ? `${durum}${gun != null ? ` · ${gun}g` : ""}` : "";
    }
    case "denetim_izi":
      return d.denetim_izi ? "SHA-256 zincir ✓" : "";
    case "finalize": return "bilgilendirme hazır ✓";
    default: return "";
  }
}

/* ProcessResponse'tan bir node için SSE'ye eşdeğer özet veri çıkar (sample JSON yolu animasyonu). */
export function nodeDataFromResult(id, r, nChars = 0) {
  switch (id) {
    case "oku": return { engine: "metin", n_chars: nChars, page_count: 1 };
    case "siniflandir": return { evrak_turu: r.evrak_turu, tur_confidence: r.tur_confidence };
    case "cikar": return { bilgi_unsurlari: r.bilgi_unsurlari };
    case "kanit_baglama": return { kanit_metadata: r.kanit_metadata };
    case "eksik_tespit": return { eksik_alanlar: r.eksik_alanlar };
    case "decompose": return { alt_talepler: r.alt_talepler || [] };
    case "mevzuat_oner": return { mevzuat_onerileri: r.mevzuat_onerileri };
    case "ozetle": return { ozet: r.ozet };
    case "route_birim": return { hedef_birim: r.hedef_birim };
    case "yazi_taslak": return { yazi_turu: r.yazi_turu, format_uyumlu: !!r.yazi_taslak_md };
    case "verify": return {
      format_uyumlu: r.format_uyumlu === undefined ? !!r.yazi_taslak_md : r.format_uyumlu,
      verify_uyari: r.verify_uyari || [],
    };
    case "risk_guard": return { risk_metadata: r.risk_metadata };
    case "arsiv": return { arsiv_metadata: r.arsiv_metadata };
    case "sla_triyaj": return { sla_metadata: r.sla_metadata };
    case "denetim_izi": return { denetim_izi: r.denetim_izi };
    case "finalize": return {};
    default: return null;
  }
}
