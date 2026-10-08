/* SesliOrb — sesli görüşmenin MÜHÜR DİSKİ (saf sunum, durum yok).
   SesliGorusme'den ayrı tutulur ki sahne mantığına dokunmadan görsel üzerinde iterasyon
   yapılabilsin ve orb-lab.html düzeneği onu dört durumda deterministik çekebilsin.

   TASARIM (tur 8, jüri: "jenerik AI küresi — lila blur, screen blend, dalgalı blob; Antet &
   Damga malzemesiyle bağı yok"): küre artık ıstampa moru V ile basılmış eş merkezli bir
   LASTİK MÜHÜR İZİ. Tek renk, blur yok, blend yok, gradyan yok. Ses görünür karşılığını
   mührün kendi fiziğinde bulur:
   · Dinliyor  — tek ince dış halka nefes alır (haloRef opaklığı, rAF).
   · Düşünüyor — kesikli dış halka mühür gibi yavaş döner (yalnız bu durumda; durum bitince durur).
   · Yanıtlıyor — baskı halkaları sesin genliğiyle dışa yayılır (damga basılırken mürekkebin
     kâğıda yayılması) + çekirdek mürekkep yoğunluğu genliğe bağlı koyulaşır (parlaRef).
   Renk tek sinyal değil: dört durum ŞEKİLLE ayrılır (düz / kesikli-dönen / yayılan halka),
   ayrıca rıhtım künyesi durumu metinle yazar. reduced-motion: dönüş/yayılma yok, halkalar
   statik kalır (kesikli halka yine "düşünüyor"u şekille taşır).

   SÖZLEŞME: kabı `position: relative` ve 1:1. Animasyonu çağıranın rAF döngüsü sürer:
   `orbRef` (transform: scale — mühür basıncı), `haloRef` (opacity — dış halka nefesi),
   `parlaRef` (opacity — mürekkep yoğunluğu). Bkz. SesliGorusme.dongu ve lib/orbCizim.orbKare. */
import React, { useId } from "react";
import { PAL, DERIN, MONO } from "./neonUi.jsx";

// Mühür mürekkebi: AA-güvenli derin ıstampa moru (koyu temada açık lavanta) — iki temada da
// zeminle ≥3:1 grafik kontrast. Ham V koyu temada neon okunuyordu (tur 8 brif §16).
const MUREKKEP = DERIN.V;
const ince = (yuzde, ek = {}) => ({ position: "absolute", inset: yuzde, borderRadius: "50%", pointerEvents: "none", ...ek });
// Mühür yüzeyindeki eş merkezli ses halkaları (viewBox 100 yarıçapı, kalınlık, opaklık).
// Ritim: içe doğru sıklaşan çizgi aralığı — gerçek mühürlerin rozet halkası dili.
const IC_HALKALAR = [[30, 1.1, 0.55], [24, 0.9, 0.42], [18.5, 0.9, 0.3]];
// Halka yazısı: lastik mührün kenar yazısı. Kurum adı DEĞİL (devlet kimliği taklidi yok) —
// ürünün kendi künyesi; mono, büyük harf, aralıklı. Gerçek lastik mühür tipografisi (tur 9
// jüri: tek tam daire yolunda alt yay baş aşağı okunuyordu): üst yay SAAT YÖNÜNDE, alt yay
// TERSİNE — ikisi de soldan sağa okunur; 9 ve 3 yönünde iki ayıraç noktası.
const UST_YAZI = "KAMU-EVRAK · SESLİ GÖRÜŞME";
const ALT_YAZI = "DANIŞMA MASASI";
const UST_R = 40.5;   // üst yay taban çizgisi: harfler dışa doğru yükselir
const ALT_R = 43.9;   // alt yay taban çizgisi dışta: harfler içe doğru durur, iki yay aynı bantta
const KENAR_STIL = { fontFamily: MONO, fontSize: 5.6, letterSpacing: ".45px", fontWeight: 600 };

/* Dış durum halkası: dinliyor/hazır düz, düşünüyor kesikli (+ dönüş), yanıtlıyor yayılan çift. */
function DurumHalkasi({ dusunuyor, konusuyor, azHareket, haloRef }) {
  if (dusunuyor) {
    return <span aria-hidden="true" style={ince("4%", { border: `1.5px dashed ${MUREKKEP}`, opacity: 0.8, animation: azHareket ? "none" : "nu-spin 9s linear infinite" })} />;
  }
  return (
    <>
      {/* Nefes alan ince halka — rAF opaklığı (taban ~.14–.38) üstüne sabit iz: şekil hep okunur. */}
      <span aria-hidden="true" style={ince("4%", { border: `1px solid ${MUREKKEP}`, opacity: 0.22 })} />
      <span ref={haloRef} aria-hidden="true" style={ince("4%", { border: `1.5px solid ${MUREKKEP}`, opacity: 0.3 })} />
      {konusuyor && !azHareket && [0, 1].map((i) => (
        <span key={i} aria-hidden="true" style={ince("12%", { border: `1.5px solid ${MUREKKEP}`, animation: `ke-orb-halka 1.8s var(--ke-ease-out) ${i * 0.9}s infinite` })} />
      ))}
    </>
  );
}

/* Mühür izi: çift dış çizgi + kenar yazısı + eş merkezli iç halkalar + mürekkep çekirdeği.
   Tek SVG (viewBox 100): çizgiler ölçekle birlikte keskin kalır. orbRef kabın transform'unu,
   parlaRef çekirdek dairesinin opaklığını sürer (SVG öğesinde style.opacity çalışır). */
function MuhurIzi({ orbRef, parlaRef }) {
  const kimlik = useId().replace(/:/g, "");
  const ust = `ke-muhur-ust-${kimlik}`, alt = `ke-muhur-alt-${kimlik}`;
  return (
    <span ref={orbRef} aria-hidden="true" style={ince("12%", { willChange: "transform" })}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <path id={ust} d={`M${50 - UST_R} 50 A${UST_R} ${UST_R} 0 0 1 ${50 + UST_R} 50`} />
          <path id={alt} d={`M${50 - ALT_R} 50 A${ALT_R} ${ALT_R} 0 0 0 ${50 + ALT_R} 50`} />
        </defs>
        <circle cx="50" cy="50" r="49" fill={PAL.surf} stroke={MUREKKEP} strokeWidth="2.6" />
        <circle cx="50" cy="50" r="45.4" fill="none" stroke={MUREKKEP} strokeWidth="0.8" opacity=".75" />
        <text fill={MUREKKEP} style={KENAR_STIL} opacity=".85">
          <textPath href={`#${ust}`} startOffset="50%" textAnchor="middle">{UST_YAZI}</textPath>
        </text>
        <text fill={MUREKKEP} style={KENAR_STIL} opacity=".85">
          <textPath href={`#${alt}`} startOffset="50%" textAnchor="middle">{ALT_YAZI}</textPath>
        </text>
        {/* İki ayıraç: üst ve alt yazının buluştuğu 9 ve 3 yönünde birer mürekkep noktası. */}
        {[50 - 40.7, 50 + 40.7].map((x) => <circle key={x} cx={x} cy="48.2" r="1.15" fill={MUREKKEP} opacity=".8" />)}
        <circle cx="50" cy="50" r="36" fill="none" stroke={MUREKKEP} strokeWidth="0.8" opacity=".75" />
        {IC_HALKALAR.map(([r, w, o]) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={MUREKKEP} strokeWidth={w} opacity={o} />)}
        {/* Mürekkep çekirdeği: taban her zaman basılı, genlik yoğunluğu parlaRef ile artar. */}
        <circle cx="50" cy="50" r="12" fill={MUREKKEP} opacity=".85" />
        <circle ref={parlaRef} cx="50" cy="50" r="15" fill={MUREKKEP} style={{ opacity: 0.1 }} />
      </svg>
    </span>
  );
}

export default function SesliOrb({ dusunuyor = false, konusuyor = false, azHareket = false, orbRef, haloRef, parlaRef }) {
  return (
    <>
      <DurumHalkasi dusunuyor={dusunuyor} konusuyor={konusuyor} azHareket={azHareket} haloRef={haloRef} />
      <MuhurIzi orbRef={orbRef} parlaRef={parlaRef} />
    </>
  );
}
