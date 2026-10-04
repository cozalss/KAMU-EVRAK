/* KurulMasasi — Bürokrasi Kurulu modalının SAHNE parçaları (MuzakereKurulu.jsx'ten ayrıldı:
   o dosya 800 satır sınırındaydı). Burada yalnız sunum yaşar; müzakere state'i, akış ve HITL
   kararları MuzakereKurulu'da kalır.

   Görsel fikir (Antet & Damga, 2026-10): kurul bir TOPLANTI MASASI etrafında oturur —
   üyeler masanın dört yanında koltuktur, masanın ortası toplantının o anki durumunu söyler;
   akış sohbet balonu değil TOPLANTI TUTANAĞI gibi dizilir (tur başlığı · § numaralı madde ·
   konuşmacı sütunu); uzlaşan üyenin koltuğuna küçük yuvarlak bir MÜHÜR basılır. */
import { MONO, SANS, DISPLAY, T, V, R, PAL, DERIN, DERIN_OF, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon } from "./neonUi.jsx";
import { kaynakEtiketi } from "../lib/muzakere.js";

// Kişi (vatandaş) ikonu — neonUi setinde yok, yerel.
const KisiIkon = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.5 19 a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Kurul üyeleri ↔ gerçek pipeline ajanları eşlemesi (rol satırında görünür — dürüst kurgu).
// Birim Amiri = 4. üye: risk_guard bandını sahiplenen kapanış sesi; rengi DİNAMİK (üstündeki
// riskin rengini taşır — semantik: amir riskin rengini giyer), sözü backend'de deterministik.
// Her üye AYRI bir hata sınıfına ve o sınıfın GERÇEK sinyaline bağlıdır (backend
// yazi/kurul.py KURUL_UYELERI gerekçesi): biçim · doğruluk · karşılık.
export const KURUL = [
  { id: "taslakci", ad: "Yazı Sorumlusu", rol: "biçim · Yön. 2646 bölümleri", col: T, Ikon: Icon.doc },
  { id: "hukukcu", ad: "Hukuk Denetimi", rol: "doğruluk · dayanak", col: V, Ikon: Icon.scale },
  { id: "vatandas", ad: "Muhatap Temsilcisi", rol: "talep · hak arama yolu", col: R, Ikon: KisiIkon },
  { id: "birim_amiri", ad: "Birim Amiri", rol: "risk bandı · gönderim", col: V, Ikon: Icon.shield, dinamik: true },
];
export const UYE = Object.fromEntries(KURUL.map((k) => [k.id, k]));
// Dinamik-renkli üye (Birim Amiri) sahnenin risk aksanını taşır; diğerleri sabit token rengi.
export const uyeGor = (id, aksan) => (UYE[id]?.dinamik ? { ...UYE[id], col: aksan } : UYE[id]);

/* Şerit etiketi (açılış → çapraz eleştiri → denetim turları → karar). Denetim turları 2'den
   ARTARAK numaralanır: kurul her denetim turunda revize taslağın YENİDEN ÖLÇÜLEN sinyallerine
   bakar (backend yazi/kurul.py yakınsama döngüsü). Karar turu sabit 9 — yerel deterministik
   motor (muzakere.js) moderatörü hâlâ 2'de bıraktığından etiket `who`ya da bakar. */
const KARAR_TUR = 9;
export function turEtiketi(t) {
  if (t.who === "birim_amiri" || t.tur === KARAR_TUR) return "Karar";
  if (t.tur === 0) return "Açılış turu";
  if (t.tur === 1) return "Çapraz eleştiri";
  return t.tur === 2 ? "Denetim turu" : `${t.tur - 1}. denetim turu`;
}
// Çapraz-tur duruşu → çapraz-referans ipucu (kime · nasıl): karşı çıkıyor / katılıyor / geliştiriyor.
const TUTUM_META = {
  karsi: { etiket: "karşı çıkıyor", col: BANT.kirmizi.c },
  katil: { etiket: "katılıyor", col: BANT.yesil.c },
  gelistir: { etiket: "geliştiriyor", col: T },
};
// vurgu tipi → aksan rengi + rozet etiketi (kaynağına sadık: format ≠ sadeleştirme).
const VURGU = {
  dayanak: { col: V, etiket: "dayanak eklendi" },
  format: { col: V, etiket: "2646 format düzeltmesi" },
  sade: { col: R, etiket: "dil sadeleştirildi" },   // yalnız örnek kurguda üretilir (lib)
};
// Risk bandı → küçük ROZET (verdict/sevk töreni YOK — kurulun çıktısı revize taslağıdır).
// Ad TEK sözlükten (BANT: "SARI · Orta risk") — karar fişiyle aynı kelimeler (tur-4: fiş
// "Orta risk", kurul "Dikkat"/"yüksek risk" diyordu; üç ekranda üç ayrı ad).
export const RISK = Object.fromEntries(Object.entries(BANT).map(([k, b]) => [k, { etiket: b.t, bant: b.l, c: b.c }]));
// Sahne aksan rengi: risk varsa onun rengi, yoksa mühür moru (üretim hattı).
export const aksanRenk = (risk) => RISK[risk]?.c || V;

/* Masa düzeni — dört koltuk masanın dört yanında. Satır-içi stil medya sorgusu taşıyamaz;
   bu yüzden YALNIZ ızgara alanları için kapsamlı (ke-kurul-*) bir stil bloğu. Telefonda
   masa üste çıkar, koltuklar 2×2 dizilir. */
const MASA_CSS = `
.ke-kurul-masa{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr);grid-template-areas:". hukukcu ." "taslakci masa birim_amiri" ". vatandas .";gap:10px 18px;align-items:center}
@media (max-width:720px){.ke-kurul-masa{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"masa masa" "taslakci hukukcu" "vatandas birim_amiri"}.ke-kurul-masa > [data-koltuk]{justify-self:stretch!important;padding:8px 6px!important}}
@keyframes ke-koltuk-soz{0%{box-shadow:0 0 0 0 var(--soz)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
`;

/* Koltuk mührü — üyenin tutanağa GEÇMİŞ son duruşu (uydurma "oy" değil: yalnız açılmış
   maddelerin `tutum` alanından ve Birim Amiri'nin karar maddesinden türetilir).
   Resmî kurul tutanağı dili: katılan üye paraf atar, karşı çıkan MUHALEFET ŞERHİ düşer,
   amir kararı imzalar. Şerh kesik çizgili halka + "Ş" — renk tek sinyal değil (glif + metin). */
export const DURUS = {
  katil: { etiket: "katıldı", glif: "check" },
  gelistir: { etiket: "katkı verdi", glif: "plus" },
  karsi: { etiket: "şerh düştü", glif: "Ş" },
  karar: { etiket: "kararı açıkladı", glif: "shield" },
};
/** Açılmış maddelerden üye başına SON duruş — `turEtiketi` ile aynı kaynaktan (tutanak). */
export function duruslariCikar(turlar) {
  const d = {};
  for (const t of turlar || []) {
    if (t.who === "birim_amiri" && turEtiketi(t) === "Karar") d[t.who] = "karar";
    else if (t.tutum && DURUS[t.tutum]) d[t.who] = t.tutum;
  }
  return d;
}

function KoltukMuhru({ renk, durus, az }) {
  const m = DURUS[durus];
  if (!m) return null;
  const c = DERIN_OF(renk);
  const serh = durus === "karsi";
  return (
    <span aria-hidden="true" style={{ "--egim": "-14deg", position: "absolute", right: -7, bottom: -7, width: 21, height: 21, borderRadius: RAD.dot,
      display: "grid", placeItems: "center", color: c, background: PAL.surf, border: `1.5px ${serh ? "dashed" : "solid"} ${c}`,
      outline: serh ? "none" : `1px solid ${c}`, outlineOffset: 1.5, transform: "rotate(-14deg)",
      fontFamily: MONO, fontSize: 11, fontWeight: 700, lineHeight: 1,
      animation: az ? "none" : "nu-damga .42s var(--ke-ease-spring) both" }}>
      {m.glif === "check" ? <Icon.check width={11} height={11} strokeWidth={2.4} />
        : m.glif === "plus" ? <Icon.plus width={11} height={11} strokeWidth={2.4} />
        : m.glif === "shield" ? <Icon.shield width={11} height={11} strokeWidth={2.2} />
        : m.glif}
    </span>
  );
}

// Üye avatarı — renkli disk + ikon; söz alırken halka yayılır, duruşu tutanağa geçince mühür basılır.
export function Avatar({ uye, size = 36, aktif, durus, az }) {
  return (
    <span aria-hidden="true" style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ "--soz": `color-mix(in srgb, ${uye.col} 45%, transparent)`, width: size, height: size, borderRadius: RAD.dot, background: aktif ? uye.col : ALFA(uye.col),
        border: `1.5px solid ${uye.col}`, color: aktif ? PAL.onAccent : DERIN_OF(uye.col), display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background .2s ease-out, color .2s ease-out", animation: aktif && !az ? "ke-koltuk-soz 1.4s ease-out infinite" : "none" }}>
        <uye.Ikon width={size * 0.46} height={size * 0.46} />
      </span>
      {durus && <KoltukMuhru key={durus} renk={uye.col} durus={durus} az={az} />}
    </span>
  );
}

/* Koltuklar masaya YÖNELİR: yandakiler masaya doğru yaslanır, üst/alttakiler ortalanır.
   Telefonda (2×2) hepsi hücreyi doldurur — medya kuralı justify-self'i ezer. */
const HIZA = { taslakci: "end", birim_amiri: "start", hukukcu: "center", vatandas: "center" };

function Koltuk({ uye, aktif, durus, yukleniyor, az, i }) {
  const oy = !!DURUS[durus];
  const durum = yukleniyor ? "taslağı okuyor…" : aktif ? "söz alıyor…" : oy ? DURUS[durus].etiket : uye.rol;
  return (
    <div data-koltuk="" style={{ gridArea: uye.id, justifySelf: HIZA[uye.id] || "stretch", maxWidth: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: SP.m, padding: "8px 12px", borderRadius: RAD.card,
      background: aktif ? ALFA(uye.col) : "transparent", transition: "background .2s ease-out",
      animation: az ? "none" : `nu-rise .36s var(--ke-ease-out) ${0.06 + i * 0.06}s both`,
      ...(yukleniyor && !az ? { opacity: 0.85 } : null) }}>
      <Avatar uye={uye} aktif={aktif} durus={durus} az={az} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink }}>{uye.ad}</span>
        <span style={{ display: "block", ...TYPE.meta, color: aktif || oy ? DERIN_OF(uye.col) : PAL.mut3, fontWeight: aktif || oy ? 500 : 400, maxWidth: 190,
          animation: yukleniyor && !az ? `nu-think 1.4s ease-in-out ${i * 0.2}s infinite` : "none" }}>{durum}</span>
      </span>
    </div>
  );
}

/* Toplantı masası — dört koltuk + ortada masanın kendisi (durum + risk). `orta` masanın
   üstünde yazan şeydir (çağıran verir: durum çipi, risk). */
export function KurulMasasi({ speaking = null, durus = {}, aksan, orta, yukleniyor = false, az = false }) {
  return (
    <div className="ke-kurul-masa">
      <style>{MASA_CSS}</style>
      {KURUL.map((base, i) => {
        const u = uyeGor(base.id, aksan);
        return <Koltuk key={u.id} uye={u} i={i} aktif={speaking === u.id} durus={durus[u.id]} yukleniyor={yukleniyor} az={az} />;
      })}
      {/* Masa yüzeyi — dikdörtgen toplantı masası FİŞİ: üstte antet çift çizgisi, altta tek
          ince çizgi (tur-4: tam yuvarlak "hap" Antet & Damga dilinde yoktu). */}
      <div style={{ gridArea: "masa", minHeight: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.s,
        padding: "16px 20px 14px", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`,
        boxShadow: `inset 0 3px 0 -1px ${PAL.ink}, inset 0 5px 0 -1px ${PAL.surf}, inset 0 6px 0 -1px ${PAL.ink}, ${SH.card}`,
        textAlign: "center", animation: az ? "none" : "nu-rise .4s var(--ke-ease-out) both" }}>
        {orta}
      </div>
    </div>
  );
}

/* Tutanak tur başlığı — antet dilinde: çift çizgi arasında mono büyük harf. */
export function TurSeridi({ etiket, no }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, margin: `${SP.s}px 0 ${SP.xs}px` }}>
      <span style={{ ...TYPE.antet, color: PAL.ink2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {no != null && <span style={{ color: PAL.mut3, marginRight: SP.s, ...TNUM }}>{no}.</span>}{etiket}
      </span>
      <span aria-hidden="true" style={{ flex: 1, height: 4, borderTop: `1px solid ${PAL.lineHi}`, borderBottom: `1px solid ${PAL.line}` }} />
    </div>
  );
}

/* Tutanak maddesi — § numarası + konuşmacı sütunu + söz. Çapraz-referans (kime · nasıl)
   sözün üstünde küçük bir yön satırıdır — debate'in görünür dinamizmi. */
export function TutanakMaddesi({ uye, t, aksan, no }) {
  const hedef = t.yanit ? uyeGor(t.yanit, aksan) : null;
  const tm = t.tutum ? TUTUM_META[t.tutum] : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", columnGap: SP.s, padding: "10px 0", borderTop: `1px solid ${PAL.line}`, animation: "nu-rise .22s var(--ke-ease-out) both" }}>
      <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "20px", color: PAL.mut3, ...TNUM }}>§{no}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: 3 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: uye.col, flexShrink: 0 }} />
          <span style={{ ...TYPE.data, fontWeight: 600, color: DERIN_OF(uye.col) }}>{uye.ad}</span>
          {hedef && tm && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...TYPE.meta, color: DERIN_OF(tm.col) }}>
              <Icon.arrow width={11} height={11} /> {hedef.ad} · {tm.etiket}
            </span>
          )}
          {kaynakEtiketi(t.kaynak) && <span style={{ marginLeft: "auto", ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase" }}>{kaynakEtiketi(t.kaynak)}</span>}
        </div>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 14, lineHeight: "21px", color: PAL.ink2 }}>{t.text}</p>
      </div>
    </div>
  );
}

// "Söz alıyor" — konuşan üyenin maddesi belirmeden önce tutanakta bekleyen satır.
export function Yaziyor({ uye, az }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", columnGap: SP.s, padding: "10px 0", borderTop: `1px solid ${PAL.line}` }}>
      <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "20px", color: PAL.mut3 }}>§…</span>
      <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: DERIN_OF(uye.col), fontWeight: 600 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: uye.col }} />
        {uye.ad}
        <span aria-hidden="true" style={{ display: "inline-flex", gap: 3, marginLeft: 2 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 4, height: 4, borderRadius: RAD.dot, background: uye.col, animation: az ? "none" : "nu-think 1s ease-in-out infinite", animationDelay: `${i * 0.16}s` }} />
          ))}
        </span>
      </span>
    </div>
  );
}

/* Satır düzeni — taslak metni sekmeyle hizalanmış düz metindir (Word/DOCX çıktısıyla aynı
   kaynak). `pre-wrap` sekmeleri HAM boşluk olarak basıyordu: başlık satırları rastgele kayık,
   "Sayı … 03.10.2026" arası tek uzun delik. Burada sekme ANLAMA çevrilir:
     · baştaki ≥3 sekme → antet bölümünde (Konu/Sayı'dan önce) ORTALI, sonra İMZA bloğu (sağ)
     · baştaki 1–2 sekme → paragraf girintisi
     · satır içi sekme → iki uca yaslı (Sayı ↔ tarih)
   Metin değişmez; yalnız sunum. */
const ANTET_SONU = /^\s*(Sayı|Konu)\s*:/;
function satirDuzeni(draft) {
  const antetBitis = draft.findIndex((l) => ANTET_SONU.test(l.metin || ""));
  return draft.map((l, i) => {
    const ham = String(l.metin || "");
    const bas = (ham.match(/^[\t ]*/)?.[0] || "").replace(/ {4}/g, "\t").replace(/ /g, "").length;
    const govde = ham.replace(/^[\t ]+/, "").replace(/\s+$/, "");
    const parcalar = govde.split(/\t+/).map((x) => x.trim()).filter(Boolean);
    const hiza = bas >= 3 ? (antetBitis < 0 || i < antetBitis ? "orta" : "imza") : bas >= 1 ? "girinti" : "duz";
    return { ...l, govde, parcalar, hiza, bos: !govde.trim() };
  });
}

/* Taslak kâğıdı — müzakere sürerken orijinal, kurul revize önerdiyse REVİZE taslağı.
   Masadaki evrak: beyaz yüzey, keskin köşe, kâğıt gölgesi; vurgulu satırlar kenar notuyla. */
export function TaslakKarti({ draft, revize }) {
  const satirlar = satirDuzeni(draft);
  return (
    <div style={{ position: "relative", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: 3, boxShadow: SH.kagit, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "10px 18px", borderBottom: `1px solid ${PAL.line}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
        <span style={{ color: revize ? DERIN.V : PAL.ink2 }}>{revize ? "Kurulun revize taslağı" : "Resmî yazı taslağı"}</span>
        <span style={{ marginLeft: "auto", color: revize ? DERIN.V : PAL.mut3 }}>{revize ? "önerilen sürüm" : "müzakerede"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 460, overflowY: "auto", padding: "20px 26px 24px" }}>
        {satirlar.map((l) => {
          if (l.bos && !l.vurgu) return <span key={l.id} aria-hidden="true" style={{ height: 9, flexShrink: 0 }} />;
          const v = l.vurgu ? VURGU[l.vurgu] : null;
          const yazi = { fontFamily: SANS, fontSize: 13, lineHeight: "20px", color: l.sabit ? PAL.mut2 : PAL.ink, overflowWrap: "anywhere" };
          const icerik = l.parcalar.length > 1 ? (
            <span style={{ ...yazi, display: "flex", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap" }}>
              {l.parcalar.map((p, k) => <span key={k} style={k ? { fontFamily: MONO, fontSize: 12, ...TNUM, color: PAL.ink2 } : null}>{p}</span>)}
            </span>
          ) : (
            <span style={{ ...yazi, display: "block",
              textAlign: l.hiza === "orta" ? "center" : "left",
              textIndent: l.hiza === "girinti" ? "2em" : 0,
              paddingLeft: l.hiza === "imza" ? "52%" : 0,
              fontWeight: l.hiza === "orta" ? 600 : 400 }}>{l.govde}</span>
          );
          return (
            <div key={l.id} style={{ padding: v ? "6px 10px" : "1px 0", margin: v ? "3px 0 3px -10px" : 0, borderRadius: RAD.chip, background: v ? ALFA(v.col) : "transparent", boxShadow: v ? `inset 2px 0 0 ${v.col}` : "none", transition: "background .3s ease-out" }}>
              {icerik}
              {v && <span style={{ display: "block", marginTop: 3, ...TYPE.meta, fontWeight: 500, color: DERIN_OF(v.col) }}>✎ {v.etiket}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Kurul toplanıyor — ağ turu sürerken boş masa: koltuklar dolu, üyeler taslağı okuyor. */
export function KurulYukleniyor({ az, sn = 0, tavanSn = 45 }) {
  // Saniye sayacı + uzun beklemede dürüst açıklama: açılış tavanı aşılırsa yerel motor devreye
  // girer (MuzakereKurulu zaman aşımı) — memur "takıldı mı" diye tahmin etmek zorunda kalmaz.
  const uzun = sn >= 12;
  return (
    <div style={{ padding: `${SP.xl}px ${SP.s}px` }}>
      <KurulMasasi yukleniyor az={az} aksan={V} orta={
        <>
          <span style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", ...TNUM }}>Toplantı açılıyor{sn ? ` · ${sn} sn` : ""}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 15, lineHeight: "20px", fontWeight: 700, fontStretch: "106%", color: PAL.ink }}>Kurul toplanıyor</span>
        </>
      } />
      <p style={{ margin: `${SP.l}px auto 0`, maxWidth: 460, textAlign: "center", ...TYPE.data, color: PAL.mut2 }}>
        {uzun
          ? `İlk söz beklenenden uzun sürüyor. ${tavanSn} sn içinde gelmezse kurul, taslağın ölçülmüş sinyalleriyle yerel motorda toplanır.`
          : "Üyeler taslağı ve doğrulama sinyallerini okuyor; ilk söz birkaç saniye içinde alınır."}
      </p>
    </div>
  );
}
