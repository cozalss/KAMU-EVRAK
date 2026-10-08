/* AuthMasa — giriş ekranının "masa" sahnesi (Antet & Damga, 2026-10).
   Masanın üstüne resmî bir yazı düşer; ajan onu SATIR SATIR okur (okuma şeridi), künyesini
   çıkarır (yan defterde: tür · konu · maskeli başvuran), sorumlu birime HAVALE fişi iliştirir
   ve en sonunda kâğıda KAYDA ALINDI mührü basılır. Sonra kâğıt masadan kayar, sıradaki gelir.
   Üç SENTETİK evrak döngüde işlenir (gerçek kurum/kişi yok — CLAUDE.md §2); yasal süreler
   doğru kanundan: dilekçe 3071 → 30 gün, bilgi edinme 4982 → 15 iş günü.
   aria-hidden salt-sunum demo — ekran okuyucuya hiçbir şey vaat etmez.
   Reduced-motion: zamanlayıcı başlamaz, mühürlü son kare sabit durur (useReducedMotion).
   Tur 6: kâğıt ve fiş eğimsiz; "T.C." yalnız idare yazısının antetidir, dilekçede yok.
   Koyu tema (tur 4, jüri A#26): kâğıt GECE DE KÂĞITTIR — sahne [data-evrak-kagit] kapsamında
   çizilir; THEME_CSS koyu temada o alt ağacın token'larını sıcak, kısık kâğıda çevirir
   (A4 taslakla aynı --ke-kagit). Lacivert "kâğıt" metaforu iki ekranda iki türlü anlatıyordu. */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PAL, T, V, DERIN, ALFA, MONO, SANS, DISPLAY, TYPE, TNUM, RAD, SP, SH, EASE_BEZIER, Damga, Icon } from "./neonUi.jsx";

const EVRAKLAR = [
  {
    kurum: "ÖRNEKKENT BELEDİYE BAŞKANLIĞINA", sayi: "Başvuru · 28.09.2026", no: "E-2026/1449",
    konu: "Sokak aydınlatması arızası hk.",
    govde: [
      "Mahallemizdeki 14. Sokak'ta bulunan aydınlatma",
      "direkleri iki haftadır çalışmamaktadır. Akşam",
      "saatlerinde yaya güvenliği tehlikeye girmekte,",
      "okul dönüşü öğrenciler karanlıkta yürümektedir.",
      "Arızanın en kısa sürede giderilmesi için",
      "gereğinin yapılmasını arz ederim.",
    ],
    imza: "Ayşe Yılmaz", alt: [["Adres", "Işık Mah. 14. Sokak No: 3, Örnekkent"], ["Tel", "0555-123-4567"]], tur: "Dilekçe", ozet: "Aydınlatma arızası", kisi: "A*** Y*****",
    birim: "Fen İşleri Müdürlüğü", sure: "30 gün · 3071",
  },
  {
    kurum: "ÖRNEK İL VALİLİĞİNE", sayi: "Başvuru · 30.09.2026", no: "E-2026/1502",
    konu: "Bilgi edinme başvurusu hk.",
    govde: [
      "2025 yılında ilimizde yürütülen okul onarım",
      "projelerinin sayısı, toplam bedeli ve",
      "yüklenici firmalara ilişkin bilgilerin",
      "4982 sayılı Kanun kapsamında tarafıma",
      "elektronik posta yoluyla verilmesini",
      "saygılarımla arz ederim.",
    ],
    imza: "Mehmet Kaya", alt: [["Adres", "Cumhuriyet Mah. 5. Cad. No: 12, Örnek"], ["Tel", "0555-123-4567"]], tur: "Bilgi edinme", ozet: "Okul onarım verileri", kisi: "M***** K***",
    birim: "Bilgi Edinme Birimi", sure: "15 iş günü · 4982",
  },
  {
    kurum: "ÖRNEKKENT BELEDİYE BAŞKANLIĞINA", sayi: "Sayı · E-71205-2026", no: "E-2026/1517",
    konu: "Kazı izni talebi hk.",
    govde: [
      "Şirketimizce Cumhuriyet Caddesi boyunca",
      "yürütülecek yer altı kablo yenileme çalışması",
      "için 12.10.2026 – 30.10.2026 tarihleri arasında",
      "kazı izni verilmesi hususunda gereğini",
      "bilgilerinize arz ederim.",
      "Ek: Güzergâh krokisi (1 sayfa)",
    ],
    antet: "ÖRNEK ELEKTRİK DAĞITIM A.Ş.",
    imza: "Genel Müdür Yrd.", alt: [["Gereği", "Örnekkent Belediye Başkanlığı"], ["Bilgi", "Örnek EDAŞ Bölge Müdürlüğü"]], tur: "Kurum yazısı", ozet: "Kazı izni", kisi: "Örnek EDAŞ",
    birim: "İmar ve Şehircilik Md.", sure: "Kurum içi · normal",
  },
];

// Zaman çizelgesi (ms). adım: 0 giriş · 1..6 okuma satırları · 7 havale · 8 mühür · 9 çıkış.
// Çıkış kısa (tur 8: 650 → 420 ms) — kâğıt uzun süre yarı saydam kalınca sahne "sönüyor" okunuyordu.
const SURE = [820, 400, 400, 400, 400, 400, 400, 1150, 2100, 420];
const SON_ADIM = SURE.length - 1;
const OKUMA_ILK = 1, HAVALE = 7, MUHUR = 8, CIKIS = 9;
const SATIR = 17;

// Yan defter satırları — hangi adımda "işlendi" sayıldıkları + değerleri.
const DEFTER = [
  { k: "Okundu", adim: 2, v: (e) => `${e.tur} · ${e.ozet}` },
  { k: "Maskelendi", adim: 5, v: (e) => e.kisi, mono: true },
  { k: "Havale", adim: HAVALE, v: (e) => e.birim },
  { k: "Kayıt", adim: MUHUR, v: (e) => `${e.no} · ${e.sure}`, mono: true },
];

/* dondur (tur 8): formda hata ya da kilit varken döngü DURUR — sahne mühürlü son karede bekler
   (çıkış fazında gelen bir uyarı, sahne sönerken "her şey kapanıyor" gibi okunuyordu). Döngü çıkış
   ya da giriş fazındaysa önce mühür karesine oturur. */
function useSahne(dondur) {
  const azalt = useReducedMotion();
  const [d, setD] = useState({ i: 0, adim: azalt ? MUHUR : 0 });
  useEffect(() => {
    if (azalt) return undefined;
    if (dondur) {
      if (d.adim !== MUHUR) setD((s) => ({ ...s, adim: MUHUR }));
      return undefined;
    }
    const t = setTimeout(() => {
      setD((s) => (s.adim >= SON_ADIM ? { i: (s.i + 1) % EVRAKLAR.length, adim: 0 } : { ...s, adim: s.adim + 1 }));
    }, SURE[d.adim]);
    return () => clearTimeout(t);
  }, [d, azalt, dondur]);
  return { evrak: EVRAKLAR[d.i], i: d.i, adim: azalt ? MUHUR : d.adim };
}

/* Yan defter — sicil defteri satırları: mono künye etiketi + değer; bekleyen satır soluk
   kesik çizgi, çalışan satırda nabız noktası, biten satırda tik. Renk tek sinyal değil:
   durum hem ikonla hem metinle (değer yalnız bitince yazılır). */
function Defter({ evrak, adim }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", borderTop: `1px solid ${PAL.lineHi}` }}>
      {DEFTER.map((r, n) => {
        const bitti = adim >= r.adim && adim < CIKIS + 1;
        const onceki = n === 0 ? OKUMA_ILK - 1 : DEFTER[n - 1].adim;
        const calisiyor = !bitti && adim > onceki;
        return (
          <li key={r.k} style={{ display: "grid", gridTemplateColumns: "20px 96px minmax(0,1fr)", alignItems: "center", gap: SP.s, padding: "10px 0", borderBottom: `1px solid ${PAL.line}` }}>
            <span style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: RAD.dot, border: `1.5px ${bitti ? "solid" : "dashed"} ${bitti ? DERIN.T : PAL.lineHi}`, background: bitti ? DERIN.T : "transparent", color: PAL.onAccent, transition: "background .2s ease, border-color .2s ease" }}>
              {bitti ? <Icon.check width={11} height={11} strokeWidth={2.6} /> : calisiyor ? <span style={{ width: 6, height: 6, borderRadius: RAD.dot, background: T, animation: "nu-think 1s infinite" }} /> : null}
            </span>
            <span style={{ ...TYPE.antet, textTransform: "uppercase", color: bitti ? PAL.ink2 : PAL.mut3 }}>{r.k}</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(r.mono ? { fontFamily: MONO, fontSize: 12, lineHeight: "16px" } : TYPE.data), color: PAL.ink, fontWeight: r.mono ? 500 : 600 }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={bitti ? `${evrak.no}-${r.k}` : "bos"} style={{ display: "inline-block" }}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.28, ease: EASE_BEZIER.out }}>
                  {bitti ? r.v(evrak) : <span style={{ color: calisiyor ? PAL.mut2 : PAL.mut3, fontWeight: 400 }}>{calisiyor ? "işleniyor…" : "—"}</span>}
                </motion.span>
              </AnimatePresence>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Islak imza — mavi tükenmez çizgisi (stroke çizim animasyonu, mühürden önce kâğıtta hazır).
function Imza() {
  return (
    <svg width="96" height="30" viewBox="0 0 96 30" fill="none" aria-hidden="true">
      <path d="M3 21 C10 6 16 4 15 15 C14 24 9 26 12 18 C16 9 24 8 26 16 C27 21 30 20 34 13 C37 8 40 12 39 18 C42 12 47 10 50 15 C53 20 57 19 62 12 C66 7 70 11 68 17 C74 13 82 12 93 9"
        stroke={T} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
    </svg>
  );
}

/* Kâğıt — resmî yazı düzeni (Yönetmelik biçimi: muhatap, konu, gövde, imza). Okuma şeridi
   gövdenin üzerinde satır satır iner; okunan satırlar mürekkep tonuna koyulaşır. */
function Kagit({ evrak, adim }) {
  const okunan = adim - OKUMA_ILK; // -1..5 okuma sırasında; sonra ≥6
  const okumada = adim >= OKUMA_ILK && adim < HAVALE;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: 3, boxShadow: SH.kagit, padding: "34px 34px 0", boxSizing: "border-box", overflow: "hidden", fontFamily: SANS, color: PAL.ink2 }}>
      {/* kâğıt lifi */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${GRAIN}")`, backgroundSize: "140px", opacity: 0.06, mixBlendMode: "multiply", pointerEvents: "none" }} />
      {/* Tur 6 (jüri): vatandaş dilekçesi "T.C." ile başlamaz — o, İDARENİN yazısının antetidir.
          Dilekçe muhatap satırıyla açılır; şirket yazısı kendi antetini (gönderen) taşır. */}
      {evrak.antet && <div style={{ textAlign: "center", fontFamily: DISPLAY, fontWeight: 800, fontStretch: "118%", fontSize: 10.5, lineHeight: "14px", letterSpacing: ".1em", color: PAL.ink, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${PAL.line}` }}>{evrak.antet}</div>}
      <div style={{ textAlign: "center", fontFamily: DISPLAY, fontWeight: 700, fontStretch: "110%", fontSize: 10.5, lineHeight: "14px", letterSpacing: ".06em", color: PAL.ink }}>{evrak.kurum}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontFamily: MONO, fontSize: 9.5, lineHeight: "13px", color: PAL.mut }}>
        <span>{evrak.sayi}</span><span style={TNUM}>{evrak.no}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: "14px" }}>
        <span style={{ color: PAL.mut }}>Konu : </span><span style={{ fontWeight: 600, color: PAL.ink }}>{evrak.konu}</span>
      </div>
      <div style={{ position: "relative", marginTop: 22, fontSize: 11, lineHeight: `${SATIR}px` }}>
        <motion.div aria-hidden="true"
          animate={{ y: Math.max(0, Math.min(okunan, evrak.govde.length - 1)) * SATIR, opacity: okumada ? 1 : 0 }}
          transition={{ duration: 0.34, ease: EASE_BEZIER.inOut }}
          style={{ position: "absolute", left: -8, right: -8, top: 0, height: SATIR, borderRadius: 3, background: ALFA(T), borderLeft: `2px solid ${T}` }} />
        {evrak.govde.map((s, n) => (
          <div key={n} style={{ position: "relative", whiteSpace: "nowrap", color: n <= okunan ? PAL.ink : PAL.mut, transition: "color .3s ease", textIndent: n === 0 ? 18 : 0 }}>{s}</div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 26 }}>
        <div style={{ textAlign: "center" }}>
          <Imza />
          <div style={{ fontSize: 10.5, lineHeight: "14px", fontWeight: 600, color: PAL.ink }}>{evrak.imza}</div>
        </div>
      </div>
      {/* Tur 9 (j2: kâğıdın alt yarısı boştu, "yarım kâğıt"): yazının KENDİ alt ögeleri — dilekçede
          adres/telefon, kurum yazısında Gereği/Bilgi dağıtımı; tabanda kayıt bandı + paraf zinciri. */}
      <dl style={{ margin: "18px 0 0", display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", columnGap: 6, rowGap: 2, fontSize: 9.5, lineHeight: "13px" }}>
        {evrak.alt.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt style={{ color: PAL.mut }}>{k} :</dt><dd style={{ margin: 0, color: PAL.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</dd></div>)}
      </dl>
      <KayitBandi evrak={evrak} />
    </div>
  );
}

/* Kayıt bandı — kâğıdın tabanı: gelen evrak kaydı künyesi + paraf zinciri (memur → şef → müdür).
   Paraf kutuları boş (kayıt yeni); yalnız memurunki mühürle birlikte dolar. */
const PARAF = ["Memur", "Şef", "Müdür"];
function KayitBandi({ evrak }) {
  return (
    <div style={{ position: "absolute", left: 34, right: 34, bottom: 22, fontFamily: MONO, fontSize: 9, lineHeight: "12px", color: PAL.mut, ...TNUM }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 10, marginBottom: 12 }}>
        {PARAF.map((p) => (
          <div key={p} style={{ display: "grid", gap: 3 }}>
            <span style={{ height: 18, borderBottom: `1px dotted ${PAL.lineHi}` }} />
            <span style={{ textTransform: "uppercase", letterSpacing: ".06em" }}>Paraf · {p}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 6, borderTop: `1px dashed ${PAL.lineHi}`, textTransform: "uppercase", letterSpacing: ".04em" }}>
        <span>Gelen evrak kaydı · {evrak.no}</span><span>Sayfa 1/1</span>
      </div>
    </div>
  );
}

const GRAIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
export { GRAIN };

/* Havale fişi — kâğıdın sol kenarına iliştirilen küçük fiş (ataşla). */
function HavaleFisi({ evrak }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.42, ease: EASE_BEZIER.out }}
      /* Tur 9 (j2: fiş imza bloğuna ve imza sahibinin adına biniyordu, ataç imzanın içine düşüyordu):
         imza + alt künye bitince (≈340 px) kâğıdın SAĞ KENARINA zımbalanır; damga solda, arada ≥16 px. Taşma 14 px (j1: -40 forma
         ~9 px biniyordu) → fiş ile form kartı arasında ≥16 px boşluk kalır. */
      style={{ position: "absolute", right: -14, top: 362, zIndex: 3, width: 176, padding: "10px 12px 11px", background: PAL.surf2, border: `1px solid ${PAL.lineHi}`, borderRadius: 3, boxShadow: SH.pop }}>
      {/* Zımba teli — fişi kâğıt kenarına tutturan iki bacaklı tel (ataç değil). */}
      <span aria-hidden="true" style={{ position: "absolute", left: 22, top: 7, width: 18, height: 4, borderRadius: 1, border: `1.5px solid ${PAL.mut3}`, borderBottom: "none" }} />
      <div style={{ ...TYPE.antet, fontSize: 10, color: DERIN.V, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon.route width={12} height={12} /> Havale
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontStretch: "106%", fontSize: 14, lineHeight: "18px", color: PAL.ink, marginTop: 4 }}>{evrak.birim}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: "14px", color: PAL.mut, marginTop: 3, ...TNUM }}>Süre: {evrak.sure}</div>
    </motion.div>
  );
}

/* Künye sayıları — sistemin ölçeği; büyük Archivo rakam + mono etiket (sicil defteri altı). */
const SAYILAR = [["15", "işlem adımı"], ["304", "mevzuat kaynağı"], ["4.066", "kurum sicili"]];
function Sayilar() {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", justifyContent: "start", columnGap: SP.xxl, margin: 0 }}>
      {SAYILAR.map(([n, l]) => (
        <div key={l} style={{ display: "grid", gap: 2 }}>
          <dt style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>{l}</dt>
          <dd style={{ margin: 0, order: -1, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "118%", fontSize: 34, lineHeight: "36px", letterSpacing: "-.03em", color: PAL.ink, ...TNUM }}>{n}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AuthMasa({ dondur = false }) {
  const { evrak, i, adim } = useSahne(dondur);
  const cikiyor = adim === CIKIS;
  return (
    /* Izgara (tur 4, jüri A#27/C#23): defter sütunu 520 px'te durur, kâğıt sağa yaslanır —
       1920'de defter 880 px'e yayılıp sayılar ekranın dibine düşüyordu. Sayılar defterin hemen
       altında: masa dağınık değil, tek bir fiş + kâğıt. */
    <div aria-hidden="true" className="ke-masa" style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 520px) minmax(0, 400px)", justifyContent: "space-between", columnGap: SP.xxxl, alignItems: "start", minHeight: 0, height: "100%" }}>
      <div className="ke-masa-defter" style={{ display: "flex", flexDirection: "column", gap: SP.xxl + SP.s, paddingTop: SP.s, minWidth: 0, boxSizing: "border-box" }}>
        <div>
        <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", display: "flex", justifyContent: "space-between", marginBottom: SP.s }}>
          <span>Evrak fişi</span><span style={TNUM}>{String(i + 1).padStart(2, "0")} / {String(EVRAKLAR.length).padStart(2, "0")}</span>
        </div>
        <Defter evrak={evrak} adim={adim} />
        <p style={{ ...TYPE.meta, color: PAL.mut3, margin: `${SP.m}px 0 0` }}>Sentetik örnek evrak · canlı sistemde her adım denetim izine yazılır.</p>
        </div>
        <Sayilar />
      </div>

      <div style={{ position: "relative", height: "100%", minHeight: 0, width: "100%", maxWidth: 400, justifySelf: "center" }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={evrak.no} data-evrak-kagit=""
            /* Kâğıt DÜZ durur (tur 6, ciddiyet: eğik kâğıt kusur). Hareket yalnız dikey kayma +
               opaklık — kayıt masasına oturur, işlenince yukarı kalkıp çekilir. Eğim yalnız damgada. */
            initial={{ opacity: 0, y: 24 }}
            animate={cikiyor ? { opacity: 0, y: -16 } : { opacity: 1, y: 0 }}
            transition={cikiyor ? { duration: 0.36, ease: EASE_BEZIER.inOut } : { duration: 0.7, ease: EASE_BEZIER.out }}
            style={{ position: "absolute", left: 0, right: 0, top: 0, height: 560, transformOrigin: "50% 80%" }}>
            <motion.div style={{ width: "100%", height: "100%" }}
              animate={adim === MUHUR ? { scale: [1, 0.988, 1] } : { scale: 1 }}
              transition={{ duration: 0.32, delay: 0.16, ease: EASE_BEZIER.out }}>
              <Kagit evrak={evrak} adim={adim} />
            </motion.div>
            <AnimatePresence>{adim >= HAVALE && <HavaleFisi key="fis" evrak={evrak} />}</AnimatePresence>
            {adim >= MUHUR && (
              <div className="ke-murekkep" style={{ position: "absolute", left: 22, top: 368, zIndex: 4 }}>
                <Damga ton={V} egim={-8} butce={false} style={{ fontSize: 17, lineHeight: "20px", padding: "8px 14px", background: "transparent" }}>
                  <span style={{ display: "grid", justifyItems: "center", gap: 3 }}>
                    <span>Kayda alındı</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "12px", fontWeight: 600, letterSpacing: ".04em", fontStretch: "100%" }}>{evrak.no}</span>
                  </span>
                </Damga>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
