/* NeonDetayParts — NeonDetay'ın yaprak bileşenleri (Hero Light v2 "Sakin Ürün").
   Ayrı dosya: NeonDetay <800 satır kalsın; parçalar tek başına test edilebilir.
   Desen kaynağı: Langfuse/Braintrust (skor barı + eşik + kalite kapısı satırı),
   Stripe (mono kimlik + kopyala), Phoenix (atıf satırı + kaynak alt-satırı). */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { cleanDemoText } from "./result-cards.jsx";
import { MONO, T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, SR_ONLY, Icon, KV } from "./neonUi.jsx";
import { lintGrupla, slaKonum } from "../lib/detayYorum.js";

/* Semantik durum çipi — satır başına en fazla 1 (MASTER: çip enflasyonu yasak). */
export const Chip = ({ c = T, title, label, children }) => (
  <span title={title} aria-label={label} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(c), background: ALFA(c), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{children}</span>
);

/* Özet şeridi tek olgu (kutusuz ikon + etiket + değer). */
export const Fact = ({ k, v, c = PAL.ink2, icon }) => (
  <span style={{ display: "flex", alignItems: "center", gap: SP.s, minWidth: 0 }}>
    {icon && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(c) }}>{icon}</span>}
    <span style={{ minWidth: 0 }}>
      <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, marginBottom: 2 }}>{k}</span>
      <span style={{ display: "block", ...TYPE.ui, fontWeight: 500, color: DERIN_OF(c), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220, ...TNUM }}>{v}</span>
    </span>
  </span>
);

/* Görev bölüm etiketi — 12/500 sentence case + düz hairline ayraç. */
export const GorevLabel = ({ n, t, color, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: SP.m, margin: "0 0 12px" }}>
    <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(color), flex: "none" }}>Görev {n} — {t}</span>
    <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
    {count && <span style={{ ...TYPE.meta, color: PAL.mut3, flex: "none" }}>{count}</span>}
  </div>
);

/* yasal süre durumu → renk + etiket (çizelge konumu slaKonum'dan GERÇEK tarihlerle gelir). */
export function slaInfo(sla) {
  const d = (sla?.durum || "").toLocaleUpperCase("tr-TR");
  const kg = sla?.kalan_gun;
  const gun = kg != null ? ` · ${kg}g` : "";
  if (!d) return null;
  if (d.includes("GEC")) return { label: `Gecikmiş${gun}`, color: BANT.kirmizi.c };
  if (d.includes("KRİT") || d.includes("KRIT")) return { label: `Kritik${gun}`, color: BANT.sari.c };
  if (d.includes("NORMAL")) return { label: `Normal${gun}`, color: BANT.yesil.c };
  return { label: sla.durum, color: PAL.mut };
}

/* Alt-talep SLA durumu → bant rengi (decompose çıktısındaki sla_durum alanı). */
export function subSlaRenk(durum) {
  const d = String(durum || "").toLocaleUpperCase("tr-TR");
  if (d.includes("GEC")) return BANT.kirmizi.c;
  if (d.includes("KRİT") || d.includes("KRIT")) return BANT.sari.c;
  if (d.includes("NORMAL")) return BANT.yesil.c;
  return null;
}

/* Güven seviyesi → AA metin rengi (renk tek sinyal değil, metin de var). */
const GUVEN_RENK = { yüksek: DERIN.T, orta: DERIN.sari, düşük: DERIN.kirmizi };

/* Güven çipi tooltip'i — bandın gold sette ÖLÇÜLEN isabeti (api/mevzuat_zenginlestir
   `guven_isabet`; yalnız İLK öneride doludur, çünkü ölçüm yalnız orada temiz). Ölçüm
   yoksa oran İDDİA EDİLMEZ; bandın neden verildiği söylenir. Sıra önemli: en spesifik
   gerekçe (NLI-veto → [DOĞRULA] → ölçülü bant → ölçüsüz bant → statik) önce gelir. */
function guvenBaslik(m) {
  if (m.nli_etiket && m.nli_etiket.startsWith("[DOĞRULA")) {
    return "NLI ölçtü: madde, talebi anlamsal olarak desteklemiyor — bu yüzden düşük güven.";
  }
  if (m.dogrula) return "Madde no şüpheli ([DOĞRULA] işareti) — bant 'yüksek' olamaz, memur teyidi gerekir.";
  const oran = Number(m.guven_isabet);
  if (Number.isFinite(oran)) {
    return `Bu bandın altın sette ölçülen ilk-sıra isabeti: %${Math.round(oran * 100)}. `
      + "Bant, sorgu uzunluğuna göre düzeltilmiş BM25 skorundan (norm_score) gelir.";
  }
  if (m.norm_score != null) {
    return "Bant, sorgu uzunluğuna göre düzeltilmiş BM25 skorundan (norm_score) gelir. "
      + "Ölçülmüş isabet oranı yalnız ilk öneri için geçerlidir, bu satır için iddia edilmez.";
  }
  return "Statik tür→mevzuat eşlemesinden geldi (retrieval yok) — ölçülmüş isabet oranı yok.";
}

/* Mevzuat öneri satırı — GÖRELİ skor barı + kalibre güven çipi + NLI anlamsal destek +
   eşleşme gerekçesi + yürürlük + "insan incelemesi". Başlık, kaynak mevzuat metnine açılır.

   Tasarım notu (dürüstlük): `score` max-normalize olduğundan ilk satır DAİMA %100'dür —
   bu bir kalite ölçüsü değil, sıralama artefaktıdır. Bu yüzden yüzde açıkça "göreli" diye
   etiketlenir, amber/kırmızı sinyal ise skordan DEĞİL kalibre `guven` bandından gelir. */
export function MevzuatRow({ rank, m, nli, ilk, onAc, secili = false, onSec = null }) {
  const pct = Math.round((Number(m.score) || 0) * 100);
  const guven = m.guven || "";
  const gc = GUVEN_RENK[guven] || PAL.mut2;
  const zayif = guven === "düşük";
  const fill = zayif ? DERIN.kirmizi : (guven === "orta" ? DERIN.sari : DERIN.T);
  const title = cleanDemoText(m.baslik);
  const snippet = m.snippet ? cleanDemoText(m.snippet) : null;
  const gerekce = m.eslesme_gerekcesi ? cleanDemoText(m.eslesme_gerekcesi) : "";
  const nliPct = nli && Number.isFinite(Number(nli.skor)) ? Math.round(Number(nli.skor) * 100) : null;
  const acilir = !!(m.kaynak_dosya && onAc);
  const ac = () => onAc({ dosya: m.kaynak_dosya, maddeNo: m.madde_no ? Number(m.madde_no) : null, maddeTur: m.madde_tur || "madde" });
  // Kutucuk kurgusu: onSec verilirse madde yazıya dayanak olarak İŞARETLENEBİLİR (canlı akış).
  // Verilmezse (gömülü/legacy) satır salt-okunur kalır. İşaretli satır ince sol-aksan + tint alır.
  const secilebilir = !!onSec;
  const toggle = () => onSec && onSec(!secili);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "10px 0 12px", borderTop: ilk ? "none" : `1px solid ${PAL.line}`, ...(secili ? { paddingLeft: SP.s, borderLeft: `2px solid ${T}`, background: ALFA(T) } : null) }}>
      {secilebilir && (
        <button type="button" role="checkbox" aria-checked={secili} onClick={toggle}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
          aria-label={`${secili ? "Resmî yazıdan çıkar" : "Resmî yazıya dayanak olarak ekle"}: ${title}`}
          title={secili ? "Yazıya dayanak olarak işlendi — çıkarmak için tıklayın" : "Bu maddeyi resmî yazıya dayanak olarak işle"}
          {...focusRing}
          style={{ flex: "none", marginTop: 1, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.chip, border: `1.5px solid ${secili ? T : PAL.inputLine}`, background: secili ? T : PAL.surf, color: PAL.onAccent, cursor: "pointer", padding: 0, transition: "background .12s ease-out, border-color .12s ease-out" }}>
          {secili && <Icon.check width={12} height={12} />}
        </button>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: SP.s, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>{rank}.</span>
          {acilir ? (
            <button type="button" onClick={ac} aria-haspopup="dialog" {...focusRing}
              title="Maddenin tam metnini aç — öneriyi kaynağında doğrulayın"
              style={{ ...TYPE.data, fontWeight: 500, color: DERIN.T, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {title}
            </button>
          ) : (
            <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{title}</span>
          )}
          {guven && (
            <span title={guvenBaslik(m)} aria-label={`Güven seviyesi: ${guven}`} style={{ ...TYPE.meta, fontWeight: 500, color: gc, background: ALFA(GUVEN_RENK[guven] || PAL.mut2), borderRadius: RAD.chip, padding: "2px 8px" }}>{guven} güven</span>
          )}
          {m.atif_genisletme && (
            <span title="Bu öneri, üstteki maddenin atıf verdiği mevzuattan otomatik genişletmeyle geldi (GraphRAG-lite)" aria-label="Atıf grafiği genişletmesiyle gelen öneri" style={{ ...TYPE.meta, color: PAL.mut }}>atıf grafiğinden</span>
          )}
          {pct > 0 && (
            <span title="Skor, listenin ilk önerisine GÖRELİdir (ilk satır daima %100). Mutlak alaka ölçüsü değildir — onu güven bandı verir."
              style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut3, flex: "none", ...TNUM }}>
              %{pct} <span style={{ color: PAL.mut }}>göreli</span>
            </span>
          )}
        </div>
        {pct > 0 && (
          <div style={{ position: "relative", height: 4, background: PAL.press }} role="img"
            aria-label={`Göreli BM25 skoru: ilk önerinin yüzde ${pct}'i${guven ? ` — güven bandı: ${guven}` : ""}`}>
            <div style={{ height: "100%", width: `${pct}%`, background: fill }} />
          </div>
        )}
        {snippet && <div style={{ ...TYPE.data, color: PAL.mut2 }}>{snippet}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {nliPct != null && (
            <div style={{ ...TYPE.meta, color: nli.entailment ? DERIN.T : DERIN.sari, ...TNUM }}>
              Anlamsal destek (NLI): %{nliPct} — {nli.entailment ? "madde talebi destekliyor" : "destek zayıf, insan doğrulaması önerilir"}
            </div>
          )}
          {gerekce && <div style={{ ...TYPE.meta, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Eşleşme gerekçesi:</span> {gerekce}</div>}
          {m.yururluk && <div style={{ ...TYPE.meta, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Yürürlük:</span> {m.yururluk}</div>}
          {m.inceleme_oner && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: zayif ? DERIN.kirmizi : DERIN.sari, marginTop: 1 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              İnsan incelemesi önerilir{m.nli_etiket && m.nli_etiket.startsWith("[DOĞRULA") ? " · anlamsal destek zayıf" : ""}
            </div>
          )}
          {secili && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: DERIN.T, marginTop: 1 }}>
              <Icon.check width={11} height={11} /> Resmî yazıya dayanak olarak işlendi
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Yasal süre paneli — durum çipi + GERÇEK tarihlerden hesaplanan zaman çizelgesi (dolgu =
   geçen süre, işaret = bugün, uçlar = başvuru/son tarih) + somut tarihler + yasal dayanak.
   Tarih = makine verisi (mono); "son tarih" jüri için en somut kanıt. Konum slaKonum'dan —
   sabit yüzde yok; tarih hesaplanamazsa çizelge hiç çizilmez (yanlış görsel iddia olmaz). */
export function SlaPanel({ sla, info }) {
  // Süreye tabi OLMAYAN evrak (fatura/olur vb.) — 'tanımsız' hata gibi okunuyordu; artık
  // 'tabi değil' + açıklama (bu normal ve doğru durum; süre takibi yapılmaz).
  if (!info) {
    return (
      <div style={{ marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SP.m }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Yasal cevap süresi</span>
          <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, background: PAL.press, borderRadius: RAD.chip, padding: "2px 8px" }}>tabi değil</span>
        </div>
        <div style={{ marginTop: SP.xs, ...TYPE.meta, color: PAL.mut3 }}>
          Bu evrak türü için yasal cevap süresi tanımlı değil — süre takibi yapılmaz.
        </div>
      </div>
    );
  }
  const dc = DERIN_OF(info.color);
  const konum = slaKonum(sla);
  const kalanEtiket = konum
    ? (konum.kalan >= 0 ? `bugün · ${konum.kalan} gün kaldı` : `bugün · ${-konum.kalan} gün gecikti`)
    : null;
  // Uçlardaki "bugün" etiketi kart dışına taşmasın — yalnız ETİKET kelepçelenir, nokta gerçek konumda.
  const etiketSol = konum ? Math.min(86, Math.max(14, konum.oran * 100)) : 0;
  return (
    <div style={{ margin: "8px 0 4px", paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Yasal süre durumu</span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: dc, background: ALFA(info.color), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{info.label}</span>
      </div>
      {konum && (
        <div role="img" aria-label={`Yasal süre çizelgesi: başvuru ${sla.baslangic}, cevap son tarihi ${sla.son_tarih}; ${konum.toplam} günlük sürenin ${konum.gecen} günü geçti, ${konum.kalan >= 0 ? `${konum.kalan} gün kaldı` : `${-konum.kalan} gün gecikti`}.`}>
          <div aria-hidden="true" style={{ position: "relative", height: 16, marginBottom: 2 }}>
            <span style={{ position: "absolute", left: `${etiketSol}%`, transform: "translateX(-50%)", ...TYPE.meta, fontWeight: 500, color: dc, whiteSpace: "nowrap", ...TNUM }}>{kalanEtiket}</span>
          </div>
          <div aria-hidden="true" style={{ position: "relative", height: 6, background: PAL.press, borderRadius: RAD.chip }}>
            <span style={{ position: "absolute", inset: 0, width: `${konum.oran * 100}%`, background: info.color, borderRadius: RAD.chip }} />
            <span style={{ position: "absolute", top: -3, left: `${konum.oran * 100}%`, width: 12, height: 12, borderRadius: "50%", background: info.color, border: `2px solid ${PAL.surf}`, transform: "translateX(-50%)", boxShadow: SH.card }} />
          </div>
          <div aria-hidden="true" style={{ marginTop: SP.xs, display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3 }}>
            <span>başvuru <span style={{ fontFamily: MONO, ...TNUM }}>{sla.baslangic}</span></span>
            <span>son tarih <span style={{ fontFamily: MONO, ...TNUM, color: dc }}>{sla.son_tarih}</span></span>
          </div>
        </div>
      )}
      <div style={{ marginTop: SP.m, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: `${SP.s}px ${SP.l}px` }}>
        {sla?.baslangic && <span><span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Başlangıç</span><span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.ink2, ...TNUM }}>{sla.baslangic}</span></span>}
        {sla?.sure && <span><span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Yasal süre</span><span style={{ ...TYPE.data, color: PAL.ink2, ...TNUM }}>{sla.sure}</span></span>}
        {sla?.son_tarih && <span><span style={{ display: "block", ...TYPE.meta, color: PAL.mut3 }}>Cevap son tarihi</span><span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "18px", fontWeight: 500, color: dc, ...TNUM }}>{sla.son_tarih}</span></span>}
      </div>
      {sla?.mevzuat && sla.mevzuat !== "—" && <div style={{ marginTop: SP.s, ...TYPE.meta, color: PAL.mut3 }}><span style={{ color: PAL.mut2 }}>Dayanak:</span> {cleanDemoText(String(sla.mevzuat))}</div>}
    </div>
  );
}

/* Kopyalanabilir mono kimlik çipi (Stripe kimlik deseni) — tık → panoya tam değer,
   1.4sn "kopyalandı" durumu. Renk tek sinyal değil: metin de değişir. */
export function CopyChip({ deger, kisa, label }) {
  const [ok, setOk] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const kopyala = () => {
    navigator.clipboard?.writeText(String(deger)).catch(() => {});
    setOk(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOk(false), 1400);
  };
  return (
    <button type="button" onClick={kopyala} aria-label={label || "Değeri panoya kopyala"} title={ok ? "Kopyalandı" : "Panoya kopyala"} {...focusRing}
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf2; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: ok ? DERIN.yesil : PAL.mut2, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "2px 8px", transition: "background .12s ease-out", ...TNUM }}>
      {ok ? <Icon.check width={11} height={11} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
      {ok ? "kopyalandı" : kisa}
    </button>
  );
}

/* Denetim izi zinciri — BAĞLI BLOKLAR: her halka bir mini blok (adım + kopyalanabilir hash),
   halkalar bağ okuyla zincirlenir, uçta bütünlük kilidi. "Her halka öncekini mühürler"
   blok-zincir diliyle görünür kanıta dönüşür. Uzun zincir kendi rayında yatay kayar. */
export function ZincirStepper({ zincir, kokHash, butunluk }) {
  // Backend `denetim_izi` düz dict (Pydantic iç doğrulaması yok) → bozuk halka render'ı düşürmesin.
  const halkalar = (zincir || []).filter((h) => h && typeof h === "object");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto", paddingBottom: SP.s }}>
        {halkalar.map((h, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ minWidth: 118, background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "8px 10px" }}>
              <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.ink2, marginBottom: 4, maxWidth: 132, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cleanDemoText(String(h.adim || `adım ${i + 1}`)).replace(/_/g, " ")}
              </div>
              {h.hash
                ? <CopyChip deger={h.hash} kisa={`${String(h.hash).slice(0, 8)}…`} label={`${h.adim || "adım"} hash değerini kopyala`} />
                : <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3 }}>—</span>}
            </div>
            <span aria-hidden="true" style={{ display: "flex", padding: "0 4px", color: PAL.mut3 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </div>
        ))}
        {/* Zincir ucu — bütünlük kilidi */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: SP.s, background: ALFA(butunluk ? BANT.yesil.c : BANT.kirmizi.c), border: `1px solid ${butunluk ? BANT.yesil.c : BANT.kirmizi.c}`, borderRadius: RAD.card, padding: "8px 12px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke={butunluk ? DERIN.yesil : DERIN.kirmizi} strokeWidth="1.7" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={butunluk ? DERIN.yesil : DERIN.kirmizi} strokeWidth="1.7" /></svg>
          <span style={{ ...TYPE.meta, fontWeight: 600, color: butunluk ? DERIN.yesil : DERIN.kirmizi, whiteSpace: "nowrap" }}>
            {butunluk ? "Bütünlük doğrulandı" : "Doğrulanamadı"}
          </span>
        </div>
      </div>
      {kokHash && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginTop: SP.s, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Kök hash</span>
          <CopyChip deger={kokHash} kisa={`${String(kokHash).slice(0, 16)}…`} label="Kök hash değerini panoya kopyala" />
          <span style={{ ...TYPE.meta, color: PAL.mut3 }}>— her halka bir önceki halkanın hash'ini mühürler; tek karakter değişse zincir kopar.</span>
        </div>
      )}
    </div>
  );
}

/* ——— Kanıt alıntısı ———
   Bilgi unsuru satırının üzerine gelince (veya klavye odağında) kaynak belgedeki kanıt
   pasajı vurgulu mini popover'da açılır — "çıkarım uydurma değil, işte yeri" kanıtı. */
export function KanitAlinti({ span, metin, children }) {
  const [acik, setAcik] = useState(false);
  if (!span || !metin) return children;
  const bas = Math.max(0, (span.start | 0) - 90);
  const son = Math.min(metin.length, (span.end | 0) + 90);
  return (
    <span style={{ position: "relative", display: "block" }} tabIndex={0}
      onMouseEnter={() => setAcik(true)} onMouseLeave={() => setAcik(false)}
      onFocus={() => setAcik(true)} onBlur={() => setAcik(false)}
      onKeyDown={(e) => { if (e.key === "Escape") setAcik(false); }}>
      {children}
      {acik && (
        <span role="tooltip" style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, width: "min(340px, 82vw)", zIndex: 70, display: "block", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.pop, padding: "10px 12px", animation: "nu-rise .14s ease-out both" }}>
          <span style={{ display: "block", ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: 4 }}>Kaynak belgeden kanıt</span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 12, lineHeight: 1.7, color: PAL.mut, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {bas > 0 ? "…" : ""}{metin.slice(bas, span.start | 0)}
            <mark style={{ background: ALFA(BANT.sari.c), color: DERIN.sari, borderRadius: RAD.chip, padding: "0 2px" }}>{metin.slice(span.start | 0, span.end | 0)}</mark>
            {metin.slice(span.end | 0, son)}{son < metin.length ? "…" : ""}
          </span>
        </span>
      )}
    </span>
  );
}

/* 2646 düzeltme önerisi — mevcut taslakla satır-diff (jsdiff): memur NEYİN değiştiğini görür.
   Renk tek sinyal değil (+/− önekleri); eski taslak yoksa düz metin fallback'i. */
export function DuzeltmeDiff({ eski, yeni }) {
  const satirStil = { fontFamily: MONO, fontSize: 12, lineHeight: "18px", whiteSpace: "pre-wrap", wordBreak: "break-word" };
  // downloading vb. üst-state değişimlerinde tam metin diff'i yeniden hesaplanmasın.
  const parcalar = useMemo(() => (eski ? diffLines(eski, yeni) : []), [eski, yeni]);
  if (!eski) {
    return <pre style={{ margin: 0, padding: SP.m, ...satirStil, color: PAL.ink2, maxHeight: 480, overflow: "auto", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>{yeni}</pre>;
  }
  return (
    <div aria-label="Önerilen düzeltme farkı — eklenen satırlar artı, çıkarılan satırlar eksi işaretli"
      style={{ maxHeight: 480, overflow: "auto", padding: "8px 0", background: PAL.surf2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card }}>
      {parcalar.map((p, i) => {
        const renk = p.added ? DERIN.yesil : p.removed ? DERIN.kirmizi : PAL.ink2;
        const bg = p.added ? ALFA(BANT.yesil.c) : p.removed ? ALFA(BANT.kirmizi.c) : "transparent";
        const onek = p.added ? "+" : p.removed ? "−" : " ";
        return p.value.replace(/\n$/, "").split("\n").map((satir, j) => (
          <div key={`${i}-${j}`} style={{ display: "flex", gap: SP.s, padding: "1px 12px", background: bg }}>
            <span aria-hidden="true" style={{ ...satirStil, color: renk, flexShrink: 0, width: 10, textAlign: "center" }}>{onek}</span>
            <span style={{ ...satirStil, color: renk, minWidth: 0, ...(p.removed ? { textDecoration: "line-through", textDecorationColor: PAL.lineHi } : null) }}>{satir || " "}</span>
          </div>
        ));
      })}
    </div>
  );
}

/* Kalite kapısı satırı (CI-check deseni) — geçti/uyarı ikonu + kapı adı + sonuç değeri. */
export function Vrow({ ok, label, val }) {
  const c = ok ? DERIN.yesil : DERIN.sari;
  const Ic = ok ? Icon.check : Icon.alert;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.ink2 }}>
        <span aria-hidden="true" style={{ display: "flex", flex: "none", color: c }}><Ic /></span>
        {label}
      </span>
      <span style={{ ...TYPE.data, fontWeight: 500, color: c, flex: "none", ...TNUM }}>{val}</span>
    </div>
  );
}

/* Resmî yazı kâğıt önizlemesi — belge, arayüz kartı değil "evrak" gibi durur: dar sayfa,
   bol iç boşluk, üstte dosya şeridi. Uzun metin kapalı başlar (kademeli açılım) — fade/gradyan
   YASAK (MASTER), sert kesim + "tamamını gör" düğmesi. */
export function PaperSheet({ metin, dosyaAdi, formatOk }) {
  const [acik, setAcik] = useState(false);
  const temiz = cleanDemoText(metin);
  const satirSayi = temiz.split("\n").length;
  const uzun = satirSayi > 16;
  return (
    <div style={{ margin: "0 0 16px", borderRadius: RAD.card, overflow: "hidden", background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderBottom: `1px solid ${PAL.line}` }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h9l5 5v13H5z" stroke={DERIN.V} strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 3v5h5" stroke={DERIN.V} strokeWidth="1.6" /></svg>
        <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{dosyaAdi}</span>
        {formatOk && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c), borderRadius: RAD.chip, padding: "2px 8px" }}><Icon.check width={12} height={12} /> Yön. 2646 uyumlu</span>}
      </div>
      <div style={{ padding: "24px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "32px 48px" }}>
          <div style={{ ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", ...(acik || !uzun ? null : { maxHeight: 320, overflow: "hidden" }) }}>{temiz}</div>
          {uzun && (
            <div style={{ marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}`, display: "flex", justifyContent: "center" }}>
              <button type="button" onClick={() => setAcik((v) => !v)} {...focusRing}
                onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                style={{ cursor: "pointer", padding: "6px 12px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.meta, fontWeight: 500, color: DERIN.T, transition: "background .12s ease-out", ...TNUM }}>
                {acik ? "Daralt" : `Tamamını gör (+${satirSayi - 12} satır)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Bilgilendirme — yapısal işlem sonucu bildirimi ----------
   Backend finalize node'unun `bilgilendirme_yapisal` çıktısını render eder. Desen
   araştırma-temelli (docs/arastirma bildirim-normlari): GOV.UK service-manual 3'lü
   bildirim yapısı (ne oldu → sırada ne var → ne yapılmalı) + confirmation-pages
   (süreç açık mı, açık tarihli süre) + NN/g system-status (durum görünür, sonraki
   eylem net) + 3071 m.7 / 4982 m.12 gerekçe-itiraz zorunluları (notlar bölümü). */

/* Bölüm ayracı — kart içinde kart yasak (MASTER): hairline üst çizgi + meta etiket. */
function BilgiBolum({ t, children }) {
  return (
    <div style={{ marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
      {t && <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: SP.s }}>{t}</div>}
      {children}
    </div>
  );
}

export function BilgilendirmeYapisal({ y }) {
  const eksikMi = y.durum === "eksik";
  // Yalnız bilinen durumlar renk alır; sözleşmeye eklenecek 3. durum nötr'e düşer (güvenli büyüme).
  const durumRenk = eksikMi ? BANT.sari.c : y.durum === "hazir" ? BANT.yesil.c : PAL.mut;
  const durumEtiket = y.durum_etiket || (eksikMi ? "Eksik bilgi bekleniyor" : "Evrak işleme hazır");
  const sureRenk = subSlaRenk(y.sure?.durum);
  // Şema bare-dict (schemas.py) → hiçbir alanın şekline güvenme: dizi + eleman guard'ları.
  const sirada = (Array.isArray(y.sirada) ? y.sirada : []).filter((a) => a && typeof a === "object");
  const maddeler = Array.isArray(y.yapilacak?.maddeler) ? y.yapilacak.maddeler : [];
  const notlar = Array.isArray(y.notlar) ? y.notlar : [];
  return (
    <div>
      {/* Durum — renk tek sinyal değil: ikon + metin (a11y). Satırda tek semantik çip. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <Chip c={durumRenk} label={`İşlem durumu: ${durumEtiket}`}>
          {eksikMi ? <Icon.alert width={12} height={12} /> : <Icon.check width={12} height={12} />}
          {durumEtiket}
        </Chip>
        {y.ne_oldu_kaynak === "llm" && <span style={{ ...TYPE.meta, color: PAL.mut3 }}>anlatı: yapay zekâ · iskelet: kural tabanlı</span>}
      </div>

      {/* Ne oldu — tek paragraf anlatı (gerekçe/dayanak cümle içinde görünür). */}
      <p style={{ margin: 0, ...TYPE.read, color: PAL.ink2 }}>{cleanDemoText(String(y.ne_oldu || ""))}</p>

      {/* Sırada ne var — tamamlanan + bekleyen adımlar; yasal son tarih adım detayında,
          gecikme/kritiklik AA renkle vurgulanır (belirsiz "yakında" yok, açık tarih var). */}
      {sirada.length > 0 && (
        <BilgiBolum t="Sırada ne var">
          {/* role=list: WebKit, list-style:none'da liste semantiğini düşürür (VoiceOver). */}
          <ol role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {sirada.map((a, i) => {
              const tamam = a.durum === "tamam";
              // Gecikme vurgusu backend'in AÇIK `sureli` bayrağına bağlı (metin sözleşmesi değil).
              const sureli = sureRenk && a.sureli;
              return (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "5px 0" }}>
                  <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, marginTop: 2, color: tamam ? DERIN.yesil : PAL.mut3 }}>
                    {tamam ? <Icon.check width={13} height={13} /> : <Icon.clock width={13} height={13} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...TYPE.data, color: tamam ? PAL.mut2 : PAL.ink2, fontWeight: tamam ? 400 : 500 }}>{cleanDemoText(String(a.adim))}</span>
                    {a.detay && (
                      <span style={{ display: "block", ...TYPE.meta, color: sureli ? DERIN_OF(sureRenk) : PAL.mut3, fontWeight: sureli ? 500 : 400, ...TNUM }}>
                        {cleanDemoText(String(a.detay))}
                      </span>
                    )}
                  </span>
                  <span style={SR_ONLY}>{tamam ? "(tamamlandı)" : "(bekliyor)"}</span>
                </li>
              );
            })}
          </ol>
        </BilgiBolum>
      )}

      {/* Ne yapılmalı — eksik maddeler + eylemsizliğin sonucu (tek birincil istek). */}
      {maddeler.length > 0 && (
        <BilgiBolum t={`Evrakın işleme alınabilmesi için tamamlanması gerekenler (${maddeler.length})`}>
          {maddeler.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "3px 0", ...TYPE.data, color: DERIN.sari }}>
              <Icon.alert width={13} height={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{cleanDemoText(String(m))}</span>
            </div>
          ))}
          {y.yapilacak?.sonuc && <div style={{ marginTop: SP.s, ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{cleanDemoText(String(y.yapilacak.sonuc))}</div>}
        </BilgiBolum>
      )}

      {/* Mevzuat hatırlatmaları — koşullu, doğrulanmış dayanak (4982 m.12-13 / 3071 m.7). */}
      {notlar.length > 0 && (
        <BilgiBolum>
          {notlar.map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
              <Icon.scale width={13} height={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{cleanDemoText(String(n))}</span>
            </div>
          ))}
        </BilgiBolum>
      )}
    </div>
  );
}

/* ---------- Yönetmelik-2646 lint — durum-gruplu, iki-seviye açılır denetim ----------
   Desen araştırma-temelli (docs/arastirma lint-ux): satır anatomisi = kimlik + durum +
   mesaj + NEDEN (yönetmelik lafzı, korpustan) + NASIL düzeltilir (Lighthouse/axe/ESLint
   "why + how to fix"); gruplama duruma göre (uyarı üstte, geçti tek özet satırda —
   Lighthouse "Passed audits" deseni); açılır katman TAM İKİ SEVİYE (NN/g progressive
   disclosure: daha derini kullanıcıyı kaybettirir). Renk hiç tek sinyal değil. */

const LINT_RENK = { gecti: DERIN.yesil, uyari: DERIN.sari, bilgi: PAL.mut2 };
const LINT_IKON = { gecti: Icon.check, uyari: Icon.alert, bilgi: Icon.info };

/* Aşağı/yukarı ok — açılır satır göstergesi (chevron). */
const LintOk = ({ acik }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    style={{ flexShrink: 0, transform: acik ? "rotate(180deg)" : "none", transition: "transform .12s ease-out" }}>
    <path d="M6 9 L12 15 L18 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Tek kural satırı: kapalı = ikon + madde + mesaj; açık (+1 seviye) = lafız + düzeltme.
   a11y: buton adı = görünür içerik (madde + mesaj) — aria-label ile EZİLMEZ (bulgu metni
   ekran okuyucuda kaybolur, WCAG 2.5.3); durum aria-expanded + aria-controls ile. */
function LintSatiri({ k }) {
  const [acik, setAcik] = useState(false);
  const detayId = useId();
  const renk = LINT_RENK[k.durum] || PAL.mut2;
  const Isaret = LINT_IKON[k.durum] || Icon.info;
  const detayVar = !!(k.dayanak || k.oneri);
  const icerik = (
    <>
      <span aria-hidden="true" style={{ display: "flex", flex: "none", marginTop: 1, color: renk }}><Isaret width={14} height={14} /></span>
      <span style={{ flex: "none", fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: DERIN.V, marginTop: 1 }}>{String(k.madde ?? "")}</span>
      <span style={{ ...TYPE.data, color: k.durum === "uyari" ? DERIN.sari : PAL.ink2, textAlign: "left" }}>{cleanDemoText(String(k.mesaj ?? ""))}</span>
      {detayVar && <span style={{ marginLeft: "auto", color: PAL.mut3, display: "flex", alignItems: "center" }}><LintOk acik={acik} /></span>}
    </>
  );
  if (!detayVar) {
    return <div style={{ display: "flex", alignItems: "flex-start", gap: SP.s, padding: "4px 0" }}>{icerik}</div>;
  }
  return (
    <div>
      <button type="button" onClick={() => setAcik((v) => !v)} aria-expanded={acik}
        aria-controls={acik ? detayId : undefined}
        {...focusRing}
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: SP.s, padding: "4px 6px", margin: "0 -6px", width: "calc(100% + 12px)", background: "transparent", border: "none", borderRadius: RAD.ctl, transition: "background .12s ease-out" }}>
        {icerik}
        <span style={SR_ONLY}>— yönetmelik lafzı ve düzeltme önerisi</span>
      </button>
      {acik && (
        <div id={detayId} style={{ margin: `2px 0 ${SP.s}px 22px` }}>
          {k.dayanak && (
            <div style={{ borderLeft: `2px solid ${PAL.lineHi}`, paddingLeft: SP.m, ...TYPE.meta, color: PAL.mut2 }}>
              <span style={{ color: PAL.mut3, fontWeight: 500 }}>Yönetmelik lafzı: </span>
              {cleanDemoText(String(k.dayanak))}
            </div>
          )}
          {k.oneri && (
            <div style={{ marginTop: SP.xs, ...TYPE.meta, color: DERIN.T }}>
              <span style={{ fontWeight: 500 }}>Nasıl düzeltilir: </span>{cleanDemoText(String(k.oneri))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Bozuk öğede anahtar çakışması (key=undefined) satır state'ini karıştırmasın. */
const lintAnahtar = (k, i, onek) => k.kural || `${k.madde ?? "?"}-${onek}${i}`;

/* Uyumluluk ölçeri lejant noktası — renk TEK sinyal değil (a11y): nokta + etiket + sayı. */
function LintNokta({ renk, etiket }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: renk, flexShrink: 0 }} />
      {etiket}
    </span>
  );
}

/* Uyumluluk ölçeri — Lighthouse/CI 'audit score' deseni: segmentli çubuk (geçti yeşil ·
   bilgi nötr · uyarı sarı, sayıya orantılı) + üstte 'karşılanan/toplam' + kesin-ihlal
   durumu, altta erişilebilir lejant. Çubuk role=img + özet aria-label; MASTER disiplini
   (hairline zemin, gradyan/glow yok, semantik renk). */
function LintOlcer({ gecti, bilgi, uyari }) {
  const toplam = gecti + bilgi + uyari;
  if (!toplam) return null;
  const seg = [
    { n: gecti, c: BANT.yesil.c }, { n: bilgi, c: PAL.mut3 }, { n: uyari, c: BANT.sari.c },
  ].filter((s) => s.n > 0);
  return (
    <div style={{ marginBottom: SP.s }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SP.s, marginBottom: 6 }}>
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink }}>{gecti}/{toplam} kural karşılandı</span>
        <span style={{ ...TYPE.meta, color: uyari ? DERIN.sari : DERIN.yesil, fontWeight: 500, flexShrink: 0 }}>
          {uyari ? `${uyari} uyarı` : "kesin ihlal yok"}
        </span>
      </div>
      <div role="img"
        aria-label={`Yönetmelik 2646 denetimi: ${toplam} kuraldan ${gecti} karşılandı, ${bilgi} bilgi notu, ${uyari} uyarı.`}
        style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: PAL.line, gap: 1.5 }}>
        {seg.map((s, i) => <div key={i} style={{ flex: s.n, background: s.c }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.m, marginTop: 6, ...TYPE.meta, color: PAL.mut2 }}>
        <LintNokta renk={BANT.yesil.c} etiket={`${gecti} geçti`} />
        {bilgi > 0 && <LintNokta renk={PAL.mut3} etiket={`${bilgi} bilgi notu`} />}
        {uyari > 0 && <LintNokta renk={BANT.sari.c} etiket={`${uyari} uyarı`} />}
      </div>
    </div>
  );
}

export function Lint2646Karti({ lint, giris }) {
  // Gruplama saf mantıkta (lintGrupla — test edilir); bilinmeyen durum diger'e düşer,
  // sessiz kaybolmaz (kart etiketi kural sayısıyla tutarlı kalır).
  const { uyari, bilgi, gecti, diger, varsayilanAcik } = lintGrupla(lint?.kurallar);
  // Her şey geçtiyse özet satırı varsayılan AÇIK (boş görünen kart yerine yeşil liste);
  // bulgu varsa daraltılır — memur önce kırığı görür (Lighthouse deseni). Kullanıcı
  // dokunana kadar VERİDEN türetilir (in-place result güncellemesinde ters kalmaz).
  const [gectiSecim, setGectiSecim] = useState(null);
  const gectiAcik = gectiSecim ?? varsayilanAcik;
  const bulgu = uyari.length + bilgi.length + diger.length;
  return (
    <div>
      {/* Görsel uyumluluk ölçeri (bar + lejant) — eski düz-metin 'giris' özetinin yerini alır. */}
      <LintOlcer gecti={gecti.length} bilgi={bilgi.length} uyari={uyari.length + diger.length} />
      {giris && <p style={{ margin: "0 0 8px", ...TYPE.meta, color: PAL.mut2 }}>{giris}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
        {uyari.map((k, i) => <LintSatiri key={lintAnahtar(k, i, "u")} k={k} />)}
        {bilgi.map((k, i) => <LintSatiri key={lintAnahtar(k, i, "b")} k={k} />)}
        {diger.map((k, i) => <LintSatiri key={lintAnahtar(k, i, "d")} k={k} />)}
        {gecti.length > 0 && (
          <div style={bulgu ? { marginTop: SP.xs, paddingTop: SP.s, borderTop: `1px solid ${PAL.line}` } : null}>
            <button type="button" onClick={() => setGectiSecim(!gectiAcik)} aria-expanded={gectiAcik}
              {...focusRing}
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, padding: "4px 6px", margin: "0 -6px", width: "calc(100% + 12px)", background: "transparent", border: "none", borderRadius: RAD.ctl, transition: "background .12s ease-out" }}>
              <span aria-hidden="true" style={{ display: "flex", flex: "none", color: DERIN.yesil }}><Icon.check width={14} height={14} /></span>
              <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2 }}>{gecti.length} kural geçti</span>
              <span style={{ marginLeft: "auto", color: PAL.mut3, display: "flex", alignItems: "center" }}><LintOk acik={gectiAcik} /></span>
            </button>
            {gectiAcik && (
              <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginTop: SP.xs }}>
                {gecti.map((k, i) => <LintSatiri key={lintAnahtar(k, i, "g")} k={k} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
