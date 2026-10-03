/* TaslaklarView — KARAR BEKLEYEN taslakların çalışma kuyruğu: MASTER-DETAIL TRİYAJ
   (Linear triage / posta istemcisi deseni — 2026-07-17 yeniden tasarım). Solda dar kuyruk
   listesi (satır = konu + meta, eylem YOK), sağda sabit karar paneli (büyük önizleme +
   eylem çubuğu). Gerekçe: eski 420px kart grid'i 61 taslak × 4 buton = ~244 eş-vurgulu
   hedefti; triyajda bilişsel yükü düşüren şey tek seferde TEK karar + kalıcı önizlemedir.
   Kurgu ayrımı: işlenen arşivi IslenenEvrakView (sicil defteri), gönderilmiş GidenEvrakView.
   Düzenleme yüzeyi TEK kalır: A4 kâğıt modalı (BelgeModal); kurul = KurulModal. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, Btn, BuyutIkon, EmptyState, Icon, MONO, T, V, R, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, focusRing } from "./neonUi.jsx";
import BelgeModal from "./BelgeModal.jsx";
import A4Belge from "./A4Belge.jsx";
import TaslakImza from "./TaslakImza.jsx";
import KararFisi from "./TaslakKararFisi.jsx";
import { KararEylemleri, KuyrukTemiz, MetinEylem, COP } from "./TaslakEylem.jsx";
import { KurulModal } from "./MuzakereKurulu.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER, YAZI_TR, cleanDemoText } from "./result-cards.jsx";
import { A4_GEN_MM, A4_YUK_MM } from "../lib/a4Sayfalama.js";
import { sutunButcesi, BOSLUK, KUYRUK_AZAMI } from "../lib/taslakSutun.js";

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
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name", "konu"], evrak_turu: "evrak_turu", hedef_birim: "hedef_birim", dateField: "ts" },
};


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

/* maxWidth + minWidth:0 — <select>'in içsel genişliği EN UZUN seçeneğinden gelir ("Çalışma,
   Sosyal Güvenlik ve Aile Bakanlığı" gibi birim adları 200px+). Telefonda bu, araç çubuğunu
   ve onunla birlikte sayfayı itiyordu (ölçüldü 2026-08-12: 360px'te Taslaklar 25px, 320px'te
   65px kayıyordu). Tavan konunca seçenek metni kutuda kısalır — açılan listede tam görünür,
   bilgi kaybı yok. */
const selectStil = { width: "100%", padding: "6px 4px 6px 8px", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink2, ...TYPE.meta, lineHeight: "18px", textOverflow: "ellipsis", cursor: "pointer", minWidth: 0, maxWidth: "100%" };

/* Kompakt tek-satır araç çubuğu — Gelen Evrak'ın kalıcı FilterBar panelinden bilinçli
   ayrışma (o panel Gelen'in dili; kuyruk dikey alanı listeye bırakır). Arama kutusu Mevzuat
   sayfasıyla AYNI dilde (ikon + "/" odak kısayolu, 2026-07-23) — uygulama genelinde tek bir
   "arama" hissi. */
/* icerde: araç çubuğu kuyruk kartının tepesinde (geniş ve dar düzen); kuyruk boşken
   (filtre hiçbir şey bulamadı) kartın dışında, boş durumun üstünde durur — arama kutusu
   yazarken kaybolmasın. */
function AracCubugu({ filter, turSecenek, birimSecenek, icerde = false }) {
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
    /* 2026-10: araç çubuğu artık süzdüğü KUYRUĞUN tepesinde (kullanıcı: "sağ üstte kopuk
       yüzüyor"). Arama tam satır, üç seçici altında eşit üç sütun — kuyruk sütunu ne kadar
       daralırsa daralsın ızgara sığar (minmax(0,1fr) + select minWidth:0). */
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SP.s, minWidth: 0, maxWidth: "100%", padding: icerde ? SP.m : 0, marginBottom: icerde ? 0 : SP.l, borderBottom: icerde ? `1px solid ${PAL.line}` : "none" }}>
      {/* minWidth:0 — esnek öğenin otomatik asgari boyutu içeriğinin min-content'idir; girdi
          telefonda 16px'e çıkınca (iOS zoom kuralı) bu değer büyüyüp kabı itiyordu. */}
      <div style={{ position: "relative", gridColumn: "1 / -1", minWidth: 0 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(0, .85fr)", gap: SP.s, minWidth: 0 }}>
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
      </div>
      {filter.hasActiveFilters && (
        <button type="button" onClick={filter.clearAll} {...focusRing} data-press=""
          style={{ gridColumn: "1 / -1", justifySelf: "start", cursor: "pointer", padding: "2px 4px", border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.meta, fontWeight: 500, color: DERIN.T, transition: "transform .14s var(--ke-ease-out)" }}>
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
/* Defter cetveli — kuyruk bir SİCİL DEFTERİ sayfası gibi çizilir: her satır SATIR_H yüksekliğinde
   ve zemin aynı adımla yatay cetvel taşır, böylece tek taslak olsa bile sütunun geri kalanı
   boş defter satırlarıyla dolar (yarım ekran boş beyaz kart yerine). Soldaki kırmızı KENAR
   çizgisi sıra numarasını konudan ayırır — gerçek kayıt defterinin kenar boşluğu. Satır
   yüksekliği SABİT olmak zorunda: cetvel arka plan olduğundan satırlar ondan kaymamalı. */
const SATIR_H = 52;
const MASA_PAY = 20;   // masa zemininin kâğıt çevresindeki payı (px)
const MOBIL_SAHNE = 360;   // telefonda kâğıt sahnesinin mantıksal genişliği (px) — 360/793 > ASGARI_OLCEK
/* İç odak halkası — liste, köşeleri kırpan (overflow:hidden) defter kartının içinde; dış
   halka (focusRing) kırpılırdı. Yine yalnız :focus-visible'da. */
const icOdak = {
  onFocus: (e) => { if (e.currentTarget.matches(":focus-visible")) e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${T}`; },
  onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; },
};
const KENAR_X = 44;
const defterZemini = {
  backgroundImage: [
    `linear-gradient(to right, transparent ${KENAR_X - 1}px, color-mix(in srgb, ${R} 30%, transparent) ${KENAR_X - 1}px, color-mix(in srgb, ${R} 30%, transparent) ${KENAR_X}px, transparent ${KENAR_X}px)`,
    `repeating-linear-gradient(to bottom, transparent 0, transparent ${SATIR_H - 1}px, ${PAL.line} ${SATIR_H - 1}px, ${PAL.line} ${SATIR_H}px)`,
  ].join(", "),
  backgroundAttachment: "local",
};

function KuyrukSatiri({ h, konu, sira, secili, onSec, onAc, optId }) {
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const baslik = konu || h.name;
  const meta = metaSatiri(
    YAZI_TR(h.result?.yazi_turu) || "Taslak",
    BIRIM_GOSTER(h.result?.hedef_birim || h.hedef_birim, h.result?.evrak_turu || h.evrak_turu),
  );
  const zemin = secili ? ALFA(T) : "transparent";
  return (
    <div role="option" id={optId} aria-selected={secili} onClick={onSec} onDoubleClick={onAc} data-press=""
      style={{ cursor: "pointer", height: SATIR_H, boxSizing: "border-box", display: "flex", alignItems: "center",
        // Seçim: iç gölgeyle 3px mürekkep şeridi (yerleşim kaymaz) + tint + 600 başlık + mavi sıra no
        // — renk tek sinyal değil.
        boxShadow: secili ? `inset 3px 0 0 ${T}` : "none", background: zemin,
        transition: `background .14s ease-out, transform .14s ${EASE.out}` }}
      onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = zemin; }}>
      <span aria-hidden="true" style={{ width: KENAR_X, flexShrink: 0, textAlign: "center", fontFamily: MONO, fontSize: 12, ...TNUM, fontWeight: secili ? 600 : 400, color: secili ? DERIN.T : PAL.mut3 }}>
        {String(sira).padStart(2, "0")}
      </span>
      <div style={{ flex: 1, minWidth: 0, padding: "0 14px 1px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span title={baslik} style={{ ...TYPE.ui, fontWeight: secili ? 600 : 500, color: PAL.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {baslik}
          </span>
          {tarih && <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".02em", color: PAL.mut3, ...TNUM, flexShrink: 0 }}>{tarih}</span>}
        </div>
        <div title={meta} style={{ ...TYPE.meta, color: PAL.mut, marginTop: 3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta}
        </div>
      </div>
    </div>
  );
}

/* Klavye tuşu — kuyruk altbilgisindeki kısayol ipucu. */
const Tus = ({ children }) => (
  <kbd style={{ display: "inline-block", minWidth: 16, padding: "0 4px", marginRight: 3, borderRadius: 4, border: `1px solid ${PAL.lineHi}`, borderBottomWidth: 2, background: PAL.surf, fontFamily: MONO, fontSize: 10, lineHeight: "14px", textAlign: "center", color: PAL.ink2 }}>{children}</kbd>
);

/* Defter başlığı — sütun etiketleri antet dilinde (mono, izlemeli). Listbox'ın DIŞINDA durur:
   role=listbox yalnız option çocuk taşımalı. */
function DefterBasligi({ adet }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", height: 34, flexShrink: 0, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
      <span style={{ width: KENAR_X, textAlign: "center" }}>No</span>
      <span style={{ flex: 1, paddingLeft: 12 }}>Konu · birim</span>
      <span style={{ paddingRight: 14, ...TNUM }}>{adet} kayıt</span>
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
function KararPaneli({ h, konu, govde, tamMetin, genis, sutunH, sira = 1, toplam = 1, sendBusy, komut, onDuzenle, onKurul, onGonder, onSil }) {
  // Eylem durumu: "bos" | "gonder" (iki adımlı gönderim onayı) | "sil". Tek state → iki karar
  // aynı anda açık kalamaz. Gönderim onaylı: resmî yazı GİDEN EVRAK'a kalıcı yazılır.
  const [durum, setDurumHam] = useState("bos");
  const [hata, setHata] = useState(false);   // son gönderim başarısız → onay açık + satır içi hata
  const setDurum = (d) => { setHata(false); setDurumHam(d); };
  const tarih = Number.isFinite(h.ts) ? new Date(h.ts).toLocaleDateString("tr-TR") : "";
  const r = h.result || {};
  // key={secili.id} remount zaten sıfırlar — bu effect, key kalkarsa emniyet kemeri.
  useEffect(() => { setDurumHam("bos"); setHata(false); }, [h.id]);
  // Klavye kısayolu (kuyrukta G): gönderim ONAYINI açar — tek tuşla kalıcı kayıt üretilmez.
  useEffect(() => { if (komut?.tip === "gonder" && !sendBusy) { setHata(false); setDurumHam("gonder"); } }, [komut]); // eslint-disable-line react-hooks/exhaustive-deps
  const gonderOnayli = async () => {
    setHata(false);
    const ok = await onGonder();
    if (ok === false) setHata(true);
  };
  const ad = konu || h.name;
  // Telefon kâğıt sahnesi — kabın genişliği ölçülüp zoom'a çevrilir (bkz. aşağıdaki not).
  const [kagitKap, setKagitKap] = useState(null);
  const [mobilZoom, setMobilZoom] = useState(1);
  useLayoutEffect(() => {
    if (genis || !kagitKap || typeof ResizeObserver === "undefined") return undefined;
    const olc = () => { const w = kagitKap.clientWidth; if (w > 0) setMobilZoom(Math.min(1, w / MOBIL_SAHNE)); };
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(kagitKap);
    return () => ro.disconnect();
  }, [genis, kagitKap]);
  const metin = cleanDemoText(tamMetin) || govde;
  const eylemler = (
    <KararEylemleri ad={ad} birim={BIRIM_GOSTER(r.hedef_birim, r.evrak_turu)} sendBusy={sendBusy} kompakt={!genis}
      durum={durum} hata={hata} setDurum={setDurum} onGonder={gonderOnayli}
      onDuzenle={onDuzenle} onKurul={onKurul} onSil={onSil} />
  );
  return (
    <>
      {/* ── SÜTUN 1: MASA + KÂĞIT ───────────────────────────────────────────────────
          2026-10 (kullanıcı geri bildirimi, 2560px ekran: "yerleşim kötü"): sütun bütçesinin
          SAĞ ARTIĞI artık ölü boşluk değil — bu hücre `minmax(kâğıt, 1fr)` olduğundan artık
          MASAYA gider (bütçe sözleşmesi korunur: aralara dağıtılmaz, sütunlar bitişik kalır).
          Masa hafif çökük bir zemin; kâğıt onun ortasında TAM A4 oranında (aspect-ratio)
          durur ve yüksekliğe sığar — eni ne olursa olsun yatay kutu olamaz.
          Tıkla/Enter → A4 düzenleme (BelgeModal). */}
      <div style={{ minWidth: 0, height: genis ? (sutunH ?? undefined) : undefined, display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: genis ? MASA_PAY : SP.m, boxSizing: "border-box", borderRadius: RAD.card, background: PAL.bg2,
        boxShadow: `inset 0 1px 3px color-mix(in srgb, ${PAL.ink} 7%, transparent)`, animation: "nu-rise .32s var(--ke-ease-out) .08s both" }}>
        <div role="button" tabIndex={0} title="Düzenle (A4 görünüm)" aria-label={`${ad} taslağını A4 görünümde düzenle`} {...focusRing}
          data-karar-kagit="" data-kagit="" ref={setKagitKap}
          onClick={onDuzenle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDuzenle(); } }}
          style={{
            position: "relative",
            height: genis ? "100%" : undefined, aspectRatio: genis ? `${A4_GEN_MM} / ${A4_YUK_MM}` : undefined, maxWidth: "100%",
            width: genis ? undefined : "100%", maxHeight: genis ? undefined : "76vh",
            overflowY: "auto", overscrollBehavior: "contain", cursor: "zoom-in", minWidth: 0,
          }}>
          {/* Büyüteç rozeti — hover/klavye odağında belirir, kâğıdın açılabilir olduğunu
              söyler. `sticky` + `height:0`: akışta yer KAPLAMAZ (sayfalama/ölçek matematiği
              değişmez). Salt görsel; tıklama ve Enter yolu kabın kendisindedir. */}
          <div aria-hidden="true" style={{ position: "sticky", top: SP.s, height: 0, zIndex: 2, display: "flex", justifyContent: "flex-end", paddingRight: SP.s, pointerEvents: "none" }}>
            <span data-kagit-buyut="" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut, boxShadow: SH.card }}>
              <BuyutIkon />
            </span>
          </div>
          {genis ? (
            <A4Belge metin={metin} baslikIpucu="Düzenle (A4 görünüm)" />
          ) : (
            /* Telefon: A4Belge'nin ASGARI_OLCEK tabanı (0,42 → 333px) 390px ekranda sayfayı
               sağdan kırpıyordu. Kâğıt sabit 360px'lik bir sahnede dizilir ve sahne CSS `zoom`
               ile kaba sığdırılır — ölçek matematiği (a4Sayfalama) DEĞİŞMEZ, yalnız sunum. */
            <div style={{ width: MOBIL_SAHNE, zoom: mobilZoom }}>
              <A4Belge metin={metin} baslikIpucu="Düzenle (A4 görünüm)" sigdir="genislik" />
            </div>
          )}
        </div>
      </div>

      {/* ── SÜTUN 2: KARAR ──────────────────────────────────────────────────────────
          Yukarıdan aşağı bir karar FİŞİ: konu → hüküm (risk bandı) → özet → muhatap/dayanak →
          eylemler. Eylemler içeriğin hemen altındadır (dibe yaslanmaz — arada boşluk
          kalmasın); kart içeriği kadar uzar, sütunu aşarsa kendi içinde kayar. */}
      <aside aria-label="Karar paneli"
        style={{ position: genis ? "sticky" : "static", top: SP.xl, display: "flex", flexDirection: "column", minWidth: 0,
          maxHeight: genis ? (sutunH ?? undefined) : undefined, overflowY: "auto",
          background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
          animation: "nu-rise .32s var(--ke-ease-out) .14s both" }}>
        <KararFisi h={h} r={r} ad={ad} govde={govde} tarih={tarih} sira={sira} toplam={toplam} />
        {genis ? eylemler : (
          /* Telefonda eylemler sayfa dibine yapışık karar çubuğunda; fişte yalnız sessiz Sil. */
          <div style={{ padding: "4px 12px 12px", borderTop: `1px solid ${PAL.line}` }}>
            <MetinEylem onClick={() => setDurum("sil")} disabled={sendBusy} renk={DERIN.kirmizi} ariaLabel={`${ad} taslağını sil`}><COP /> Sil</MetinEylem>
          </div>
        )}
      </aside>
      {!genis && eylemler}
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
/* 2026-10 DÜZELTMESİ — ölçüm hiç koşmuyordu (Playwright'ta ölçüldü: grid kalıcı olarak yedek
   "420px 297px 300px" sütunlarında, kâğıt 298px'e sıkışıp ASGARI_OLCEK yüzünden sağdan
   kırpılıyordu). Neden: ref nesnesi efektin ilk koşusunda boştu (taslaklar henüz yüklenmemiş)
   ve gövde gözlemcisi kurtarmıyordu — ViewWrap `minHeight: 100vh` taşıdığından grid belirince
   BODY'nin boyu DEĞİŞMİYOR, gözlemci hiç tetiklenmiyordu. Artık ref bir STATE'tir (callback
   ref): grid DOM'a girdiği anda efekt yeniden koşar ve grid'in KENDİSİ de gözlenir. Body
   gözlemcisi kalır (başlık sarması gibi grid dışı kaymalar için). */
function useSutunYuksekligi(genis) {
  const [el, setEl] = useState(null);
  const [olcu, setOlcu] = useState(null);   // { yukseklik, genislik } — ikisi tek commit'te
  useLayoutEffect(() => {
    if (!genis || !el || typeof window === "undefined") { setOlcu(null); return undefined; }
    const olc = () => {
      const bolum = el.closest("section");
      if (!bolum) return;
      const altDolgu = parseFloat(window.getComputedStyle(bolum).paddingBottom) || 0;
      const ust = el.getBoundingClientRect().top + window.scrollY;
      const h = Math.max(SUTUN_MIN, Math.round(window.innerHeight - ust - altDolgu));
      const w = Math.round(el.clientWidth);
      setOlcu((eski) => (!eski || Math.abs(eski.yukseklik - h) > 1 || Math.abs(eski.genislik - w) > 1
        ? { yukseklik: h, genislik: w }
        : eski));
    };
    olc();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(olc) : null;
    ro?.observe(document.body);
    ro?.observe(el);
    window.addEventListener("resize", olc);
    return () => { ro?.disconnect(); window.removeEventListener("resize", olc); };
  }, [genis, el]);
  return [setEl, olcu?.yukseklik ?? null, olcu?.genislik ?? null];
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
  const [komut, setKomut] = useState(null);   // klavye kısayolu → karar paneline tek seferlik komut
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
  /* Hüküm anı (TaslakImza): imza katmanı gönderimle AYNI anda başlar — çağrı beklemez;
     damga yalnız ok===true dönünce iner. Kâğıdın o anki yeri ölçülür (katman sabit konumlu,
     panel sıradaki taslağa geçse de kendi kopyasını taşır). */
  const [imza, setImza] = useState(null);
  const imzaBitti = useCallback(() => setImza(null), []);
  const gonderImzali = async (h, metin) => {
    const sayfa = document.querySelector("[data-karar-kagit] .ke-a4-sayfa");
    const rect = sayfa?.getBoundingClientRect();
    const k = Date.now();
    if (!sendBusy && rect && rect.width > 0) {
      const az = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setImza({ k, rect, metin: cleanDemoText(metin) || "", ok: null, az });
    }
    const ok = await gonder(h, metin);
    setImza((i) => (i && i.k === k ? { ...i, ok: !!ok } : i));
    return ok;
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
    // Kısayollar (Hamle 11): animasyonsuz, değiştiricisiz. G gönderim ONAYINI açar (iki adım
    // korunur — odak onay düğmesine geçer, Enter gönderir, Esc vazgeçer); K kurulu toplar.
    else if (e.metaKey || e.ctrlKey || e.altKey || !secili) return;
    else if (e.key === "g" || e.key === "G") { e.preventDefault(); setKomut((k) => ({ tip: "gonder", n: (k?.n || 0) + 1 })); }
    else if (e.key === "k" || e.key === "K") { e.preventDefault(); acKurul(secili.id); }
  };
  // İlk açılışta sayfa kaydırılmaz: telefonda görünüm açılır açılmaz kâğıda atlıyor, antet
  // başlığı ve kuyruk ekran dışında kalıyordu (tur-3 durum matrisi bulgusu). Kaydırma yalnız
  // memurun SEÇİMİ değiştiğinde.
  // Son kaydırılan id tutulur (bayrak değil): StrictMode efektleri iki kez koşturur, bayrak
  // ikinci koşuda "ilk değil" sanıp yine kaydırıyordu.
  const sonSecim = useRef(null);
  useEffect(() => {
    if (!secili) return;
    const ilk = sonSecim.current === null;
    if (sonSecim.current === secili.id) return;
    sonSecim.current = secili.id;
    if (ilk) return;
    document.getElementById(optIdOf(secili.id))?.scrollIntoView({ block: "nearest" });
    // Dar ekranda kâğıt listenin ALTINDA — seçim değişince görünür kalsın (blok: nearest,
    // smooth değil; reduced-motion tartışması doğmaz). Hedef KÂĞITTIR, karar sütunu değil:
    // memur önce belgeyi görmek ister, eylemler onun altında zaten erişilebilir.
    if (!genis) document.querySelector("[data-karar-kagit]")?.scrollIntoView({ block: "nearest" });
  }, [secili?.id, genis]); // eslint-disable-line react-hooks/exhaustive-deps

  if (drafts.length === 0) {
    const toplam = karar.gonderildi + karar.silindi;
    // Kuyruk BU oturumda çalışarak boşaltıldıysa: sakin zafer — oturum özeti + Giden'e köprü.
    if (toplam > 0) {
      return <KuyrukTemiz gonderildi={karar.gonderildi} silindi={karar.silindi} onGoOutbox={onGoOutbox} onGoInbox={onGoInbox} />;
    }
    return (
      <ViewWrap id="taslak-h" title="Taslaklar" kunye="Karar kuyruğu" sub="Üretilen resmî yazı taslakları">
        <EmptyState icon={<Icon.doc />} title="Henüz taslak ayrılmadı"
          sub="İşleniyor görünümündeki onay kartında “Düzenle” seçtiğinizde ya da önceki oturumlardan karar bekleyen bir taslak bulunduğunda, resmî yazı taslağı burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  const aracProps = { filter, turSecenek: config.select[0].options.slice(1), birimSecenek: config.select[1].options.slice(1) };
  const aracIcerde = <AracCubugu {...aracProps} icerde />;
  const oturumEki = karar.gonderildi + karar.silindi > 0 ? ` · oturumda ${karar.gonderildi + karar.silindi} karar` : "";
  /* altDolgu (JS yorumu — JSX yorumu DEĞİL; kök elemanın önüne konsa iki kardeş doğar ve
     sözdizimi hatası verir, bu depoda daha önce yaşandı): geniş düzende sütunlar pencereye
     kilitli, sayfa kaydırılmıyor — o hâlde 96px alt dolgu nefes payı değil, doğrudan kâğıttan
     kısılan ölü alandır (sütun yüksekliği = pencere − üst boşluk − alt dolgu). 24'e çekmek
     kâğıda ~72px yükseklik kazandırır: sayfa yine TAM sığar, yalnız büyür. Yığılmış (dar)
     düzende sayfa kaydırıldığından varsayılan 96px korunur — yüzen sohbet düğmesi son satırı
     örtmesin. */
  return (
    <ViewWrap id="taslak-h" title="Taslaklar" altDolgu={genis ? SP.xl : undefined} ustSik={genis} kunye="Karar kuyruğu"
      damga={{ metin: `${drafts.length} karar bekliyor`, ton: V, egim: -3 }}
      sub={`Satırı seçin, belgeyi okuyun, karar verin${oturumEki}`}>
      {(
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
          gridTemplateColumns: !genis ? "minmax(0, 1fr)"
            // Filtre hiçbir şey bulamadı: kuyruk kartı KENDİ genişliğinde kalır (tam ekrana
            // yayılmaz) — arama kutusu yazarken yerinden oynamaz, odak kaybolmaz.
            : !secili ? `minmax(0, ${butce?.kuyruk || KUYRUK_AZAMI}px)`
            : butce ? `${butce.kuyruk}px minmax(${butce.kagit}px, 1fr) ${butce.karar}px`
            // Ölçüm gelmeden önceki tek kare: oransal yedek — ilk karede de üç sütun görünür.
            : "minmax(260px, 420px) minmax(0, 0.8fr) minmax(236px, 300px)",
          // justifyContent YOK (varsayılan `start`): artan yer sütun ARALARINA dağıtılamaz —
          // `space-between` tam da bu yüzden kaldırıldı (bkz. lib/taslakSutun.js). Sütunlar
          // bitişik durur, kalan genişlik tek parça sağ boşluk olur ve düzen sol hizada kalır.
          gap: GRID_BOSLUK, alignItems: "start",
        }}>
          {/* Kuyruk listesi — listbox: ↑/↓ gezinme, Enter düzenleme; satırda eylem yok
              (eylemler panelde — Hick yasası: 244 hedef → 4 hedef). */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden",
            height: genis ? (sutunH ?? undefined) : undefined, animation: "nu-rise .32s var(--ke-ease-out) .04s both" }}>
            {aracIcerde}
            <DefterBasligi adet={sonuc.length} />
            {/* Liste kabı boşken de DOM'da kalır (hidden): auto-animate'in çıkış hayaletleri
                sökülen kabın yerine boş durumun üstüne biniyordu (tur-3 ölçümü). */}
            {sonuc.length === 0 && (
              <div role="status" style={{ ...defterZemini, flex: 1, minHeight: SATIR_H * 4, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: SP.s, padding: `${SP.l}px 16px ${SP.l}px ${KENAR_X + 12}px` }}>
                <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Eşleşen taslak yok</span>
                <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Kuyrukta {drafts.length} taslak var; arama ya da filtre hiçbirini kapsamıyor.</span>
                <Btn onClick={filter.clearAll} style={{ marginTop: SP.xs }}>Filtreleri temizle</Btn>
              </div>
            )}
            <div ref={listeRef} role="listbox" hidden={sonuc.length === 0} aria-label="Taslak kuyruğu" tabIndex={0} onKeyDown={klavye}
              aria-activedescendant={secili ? optIdOf(secili.id) : undefined} {...icOdak}
              style={{ ...defterZemini, flex: 1, minHeight: genis ? 0 : SATIR_H * 3, overflowY: "auto", outline: "none",
                maxHeight: genis ? undefined : 420 }}>
              {sonuc.map((h, i) => (
                <KuyrukSatiri key={h.id} h={h} konu={h.konu} sira={i + 1} secili={secili?.id === h.id} optId={optIdOf(h.id)}
                  onSec={() => { if (!sendBusy) setSeciliId(h.id); }} onAc={() => { if (!sendBusy) acDuzenle(h.id); }} />
              ))}
            </div>
            {genis && sonuc.length > 0 && (
              <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.m, height: 30, flexShrink: 0, padding: "0 14px", whiteSpace: "nowrap", overflow: "hidden", borderTop: `1px solid ${PAL.line}`, background: PAL.surf2, fontFamily: MONO, fontSize: 11, color: PAL.mut3 }}>
                <span><Tus>↑</Tus><Tus>↓</Tus> seç</span>
                <span><Tus>↵</Tus> aç</span>
                <span><Tus>G</Tus> gönder</span>
                <span><Tus>K</Tus> kurul</span>
              </div>
            )}
          </div>
          {secili && (
            <KararPaneli key={secili.id} h={secili} konu={secili.konu} govde={secili._govde}
              sira={sonuc.findIndex((d) => d.id === secili.id) + 1} toplam={sonuc.length}
              tamMetin={secili.result?.yazi_taslak_md} genis={genis} sutunH={sutunH} sendBusy={sendBusy} komut={komut}
              onDuzenle={() => acDuzenle(secili.id)} onKurul={() => acKurul(secili.id)}
              onGonder={() => gonderImzali(secili, secili.result.yazi_taslak_md)} onSil={() => sil(secili)} />
          )}
        </div>
      )}

      {imza && <TaslakImza key={imza.k} kare={imza} onBitti={imzaBitti} />}

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
            const ok = await gonderImzali(kurulAktif, metin);
            if (ok) { onToast("Kurul onayıyla taslak Giden Evrak'a gönderildi."); setKurulId(null); }
            return ok;
          }} />
      )}
    </ViewWrap>
  );
}
