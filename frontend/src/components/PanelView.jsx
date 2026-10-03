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
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, DISPLAY, T, V, R, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, IRIS, IRIS_BAR, focusRing } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER } from "./result-cards.jsx";
import SureTakvimi, { TakvimIskelet } from "./SureTakvimi.jsx";
import KahramanBrif, { BrifIskelet, PANEL_KF, giris, iskeletCizgi, iskeletNefes } from "./PanelBrif.jsx";
import { useDarEkran } from "../hooks/useMedya.js";
import SureRaporModal from "./SureRaporModal.jsx";
import SureKiyasBloku, { TrendRozet } from "./SureKiyas.jsx";
import { olcumler, ortalama, genelTrend, hizKademe, gunlukOrtSure, fmtSn } from "../lib/sureRapor.js";
import { adBuyut } from "../lib/trMetin.js";
import { GUN_MS, gunBasi, gunlukSeri } from "../lib/gunlukSeri.js";

/* Görsel olarak gizli, ekran okuyucuya açık durum metni (iskeletler aria-hidden). */
const SR_YALNIZ = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

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

/* Akış hücresi (2026-10 yeniden tasarım) — "sicil defteri sayacı": küçük ikon + etiket üstte,
   altında Archivo rakam (NumberFlow, açılışta 0'dan sayar) + sağda 7 günlük sparkline,
   en altta düne-göre delta. Throughput deltasında azalış PAL.mut2 (yavaş gün başarısızlık
   değil); artış DERIN.yesil. Dört hücre tipografik olarak EŞ (kullanıcı isteği) — hiyerarşi
   sıradan gelir. Ayraç kuralı: `kolon` sütunlu ızgarada sol kenar sütun başına, üst kenar
   ikinci satırdan itibaren. TIKLAMA ALANI = HÜCRENİN TAMAMI (2026-08-09 düzeltme): buton
   doğrudan ızgara hücresidir, arada sarmalayıcı yok. */
/* NumberFlow'un 36px rakamı kendi satır kutusuyla 56px yer kaplar (DOM ölçümü 412/1440,
   2026-10-03) — iskelet rakam yuvası bu yükseklikte olmalı, yoksa kart dolunca 40px uzar. */
const RAKAM_KUTUSU = 56;

function AkisHucre({ label, value, icon, onClick, ariaLabel, gunluk, i, kolon, yukleniyor = false }) {
  /* Açılışta 0'dan SAYMAZ (tur 3, BENCHMARK §4 "son bilinen değerden"): dört sayaç aynı anda
     dönerken rakam şeridi maskenin dışına taşıp üst üste binmiş görünüyordu ve kart artık
     çoğu ekranda katın altında — sayım görülmeden bitiyordu. NumberFlow yalnız canlı veri
     DEĞİŞİMİNDE akar; panelin tek açılış sayımı kahramanın dev rakamıdır. */
  const akan = value;
  const sifir = value === 0;
  const delta = gunluk ? gunluk.bugunN - gunluk.dunN : null;
  const deltaVar = delta != null && gunluk.aktifGun >= 2 && delta !== 0;
  const kutu = { textAlign: "left", padding: `${SP.l}px ${SP.l + 2}px`, width: "100%", height: "100%",
    background: "transparent", border: "none", borderRadius: 0,
    borderLeft: i % kolon !== 0 ? `1px solid ${PAL.line}` : "none",
    borderTop: i >= kolon ? `1px solid ${PAL.line}` : "none",
    display: "flex", minWidth: 0 };
  /* Yükleme: AYNI kutu ve satır yükseklikleri (rakam kutusu, 16px delta satırı) —
     rakam yerine kurşun çizgi. Etiket statik metindir, gösterilir; sayı UYDURULMAZ (0 basmak
     "hiç işlem yok" hükmü olurdu). Tıklanamaz: henüz gösterecek sayı yok. */
  const ic = (
    <span data-buyut="" style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", minWidth: 0, transformOrigin: "0 50%" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.meta, color: PAL.mut2, minWidth: 0 }}>
        <span aria-hidden="true" style={{ display: "flex", color: sifir || yukleniyor ? PAL.mut3 : DERIN.T }}>{cloneElement(icon, { width: 14, height: 14 })}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </span>
      <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.s }}>
        {yukleniyor ? (
          <span style={{ display: "flex", alignItems: "center", height: RAKAM_KUTUSU }}><span style={iskeletCizgi(52, 26)} /></span>
        ) : (
          <span style={{ fontFamily: DISPLAY, fontSize: 36, lineHeight: "36px", fontWeight: 800, fontStretch: "118%", letterSpacing: "-.03em",
            color: sifir ? PAL.mut3 : PAL.ink, ...TNUM }}><NumberFlow value={akan} /></span>
        )}
        {!yukleniyor && gunluk && <Sparkline seri={gunluk.seri} aktifGun={gunluk.aktifGun} />}
      </span>
      {yukleniyor ? (
        <span style={{ display: "flex", alignItems: "center", minHeight: 16 }}><span style={iskeletCizgi(72, 8)} /></span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, minHeight: 16, ...TYPE.meta, fontWeight: 500,
          color: deltaVar ? (delta > 0 ? DERIN.yesil : PAL.mut2) : PAL.mut3, ...TNUM }}>
          {deltaVar ? (<>{delta > 0 ? <OK_YUKARI /> : <OK_ASAGI />}{delta > 0 ? `+${delta}` : delta} düne göre</>) : (gunluk ? "dünle aynı" : "anlık kuyruk")}
        </span>
      )}
    </span>
  );
  if (yukleniyor) return <div style={kutu}>{ic}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel || label} {...focusRing} data-press="" data-hover-buyut=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...kutu, cursor: "pointer", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      {ic}
    </button>
  );
}

/* Akış kartı — dört sayaç tek yüzeyde. `kolon`: 2 (takvimin altında, dar ray) · 4 (takvim
   yokken tam genişlik şerit) · 1 (telefon). Başlık antet dilinde (mono, izlemeli).
   `yukleniyor`: geçmiş gelene kadar AYNI kart, aynı ızgara — yalnız rakamlar kurşun çizgi.
   Yuva yüklemede ayrılır; veri gelince kart yerinde dolar, altındaki gözlem kaymaz. */
function AkisKarti({ hucreler, kolon, yukleniyor = false }) {
  return (
    <section aria-label="Akış nabzı" aria-busy={yukleniyor || undefined}
      style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden",
        ...(yukleniyor ? iskeletNefes() : null) }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.m}px ${SP.l + 2}px`, borderBottom: `1px solid ${PAL.line}`, ...TYPE.antet, color: PAL.mut3 }}>
        <span>AKIŞ NABZI</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
        <span>SON 7 GÜN</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${kolon}, minmax(0, 1fr))` }}>
        {hucreler.map((h, i) => <AkisHucre key={h.label} {...h} i={i} kolon={kolon} yukleniyor={yukleniyor} />)}
      </div>
    </section>
  );
}
/* ---------- R3: Dağılım (tek yüzey, 3 iç kolon) ---------- */

/* Boş kolon — tek tire "veri bozuk" gibi okunuyordu. Kesik çizgili hayalet çubuklar kolonun
   NE göstereceğini çizer, cümle NEDEN boş olduğunu söyler (veri uydurulmaz: çubuklar boş). */
function BosKolon({ metin }) {
  return (
    <div>
      {[0.82, 0.54].map((w) => (
        <div key={w} aria-hidden="true" style={{ marginBottom: SP.m }}>
          <div style={{ height: 14, width: `${w * 60}%`, borderRadius: RAD.chip, background: PAL.surfHi, marginBottom: SP.xs }} />
          <div style={{ height: 10, width: `${w * 100}%`, borderRadius: RAD.chip, border: `1px dashed ${PAL.lineHi}` }} />
        </div>
      ))}
      <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2, textWrap: "pretty" }}>{metin}</p>
    </div>
  );
}

function BarList({ rows, color, bos = "Kayıt yok." }) {
  if (!rows.length) return <BosKolon metin={bos} />;
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
          <BarList rows={birimList} color={T}
            bos="Henüz kayıtlı havale yok — birim yönlendirmesi doğrulanan evraklar burada birime göre sayılır." />
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
        /* Sükûnet hâli — tek satır olumlu hüküm + neyin ölçüldüğünü söyleyen alt not. Eskiden
           kart Dağılım'ın boyuna gerilip tek satırı ortada yüzdürüyordu (ölü kart). */
        <div style={{ display: "flex", gap: SP.m, alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 28, height: 28, flexShrink: 0, borderRadius: RAD.dot,
            color: DERIN.yesil, background: ALFA(BANT.yesil.c), border: `1px solid ${BANT.yesil.c}` }}>
            <Icon.check width={14} height={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Gecikmiş havale yok</p>
            <p style={{ margin: "2px 0 0", ...TYPE.data, color: PAL.mut2, textWrap: "pretty" }}>
              İşlenen evrakın hiçbiri, havale edildiği birimde yasal süresini aşmadı ya da kritik eşikte değil.
            </p>
          </div>
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
    <NeonCard title="Son İşlemler" accent={T} tag={`son ${Math.min(history.length, 8)} / ${n}`} style={{ flex: 1 }}>
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

/* ---------- Gözlem: yükleniyor / hata ---------- */

/* "Kuruyan mürekkep" iskeleti (BENCHMARK §3 yedek işçilik): gerçek kartların ŞEKLİNDE kurşun
   kalem çizgileri, spinner yok. Eskiden DB geçmişi gelene kadar n=0 sayılıp "Henüz evrak
   işlenmedi · KAYIT YOK" damgası basılıyordu — yüklenen veri için YANLIŞ hüküm (tur 3). */
/* İskelet kart — `satir` defter satırı; `esnek` → sütunun dibine kadar esner (gerçek
   sütunun SON kartı gibi, bkz. ana görünüm "iki bağımsız sütun"). */
function IskeletKart({ satir, gecikme, esnek = false }) {
  return (
    <div aria-hidden="true" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
      padding: SP.l + 4, ...iskeletNefes(gecikme), ...(esnek ? { flex: 1 } : null) }}>
      <div style={iskeletCizgi(120, 14, { marginBottom: SP.l })} />
      {Array.from({ length: satir }, (_, i) => (
        <div key={i} style={{ display: "flex", gap: SP.m, alignItems: "center", padding: "9px 0", borderTop: `1px solid ${PAL.line}` }}>
          <span style={iskeletCizgi(8, 8, { borderRadius: RAD.dot })} />
          <span style={iskeletCizgi(`${[62, 48, 70, 40, 56][i % 5]}%`, 10, { flexShrink: 1 })} />
          <span style={iskeletCizgi(44, 10, { marginLeft: "auto" })} />
        </div>
      ))}
    </div>
  );
}

/* Gözlem iskeleti — gerçek kuşağın İSKELETİ: aynı antet ayracı, aynı iki bağımsız sütun
   (8 kol: Dağılım + İşlem feed'i · 4 kol: Birim gecikme + İşlem süresi), aynı aralıklar.
   Satır sayıları dolu kartların ölçülen boyundan (kart = 72 + 29 × satır px; 412/1440,
   2026-10-03): masaüstünde Dağılım 240 · Birim 132 · Süre 526; tek kolonda Dağılım'ın üç iç
   kolonu alt alta dizildiğinden 590 · Feed 686 · Birim 170 · Süre 532. Her sütunun son kartı
   esner (gerçekteki gibi). Kuşak katın altında başlar; amaç kaydırınca da sıçramaması. */
const GOZLEM_ISKELET = {
  genis: [
    { kol: 8, kartlar: [{ satir: 6, gecikme: 0 }, { satir: 8, gecikme: 120 }] },
    { kol: 4, kartlar: [{ satir: 2, gecikme: 60 }, { satir: 16, gecikme: 180 }] },
  ],
  dar: [
    { kol: 8, kartlar: [{ satir: 18, gecikme: 0 }, { satir: 21, gecikme: 120 }] },
    { kol: 4, kartlar: [{ satir: 3, gecikme: 60 }, { satir: 16, gecikme: 180 }] },
  ],
};

function GozlemDurum({ yukleniyor, span, genis }) {
  if (yukleniyor) {
    return (
      <>
        <div role="status" style={{ ...span(12), display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m, ...TYPE.antet, color: PAL.mut3 }}>
          <span>GÖZLEM</span>
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
          <span>İŞLEM GEÇMİŞİ YÜKLENİYOR</span>
        </div>
        {GOZLEM_ISKELET[genis ? "genis" : "dar"].map(({ kol, kartlar }) => (
          <div key={kol} style={{ ...span(kol), alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SP.l + 4 }}>
            {kartlar.map((k, i) => <IskeletKart key={i} satir={k.satir} gecikme={k.gecikme} esnek={i === kartlar.length - 1} />)}
          </div>
        ))}
      </>
    );
  }
  return (
    <div role="alert" style={{ ...span(12), display: "flex", alignItems: "flex-start", gap: SP.m, padding: `${SP.l}px ${SP.l + 4}px`,
      background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `4px solid ${BANT.kirmizi.c}`, borderRadius: RAD.card, boxShadow: SH.card }}>
      <span aria-hidden="true" style={{ display: "flex", paddingTop: 2, color: DERIN_OF(BANT.kirmizi.c) }}><Icon.alert width={16} height={16} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>İşlem geçmişi alınamadı</span>
        <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, marginTop: 2 }}>
          Kayıtlı işlemler sunucudan okunamadı; dağılım ve süre özetleri bu yüzden boş. Kuyruk ve yasal süreler
          etkilenmedi. Sayfayı yenileyerek yeniden deneyebilirsiniz.
        </span>
      </span>
    </div>
  );
}

/* ---------- Ana görünüm ---------- */

export default function PanelView({ history = [], outbox = [], inboxCount = 0, kuyrukSla = [], slaHatasi = false, onGoInbox, onIsle = () => {}, onGoIslenen = () => {}, onGoGiden = () => {}, onGoTaslaklar = null, onUpload, user, gecmisYukleniyor = false, gecmisHatasi = false }) {
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

  /* Takvim + brif kuyrukSla'ya bağlı: servis kapalıysa / kuyruk boşsa ikisi de yok ve akış
     kartı tam genişliğe (1×4 şerit) yayılır — sağda ölü boşluk açılmaz. */
  const takvimVar = kuyrukSla.length > 0;
  /* SLA hâlâ yolda mı? Sunucu kuyruktaki HER örnek için sla_metadata döndürür (compute_sla
     tarihsiz/tanımsız evrakta da bir durum üretir) → başarılı yanıttan sonra kuyrukSla
     uzunluğu inboxCount'a eşittir. Kuyruk dolu, SLA boş ve hata yok = istek sürüyor. Bu sürede
     brif + takvim yuvaları iskeletle AYRILIR: brif sonradan akışın ÜSTÜNE inince telefonda
     tüm sayfa ~1050 px aşağı itiliyordu (CLS 0,38, yavaş 4G ölçümü). */
  const slaBekleniyor = !takvimVar && !slaHatasi && inboxCount > 0;

  /* Başlık damgası — görünümün HÜKMÜ: gecikmiş varsa kırmızı "N gecikmiş", yalnız kritik
     varsa sarı "N kritik". Sükûnette damga yok (dikkat bütçesi: ekran başına ≤2; bu tek). */
  const gecikmisN = kuyrukSla.filter((x) => x.sla?.durum === "GECIKMIS").length;
  const kritikN = kuyrukSla.filter((x) => x.sla?.durum === "KRITIK").length;
  const damga = gecikmisN ? { metin: `${gecikmisN} gecikmiş`, ton: R } : kritikN ? { metin: `${kritikN} kritik`, ton: BANT.sari.c } : undefined;
  const kunye = "Sabah brifingi";

  // Gerçek sıfır: hiç işlem yok VE kuyruk boş → tek boş durum; iskelet kart dizmek "ölü panel".
  if (n === 0 && inboxCount === 0 && kuyrukSla.length === 0 && !gecmisYukleniyor && !gecmisHatasi) {
    return (
      <ViewWrap id="panel-h" title="Panel" sub={manset} kunye={kunye}>
        <EmptyState icon={<Icon.chart />} title="Kuyruk Boş"
          sub="Yeni bir belge yükleyerek başlayın — işlenen her evrak burada özetlenir."
          actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]} />
      </ViewWrap>
    );
  }

  /* Akış hücreleri — kart eşlemesi kurgu ayrımını izler: İşlenen → İşlenen arşivi;
     Gelen → kuyruk; Üretilen taslak → Taslaklar; Gönderilen → Giden. aria-label sayıyı da
     taşır (salt eylem etiketi panelin ana verisini ekran okuyucudan gizliyordu). */
  const akisHucreleri = [
    { label: "İşlenen evrak", value: n, icon: <Icon.doc />, onClick: onGoIslenen, ariaLabel: `${n} işlenen evrak — arşivi aç`, gunluk: akisIslenen },
    { label: "Gelen evrak", value: inboxCount, icon: <Icon.inbox />, onClick: () => onGoInbox(), ariaLabel: `${inboxCount} gelen evrak — kuyruğu aç`, gunluk: null },
    { label: "Üretilen taslak", value: taslaklilar.length, icon: <Icon.edit />, onClick: onGoTaslaklar || onGoIslenen, ariaLabel: `${taslaklilar.length} üretilen taslak — Taslaklar'ı aç`, gunluk: akisTaslak },
    { label: "Gönderilen evrak", value: gonderilenler.length, icon: <Icon.send />, onClick: onGoGiden, ariaLabel: `${gonderilenler.length} gönderilen evrak — Giden arşivini aç`, gunluk: akisGiden },
  ];
  /* Geniş ekranda tam genişlik 4'lü şerit; tablet/telefonda 2×2 (390px'te hücre ~170px —
     rakam + sparkline sığar). */
  const akisKolon = dar || !genis ? 2 : 4;

  return (
    <ViewWrap id="panel-h" title="Panel" sub={manset} kunye={kunye} damga={damga}>
      <style>{PANEL_KF}</style>
      {/* Açılış koreografisi (2026-10): kahraman önce (60ms), takvim mührünü basar (180ms),
          akış sayaçları sayar (280ms+), gözlem kuşağı sonra akar. Hepsi transform/opacity/
          filter; global reduced-motion kuralı tümünü söndürür. */}
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(12, 1fr)" : "1fr", gap: SP.l + 4, alignItems: "start" }}>

        {/* R1 — KAHRAMAN (8 kol) + ENSTRÜMAN RAYI (4 kol: takvim + akış). Brif ekranın tek
            "şimdi davran" sinyali ve tek primary'si; takvim ikincil enstrüman, sağda. */}
        {/* Tur 3 dengesi: akış nabzı eskiden takvimin ALTINDA dar raydaydı — sağ ray brifin
            ~300px aşağısına uzuyor, solda ölü boşluk kalıyordu. Artık brif ∥ takvim aynı
            satırı paylaşıp birbirine gerilir (alignSelf: stretch, iki yüzey de height:100%),
            akış nabzı altında tam genişlik 4'lü şerittir. */}
        {takvimVar && (
          <>
            <div style={{ ...span(8), alignSelf: "stretch", ...giris(60) }}>
              <KahramanBrif kuyrukSla={kuyrukSla} onGoInbox={onGoInbox} onIsle={onIsle} />
            </div>
            <div style={{ ...span(4), alignSelf: "stretch", ...giris(180) }}>
              <SureTakvimi kuyrukSla={kuyrukSla} />
            </div>
          </>
        )}
        {slaBekleniyor && (
          <>
            <div style={{ ...span(8), alignSelf: "stretch" }}>
              <span role="status" style={SR_YALNIZ}>Yasal süre brifi yükleniyor</span>
              <BrifIskelet />
            </div>
            <div style={{ ...span(4), alignSelf: "stretch" }}><TakvimIskelet /></div>
          </>
        )}
        {/* Tur 3: uyarı artık akıştan ÖNCE — kahramanın boş bıraktığı yeri o söylüyor.
            SLA servisi yanıt vermediğinde takvim ve brif SESSİZCE kayboluyordu — yalnız istek
            başarısızken çıkar (kuyruk boşalınca boşluk dürüsttür). Eksik veri uydurulmaz. */}
        {!takvimVar && slaHatasi && (
          <div role="status" style={{ ...span(12), display: "flex", alignItems: "flex-start", gap: SP.m,
            padding: `${SP.m}px ${SP.l}px`, background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}`,
            borderLeft: `4px solid ${BANT.sari.c}`, borderRadius: RAD.ctl, ...giris(60) }}>
            <span aria-hidden="true" style={{ display: "flex", paddingTop: 2, color: DERIN.sari }}><Icon.clock width={16} height={16} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Yasal süre servisine ulaşılamadı</span>
              <span style={{ display: "block", ...TYPE.data, color: PAL.mut2, marginTop: 2 }}>
                Süre takvimi ve kuyruk brifi gizlendi; tahmini süre gösterilmez. Sayfayı yenileyerek
                yeniden deneyebilirsiniz — akış ve gözlem verileri etkilenmedi.
              </span>
            </span>
          </div>
        )}

        {n > 0 && (
          <div style={{ ...span(12), ...giris(takvimVar ? 280 : 60) }}><AkisKarti hucreler={akisHucreleri} kolon={akisKolon} /></div>
        )}
        {n === 0 && gecmisYukleniyor && (
          <div style={span(12)}><AkisKarti hucreler={akisHucreleri} kolon={akisKolon} yukleniyor /></div>
        )}
        {/* R3 + R4 — gözlem kuşağı: kahramanın arkasındaki sakin koro. Antet ayraçla açılır. */}
        {n === 0 && (gecmisYukleniyor || gecmisHatasi) ? (
          <GozlemDurum yukleniyor={gecmisYukleniyor} span={span} genis={genis} />
        ) : n === 0 ? (
          <div style={{ ...span(12), ...giris(360) }}>
            <EmptyState icon={<Icon.chart />} title="Henüz Evrak İşlenmedi"
              sub="Kuyruktan bir evrak işlediğinizde akış, dağılım ve süre özetleri burada oluşur."
              actions={[<Btn key="g" onClick={() => onGoInbox()}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
          </div>
        ) : (
          <>
            <div aria-hidden="true" style={{ ...span(12), display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m,
              ...TYPE.antet, color: PAL.mut3, ...giris(380) }}>
              <span>GÖZLEM</span>
              <span style={{ flex: 1, height: 1, background: PAL.line }} />
              <span style={{ ...TNUM }}>{n} İŞLEM</span>
            </div>
            {/* İki bağımsız sütun (tur 3): ızgara satırları Dağılım∥Gecikme ve Feed∥Süre'yi
                çiftler hâlinde eşitliyordu — kısa kart uzun komşusunun boyuna gerilip içi boş
                kalıyordu. Sütunlar kendi akışında dizilir, SON kartlar esneyip dipler hizalanır. */}
            <div style={{ ...span(8), alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SP.l + 4 }}>
              <div style={giris(420)}>
                <DagilimYuzeyi n={n} risk={risk} turList={turList} birimList={birimList} ortGuven={ortGuven} genis={genis} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", ...giris(540) }}>
                <SonIslemlerFeed history={history} n={n} onGoIslenen={onGoIslenen} />
              </div>
            </div>
            <div style={{ ...span(4), alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SP.l + 4 }}>
              <div style={giris(480)}>
                <BirimGecikmeKart rows={birimGecikmeList} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", ...giris(600) }}>
                {/* tag: başlığın sağ ucu — etiket + günlük ortalama sparkline'ı (AkisHucre ile
                    tek görsel dil). Kartın tamamı tıklanabilir DEĞİL: bar başlıklarının hover
                    detayını (native title) yutardı; rapor alttaki ikincil butonla açılır —
                    ekranın tek primary'si kahramandadır. */}
                <NeonCard title="İşlem Süresi" accent={T} icon={<Icon.clock width={16} height={16} />} style={{ flex: 1, display: "flex", flexDirection: "column" }}
                  tag={sureGunluk.aktifGun >= 2 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s }}>
                      ortalama · son 7 gün
                      <Sparkline seri={sureGunluk.seri} aktifGun={sureGunluk.aktifGun} birim="sn" />
                    </span>
                  ) : undefined}>
                  <SureGrafik history={history} />
                  <SureKiyasBloku history={history} />
                  <Btn onClick={() => setRaporAcik(true)} ariaLabel="İşlem süresi detay raporunu aç"
                    style={{ width: "100%", justifyContent: "center", marginTop: SP.l }}>
                    Detay raporu <Icon.arrow width={14} height={14} />
                  </Btn>
                </NeonCard>
              </div>
            </div>
          </>
        )}
      </div>
      <SureRaporModal acik={raporAcik} onKapat={() => setRaporAcik(false)} history={history} />
    </ViewWrap>
  );
}
