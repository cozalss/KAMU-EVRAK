/* SureTakvimi — Panel R1 sağ kolonu (2026-07-25): kuyruğun yasal sürelerinin AY görünümü.
   Brif "kaç tane / ne kadar acil" sorusunu yanıtlar; takvim "NE ZAMAN" sorusunu — memur
   haftasını görüp iş dağıtabilsin diye.

   VERİ KAYNAĞI YENİ DEĞİL: KahramanBrif ile BİT-AYNI `kuyrukSla` dizisini okur. Her evrakın
   `sla.son_tarih` ("dd.mm.yyyy", backend sla_triyaj üretir) değeri ilgili güne işaretlenir;
   `sla.durum` dairenin rengini, `sla.kalan_gun` gecikme metnini verir. Tarihi olmayan
   (durum "tarih_yok") evrak takvimde HİÇ görünmez — uydurma gün işaretlemek yalan olurdu;
   o evraklar brifteki "tarih doğrulanmalı" diliminde zaten sayılıyor.

   Renk sözlüğü BANT'tır (kırmızı/sarı/yeşil) — brifteki şeritle aynı; aynı evrak iki
   bileşende iki farklı renkte görünmesin diye. Legend bu yüzden 3 değil 4 satır.

   Saf çekirdek (tarih ayrıştırma, işaret haritası, ay ızgarası) lib/sureTakvimi.js'te —
   node --test orada koşar; bu dosya YALNIZ sunumdur.

   Görsel (2026-07-25 cila, kullanıcı referansı): daireler + buzlu cam yüzey.
   · Gün hücresi RAD.dot (tam daire) — köşe yok.
   · Yüzey CAM (yarı saydam): opak beyaz gitti, zeminin sıcaklığı karta işliyor.
   · Seçili gün: saydam daire + AYRI renk (V, mühür moru) — bugün (T) ve bant renklerinin
     hiçbiriyle karışmaz, "hangi günü seçtim" tek bakışta okunur.
   · Geçişler uzun (.2s) ama eğri "ease" — MASTER.md: renk geçişleri özel easing almaz. */
import { useMemo, useState } from "react";
import { Icon, MONO, T, V, TYPE, TNUM, SP, RAD, SH, EASE, ALFA, CAM, DERIN, DERIN_OF, PAL, BANT, focusRing } from "./neonUi.jsx";
import { DURUM_AGIRLIK, gunAnahtar, kalanMetin, isaretHarita, ayIzgarasi } from "../lib/sureTakvimi.js";

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const GUN_TAM = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/* Ağırlık → BANT rengi (sıralama lib'de, renk burada: lib tema bilmez).
   Bilinmeyen durum en sakin bantta kalır — uydurma alarm üretmez. */
const AGIRLIK_RENK = { 1: BANT.yesil.c, 2: BANT.sari.c, 3: BANT.kirmizi.c };
const ogeRenk = (x) => AGIRLIK_RENK[DURUM_AGIRLIK[x?.sla?.durum] || 1];

/* Daire çapı tavanı — takvim dar sağ raya sığar. width:%100 + maxWidth ikilisi dar ekranda
   küçülmeye izin verir, aspectRatio her genişlikte daireyi daire tutar. */
const CAP = 34;
/* Renk/dolgu geçişi uzun (yumuşak his), eğri "ease"; press transform EASE.out alır. */
const GECIS = `background .2s ease, border-color .2s ease, color .2s ease, transform .14s ${EASE.out}`;

/* Ay değiştirme oku — daire ikon buton (hover zemin, press ölçek; hover-kalkış yok). */
function AyOk({ yon, onClick, etiket }) {
  return (
    <button type="button" onClick={onClick} aria-label={etiket} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, padding: 0, background: "transparent", border: `1px solid ${CAM.line}`,
        borderRadius: RAD.dot, color: PAL.mut, transition: GECIS }}>
      {yon === "sol" ? <Icon.okSol width={14} height={14} /> : <Icon.okSag width={14} height={14} />}
    </button>
  );
}

/* Gün hücresi — tam daire.
   · işaretsiz  : düz sayı, çember yok
   · bugün      : ince T çemberi (referanstaki "current day" halkası)
   · işaretli   : bant renginde saydam dolgu + çember, kalın koyu sayı
   · seçili     : V (mühür moru) çemberi + saydam V dolgu — bant renginin ÜSTÜNE yazar;
                  o günün bant kırılımı hemen altındaki listede yazıyla zaten görünür,
                  bilgi kaybı yok. Seçim etkileşim durumu, veri durumu değil.
   İşaretsiz gün <button> DEĞİL <div>'dir — 30 boş sekme durağı klavye kullanıcısını
   takvimde boğuyordu; yalnız işaretli günler odaklanabilir. */
function GunHucre({ tarih, bugunMu, kayit, seciliMi, onSec }) {
  const gunNo = tarih.getDate();
  const daire = {
    width: "100%", maxWidth: CAP, aspectRatio: "1 / 1", margin: "0 auto",
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: RAD.dot, fontFamily: MONO, fontSize: 13, ...TNUM,
  };

  if (!kayit) {
    return (
      <div style={{ ...daire, color: bugunMu ? DERIN.T : PAL.mut2, fontWeight: bugunMu ? 600 : 400,
        border: `1px solid ${bugunMu ? T : "transparent"}`, transition: GECIS }}>
        {gunNo}
      </div>
    );
  }

  const renk = AGIRLIK_RENK[kayit.agirlik];
  const n = kayit.ogeler.length;
  const cember = seciliMi ? V : bugunMu ? T : renk;
  return (
    <button type="button" onClick={() => onSec(seciliMi ? null : gunAnahtar(tarih))} {...focusRing} data-press=""
      aria-pressed={seciliMi}
      title={`${gunNo} ${AY_ADI[tarih.getMonth()]}: ${n} evrakın son günü`}
      aria-label={`${gunNo} ${AY_ADI[tarih.getMonth()]} ${tarih.getFullYear()}, ${GUN_TAM[(tarih.getDay() + 6) % 7]} — ${n} evrakın son günü. Listeyi ${seciliMi ? "kapat" : "göster"}.`}
      onMouseEnter={(e) => { if (!seciliMi) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { if (!seciliMi) e.currentTarget.style.background = ALFA(renk); }}
      style={{ ...daire, cursor: "pointer", padding: 0,
        /* Renk TEK sinyal değil: kalınlık + title + aria + alttaki liste birlikte taşır. */
        fontWeight: 700, color: seciliMi ? DERIN.V : PAL.ink,
        background: seciliMi ? ALFA(V) : ALFA(renk),
        border: `${seciliMi ? 2 : 1}px solid ${cember}`, transition: GECIS }}>
      {gunNo}
    </button>
  );
}

export default function SureTakvimi({ kuyrukSla = [] }) {
  const bugun = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [ay, setAy] = useState(() => new Date(bugun.getFullYear(), bugun.getMonth(), 1));
  const [secili, setSecili] = useState(null);

  const isaret = useMemo(() => isaretHarita(kuyrukSla), [kuyrukSla]);
  const hucreler = useMemo(() => ayIzgarasi(ay), [ay]);
  const bugunKey = gunAnahtar(bugun);

  // Görünen aydaki işaret sayısı — boş ay dürüstçe söylenir ("takvim bozuk" sanılmasın).
  const ayIsaretN = useMemo(
    () => hucreler.reduce((t, d) => t + (d && isaret.has(gunAnahtar(d)) ? isaret.get(gunAnahtar(d)).ogeler.length : 0), 0),
    [hucreler, isaret],
  );

  const seciliKayit = secili ? isaret.get(secili) : null;
  const ayDegis = (adim) => {
    setAy((a) => new Date(a.getFullYear(), a.getMonth() + adim, 1));
    setSecili(null);                                  // ay değişince eski günün listesi asılı kalmasın
  };

  const legend = [
    { l: "Bugün", c: T, halka: true },
    { l: "Normal takvim", c: BANT.yesil.c },
    { l: "Yaklaşan", c: BANT.sari.c },
    { l: "Süresi doldu", c: BANT.kirmizi.c },
  ];

  return (
    <section aria-label="Yasal süre takvimi"
      style={{ height: "100%", display: "flex", flexDirection: "column",
        /* Buzlu cam: opak beyaz yerine yarı saydam yüzey (CAM) — zemin sıcaklığı içeri işler. */
        background: CAM.bg, backdropFilter: CAM.blur, WebkitBackdropFilter: CAM.blur,
        border: `1px solid ${CAM.line}`, borderRadius: RAD.pop, boxShadow: SH.card, padding: SP.l }}>

      {/* Başlık + ay gezinme */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut }}><Icon.takvim width={15} height={15} /></span>
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink }}>
          {AY_ADI[ay.getMonth()]} {ay.getFullYear()}
        </span>
        <span style={{ display: "flex", gap: SP.xs, marginLeft: "auto" }}>
          <AyOk yon="sol" onClick={() => ayDegis(-1)} etiket="Önceki ay" />
          <AyOk yon="sag" onClick={() => ayDegis(1)} etiket="Sonraki ay" />
        </span>
      </div>

      {/* Gün başlıkları */}
      <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: SP.xs, marginBottom: SP.xs }}>
        {GUN_KISA.map((g) => (
          <span key={g} style={{ textAlign: "center", ...TYPE.meta, color: PAL.mut3 }}>{g}</span>
        ))}
      </div>

      {/* Ay ızgarası */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: SP.xs }}>
        {hucreler.map((d, i) => (
          d ? (
            <GunHucre key={gunAnahtar(d)} tarih={d} bugunMu={gunAnahtar(d) === bugunKey}
              kayit={isaret.get(gunAnahtar(d))} seciliMi={secili === gunAnahtar(d)} onSec={setSecili} />
          ) : <span key={`bos-${i}`} aria-hidden="true" />
        ))}
      </div>

      {/* Seçili günün evrakları — ad + gecikme durumu (salt okunur; eylem brifin işi) */}
      <div style={{ marginTop: SP.m, flex: 1, minHeight: 0 }}>
        {seciliKayit ? (
          <>
            <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.meta, color: DERIN.V, ...TNUM }}>
              {seciliKayit.tarih.getDate()} {AY_ADI[seciliKayit.tarih.getMonth()]} · son gün
            </p>
            {seciliKayit.ogeler.slice(0, 4).map((x) => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "5px 0", borderTop: `1px solid ${CAM.line}` }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, flexShrink: 0, background: ogeRenk(x) }} />
                <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
                <span style={{ ...TYPE.meta, fontWeight: 500, flexShrink: 0, ...TNUM, color: DERIN_OF(ogeRenk(x)) }}>{kalanMetin(x.sla)}</span>
              </div>
            ))}
            {seciliKayit.ogeler.length > 4 && (
              <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
                +{seciliKayit.ogeler.length - 4} evrak daha
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, ...TYPE.meta, color: PAL.mut3 }}>
            {ayIsaretN > 0
              ? "İşaretli güne tıklayın: o gün süresi dolan evraklar listelenir."
              : "Bu ayda yasal süresi dolan evrak yok."}
          </p>
        )}
      </div>

      {/* Legend — en alta yaslı (kart metrik kolonuyla eşit yüksekliğe esnerken kaymasın) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.m}px`, marginTop: SP.m, paddingTop: SP.s, borderTop: `1px solid ${CAM.line}` }}>
        {legend.map((x) => (
          <span key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, ...TYPE.meta, color: PAL.mut2 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, flexShrink: 0,
              background: x.halka ? "transparent" : ALFA(x.c), border: `1.5px solid ${x.c}` }} />
            {x.l}
          </span>
        ))}
      </div>
    </section>
  );
}
