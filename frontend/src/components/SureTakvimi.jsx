/* SureTakvimi — Panel enstrüman rayının üst kartı: kuyruğun yasal sürelerinin AY görünümü.
   Brif "kaç tane / ne kadar acil" sorusunu yanıtlar; takvim "NE ZAMAN" sorusunu.

   VERİ KAYNAĞI YENİ DEĞİL: KahramanBrif ile BİT-AYNI `kuyrukSla` dizisini okur. Her evrakın
   `sla.son_tarih` ("dd.mm.yyyy") değeri ilgili güne işaretlenir; `sla.durum` rengi,
   `sla.kalan_gun` gecikme metnini verir. Tarihi olmayan evrak takvimde HİÇ görünmez —
   uydurma gün işaretlemek yalan olurdu. Renk sözlüğü BANT (brifteki şeritle aynı).

   2026-10 "Antet & Damga" yeniden tasarımı — takvim artık İKİNCİL ENSTRÜMAN:
   · Sık ızgara (kare hücre, mono rakam), cam yüzey yerine evrak kâğıdı.
   · Son gün = MÜHÜR: işaretli gün çift halkalı (2px + ofsetli 1px), hafif eğik, mürekkep
     dokulu küçük bir damga gibi basılır; açılışta sırayla "basılır" (pv-bas). Altında evrak
     sayısı kadar (en çok 3) mürekkep noktası — renk tek sinyal değil: sayı nokta adediyle,
     ağırlık halka kalınlığıyla da okunur, aria/title tam cümleyi taşır.
   · Bugün = dolu mürekkep (DERIN.T) kare; seçili = mor (V) çerçeve.
   · BOŞ AY TASARLANDI: görünen ayda son gün yoksa (gecikmiş evrakların son günleri geçmiş
     aylarda kalır) panel boş cümle yerine EN YAKIN İŞARETLİ AYLARA atlama düğmeleri sunar —
     veri aynı işaret haritasından türetilir, yeni kaynak yok.
   Saf çekirdek (tarih ayrıştırma, işaret haritası, ay ızgarası) lib/sureTakvimi.js'te. */
import { useMemo, useState } from "react";
import { Icon, MONO, DISPLAY, V, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { iskeletCizgi, iskeletNefes } from "./PanelBrif.jsx";
import { DURUM_AGIRLIK, gunAnahtar, kalanMetin, isaretHarita, ayIsaretleri, ayIzgarasi, gunGenislik } from "../lib/sureTakvimi.js";

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];
const GUN_TAM = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/* Ağırlık → BANT rengi (sıralama lib'de, renk burada: lib tema bilmez). */
const AGIRLIK_RENK = { 1: BANT.yesil.c, 2: BANT.sari.c, 3: BANT.kirmizi.c };
const ogeRenk = (x) => AGIRLIK_RENK[DURUM_AGIRLIK[x?.sla?.durum] || 1];

/* Mürekkep dokusu — lastik mührün yer yer açılan baskısı (Damga atomuyla aynı yöntem: SVG
   gürültü maskesi). Yalnız mühür halkasına uygulanır, rakama değil (okunurluk). */
const MUREKKEP = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
/* Mühür eğimi — gün numarasından deterministik (her render aynı; rastgele değil). */
const egim = (g) => ((g * 37) % 11) - 7;
const GECIS = `background .16s ease, color .16s ease, transform .14s ${EASE.out}`;

/* Ay değiştirme oku — kare ikon buton (hover zemin, press ölçek). */
function AyOk({ yon, onClick, etiket }) {
  return (
    <button type="button" onClick={onClick} aria-label={etiket} {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, padding: 0, background: "transparent", border: `1px solid ${PAL.line}`,
        borderRadius: RAD.ctl, color: PAL.mut, transition: GECIS }}>
      {yon === "sol" ? <Icon.okSol width={14} height={14} /> : <Icon.okSag width={14} height={14} />}
    </button>
  );
}

/* Mühür — işaretli günün halkası (salt görsel, aria-hidden). */
function Muhur({ renk, kalin, gecikme, gun }) {
  return (
    <span aria-hidden="true" style={{ position: "absolute", inset: 3, borderRadius: RAD.dot, pointerEvents: "none",
      border: `${kalin ? 2 : 1.5}px solid ${renk}`, outline: `1px solid ${renk}`, outlineOffset: 1.5,
      background: ALFA(renk), "--pv-egim": `${egim(gun)}deg`, transform: `rotate(${egim(gun)}deg)`,
      WebkitMaskImage: MUREKKEP, maskImage: MUREKKEP, WebkitMaskSize: "80px 80px", maskSize: "80px 80px",
      animation: `pv-bas .5s ${EASE.out} ${gecikme}ms both` }} />
  );
}

/* Gün hücresi. İşaretsiz gün <div>'dir — 30 boş sekme durağı klavyeyi boğardı; yalnız
   işaretli günler odaklanabilir buton. */
function GunHucre({ tarih, bugunMu, kayit, seciliMi, onSec, sira }) {
  const gunNo = tarih.getDate();
  const kutu = { position: "relative", width: "100%", aspectRatio: "1 / 1", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", borderRadius: RAD.chip + 1, fontFamily: MONO, fontSize: 12, ...TNUM };

  if (!kayit) {
    return (
      <div style={{ ...kutu, color: bugunMu ? PAL.onAccent : PAL.mut2, fontWeight: bugunMu ? 600 : 400,
        background: bugunMu ? DERIN.T : "transparent" }} title={bugunMu ? "Bugün" : undefined}>
        {gunNo}
      </div>
    );
  }

  const renk = AGIRLIK_RENK[kayit.agirlik];
  const n = kayit.ogeler.length;
  return (
    <button type="button" onClick={() => onSec(seciliMi ? null : gunAnahtar(tarih))} {...focusRing} data-press=""
      aria-pressed={seciliMi}
      title={`${gunNo} ${AY_ADI[tarih.getMonth()]}: ${n} evrakın son günü`}
      aria-label={`${gunNo} ${AY_ADI[tarih.getMonth()]} ${tarih.getFullYear()}, ${GUN_TAM[(tarih.getDay() + 6) % 7]} — ${n} evrakın son günü. Listeyi ${seciliMi ? "kapat" : "göster"}.`}
      onMouseEnter={(e) => { if (!seciliMi) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { if (!seciliMi) e.currentTarget.style.background = "transparent"; }}
      style={{ ...kutu, cursor: "pointer", padding: 0, border: seciliMi ? `2px solid ${V}` : "2px solid transparent",
        background: seciliMi ? ALFA(V) : "transparent", fontWeight: 700,
        color: bugunMu ? DERIN.T : seciliMi ? DERIN.V : DERIN_OF(renk), transition: GECIS }}>
      <Muhur renk={renk} kalin={kayit.agirlik >= 3} gecikme={420 + sira * 80} gun={gunNo} />
      {/* Hamle 6: işaretli günün rakamı Archivo'da, genişliği günün en sıkışık süresini
          kodlar (bol süre geniş, gecikmiş dar). Renk + nokta + aria ayrı taşıyıcılar. */}
      <span style={{ position: "relative", fontFamily: DISPLAY, fontSize: 14, fontWeight: 800, letterSpacing: "-.01em",
        fontStretch: `${gunGenislik(kayit)}%` }}>{gunNo}</span>
      {/* Nokta adedi = evrak sayısı (en çok 3) — sayının renkten bağımsız ikinci taşıyıcısı. */}
      <span aria-hidden="true" style={{ position: "absolute", bottom: "18%", display: "flex", gap: 2 }}>
        {kayit.ogeler.slice(0, 3).map((x) => <span key={x.id} style={{ width: 3, height: 3, borderRadius: RAD.dot, background: ogeRenk(x) }} />)}
      </span>
    </button>
  );
}

/* Satır — "ayın işaretli günü" ve "seçili günün evrakı" aynı iskelet: mono gün/no + ad +
   sağa yaslı künye. İkisi ayrı yazılırsa hizaları zamanla ayrışır. */
function Satir({ renk, sol, ad, kunye, onClick, etiket }) {
  const ic = (
    <>
      <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, width: 22, flexShrink: 0, ...TNUM }}>{sol}</span>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, flexShrink: 0, background: renk }} />
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>
      <span style={{ ...TYPE.meta, fontWeight: 600, flexShrink: 0, ...TNUM, color: DERIN_OF(renk) }}>{kunye}</span>
    </>
  );
  const stil = { display: "flex", alignItems: "center", gap: SP.s, width: "100%", textAlign: "left",
    padding: "7px 2px", borderTop: `1px solid ${PAL.line}` };
  if (!onClick) return <div style={stil}>{ic}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={etiket} {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...stil, cursor: "pointer", background: "transparent", border: "none", borderTop: `1px solid ${PAL.line}`,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      {ic}
    </button>
  );
}

/* Boş ay — en yakın işaretli önceki/sonraki aya atlama. Yalnız aynı işaret haritasından. */
function BosAy({ ay, ozet, onGit }) {
  const { once, sonra } = useMemo(() => {
    const liste = [...ozet.values()].sort((x, y) => x.tarih - y.tarih);
    return { once: liste.filter((x) => x.tarih < ay).pop(), sonra: liste.find((x) => x.tarih > ay) };
  }, [ay, ozet]);

  const git = (h, yon) => (
    <button type="button" onClick={() => onGit(h.tarih)} {...focusRing} data-press="" data-dokunma=""
      aria-label={`${AY_ADI[h.tarih.getMonth()]} ${h.tarih.getFullYear()} ayına git — ${h.n} evrakın son günü`}
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: yon === "sol" ? "flex-start" : "flex-end",
        gap: 2, padding: `${SP.s}px ${SP.m}px`, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...TYPE.meta, color: PAL.mut2 }}>
        {yon === "sol" && <Icon.okSol width={12} height={12} />}{AY_ADI[h.tarih.getMonth()]} {h.tarih.getFullYear()}{yon === "sag" && <Icon.okSag width={12} height={12} />}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, color: DERIN_OF(AGIRLIK_RENK[h.agirlik] || BANT.yesil.c) }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "115%", fontSize: 18, lineHeight: "20px", ...TNUM }}>{h.n}</span>
        <span style={{ ...TYPE.meta }}>evrak</span>
      </span>
    </button>
  );

  return (
    <div>
      <p style={{ margin: `0 0 ${SP.s}px`, ...TYPE.data, color: PAL.mut2 }}>
        {AY_ADI[ay.getMonth()]} ayında son günü dolan evrak yok.
      </p>
      {(once || sonra) && (
        <div style={{ display: "flex", gap: SP.s }}>
          {once && git(once, "sol")}
          {sonra && git(sonra, "sag")}
        </div>
      )}
    </div>
  );
}

/* Gün paneli — seçim yokken ayın işaretli günleri, seçim varken o günün evrakları
   (salt okunur; eylem brifin işi). Yeni veri çekmez. */
function GunPaneli({ isaretliGunler, seciliKayit, onSec, ayAdi }) {
  if (seciliKayit) {
    const gorunen = seciliKayit.ogeler.slice(0, 6);
    return (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: SP.xs }}>
          <span style={{ ...TYPE.data, fontWeight: 600, color: DERIN.V, ...TNUM }}>{seciliKayit.tarih.getDate()} {ayAdi} · son gün</span>
          <button type="button" onClick={() => onSec(null)} {...focusRing} data-press=""
            style={{ marginLeft: "auto", cursor: "pointer", padding: "4px 6px", margin: "-4px -6px -4px auto",
              background: "transparent", border: "none", ...TYPE.meta, color: PAL.mut2 }}>
            Ayın tümü
          </button>
        </div>
        {gorunen.map((x, i) => <Satir key={x.id} sol={String(i + 1).padStart(2, "0")} renk={ogeRenk(x)} ad={x.label} kunye={kalanMetin(x.sla)} />)}
        {seciliKayit.ogeler.length > gorunen.length && (
          <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>+{seciliKayit.ogeler.length - gorunen.length} evrak daha</p>
        )}
      </>
    );
  }
  const gorunen = isaretliGunler.slice(0, 5);
  return (
    <>
      {gorunen.map((g) => (
        <Satir key={g.anahtar} renk={AGIRLIK_RENK[g.agirlik]} sol={String(g.tarih.getDate()).padStart(2, "0")}
          ad={GUN_TAM[(g.tarih.getDay() + 6) % 7]}
          kunye={`${g.ogeler.length} evrak`} onClick={() => onSec(g.anahtar)}
          etiket={`${g.tarih.getDate()} ${ayAdi}: ${g.ogeler.length} evrakın son günü — listeyi göster`} />
      ))}
      {isaretliGunler.length > gorunen.length && (
        <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>+{isaretliGunler.length - gorunen.length} gün daha</p>
      )}
    </>
  );
}

/* Ay özeti — işaret haritasından "yyyy-m" → { tarih, n, agirlik }. AySeridi + BosAy + açılış
   ayı aynı özeti okur (aynı sayım üç yerde ayrı yazılırsa ayrışır). */
function ayOzeti(isaret) {
  const aylar = new Map();
  for (const k of isaret.values()) {
    const a = new Date(k.tarih.getFullYear(), k.tarih.getMonth(), 1);
    const key = `${a.getFullYear()}-${a.getMonth()}`;
    const e = aylar.get(key) || { tarih: a, n: 0, agirlik: 0 };
    aylar.set(key, { ...e, n: e.n + k.ogeler.length, agirlik: Math.max(e.agirlik, k.agirlik) });
  }
  return aylar;
}
const ayFark = (a, b) => (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());

/* AÇILIŞ AYI (tur 2): bu ayda son gün varsa bu ay; yoksa EN YAKIN işaretli ay (eşitlikte
   geçmiş — gecikmiş evrakın ayı daha acildir). Eskiden takvim hep bugünün ayında açılıyor,
   demo kuyruğunun tüm son günleri Temmuz/Ağustos'ta kaldığı için ilk görüntü BOŞ bir aydı. */
function acilisAyi(ozet, buAy) {
  if (ozet.has(`${buAy.getFullYear()}-${buAy.getMonth()}`) || ozet.size === 0) return buAy;
  return [...ozet.values()].map((x) => x.tarih)
    .sort((x, y) => (Math.abs(ayFark(x, buAy)) - Math.abs(ayFark(y, buAy))) || (x - y))[0];
}

const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const SERIT_AZAMI = 12;

/* AY ŞERİDİ — kuyruğun son günlerinin aylara dağılımı (mini sütun grafik, 12 ayı aşmaz).
   Takvimin "neredeyim" haritası: boş ayda bile yükün nerede yığıldığı tek bakışta görünür,
   sütun tıklanınca o aya gidilir. Yükseklik = evrak sayısı, renk = ayın en kötü durumu,
   etiket = ay adı; sayı title/aria'da (renk tek sinyal değil). */
function AySeridi({ ozet, ay, buAy, onGit }) {
  const aylar = useMemo(() => {
    const tarihler = [...ozet.values()].map((x) => x.tarih);
    let bas = new Date(Math.min(buAy, ...tarihler)), bit = new Date(Math.max(buAy, ...tarihler));
    if (ayFark(bit, bas) >= SERIT_AZAMI) {
      // Uzun aralık: bugünün ayını içeren 12 aylık pencere (önce geçmiş — gecikmişler orada).
      bit = new Date(Math.min(bit, new Date(buAy.getFullYear(), buAy.getMonth() + 3, 1)));
      bas = new Date(bit.getFullYear(), bit.getMonth() - (SERIT_AZAMI - 1), 1);
    }
    const n = ayFark(bit, bas) + 1;
    return Array.from({ length: n }, (_, i) => {
      const t = new Date(bas.getFullYear(), bas.getMonth() + i, 1);
      return { tarih: t, ...(ozet.get(`${t.getFullYear()}-${t.getMonth()}`) || { n: 0, agirlik: 0 }) };
    });
  }, [ozet, buAy]);
  if (aylar.length < 2) return null;
  const max = Math.max(1, ...aylar.map((x) => x.n));
  return (
    <div role="group" aria-label="Son günlerin aylara dağılımı" style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
      {aylar.map((x) => {
        const secili = ayFark(x.tarih, ay) === 0;
        const bugunAyi = ayFark(x.tarih, buAy) === 0;
        const renk = AGIRLIK_RENK[x.agirlik];
        const ad = `${AY_ADI[x.tarih.getMonth()]} ${x.tarih.getFullYear()}`;
        return (
          <button key={ad} type="button" onClick={() => onGit(x.tarih)} {...focusRing} data-press=""
            aria-label={`${ad} — ${x.n ? `${x.n} evrakın son günü` : "son gün yok"}${bugunAyi ? " (bu ay)" : ""}`} aria-pressed={secili}
            title={`${ad}: ${x.n} evrak`}
            onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { if (!secili) e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: "pointer", flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "4px 0 3px", border: "none", borderRadius: RAD.chip, background: secili ? PAL.surf2 : "transparent",
              boxShadow: secili ? `inset 0 -2px 0 ${PAL.ink}` : "none", transition: GECIS }}>
            <span aria-hidden="true" style={{ height: 22, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              {x.n > 0
                ? <span style={{ width: "min(10px, 60%)", height: Math.max(4, Math.round((x.n / max) * 22)), background: renk, borderRadius: "2px 2px 0 0" }} />
                : <span style={{ width: "min(10px, 60%)", height: 1, background: PAL.lineHi }} />}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "12px", letterSpacing: ".02em", ...TNUM,
              color: secili ? PAL.ink : bugunAyi ? DERIN.T : PAL.mut3, fontWeight: secili || bugunAyi ? 600 : 400 }}>
              {AY_KISA[x.tarih.getMonth()]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Yükleme iskeleti — takvimin ŞEKLİ (başlık, ay şeridi, 7×6 kare ızgara, lejant, gün paneli),
   işaret yok. Masaüstünde brif satırına gerilir (height:100%); telefonda doğal boyu gerçek
   takvime yakındır ve katın altında kalır. Gün sayısı/işaret UYDURULMAZ: hücreler boş kare. */
const ISKELET_HAFTA = 6;
export function TakvimIskelet() {
  return (
    <section aria-hidden="true"
      style={{ height: "100%", display: "flex", flexDirection: "column", background: PAL.surf, border: `1px solid ${PAL.line}`,
        borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden", ...iskeletNefes(150) }}>
      <div style={{ padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, height: 28 }}>
          <span style={iskeletCizgi(13, 13)} />
          <span style={iskeletCizgi(92, 10)} />
          <span style={{ flex: 1, height: 1, background: PAL.line, minWidth: 8 }} />
          <span style={iskeletCizgi(28, 28, { borderRadius: RAD.ctl })} />
          <span style={iskeletCizgi(28, 28, { borderRadius: RAD.ctl })} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, height: 30, marginTop: SP.s }}>
          <span style={iskeletCizgi(132, 22)} />
          <span style={iskeletCizgi(84, 10)} />
        </div>
        <span style={iskeletCizgi("100%", 44, { marginTop: SP.m, borderRadius: RAD.ctl })} />
      </div>
      <div style={{ flex: 1, padding: `${SP.m}px ${SP.l}px ${SP.l}px` }}>
        <div style={{ width: "100%", maxWidth: 308, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {GUN_KISA.map((g) => <span key={g} style={{ display: "flex", justifyContent: "center", padding: "5px 0" }}><span style={iskeletCizgi(14, 8)} /></span>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: ISKELET_HAFTA * 7 }, (_, i) => <span key={i} style={{ aspectRatio: "1", borderRadius: RAD.ctl, background: PAL.surfHi }} />)}
          </div>
        </div>
        <span style={iskeletCizgi("62%", 10, { margin: `${SP.s + 3}px auto 0` })} />
        <div style={{ marginTop: SP.m + 3 }}>
          {[70, 54, 62].map((w) => (
            <div key={w} style={{ display: "flex", alignItems: "center", gap: SP.s, height: 44, borderTop: `1px solid ${PAL.line}` }}>
              <span style={iskeletCizgi(8, 8, { borderRadius: RAD.dot })} />
              <span style={iskeletCizgi(`${w}%`, 10)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SureTakvimi({ kuyrukSla = [] }) {
  const bugun = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const buAy = useMemo(() => new Date(bugun.getFullYear(), bugun.getMonth(), 1), [bugun]);
  const [secimAy, setSecimAy] = useState(null);     // null = otomatik açılış ayı
  const [secili, setSecili] = useState(null);

  const isaret = useMemo(() => isaretHarita(kuyrukSla), [kuyrukSla]);
  const ozet = useMemo(() => ayOzeti(isaret), [isaret]);
  const ay = useMemo(() => secimAy || acilisAyi(ozet, buAy), [secimAy, ozet, buAy]);
  const hucreler = useMemo(() => ayIzgarasi(ay), [ay]);
  const bugunKey = gunAnahtar(bugun);
  const isaretliGunler = useMemo(() => ayIsaretleri(hucreler, isaret), [hucreler, isaret]);
  const ayIsaretN = useMemo(() => isaretliGunler.reduce((t, g) => t + g.ogeler.length, 0), [isaretliGunler]);
  const siraHarita = useMemo(() => new Map(isaretliGunler.map((g, i) => [g.anahtar, i])), [isaretliGunler]);
  const fark = ayFark(ay, buAy);

  const seciliKayit = secili ? isaret.get(secili) : null;
  const ayaGit = (d) => { setSecimAy(new Date(d.getFullYear(), d.getMonth(), 1)); setSecili(null); };
  const ayDegis = (adim) => ayaGit(new Date(ay.getFullYear(), ay.getMonth() + adim, 1));

  return (
    <section aria-label="Yasal süre takvimi"
      style={{ height: "100%", display: "flex", flexDirection: "column", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden" }}>

      {/* Başlık — iki kat: antet künyesi + gezinme üstte, Archivo ay adı + ay sayacı altta.
          Tek satırdayken 390px'te sayaç kırpılıyordu ("son gü…"). Altında ay şeridi. */}
      <div style={{ padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}` }}>
        {/* flexWrap (tur 3): telefonda 44px dokunma hedefli üç düğme künyeyle tek satıra
            sığmıyor, kart overflow:hidden olduğundan "Sonraki ay" oku kırpılıyordu. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SP.s, ...TYPE.antet, color: PAL.mut3 }}>
          <span aria-hidden="true" style={{ display: "flex" }}><Icon.takvim width={13} height={13} /></span>
          <span style={{ whiteSpace: "nowrap" }}>SÜRE TAKVİMİ</span>
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 8 }} />
          {/* Gezinme tek birim: dar kartta BÜTÜN olarak alt satıra iner (tek okun yetim
              kalması yok). */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, marginLeft: "auto" }}>
          {fark !== 0 && (
            <button type="button" onClick={() => ayaGit(buAy)} {...focusRing} data-press="" data-dokunma=""
              aria-label={`Bu aya dön — ${AY_ADI[buAy.getMonth()]} ${buAy.getFullYear()}`}
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              style={{ cursor: "pointer", height: 28, padding: "0 10px", background: "transparent", border: `1px solid ${PAL.line}`,
                borderRadius: RAD.ctl, ...TYPE.meta, fontWeight: 500, color: DERIN.T, whiteSpace: "nowrap", transition: GECIS }}>
              Bugün
            </button>
          )}
          <AyOk yon="sol" onClick={() => ayDegis(-1)} etiket="Önceki ay" />
          <AyOk yon="sag" onClick={() => ayDegis(1)} etiket="Sonraki ay" />
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: `${SP.xs}px ${SP.m}px`, marginTop: SP.s }}>
          <h3 aria-live="polite" style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "118%", fontSize: 26, lineHeight: "30px",
            letterSpacing: "-.02em", color: PAL.ink, whiteSpace: "nowrap" }}>
            {AY_ADI[ay.getMonth()]} <span style={{ color: PAL.mut3, fontWeight: 600, fontStretch: "100%" }}>{ay.getFullYear()}</span>
          </h3>
          <span style={{ textAlign: "right", ...TYPE.meta, color: PAL.mut2, ...TNUM, paddingBottom: 3, whiteSpace: "nowrap" }}>
            {ayIsaretN > 0
              ? <><b style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: PAL.ink }}>{ayIsaretN}</b> evrak · {isaretliGunler.length} gün</>
              : fark === 0 ? "bu ay son gün yok" : `${Math.abs(fark)} ay ${fark < 0 ? "önce" : "sonra"}`}
          </span>
        </div>
        {ozet.size > 0 && <div style={{ marginTop: SP.m }}><AySeridi ozet={ozet} ay={ay} buAy={buAy} onGit={ayaGit} /></div>}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${SP.m}px ${SP.l}px ${SP.l}px` }}>
        <div style={{ width: "100%", maxWidth: 308, margin: "0 auto" }}>
          <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {GUN_KISA.map((g, i) => (
              <span key={g} style={{ textAlign: "center", ...TYPE.antet, fontSize: 10, color: i >= 5 ? PAL.mut3 : PAL.mut2, padding: "2px 0" }}>{g}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {hucreler.map((d, i) => (
              d ? (
                <GunHucre key={gunAnahtar(d)} tarih={d} bugunMu={gunAnahtar(d) === bugunKey}
                  kayit={isaret.get(gunAnahtar(d))} seciliMi={secili === gunAnahtar(d)} onSec={setSecili}
                  sira={siraHarita.get(gunAnahtar(d)) ?? 0} />
              ) : <span key={`bos-${i}`} aria-hidden="true" />
            ))}
          </div>
        </div>

        {/* Lejant — mühür örnekleriyle (renk + şekil birlikte). Izgaranın HEMEN altında (tur 3):
            işaretin yanında okunur ve kart dibinde sabit Asistan düğmesinin altında kalmaz. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.m}px`, justifyContent: "center", marginTop: SP.s }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...TYPE.meta, color: PAL.mut2 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: DERIN.T }} />Bugün
          </span>
          {[["Normal", BANT.yesil.c], ["Yaklaşan", BANT.sari.c], ["Süresi doldu", BANT.kirmizi.c]].map(([l, c]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, ...TYPE.meta, color: PAL.mut2 }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: RAD.dot, border: `1.5px solid ${c}`, outline: `1px solid ${c}`, outlineOffset: 1, background: ALFA(c) }} />{l}
            </span>
          ))}
        </div>
        <div style={{ marginTop: SP.m }}>
          {isaretliGunler.length || seciliKayit
            ? <GunPaneli isaretliGunler={isaretliGunler} seciliKayit={seciliKayit} onSec={setSecili} ayAdi={AY_ADI[ay.getMonth()]} />
            : <BosAy ay={ay} ozet={ozet} onGit={ayaGit} />}
        </div>

      </div>
    </section>
  );
}
