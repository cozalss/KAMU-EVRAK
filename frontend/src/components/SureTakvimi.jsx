/* SureTakvimi — Panel enstrüman rayının kartı: kuyruğun yasal sürelerinin AY görünümü.
   Brif "kaç tane / ne kadar acil" sorusunu yanıtlar; takvim "NE ZAMAN" sorusunu.

   VERİ KAYNAĞI YENİ DEĞİL: KahramanBrif ile BİT-AYNI `kuyrukSla` dizisini okur. Her evrakın
   `sla.son_tarih` ("dd.mm.yyyy") değeri ilgili güne işaretlenir; `sla.durum` rengi,
   `sla.kalan_gun` gecikme metnini verir. Tarihi olmayan evrak takvimde HİÇ görünmez.

   Tur 6 (jüri: "yoğun ve küçük, ay sekmeleri ince, bugün çapası kayıp"):
   · Başlık bir DOSYA SIRTI bandı (surf2): antet + gezinme, Archivo ay adı, "BUGÜN 06.10.2026 ·
     2 AY ÖNCE" mono bağlam satırı (açılış ayı bugünün ayı değilse kullanıcı nerede olduğunu
     bilir), altında dosya cildi SEKMELERİ (SureTakvimSekme) — seçili sekme kâğıda bağlanır.
   · Izgara kart genişliğine yayılır (308 px kilidi kalktı); hücre 40–44 px yükseklik, mühür
     sabit 34 px DAİRE (hücre genişse elips olmaz). İşaretsiz gün 13 px mono, işaretli 16 px
     Archivo. Hafta sonu sütunları tek hafif şeritle ayrılır.
   · SEÇİM MÜHRÜN KENDİSİDİR: seçili gün mühür DOLAR (koyu mürekkep + açık rakam); eski mor
     kare çerçeve + eğik daire çakışması kalktı.
   · "Bugün" düğmesi hep yerinde (bu ayda devre dışı) — başlık ay değiştirirken zıplamaz.
   · Lejantta "Bugün" yalnız bugün görünen aydaysa; telefonda 2×2 ızgara (yetim kalem yok).
   · Gün listesi haftanın günü adı yerine günün EN ACİL evrakını basar (+ek sayısı, gecikme).
   Saf çekirdek lib/sureTakvimi.js + lib/panelBrifSaf.js'te. */
import { useMemo, useState } from "react";
import { Icon, MONO, DISPLAY, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { DURUM_AGIRLIK, gunAnahtar, kalanMetin, isaretHarita, ayIsaretleri, ayIzgarasi, gunGenislik } from "../lib/sureTakvimi.js";
import { gunEnAcil } from "../lib/panelBrifSaf.js";
import { useDarEkran } from "../hooks/useMedya.js";
import { AY_ADI, AGIRLIK_RENK, ayFark, AySekmeleri, BosAy } from "./SureTakvimSekme.jsx";

export { TakvimIskelet } from "./SureTakvimSekme.jsx";

const GUN_KISA = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];
const GUN_TAM = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const ogeRenk = (x) => AGIRLIK_RENK[DURUM_AGIRLIK[x?.sla?.durum] || 1];
const haftaGunu = (d) => (d.getDay() + 6) % 7;

/* Mürekkep dokusu — lastik mührün yer yer açılan baskısı (Damga atomuyla aynı yöntem). */
const MUREKKEP = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const egim = (g) => ((g * 37) % 11) - 7;     // gün numarasından deterministik eğim
const GECIS = `background .16s ease, color .16s ease, transform .14s ${EASE.out}`;
const MUHUR = 34;
const IZGARA_ARALIK = 4;

function AyOk({ yon, onClick, etiket }) {
  return (
    <button type="button" onClick={onClick} aria-label={etiket} {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, padding: 0, background: PAL.surf, border: `1px solid ${PAL.line}`,
        borderRadius: RAD.ctl, color: PAL.mut, transition: GECIS }}>
      {yon === "sol" ? <Icon.okSol width={15} height={15} /> : <Icon.okSag width={15} height={15} />}
    </button>
  );
}

/* Mühür — sabit 34 px daire, hücrenin ortasında. Seçiliyken DOLAR. */
function Muhur({ renk, kalin, gecikme, gun, dolu }) {
  return (
    <span aria-hidden="true" style={{ position: "absolute", inset: 0, margin: "auto", width: MUHUR, height: MUHUR, borderRadius: RAD.dot, pointerEvents: "none",
      border: `${kalin ? 2 : 1.5}px solid ${dolu ? DERIN_OF(renk) : renk}`, outline: `1px solid ${dolu ? DERIN_OF(renk) : renk}`, outlineOffset: 1.5,
      background: dolu ? DERIN_OF(renk) : ALFA(renk), "--pv-egim": `${egim(gun)}deg`, transform: `rotate(${egim(gun)}deg)`,
      WebkitMaskImage: MUREKKEP, maskImage: MUREKKEP, WebkitMaskSize: "80px 80px", maskSize: "80px 80px",
      transition: "background .16s ease", animation: `pv-bas .5s ${EASE.out} ${gecikme}ms both` }} />
  );
}

/* Gün hücresi. İşaretsiz gün <div>'dir (30 boş sekme durağı klavyeyi boğardı). */
function GunHucre({ tarih, bugunMu, kayit, seciliMi, onSec, sira, yukseklik }) {
  const gunNo = tarih.getDate();
  const kutu = { position: "relative", width: "100%", height: yukseklik, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: RAD.ctl, ...TNUM };
  if (!kayit) {
    return (
      <div style={{ ...kutu, fontFamily: MONO, fontSize: 13, color: bugunMu ? PAL.onAccent : PAL.mut3, fontWeight: bugunMu ? 600 : 400 }} title={bugunMu ? "Bugün" : undefined}>
        {bugunMu && <span aria-hidden="true" style={{ position: "absolute", inset: 0, margin: "auto", width: MUHUR - 2, height: MUHUR - 2, borderRadius: RAD.ctl, background: DERIN.T }} />}
        <span style={{ position: "relative" }}>{gunNo}</span>
      </div>
    );
  }
  const renk = AGIRLIK_RENK[kayit.agirlik];
  const n = kayit.ogeler.length;
  return (
    <button type="button" onClick={(e) => { e.currentTarget.style.background = "transparent"; onSec(seciliMi ? null : gunAnahtar(tarih)); }} {...focusRing} data-press=""
      aria-pressed={seciliMi} title={`${gunNo} ${AY_ADI[tarih.getMonth()]}: ${n} evrakın son günü`}
      aria-label={`${gunNo} ${AY_ADI[tarih.getMonth()]} ${tarih.getFullYear()}, ${GUN_TAM[haftaGunu(tarih)]} — ${n} evrakın son günü. Listeyi ${seciliMi ? "kapat" : "göster"}.`}
      onMouseEnter={(e) => { if (!seciliMi) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...kutu, cursor: "pointer", padding: 0, border: "none", background: "transparent",
        color: seciliMi ? PAL.onAccent : bugunMu ? DERIN.T : DERIN_OF(renk), transition: GECIS }}>
      <Muhur renk={renk} kalin={kayit.agirlik >= 3} gecikme={420 + sira * 80} gun={gunNo} dolu={seciliMi} />
      {/* Archivo rakam; genişliği günün en sıkışık süresini kodlar (bol süre geniş, gecikmiş dar). */}
      <span style={{ position: "relative", fontFamily: DISPLAY, fontSize: 16, lineHeight: "18px", fontWeight: 800, letterSpacing: "-.01em",
        fontStretch: `${gunGenislik(kayit)}%`, textDecoration: bugunMu ? "underline" : "none", textUnderlineOffset: 3 }}>{gunNo}</span>
      {/* Nokta adedi = evrak sayısı (en çok 3) — sayının renkten bağımsız ikinci taşıyıcısı. */}
      <span aria-hidden="true" style={{ position: "absolute", bottom: `calc(50% - ${MUHUR / 2}px + 5px)`, display: "flex", gap: 2 }}>
        {kayit.ogeler.slice(0, 3).map((x) => <span key={x.id} style={{ width: 3, height: 3, borderRadius: RAD.dot, background: seciliMi ? PAL.onAccent : ogeRenk(x) }} />)}
      </span>
    </button>
  );
}

/* Satır — "ayın işaretli günü" ve "seçili günün evrakı" aynı iskelet. */
function Satir({ renk, sol, alt, ad, ek, kunye, onClick, etiket }) {
  const ic = (
    <>
      <span style={{ display: "flex", flexDirection: "column", width: 26, flexShrink: 0, fontFamily: MONO, ...TNUM }}>
        <span style={{ fontSize: 12, lineHeight: "14px", color: PAL.ink2, fontWeight: 600 }}>{sol}</span>
        {alt && <span style={{ fontSize: 10, lineHeight: "12px", color: PAL.mut3 }}>{alt}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, flexShrink: 0, background: renk }} />
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ad}{ek > 0 && <span style={{ color: PAL.mut3, ...TNUM }}> +{ek}</span>}
      </span>
      <span style={{ ...TYPE.meta, fontWeight: 600, flexShrink: 0, ...TNUM, color: DERIN_OF(renk) }}>{kunye}</span>
    </>
  );
  const stil = { display: "flex", alignItems: "center", gap: SP.s, width: "100%", textAlign: "left", padding: "7px 2px", borderTop: `1px solid ${PAL.line}` };
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

/* Gün paneli — seçim yokken ayın işaretli günleri (günün en acil evrakıyla), seçim varken
   o günün evrakları. Salt okunur; eylem brifin işi. */
function GunPaneli({ isaretliGunler, seciliKayit, onSec, ayAdi }) {
  if (seciliKayit) {
    const gorunen = seciliKayit.ogeler.slice(0, 6);
    return (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: SP.xs }}>
          <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink, ...TNUM }}>{seciliKayit.tarih.getDate()} {ayAdi} · son gün</span>
          <button type="button" onClick={() => onSec(null)} {...focusRing} data-press=""
            style={{ marginLeft: "auto", cursor: "pointer", padding: "4px 6px", margin: "-4px -6px -4px auto",
              background: "transparent", border: "none", ...TYPE.meta, fontWeight: 500, color: DERIN.T }}>
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
      {gorunen.map((g) => {
        const { enAcil, ek } = gunEnAcil(g.ogeler);
        return (
          <Satir key={g.anahtar} renk={ogeRenk(enAcil)} sol={String(g.tarih.getDate()).padStart(2, "0")} alt={GUN_KISA[haftaGunu(g.tarih)]}
            ad={enAcil?.label} ek={ek} kunye={kalanMetin(enAcil?.sla)} onClick={() => onSec(g.anahtar)}
            etiket={`${g.tarih.getDate()} ${ayAdi}: ${g.ogeler.length} evrakın son günü, en acili ${enAcil?.label} — listeyi göster`} />
        );
      })}
      {isaretliGunler.length > gorunen.length && (
        <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>+{isaretliGunler.length - gorunen.length} gün daha</p>
      )}
    </>
  );
}

/* Ay özeti — işaret haritasından "yyyy-m" → { tarih, n, agirlik }. */
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

/* AÇILIŞ AYI: bu ayda son gün varsa bu ay; yoksa EN YAKIN işaretli ay (eşitlikte geçmiş). */
function acilisAyi(ozet, buAy) {
  if (ozet.has(`${buAy.getFullYear()}-${buAy.getMonth()}`) || ozet.size === 0) return buAy;
  return [...ozet.values()].map((x) => x.tarih)
    .sort((x, y) => (Math.abs(ayFark(x, buAy)) - Math.abs(ayFark(y, buAy))) || (x - y))[0];
}

const tarihNokta = (d) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

/* Başlık bandı — antet + gezinme, ay adı + sayaç, bugün bağlamı, sekmeler. */
function TakvimBaslik({ ay, buAy, bugun, fark, ayIsaretN, gunN, ozet, onGit, onDegis }) {
  const buAyda = fark === 0;
  return (
    <div style={{ padding: `${SP.m}px ${SP.l}px 0`, background: PAL.surf2, borderBottom: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SP.s, ...TYPE.antet, color: PAL.mut3 }}>
        <span aria-hidden="true" style={{ display: "flex" }}><Icon.takvim width={13} height={13} /></span>
        <span style={{ whiteSpace: "nowrap" }}>SÜRE TAKVİMİ</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 8 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, marginLeft: "auto" }}>
          <button type="button" onClick={() => onGit(buAy)} disabled={buAyda} {...focusRing} data-press="" data-dokunma=""
            aria-label={buAyda ? "Bu ay görüntüleniyor" : `Bu aya dön — ${AY_ADI[buAy.getMonth()]} ${buAy.getFullYear()}`}
            onMouseEnter={(e) => { if (!buAyda) e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = buAyda ? "transparent" : PAL.surf; }}
            style={{ cursor: buAyda ? "default" : "pointer", height: 30, padding: "0 10px", background: buAyda ? "transparent" : PAL.surf,
              border: buAyda ? `1px dashed ${PAL.lineHi}` : `1px solid ${PAL.line}`,
              borderRadius: RAD.ctl, ...TYPE.meta, fontWeight: 600, color: buAyda ? PAL.mut3 : DERIN.T, whiteSpace: "nowrap", transition: GECIS }}>
            Bugün
          </button>
          <AyOk yon="sol" onClick={() => onDegis(-1)} etiket="Önceki ay" />
          <AyOk yon="sag" onClick={() => onDegis(1)} etiket="Sonraki ay" />
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: `${SP.xs}px ${SP.m}px`, marginTop: SP.s }}>
        <h3 aria-live="polite" style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "118%", fontSize: 26, lineHeight: "30px",
          letterSpacing: "-.02em", color: PAL.ink, whiteSpace: "nowrap" }}>
          {AY_ADI[ay.getMonth()]} <span style={{ color: PAL.mut3, fontWeight: 600, fontStretch: "100%" }}>{ay.getFullYear()}</span>
        </h3>
        <span style={{ textAlign: "right", ...TYPE.meta, color: PAL.mut2, ...TNUM, paddingBottom: 3, whiteSpace: "nowrap" }}>
          {ayIsaretN > 0
            ? <><b style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: PAL.ink }}>{ayIsaretN}</b> evrak · {gunN} gün</>
            : "bu ayda son gün yok"}
        </span>
      </div>
      {/* "Neredeyim" çapası — açılış ayı bugünün ayı olmayabilir (gecikmişler geçmiş aylarda). */}
      <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.antet, fontSize: 10, color: buAyda ? DERIN.T : PAL.mut3, ...TNUM }}>
        BUGÜN {tarihNokta(bugun)} · {buAyda ? "BU AY" : `${Math.abs(fark)} AY ${fark < 0 ? "ÖNCESİ" : "SONRASI"} GÖRÜNÜYOR`}
      </p>
      <div style={{ marginTop: SP.m }}>
        {ozet.size > 0 ? <AySekmeleri ozet={ozet} ay={ay} buAy={buAy} onGit={onGit} /> : <div style={{ height: SP.s }} />}
      </div>
    </div>
  );
}

function Lejant({ bugunGorunur, dar }) {
  const kalemler = [
    ...(bugunGorunur ? [["Bugün", null]] : []),
    ["Normal", BANT.yesil.c], ["Yaklaşan", BANT.sari.c], ["Süresi doldu", BANT.kirmizi.c],
  ];
  return (
    <div style={{ display: dar && kalemler.length > 3 ? "grid" : "flex", gridTemplateColumns: "repeat(2, max-content)", flexWrap: "wrap", gap: `${SP.xs}px ${SP.m}px`,
      justifyContent: "center", marginTop: SP.m }}>
      {kalemler.map(([l, c]) => (
        <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, ...TYPE.meta, color: PAL.mut2 }}>
          {c
            ? <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: RAD.dot, border: `1.5px solid ${c}`, outline: `1px solid ${c}`, outlineOffset: 1, background: ALFA(c) }} />
            : <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: DERIN.T }} />}
          {l}
        </span>
      ))}
    </div>
  );
}

/* Ay ızgarası — hafta sonu sütunları tek hafif şerit (hücre başına kutu değil). */
function AyIzgarasi({ hucreler, isaret, bugunKey, secili, onSec, siraHarita, dar }) {
  const yukseklik = 44;                       // telefonda da 44 px dokunma hedefi
  const aralik = dar ? 2 : IZGARA_ARALIK;      // 390'da 4 px aralık hücreyi 43 px'e düşürüyordu
  return (
    <div style={{ position: "relative" }}>
      <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, borderRadius: RAD.ctl, background: PAL.surf2,
        left: `calc((100% - ${6 * aralik}px) * 5 / 7 + ${5 * aralik - 2}px)`, right: -2 }} />
      <div aria-hidden="true" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", columnGap: aralik }}>
        {GUN_KISA.map((g, i) => (
          <span key={g} style={{ textAlign: "center", ...TYPE.antet, fontSize: 10, color: i >= 5 ? PAL.mut3 : PAL.mut2, padding: "6px 0 4px" }}>{g}</span>
        ))}
      </div>
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: aralik }}>
        {hucreler.map((d, i) => (
          d ? (
            <GunHucre key={gunAnahtar(d)} tarih={d} bugunMu={gunAnahtar(d) === bugunKey} yukseklik={yukseklik}
              kayit={isaret.get(gunAnahtar(d))} seciliMi={secili === gunAnahtar(d)} onSec={onSec}
              sira={siraHarita.get(gunAnahtar(d)) ?? 0} />
          ) : <span key={`bos-${i}`} aria-hidden="true" style={{ height: yukseklik }} />
        ))}
      </div>
    </div>
  );
}

export default function SureTakvimi({ kuyrukSla = [] }) {
  const dar = useDarEkran();
  const bugun = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const buAy = useMemo(() => new Date(bugun.getFullYear(), bugun.getMonth(), 1), [bugun]);
  const [secimAy, setSecimAy] = useState(null);     // null = otomatik açılış ayı
  const [secili, setSecili] = useState(null);

  const isaret = useMemo(() => isaretHarita(kuyrukSla), [kuyrukSla]);
  const ozet = useMemo(() => ayOzeti(isaret), [isaret]);
  const ay = useMemo(() => secimAy || acilisAyi(ozet, buAy), [secimAy, ozet, buAy]);
  const hucreler = useMemo(() => ayIzgarasi(ay), [ay]);
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
      <TakvimBaslik ay={ay} buAy={buAy} bugun={bugun} fark={fark} ayIsaretN={ayIsaretN} gunN={isaretliGunler.length}
        ozet={ozet} onGit={ayaGit} onDegis={ayDegis} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${SP.m}px ${SP.l}px ${SP.l}px` }}>
        <AyIzgarasi hucreler={hucreler} isaret={isaret} bugunKey={gunAnahtar(bugun)} secili={secili} onSec={setSecili} siraHarita={siraHarita} dar={dar} />
        <Lejant bugunGorunur={fark === 0} dar={dar} />
        <div style={{ marginTop: SP.m }}>
          {isaretliGunler.length || seciliKayit
            ? <GunPaneli isaretliGunler={isaretliGunler} seciliKayit={seciliKayit} onSec={setSecili} ayAdi={AY_ADI[ay.getMonth()]} />
            : <BosAy ay={ay} ozet={ozet} isaret={isaret} onGit={ayaGit} />}
        </div>
      </div>
    </section>
  );
}
