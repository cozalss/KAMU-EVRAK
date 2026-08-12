/* TaslaklarView — KARAR BEKLEYEN taslakların çalışma kuyruğu: MASTER-DETAIL TRİYAJ
   (Linear triage / posta istemcisi deseni — 2026-07-17 yeniden tasarım). Solda dar kuyruk
   listesi (satır = konu + meta, eylem YOK), sağda sabit karar paneli (büyük önizleme +
   eylem çubuğu). Gerekçe: eski 420px kart grid'i 61 taslak × 4 buton = ~244 eş-vurgulu
   hedefti; triyajda bilişsel yükü düşüren şey tek seferde TEK karar + kalıcı önizlemedir.
   Kurgu ayrımı: işlenen arşivi IslenenEvrakView (sicil defteri), gönderilmiş GidenEvrakView.
   Düzenleme yüzeyi TEK kalır: A4 kâğıt modalı (BelgeModal); kurul = KurulModal. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, Btn, BuyutIkon, EmptyState, Icon, MONO, SANS, T, PAL, DERIN, TYPE, TNUM, RAD, SP, SH, EASE, focusRing } from "./neonUi.jsx";
import BelgeModal from "./BelgeModal.jsx";
import A4Belge from "./A4Belge.jsx";
import { KurulModal } from "./MuzakereKurulu.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { A4_GEN_MM, A4_YUK_MM } from "../lib/a4Sayfalama.js";
import { sutunButcesi, BOSLUK } from "../lib/taslakSutun.js";

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

/* NOT: risk bandı bu görünümde GÖSTERİLMEZ (kullanıcı kararı 2026-08-02) — taslak kuyruğu
   karar vermeye odaklanır, risk değerlendirmesi Panel/Denetim yüzeylerinde kalır. Risk
   VERİSİ üretilmeye devam eder (result.risk_metadata.bant); yalnız bu ekranda çizilmez. */

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

/* Meta satırı — YALNIZ dolu parçaları "·" ile birleştirir.
   BIRIM_LBL/EVRAK_TR bilinmeyen değerde "—" döndürdüğü için satırlar "Üst Yazı · —" ya da
   "Bilgilendirme Yazısı · — · Orta risk" gibi çıkıyordu: boş bir alanı görünür kılmak memura
   hiçbir şey söylemiyor, yalnız gürültü ekliyor. Bilinmeyen değer artık satırdan düşer;
   ayraç da onunla birlikte gider (yalnız kalan "·" bırakmaz). */
const metaSatiri = (...parcalar) =>
  parcalar.map((p) => String(p ?? "").trim()).filter((p) => p && p !== "—").join(" · ");

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

/* maxWidth + minWidth:0 — <select>'in içsel genişliği EN UZUN seçeneğinden gelir ("Çalışma,
   Sosyal Güvenlik ve Aile Bakanlığı" gibi birim adları 200px+). Telefonda bu, araç çubuğunu
   ve onunla birlikte sayfayı itiyordu (ölçüldü 2026-08-12: 360px'te Taslaklar 25px, 320px'te
   65px kayıyordu). Tavan konunca seçenek metni kutuda kısalır — açılan listede tam görünür,
   bilgi kaybı yok. */
const selectStil = { padding: "6px 10px", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink2, ...TYPE.data, cursor: "pointer", minWidth: 0, maxWidth: "100%" };

/* Kompakt tek-satır araç çubuğu — Gelen Evrak'ın kalıcı FilterBar panelinden bilinçli
   ayrışma (o panel Gelen'in dili; kuyruk dikey alanı listeye bırakır). Arama kutusu Mevzuat
   sayfasıyla AYNI dilde (ikon + "/" odak kısayolu, 2026-07-23) — uygulama genelinde tek bir
   "arama" hissi. */
/* satirIci: araç çubuğu ViewWrap'in BAŞLIK satırında (actions yuvası) durur, kendi satırında
   değil. Kazanç ölçülü: 33px çubuk + 16px alt boşluk = 49px dikey; Taslaklar penceteye kilitli
   olduğundan bu 49px doğrudan A4'ün boyutuna gider (A4 genişliği = sütun yüksekliği × 0,707
   → +35px kâğıt). Dar ekranda başlık satırı zaten sarar; düzen eskisiyle aynı görünür. */
function AracCubugu({ filter, turSecenek, birimSecenek, satirIci = false }) {
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
    /* minWidth:0 — ViewWrap'in eylem kutusu daralsa bile bu kök esnek öğe kendi min-content'i
       (en uzun <select> seçeneği) kadar geniş kalıyordu; zinciri kırmak için İKİSİNE de
       gerekiyor (ölçüldü 2026-08-12: dış kutu 209'a indi, bu kök 290'da kaldı). */
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", minWidth: 0, maxWidth: "100%", marginBottom: satirIci ? 0 : SP.l }}>
      {/* minWidth:0 — esnek öğenin otomatik asgari boyutu içeriğinin min-content'idir; girdi
          telefonda 16px'e çıkınca (iOS zoom kuralı) bu değer büyüyüp kabı itiyordu. */}
      <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 300, minWidth: 0 }}>
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
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const baslik = konu || h.name;
  const meta = metaSatiri(
    YAZI_TR(h.result?.yazi_turu) || "Taslak",
    BIRIM_GOSTER(h.result?.hedef_birim || h.hedef_birim, h.result?.evrak_turu || h.evrak_turu),
  );
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
      </div>
    </div>
  );
}

/* Karar paneli — İKİ SÜTUN: solda KÂĞIT, sağda karar sütunu (üst-veri + eylemler).
   React fragment döner; iki parça üst grid'in AYRI hücreleridir (kuyruk | kâğıt | karar).

   NEDEN İKİYE AYRILDI (kullanıcı isteği + ölçülebilir gerekçe): önceki sürümde kâğıt ve
   eylem çubuğu TEK bir geniş kartın içindeydi. A4 dikey (oran 0.707), kart ise yatay bir
   kutuydu; kâğıt yüksekliğe göre ölçeklendiğinden kartın yarısına yakını ÖLÜ BEYAZ ALAN
   olarak kalıyordu (1600px ekranda ~944px kart, ~424px kâğıt → ~520px boşluk). Eylemler
   kendi sütununa alınınca kâğıt sütunu daralıyor ve TAM A4 ORANINDA kuruluyor: sütun
   genişliği ölçülen yükseklikten türetiliyor (`kagitSutunGenisligi = sutunH × A4_ORAN`),
   böylece kâğıt sütunu birebir dolduruyor — kenarında boşluk kalmıyor.

   Karar sütunu bir "inspector": önce KİMLİK (konu · dosya · tarih · tür/birim), sonra
   EYLEMLER dikey yığın hâlinde. Gönder ekranın tek primary'si; Sil en altta, ayrı, çıplak
   kırmızı metin (yanlış-tıklama sigortası olarak araya boşluk girer). Onay durumları
   (sil/gönder) eylem yığınının YERİNE geçer — iki karar aynı anda açık kalamaz. */
function KararPaneli({ h, konu, govde, tamMetin, genis, sutunH, sendBusy, onDuzenle, onKurul, onGonder, onSil }) {
  const [confirmDel, setConfirmDel] = useState(false);
  // Gönder de onaylı (confirmDel ikizi): resmî yazı GİDEN EVRAK'a kalıcı yazılır — tek yanlış
  // tık geri alınamaz kayıt üretmesin; "Gönder" önce onay ister, gönderim onayla başlar.
  const [confirmSend, setConfirmSend] = useState(false);
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const r = h.result || {};
  // key={secili.id} remount zaten sıfırlar — bu effect, key kalkarsa emniyet kemeri.
  useEffect(() => { setConfirmDel(false); setConfirmSend(false); }, [h.id]);
  const ad = konu || h.name;
  // Dikey yığında her düğme tam genişlik — hedefler eşit ve tahmin edilebilir (Fitts).
  const tamGenis = { width: "100%", justifyContent: "center" };
  return (
    <>
      {/* ── SÜTUN 1: KÂĞIT ──────────────────────────────────────────────────────────
          Kart YOK. Kâğıdın kendisi zaten beyaz yüzey + hairline + gölge taşıyor (A4Belge
          `sayfaStil`); etrafına bir de kart koymak "kutu içinde kutu" üretirdi. Sütun tam
          A4 oranında olduğundan (genişliği üst grid'in `sutunButcesi` ile hesapladığı
          sütun verir) kâğıt onu birebir doldurur — tek sayfa TAM görünür, kaydırma yalnız
          çok sayfalı taslakta devreye girer (kullanıcı kararı, 2026-08-02).
          Tıkla/Enter → A4 düzenleme (BelgeModal). */}
      <div role="button" tabIndex={0} title="Düzenle (A4 görünüm)" aria-label={`${ad} taslağını A4 görünümde düzenle`} {...focusRing}
        data-karar-kagit="" data-kagit=""
        onClick={onDuzenle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDuzenle(); } }}
        style={{
          position: genis ? "sticky" : "static", top: SP.xl,
          // Ölçüm gelmeden önce oran kilidi devrede: `sutunH` yokken yükseklik yerine
          // aspect-ratio A4 biçimini tutar, böylece kâğıt hiçbir karede yanlış oranda
          // görünmez. Ölçüm gelince yükseklik kesinleşir ve oran kilidi kalkar.
          height: genis ? (sutunH ?? undefined) : undefined,
          aspectRatio: genis && !sutunH ? `${A4_GEN_MM} / ${A4_YUK_MM}` : undefined,
          maxHeight: genis ? undefined : "76vh",
          overflowY: "auto", overscrollBehavior: "contain",
          borderRadius: RAD.card, cursor: "zoom-in", minWidth: 0,
        }}>
        {/* Büyüteç rozeti — hover/klavye odağında belirir, kâğıdın açılabilir olduğunu
            söyler. `sticky` + `height:0`: akışta yer KAPLAMAZ (sayfalama/ölçek matematiği
            değişmez) ama çok sayfalı taslak kaydırılırken üstte asılı kalır. Salt görsel;
            tıklama ve Enter yolu kabın kendisindedir (neonUi [data-kagit-buyut] kuralı). */}
        <div aria-hidden="true" style={{ position: "sticky", top: SP.s, height: 0, zIndex: 2, display: "flex", justifyContent: "flex-end", paddingRight: SP.s, pointerEvents: "none" }}>
          <span data-kagit-buyut="" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut, boxShadow: SH.card }}>
            <BuyutIkon />
          </span>
        </div>
        <A4Belge metin={cleanDemoText(tamMetin) || govde} baslikIpucu="Düzenle (A4 görünüm)" />
      </div>

      {/* ── SÜTUN 2: KARAR ──────────────────────────────────────────────────────────
          Üstte kimlik, altta eylemler. Sil en altta ve fazladan bir boşlukla AYRI durur:
          yıkıcı eylem, sık kullanılan eylemlerin bitişiğinde olmasın (yanlış-tık sigortası). */}
      <aside aria-label="Karar paneli"
        style={{ position: genis ? "sticky" : "static", top: SP.xl, display: "flex", flexDirection: "column", minWidth: 0,
          maxHeight: genis ? (sutunH ?? undefined) : "none", overflowY: "auto",
          background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.xl }}>
        <h3 style={{ margin: 0, ...TYPE.h2, color: PAL.ink, minWidth: 0, overflowWrap: "anywhere" }}>{ad}</h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", marginTop: SP.xs }}>
          <span style={{ fontFamily: SANS, fontSize: 12, color: PAL.mut3 }}>{h.name}</span>
          {tarih && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, ...TNUM }}>{tarih}</span>}
        </div>
        <p style={{ margin: `${SP.s}px 0 0`, ...TYPE.meta, color: PAL.mut }}>
          {metaSatiri(EVRAK_TR(r.evrak_turu), BIRIM_GOSTER(r.hedef_birim, r.evrak_turu), YAZI_TR(r.yazi_turu))}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: SP.s, marginTop: SP.xl, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
          {confirmDel ? (
            <>
              <p role="status" style={{ margin: 0, ...TYPE.data, color: DERIN.kirmizi }}>Taslak silinecek. Emin misiniz?</p>
              <Btn onClick={onSil} style={{ ...tamGenis, color: DERIN.kirmizi }} ariaLabel="Silmeyi onayla"><COP /> Evet, sil</Btn>
              <Btn onClick={() => setConfirmDel(false)} style={tamGenis}>Vazgeç</Btn>
            </>
          ) : confirmSend ? (
            <>
              {/* Gönderim onayı — hedef birim açıkça söylenir; onaydan sonra doğrulama kapıları
                  (/yazi/dogrula) koşar, başarısızlıkta onay açık kalır (memur tekrar dener). */}
              <p role="status" style={{ margin: 0, ...TYPE.data, color: PAL.ink2 }}>
                Yazı <strong style={{ fontWeight: 600 }}>{BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)}</strong> birimine gönderilecek ve Giden Evrak'a kalıcı kaydedilecek. Emin misiniz?
              </p>
              <Btn primary onClick={onGonder} disabled={sendBusy} style={tamGenis} ariaLabel={`${ad} gönderimini onayla`}>
                {sendBusy ? <><Icon.spin width={14} height={14} /> Gönderiliyor…</> : <><Icon.check width={14} height={14} /> Onayla</>}
              </Btn>
              <Btn onClick={() => setConfirmSend(false)} disabled={sendBusy} style={tamGenis}>Vazgeç</Btn>
            </>
          ) : (
            <>
              {/* sendBusy TÜM eylemleri kilitler: /yazi/dogrula ağ turu sürerken silme/düzenleme,
                  gönderilen kopyayla yarışıp tutarsız DB durumu üretebilirdi (review bulgusu). */}
              <Btn primary onClick={() => setConfirmSend(true)} disabled={sendBusy} style={tamGenis} ariaLabel={`${ad} taslağını gönder — önce onay istenir`}>
                <Icon.arrow width={14} height={14} /> Gönder
              </Btn>
              <Btn onClick={onDuzenle} disabled={sendBusy} style={tamGenis} ariaLabel={`${ad} taslağını düzenle`}><KALEM /> Düzenle</Btn>
              {/* AI Bürokrasi Kurulu — üç ajan BU taslağı gerçek doğrulama sinyalleriyle tartışır */}
              <Btn onClick={onKurul} disabled={sendBusy} style={tamGenis} ariaLabel={`${ad} taslağı için Bürokrasi Kurulu'nu topla`}>
                <Icon.scale width={14} height={14} /> Kurulu topla
              </Btn>
              <div style={{ marginTop: SP.l }}>
                <MetinEylem onClick={() => setConfirmDel(true)} disabled={sendBusy} renk={DERIN.kirmizi} ariaLabel={`${ad} taslağını sil`}><COP /> Sil</MetinEylem>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
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

/* Sütun yüksekliği — 100vh VARSAYILMAZ, ÖLÇÜLÜR.

   NEDEN (gerçek hata, Playwright'ta ölçüldü): kuyruk ve karar paneli `calc(100vh - 48px)` ile
   kapatılıyordu. Ama bu iki sütun sayfanın TEPESİNDE başlamıyor — üstlerinde ViewWrap dolgusu +
   başlık + araç çubuğu (~154px), altlarında ViewWrap'ın 96px alt dolgusu var. Sonuç: belge
   1118px, pencere 900px → sayfa 218px taşıyor ve bir SAYFA kaydırma çubuğu doğuyordu. O çubuk,
   karar panelinin kendi iç çubuğunun 33px yanına düşünce ekranda YAN YANA İKİ ÇUBUK görünüyordu.
   Taşan 218px zaten işe yaramıyordu: yalnız başlığı yukarı kaydırıyordu.

   Ölçüm ViewWrap'ın iç değerlerine BAĞLANMAZ — alt dolgu DOM'dan okunur, üst boşluk elemanın
   kendi konumundan gelir. Başlık sarsa, araç çubuğu iki satıra düşse veya ViewWrap dolgusu
   değişse ölçü kendiliğinden doğru kalır (sabit sayı yazılsaydı sessizce bozulurdu).

   `rect.top + scrollY` KARARLI bir ölçüdür: sütunlar kısalıp sayfa sığınca tarayıcı scrollY'yi
   sıfırlar ama rect.top aynı miktarda artar; toplam değişmez. Bu yüzden ResizeObserver kendi
   değişikliğimizle tetiklense de aynı sonucu üretir ve döngü oluşmaz (ayrıca 1px eşiği var). */
const SUTUN_MIN = 320;
function useSutunYuksekligi(genis) {
  const ref = useRef(null);
  const [olcu, setOlcu] = useState(null);   // { yukseklik, genislik } — ikisi tek commit'te
  useLayoutEffect(() => {
    if (!genis || typeof window === "undefined") { setOlcu(null); return undefined; }
    const olc = () => {
      const el = ref.current;
      const bolum = el?.closest("section");
      if (!el || !bolum) return;
      const altDolgu = parseFloat(window.getComputedStyle(bolum).paddingBottom) || 0;
      const ust = el.getBoundingClientRect().top + window.scrollY;
      const h = Math.max(SUTUN_MIN, Math.round(window.innerHeight - ust - altDolgu));
      const w = Math.round(el.clientWidth);
      setOlcu((eski) => (!eski || Math.abs(eski.yukseklik - h) > 1 || Math.abs(eski.genislik - w) > 1
        ? { yukseklik: h, genislik: w }
        : eski));
    };
    olc();
    /* Gözlemci BODY'ye bağlanır, grid'in kendisine değil: efekt koştuğunda taslaklar henüz
       yüklenmemiş olabilir (ekranda EmptyState var, grid DOM'da YOK) — o an grid'e bağlanmaya
       çalışsaydık hiçbir gözlemci kurulmaz, taslaklar sonradan gelince ölçüm bir daha
       tetiklenmez ve sütunlar eski calc()'ta kalırdı. Body her koşulda vardır ve grid
       belirdiğinde yüksekliği değiştiği için ölçüm kendiliğinden koşar. */
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(olc) : null;
    ro?.observe(document.body);
    window.addEventListener("resize", olc);
    return () => { ro?.disconnect(); window.removeEventListener("resize", olc); };
  }, [genis]);
  return [ref, olcu?.yukseklik ?? null, olcu?.genislik ?? null];
}

/* Sütun bütçesi — üçünün piksel genişliği `sutunButcesi`de (saf, taslakSutun.test.js'te
   birim testli). Kâğıt hâlâ ölçülen YÜKSEKLİKTEN A4 oranıyla türer; sayfayı büyütmenin tek
   yolu sütuna daha çok yükseklik açmaktır (taşma payıyla büyütme denendi ve kullanıcı
   kararıyla geri alındı, 2026-08-02).

   2026-08-12 DÜZELTMESİ — artan genişlik artık sütun ARALARINA dağıtılmıyor. Eski düzende
   kuyruk 420 / karar 300 sabit tavanlıydı; kâğıt ise yükseklikten türediği için alçak
   ekranda daralıyordu. Artan yer `justifyContent:space-between` ile aralara düşüyor ve
   1080p'de 2x185px, 1440p'de 2x378px uçurum açıyordu (Playwright'ta ölçüldü) — ekran üç
   küçük ada + iki delik olarak görünüyordu. Artık artık sütunlara gider, kalanı tek parça
   SAĞ boşluktur; sütunlar bitişik ve başlık/araç çubuğuyla aynı sol hizada başlar.
   Gerekçenin tamamı + ölçüm tablosu: `lib/taslakSutun.js`. */
const GRID_BOSLUK = BOSLUK;

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
  // gridRef ölçüm içindir (bkz. useSutunYuksekligi); ölçü gelmeden önce güvenli yedeğe düşülür.
  const [gridRef, sutunH, gridGen] = useSutunYuksekligi(genis);
  const butce = sutunButcesi(sutunH, gridGen);
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
    // Dar ekranda kâğıt listenin ALTINDA — seçim değişince görünür kalsın (blok: nearest,
    // smooth değil; reduced-motion tartışması doğmaz). Hedef KÂĞITTIR, karar sütunu değil:
    // memur önce belgeyi görmek ister, eylemler onun altında zaten erişilebilir.
    if (!genis) document.querySelector("[data-karar-kagit]")?.scrollIntoView({ block: "nearest" });
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
  /* altDolgu (JS yorumu — JSX yorumu DEĞİL; kök elemanın önüne konsa iki kardeş doğar ve
     sözdizimi hatası verir, bu depoda daha önce yaşandı): geniş düzende sütunlar pencereye
     kilitli, sayfa kaydırılmıyor — o hâlde 96px alt dolgu nefes payı değil, doğrudan kâğıttan
     kısılan ölü alandır (sütun yüksekliği = pencere − üst boşluk − alt dolgu). 24'e çekmek
     kâğıda ~72px yükseklik kazandırır: sayfa yine TAM sığar, yalnız büyür. Yığılmış (dar)
     düzende sayfa kaydırıldığından varsayılan 96px korunur — yüzen sohbet düğmesi son satırı
     örtmesin. */
  return (
    <ViewWrap id="taslak-h" title="Taslaklar" altDolgu={genis ? SP.xl : undefined} ustSik={genis}
      sub={`${drafts.length} taslak karar bekliyor${oturumEki} · satırı seçin, sağdaki panelde karar verin`}
      actions={<AracCubugu filter={filter} turSecenek={config.select[0].options.slice(1)} birimSecenek={config.select[1].options.slice(1)} satirIci />}>
      {sonuc.length === 0 ? (
        <EmptyState icon={<Icon.doc />} title="Eşleşen taslak yok" sub="Filtre ölçütlerinizi gevşetin." actions={[<Btn key="c" onClick={filter.clearAll}>Filtreleri temizle</Btn>]} />
      ) : (
        /* Üç sütun: kuyruk | kâğıt | karar — üçünün genişliği de `sutunButcesi`den gelir
           (saf + birim testli). Kâğıt ölçülen yükseklikten türer (A4 oranı); artan genişlik
           kuyruk ve karar sütunlarına dağıtılır, kalanı SAĞ boşluk olur — aralara ASLA değil.
           Ölçüm gelmeden önce oransal bir yedek kullanılır — ilk karede de üç sütunlu düzen
           görünür, yerleşim sonradan sıçramaz.
           Seçim yokken kâğıt/karar hücreleri boş kalmasın diye grid tek sütuna iner.
           NOT: bu bir JS yorumudur, JSX yorumu DEĞİL — ternary'nin ifade konumunda
           süslü-parantezli JSX yorumu sözdizimi hatası verir (bu depoda daha önce yaşandı). */
        <div ref={gridRef} style={{
          display: "grid",
          gridTemplateColumns: !genis || !secili ? "minmax(0, 1fr)"
            : butce ? `${butce.kuyruk}px ${butce.kagit}px ${butce.karar}px`
            // Ölçüm gelmeden önceki tek kare: oransal yedek — ilk karede de üç sütun görünür.
            : "minmax(260px, 420px) minmax(0, 0.8fr) minmax(236px, 300px)",
          // justifyContent YOK (varsayılan `start`): artan yer sütun ARALARINA dağıtılamaz —
          // `space-between` tam da bu yüzden kaldırıldı (bkz. lib/taslakSutun.js). Sütunlar
          // bitişik durur, kalan genişlik tek parça sağ boşluk olur ve düzen sol hizada kalır.
          gap: GRID_BOSLUK, alignItems: "start",
        }}>
          {/* Kuyruk listesi — listbox: ↑/↓ gezinme, Enter düzenleme; satırda eylem yok
              (eylemler panelde — Hick yasası: 244 hedef → 4 hedef). */}
          <div ref={listeRef} role="listbox" aria-label="Taslak kuyruğu" tabIndex={0} onKeyDown={klavye}
            aria-activedescendant={secili ? optIdOf(secili.id) : undefined} {...focusRing}
            style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflowY: "auto",
              maxHeight: genis ? (sutunH ?? `calc(100vh - ${SP.xl * 2}px)`) : 420 }}>
            {sonuc.map((h, i) => (
              <KuyrukSatiri key={h.id} h={h} konu={h.konu} secili={secili?.id === h.id} optId={optIdOf(h.id)} ilk={i === 0}
                onSec={() => { if (!sendBusy) setSeciliId(h.id); }} onAc={() => { if (!sendBusy) acDuzenle(h.id); }} />
            ))}
          </div>
          {secili && (
            <KararPaneli key={secili.id} h={secili} konu={secili.konu} govde={secili._govde}
              tamMetin={secili.result?.yazi_taslak_md} genis={genis} sutunH={sutunH} sendBusy={sendBusy}
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
