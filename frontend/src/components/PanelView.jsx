/* PanelView — "SABAH BRİFİ" (2026-07-17 yeniden kurgu): amirin masasına bırakılmış tek
   sayfalık brif. Üç kuşak, alan asimetrisiyle hiyerarşi (4 eş stat + 6 eş kart "template"
   imzasıydı — Baremetrics/Stripe/gov.uk araştırması + emil/apple lensi, 3 paralel ajan):
   · R1 KAHRAMAN (8 kol): kuyruk yasal süre brifi — paneldeki tek gerçek "şimdi davran"
     sinyali; ekranın tek primary'si burada. Acil yoksa tek satırlık pozitif banda çöker
     (ilk yaklaşan süre ufkuyla). Sağ ray (4 kol): devam eden iş (en eski bekleyen taslak
     + gelen kuyruk önizlemesi).
   · R2 AKIŞ NABZI (12 kol): tek yüzeyde hairline ayraçlı 4 ölçü + düne-göre delta +
     7 günlük sparkline (throughput'ta azalış kırmızı DEĞİL — yavaş gün azar değildir).
   · R3-R4 GÖZLEM: tek "Dağılım" yüzeyi (3 iç kolon) + birim gecikme; zaman-gruplu işlem
     feed'i + işlem süresi. Tüm sayılar gerçek veriden (oturum + DB reconcile). */
import { useEffect, useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, NeonCard, Btn, EmptyState, Icon, MONO, T, V, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { EVRAK_TR, BIRIM_LBL, BIRIM_GOSTER } from "./result-cards.jsx";
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

/* 7 günlük sparkline — sessiz bağlam çizgisi (1.5px PAL.mut3), tek vurgu son gün noktası
   (T + 2px yüzey halkası). Dolgu/eksen/animasyon yok; <2 aktif gün varsa hiç çizilmez
   (yarım grafik "bozuk" okunur). */
function Sparkline({ seri, aktifGun }) {
  if (aktifGun < 2) return null;
  const W = 64, H = 24, max = Math.max(1, ...seri);
  const nokta = seri.map((v, i) => [4 + (i * (W - 8)) / 6, H - 4 - (v / max) * (H - 8)]);
  const yol = nokta.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const son = nokta[6];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={yol} fill="none" style={{ stroke: PAL.mut3 }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={son[0]} cy={son[1]} r="3" style={{ fill: T, stroke: PAL.surf }} strokeWidth="2" />
    </svg>
  );
}

/* Akış hücresi — sayı (NumberFlow, sıfır soluk) + etiket + düne-göre delta + sparkline.
   Throughput deltasında azalış PAL.mut2 (yavaş gün başarısızlık değil); artış DERIN.yesil. */
function AkisHucre({ label, value, icon, onClick, ariaLabel, gunluk, ilk, genis, i }) {
  const sifir = value === 0;
  const delta = gunluk ? gunluk.bugunN - gunluk.dunN : null;
  const ayrac = genis ? (ilk ? "none" : `1px solid ${PAL.line}`) : (i % 2 === 1 ? `1px solid ${PAL.line}` : "none");
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel || label} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", textAlign: "left", padding: `${SP.l}px ${SP.xl}px`, background: "transparent",
        border: "none", borderLeft: ayrac, borderTop: !genis && i >= 2 ? `1px solid ${PAL.line}` : "none", borderRadius: RAD.ctl,
        display: "flex", alignItems: "center", gap: SP.m, minWidth: 0, transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: sifir ? PAL.mut3 : PAL.mut }}>{icon}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span style={{ ...TYPE.num, color: sifir ? PAL.mut3 : PAL.ink, ...TNUM }}><NumberFlow value={value} /></span>
          {delta != null && gunluk.aktifGun >= 2 && delta !== 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, ...TYPE.meta, fontWeight: 500, color: delta > 0 ? DERIN.yesil : PAL.mut2, ...TNUM }}>
              {delta > 0 ? <OK_YUKARI /> : <OK_ASAGI />}{delta > 0 ? `+${delta}` : delta} düne göre
            </span>
          )}
        </span>
        <span style={{ display: "block", ...TYPE.meta, color: PAL.mut, marginTop: 2 }}>{label}</span>
      </span>
      {gunluk && <Sparkline seri={gunluk.seri} aktifGun={gunluk.aktifGun} />}
    </button>
  );
}

/* ---------- R1: Kahraman (kuyruk yasal süre brifi) + sağ ray ---------- */

/* Süresi yaklaşan/geçen kuyruk evrağı satırı — yasal dayanak + son tarih + satır-içi İşle
   (secondary; doğrudan pipeline'a sokar). */
function SlaSatir({ x, onIsle }) {
  const gecikmis = x.sla.durum === "GECIKMIS";
  const renk = gecikmis ? BANT.kirmizi.c : BANT.sari.c;
  const kalanTxt = gecikmis ? `${Math.abs(x.sla.kalan_gun)} gün gecikti`
    : x.sla.kalan_gun === 0 ? "son gün bugün" : `son ${x.sla.kalan_gun} gün`;
  return (
    /* flexWrap + basis'li metin bloğu: dar ekranda (ölçüm: 390px'te satır 441px'e taşıyor,
       evrak adı 0px'e eziliyordu) çip/tarih/İşle üçlüsü ALT SATIRA iner, ad tam genişliği
       alır. Geniş ekranda üçlü marginLeft:auto ile hâlâ sağa yaslanır — görünüm bit-aynı. */
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "8px 0", borderTop: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: renk, flexShrink: 0 }} />
      <span style={{ flex: "1 1 200px", minWidth: 0, overflow: "hidden" }}>
        <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
        <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.sla.mevzuat}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: SP.m, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span style={{ ...TYPE.meta, fontWeight: 500, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(renk), color: DERIN_OF(renk), ...TNUM }}>{kalanTxt}</span>
        {x.sla.son_tarih && <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut2 }}>son: {x.sla.son_tarih}</span>}
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
        style={{ display: "flex", gap: 2, height: 8 }}>
        {dilimler.map((d) => <span key={d.l} style={{ width: `${(d.n / toplam) * 100}%`, minWidth: 4, background: d.c, borderRadius: RAD.chip }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.l}px`, marginTop: SP.s }}>
        {dilimler.map((d) => (
          <span key={d.l} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
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
  const dilimler = [
    { c: BANT.yesil.c, n: say.normal, l: "normal takvim" },
    { c: BANT.sari.c, n: say.kritik, l: "kritik" },
    { c: BANT.kirmizi.c, n: say.gecikmis, l: "gecikmiş" },
    { c: PAL.mut3, n: say.tarihYok, l: "tarih doğrulanmalı" },
    { c: PAL.mut, n: say.diger, l: "süre tanımsız" },
  ].filter((d) => d.n > 0);
  const toplam = kuyrukSla.length || 1;

  if (acil.length === 0) {
    // Pozitif hâl: temizken bile bir sonraki ufku göstermek güven verir.
    const yaklasan = kuyrukSla
      .filter((x) => x.sla.durum === "NORMAL" && Number.isFinite(x.sla.kalan_gun))
      .sort((a, b) => a.sla.kalan_gun - b.sla.kalan_gun)[0];
    return (
      <section aria-label="Kuyruk yasal süre durumu" style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: `${SP.l}px ${SP.xl}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", color: DERIN.yesil }}><Icon.check width={16} height={16} /></span>
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Kuyruğun tamamı normal takvimde</span>
          <span style={{ ...TYPE.data, color: PAL.mut, ...TNUM }}>
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
        <span aria-hidden="true" style={{ display: "flex", color: DERIN_OF(say.gecikmis ? BANT.kirmizi.c : BANT.sari.c) }}><Icon.clock width={18} height={18} /></span>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, flex: 1, minWidth: 200 }}>
          <span style={{ ...TYPE.num, color: say.gecikmis ? DERIN.kirmizi : DERIN.sari, ...TNUM }}><NumberFlow value={acil.length} /></span>
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>evrakın yasal süresi doldu ya da kritik</span>
          <span style={{ ...TYPE.meta, color: PAL.mut2, ...TNUM }}>· {kuyrukSla.length} evraklık kuyrukta</span>
        </span>
        {/* Ekranın tek primary'si: en acil evrakı doğrudan pipeline'a sokar. */}
        <Btn primary onClick={() => onIsle(acil[0].id)} ariaLabel={`En acil evrak: ${acil[0].label} — hemen işle`}>
          En acil evrakı işle <Icon.arrow />
        </Btn>
      </div>
      <div style={{ marginTop: SP.l }}><SlaSerit dilimler={dilimler} toplam={toplam} /></div>
      <div style={{ marginTop: SP.m }}>
        <p style={{ margin: "0 0 4px", ...TYPE.meta, color: PAL.mut2 }}>
          Yasal cevap süresi dolan/dolmak üzere olan evraklar; yasal dayanak her satırın altında yazılıdır.
        </p>
        <div ref={acilRef}>
          {acil.slice(0, 5).map((x) => <SlaSatir key={x.id} x={x} onIsle={onIsle} />)}
          {acil.length > 5 && (
            <button type="button" onClick={() => onGoInbox()} {...focusRing} data-press=""
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              style={{ cursor: "pointer", width: "100%", padding: "8px 0", background: "transparent", border: "none", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: DERIN.T, textAlign: "center", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
              {acil.length - 5} evrak daha; tümünü kuyruğun aciliyet sırasında görün
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* Sağ ray karosu — sayaç değil İŞ-PARÇASI önizlemesi ("yarım kalan işine dön" hikâyesi;
   sidebar rozeti sayıyı zaten taşıyor — kopyalamıyoruz). */
function RayKart({ icon, baslik, onClick, ariaLabel, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: "pointer", textAlign: "left", display: "block", width: "100%", minWidth: 0, background: PAL.surf,
        border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, padding: SP.l,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut }}>{icon}</span>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{baslik}</span>
        <span aria-hidden="true" style={{ marginLeft: "auto", display: "flex", color: PAL.mut3 }}><Icon.arrow width={14} height={14} /></span>
      </span>
      {children}
    </button>
  );
}

/* ---------- R3: Dağılım (tek yüzey, 3 iç kolon) ---------- */

function BarList({ rows, color }) {
  if (!rows.length) return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>—</p>;
  const max = rows[0][1] || 1;
  return rows.map(([label, c]) => (
    <div key={label} title={`${label}: ${c} evrak`} style={{ marginBottom: SP.m }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: SP.s, ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
        <span style={{ color: PAL.ink2, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: DERIN_OF(color), fontWeight: 500, ...TNUM, flexShrink: 0 }}>{c}</span>
      </div>
      <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((c / max) * 100)}%`, background: color, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
      </div>
    </div>
  ));
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
          <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.meta, color: PAL.mut3 }}>Risk bandı</p>
          {["yesil", "sari", "kirmizi"].map((k) => {
            const pct = n ? Math.round((risk[k] / n) * 100) : 0;
            return (
              <div key={k} style={{ marginBottom: SP.m }}>
                <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut2, marginBottom: SP.xs }}>
                  <span style={{ color: DERIN_OF(BANT[k].c), fontWeight: 500 }}>{BANT[k].l} · {BANT[k].t}</span><span style={{ ...TNUM }}>{risk[k]} (%{pct})</span>
                </div>
                <div style={{ height: 8, borderRadius: RAD.chip, background: PAL.surfHi, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: BANT[k].c, borderRadius: RAD.chip, transition: "width .15s ease-out" }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={kolonStil(1)}>
          <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.meta, color: PAL.mut3 }}>Evrak türü</p>
          <BarList rows={turList} color={V} />
        </div>
        <div style={kolonStil(2)}>
          <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.meta, color: PAL.mut3 }}>Havale edilen birim</p>
          <BarList rows={birimList} color={V} />
          {birimList.length > 0 && <p style={{ margin: 0, ...TYPE.meta, color: PAL.mut3 }}>Görev 2 yönlendirmesi: en çok havale alan birimler.</p>}
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
    <NeonCard title="Birim bazlı gecikme" accent={varmi ? BANT.kirmizi.c : BANT.yesil.c} tag="havale + yasal süre" icon={<Icon.clock />}>
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

function SureGrafik({ history }) {
  const olculer = history
    .map((h) => ({ name: h.name, ms: h.result?.sure_ms }))
    .filter((x) => Number.isFinite(x.ms) && x.ms > 0);
  if (olculer.length === 0) {
    return <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Süre verisi bu oturumdan itibaren toplanıyor; bir evrak işleyin.</p>;
  }
  const son = olculer.slice(0, 10).reverse(); // eski → yeni (soldan sağa zaman)
  const ort = olculer.reduce((a, x) => a + x.ms, 0) / olculer.length;
  const max = Math.max(...son.map((x) => x.ms));
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
        <span style={{ ...TYPE.num, color: PAL.ink, ...TNUM }}>{(ort / 1000).toFixed(1)} sn</span>
        <span style={{ ...TYPE.meta, color: PAL.mut }}>ortalama · {olculer.length} işlem</span>
      </div>
      <div role="img" aria-label={`Son ${son.length} işlemin süreleri, ortalama ${(ort / 1000).toFixed(1)} saniye`}
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, marginTop: SP.m }}>
        {son.map((x, i) => (
          <span key={i} title={`${x.name} — ${(x.ms / 1000).toFixed(1)} sn`}
            style={{ flex: 1, minWidth: 6, height: `${Math.max(6, Math.round((x.ms / max) * 100))}%`, background: T, borderRadius: `${RAD.chip}px ${RAD.chip}px 0 0`, opacity: 0.9 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.meta, color: PAL.mut3, marginTop: SP.xs, ...TNUM }}>
        <span>eski</span><span>son {son.length} koşum</span><span>yeni</span>
      </div>
    </>
  );
}

/* Feed satırı — durum noktası + ad + tek semantik çip + tür/birim + mono saat. */
function FeedSatir({ h, onGoIslenen, bugunGrubu }) {
  const bekliyor = h.result?.yazi_taslak_md && !h.result?.onay_durumu;
  return (
    <button type="button" onClick={onGoIslenen} aria-label={`${h.name} — işlenen evrak arşivinde gör`} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.m, width: "100%", textAlign: "left",
        padding: "8px 4px", background: "transparent", border: "none", borderTop: `1px solid ${PAL.line}`,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[h.bant]?.c || PAL.mut2, flexShrink: 0 }} />
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
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
    <NeonCard title="Son işlemler" accent={T} tag={`son ${Math.min(history.length, 8)} / ${n}`}>
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

export default function PanelView({ history = [], outbox = [], inboxCount = 0, kuyrukSla = [], onGoInbox, onIsle = () => {}, onGoIslenen = () => {}, onGoGiden = () => {}, onGoTaslaklar = null, onUpload, user }) {
  const genis = useGenisEkran();
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

  // Sağ ray: en eski karar bekleyen taslak — "yarım kalan işine dön".
  const enEskiBekleyen = useMemo(() => {
    const bekleyen = history.filter((h) => h.result?.yazi_taslak_md && !h.result?.onay_durumu);
    if (!bekleyen.length) return null;
    const h = [...bekleyen].sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
    const gun = Number.isFinite(h.ts) ? Math.floor((gunBasi(Date.now()) - gunBasi(h.ts)) / GUN_MS) : 0;
    return { h, gun, toplam: bekleyen.length };
  }, [history]);

  // Sıradaki kuyruk evrağı — ray önizlemesi için (süresi en yakın; kalan_gun'suzlar sona).
  const siradakiKuyruk = useMemo(() => {
    if (!kuyrukSla.length) return null;
    return [...kuyrukSla].sort((a, b) => (a.sla.kalan_gun ?? Infinity) - (b.sla.kalan_gun ?? Infinity))[0];
  }, [kuyrukSla]);

  // Manşet: pasif selam değil brifin ilk cümlesi.
  const acilN = useMemo(() => kuyrukSla.filter((x) => x.sla.durum === "GECIKMIS" || x.sla.durum === "KRITIK").length, [kuyrukSla]);
  // Ek-bağımsız kalıp ("N tanesi") — "N'i" eki sayıya göre değişir (2'si/3'ü/6'sı),
  // sabit ek jüri-görünür manşette gramer hatası üretiyordu.
  const manset = kuyrukSla.length > 0
    ? `Hoş geldiniz, ${user?.ad_soyad || "memur"} · kuyrukta ${kuyrukSla.length} evrak${acilN > 0 ? `, ${acilN} tanesi yasal süresinde acil` : ", tamamı normal takvimde"}`
    : `Hoş geldiniz, ${user?.ad_soyad || "memur"} · ${new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}`;

  const span = (kol) => ({ gridColumn: genis ? `span ${kol}` : "1 / -1", minWidth: 0 });

  // Gerçek sıfır: hiç işlem yok VE kuyruk boş → tek boş durum; iskelet kart dizmek "ölü panel".
  if (n === 0 && inboxCount === 0 && kuyrukSla.length === 0) {
    return (
      <ViewWrap id="panel-h" title="Panel" sub={manset}>
        <EmptyState icon={<Icon.chart />} title="Kuyruk boş"
          sub="Yeni bir belge yükleyerek başlayın — işlenen her evrak burada özetlenir."
          actions={[<Btn key="u" primary onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>]} />
      </ViewWrap>
    );
  }

  return (
    <ViewWrap id="panel-h" title="Panel" sub={manset}>
      {/* Giriş: tek nefes — nu-rise yalnız konteynere, kart kart stagger yok. */}
      <div style={{ display: "grid", gridTemplateColumns: genis ? "repeat(12, 1fr)" : "1fr", gap: SP.l, alignItems: "start", animation: `nu-rise .16s ${EASE.out} both` }}>

        {/* R1 — kahraman + sağ ray (kuyruk SLA'sı yoksa kahraman hiç görünmez; kuyruk yine çalışır) */}
        {kuyrukSla.length > 0 && (
          <div style={span(8)}>
            <KahramanBrif kuyrukSla={kuyrukSla} onGoInbox={onGoInbox} onIsle={onIsle} />
          </div>
        )}
        <div style={{ ...span(kuyrukSla.length > 0 ? 4 : 12), display: "grid", gridTemplateColumns: kuyrukSla.length > 0 || !genis ? "1fr" : "1fr 1fr", gap: SP.l }}>
          {/* Devam eden iş — kurgu ayrımı: karar çalışması Taslaklar'da yaşar; burada sayaç
              değil en eski bekleyenin önizlemesi (sidebar rozetini kopyalamaz). */}
          {/* "toplam X bekleyen" YOK — history süzgeci sidebar rozetinin drafts sayısıyla
              (alt-taslaklar) sapabiliyor; aynı ekranda iki farklı sayı güven kırar. */}
          {enEskiBekleyen && (
            <RayKart icon={<Icon.edit width={15} height={15} />} baslik="Devam eden iş"
              onClick={onGoTaslaklar || onGoIslenen}
              ariaLabel={`Devam eden iş: ${enEskiBekleyen.h.name}, ${enEskiBekleyen.gun > 0 ? `${enEskiBekleyen.gun} gündür karar bekliyor` : "bugün taslağı hazırlandı"} — Taslaklar'ı aç`}>
              <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enEskiBekleyen.h.name}</span>
              <span style={{ display: "block", marginTop: 2, ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
                {enEskiBekleyen.gun > 0 ? `${enEskiBekleyen.gun} gündür karar bekliyor` : "bugün taslağı hazırlandı"}
              </span>
            </RayKart>
          )}
          {/* Sayaç değil önizleme: sıradaki (süresi en yakın) evrakın adı; sayı R2'nin işi. */}
          <RayKart icon={<Icon.inbox width={15} height={15} />} baslik="Gelen kuyruk"
            onClick={() => onGoInbox()}
            ariaLabel={inboxCount > 0 ? (siradakiKuyruk ? `Gelen kuyruk, sıradaki: ${siradakiKuyruk.label} — kuyruğu aç` : `Gelen kuyrukta ${inboxCount} evrak — kuyruğu aç`) : "Gelen kuyruk boş"}>
            {inboxCount > 0 ? (
              siradakiKuyruk ? (
                <>
                  <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>sıradaki: {siradakiKuyruk.label}</span>
                  <span style={{ display: "block", marginTop: 2, ...TYPE.meta, color: PAL.mut2, ...TNUM }}>{inboxCount} evrak işlenmeyi bekliyor</span>
                </>
              ) : (
                <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, ...TNUM }}>{inboxCount} evrak işlenmeyi bekliyor</span>
              )
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.data, color: DERIN.yesil }}>
                <Icon.check width={13} height={13} /> Kuyruk boş
              </span>
            )}
          </RayKart>
        </div>

        {/* R2 — akış nabzı: tek yüzey, 4 ölçü. Kart eşlemesi kurgu ayrımını izler:
            İşlenen → İşlenen arşivi; Üretilen taslak → Taslaklar; Gönderilen → Giden.
            overflow:hidden YOK — focusRing dışa taşan halka çizer, kırpılırsa klavye odağı
            görünmez olur. aria-label sayıyı da taşır — salt eylem etiketi panelin ana
            verisini ekran okuyucudan gizliyordu (review bulgusu). */}
        {n > 0 && (
          <div style={{ ...span(12), background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
            display: "grid", gridTemplateColumns: genis ? "repeat(4, 1fr)" : "repeat(2, 1fr)" }}>
            <AkisHucre label="İşlenen evrak" value={n} icon={<Icon.doc />} onClick={onGoIslenen} ariaLabel={`${n} işlenen evrak — arşivi aç`} gunluk={akisIslenen} ilk genis={genis} i={0} />
            <AkisHucre label="Gelen evrak" value={inboxCount} icon={<Icon.inbox />} onClick={() => onGoInbox()} ariaLabel={`${inboxCount} gelen evrak — kuyruğu aç`} gunluk={null} genis={genis} i={1} />
            <AkisHucre label="Üretilen taslak" value={taslaklilar.length} icon={<Icon.edit />} onClick={onGoTaslaklar || onGoIslenen} ariaLabel={`${taslaklilar.length} üretilen taslak — Taslaklar'ı aç`} gunluk={akisTaslak} genis={genis} i={2} />
            <AkisHucre label="Gönderilen evrak" value={gonderilenler.length} icon={<Icon.send />} onClick={onGoGiden} ariaLabel={`${gonderilenler.length} gönderilen evrak — Giden arşivini aç`} gunluk={akisGiden} genis={genis} i={3} />
          </div>
        )}

        {/* R3 + R4 — gözlem kuşağı: kahramanın arkasındaki sakin koro. */}
        {n === 0 ? (
          <div style={span(12)}>
            <EmptyState icon={<Icon.chart />} title="Henüz evrak işlenmedi"
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
              <NeonCard title="İşlem süresi" accent={T} icon={<Icon.clock width={16} height={16} />}>
                <SureGrafik history={history} />
              </NeonCard>
            </div>
          </>
        )}
      </div>
    </ViewWrap>
  );
}
