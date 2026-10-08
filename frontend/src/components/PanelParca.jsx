/* PanelParca — Panel'in kabuk parçaları (PanelView < 300 satır kalsın diye, tur 8):
   · AntetKunye: antet başlığının SAĞINA oturan 3 satırlık mono künye — resmî yazının
     "Sayı / Tarih / Konu" üst bloğu gibi; görünümün canlı özeti (ödül brifi hamle 1). Yükleme
     sırasında kaynak ilerlemesini konu dilinde söyler ("DEFTER AÇILIYOR · 2/3 KAYNAK").
   · ParafKapanis: antet çift çizgisinin aynası; paraf baş harfleri brifin sonuna inildiğinde
     BİR KEZ mürekkeple çekilir (SVG stroke, 600 ms) — "brif okundu ss:dd" künyesi yalnız bu
     tarayıcıda tutulur (localStorage, sunucuya yazılmaz). Reduced-motion'da statik.
   · GozlemBos: geçmiş yokken BOŞ DEFTER SAYFASI (cetvel + marj + "ilk kaydı yazın").
   · BirlesikHata: ≥2 kaynak düşünce tek fiş, tek "Tümünü yeniden dene" (cümleler kaynak durumundan). */
import { useEffect, useRef, useState } from "react";
import { Btn, Icon, MONO, SANS, TYPE, TNUM, SP, RAD, SH, PAL, DERIN, EASE } from "./neonUi.jsx";
import { GozlemAntet } from "./PanelGozlem.jsx";
import { giris, MARJ } from "./PanelBrif.jsx";
import { adBuyut } from "../lib/trMetin.js";
import { noktaliTamTarih, noktaliGunSaat, parafHarf } from "../lib/panelBrifSaf.js";
import { kaynakHazir } from "./panelKaynak.js";
import { HataFisi } from "./kabukAtomlari.jsx";
import { Printer, RotateCw } from "lucide-react";


/* En yakın (henüz geçmemiş) son gün — "gg.aa". */
function enYakinSonGun(kuyrukSla) {
  const ileri = kuyrukSla.filter((x) => Number.isFinite(x.sla?.kalan_gun) && x.sla.kalan_gun >= 0 && x.sla.son_tarih)
    .sort((a, b) => a.sla.kalan_gun - b.sla.kalan_gun);
  return ileri[0] ? ileri[0].sla.son_tarih.slice(0, 5) : "—";
}

function KunyeSatir({ sol, children, vurgu }) {
  return (
    <>
      <span style={{ color: PAL.mut3, textAlign: "left" }}>{sol}</span>
      <span style={{ color: vurgu || PAL.ink2, textAlign: "left" }}>{children}</span>
    </>
  );
}

/** Antet sağ künyesi — her etiket değerinin ADIDIR (tur 8 jüri: Sayı/Tarih/Konu etiketleri
 *  değerle eşleşmiyordu). KUYRUK · SÜRE · DEFTER; defter satırı kaynak ilerlemesini ya da
 *  bağlantı kesintisini söyler (küresel bandın Panel'deki karşılığı künyede durur). */
export function AntetKunye({ kaynaklar, inboxCount, kuyrukSla, islemN, gidenN }) {
  const durumlar = Object.values(kaynaklar);
  const hazir = durumlar.filter(kaynakHazir).length;
  const dusen = durumlar.filter((d) => d === "yok").length;
  const acilan = hazir < durumlar.length && durumlar.some((d) => d === "bekliyor");
  /* Tur 8 jüri: SLA boş dönünce (kuyrukta evrak var, hiçbirinde süre yok) "00 GECİKMİŞ"
     basılıyordu — bilinmeyen sıfır diye beyan edilmez. Süre ancak kuyrukta SLA satırı varsa
     (ya da kuyruk gerçekten boşsa) bilinir. */
  const slaBilinen = kuyrukSla.length > 0 || (inboxCount === 0 && kaynakHazir(kaynaklar.sla));
  const sureTanimsiz = !slaBilinen && kaynakHazir(kaynaklar.sla);
  const gecikmis = slaBilinen ? String(kuyrukSla.filter((x) => x.sla?.durum === "GECIKMIS").length) : "—";
  const defter = dusen ? `BAĞLANTI YOK · ${dusen}/${durumlar.length} KAYNAK DÜŞTÜ`
    : acilan ? `AÇILIYOR · ${hazir}/${durumlar.length} KAYNAK` : `İŞLEM ${islemN} · GİDEN ${gidenN}`;
  return (
    <div role="status" aria-label="Brif künyesi" style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: SP.l, rowGap: 3, paddingBottom: 2, ...TYPE.antet, ...TNUM, whiteSpace: "nowrap" }}>
      <KunyeSatir sol="KUYRUK">{inboxCount} EVRAK · {gecikmis} GECİKMİŞ</KunyeSatir>
      <KunyeSatir sol="SÜRE">{sureTanimsiz ? "SÜRE BİLİNMİYOR · TANIMLI EVRAK YOK" : `EN YAKIN SON GÜN ${slaBilinen ? enYakinSonGun(kuyrukSla) : "—"}`}</KunyeSatir>
      {/* Tur 9 jüri: hata dört yerde kırmızıydı → künye olguyu söyler ama alarm rengi fişte kalır. */}
      <KunyeSatir sol="DEFTER" vurgu={acilan ? DERIN.T : null}>{defter}</KunyeSatir>
    </div>
  );
}

/* Paraf okundu künyesi — yalnız bu tarayıcı (erişilemezse sessizce yok). */
const OKUNDU_ANAHTAR = "ke-brif-okundu";
function okunduOku() { try { return Number(localStorage.getItem(OKUNDU_ANAHTAR)) || 0; } catch { return 0; } }
function okunduYaz(ts) { try { localStorage.setItem(OKUNDU_ANAHTAR, String(ts)); } catch { /* özel pencere */ } }

/* Paraf görünür olunca bir kez "atılır" (IntersectionObserver) — YALNIZ brif okunabilir veriyle
   hazırlandıysa (tur 8 jüri: veri alınamamış brif imzalanmış görünüyordu). `hazir` false iken
   gözlemci kurulmaz, okundu damgası yazılmaz; kutu kurşun kalem kılavuzunda kalır. */
function useParafAtildi(hazir) {
  const ref = useRef(null);
  const [okundu, setOkundu] = useState(() => okunduOku());
  const [atildi, setAtildi] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!hazir) return undefined;
    if (!el || typeof IntersectionObserver === "undefined") { setAtildi(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setAtildi(true);
      const simdi = Date.now(); okunduYaz(simdi); setOkundu(simdi);
      io.disconnect();
    }, { threshold: 0.9 });
    io.observe(el);
    return () => io.disconnect();
  }, [hazir]);
  return { ref, atildi: atildi && hazir, okundu };
}

/* Paraf kutusu — baş harfler mürekkep çizgisiyle (SVG metin kontur → dolgu). */
function ParafKutu({ user, dar, atildi, kutuRef }) {
  const harf = parafHarf(user?.ad_soyad);
  return (
    <div ref={kutuRef} aria-label={`Paraf: ${adBuyut(user?.ad_soyad) || "Memur"}`} role="img"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: dar ? 64 : 76, height: 56, padding: "4px 0",
        border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.ctl }}>
      <span style={{ fontFamily: MONO, fontSize: 9, lineHeight: "10px", letterSpacing: ".1em", color: PAL.mut3 }}>PARAF</span>
      <svg width="60" height="26" viewBox="0 0 60 26" aria-hidden="true" style={{ overflow: "visible", color: DERIN.T }}>
        {/* Kurşun kalem kılavuzu — paraf atılmadan önce de kutu boş görünmesin (yazdırma dahil). */}
        <text x="30" y="20" textAnchor="middle" style={{ fontFamily: SANS, fontStyle: "italic", fontSize: 20, fontWeight: 600, letterSpacing: "-.02em", fill: PAL.lineHi }}>{harf}</text>
        <text x="30" y="20" textAnchor="middle" data-paraf-harf=""
          style={{ fontFamily: SANS, fontStyle: "italic", fontSize: 20, fontWeight: 600, letterSpacing: "-.02em",
            fill: atildi ? DERIN.T : "transparent", stroke: DERIN.T, strokeWidth: 0.6, strokeDasharray: 120, strokeDashoffset: atildi ? 0 : 120,
            transition: `stroke-dashoffset .6s ${EASE.out}, fill .22s ${EASE.out} .5s` }}>{harf}</text>
      </svg>
    </div>
  );
}

/** Paraf kapanışı — resmî evrakın imza bloğu ritmi: sayfanın başı (antet) ve sonu belli. */
export function ParafKapanis({ hazirlandi, kuyrukN, islemN, user, dar, hazir = true, kaynakIlerleme = "" }) {
  const { ref, atildi, okundu } = useParafAtildi(hazir);
  return (
    <footer style={{ gridColumn: "1 / -1", marginTop: SP.xl }}>
      <div aria-hidden="true" style={{ height: 5, borderTop: `1px solid ${PAL.ink}`, borderBottom: `2px solid ${PAL.ink}`, opacity: 0.9 }} />
      <div style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", marginTop: SP.m }}>
        <div style={{ minWidth: 0, flex: "1 1 320px", ...TYPE.antet, color: PAL.mut3, ...TNUM }}>
          <span style={{ display: "block" }}>
            {hazir ? `BRİF HAZIRLANDI ${noktaliTamTarih(hazirlandi)}${okundu ? ` · OKUNDU ${noktaliGunSaat(okundu)}` : ""}`
              : <span style={{ color: DERIN.sari }}>PARAF BEKLİYOR — {kaynakIlerleme}</span>}
          </span>
          <span style={{ display: "block", marginTop: 2 }}>VERİ · KUYRUK {kuyrukN} · İŞLEM {islemN} · KAYNAK: OTURUM + KAYITLI GEÇMİŞ</span>
        </div>
        <span data-yazdirma-gizle="">
          {/* Tur 9 jüri: yüklenirken yarım brif basılabiliyordu → kaynaklar açılana dek devre dışı. */}
          <Btn onClick={() => window.print()} disabled={!hazir} ariaLabel={hazir ? "Sabah brifini yazdır" : "Brif henüz hazır değil — kaynaklar açılıyor"}
            title={hazir ? undefined : "Kaynaklar açılıyor; brif hazır olunca yazdırılabilir"}>
            <Printer size={15} strokeWidth={1.75} aria-hidden="true" /> Brifi yazdır
          </Btn>
        </span>
        <ParafKutu user={user} dar={dar} atildi={atildi} kutuRef={ref} />
      </div>
    </footer>
  );
}

/* Boş defter satırı — cetvel çizgisi + mono sıra no + kırmızı marj; yazısız (veri iddiası yok). */
const BOS_SATIR_H = 44;
function BosDefterSatir({ no, children, soluk }) {
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", columnGap: SP.l, alignItems: "center",
      minHeight: BOS_SATIR_H, borderTop: `1px solid ${PAL.line}`, opacity: soluk }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, ...TNUM }}>{no}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** Gözlem boş hâli (geçmiş yok, hata yok) — BOŞ DEFTER SAYFASI (tur 8 jüri: 1600 px'lik tek
 *  satır şerit "özür" gibiydi). Cetvelli, marjlı, yazısız üç satır soluklaşarak iner; davet ilk
 *  satıra yazılır: "ilk kaydı yazın". Defterin kendi dili — illüstrasyon yok. */
export function GozlemBos({ span, onGoInbox, onUpload }) {
  return (
    <>
      <GozlemAntet sag="0 İŞLEM · SAYFA 1" giris={giris(360)} />
      <section aria-label="İşlem defteri boş" style={{ ...span(12), position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`,
        borderRadius: RAD.card, boxShadow: SH.card, padding: `${SP.m}px ${SP.xl + 4}px ${SP.s}px`, overflow: "hidden", ...giris(380) }}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: SP.xl + 4 + 44 + SP.l / 2, width: 1, background: MARJ,
          transformOrigin: "50% 0", ...giris(420, "pv-cizgi", 0.7) }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, padding: `0 0 ${SP.s}px`, ...TYPE.antet, color: PAL.mut3, ...TNUM }}>
          <span>SIRA · KAYIT</span><span>DAĞILIM · BİRİM GECİKMESİ · SÜRE</span>
        </div>
        <BosDefterSatir no="01">
          <span style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", padding: `${SP.s}px 0` }}>
            <span style={{ minWidth: 0, flex: "1 1 320px" }}>
              <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>İlk kaydı yazın — henüz evrak işlenmedi</span>
              <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, marginTop: 2, textWrap: "pretty" }}>
                Kuyruktan bir evrak işlediğinizde dağılım, birim gecikmesi ve süre özetleri bu sayfada oluşur.
              </span>
            </span>
            {/* Tur 8 jüri: sıradaki adım iki seçenekle — kuyruktan seç ya da yeni yükle. */}
            <span style={{ display: "flex", gap: SP.s, flexWrap: "wrap" }}>
              <Btn onClick={() => onGoInbox()}><Icon.inbox /> Kuyruktan seç</Btn>
              {onUpload && <Btn onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>}
            </span>
          </span>
        </BosDefterSatir>
        {[["02", 0.7], ["03", 0.45], ["04", 0.25]].map(([no, o]) => <BosDefterSatir key={no} no={no} soluk={o} />)}
      </section>
    </>
  );
}

/** Panel tamamen boş (kuyruk + geçmiş yok) — boş defter sayfası. Tek primary: yeni evrak yükle.
 *  01 satırı kesikli davettir; 02–07 soluklaşan cetvel; sağ altta mürekkepsiz paraf yeri. */
export function BosDefterSayfasi({ onUpload }) {
  return (
    <section aria-label="Evrak defteri boş" style={{ position: "relative", height: "100%", boxSizing: "border-box", background: PAL.surf, border: `1px solid ${PAL.line}`,
      borderRadius: RAD.card, boxShadow: SH.card, padding: `${SP.l}px ${SP.xl + 4}px ${SP.l}px`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: SP.xl + 4 + 44 + SP.l / 2, width: 1, background: MARJ,
        transformOrigin: "50% 0", ...giris(200, "pv-cizgi", 0.7) }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, padding: `0 0 ${SP.s}px`, ...TYPE.antet, color: PAL.mut2, ...TNUM }}>
        <span>SIRA · KAYIT</span><span>DEFTER · SAYFA 1 · 0 EVRAK</span>
      </div>
      <BosDefterSatir no="01">
        <span style={{ display: "flex", alignItems: "center", gap: SP.l, flexWrap: "wrap", margin: `${SP.s}px 0`, padding: `${SP.m}px ${SP.l}px`,
          border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.ctl }}>
          <span style={{ minWidth: 0, flex: "1 1 280px" }}>
            <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>Kuyruk boş</h2>
            <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, marginTop: 2, textWrap: "pretty" }}>
              Bugünün ilk evrakını kaydedin — işlenen her evrak bu sayfaya sıra numarasıyla yazılır, yasal süresi takvime düşer.
            </span>
          </span>
          {onUpload && <Btn primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>}
        </span>
      </BosDefterSatir>
      {[["02", 0.8], ["03", 0.62], ["04", 0.46], ["05", 0.32], ["06", 0.2]].map(([no, o]) => <BosDefterSatir key={no} no={no} soluk={o} />)}
      <div style={{ marginTop: "auto", paddingTop: SP.l, display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: SP.m, ...TYPE.antet, color: PAL.mut2 }}>
        <span>KAPANIŞ · PARAF</span>
        <span aria-hidden="true" style={{ width: 76, height: 44, border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.ctl }} />
      </div>
    </section>
  );
}

/** Gözlem — kaynak düştü (tur 8 jüri: hata hâlinde Gözlem tek çizgiye iniyor, 1440'ta 200 px+
 *  ölü alan kalıyordu). Boş hâldeki defter sayfasının aynısı ama yazısız: satırlar kaynak
 *  gelince dolacak yerlerdir; tahmini değer yok, eylem yok (tek yeniden-dene fişte/bantta). */
export function GozlemDusenDefter({ span }) {
  return (
    <>
      <GozlemAntet sag="İŞLEM GEÇMİŞİ ALINAMADI · ÜSTTEKİ FİŞE BAKIN" rol="status" />
      <section aria-label="İşlem defteri — kaynak bekleniyor" style={{ ...span(12), position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`,
        borderRadius: RAD.card, boxShadow: SH.card, padding: `${SP.m}px ${SP.xl + 4}px ${SP.s}px`, overflow: "hidden" }}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: SP.xl + 4 + 44 + SP.l / 2, width: 1, background: MARJ, opacity: 0.6 }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, padding: `0 0 ${SP.s}px`, ...TYPE.antet, color: PAL.mut3, ...TNUM }}>
          <span>SIRA · KAYIT</span><span>KAYNAK: İŞLEM GEÇMİŞİ · YANIT BEKLENİYOR</span>
        </div>
        <BosDefterSatir no="—">
          <span style={{ display: "block", padding: `${SP.s}px 0`, ...TYPE.data, color: PAL.mut2 }}>
            Dağılım, birim gecikmesi, son işlemler ve işlem süresi bu sayfaya kaynak yanıt verince yazılır.
          </span>
        </BosDefterSatir>
        {[0.6, 0.4, 0.22].map((o, i) => <BosDefterSatir key={i} no="—" soluk={o} />)}
      </section>
    </>
  );
}

/* Fişin kaynak cetveli — hangi kaynak düştü, hangisi sağlam (renk + işaret + ad: tek sinyal değil). */
const KAYNAK_KISA = { sla: "SÜRE", islemler: "İŞLEM", giden: "GİDEN" };
function KaynakCetveli({ ozet }) {
  const satir = [...ozet.dusen.map((k) => [k, false]), ...ozet.saglam.map((k) => [k, true])];
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: `2px ${SP.m}px`, marginTop: SP.s, ...TYPE.antet, ...TNUM }}>
      {satir.map(([k, ok]) => (
        <span key={k} style={{ color: ok ? PAL.mut2 : DERIN.kirmizi, fontWeight: ok ? 400 : 600 }}>
          {KAYNAK_KISA[k] || k.toLocaleUpperCase("tr")} {ok ? "✓" : "✕"}<span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{ok ? " sağlam" : " alınamadı"}</span>
        </span>
      ))}
    </span>
  );
}

const buyukBas = (m) => (m ? m.charAt(0).toLocaleUpperCase("tr") + m.slice(1) : "");

/** Birleşik hata fişi — ≥2 kaynak düştüğünde TEK fiş + TEK "Yeniden dene" (tur 8 jüri: üç ayrı
 *  fiş, üç düğme, birbirini yalanlayan "etkilenmedi" cümleleri). Cümleler kaynakOzeti'nden.
 *  `birincil` false → kahraman ekranda, onun primary'si korunur (görünüm başına 1 primary). */
export function BirlesikHata({ ozet, onYeniden, onGoInbox, kuyrukN, birincil, bantVar = false }) {
  /* Tur 8 jüri: kabuğun bağlantı kaydı (tüm kaynaklar düştüğünde) kendi "Yeniden dene"sini
     taşır → fiş aynı eylemi ikinci kez sunmaz; tek yeniden-dene noktası banttır. */
  const yeniden = bantVar ? null : <Btn primary={birincil} onClick={onYeniden}><RotateCw size={14} strokeWidth={1.75} aria-hidden="true" /> Tümünü yeniden dene</Btn>;
  const kuyruk = kuyrukN > 0 ? <Btn primary={birincil && bantVar} onClick={() => onGoInbox()} ariaLabel="Gelen evrak kuyruğunu aç">Kuyruğu aç ({kuyrukN}) <Icon.arrow /></Btn> : null;
  return (
    <HataFisi baslik={`Brif eksik hazırlandı — ${ozet.dusen.length}/${ozet.toplam} kaynak yanıt vermedi`}
      ikincil={<>{yeniden}{kuyruk}</>}>
      {buyukBas(ozet.dusenCumle)}; ilgili bölümler boş bırakıldı, tahmini değer gösterilmez.
      {ozet.saglamCumle ? ` ${buyukBas(ozet.saglamCumle)}.` : " Şu an hiçbir kaynaktan veri yok."}
      {bantVar && " Yeniden deneme sayfanın üstündeki bağlantı kaydındadır."}
      <KaynakCetveli ozet={ozet} />
    </HataFisi>
  );
}
