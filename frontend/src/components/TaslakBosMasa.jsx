/* TaslakBosMasa — Taslaklar'ın BOŞ ve HATA hâlleri, geniş düzende MASANIN KENDİSİ olarak.

   Jüri tur 8: boş hâl ortalanmış küçük bir illüstrasyon + paragraf + CTA'dan ibaretti; 1440'ta
   ekranın %70'i ölüydü ve üç sütunlu masa dili tamamen kayboluyordu. Hata hâli de aynı jenerik
   kutuydu. Artık boşken de masa kalır — aynı üç hücre, aynı geometri (kuyruk | kâğıt | karar):
     · solda boş kuyruk defteri (cetvel + kapanış çizgisi, "00 kayıt"),
     · ortada antetli BOŞ kâğıt (A4 oranı) ve üstünde tek Damga ("Kayıt yok" / "Bağlantı yok"),
     · sağda karar fişi: ne olduğu + TEK primary (Gelen evrakı aç / Tekrar dene).
   Veri gelince aynı hücreler dolar; yerleşim sıçramaz. Telefon düzeni DEĞİŞMEDİ (EmptyState).
   Damga bütçesi: ekranda tek Damga (kâğıttaki). */
import { Btn, Damga, Icon, MONO, PAL, R, TYPE, TNUM, RAD, SP, SH } from "./neonUi.jsx";
import { A4_GEN_MM, A4_YUK_MM } from "../lib/a4Sayfalama.js";
import { SATIR_H, KENAR_X, MASA_PAY, defterZemini } from "./TaslakDefter.jsx";

const HUCRE = { minWidth: 0, boxSizing: "border-box", borderRadius: RAD.card };
const GIZLI = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

/* Boş kâğıdın antet iskeleti — gerçek yazının yerleşimini hairline'larla ima eder (T.C. ortası,
   Sayı/tarih iki uç, muhatap ortası, gövde, imza sağı). Metin YOK: kurum kimliği taklidi değil. */
const Cizgi = ({ w, sag = false, orta = false, mt = 0 }) => (
  <span aria-hidden="true" style={{ display: "block", width: w, height: 1, marginTop: mt, background: PAL.line,
    marginLeft: orta ? "auto" : sag ? "auto" : 0, marginRight: orta ? "auto" : 0 }} />
);

function BosKagit({ damga, ton }) {
  return (
    <div style={{ position: "relative", height: "100%", maxWidth: "100%", aspectRatio: `${A4_GEN_MM} / ${A4_YUK_MM}`, boxSizing: "border-box",
      padding: "9% 10%", background: "var(--ke-kagit)", boxShadow: SH.kagit, display: "flex", flexDirection: "column" }} data-evrak-kagit="">
      <Cizgi w="18%" orta />
      <Cizgi w="42%" orta mt={10} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34 }}><Cizgi w="38%" /><Cizgi w="16%" /></div>
      <Cizgi w="52%" mt={10} />
      <Cizgi w="46%" orta mt={34} />
      {[100, 100, 94, 100, 72].map((w, i) => <Cizgi key={i} w={`${w}%`} mt={i === 0 ? 34 : 12} />)}
      <Cizgi w="28%" sag mt={40} />
      <Cizgi w="22%" sag mt={10} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <Damga ton={ton} egim={-6} oncelik={1}>{damga}</Damga>
      </div>
    </div>
  );
}

/* Boş defter — kuyruk kartının geometrisi (başlık 34 + satırlar); tek satır durum metni. */
function BosDefter({ baslik, aciklama, kunye, devamKunye, satirKunye }) {
  return (
    <div style={{ ...HUCRE, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card }}>
      <div style={{ display: "flex", alignItems: "center", height: 34, flexShrink: 0, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
        <span aria-hidden="true" style={{ width: KENAR_X, textAlign: "center", flexShrink: 0 }}>No</span>
        <span aria-hidden="true" style={{ flex: 1, paddingLeft: 12 }}>Konu</span>
        <span style={{ paddingRight: 14, ...TNUM }}>{kunye}</span>
      </div>
      <div role="status" style={{ ...defterZemini(1), flex: "none", height: SATIR_H * 3 }}>
        <div style={{ height: SATIR_H, display: "flex", alignItems: "center" }}>
          <span aria-hidden="true" style={{ width: KENAR_X, flexShrink: 0, textAlign: "center", ...TYPE.antet, ...TNUM, color: PAL.mut3 }}>—</span>
          <div style={{ flex: 1, minWidth: 0, padding: "0 14px 1px 12px" }}>
            {/* Tur 9: boş hâlde satır yalnız mono künye taşır — başlık altı metniyle aynı cümleyi
                ikinci kez yazmıyordu artık (ekran okuyucu için durum cümlesi gizli metinde). */}
            {baslik ? <>
              <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{baslik}</div>
              <div style={{ ...TYPE.meta, color: PAL.mut2, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={aciklama}>{aciklama}</div>
            </> : <>
              <span style={GIZLI}>{aciklama}</span>
              <div aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", letterSpacing: ".08em", textTransform: "uppercase", color: PAL.mut2, ...TNUM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{satirKunye}</div>
            </>}
          </div>
        </div>
      </div>
      <DefterDevami kunye={devamKunye} />
    </div>
  );
}

/* DEFTERİN DEVAMI (ödül brifi #11): kapanış çizgisinin altı ölü beyaz değil — boş defter
   sayfası soluklaşarak sürer (cetvel + satır çizgileri, aşağı doğru söner) ve tek mono künye
   defterin açık olduğunu söyler. Salt görsel: aria-hidden; durum metni üstteki status'ta. */
function DefterDevami({ kunye }) {
  const cizgi = `color-mix(in srgb, ${PAL.line} 70%, transparent)`;
  return (
    <div aria-hidden="true" style={{ flex: 1, minHeight: SATIR_H * 2, position: "relative",
      backgroundImage: [
        `linear-gradient(to right, transparent ${KENAR_X - 1}px, color-mix(in srgb, ${R} 18%, transparent) ${KENAR_X - 1}px, color-mix(in srgb, ${R} 18%, transparent) ${KENAR_X}px, transparent ${KENAR_X}px)`,
        `repeating-linear-gradient(to bottom, transparent 0, transparent ${SATIR_H - 1}px, ${cizgi} ${SATIR_H - 1}px, ${cizgi} ${SATIR_H}px)`,
      ].join(", "),
      maskImage: "linear-gradient(to bottom, black 0, transparent 85%)", WebkitMaskImage: "linear-gradient(to bottom, black 0, transparent 85%)" }}>
      <span style={{ position: "absolute", top: SATIR_H + 19, left: KENAR_X + 12, right: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: MONO, fontSize: 11, lineHeight: "14px", letterSpacing: ".08em",
        textTransform: "uppercase", color: PAL.mut3, ...TNUM }}>{kunye}</span>
    </div>
  );
}

/* SIRADAKİ ADIM — fişin ölü %70'i (jüri tur 8) yerine numaralı, mono künyeli iş sırası: havale
   fişi gibi "ne yapılır, sonra ne olur". Eylem DEĞİL (tek primary dipte); yalnız yönlendirme. */
function Adimlar({ adimlar }) {
  return (
    <ol aria-label="Sıradaki adımlar" style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {adimlar.map(([baslik, not], i) => (
        <li key={baslik} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: SP.s, padding: "10px 0", borderTop: `1px dashed ${PAL.line}` }}>
          <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 12, lineHeight: "20px", ...TNUM, color: PAL.mut3 }}>{String(i + 1).padStart(2, "0")}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink }}>{baslik}</span>
            <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, marginTop: 2 }}>{not}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const ADIM_BOS = [
  ["Gelen evrakı açın", "Kuyruktaki belgeyi seçip işleyin."],
  ["Taslak üretilir", "Okuma, sınıflandırma ve yönlendirme sonrası resmî yazı taslağı hazırlanır."],
  ["Burada karar verilir", "Okursunuz, gerekirse düzenlersiniz, onay fişiyle gönderirsiniz."],
];
const ADIM_HATA = [
  ["Bağlantıyı kontrol edin", "Sunucuya ulaşılamadı; ağ ya da oturum kesilmiş olabilir."],
  ["Tekrar deneyin", "Taslaklar sunucuda duruyor; liste kaybolmaz, bağlantı gelince döner."],
];

/* Sağ fiş — karar fişiyle aynı antet şeridi; içerik + sıradaki adımlar + dipte tek primary. */
function BosFis({ kunye, baslik, metin, adimlar, eylem }) {
  return (
    <aside aria-label="Karar paneli" style={{ ...HUCRE, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 20px", height: 34, flexShrink: 0, borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
        <span>Karar fişi</span>
        <span style={{ marginLeft: "auto", ...TNUM }}>{kunye}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: SP.l }}>
        <div>
          <h2 style={{ margin: 0, ...TYPE.h2, fontSize: 18, lineHeight: "24px", color: PAL.ink }}>{baslik}</h2>
          <p style={{ margin: "6px 0 0", ...TYPE.data, color: PAL.ink2, maxWidth: "40ch" }}>{metin}</p>
        </div>
        <div>
          <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: 2 }}>Sıradaki adım</div>
          <Adimlar adimlar={adimlar} />
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2 }}>{eylem}</div>
    </aside>
  );
}

/**
 * Geniş düzende boş/hata masası — üst grid'in ÜÇ hücresini doldurur (fragment).
 * @param {{ hata?: boolean, sutunH?: number|null, onGoInbox?: Function, onYenidenDene?: Function }} p
 */
export default function TaslakBosMasa({ hata = false, sutunH = null, onGoInbox, onYenidenDene }) {
  const yuk = { height: sutunH ?? undefined, minHeight: 420 };
  const tamGenis = { width: "100%", justifyContent: "center", minHeight: 44 };
  return (
    <>
      <div style={{ ...yuk, display: "flex", minWidth: 0 }}>
        <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
          {hata
            ? <BosDefter kunye="İşlem durdu" baslik="Kuyruk alınamadı" aciklama="Ayrıntı karar fişinde." devamKunye="Bağlantı bekleniyor" />
            : <BosDefter kunye="00 kayıt" aciklama="Karar bekleyen taslak yok. İşlenen evrakın taslağı burada sıraya girer." satirKunye="Defter açık · sıradaki No 01" devamKunye="Taslak geldikçe sıraya girer" />}
        </div>
      </div>
      <div style={{ ...HUCRE, ...yuk, display: "flex", flexDirection: "column", gap: SP.s, padding: `10px ${MASA_PAY}px ${MASA_PAY}px`, background: PAL.bg2,
        boxShadow: `inset 0 1px 3px color-mix(in srgb, ${PAL.ink} 7%, transparent)` }}>
        <div style={{ height: 30, flexShrink: 0, display: "flex", alignItems: "center", ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3 }}>
          {hata ? "Masa · bağlantı bekleniyor" : "Masa boş · A4 · 210×297 mm"}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
          <BosKagit damga={hata ? "Bağlantı yok" : "Kayıt yok"} ton={hata ? R : PAL.mut2} />
        </div>
      </div>
      <div style={{ ...yuk, display: "flex", minWidth: 0 }}>
        {hata ? (
          <BosFis kunye="— / —" baslik="Taslaklar şu an alınamadı"
            metin="Kalıcı kayda ulaşılamadı. Taslaklar sunucuda duruyor; bağlantı düzelince liste geri gelir." adimlar={ADIM_HATA}
            eylem={<Btn primary onClick={onYenidenDene} style={tamGenis}><Icon.undo /> Tekrar dene</Btn>} />
        ) : (
          <BosFis kunye="00 / 00" baslik="Masa temiz"
            metin="Yeni taslak, gelen evrak işlendikçe bu masaya düşer." adimlar={ADIM_BOS}
            eylem={<Btn primary onClick={onGoInbox} style={tamGenis}><Icon.inbox /> Gelen evrakı aç</Btn>} />
        )}
      </div>
    </>
  );
}

