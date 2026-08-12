/* PanelView — "SABAH BRİFİ" (2026-07-17 yeniden kurgu): amirin masasına bırakılmış tek
   sayfalık brif. Üç kuşak, alan asimetrisiyle hiyerarşi (4 eş stat + 6 eş kart "template"
   imzasıydı — Baremetrics/Stripe/gov.uk araştırması + emil/apple lensi, 3 paralel ajan):
   · R1 BAĞLAM KUŞAĞI (2026-07-25 yeniden düzen): solda akış nabzı 2×2 ızgara (7 kol) —
     üst sıra birincil ölçüler (işlenen/gelen, büyük), alt sıra ikincil (taslak/gönderilen);
     hairline ayraçlı tek yüzey, düne-göre delta + 7 günlük sparkline (throughput'ta azalış
     kırmızı DEĞİL — yavaş gün azar değildir). Sağda SureTakvimi (5 kol): kuyruk yasal
     sürelerinin ay izdüşümü — AYNI kuyrukSla dizisinden, yeni veri kaynağı yok. İki kolon
     alignSelf:stretch ile eşit yükseklikte.
   · R1.5 KAHRAMAN (12 kol): kuyruk yasal süre brifi — paneldeki tek gerçek "şimdi davran"
     sinyali; ekranın tek primary'si burada. Acil yoksa tek satırlık pozitif banda çöker
     (ilk yaklaşan süre ufkuyla). Önce en üstteydi, 2026-07-25'te bağlam kuşağının ALTINA
     alındı (içerik/mantık aynı, yalnız konum): bağlam önce, aksiyon sonra. Aynı turda eski
     4 kolluk sağ ray ("Devam eden iş" + "Gelen kuyruk") kaldırıldı — ölçü hücrelerinin
     önizlemeli kopyasıydı; brif tam genişliğe yayıldı, tipografisi bir kademe büyüdü.
   · R3-R4 GÖZLEM: tek "Dağılım" yüzeyi (3 iç kolon) + birim gecikme; zaman-gruplu işlem
     feed'i + işlem süresi. Tüm sayılar gerçek veriden (oturum + DB reconcile).
   2026-07-23 cila turu (Stripe/Vercel Analytics + Linear araştırması — "detail-on-demand"):
   panelin TÜM iç mini-grafikleri (SlaSerit, risk barları, Sparkline, SureGrafik) artık aynı
   iki dilbilgisi kuralını paylaşır — (1) her segment/nokta native <title> ile hover'da detay
   verir (yeni bileşen yok, sıfır görsel risk), (2) "güncellik" hep aynı şekilde okunur: bağlam
   PAL.mut3, en yeni veri T. Sparkline'a taban-kapanan düz %8 ALFA(PAL.mut3) dolgu eklendi (tek
   izinli alfa eki — gradyan değil) şekil okunurluğu için. Hiçbiri yeni token/hex/radius
   eklemedi; MASTER.md checklist'i bit-aynı geçerli. */
import { cloneElement, useEffect, useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, T, V, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, IRIS, IRIS_BAR, focusRing } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER } from "./result-cards.jsx";
import SureTakvimi from "./SureTakvimi.jsx";
import { useDarEkran } from "../hooks/useMedya.js";
import SureRaporModal from "./SureRaporModal.jsx";
import SureKiyasBloku, { TrendRozet } from "./SureKiyas.jsx";
import { olcumler, ortalama, genelTrend, hizKademe, gunlukOrtSure, fmtSn } from "../lib/sureRapor.js";
import { kalanMetin } from "../lib/sureTakvimi.js";
import { adBuyut } from "../lib/trMetin.js";
import { GUN_MS, gunBasi, gunlukSeri } from "../lib/gunlukSeri.js";

const fmtSaat = (ts) => { try { return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const fmtGunSaat = (ts) => { try { return new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

/* Geniş ekran eşiği — altında bento kolonları tam genişliğe yığılır. */
function useGenisEkran() {
  const [genis, setGenis] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setGenis(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return genis;
}

/* ---------- R2: Akış nabzı ---------- */

const OK_YUKARI = (p) => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const OK_ASAGI = (p) => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* 7 günlük sparkline — sessiz bağlam çizgisi (1.5px PAL.mut3) + tabana kapanan düz %8 dolgu
   (ALFA(PAL.mut3) — gradyan değil, tek izinli alfa eki; "şekil" okunurluğu için), tek vurgu son
   gün noktası (T + 2px yüzey halkası). Her gün görünmez geniş isabet dairesi + native <title> —
   Stripe/Vercel Analytics'teki "hover ile detay" alışkanlığı; ekstra görsel öge eklemeden
   detay-isteğe-bağlı sağlar. <2 aktif gün varsa hiç çizilmez (yarım grafik "bozuk" okunur). */
function Sparkline({ seri, aktifGun, birim = "" }) {
  if (aktifGun < 2) return null;
  const W = 64, H = 24, taban = H - 4, max = Math.max(1, ...seri);
  const nokta = seri.map((v, i) => [4 + (i * (W - 8)) / 6, taban - (v / max) * (H - 8)]);
  const yol = nokta.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const dolguYol = `M${nokta[0][0].toFixed(1)},${taban} L${nokta.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")} L${nokta[6][0].toFixed(1)},${taban} Z`;
  const son = nokta[6];
  const gunEtiket = (i) => (i === 6 ? "bugün" : i === 5 ? "dün" : `${6 - i} gün önce`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={dolguYol} fill={ALFA(PAL.mut3)} stroke="none" />
      <path d={yol} fill="none" style={{ stroke: PAL.mut3 }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {nokta.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill="transparent" pointerEvents="all">
          <title>{`${gunEtiket(i)}: ${seri[i]}${birim ? ` ${birim}` : ""}`}</title>
        </circle>
      ))}
      <circle cx={son[0]} cy={son[1]} r="3" pointerEvents="none" style={{ fill: T, stroke: PAL.surf }} strokeWidth="2" />
    </svg>
  );
}

/* Akış hücresi — sayı (NumberFlow, sıfır soluk) + etiket + düne-göre delta + sparkline.
   Throughput deltasında azalış PAL.mut2 (yavaş gün başarısızlık değil); artış DERIN.yesil.
   2026-07-25: ızgara 1×4 şeritten 2×2 bloğa döndü (bkz. R1). Ayraç kuralı ızgaraya
   sabitlendi: sol kenar tek indeksliye, üst kenar alt sıraya.
   İkon boyu ÇAĞRI YERİNDEN DEĞİL burada belirlenir (cloneElement) — dört ikon lucide
   varsayılanlarıyla 18/18/15/15 gelip aynı ızgarada farklı büyüklükte duruyordu.
   DÖRT HÜCRE TİPOGRAFİK OLARAK EŞ (kullanıcı isteği): üst sıra bir ara daha büyük
   sayı/etiket taşıyordu, aynı ızgarada aynı yapıdaki hücrelerin farklı boyu "bozuk"
   okunuyordu. Hiyerarşi artık tipten değil SIRADAN geliyor — birincil ölçüler üstte. */
function AkisHucre({ label, value, icon, onClick, ariaLabel, gunluk, i }) {
  const sifir = value === 0;
  const delta = gunluk ? gunluk.bugunN - gunluk.dunN : null;
  return (
    /* data-hover-buyut: hover'da İÇ sarmalayıcı (data-buyut) hafif ölçeklenir — kutu, kenarlık
       ve ızgara hairline'ları yerinde kalır. Kural NEON_KEYFRAMES'te (opt-in istisna). */
    <button type="button" onClick={onClick} aria-label={ariaLabel || label} {...focusRing} data-press="" data-hover-buyut=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", textAlign: "left", padding: `${SP.xl}px ${SP.l}px`,
        /* TIKLAMA ALANI = HÜCRENİN TAMAMI (2026-08-09 düzeltme). Buton doğrudan ızgara
           hücresidir; arada sarmalayıcı YOK. Daha önce bir `IsikYuzeyi` sarmalayıcısı vardı
           ve iç kabı genişlik almadığı için içerik kadar daralıyordu — buton `width:100%`
           deyip o daralmış kutuyu ölçü aldığından hücrenin sağ boşluğuna basınca hiçbir şey
           olmuyordu. Buraya sarmalayıcı eklenecekse hücreyi tam doldurduğu doğrulanmalı. */
        width: "100%", height: "100%",
        background: "transparent", border: "none",
        borderLeft: i % 2 === 1 ? `1px solid ${PAL.line}` : "none",
        borderTop: i >= 2 ? `1px solid ${PAL.line}` : "none", borderRadius: RAD.ctl,
        /* İçerik hücrenin ortasında: kutular takvim yüksekliğine esnediğinde sola yaslı
           küme geniş boşlukta yüzüyordu. flex:1 KALDIRILDI — metin bloğu boşluğu yutarsa
           justifyContent'in etkisi kalmaz. */
        display: "flex", alignItems: "center", justifyContent: "center",
        minWidth: 0, transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span data-buyut="" style={{ display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}>
        {/* İkon dairesel rozet içinde (2026-07-25): çıplak ikon geniş hücrede öksüz duruyordu;
            halka onu "başlık madalyonu" yapıp sayı+etiket bloğuna bağlıyor. Zemin ALFA (tek
            izinli tint), kenarlık hairline — dolu renkli rozet CTA gibi okunurdu. */}
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, width: 48, height: 48, borderRadius: RAD.dot,
          background: sifir ? "transparent" : ALFA(T), border: `1px solid ${sifir ? PAL.line : ALFA(T)}`,
          color: sifir ? PAL.mut3 : DERIN.T }}>
          {cloneElement(icon, { width: 24, height: 24 })}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap" }}>
            <span style={{ ...TYPE.num, color: sifir ? PAL.mut3 : PAL.ink, ...TNUM }}><NumberFlow value={value} /></span>
            {delta != null && gunluk.aktifGun >= 2 && delta !== 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, ...TYPE.meta, fontWeight: 500, color: delta > 0 ? DERIN.yesil : PAL.mut2, ...TNUM }}>
                {delta > 0 ? <OK_YUKARI /> : <OK_ASAGI />}{delta > 0 ? `+${delta}` : delta} düne göre
              </span>
            )}
          </span>
          <span style={{ display: "block", ...TYPE.ui, color: PAL.mut, marginTop: 2 }}>{label}</span>
        </span>
        {gunluk && <Sparkline seri={gunluk.seri} aktifGun={gunluk.aktifGun} />}
      </span>
    </button>
  );
}

/* ---------- R1: Kahraman (kuyruk yasal süre brifi) + sağ ray ---------- */

/* Süresi yaklaşan/geçen kuyruk evrağı satırı — yasal dayanak + son tarih + satır-içi İşle
   (secondary; doğrudan pipeline'a sokar). */
function SlaSatir({ x, onIsle }) {
  const gecikmis = x.sla.durum === "GECIKMIS";
  const renk = gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  // Gecikme cümlesi takvimle TEK kaynaktan (lib/sureTakvimi) — aynı evrak iki bileşende
  // farklı ifade edilmesin; ayrıca kalan_gun null'da "son null gün" basmaz.
  const kalanTxt = kalanMetin(x.sla);
  return (
    /* flexWrap + basis'li metin bloğu: dar ekranda (ölçüm: 390px'te satır 441px'e taşıyor,
       evrak adı 0px'e eziliyordu) çip/tarih/İşle üçlüsü ALT SATIRA iner, ad tam genişliği
       alır. Geniş ekranda üçlü marginLeft:auto ile hâlâ sağa yaslanır — görünüm bit-aynı. */
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m}px 0`, borderTop: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
      {/* Nokta değil UYARI ÜÇGENİ (2026-07-25): renksiz bir daire "durum" der, üçgen-ünlem
          "dikkat" der — bu satırlar zaten yalnız gecikmiş/kritik evraklar. Şekil ikinci bir
          sinyal katmanı: renk körlüğünde de uyarı okunur. */}
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(renk) }}>
        <Icon.alert width={17} height={17} />
      </span>
      <span style={{ flex: "1 1 240px", minWidth: 0, overflow: "hidden" }}>
        <span style={{ display: "block", ...TYPE.read, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
        <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.sla.mevzuat}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: SP.m, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span style={{ ...TYPE.data, fontWeight: 500, padding: "3px 10px", borderRadius: RAD.chip, background: ALFA(renk), color: DERIN_OF(renk), ...TNUM }}>{kalanTxt}</span>
        {x.sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 13, color: PAL.mut2 }}>son: {x.sla.son_tarih}</span>}
        <Btn onClick={() => onIsle(x.id)} ariaLabel={`${x.label} evrakını hemen işle`} style={{ padding: "4px 10px" }}>İşle <Icon.arrow /></Btn>
      </span>
    </div>
  );
}

/* Yığın şerit — kuyruğun süre kompozisyonu; dilimler arası 2px yüzey boşluğu (kenar çizgisi
   değil, boşluk ayırır). */
function SlaSerit({ dilimler, toplam }) {
  return (
    <>
      <div role="img" aria-label={dilimler.map((d) => `${d.n} ${d.l}`).join(", ")}
        style={{ display: "flex", gap: 2, height: 10 }}>
        {dilimler.map((d) => <span key={d.l} title={`${d.l}: ${d.n}`} style={{ width: `${(d.n / toplam) * 100}%`, minWidth: 4, background: d.c, borderRadius: RAD.chip }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.l}px`, marginTop: SP.s }}>
        {dilimler.map((d) => (
          <span key={d.l} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.data, color: PAL.mut2, ...TNUM }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: d.c }} />{d.n} {d.l}
          </span>
        ))}
      </div>
    </>
  );
}

/* Kahraman kart — durum makinesi: acil>0 → tam brif (sayı + şerit + satırlar + ekranın tek
   primary'si). Acil=0 → tek satırlık pozitif banda çöker; sükûnetin kendisi ödül (yeşil
   dolgu bandı yok — renk kutlama için değil) + "ilk yaklaşan süre" ufku. */
function KahramanBrif({ kuyrukSla, onGoInbox, onIsle }) {
  const [acilRef] = useAutoAnimate();
  const say = { normal: 0, kritik: 0, gecikmis: 0, tarihYok: 0, diger: 0 };
  for (const x of kuyrukSla) {
    if (x.sla.durum === "NORMAL") say.normal++;
    else if (x.sla.durum === "KRITIK") say.kritik++;
    else if (x.sla.durum === "GECIKMIS") say.gecikmis++;
    else if (x.sla.durum === "tarih_yok") say.tarihYok++;   // Gelen'deki çip ile aynı sözlük
    else say.diger++;
  }
  const acil = kuyrukSla
    .filter((x) => x.sla.durum === "GECIKMIS" || x.sla.durum === "KRITIK")
    .sort((a, b) => (a.sla.kalan_gun ?? 0) - (b.sla.kalan_gun ?? 0));
  /* Şerit renkleri (2026-07-25 düzeltme): eskiden son iki dilim PAL.mut3 (#7a7060) ve
     PAL.mut (#6b6255) idi — iki kahve tonu yan yana TEK renk gibi okunuyordu, üstelik
     "süre tanımsız" çoğu zaman en büyük dilim olduğu için şeridi kahverengi bir blok
     kaplıyordu. Artık her dilim ayrı bir palet rengi; kalan tek nötr "süre tanımsız"
     (gerçekten veri-yok durumu — nötr olması doğru, ama artık eşi yok). */
  const dilimler = [
    { c: BANT.yesil.c, n: say.normal, l: "normal takvim" },
    { c: BANT.sari.c, n: say.kritik, l: "kritik" },
    { c: BANT.kirmizi.c, n: say.gecikmis, l: "gecikmiş" },
    { c: T, n: say.tarihYok, l: "tarih doğrulanmalı" },   // bilgi durumu → gök mavisi
    { c: PAL.mut3, n: say.diger, l: "süre tanımsız" },     // veri yok → tek nötr
  ].filter((d) => d.n > 0);
  const toplam = kuyrukSla.length || 1;

  if (acil.length === 0) {
    // Pozitif hâl: temizken bile bir sonraki ufku göstermek güven verir.
    const yaklasan = kuyrukSla
      .filter((x) => x.sla.durum === "NORMAL" && Number.isFinite(x.sla.kalan_gun))
      .sort((a, b) => a.sla.kalan_gun - b.sla.kalan_gun)[0];
    return (
      <section aria-label="Kuyruk yasal süre durumu" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: `${SP.l}px ${SP.xl}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", color: DERIN.yesil }}><Icon.check width={20} height={20} /></span>
          <span style={{ ...TYPE.h2, color: PAL.ink }}>Kuyruğun tamamı normal takvimde</span>
          <span style={{ ...TYPE.read, color: PAL.mut, ...TNUM }}>
            {yaklasan ? `İlk yaklaşan süre: ${yaklasan.sla.son_tarih || `${yaklasan.sla.kalan_gun} gün`} — ${yaklasan.label}` : "Eskalasyon gerekmiyor."}
          </span>
        </div>
        <div style={{ marginTop: SP.m }}><SlaSerit dilimler={dilimler} toplam={toplam} /></div>
      </section>
    );
  }

  return (
    <section aria-label="Bugünün brifi — kuyruk yasal süre durumu" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.xl }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
        {/* Çalan saat: nu-alarm salvosu (3.2sn'de bir kısa titreşim). Bu dal zaten YALNIZ
            acil>0 iken render edilir — hareket gerçek bir aciliyeti temsil eder, süs değil.
            transformOrigin merkez: saat "sallanır", kaymaz. */}
        <span aria-hidden="true" style={{ display: "flex", color: DERIN_OF(say.gecikmis ? BANT.kirmizi.c : BANT.sari.c),
          animation: "nu-alarm 2s linear infinite", transformOrigin: "50% 50%" }}>
          <Icon.clock width={22} height={22} />
        </span>
        {/* minWidth ÇIPLAK 240 DEĞİL `min(240px,100%)`: 320px telefonda (iPhone SE) içerik
            alanı ~224px'e iniyor ve sabit taban kabı 25px dışarı itiyordu — WCAG 1.4.10
            Reflow 320px'te yatay kaydırma istemez. min() tabanı kabın genişliğiyle sınırlar;
            geniş ekranda davranış AYNEN aynı. */}
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.m, flex: 1, minWidth: "min(240px, 100%)", flexWrap: "wrap" }}>
          <span style={{ ...TYPE.num, color: say.gecikmis ? DERIN.kirmizi : DERIN.sari, ...TNUM }}><NumberFlow value={acil.length} /></span>
          {/* Bağlaçlar ("ya da") küçük — Türkçe başlık yazımında bağlaç büyütülmez.
              Kuyruk sayısı buradan KALDIRILDI: aynı sayı R1'deki "Gelen evrak" hücresinde
              zaten var, başlığı kalabalıklaştırıyordu (kullanıcı geri bildirimi). */}
          <span style={{ ...TYPE.h2, color: PAL.ink }}>Evrakın Yasal Süresi Doldu ya da Kritik</span>
        </span>
        {/* Ekranın tek primary'si: en acil evrakı doğrudan pipeline'a sokar. */}
        <Btn primary onClick={() => onIsle(acil[0].id)} ariaLabel={`En acil evrak: ${acil[0].label} — hemen işle`}>
          En acil evrakı işle <Icon.arrow />
        </Btn>
      </div>
      <div style={{ marginTop: SP.l }}><SlaSerit dilimler={dilimler} toplam={toplam} /></div>
      <div style={{ marginTop: SP.m }}>
        <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.data, color: PAL.mut2 }}>
          Yasal cevap süresi dolan/dolmak üzere olan evraklar; yasal dayanak her satırın altında yazılıdır.
        </p>
        <div ref={acilRef}>
          {acil.slice(0, 5).map((x) => <SlaSatir key={x.id} x={x} onIsle={onIsle} />)}
          {acil.length > 5 && (
            <button type="button" onClick={() => onGoInbox()} {...focusRing} data-press=""
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              style={{ cursor: "pointer", width: "100%", padding: `${SP.m}px 0`, background: "transparent", border: "none", borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500, color: DERIN.T, textAlign: "center", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
              {acil.length - 5} evrak daha; tümünü kuyruğun aciliyet sırasında görün
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- R3: Dağılım (tek yüzey, 3 iç kolon) ---------- */

function BarList({ rows, color }) {
  if (!rows.length) return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>—</p>;
  const max = rows[0][1] || 1;
  return rows.map(([label, c]) => (
    <div key={label} title={`${label}: ${c} evrak`} style={{ marginBottom: SP.m }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: SP.s, ...TYPE.data, color: PAL.mut2, marginBottom: SP.xs }}>
        <span style={{ color: PAL.ink2, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: DERIN_OF(color), fontWeight: 600, ...TNUM, flexShrink: 0 }}>{c}</span>
      </div>
      <div style={{ height: 10, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((c / max) * 100)}%`, background: color, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
      </div>
    </div>
  ));
}

/* Dağılım iç kolon başlığı — koyu + Title Case (2026-07-25 kullanıcı isteği). Eski hâli
   PAL.mut3 12px sentence case idi: üç kolonun sınırı okunmuyordu. */
function KolonBaslik({ children }) {
  return <p style={{ margin: `0 0 ${SP.m}px`, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{children}</p>;
}

function DagilimYuzeyi({ n, risk, turList, birimList, ortGuven, genis }) {
  if (n < 3) {
    return (
      <NeonCard title="Dağılım" accent={T} icon={<Icon.chart width={16} height={16} />}>
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Dağılım özeti 3 işlemden sonra oluşur — {3 - n} evrak kaldı.</p>
      </NeonCard>
    );
  }
  const kolonStil = (i) => ({ minWidth: 0, paddingLeft: genis && i > 0 ? SP.l : 0, borderLeft: genis && i > 0 ? `1px solid ${PAL.line}` : "none",
    paddingTop: !genis && i > 0 ? SP.l : 0, borderTop: !genis && i > 0 ? `1px solid ${PAL.line}` : "none" });
  return (
    <NeonCard title="Dağılım" accent={T} icon={<Icon.chart width={16} height={16} />} tag={ortGuven != null ? `ort. güven %${ortGuven}` : undefined}>
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(3, 1fr)" : "1fr", gap: SP.l }}>
        <div style={kolonStil(0)}>
          <KolonBaslik>Risk Bandı</KolonBaslik>
          {["yesil", "sari", "kirmizi"].map((k) => {
            const pct = n ? Math.round((risk[k] / n) * 100) : 0;
            return (
              <div key={k} style={{ marginBottom: SP.m }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: SP.s, ...TYPE.data, color: PAL.mut2, marginBottom: SP.xs }}>
                  <span style={{ color: DERIN_OF(BANT[k].c), fontWeight: 600 }}>{BANT[k].l} · {BANT[k].t}</span><span style={{ ...TNUM }}>{risk[k]} (%{pct})</span>
                </div>
                <div title={`${BANT[k].l}: ${risk[k]} (%${pct})`} style={{ height: 10, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: BANT[k].c, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
                </div>
              </div>
            );
          })}
        </div>
        {/* İki BarList kolonu ARTIK AYRI RENKTE (2026-07-25): ikisi de V (mor) olduğu için
            "evrak türü" ile "havale edilen birim" çubukları tek veri kümesi gibi okunuyordu.
            Tür = mühür moru, birim = gök mavisi — sütun kimliği renkten de anlaşılır. */}
        <div style={kolonStil(1)}>
          <KolonBaslik>Evrak Türü</KolonBaslik>
          <BarList rows={turList} color={V} />
        </div>
        <div style={kolonStil(2)}>
          <KolonBaslik>Havale Edilen Birim</KolonBaslik>
          <BarList rows={birimList} color={T} />
          {birimList.length > 0 && <p style={{ margin: 0, ...TYPE.data, color: PAL.mut3 }}>Görev 2 yönlendirmesi: en çok havale alan birimler.</p>}
        </div>
      </div>
    </NeonCard>
  );
}

/* Birim bazlı gecikme — işlenmiş evraklardan GECİKMİŞ/KRİTİK olanlar birime göre;
   yoksa dürüst yeşil not. */
function BirimGecikmeKart({ rows }) {
  const [ref] = useAutoAnimate();
  const varmi = rows.length > 0;
  return (
    <NeonCard title="Birim Bazlı Gecikme" accent={varmi ? BANT.kirmizi.c : BANT.yesil.c} tag="havale + yasal süre" icon={<Icon.clock />}>
      {varmi ? (
        <div ref={ref}>
          {rows.map(([birim, e]) => (
            <div key={birim} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
              <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{birim}</span>
              {e.gecikmis > 0 && (
                <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(BANT.kirmizi.c), background: ALFA(BANT.kirmizi.c), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{e.gecikmis} gecikmiş</span>
              )}
              {e.kritik > 0 && (
                <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(BANT.sari.c), background: ALFA(BANT.sari.c), borderRadius: RAD.chip, padding: "2px 8px", ...TNUM }}>{e.kritik} kritik</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: DERIN.yesil }}>
          <Icon.check width={14} height={14} /> İşlenen evraklarda birim bazlı gecikme yok.
        </div>
      )}
    </NeonCard>
  );
}

/* ---------- R4: İşlem süresi + zaman-gruplu feed ---------- */

/* Bar yüksekliği px hesaplanır (yüzde DEĞİL): her kolonun üstünde değer etiketi var, etiket
   de akışta yer kaplıyor — yüzde yükseklik toplamı kolonu taşırırdı. */
const BAR_ALAN = 128;   // kolon toplam yüksekliği
const BAR_TAVAN = 100;  // barın alabileceği en çok yükseklik (kalanı etiket + boşluk)

/* SureGrafik — kompakt kartın gövdesi. 2026-07-25 yeniden tasarım (kullanıcı referansı):
   · Her barın üstünde KALICI değer etiketi (eskiden yalnız hover title'ıydı — dokunmatikte
     hiç görünmüyordu).
   · Bar rengi HIZ KADEMESİNDEN gelir (lib/sureRapor.hizKademe): ortalamanın altı / ortalama
     ile eşik arası / eşiğin üstü. Eşik tabloyla AYNI kural (ort × 1.25) — kartta ve raporda
     aynı koşum aynı rengi alır. Eskiden tek vurgu "en yeni" barıydı; hangi koşumun yavaş
     olduğu okunmuyordu.
   · Renk ölçeği IRIS (sıralı pastel rampa), BANT DEĞİL: ilk sürüm yeşil→kırmızıydı ve
     kırmızı-yeşil renk körlüğünde hue tek sinyal kalıyordu. IRIS'te bilgi AÇIKLIKTA —
     üstelik her barın üstünde sayı yazılı, yani renk hiçbir zaman tek taşıyıcı değil.
   · Bar sayısı 10 → 7: dar kolonda (span 4 ≈ 43px/kolon) 10 etiket üst üste biniyordu.
   Etiket yalnız SAYIdır ("10.4"), birim eksen satırında — "10.4 sn" 43px kolona sığmıyor. */
function SureGrafik({ history }) {
  const olcum = useMemo(() => olcumler(history), [history]);
  const ort = useMemo(() => ortalama(olcum), [olcum]);
  if (olcum.length === 0) {
    return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Süre verisi bu oturumdan itibaren toplanıyor; bir evrak işleyin.</p>;
  }
  const son = olcum.slice(0, 7).reverse();   // eski → yeni (soldan sağa zaman)
  const max = Math.max(...son.map((x) => x.ms));
  const gTrend = genelTrend(olcum);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.num, color: PAL.ink, ...TNUM }}>{fmtSn(ort)} sn</span>
        <TrendRozet t={gTrend} sade />
      </div>
      <div role="img" aria-label={`Son ${son.length} işlemin süreleri, ortalama ${fmtSn(ort)} saniye`}
        style={{ display: "flex", alignItems: "flex-end", gap: SP.xs, height: BAR_ALAN, marginTop: SP.m }}>
        {son.map((x, i) => {
          const kademe = hizKademe(x.ms, ort);
          return (
            <span key={`${x.id}-${i}`} title={`${x.ad} — ${fmtSn(x.ms)} sn (${IRIS[kademe].l})`}
              style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end", gap: SP.xs }}>
              {/* Koyu değer baloncuğu — açık zeminde en okunur eşleşme (toast ile aynı çift).
                  Sayının kendisi renkten BAĞIMSIZ sinyal: renk körlüğünde de süre okunur. */}
              {/* 12/16 mono-meta çifti: sayı erişilebilirlik yükünü taşıyor (renkten bağımsız
                  sinyal) — 10px okunabilirlik tabanının altındaydı; dolgu daraltıldı. */}
              <span style={{ maxWidth: "100%", overflow: "hidden", background: PAL.inkSurf, color: PAL.onInk,
                fontFamily: MONO, fontSize: 12, lineHeight: "16px", padding: "1px 4px",
                borderRadius: RAD.chip, whiteSpace: "nowrap", ...TNUM }}>{fmtSn(x.ms)}</span>
              <span style={{ width: "100%", height: Math.max(6, Math.round((x.ms / max) * BAR_TAVAN)),
                ...IRIS_BAR(kademe), borderBottom: "none", borderRadius: `${RAD.chip}px ${RAD.chip}px 0 0` }} />
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: SP.s, ...TYPE.meta, color: PAL.mut3, marginTop: SP.xs, ...TNUM }}>
        <span>eski</span><span>son {son.length} koşum (sn)</span><span>yeni</span>
      </div>
    </>
  );
}

/* Feed satırı — durum noktası + ad + tek semantik çip + tür/birim + mono saat. */
function FeedSatir({ h, onGoIslenen, bugunGrubu }) {
  const bekliyor = h.result?.yazi_taslak_md && !h.result?.onay_durumu;
  // Satırın çip/tür/saat parçaları `flexShrink: 0` taşır (kırpılmamaları KASITLI). Telefonda
  // toplamları kaba sığmayınca satır dışarı taşıyordu (ölçüldü 2026-08-12: 390px ekranda saat
  // 120px dışarıda, sayfa 87px yatay kayıyordu). Dar ekranda satır sarar: ad ilk satırı tek
  // başına alır, künye ikinci satıra iner — hiçbir bilgi kırpılmaz.
  const dar = useDarEkran();
  return (
    <button type="button" onClick={onGoIslenen} aria-label={`${h.name} — işlenen evrak arşivinde gör`} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.m, width: "100%", textAlign: "left",
        ...(dar ? { flexWrap: "wrap", rowGap: SP.xs } : null),
        padding: "8px 4px", background: "transparent", border: "none", borderTop: `1px solid ${PAL.line}`,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[h.bant]?.c || PAL.mut2, flexShrink: 0 }} />
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: dar ? "1 1 100%" : 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
      {bekliyor && <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.sari, background: ALFA(BANT.sari.c), borderRadius: RAD.chip, padding: "2px 8px", flexShrink: 0 }}>karar bekliyor</span>}
      <span style={{ ...TYPE.meta, color: PAL.mut, flexShrink: 0 }}>{EVRAK_TR(h.evrak_turu)}</span>
      <span style={{ ...TYPE.meta, color: DERIN.V, textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{BIRIM_GOSTER(h.hedef_birim, h.evrak_turu)}</span>
      {/* Grup zaten günü söylüyor — bugün yalnız saat; eski gruplarda gün+saat.
          ts geçersizse boş (fmtGunSaat(0) 1970 basıyordu). */}
      <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2, flexShrink: 0, ...TNUM }}>{Number.isFinite(h.ts) ? (bugunGrubu ? fmtSaat(h.ts) : fmtGunSaat(h.ts)) : ""}</span>
    </button>
  );
}

function SonIslemlerFeed({ history, n, onGoIslenen }) {
  const [sonRef] = useAutoAnimate();
  // Zaman-gruplu feed: liste → hikâye ("bugün 9 işlem yaptın").
  const gruplar = useMemo(() => {
    const bugun = gunBasi(Date.now());
    const g = { bugun: [], dun: [], eski: [] };
    for (const h of history.slice(0, 8)) {
      const t = Number.isFinite(h.ts) ? gunBasi(h.ts) : 0;
      if (t === bugun) g.bugun.push(h);
      else if (t === bugun - GUN_MS) g.dun.push(h);
      else g.eski.push(h);
    }
    return [["Bugün", g.bugun, true], ["Dün", g.dun, false], ["Daha eski", g.eski, false]].filter(([, list]) => list.length > 0);
  }, [history]);
  return (
    <NeonCard title="Son İşlemler" accent={T} tag={`son ${Math.min(history.length, 8)} / ${n}`}>
      {/* Başlıklar ve satırlar aynı konteynerin DOĞRUDAN çocukları — auto-animate yalnız
          doğrudan çocukları izler; grup sarmalayıcısı yeni satır girişini görünmez kılıyordu. */}
      <div ref={sonRef}>
        {gruplar.flatMap(([etiket, list, bugunGrubu]) => [
          <div key={`grup-${etiket}`} style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3, padding: "6px 4px 2px", ...TNUM }}>
            <span>{etiket}</span><span>{list.length}</span>
          </div>,
          ...list.map((h) => <FeedSatir key={h.id} h={h} onGoIslenen={onGoIslenen} bugunGrubu={bugunGrubu} />),
        ])}
      </div>
      <button type="button" onClick={onGoIslenen} {...focusRing} data-press=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", width: "100%", padding: "8px 0", background: "transparent", border: "none", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: DERIN.T, textAlign: "center", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
        Tüm işlenen evrakı gör
      </button>
    </NeonCard>
  );
}

/* ---------- Ana görünüm ---------- */

export default function PanelView({ history = [], outbox = [], inboxCount = 0, kuyrukSla = [], slaHatasi = false, onGoInbox, onIsle = () => {}, onGoIslenen = () => {}, onGoGiden = () => {}, onGoTaslaklar = null, onUpload, user }) {
  const genis = useGenisEkran();
  const dar = useDarEkran();          // telefon eşiği (640px) — ölçü şeridi tek kolona iner
  const [raporAcik, setRaporAcik] = useState(false);   // İşlem Süresi detay raporu
  const n = history.length;
  const gonderilenler = useMemo(() => outbox.filter((o) => o.durum === "gonderildi"), [outbox]);
  // Birikimli üretim: karar durumundan bağımsız, taslak üretilmiş TÜM işlemler (jüri T6).
  const taslaklilar = useMemo(() => history.filter((h) => h.result?.yazi_taslak_md), [history]);
  const { risk, turList, birimList, birimGecikmeList, ortGuven } = useMemo(() => {
    const risk = { yesil: 0, sari: 0, kirmizi: 0 };
    const turler = {}, birimler = {}, birimGecikme = {};
    const guvenler = [];
    for (const h of history) {
      if (risk[h.bant] != null) risk[h.bant]++;
      const t = EVRAK_TR(h.evrak_turu); turler[t] = (turler[t] || 0) + 1;
      if (h.hedef_birim) { const b = BIRIM_LBL(h.hedef_birim); birimler[b] = (birimler[b] || 0) + 1; }
      const durum = h.result?.sla_metadata?.durum;
      if ((durum === "GECIKMIS" || durum === "KRITIK") && h.hedef_birim) {
        const b = BIRIM_LBL(h.hedef_birim);
        const e = birimGecikme[b] || { gecikmis: 0, kritik: 0 };
        if (durum === "GECIKMIS") e.gecikmis++; else e.kritik++;
        birimGecikme[b] = e;
      }
      const g = h.result?.tur_confidence;
      if (Number.isFinite(g) && g > 0) guvenler.push(g);
    }
    return {
      risk,
      turList: Object.entries(turler).sort((a, b) => b[1] - a[1]).slice(0, 4),
      birimList: Object.entries(birimler).sort((a, b) => b[1] - a[1]).slice(0, 4),
      birimGecikmeList: Object.entries(birimGecikme)
        .sort((a, b) => (b[1].gecikmis - a[1].gecikmis) || (b[1].kritik - a[1].kritik))
        .slice(0, 6),
      ortGuven: guvenler.length ? Math.round((guvenler.reduce((a, x) => a + x, 0) / guvenler.length) * 100) : null,
    };
  }, [history]);

  // Akış nabzı serileri (7 gün) — delta/sparkline ham ts'lerden; Gelen'in tarihsel verisi
  // yok (kuyruk anlık durum) → o hücrede dürüstçe yalnız sayı.
  const akisIslenen = useMemo(() => gunlukSeri(history.map((h) => h.ts)), [history]);
  const akisTaslak = useMemo(() => gunlukSeri(taslaklilar.map((h) => h.ts)), [taslaklilar]);
  // Outbox'ta zaman alanı gonderim_tarihi'dir (ts değil) — Number epoch, iki hidrasyon
  // yolunda da (pushOutbox + DB) garanti. Yanlış alan sparkline'ı sessizce öldürüyordu.
  const akisGiden = useMemo(() => gunlukSeri(gonderilenler.map((o) => o.gonderim_tarihi)), [gonderilenler]);
  // İşlem Süresi kartının başlık grafiği: günlük ORTALAMA süre (adet değil) — son 7 gün.
  const sureGunluk = useMemo(() => gunlukOrtSure(olcumler(history)), [history]);

  /* Manşet: sade selam (2026-07-25). Eskiden kuyruk sayısı + acil sayısı da buradaydı;
     ikisi de sayfanın kendisinde (ölçü hücreleri + kahraman brifi) zaten yazıyordu —
     aynı veriyi üçüncü kez söylemek başlığı kalabalıklaştırıyordu. Ad Türkçe kurallarıyla
     büyütülür (bkz. lib/trMetin: "ibrahim" → "İbrahim", varsayılan locale "Ibrahim" verir). */
  const manset = `Hoş geldiniz, ${adBuyut(user?.ad_soyad) || "Memur"}`;

  const span = (kol) => ({ gridColumn: genis ? `span ${kol}` : "1 / -1", minWidth: 0 });

  /* R1 kuşağı iki kolonu KARŞILIKLI paylaşır: takvim yoksa ölçü şeridi 12 kola yayılır.
     Şerit sabit 8 kolda kalırsa (eski hâl) sağda 4 kolluk ÖLÜ boşluk açılıyordu — takvim
     backend'in /sla/onizleme yanıtına bağlı olduğundan (servis kapalı / tüm örnekler
     gönderilmiş) bu boşluk sahada gerçekten görülüyor ve sayfa "bozulmuş" okunuyor.
     Takvimin karşılıklı kuralı (`n > 0 ? 4 : 12`) zaten vardı; eksik olan tarafı budur. */
  const takvimVar = kuyrukSla.length > 0;

  // Gerçek sıfır: hiç işlem yok VE kuyruk boş → tek boş durum; iskelet kart dizmek "ölü panel".
  if (n === 0 && inboxCount === 0 && kuyrukSla.length === 0) {
    return (
      <ViewWrap id="panel-h" title="Panel" sub={manset}>
        <EmptyState icon={<Icon.chart />} title="Kuyruk Boş"
          sub="Yeni bir belge yükleyerek başlayın — işlenen her evrak burada özetlenir."
          actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="panel-h" title="Panel" sub={manset}>
      {/* Atmosfer ARTIK ViewWrap'ten geliyor (tüm görünümler tek yerden alır) — burada
          mükerrer katman yok. */}
      {/* Giriş: tek nefes — nu-rise yalnız konteynere, kart kart stagger yok. */}
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(12, 1fr)" : "1fr", gap: SP.l, alignItems: "start", animation: `nu-rise .16s ${EASE.out} both` }}>

        {/* R1 — akış nabzı (2×2, 8 kol) + yasal süre takvimi (4 kol), eşit yükseklikte.
            2026-07-25 yeniden düzen: ölçüler "nerede duruyorum", takvim "ne zaman" sorusunu
            yanıtlar; ikisi de bağlam — bu yüzden üstte yan yana. Aksiyon (brif) ALTLARINDA.
            alignSelf:stretch + height:%100 → iki kolon aynı hizada biter (ana ızgara
            alignItems:"start" olduğu için hücre bazında ezilir).
            Ölçü şeridi 1×4'ten 2×2'ye döndü: üst sıra birincil (işlenen/gelen), alt sıra
            ikincil (taslak/gönderilen). Kart eşlemesi kurgu ayrımını izler: İşlenen → İşlenen
            arşivi; Üretilen taslak → Taslaklar; Gönderilen → Giden.
            overflow:hidden YOK — focusRing dışa taşan halka çizer, kırpılırsa klavye odağı
            görünmez olur. aria-label sayıyı da taşır — salt eylem etiketi panelin ana
            verisini ekran okuyucudan gizliyordu (review bulgusu). */}
        {n > 0 && (
          /* Ölçü şeridi — dört hücre, her biri TEK BAŞINA bir ızgara hücresi ve tamamı
             tıklanabilir buton. Aralarında sarmalayıcı yok: hücrenin her pikseli hedeftir
             (bkz. AkisHucre'deki tıklama alanı notu). */
          <div style={{ ...span(takvimVar ? 8 : 12), alignSelf: "stretch", height: "100%", background: PAL.surf,
            border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
            /* Telefonda TEK kolon: 2×2 ızgara 360px ekranda hücre başına ~132px bırakıyor,
               "Gönderilen Evrak" etiketi + ikon + sayı sığmayıp kabı 16px aşıyordu (ölçüldü
               2026-08-12). overflow:hidden olduğu için taşma kaymaya değil KIRPILMAYA
               dönüşüyor — sayı kesiliyordu. Dar ekranda dört hücre alt alta iner. */
            display: "grid", gridTemplateColumns: dar ? "1fr" : "repeat(2, 1fr)", gridAutoRows: "1fr",
            overflow: "hidden" }}>
            {[
              { label: "İşlenen Evrak", value: n, icon: <Icon.doc />, onClick: onGoIslenen, ariaLabel: `${n} işlenen evrak — arşivi aç`, gunluk: akisIslenen },
              { label: "Gelen Evrak", value: inboxCount, icon: <Icon.inbox />, onClick: () => onGoInbox(), ariaLabel: `${inboxCount} gelen evrak — kuyruğu aç`, gunluk: null },
              { label: "Üretilen Taslak", value: taslaklilar.length, icon: <Icon.edit />, onClick: onGoTaslaklar || onGoIslenen, ariaLabel: `${taslaklilar.length} üretilen taslak — Taslaklar'ı aç`, gunluk: akisTaslak },
              { label: "Gönderilen Evrak", value: gonderilenler.length, icon: <Icon.send />, onClick: onGoGiden, ariaLabel: `${gonderilenler.length} gönderilen evrak — Giden arşivini aç`, gunluk: akisGiden },
            ].map((h, i) => <AkisHucre key={h.label} {...h} i={i} />)}
          </div>
        )}
        {/* Takvim — kuyrukSla'nın AY izdüşümü (yeni veri kaynağı YOK; brifle aynı dizi).
            Ölçü bloğu yoksa (hiç işlem yapılmamış) tam genişliğe yayılır. */}
        {takvimVar && (
          <div style={{ ...span(n > 0 ? 4 : 12), alignSelf: "stretch" }}>
            <SureTakvimi kuyrukSla={kuyrukSla} />
          </div>
        )}

        {/* R1.5 — kahraman brifi: ekranın tek "şimdi davran" sinyali ve tek primary'si.
            2026-07-25'te ölçü+takvim kuşağının ALTINA taşındı (içerik/mantık aynı, yalnız
            konum): bağlam önce, aksiyon sonra. Kuyruk SLA'sı yoksa hiç görünmez. */}
        {takvimVar && (
          <div style={span(12)}>
            <KahramanBrif kuyrukSla={kuyrukSla} onGoInbox={onGoInbox} onIsle={onIsle} />
          </div>
        )}
        {/* SLA servisi yanıt vermediğinde takvim ve brif SESSİZCE kayboluyordu — panel
            "bozulmuş" görünüyor, sebebi hiçbir yerde yazmıyordu. Kuyruk boşaldığı için
            gizlendiklerinde bu satır ÇIKMAZ (o dürüst bir boşluktur); yalnız istek
            başarısızken çıkar. Eksik veriyi uydurmayız, yokluğunu söyleriz. */}
        {!takvimVar && slaHatasi && (
          <div style={{ ...span(12), display: "flex", alignItems: "center", gap: SP.s,
            padding: `${SP.s}px ${SP.m}px`, background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}`,
            borderRadius: RAD.ctl, ...TYPE.meta, color: DERIN.sari }}>
            <span aria-hidden="true" style={{ display: "flex" }}><Icon.clock width={14} height={14} /></span>
            Yasal süre servisine ulaşılamadı — süre takvimi ve kuyruk brifi geçici olarak gizli.
            Diğer veriler etkilenmedi.
          </div>
        )}

        {/* R3 + R4 — gözlem kuşağı: kahramanın arkasındaki sakin koro. */}
        {n === 0 ? (
          <div style={span(12)}>
            <EmptyState icon={<Icon.chart />} title="Henüz Evrak İşlenmedi"
              sub="Kuyruktan bir evrak işlediğinizde akış, dağılım ve süre özetleri burada oluşur."
              actions={[<Btn key="g" onClick={() => onGoInbox()}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
          </div>
        ) : (
          <>
            <div style={span(8)}>
              <DagilimYuzeyi n={n} risk={risk} turList={turList} birimList={birimList} ortGuven={ortGuven} genis={genis} />
            </div>
            <div style={span(4)}>
              <BirimGecikmeKart rows={birimGecikmeList} />
            </div>
            <div style={span(8)}>
              <SonIslemlerFeed history={history} n={n} onGoIslenen={onGoIslenen} />
            </div>
            <div style={span(4)}>
              {/* Kompakt kart AYNEN duruyor; altına yalnız rapora açılan bir bağlantı eklendi
                  (2026-07-25). Kartın tamamını tıklanabilir yapmak, içindeki bar başlıklarının
                  hover detayını (native title) yutardı. */}
              {/* tag: NeonCard başlığının sağ ucu — düz metin yerine etiket + günlük ortalama
                  sparkline'ı (aynı bileşen, AkisHucre ile tek görsel dil). */}
              <NeonCard title="İşlem Süresi" accent={T} icon={<Icon.clock width={16} height={16} />}
                tag={sureGunluk.aktifGun >= 2 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s }}>
                    ortalama · son 7 gün
                    <Sparkline seri={sureGunluk.seri} aktifGun={sureGunluk.aktifGun} birim="sn" />
                  </span>
                ) : undefined}>
                <SureGrafik history={history} />
                {/* Kıyaslama — detay raporuyla ORTAK bileşen (SureKiyas.jsx); dar kolonda
                    karolar alt alta iner. Ölçüm yoksa hiç render edilmez. */}
                <SureKiyasBloku history={history} />
                <Btn primary onClick={() => setRaporAcik(true)} ariaLabel="İşlem süresi detay raporunu aç"
                  style={{ width: "100%", justifyContent: "center", marginTop: SP.l }}>
                  Detay raporu <Icon.arrow width={14} height={14} />
                </Btn>
              </NeonCard>
            </div>
          </>
        )}
      </div>
      <SureRaporModal acik={raporAcik} onKapat={() => setRaporAcik(false)} history={history} />
    </ViewWrap>
  );
}
