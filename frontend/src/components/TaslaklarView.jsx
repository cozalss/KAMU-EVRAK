/* TaslaklarView — KARAR BEKLEYEN taslakların çalışma kuyruğu: MASTER-DETAIL TRİYAJ
   (Linear triage / posta istemcisi deseni — 2026-07-17 yeniden tasarım). Solda dar kuyruk
   listesi (satır = konu + meta, eylem YOK), sağda sabit karar paneli (büyük önizleme +
   eylem çubuğu). Gerekçe: eski 420px kart grid'i 61 taslak × 4 buton = ~244 eş-vurgulu
   hedefti; triyajda bilişsel yükü düşüren şey tek seferde TEK karar + kalıcı önizlemedir.
   Kurgu ayrımı: işlenen arşivi IslenenEvrakView (sicil defteri), gönderilmiş GidenEvrakView.
   Düzenleme yüzeyi TEK kalır: A4 kâğıt modalı (BelgeModal); kurul = KurulModal. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, Btn, EmptyState, Icon, MONO, SANS, T, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, focusRing } from "./neonUi.jsx";
import BelgeModal from "./BelgeModal.jsx";
import { KurulModal } from "./MuzakereKurulu.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";

/* Düzenlenen metni DOĞRUDAN DOCX indir (pipeline yok → /yazi/render). Gövde olduğu gibi. */
async function docxIndir(text, name, onToast) {
  if (!text.trim()) return;
  let url = "";
  try {
    const res = await fetch("/yazi/render?format=docx", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title: name || "Resmî Yazı Taslağı" }),
    });
    if (!res.ok) throw new Error(`İndirilemedi (${res.status})`);
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(name || "taslak").replace(/[^\w.-]+/g, "_")}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    onToast?.("Taslak DOCX olarak indirildi.");
  } catch (e) {
    onToast?.(e?.message || "İndirme tamamlanamadı. Lütfen tekrar deneyin.");
  } finally {
    if (url) { const u = url; setTimeout(() => URL.revokeObjectURL(u), 1500); }
  }
}

/* Kuyruk varsayılanı EN YENİ ÖNCE — memurun az önce kuyruğa aldığı taslak listenin başında
   görünsün (İşlenen→Düzenle akışı; kullanıcı isteği 2026-07-17). SLA/kuyruk adaleti için
   "En eski önce" seçenekte durur. */
const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Taslak adı…" },
  select: [
    { id: "evrak_turu", label: "Evrak türü", options: [] },
    { id: "hedef_birim", label: "Hedef birim", options: [] },
  ],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni önce" }, { value: "ts_asc", label: "En eski önce" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name", "konu"], evrak_turu: "evrak_turu", hedef_birim: "hedef_birim", dateField: "ts" },
};

const KALEM = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z M14 6l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const COP = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* Yalnız SARI/KIRMIZI görünür sinyal taşır (yeşil = sessiz varsayılan; renk enflasyonu yok).
   Metin + renk birlikte — renk tek sinyal değil. */
const RISK_UYARI = { sari: "Orta risk", kirmizi: "Yüksek risk" };
const bantOf = (h) => h.bant || h.result?.risk_metadata?.bant || "";

/* Taslak metninden KONU + gövdenin ilk anlamlı paragrafını çıkar — önizleme her taslakta
   aynı olan resmî başlık kalıbını ("T.C. / KAMU KURUMU / Sayı…") tekrarlamasın. */
function taslakOzeti(md) {
  const temiz = cleanDemoText(md) || "";
  let konu = temiz.match(/^\s*Konu\s*:\s*(.+)$/m)?.[1]?.trim() || "";
  if (konu) konu = konu.charAt(0).toLocaleUpperCase("tr-TR") + konu.slice(1);   // başlık zarafeti
  const satirlar = temiz.split("\n");
  const konuIdx = satirlar.findIndex((s) => /^\s*Konu\s*:/.test(s));
  let govde = "";
  for (let k = konuIdx + 1; k < satirlar.length; k++) {
    const s = satirlar[k].trim();
    if (!s || /^(Sayın|Sayı\s*:|İlgi\s*:)/.test(s)) continue;   // hitap/künye satırlarını geç
    govde = satirlar.slice(k).join("\n").trim();
    break;
  }
  return { konu, govde: govde || temiz };
}

/* Sakin metin-düğme — panel eylem çubuğundaki ikincil/yıkıcı eylemler. */
function MetinEylem({ onClick, renk = DERIN.T, ariaLabel, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "8px 10px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: renk, opacity: disabled ? 0.55 : 1, transition: "background .12s ease-out, transform .14s var(--ke-ease-out)" }}>
      {children}
    </button>
  );
}

const selectStil = { padding: "6px 10px", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink2, ...TYPE.data, cursor: "pointer" };

/* Kompakt tek-satır araç çubuğu — Gelen Evrak'ın kalıcı FilterBar panelinden bilinçli
   ayrışma (o panel Gelen'in dili; kuyruk dikey alanı listeye bırakır). Arama kutusu Mevzuat
   sayfasıyla AYNI dilde (ikon + "/" odak kısayolu, 2026-07-23) — uygulama genelinde tek bir
   "arama" hissi. */
function AracCubugu({ filter, turSecenek, birimSecenek }) {
  const f = filter.filters;
  const aramaRef = useRef(null);
  const [aramaOdakta, setAramaOdakta] = useState(false);
  useEffect(() => {
    const dinle = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      e.preventDefault();
      aramaRef.current?.focus();
    };
    document.addEventListener("keydown", dinle);
    return () => document.removeEventListener("keydown", dinle);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: SP.l }}>
      <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 300 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", color: PAL.mut3, pointerEvents: "none" }}><Icon.search /></span>
        <input ref={aramaRef} type="search" value={f.search} onChange={(e) => filter.setSearch(e.target.value)}
          placeholder="Taslak adı, konu…" aria-label="Taslaklarda ara"
          onFocus={(e) => { focusRing.onFocus(e); setAramaOdakta(true); }}
          onBlur={(e) => { focusRing.onBlur(e); setAramaOdakta(false); }}
          style={{ width: "100%", padding: "6px 12px 6px 34px", borderRadius: RAD.ctl,
            border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink, ...TYPE.data }} />
        {!f.search && !aramaOdakta && (
          <span aria-hidden="true" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", ...TYPE.meta, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 6px", background: PAL.surfHi, pointerEvents: "none" }}>/</span>
        )}
      </div>
      <select value={f.select.evrak_turu} onChange={(e) => filter.setSelect("evrak_turu", e.target.value)} aria-label="Evrak türü" {...focusRing} style={selectStil}>
        <option value="">Tüm türler</option>
        {turSecenek.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={f.select.hedef_birim} onChange={(e) => filter.setSelect("hedef_birim", e.target.value)} aria-label="Hedef birim" {...focusRing} style={selectStil}>
        <option value="">Tüm birimler</option>
        {birimSecenek.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={f.sortBy} onChange={(e) => filter.setSortBy(e.target.value)} aria-label="Sıralama" {...focusRing} style={selectStil}>
        {BASE_CONFIG.sort.options.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {filter.hasActiveFilters && (
        <button type="button" onClick={filter.clearAll} {...focusRing} data-press=""
          style={{ cursor: "pointer", padding: "5px 10px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: DERIN.T, transition: "transform .14s var(--ke-ease-out)" }}>
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}

/* Kuyruk satırı — kart DEĞİL: iki satırlık seçilebilir öğe (konu + meta), eylemsiz.
   Seçili: sol 2px T şeridi + press zemini + 600 başlık (renk tek sinyal olmasın). Ekrandaki
   demo taslaklar sık sık aynı önekle başlayıp kırpılıyor ("4982 sayılı ... kapsam…" ekran
   görüntüsünde 6 kez) — title tooltip'i tam metni hover'da verir (MevzuatView künye kırpması
   ile aynı çözüm); data-press diğer seçim kutucuklarıyla aynı dokunma dili. */
function KuyrukSatiri({ h, konu, secili, onSec, onAc, optId, ilk }) {
  const bant = bantOf(h);
  const uyari = RISK_UYARI[bant];
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const baslik = konu || h.name;
  const meta = `${YAZI_TR(h.result?.yazi_turu) || "Taslak"} · ${BIRIM_GOSTER(h.result?.hedef_birim || h.hedef_birim, h.result?.evrak_turu || h.evrak_turu)}`;
  return (
    <div role="option" id={optId} aria-selected={secili} onClick={onSec} onDoubleClick={onAc} data-press=""
      style={{ cursor: "pointer", padding: "10px 12px 10px 10px", borderLeft: `2px solid ${secili ? T : "transparent"}`,
        borderTop: ilk ? "none" : `1px solid ${PAL.line}`, background: secili ? PAL.press : "transparent", transition: `background .12s ease-out, transform .14s ${EASE.out}` }}
      onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = secili ? PAL.press : "transparent"; }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
        <span title={baslik} style={{ ...TYPE.ui, fontWeight: secili ? 600 : 500, color: PAL.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {baslik}
        </span>
        {tarih && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, ...TNUM, flexShrink: 0 }}>{tarih}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.xs, marginTop: 2, minWidth: 0 }}>
        <span title={meta} style={{ ...TYPE.meta, color: PAL.mut, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta}
        </span>
        {uyari && <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(BANT[bant].c), flexShrink: 0 }}>· {uyari}</span>}
      </div>
    </div>
  );
}

/* Karar paneli — seçili taslağın kalıcı önizlemesi + eylem çubuğu. Eylemlerin TEK evi
   (Retool action-bar deseni): Gönder = ekranın tek primary'si; Sil = çıplak kırmızı metin,
   en solda, arada boşluk (yanlış-tıklama sigortası). Önizleme TYPE.read — okuma metni
   okuma kademesini hak eder. */
function KararPaneli({ h, konu, govde, genis, sendBusy, onDuzenle, onKurul, onGonder, onSil }) {
  const [confirmDel, setConfirmDel] = useState(false);
  // Gönder de onaylı (confirmDel ikizi): resmî yazı GİDEN EVRAK'a kalıcı yazılır — tek yanlış
  // tık geri alınamaz kayıt üretmesin; "Gönder" önce onay ister, gönderim onayla başlar.
  const [confirmSend, setConfirmSend] = useState(false);
  const bant = bantOf(h);
  const uyari = RISK_UYARI[bant];
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const r = h.result || {};
  // key={secili.id} remount zaten sıfırlar — bu effect, key kalkarsa emniyet kemeri.
  useEffect(() => { setConfirmDel(false); setConfirmSend(false); }, [h.id]);
  return (
    <section aria-label="Karar paneli"
      style={{ position: genis ? "sticky" : "static", top: SP.xl, display: "flex", flexDirection: "column", minWidth: 0,
        maxHeight: genis ? `calc(100vh - ${SP.xl * 2}px)` : "none", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden" }}>
      <header style={{ padding: `${SP.l}px ${SP.xl}px ${SP.m}px`, borderBottom: `1px solid ${PAL.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.m }}>
          <h3 style={{ margin: 0, ...TYPE.h2, color: PAL.ink, flex: 1, minWidth: 0 }}>{konu || h.name}</h3>
          {uyari && (
            <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(BANT[bant].c), ...TYPE.meta, fontWeight: 500, color: DERIN_OF(BANT[bant].c) }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: BANT[bant].c }} />
              {uyari}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", marginTop: SP.xs }}>
          <span style={{ fontFamily: SANS, fontSize: 12, color: PAL.mut3 }}>{h.name}</span>
          {tarih && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, ...TNUM }}>{tarih}</span>}
          <span style={{ ...TYPE.meta, color: PAL.mut, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {EVRAK_TR(r.evrak_turu)} · {BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)}{r.yazi_turu ? ` · ${YAZI_TR(r.yazi_turu)}` : ""}
          </span>
        </div>
      </header>
      {/* Kâğıt önizleme — resmî başlık kalıbı atlanır; tıkla → A4 düzenleme (BelgeModal). */}
      <div role="button" tabIndex={0} title="Düzenle (A4 görünüm)" {...focusRing}
        onClick={onDuzenle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDuzenle(); } }}
        style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: `${SP.l}px ${SP.xl}px`, background: PAL.surf2, cursor: "zoom-in" }}>
        <span style={{ display: "block", ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-line", wordBreak: "break-word", maxWidth: 680 }}>
          {govde}
        </span>
      </div>
      <footer style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.m}px ${SP.xl}px`, borderTop: `1px solid ${PAL.line}`, flexShrink: 0, flexWrap: "wrap" }}>
        {confirmDel ? (
          <>
            <span style={{ ...TYPE.data, color: DERIN.kirmizi, marginRight: "auto" }}>Taslak silinecek. Emin misiniz?</span>
            <MetinEylem onClick={onSil} renk={DERIN.kirmizi} ariaLabel="Silmeyi onayla"><COP /> Evet, sil</MetinEylem>
            <Btn onClick={() => setConfirmDel(false)}>Vazgeç</Btn>
          </>
        ) : confirmSend ? (
          <>
            {/* Gönderim onayı — hedef birim açıkça söylenir; onaydan sonra doğrulama kapıları
                (/yazi/dogrula) koşar, başarısızlıkta onay açık kalır (memur tekrar dener). */}
            <span style={{ ...TYPE.data, color: PAL.ink2, marginRight: "auto", minWidth: 0 }}>
              Yazı <strong style={{ fontWeight: 600 }}>{BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)}</strong> birimine gönderilecek ve Giden Evrak'a kalıcı kaydedilecek. Emin misiniz?
            </span>
            <Btn onClick={() => setConfirmSend(false)} disabled={sendBusy}>Vazgeç</Btn>
            <Btn primary onClick={onGonder} disabled={sendBusy} ariaLabel={`${konu || h.name} gönderimini onayla`}>
              {sendBusy ? <><Icon.spin width={14} height={14} /> Gönderiliyor…</> : <><Icon.check width={14} height={14} /> Onayla</>}
            </Btn>
          </>
        ) : (
          <>
            {/* sendBusy TÜM eylemleri kilitler: /yazi/dogrula ağ turu sürerken silme/düzenleme,
                gönderilen kopyayla yarışıp tutarsız DB durumu üretebilirdi (review bulgusu). */}
            <MetinEylem onClick={() => setConfirmDel(true)} disabled={sendBusy} renk={DERIN.kirmizi} ariaLabel={`${konu || h.name} taslağını sil`}><COP /> Sil</MetinEylem>
            <span style={{ flex: 1 }} />
            {/* AI Bürokrasi Kurulu — üç ajan BU taslağı gerçek doğrulama sinyalleriyle tartışır */}
            <Btn onClick={onKurul} disabled={sendBusy} ariaLabel={`${konu || h.name} taslağı için Bürokrasi Kurulu'nu topla`}>
              <Icon.scale width={14} height={14} /> Kurulu topla
            </Btn>
            <Btn onClick={onDuzenle} disabled={sendBusy} ariaLabel={`${konu || h.name} taslağını düzenle`}><KALEM /> Düzenle</Btn>
            <Btn primary onClick={() => setConfirmSend(true)} disabled={sendBusy} ariaLabel={`${konu || h.name} taslağını gönder — önce onay istenir`}>
              <Icon.arrow width={14} height={14} /> Gönder
            </Btn>
          </>
        )}
      </footer>
    </section>
  );
}

/* Geniş ekran eşiği — altında liste + panel alt alta yığılır (iki ayrı desen icat edilmez). */
function useGenisEkran() {
  const [genis, setGenis] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1100px)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 1100px)");
    const onChange = () => setGenis(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return genis;
}

const optIdOf = (id) => `tas-${String(id).replace(/[^\w-]+/g, "_")}`;

export default function TaslaklarView({ drafts = [], onGoInbox, onGoOutbox = null, onUpdate = () => {}, onDelete = () => {}, onSend = () => {}, onRevize = null, onToast = () => {}, hedef = null, onHedefAcildi }) {
  // drafts: yalnız karar bekleyenler (her biri result.yazi_taslak_md taşır; onay_durumu yok).
  const [duzenleId, setDuzenleId] = useState(null);
  const [kurulId, setKurulId] = useState(null);
  // KARŞILIKLI DIŞLAMA: iki modal aynı anda açılamaz — aksi halde BelgeModal'da kaydedilen
  // metnin üstüne, kurulun ESKİ result'tan türettiği uzlaşı yazılabilirdi (stale-write).
  const acDuzenle = (id) => { setKurulId(null); setDuzenleId(id); };
  const acKurul = (id) => { setDuzenleId(null); setKurulId(id); };
  const [seciliId, setSeciliId] = useState(null);
  // Oturum sayacı — kuyruk boşalınca "sakin zafer" ekranını besler (ilerleme = motivasyon).
  const [karar, setKarar] = useState({ gonderildi: 0, silindi: 0 });
  const [sendBusy, setSendBusy] = useState(false);
  const genis = useGenisEkran();
  const [listeRef] = useAutoAnimate();   // karar sonrası satırın kuyruğu terk edişi + FLIP

  // Hedefli geliş: ilgili taslak kuyrukta SEÇİLİR ve görünür kılınır — A4 modalı otomatik
  // AÇILMAZ (kullanıcı bulgusu: "Düzenle" doğrudan kâğıda ışınlıyor, karar paneli atlanıyordu).
  // Açık modal varsa kapatılır ki seçim görünsün; A4'e geçiş memurun tıkında (satıra Enter /
  // önizleme). Her koşulda hedef tüketilir.
  useEffect(() => {
    if (!hedef) return;
    if (drafts.some((d) => d.id === hedef)) {
      setSeciliId(hedef); setKurulId(null); setDuzenleId(null);
      document.getElementById(optIdOf(hedef))?.scrollIntoView({ block: "nearest" });
    }
    onHedefAcildi?.();
  }, [hedef, drafts, onHedefAcildi]);

  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      { ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(drafts, "evrak_turu", EVRAK_TR)] },
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(drafts, "hedef_birim", BIRIM_LBL)] },
    ],
  }), [drafts]);
  // Arama, satırda görünen KONU başlığını da taramalı; özet türetimi tek geçişte saklanır.
  const aramaKaynagi = useMemo(() => drafts.map((d) => {
    const ozet = taslakOzeti(d.result?.yazi_taslak_md);
    return { ...d, konu: ozet.konu, _govde: ozet.govde };
  }), [drafts]);
  const filter = useFilter(aramaKaynagi, config);
  const sonuc = filter.results;

  // Seçim türetilir: seçili id listede yoksa (gönderildi/silindi/filtrelendi) ilk satıra düşer.
  const secili = sonuc.find((d) => d.id === seciliId) || sonuc[0] || null;
  const aktif = drafts.find((d) => d.id === duzenleId) || null;
  const kurulAktif = drafts.find((d) => d.id === kurulId) || null;

  // Karar sonrası otomatik SIRADAKİ: kuyruk momentumu kendini besler (modal açıp kapatma yok).
  const sonrakineGec = (id) => {
    const i = sonuc.findIndex((d) => d.id === id);
    setSeciliId(sonuc[i + 1]?.id ?? sonuc[i - 1]?.id ?? null);
  };

  const gonder = async (h, metin) => {
    if (sendBusy) return false;
    // sendBusy: /yazi/dogrula ağ turu — koruma olmadan çift tıklama iki Giden kaydı açabilir.
    setSendBusy(true);
    try {
      const ok = await onSend(h, metin);
      if (ok) { setKarar((k) => ({ ...k, gonderildi: k.gonderildi + 1 })); sonrakineGec(h.id); }
      return ok;
    } finally { setSendBusy(false); }
  };
  const sil = (h) => {
    onDelete(h.id);
    setKarar((k) => ({ ...k, silindi: k.silindi + 1 }));
    sonrakineGec(h.id);
  };

  // Klavye triyajı: ↑/↓ seçim, Enter = A4 düzenleme (animasyonsuz — klavye eylemi beklemez).
  // sendBusy'de seçim kilitli: panel remount olup başka taslağın üstünde "Gönderiliyor…"
  // göstermesin (review bulgusu).
  const klavye = (e) => {
    if (!sonuc.length || sendBusy) return;
    const i = Math.max(0, sonuc.findIndex((d) => d.id === secili?.id));
    if (e.key === "ArrowDown") { e.preventDefault(); setSeciliId(sonuc[Math.min(sonuc.length - 1, i + 1)].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSeciliId(sonuc[Math.max(0, i - 1)].id); }
    else if (e.key === "Enter" && secili) { e.preventDefault(); acDuzenle(secili.id); }
  };
  useEffect(() => {
    if (!secili) return;
    document.getElementById(optIdOf(secili.id))?.scrollIntoView({ block: "nearest" });
    // Dar ekranda panel listenin ALTINDA — seçim değişince görünür kalsın (blok: nearest,
    // smooth değil; reduced-motion tartışması doğmaz).
    if (!genis) document.querySelector('[aria-label="Karar paneli"]')?.scrollIntoView({ block: "nearest" });
  }, [secili, genis]);

  if (drafts.length === 0) {
    const toplam = karar.gonderildi + karar.silindi;
    // Kuyruk BU oturumda çalışarak boşaltıldıysa: sakin zafer — oturum özeti + Giden'e köprü.
    if (toplam > 0) {
      return (
        <ViewWrap id="taslak-h" title="Taslaklar" sub="Karar kuyruğu boş">
          <EmptyState icon={<span style={{ color: DERIN.yesil, display: "inline-flex" }}><Icon.check width={24} height={24} /></span>}
            title="Tüm taslaklar karara bağlandı"
            sub={`Bu oturumda ${toplam} taslak: ${karar.gonderildi} gönderildi · ${karar.silindi} silindi.`}
            actions={[<Btn key="g" onClick={onGoOutbox || onGoInbox}><Icon.send width={14} height={14} /> {onGoOutbox ? "Giden evrakı aç" : "Gelen evrakı aç"}</Btn>]} />
        </ViewWrap>
      );
    }
    return (
      <ViewWrap id="taslak-h" title="Taslaklar" sub="Üretilen resmî yazı taslakları">
        <EmptyState icon={<Icon.doc />} title="Henüz taslak ayrılmadı"
          sub="İşleniyor görünümündeki onay kartında “Düzenle” seçtiğinizde ya da önceki oturumlardan karar bekleyen bir taslak bulunduğunda, resmî yazı taslağı burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  const oturumEki = karar.gonderildi + karar.silindi > 0 ? ` · bu oturumda ${karar.gonderildi + karar.silindi} karara bağlandı` : "";
  return (
    <ViewWrap id="taslak-h" title="Taslaklar" sub={`${drafts.length} taslak karar bekliyor${oturumEki} · satırı seçin, sağdaki panelde karar verin`}>
      <AracCubugu filter={filter} turSecenek={config.select[0].options.slice(1)} birimSecenek={config.select[1].options.slice(1)} />
      {sonuc.length === 0 ? (
        <EmptyState icon={<Icon.doc />} title="Eşleşen taslak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: genis ? "minmax(300px, 400px) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: SP.l, alignItems: "start" }}>
          {/* Kuyruk listesi — listbox: ↑/↓ gezinme, Enter düzenleme; satırda eylem yok
              (eylemler panelde — Hick yasası: 244 hedef → 4 hedef). */}
          <div ref={listeRef} role="listbox" aria-label="Taslak kuyruğu" tabIndex={0} onKeyDown={klavye}
            aria-activedescendant={secili ? optIdOf(secili.id) : undefined} {...focusRing}
            style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflowY: "auto",
              maxHeight: genis ? `calc(100vh - ${SP.xl * 2}px)` : 420 }}>
            {sonuc.map((h, i) => (
              <KuyrukSatiri key={h.id} h={h} konu={h.konu} secili={secili?.id === h.id} optId={optIdOf(h.id)} ilk={i === 0}
                onSec={() => { if (!sendBusy) setSeciliId(h.id); }} onAc={() => { if (!sendBusy) acDuzenle(h.id); }} />
            ))}
          </div>
          {secili && (
            <KararPaneli key={secili.id} h={secili} konu={secili.konu} govde={secili._govde} genis={genis} sendBusy={sendBusy}
              onDuzenle={() => acDuzenle(secili.id)} onKurul={() => acKurul(secili.id)}
              onGonder={() => gonder(secili, secili.result.yazi_taslak_md)} onSil={() => sil(secili)} />
          )}
        </div>
      )}

      {/* A4 düzenleme modalı — koşullu render: kapanınca unmount, her açılış taze taslakla başlar */}
      {aktif && (
        <BelgeModal key={aktif.id} acik duzenlenebilir
          baslik="Resmî yazı taslağını düzenle" dosyaAdi={aktif.name}
          metin={cleanDemoText(aktif.result.yazi_taslak_md) || ""}
          onKapat={() => setDuzenleId(null)}
          onKaydet={(t) => { onUpdate(aktif.id, t); onToast("Taslak güncellendi."); setDuzenleId(null); }}
          onGonder={async (t) => { if (await gonder(aktif, t)) setDuzenleId(null); }}
          onIndir={(t) => docxIndir(t, aktif.name, onToast)}
          onRevize={onRevize ? (metinGuncel, talimat) => onRevize(aktif.result, metinGuncel, talimat) : null} />
      )}

      {/* AI Bürokrasi Kurulu — üç ajan seçilen taslağı gerçek pipeline sinyalleriyle tartışır;
          "Revize taslağını uygula" MEMUR kararıdır → taslağa yazılır (updateDraft yolu). */}
      {kurulAktif && (
        <KurulModal key={kurulAktif.id}
          taslakAdi={kurulAktif.name}
          result={kurulAktif.result}
          onKapat={() => setKurulId(null)}
          // Tutanaktaki "Taslağa işle" → BelgeModal'ın AI-revize yoluyla AYNI uç (/yazi/dogrula).
          onRevize={onRevize ? (metinGuncel, talimat) => onRevize(kurulAktif.result, metinGuncel, talimat) : null}
          onToast={onToast}
          onUygula={(metin) => {
            onUpdate(kurulAktif.id, metin);
            onToast("Kurul revize taslağı uygulandı; taslak güncellendi.");
            setKurulId(null);
          }}
          // Kurulun kapanışı — memur doğruluğu onaylar → gönder (Giden Evrak) → modal kapanır.
          // ok döner: başarısızlıkta GonderimeHazir hata gösterip modalı açık tutar (dürüst HITL).
          onGonder={async (metin) => {
            const ok = await gonder(kurulAktif, metin);
            if (ok) { onToast("Kurul onayıyla taslak Giden Evrak'a gönderildi."); setKurulId(null); }
            return ok;
          }} />
      )}
    </ViewWrap>
  );
}
