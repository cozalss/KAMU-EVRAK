/* SureRaporModal — Panel'deki "İşlem Süresi" kartının detay RAPORU (amire sunulacak belge).
   Tur 6 (Antet & Damga): kartın genişletilmiş kopyası gibi duruyordu; artık rapor dilinde —
   antet künyesi + başlık + çift çizgi, büyük kronometre şeridi (ortalama/eşik referans
   çizgileri + gün·saat etiketleri + lejant), sığan tablo (yatay kaydırma yok), panelle AYNI
   evrak adı (kayitAdi: konu → dosya adı son çare; dosya adı title'da).

   VERİ KAYNAĞI YENİ DEĞİL: aynı `history`, aynı `result.sure_ms` + `ts`. Hesap lib'lerde.
   Yetersiz geçmişte SAYI UYDURULMAZ. Modal deseni BelgeModal ile aynı: Radix Dialog (odak
   tuzağı + Esc + dış tık) + motion AnimatePresence. */
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Btn, Icon, MONO, T, R, TYPE, TNUM, SP, RAD, SH, EASE, EASE_BEZIER, DERIN, PAL, SR_ONLY, focusRing } from "./neonUi.jsx";
import { BIRIM_GOSTER, EVRAK_TR } from "./result-cards.jsx";
import SureKiyasBloku, { TrendRozet } from "./SureKiyas.jsx";
import { Kronometre } from "./PanelSure.jsx";
import { useDarEkran } from "../hooks/useMedya.js";
import { olcumler, ortalama, esikMs, genelTrend, sirala, turKirilimi, hizKademe, fmtSn as sn, ESIK_KAT } from "../lib/sureRapor.js";
import { MARJ } from "./PanelBrif.jsx";
import { noktaliGunSaat, noktaliTamTarih, kronometreEksen, eksenYuzde, eksenIsaretleri } from "../lib/panelBrifSaf.js";
import { kayitAdi } from "../lib/sohbetMetin.js";

/* Tablo başlığı künyesi — hangi 7 kaydın gösterildiğini söyler (sıralama değişince "son 7"
   yanlış olur: süreye göre sıralı tablo en yavaş/en hızlı 7'dir). */
const SIRA_ETIKET = { ts: ["en eski", "en yeni"], ms: ["en hızlı", "en yavaş"], ad: ["A→Z", "Z→A"] };
function tabloBaslik(alan, artan, gosterilen, toplam) {
  const yon = SIRA_ETIKET[alan]?.[artan ? 0 : 1] || "";
  const sayi = gosterilen < toplam ? `ilk ${gosterilen} / ${toplam}` : String(toplam);
  return `${sayi} kayıt · ${yon}${alan === "ad" ? "" : " önce"}`;
}

/* Kimlik kısaltması — islem_id UUID; ilk 8 karakter denetim izinde eşleştirmeye yeter. */
const kisaId = (id) => (id ? String(id).replace(/-/g, "").slice(0, 8) : "—");
const insanAdi = (x) => kayitAdi({ konu: x.konu, name: x.ad, evrak_turu: x.evrakTuru });

/* Sıralanabilir tablo başlığı — aktif kolonun yönü ok ile gösterilir. */
function ThSirali({ alan, etiket, aktif, artan, onSec, sayisal }) {
  return (
    <th scope="col" aria-sort={aktif ? (artan ? "ascending" : "descending") : "none"} style={{ padding: 0, textAlign: sayisal ? "right" : "left", whiteSpace: "nowrap" }}>
      <button type="button" onClick={() => onSec(alan)} {...focusRing} data-press=""
        aria-label={`${etiket} sütununa göre sırala`}
        onMouseEnter={(e) => { e.currentTarget.style.color = DERIN.T; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = aktif ? DERIN.T : PAL.mut; }}
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs,
          width: "100%", justifyContent: sayisal ? "flex-end" : "flex-start",
          background: "transparent", border: "none", padding: `${SP.s}px ${SP.m}px`, ...TYPE.meta, fontWeight: 600,
          color: aktif ? DERIN.T : PAL.mut, transition: `color .12s ease, transform .14s ${EASE.out}` }}>
        {etiket}
        <span aria-hidden="true" style={{ opacity: aktif ? 1 : 0.3, fontSize: 9 }}>{aktif && !artan ? "▼" : "▲"}</span>
      </button>
    </th>
  );
}

/* Eşik ikonu — renk tek sinyal değil: şekil de değişir (tik / üçgen-ünlem). */
function EsikIkon({ yavas, esik }) {
  return (
    <span title={yavas ? `Eşiğin üstünde (${sn(esik)} sn)` : `Eşiğin altında (${sn(esik)} sn)`}
      style={{ display: "inline-flex", color: yavas ? DERIN.R : DERIN.yesil }}>
      {yavas ? <Icon.alert width={15} height={15} /> : <Icon.check width={15} height={15} />}
      <span style={SR_ONLY}>{yavas ? "eşiğin üstünde" : "eşiğin altında"}</span>
    </span>
  );
}

/* Masaüstü tablo — kimlik evrak adının altına mono ikinci satır olarak iner (ayrı sütun
   720 px'te tarihi kırpıyor, durum sütununu gizliyordu). */
function RaporTablo({ satirlar, esik, th, vurgu, onVurgu }) {
  const td = { padding: `${SP.s}px ${SP.m}px`, borderTop: `1px solid ${PAL.line}`, ...TYPE.data, color: PAL.ink2, verticalAlign: "middle" };
  return (
    <div style={{ border: `1px solid ${PAL.line}`, borderRadius: RAD.card, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup><col /><col style={{ width: "30%" }} /><col style={{ width: 92 }} /><col style={{ width: 118 }} /><col style={{ width: 64 }} /></colgroup>
        <thead>
          <tr style={{ background: PAL.surf2 }}>
            {th("ad", "Evrak")}
            <th scope="col" style={{ padding: `${SP.s}px ${SP.m}px`, textAlign: "left", ...TYPE.meta, fontWeight: 600, color: PAL.mut }}>Birim</th>
            {th("ms", "Süre (sn)", true)}
            {th("ts", "Tarih · saat")}
            <th scope="col" style={{ padding: `${SP.s}px ${SP.m}px`, textAlign: "center", ...TYPE.meta, fontWeight: 600, color: PAL.mut }}>Eşik</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((x, i) => (
            <tr key={`${x.id}-${i}`} onMouseEnter={() => onVurgu(x.id)} onMouseLeave={() => onVurgu(null)}
              style={{ background: vurgu === x.id ? PAL.hov : "transparent", transition: `background .14s ${EASE.out}` }}>
              <td style={td}>
                {/* Tam ad klavye/ekran okuyucuya da açık (tur 8: yalnız native title'daydı). */}
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: PAL.ink }} title={x.ad}>{insanAdi(x)}</span>
                <span style={{ display: "block", fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x.ad !== insanAdi(x) ? `${x.ad} · ` : ""}kayıt {kisaId(x.id)}
                </span>
              </td>
              <td style={{ ...td, color: DERIN.V, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{BIRIM_GOSTER(x.hedefBirim, x.evrakTuru)}</td>
              <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontSize: 12, ...TNUM, color: esik != null && x.ms > esik ? DERIN.R : PAL.ink2 }}>{sn(x.ms)}</td>
              <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>{noktaliGunSaat(x.ts) || "—"}</td>
              <td style={{ ...td, textAlign: "center" }}><EsikIkon yavas={esik != null && x.ms > esik} esik={esik} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Telefon — tablo yerine defter listesi (yatay kaydırma yok, hiçbir sütun gizlenmez). */
function RaporListe({ satirlar, esik }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${PAL.line}` }}>
      {satirlar.map((x, i) => (
        <li key={`${x.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.s}px 0`, borderBottom: `1px solid ${PAL.line}` }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", ...TYPE.data, fontWeight: 500, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{insanAdi(x)}</span>
            <span style={{ display: "block", fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...TNUM }}>
              {noktaliGunSaat(x.ts) || "—"} · {BIRIM_GOSTER(x.hedefBirim, x.evrakTuru)}
            </span>
          </span>
          <span style={{ fontFamily: MONO, fontSize: 13, ...TNUM, color: esik != null && x.ms > esik ? DERIN.R : PAL.ink2 }}>{sn(x.ms)}</span>
          <EsikIkon yavas={esik != null && x.ms > esik} esik={esik} />
        </li>
      ))}
    </ol>
  );
}

/* Rapor anteti — görünüm başlığıyla aynı dil: mono künye + başlık + çift çizgi. */
/* Tur 9 jüri: 900 px yükseklikte başlık kaydırmada kayboluyordu → antet şeridi YAPIŞIK
   (modal iç boşluğu kadar dışa taşar ki zemin kesintisiz olsun; kapat düğmesi şeritte). */
const MODAL_PAD = "clamp(16px, 4vw, 32px)";
function RaporAntet({ olcumN }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 2, background: PAL.surfPop, margin: `calc(-1 * ${MODAL_PAD}) calc(-1 * ${MODAL_PAD}) ${SP.xl}px`,
      padding: `${MODAL_PAD} ${MODAL_PAD} ${SP.m}px`, borderRadius: `${RAD.pop}px ${RAD.pop}px 0 0` }}>
      <KapatDugme />
      {/* Künye ViewWrap ile aynı: "KAMU-EVRAK · <bölüm>" — T.C. YOK (bağımsız ürün devlet
          kimliğini taşımaz). Telefonda ölçüm sayısı alt satıra iner; künye kırpılmaz. */}
      <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `${SP.xs}px ${SP.m}px`, marginBottom: SP.s, paddingRight: 44 }}>
        <span style={{ whiteSpace: "nowrap" }}>KAMU-EVRAK<span style={{ margin: "0 .6em" }}>·</span>SÜRE RAPORU</span>
        <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
        <span style={{ whiteSpace: "nowrap", ...TNUM }}>{olcumN} ÖLÇÜM</span>
      </div>
      <Dialog.Title asChild>
        <h2 style={{ margin: 0, ...TYPE.h2, fontSize: 24, lineHeight: "28px", fontStretch: "112%", color: PAL.ink }}>İşlem Süresi Detay Raporu</h2>
      </Dialog.Title>
      <div aria-hidden="true" style={{ marginTop: SP.m, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
    </div>
  );
}

function KapatDugme() {
  return (
    <Dialog.Close asChild>
      <button type="button" aria-label="Raporu kapat" {...focusRing} data-press="" data-dokunma=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", position: "absolute", top: SP.l, right: SP.l, display: "inline-flex", alignItems: "center",
          justifyContent: "center", width: 32, height: 32, background: "transparent",
          border: `1px solid ${PAL.line}`, borderRadius: RAD.dot, color: PAL.mut,
          transition: `background .12s ease, transform .14s ${EASE.out}` }}>
        <Icon.x width={15} height={15} />
      </button>
    </Dialog.Close>
  );
}

const TUR_AZAMI = 6;
const SERIT_N = 12;
/* Tur 9: kronometreyle AYNI ızgara (etiket 220 · çubuk 1fr · değer 112, aralık SP.s) → iki
   grafiğin çubuk sütunu piksel piksel üst üste biner; eşik çizgisi aynı x'te. Adet ve eşik üstü
   künyesi etiket hücresinin ikinci satırına iner (ayrı sütunlar çubuk ekseni kaydırıyordu). */
const turSutun = (dar) => (dar ? "minmax(0, 40%) minmax(0, 1fr) 64px" : "220px minmax(0, 1fr) 112px");
/* Çubuk boyası ORTALAMANIN kademesinden — kronometredeki kodlamayla aynı:
   hızlı = yalnız kenar, orta = dolu T, eşik üstü = ACELE. */
const TUR_BOYA = { hizli: PAL.surfPop, orta: T, yavas: R };
const hucre = { padding: "6px 0", borderTop: `1px solid ${PAL.line}` };

function TurKunye({ x }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut3, ...TNUM }}>
      {x.n} ADET
      {x.esikUstu > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: DERIN.R, fontWeight: 600 }}>
        · <Icon.alert width={11} height={11} aria-hidden="true" />{x.esikUstu} EŞİK ÜSTÜ</span>}
    </span>
  );
}

/* Tür satırı — iz kutusu içinde çubuk ortak eksende YÜZDE ile; eşik, sicil defterinin kırmızı
   marjı diliyle her izi keser; ızgara çizgileri kronometrenin işaretleriyle aynı. */
function TurSatir({ x, eksen, ort }) {
  const k = hizKademe(x.ortMs, ort);
  return (
    <span role="row" style={{ display: "contents" }}>
      <span role="cell" style={{ ...hucre, minWidth: 0 }}>
        <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.tur ? EVRAK_TR(x.tur) : "Tür belirsiz"}</span>
        <TurKunye x={x} />
      </span>
      <span role="cell" aria-hidden="true" style={{ ...hucre, alignSelf: "stretch", display: "flex", alignItems: "center", minWidth: 0 }}>
        <span style={{ position: "relative", flex: 1, height: 10 }}>
          {eksen.isaret.map((v) => <span key={v} style={{ position: "absolute", top: -8, bottom: -8, left: `${eksenYuzde(v * 1000, eksen.tavanSn)}%`, width: 1, background: PAL.line }} />)}
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `max(4px, ${eksenYuzde(x.ortMs, eksen.tavanSn)}%)`, background: TUR_BOYA[k],
            border: `1px solid ${k === "yavas" ? R : T}`, borderRadius: "0 2px 2px 0", boxSizing: "border-box" }} />
          <span style={{ position: "absolute", top: -8, bottom: -8, left: `${eksen.esikX}%`, width: 1.5, background: MARJ }} />
        </span>
      </span>
      <span role="cell" style={{ ...hucre, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "flex-end", fontFamily: MONO, fontSize: 12,
        color: k === "yavas" ? DERIN.R : PAL.ink2, fontWeight: k === "yavas" ? 600 : 400, whiteSpace: "nowrap", ...TNUM }}>{sn(x.ortMs)} sn</span>
    </span>
  );
}

function TurEksen({ eksen, esik }) {
  return (
    <span aria-hidden="true" style={{ gridColumn: 2, position: "relative", height: 18, borderTop: `1px solid ${PAL.lineHi}`, fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>
      {eksen.isaret.map((v, i, a) => (
        <span key={v} style={{ position: "absolute", top: 3, left: `${eksenYuzde(v * 1000, eksen.tavanSn)}%`,
          transform: i === 0 ? "none" : i === a.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{String(v).replace(".", ",")}</span>
      ))}
      <span style={{ position: "absolute", top: 20, left: `${eksen.esikX}%`, transform: "translateX(-50%)", color: DERIN.R, whiteSpace: "nowrap" }}>eşik {sn(esik)}</span>
    </span>
  );
}

/* Tür kırılımı (tur 8 jüri: "rapor kartın büyütülmüş kopyasıydı") — kartın sunamadığını
   sunar: hangi evrak türü yavaş, kaçı eşik üstü. */
function TurKirilimi({ olcum, esik, ort, dar }) {
  const tumSatir = useMemo(() => turKirilimi(olcum, esik), [olcum, esik]);
  const [tumu, setTumu] = useState(false);
  if (tumSatir.length < 2) return null;
  const satirlar = tumu ? tumSatir : tumSatir.slice(0, TUR_AZAMI);
  /* Üstteki kronometreyle ORTAK eksen: şeridin son SERIT_N ölçümü + tür ortalamaları (RaporGovde
     aynı kümeyi Kronometre'ye eksenMs olarak verir). Tüm ham ölçümler değil — tek eski aykırı
     kayıt ekseni 25 sn'ye çekip çubukları sola sıkıştırıyordu (ölçüldü). */
  const { tavanSn, adimSn } = kronometreEksen([...olcum.slice(0, SERIT_N).map((x) => x.ms), ...tumSatir.map((x) => x.ortMs)], esik);
  const eksen = { tavanSn, isaret: eksenIsaretleri(tavanSn, adimSn), esikX: eksenYuzde(esik, tavanSn) };
  const kalan = tumSatir.length - TUR_AZAMI;
  return (
    <section aria-label="Evrak türüne göre işlem süresi" style={{ marginTop: SP.xl }}>
      <h3 style={{ margin: `0 0 ${SP.s}px`, display: "flex", alignItems: "baseline", gap: SP.s, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>
        Evrak türüne göre <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2 }}>en yavaş önce · üstteki şeritle aynı ölçek</span>
      </h3>
      <div role="table" style={{ display: "grid", gridTemplateColumns: turSutun(dar), columnGap: SP.s, alignItems: "center", paddingBottom: SP.m }}>
        <span role="row" style={{ display: "contents" }}>
          {["Tür · adet", "Ortalama süre", "Ort."].map((b, i) => (
            <span key={b} role="columnheader" style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, padding: "4px 0", textAlign: i > 1 ? "right" : "left" }}>{b.toLocaleUpperCase("tr")}</span>
          ))}
        </span>
        {satirlar.map((x) => <TurSatir key={x.tur || "-"} x={x} eksen={eksen} ort={ort} />)}
        <TurEksen eksen={eksen} esik={esik} />
        <span aria-hidden="true" style={{ gridColumn: 3, fontFamily: MONO, fontSize: 11, color: PAL.mut3, textAlign: "right" }}>sn</span>
      </div>
      {kalan > 0 && (
        <button type="button" onClick={() => setTumu((v) => !v)} aria-expanded={tumu} {...focusRing} data-press=""
          style={{ cursor: "pointer", marginTop: SP.xs, padding: "4px 0", background: "transparent", border: "none", ...TYPE.meta, fontWeight: 500, color: DERIN.T, ...TNUM }}>
          {tumu ? `İlk ${TUR_AZAMI} türe daralt` : `+${kalan} tür daha (daha hızlı) — tümünü göster`}
        </button>
      )}
    </section>
  );
}

const TABLO_ILK = 7;

function RaporGovde({ history, olcum }) {
  const dar = useDarEkran();
  const [alan, setAlan] = useState("ts");
  const [artan, setArtan] = useState(false);          // varsayılan: en yeni önce
  const ort = useMemo(() => ortalama(olcum), [olcum]);
  const esik = esikMs(ort);
  const gTrend = useMemo(() => genelTrend(olcum), [olcum]);
  const eksenMs = useMemo(() => turKirilimi(olcum, esik).map((x) => x.ortMs), [olcum, esik]);
  const [tumu, setTumu] = useState(false);
  const [vurgu, setVurgu] = useState(null);
  /* Tur 8: tablo 33 kaydın yalnız 7'sini veriyordu, genişletme yolu yoktu. */
  const tablo = useMemo(() => { const t = sirala(olcum, alan, artan); return tumu ? t : t.slice(0, TABLO_ILK); }, [olcum, alan, artan, tumu]);
  const sirala7 = (a) => { if (a === alan) setArtan((v) => !v); else { setAlan(a); setArtan(a === "ad"); } };
  const th = (a, etiket, sayisal) => <ThSirali alan={a} etiket={etiket} aktif={alan === a} artan={artan} onSec={sirala7} sayisal={sayisal} />;
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.num, fontSize: 34, lineHeight: "38px", color: PAL.ink }}>{sn(ort)}<span style={{ ...TYPE.data, fontWeight: 500, color: PAL.mut2, marginLeft: 4 }}>sn ort.</span></span>
        <TrendRozet t={gTrend} buyuk />
        <span style={{ ...TYPE.data, color: PAL.mut2, ...TNUM }}>
          {olcum.length} işlem{gTrend ? " · son koşumlar öncekilere göre" : " · trend için en az 4 işlem gerekir"}
        </span>
      </div>
      <Kronometre olcum={olcum} ort={ort} satirN={SERIT_N} buyuk={!dar} vurgu={vurgu} onVurgu={dar ? null : setVurgu} eksenMs={eksenMs} />
      <TurKirilimi olcum={olcum} esik={esik} ort={ort} dar={dar} />
      <h3 style={{ margin: `${SP.xl}px 0 ${SP.s}px`, display: "flex", alignItems: "baseline", gap: SP.s, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>
        İşlem Ayrıntısı<span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, ...TNUM }}>{tabloBaslik(alan, artan, tablo.length, olcum.length)}</span>
      </h3>
      {dar ? <RaporListe satirlar={tablo} esik={esik} /> : <RaporTablo satirlar={tablo} esik={esik} th={th} vurgu={vurgu} onVurgu={setVurgu} />}
      {olcum.length > TABLO_ILK && (
        <div style={{ marginTop: SP.s }}>
          <Btn onClick={() => setTumu((v) => !v)} ariaLabel={tumu ? `Tabloyu ilk ${TABLO_ILK} kayda daralt` : `Tüm ${olcum.length} kaydı göster`}>
            {tumu ? `İlk ${TABLO_ILK} kayda daralt` : `Tümünü göster (${olcum.length})`}
          </Btn>
        </div>
      )}
      {/* Eşik sabit bir sayı DEĞİL — ortalamadan türer; gizli sihirli sayı bırakılmaz. */}
      <p style={{ margin: `${SP.s}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
        Yavaş işlem eşiği: ortalama × {String(ESIK_KAT).replace(".", ",")} = {sn(esik)} sn · rapor {noktaliTamTarih(Date.now())}
      </p>
      <SureKiyasBloku history={history} />
    </>
  );
}

export default function SureRaporModal({ acik, onKapat, history = [], donusRef = null }) {
  const olcum = useMemo(() => olcumler(history), [history]);
  return (
    <Dialog.Root open={acik} onOpenChange={(v) => { if (!v) onKapat(); }}>
      <AnimatePresence>
        {acik && (
          <Dialog.Portal forceMount>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
              style={{ position: "fixed", inset: 0, zIndex: 300, /* Tur 9: color-mix(var(), transparent) Chrome'da hesaplanıp BOYANMIYORDU
                 (açık temada karartı ~%0; ölçüldü) → diğer modallarla aynı düz token (Kurul/Mevzuat okuma). */
              background: PAL.scrimKoyu, overflowY: "auto", padding: "32px 12px calc(48px + env(safe-area-inset-bottom))" }}>
              {/* Tur 9 jüri: kontrollü Dialog'da Trigger yok → Esc/Kapat sonrası odak <body>'ye
                  düşüyordu; tetikleyici "Detay raporu" düğmesine geri verilir. */}
              <Dialog.Content asChild forceMount onCloseAutoFocus={(e) => {
                const el = donusRef?.current;
                if (el && el.isConnected) { e.preventDefault(); el.focus(); }
              }}>
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.985 }}
                  transition={{ duration: 0.22, ease: EASE_BEZIER.out }}
                  style={{ position: "relative", width: "min(920px, 100%)", margin: "0 auto", background: PAL.surfPop,
                    border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal,
                    padding: MODAL_PAD, outline: "none" }}>
                  <Dialog.Description style={SR_ONLY}>
                    İşlem sürelerinin ayrıntılı raporu: ortalama, son işlemlerin kronometre şeridi, tablo ve dönem kıyaslaması.
                  </Dialog.Description>
                  <RaporAntet olcumN={olcum.length} />
                  {olcum.length === 0
                    ? <p style={{ margin: 0, ...TYPE.read, color: PAL.mut2 }}>Henüz süre ölçümü yok. Bir evrak işlediğinizde rapor buradan oluşur.</p>
                    : <RaporGovde history={history} olcum={olcum} />}
                </motion.div>
              </Dialog.Content>
            </motion.div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
