/* kabukAtomlari — kabuk düzeyindeki paylaşılan durum ve kimlik atomları (tur 6, A-kabuk).
   neonUi.jsx token + temel atomları taşır (800 satır sınırına yakın); bu dosya onların
   üstüne kurulan, birden çok ekranın ORTAK konuştuğu "durum dili"dir:
     · Logotype   — tek yazım "KAMU-EVRAK" (rayda orta nokta, girişte tire vardı).
     · SayiRozet  — sayı + aciliyet (gecikmiş kısmı ACELE kırmızısı), bayat veri hâli.
     · HataFisi   — tek hata lehçesi: künye (HATA KAYDI · saat) · başlık · ne yapılmalı ·
                    "Yeniden dene" · <details> teknik ayrıntı. HataSiniri/ErrorBar bundan türer;
                    görünüm bantları (Panel/Giden…) aynı atomu kullanmalı.
     · DenemeKunye — react-query yeniden denerken iskeletin üstündeki mono "2. deneme…" satırı.
     · fisToast   — bildirimler zımbalı "havale pusulası": ton (işlendi/bilgi/uyarı/hata) sol
                    kenar çizgisi + mono künye + kesikli ayraç. Ton çağırandan ya da metinden. */
import { useEffect, useRef } from "react";
import { toast as sonnerToast } from "sonner";
import { PAL, T, DERIN, BANT, ALFA, MONO, DISPLAY, TYPE, TNUM, RAD, SP, SH, Icon, Btn, focusRing } from "./neonUi.jsx";
import { toastTonu, TON_META } from "../lib/toastTon.js";

export const LOGOTYPE = "KAMU-EVRAK";

/* Logotype — Archivo geniş kesim, büyük harf (marka istisnası) + ACELE kırmızısı imza noktası.
   TEK atom (tur 8): giriş ekranı da bunu kullanır — ölçüler (14 px · %112 · .02em) her yerde aynı.
   dalga: imlece yakın harfler genişlik ekseninde daralır, uzaklaşınca açılır (yalnız pointer:fine
   + hareket azaltılmamışsa; harf merkezleri dinlenmede ölçülüp önbelleğe alınır, rAF ile kare
   başına tek yazım). Kabukta kapalı — günlük iş aracında marka oynamaz. */
const LOGO_GENISLIK = 112;
function useLogoDalga(ref, acik) {
  useEffect(() => {
    const kok = ref.current;
    if (!acik || !kok || !window.matchMedia?.("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const harfler = [...kok.querySelectorAll("[data-harf]")];
    let merkez = [], raf = 0, px = -1e4, py = -1e4;
    const olc = () => { merkez = harfler.map((h) => { const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); };
    const ciz = () => {
      raf = 0;
      harfler.forEach((h, n) => {
        const k = Math.max(0, 1 - Math.hypot(px - merkez[n][0], py - merkez[n][1]) / 90);
        h.style.fontStretch = `${LOGO_GENISLIK - 40 * k * k * (3 - 2 * k)}%`;
      });
    };
    const hareket = (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(ciz); };
    const zaman = setTimeout(olc, 900);   // giriş koreografisi oturduktan sonra ölç
    document.fonts?.ready.then(olc);
    window.addEventListener("pointermove", hareket, { passive: true });
    window.addEventListener("resize", olc);
    return () => { clearTimeout(zaman); cancelAnimationFrame(raf); window.removeEventListener("pointermove", hareket); window.removeEventListener("resize", olc); };
  }, [ref, acik]);
}
export function Logotype({ boy = 14, nokta = true, dalga = false }) {
  const ref = useRef(null);
  useLogoDalga(ref, dalga);
  const yazi = { fontFamily: DISPLAY, fontSize: boy, lineHeight: "24px", fontWeight: 800, fontStretch: `${LOGO_GENISLIK}%`, letterSpacing: ".02em", color: PAL.ink, whiteSpace: "nowrap" };
  return (
    <span ref={ref} {...(dalga ? { role: "img", "aria-label": LOGOTYPE } : null)} style={{ display: "inline-flex", alignItems: "baseline", gap: SP.xs, minWidth: 0 }}>
      {dalga
        ? <span aria-hidden="true" style={yazi}>{[...LOGOTYPE].map((h, n) => <span key={n} data-harf="" style={{ fontStretch: `${LOGO_GENISLIK}%`, transition: "font-stretch .35s var(--ke-ease-out)" }}>{h}</span>)}</span>
        : <span style={yazi}>{LOGOTYPE}</span>}
      {nokta && <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: RAD.dot, background: "var(--ke-r)", flexShrink: 0 }} />}
    </span>
  );
}

const saatYaz = () => new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/* SayiRozet — kenar çubuğu/alt şerit sayacı. acil>0 → "acil/toplam" ve acil kısım kırmızı çerçeveli
   (Panel'deki "9 GECİKMİŞ" damgasıyla aynı olgu kabuğun her yerinden okunur; hareket yok).
   bayat: kaynağın son denemesi hata verdi → soluk + kesikli çerçeve. n null + bayat: sayı HİÇ
   bilinmiyor → "—" (00 yazmak yanlış olgu olurdu). */
export function SayiRozet({ n, acil = 0, bayat = false, bekliyor = false, etkin = false, kucuk = false }) {
  const bilinmiyor = n == null && bayat;
  const yukleniyor = n == null && bekliyor && !bayat;
  if (!(n > 0) && !bilinmiyor && !yukleniyor) return null;
  const temel = { position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, ...TYPE.meta, ...TNUM, fontWeight: 600, borderRadius: 999, whiteSpace: "nowrap" };
  const boyut = kucuk ? { fontSize: 10, lineHeight: "14px", minWidth: 16, height: 16, padding: "0 4px", justifyContent: "center" } : { minWidth: 22, padding: "1px 7px", justifyContent: "center" };
  /* Bekliyor (tur 8): sayı gelmeden önce rozet YERİNİ tutar — sayı gelince satır zıplamaz. Sakin
     opaklık nabzı; "—" (yanıt yok) ile karışmaz. */
  if (yukleniyor) {
    return <span aria-label="sayı yükleniyor" style={{ ...temel, ...boyut, color: PAL.mut3, background: kucuk ? PAL.bg : etkin ? "transparent" : PAL.surfHi }}><span aria-hidden="true" style={{ animation: "nu-think 1.2s ease-in-out infinite" }}>··</span></span>;
  }
  if (bayat) {
    const etiket = bilinmiyor ? "sayı bilinmiyor (sunucu yanıtsız)" : `${n} öğe (son bilinen)`;
    return <span aria-label={etiket} title={bilinmiyor ? "Sunucuya ulaşılamadı — sayı bilinmiyor" : "Son bilinen değer — sunucuya ulaşılamadı"} style={{ ...temel, ...boyut, color: PAL.mut3, background: kucuk ? PAL.bg : "transparent", border: `1px dashed ${PAL.lineHi}` }}>{bilinmiyor ? "—" : n}</span>;
  }
  const etiket = `${n} öğe${acil > 0 ? `, ${acil} gecikmiş` : ""}`;
  /* Etkin sırt sayfa zemininde durur → kırmızı da SAYFANIN kırmızısıdır (ray mercanı açık kâğıtta
     1,7:1 kalıyordu; temaKontrast.test "sırt üstü kırmızı"). */
  const kirmizi = etkin ? "var(--ke-sayfa-kirmizi)" : "var(--ke-derin-kirmizi)";
  if (acil > 0 && !kucuk) {
    return (
      <span aria-label={etiket} style={{ ...temel, ...boyut, padding: "0 2px 0 0", gap: 0, color: etkin ? "var(--ke-sayfa-ink)" : PAL.ink2, background: etkin ? "transparent" : PAL.surfHi }}>
        <span style={{ padding: "0 6px", borderRadius: 999, border: `1px solid ${kirmizi}`, color: kirmizi }}>{acil}</span>
        <span style={{ padding: "0 5px 0 3px" }}>/ {n}</span>
      </span>
    );
  }
  /* Küçük (dar ray / alt şerit): yer tek sayılık. Gecikmiş varsa ACİL sayı kırmızı çizilir
     (renk hangi sayıyı işaret ediyorsa o sayı yazılır — "15" kırmızı "15 gecikmiş" okunuyordu);
     toplam ipucunda ve aria-label'da. Gecikmiş yoksa toplam, nötr. */
  const acilVar = acil > 0;
  /* Tur 9 (j2: dar rayda Gelen ve Taslak rozetleri yalnız renkle ayrılıyordu): ACİL rozet DOLU pul
     (kırmızı zemin, zemin renginde rakam), olağan rozet çerçeveli — renk tek sinyal değil, biçim de. */
  if (acilVar && kucuk) {
    return <span aria-label={etiket} style={{ ...temel, ...boyut, color: etkin ? "var(--ke-sayfa)" : PAL.bg, background: kirmizi, border: `1px solid ${kirmizi}` }}>{acil}</span>;
  }
  return (
    <span aria-label={etiket} style={{ ...temel, ...boyut, color: acilVar ? kirmizi : etkin ? "var(--ke-sayfa-ink)" : PAL.ink2, background: kucuk ? (etkin ? "var(--ke-sayfa)" : PAL.bg) : etkin ? "transparent" : PAL.surfHi, border: acilVar ? `1px solid ${kirmizi}` : kucuk ? `1px solid ${PAL.lineHi}` : "none" }}>{acilVar && kucuk ? acil : n}</span>
  );
}

/* Künye satırı — mono büyük harf etiket ——— saat (hata fişi, toast, deneme ortak). */
function Kunye({ sol, sag, renk = PAL.mut3 }) {
  return (
    <div aria-hidden="true" style={{ ...TYPE.antet, color: renk, display: "flex", alignItems: "center", gap: SP.m, textTransform: "uppercase" }}>
      <span style={{ whiteSpace: "nowrap" }}>{sol}</span>
      <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
      {sag && <span style={{ whiteSpace: "nowrap", ...TNUM }}>{sag}</span>}
    </div>
  );
}

/* HataFisi — sistemin TEK hata lehçesi. ton: "hata" (kırmızı) | "uyari" (sarı: geçici, kendiliğinden
   düzelebilir). onYenidenDene verilirse birincil eylem odur (refetch / bölümü sıfırla).
   ikincil: ek düğmeler (ör. "Sayfayı yenile"). kompakt: yüzen çubuk (ErrorBar) ölçüsü. */
export function HataFisi({ baslik, children, ton = "hata", zaman, onYenidenDene, yenidenDeneEtiket = "Yeniden dene", ikincil, teknik, kompakt = false, onKapat, style }) {
  const cizgi = ton === "uyari" ? BANT.sari.c : BANT.kirmizi.c;
  const derin = ton === "uyari" ? DERIN.sari : DERIN.kirmizi;
  const z = zaman || saatYaz();
  return (
    <section role="alert" style={{ position: "relative", width: "100%", background: PAL.surfPop, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${cizgi}`, borderRadius: kompakt ? RAD.pop : RAD.card, boxShadow: kompakt ? SH.modal : SH.card, padding: kompakt ? "12px 12px 12px 14px" : `${SP.l}px ${SP.xl}px ${SP.xl}px`, animation: "nu-rise .24s var(--ke-ease-out) both", boxSizing: "border-box", ...style }}>
      <Kunye sol={ton === "uyari" ? "Uyarı kaydı" : kompakt ? "İşlem durdu" : "Hata kaydı"} sag={z} />
      <div style={{ display: "flex", gap: SP.m, alignItems: "flex-start", marginTop: kompakt ? SP.s : SP.m }}>
        <span aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0, width: kompakt ? 24 : 32, height: kompakt ? 24 : 32, borderRadius: RAD.ctl, background: ALFA(cizgi), color: derin }}>
          <Icon.alert width={kompakt ? 13 : 16} height={kompakt ? 13 : 16} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          {baslik && <h2 style={{ margin: 0, ...TYPE.h2, fontSize: kompakt ? 15 : 18, lineHeight: kompakt ? "20px" : "24px", color: PAL.ink }}>{baslik}</h2>}
          {children && <div style={{ margin: baslik ? `${SP.xs}px 0 0` : 0, ...(kompakt ? TYPE.data : TYPE.ui), color: baslik ? PAL.mut2 : PAL.ink, maxWidth: 560, overflowWrap: "anywhere" }}>{children}</div>}
        </div>
        {onKapat && (
          <button type="button" onClick={onKapat} aria-label="Bildirimi kapat" {...focusRing} data-press=""
            style={{ cursor: "pointer", display: "grid", placeItems: "center", width: 28, height: 28, flexShrink: 0, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "transparent", color: PAL.mut, transition: "transform .14s var(--ke-ease-out)" }}><Icon.x /></button>
        )}
      </div>
      {(onYenidenDene || ikincil) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: SP.s, marginTop: kompakt ? SP.m : SP.l, paddingLeft: kompakt ? 36 : 44 }}>
          {onYenidenDene && <Btn primary={!kompakt} onClick={onYenidenDene} style={kompakt ? { minHeight: 32, padding: "4px 12px" } : undefined}><Icon.undo />{yenidenDeneEtiket}</Btn>}
          {ikincil}
        </div>
      )}
      {teknik && (
        <details style={{ marginTop: SP.m, paddingLeft: kompakt ? 36 : 44 }}>
          <summary style={{ cursor: "pointer", listStyle: "none", display: "inline-flex", alignItems: "center", gap: SP.xs, borderRadius: RAD.chip, padding: "2px 4px", margin: "0 -4px", ...TYPE.meta, color: PAL.mut2 }}>
            <span aria-hidden="true" className="mev-chevron" style={{ display: "flex", transition: "transform .14s ease-out" }}><Icon.okSag width={12} height={12} /></span>Teknik ayrıntı
          </summary>
          <code style={{ display: "block", marginTop: SP.s, padding: "8px 10px", borderRadius: RAD.ctl, background: PAL.surf2, border: `1px solid ${PAL.line}`, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.ink2, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{teknik}</code>
        </details>
      )}
    </section>
  );
}

/* DenemeKunye — sorgu yeniden denenirken iskeletin ÜSTÜNDE: "Sunucuya 2. kez yazıldı". 10 sn sessiz
   iskelet "donmuş" okunuyordu (jüri). deneme = react-query failureCount (0 → hiç çizilmez). */
export function DenemeKunye({ deneme = 0, toplam = 3, kenar = 0 }) {
  if (!(deneme > 0)) return null;
  return (
    <div role="status" style={{ ...TYPE.antet, textTransform: "uppercase", color: DERIN.sari, display: "flex", alignItems: "center", gap: SP.s, marginBottom: kenar }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: RAD.dot, border: `1.5px solid ${DERIN.sari}`, borderRightColor: "transparent", animation: "nu-spin .9s linear infinite", flexShrink: 0 }} />
      <span style={TNUM}>Sunucuya {deneme + 1}. kez yazıldı · en çok {toplam + 1}</span>
    </div>
  );
}

/* Bildirim fişi — zımbalı havale pusulası. Kâğıt yüzey (surfPop), sol kenar ton çizgisi, sol üstte
   zımba teli, mono künye (saat · TON), kesikli ayraç, gövde. Eğik değil (ciddiyet kuralı). */
const TON_RENK = { basari: BANT.yesil.c, bilgi: T, uyari: BANT.sari.c, hata: BANT.kirmizi.c };
const TON_DERIN = { basari: DERIN.yesil, bilgi: DERIN.T, uyari: DERIN.sari, hata: DERIN.kirmizi };
function ToastFisi({ metin, ton, saat, onKapat }) {
  const meta = TON_META[ton] || TON_META.bilgi;
  return (
    <div data-ke-toast={ton} style={{ position: "relative", width: "min(380px, calc(100vw - 32px))", boxSizing: "border-box", background: PAL.surfPop, color: PAL.ink, border: `1px solid ${PAL.lineHi}`, borderLeft: `3px solid ${TON_RENK[ton]}`, borderRadius: RAD.ctl, boxShadow: SH.modal, padding: "10px 12px 12px 14px", fontFamily: "inherit" }}>
      {/* Zımba teli (tur 8): köşeli parantez 1x'te piksel artığı gibi okunuyordu. Gerçek zımba: kâğıdın
          üst kenarını delip geçen İKİ kısa paralel tel — kenarın 2 px dışına taşar, metal ton (mut3). */}
      <span aria-hidden="true" style={{ position: "absolute", left: 14, top: -2, width: 2, height: 9, borderRadius: 1, background: PAL.mut3 }} />
      <span aria-hidden="true" style={{ position: "absolute", left: 20, top: -2, width: 2, height: 9, borderRadius: 1, background: PAL.mut3 }} />
      <div style={{ ...TYPE.antet, fontSize: 10, textTransform: "uppercase", color: TON_DERIN[ton], display: "flex", alignItems: "center", gap: SP.s }}>
        <span aria-hidden="true" style={{ display: "contents" }}><span style={TNUM}>{saat}</span><span>·</span><span>{meta.kunye}</span></span>
        <span aria-hidden="true" style={{ flex: 1 }} />
        <button type="button" onClick={onKapat} aria-label="Bildirimi kapat" {...focusRing}
          style={{ cursor: "pointer", display: "grid", placeItems: "center", width: 44, height: 44, margin: "-15px -14px -15px 0", border: "none", borderRadius: RAD.ctl, background: "transparent", color: PAL.mut2 }}><Icon.x width={12} height={12} /></button>
      </div>
      <div aria-hidden="true" style={{ margin: "6px 0 6px", borderTop: `1px dashed ${PAL.lineHi}` }} />
      <div style={{ ...TYPE.ui, fontWeight: 500, color: PAL.ink, overflowWrap: "anywhere" }}>{metin}</div>
    </div>
  );
}

/* fisToast — sonner'a özel çizimle bildirim basar. ton verilmezse metinden çıkarılır (lib/toastTon). */
export function fisToast(metin, secenek = {}) {
  const ton = secenek.ton || toastTonu(metin);
  const saat = saatYaz();
  return sonnerToast.custom((id) => <ToastFisi metin={metin} ton={ton} saat={saat} onKapat={() => sonnerToast.dismiss(id)} />, { duration: secenek.sure || (TON_META[ton] || TON_META.bilgi).sure });
}
