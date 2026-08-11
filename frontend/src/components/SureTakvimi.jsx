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

   Gövde İKİ KOLON (2026-08-12): solda ay ızgarası, sağda gün paneli — seçim yokken ayın
   işaretli günleri listelenir, bir gün seçilince o günün evrakları. Kırılım kartın KENDİ
   genişliğine bağlıdır (grid auto-fit), viewport'a değil: aynı bileşen 4 kolluk panel
   yuvasında yan yana, telefonda alt alta dizilir. Önceki tek kolonlu düzende ızgara sola
   yapışıyor, geniş ekranda kartın sağ yarısı boş kalıyordu.

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
import { DURUM_AGIRLIK, gunAnahtar, kalanMetin, isaretHarita, ayIsaretleri, ayIzgarasi } from "../lib/sureTakvimi.js";

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const GUN_TAM = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/* Ağırlık → BANT rengi (sıralama lib'de, renk burada: lib tema bilmez).
   Bilinmeyen durum en sakin bantta kalır — uydurma alarm üretmez. */
const AGIRLIK_RENK = { 1: BANT.yesil.c, 2: BANT.sari.c, 3: BANT.kirmizi.c };
const ogeRenk = (x) => AGIRLIK_RENK[DURUM_AGIRLIK[x?.sla?.durum] || 1];

/* Daire çapı tavanı — takvim dar sağ raya sığar. width:%100 + maxWidth ikilisi dar ekranda
   küçülmeye izin verir, aspectRatio her genişlikte daireyi daire tutar. 34 → 48 (2026-08-12):
   34px daire geniş yuvada oyuncak gibi kalıyordu; iki kolonlu gövdeyle birlikte ızgara artık
   kolonunu gerçekten dolduruyor. */
const CAP = 56;
/* Izgaranın azami genişliği — yedi hücre + altı boşluk. Bunu ızgaraya vermek, geniş ekranda
   sütunların hücreden büyüyüp araya ölü boşluk açmasını engeller (bkz. ay ızgarası yorumu). */
const IZGARA_AZAMI = 7 * CAP + 6 * SP.xs;                       // 416
/* Gövde kırılımı — VIEWPORT değil KARTIN kendi genişliği belirler (auto-fit): panel yuvası
   4 kola inip çıktığında, telefonda tek kolona düştüğünde takvim kendi kararını verir.
   Ölçülen kart iç genişlikleri (2026-08-12, panelin 4 kolluk yuvası): 1440px ekranda ~323
   (tek kolon, ızgara kabı doldurur) · 1920'de ~478 (tek kolon, ızgara tavanda + ortalı) ·
   2286'da ~705 (iki kolon, her biri ~344 → ızgara yine doldurur). */
const GOVDE_SUTUN = `repeat(auto-fit, minmax(${IZGARA_AZAMI - 100}px, 1fr))`;
/* Izgara kabından darsa ORTALANIR: sola yapışık bırakmak kartın sağında ölü boşluk gibi
   okunuyordu. Gün başlıkları da aynı kutuyu alır, yoksa sütun adları günlerden kayar. */
const IZGARA_KUTU = { maxWidth: IZGARA_AZAMI, margin: "0 auto" };
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
    borderRadius: RAD.dot, fontFamily: MONO, fontSize: 14, ...TNUM,
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

/* Sağ kolon satırı — hem "ayın işaretli günü" hem "seçili günün evrakı" bu iskeleti kullanır:
   bant noktası + ad + sağa yaslı mono künye. İkisi ayrı yazılırsa hizaları zamanla ayrışır. */
function Satir({ renk, ad, kunye, onClick, etiket }) {
  const ic = (
    <>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, flexShrink: 0, background: renk }} />
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>
      <span style={{ ...TYPE.meta, fontWeight: 500, flexShrink: 0, ...TNUM, color: DERIN_OF(renk) }}>{kunye}</span>
    </>
  );
  const stil = { display: "flex", alignItems: "center", gap: SP.s, width: "100%", textAlign: "left",
    padding: "6px 0", borderTop: `1px solid ${CAM.line}` };
  if (!onClick) return <div style={stil}>{ic}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={etiket} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...stil, cursor: "pointer", background: "transparent", border: "none", borderTop: `1px solid ${CAM.line}`,
        transition: `background .12s ease, transform .14s ${EASE.out}` }}>
      {ic}
    </button>
  );
}

/* Sağ kolon — seçim YOKKEN ayın işaretli günleri (tıklanınca o günü seçer), seçim VARKEN o
   günün evrakları. Eskiden burada tek satırlık bir ipucu vardı; geniş yuvada kartın yarısı
   boş kalıyordu. Liste yeni veri ÇEKMEZ — ızgaranın bastığı işaret haritasının aynısıdır. */
function GunPaneli({ isaretliGunler, seciliKayit, onSec, ayAdi }) {
  if (seciliKayit) {
    const gorunen = seciliKayit.ogeler.slice(0, 6);
    return (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: SP.xs }}>
          <span style={{ ...TYPE.data, fontWeight: 600, color: DERIN.V, ...TNUM }}>
            {seciliKayit.tarih.getDate()} {ayAdi} · son gün
          </span>
          <button type="button" onClick={() => onSec(null)} {...focusRing} data-press=""
            style={{ marginLeft: "auto", cursor: "pointer", padding: 0, background: "transparent", border: "none",
              ...TYPE.meta, color: PAL.mut2 }}>
            Ayın tümü
          </button>
        </div>
        {gorunen.map((x) => <Satir key={x.id} renk={ogeRenk(x)} ad={x.label} kunye={kalanMetin(x.sla)} />)}
        {seciliKayit.ogeler.length > gorunen.length && (
          <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
            +{seciliKayit.ogeler.length - gorunen.length} evrak daha
          </p>
        )}
      </>
    );
  }

  if (!isaretliGunler.length) {
    return (
      <p style={{ margin: 0, ...TYPE.meta, color: PAL.mut3 }}>
        Bu ayda yasal süresi dolan evrak yok.
      </p>
    );
  }

  const gorunen = isaretliGunler.slice(0, 7);
  return (
    <>
      <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.meta, color: PAL.mut2 }}>
        {ayAdi} ayının son günleri — ayrıntı için satıra ya da takvimdeki güne tıklayın.
      </p>
      {gorunen.map((g) => (
        <Satir key={g.anahtar} renk={AGIRLIK_RENK[g.agirlik]}
          ad={`${g.tarih.getDate()} ${ayAdi} ${GUN_TAM[(g.tarih.getDay() + 6) % 7]}`}
          kunye={`${g.ogeler.length} evrak`} onClick={() => onSec(g.anahtar)}
          etiket={`${g.tarih.getDate()} ${ayAdi}: ${g.ogeler.length} evrakın son günü — listeyi göster`} />
      ))}
      {isaretliGunler.length > gorunen.length && (
        <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
          +{isaretliGunler.length - gorunen.length} gün daha
        </p>
      )}
    </>
  );
}

export default function SureTakvimi({ kuyrukSla = [] }) {
  const bugun = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [ay, setAy] = useState(() => new Date(bugun.getFullYear(), bugun.getMonth(), 1));
  const [secili, setSecili] = useState(null);

  const isaret = useMemo(() => isaretHarita(kuyrukSla), [kuyrukSla]);
  const hucreler = useMemo(() => ayIzgarasi(ay), [ay]);
  const bugunKey = gunAnahtar(bugun);

  // Görünen ayın işaretli günleri — hem sağ kolonun listesi hem başlıktaki sayaç buradan
  // (boş ay dürüstçe söylenir, "takvim bozuk" sanılmasın).
  const isaretliGunler = useMemo(() => ayIsaretleri(hucreler, isaret), [hucreler, isaret]);
  const ayIsaretN = useMemo(
    () => isaretliGunler.reduce((t, g) => t + g.ogeler.length, 0), [isaretliGunler]);

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
        {/* Ay sayacı — "takvim boş mu, yoksa bozuk mu" sorusunu başlıkta yanıtlar. */}
        {ayIsaretN > 0 && (
          <span style={{ ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
            {ayIsaretN} evrak · {isaretliGunler.length} gün
          </span>
        )}
        <span style={{ display: "flex", gap: SP.xs, marginLeft: "auto" }}>
          <AyOk yon="sol" onClick={() => ayDegis(-1)} etiket="Önceki ay" />
          <AyOk yon="sag" onClick={() => ayDegis(1)} etiket="Sonraki ay" />
        </span>
      </div>

      {/* Gövde — solda ızgara, sağda gün paneli. Kart dar olduğunda (telefon / tek kolonlu
          panel) auto-fit ikisini alt alta indirir; geniş 4-kol yuvada yan yana dizer.
          Eskiden panel ızgaranın ALTINDAydı: 700px'lik kartta ızgara sola yapışıp sağ yarı
          ölü boşluk kalıyordu (kullanıcı bildirimi 2026-08-12). */}
      <div style={{ display: "grid", gridTemplateColumns: GOVDE_SUTUN, gap: `${SP.m}px ${SP.l}px`,
        alignItems: "start", flex: 1, minHeight: 0 }}>

        <div style={{ minWidth: 0 }}>
          {/* Gün başlıkları — ızgarayla AYNI genişlik/aralık, yoksa sütun başlıkları kayar. */}
          <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: SP.xs, marginBottom: SP.xs, ...IZGARA_KUTU }}>
            {GUN_KISA.map((g) => (
              <span key={g} style={{ textAlign: "center", ...TYPE.meta, color: PAL.mut3 }}>{g}</span>
            ))}
          </div>

          {/* Ay ızgarası — genişlik ızgaranın KENDİSİNDE sınırlanır, hücrede değil. Hücre zaten
              CAP'te duruyordu ama sütun `1fr` olduğundan geniş ekranda sütun büyüyüp hücre
              ortada kalıyor, günler arasında 36px'lik ölü boşluk açılıyordu (ölçüldü 2560px'te,
              gap 4px iken). Izgara kapanınca hücreler sütunlarını doldurur, takvim sık kalır. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: SP.xs, ...IZGARA_KUTU }}>
            {hucreler.map((d, i) => (
              d ? (
                <GunHucre key={gunAnahtar(d)} tarih={d} bugunMu={gunAnahtar(d) === bugunKey}
                  kayit={isaret.get(gunAnahtar(d))} seciliMi={secili === gunAnahtar(d)} onSec={setSecili} />
              ) : <span key={`bos-${i}`} aria-hidden="true" />
            ))}
          </div>
        </div>

        {/* Gün paneli — seçim yoksa ayın son günleri, varsa o günün evrakları (salt okunur;
            eylem brifin işi). İkisi de aynı işaret haritasından, yeni veri kaynağı YOK. */}
        <div style={{ minWidth: 0 }}>
          <GunPaneli isaretliGunler={isaretliGunler} seciliKayit={seciliKayit}
            onSec={setSecili} ayAdi={AY_ADI[ay.getMonth()]} />
        </div>
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
