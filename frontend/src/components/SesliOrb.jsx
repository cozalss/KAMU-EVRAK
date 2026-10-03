/* SesliOrb — sesli görüşme küresinin GÖRSEL katmanları (saf sunum, durum yok).
   SesliGorusme'den ayrıldı ki: (a) sahne mantığına dokunmadan görsel üzerinde iterasyon
   yapılabilsin, (b) orb-lab.html düzeneği onu dört durumda deterministik olarak
   ekran görüntüsüne alabilsin (gerçek sahne mikrofon + oturum istiyor, kıyas yapılamıyordu).

   TASARIM İLKESİ — IŞIK KAYNAĞI, AYDINLATILMIŞ CİSİM DEĞİL.
   İlk sürüm ölçüldü (orb-oncesi.png): sol-üstte sert specular + altta koyu iç gölge
   (`inset 0 -14px 44px`) beyne "yukarıdan aydınlatılmış katı bilye" okutuyordu — kodun kendi
   hedefi olan "canlı enerji" değil. Işık kaynağının imzası tersidir: en parlak nokta
   MERKEZDEDİR, kenara doğru söner ve silüeti KOYU bir hatla bitmez (koyu hat = katı cisim).
   Bu yüzden: alt iç gölge YOK, sert specular YOK, gradyan merkezden dışa açılır.

   HUE BİRLİĞİ: çekirdek mavi ama halo MOR ise göz bunları İKİ AYRI nesne okur (ilk sürümde
   orb mavi, hâlesi pembe bir lekeydi). Hâle artık çekirdeğin hue ailesinde — mühür moru yalnız
   en dış kenarda bir iz olarak kalır.

   SÖZLEŞME: kabı `position: relative` ve 1:1 en-boy oranında olmalı — katmanlar `inset`
   yüzdeleriyle konumlanır ve bilerek kabın DIŞINA taşar (aura/halo). Kabın `pointerEvents`
   kararı da çağırana aittir; buradaki taşan katmanlar tıklamayı geçirir.

   Animasyonu KİM sürer: `orbRef` (transform + clipPath), `haloRef` (opacity) ve `parlaRef`
   (çekirdek parlaması) çağıranın rAF döngüsünde yazılır — bkz. SesliGorusme.dongu ve
   lib/orbCizim.orbKare. Bu bileşen yalnız katmanları kurar.
*/
import React from "react";
import { PAL, DERIN, T, V } from "./neonUi.jsx";

// Düşük opaklıklı grain — düz vektör gradyanını "enerji topu"na çevirir.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Antet & Damga (2026-10): eski pastel gök turkuazı (IRIS) yeni paletin dışında kalıyordu —
// küre artık TÜKENMEZ MÜREKKEBİNİN kendi ailesinde: çekirdek T'nin kâğıda (onInk, iki temada
// açık) karışmış hâli, kenarda istampa moru. "Mürekkep damlası ışığı"; hue birliği korunur.
// Koyu temada T zaten açık bir mavi — kâğıda aynı oranda karışınca küre beyaza yıkanıyordu
// (ölçüldü); orada mürekkep oranı yükselir. Oran tema başına tek CSS değişkeninde.
const GOK = "var(--ke-orb-gok)";
const GOK_UST = "var(--ke-orb-gok-ust)";
const ORB_CSS = `:root{--ke-orb-gok:color-mix(in srgb, ${T} 52%, ${PAL.onInk});--ke-orb-gok-ust:color-mix(in srgb, ${T} 16%, ${PAL.onInk})}
:root[data-theme="dark"]{--ke-orb-gok:color-mix(in srgb, ${T} 86%, ${PAL.onInk});--ke-orb-gok-ust:color-mix(in srgb, ${T} 48%, ${PAL.onInk})}`;

// Düşünme halkası kutunun kenarından DEĞİL kürenin GÖRÜNÜR kenarından doğmalı. Küre clip-path
// ile r = 0.38·boyut çiziliyor, yani kutu yarıçapının %76'sı; halka inset:0 ile başlarsa
// arada ~%12'lik bir boşluk kalır ve küreden çıkan bir dalga değil, etrafında duran AYRI bir
// çember okunur (kör denetim bulgusu). %12 içeri = halka tam kürenin kenarında doğar.
const HALKA_ICE = "12%";
// reduced-motion'daki DURAN halka aynı yarıçapta olamaz: yayılmadığı için kürenin kendi
// kenarıyla birebir çakışır ve görünmez olur (ölçüldü). Biraz dışarıda duran bir çember
// "Düşünüyor" jetonunu hareketsiz de taşır.
const HALKA_DURAN = "4%";

export default function SesliOrb({
  dusunuyor = false, azHareket = false, orbRef, haloRef, parlaRef,
}) {
  const anim = (deger) => (azHareket ? "none" : deger);
  return (
    <>
      <style>{ORB_CSS}</style>
      {/* Düşünürken dışa yayılan halkalar. İlk sürümde ham `T` ve tek halkaydı: açık zeminde
          hâlenin içinde kayboluyordu, "Düşünüyor" ile "Hazır" bakışta AYIRT EDİLEMİYORDU.
          Artık AA-güvenli DERIN.T + iki halka (gecikmeli ikinci = ritim, tek atım değil).
          Periyot (2,7 sn) orbKare'deki DÜŞÜNCE NABZI ile aynıdır — halka ayrı bir eklenti değil,
          gövdenin kendi atımının dışarı taşan hâli olarak okunmalı. İkisi ayrı hızda koşarsa
          iki farklı davranış görünür. */}
      {dusunuyor && (azHareket ? (
        // reduced-motion: halka KALIR ama yayılmaz. "Düşünüyor"un tek görsel jetonunu tamamen
        // kaldırmak, hareketi kısan kullanıcıyı durum ayrımından da mahrum bırakırdı; duran
        // bir çember hareket değildir.
        <span aria-hidden="true" style={{ position: "absolute", inset: HALKA_DURAN, borderRadius: "50%", border: `1.5px solid ${DERIN.T}`, opacity: .45 }} />
      ) : (
        <>
          <span aria-hidden="true" style={{ position: "absolute", inset: HALKA_ICE, borderRadius: "50%", border: `1.5px solid ${DERIN.T}`, animation: "ke-orb-halka 2.7s var(--ke-ease-out) infinite" }} />
          <span aria-hidden="true" style={{ position: "absolute", inset: HALKA_ICE, borderRadius: "50%", border: `1.5px solid ${DERIN.T}`, animation: "ke-orb-halka 2.7s var(--ke-ease-out) 1.35s infinite" }} />
        </>
      ))}
      {/* Dış aura — atmosfer. İlk sürümde inset -58% + mor durak: gradyanın turkuaz çekirdeği
          %100 kürenin ARKASINDA kalıyordu, dışarı yalnız MOR kuyruk sızıyordu. Gövde mavi,
          ışığı mor olunca göz ikisini aynı nesne saymıyor — ve arkadaki kartın metnini pembeye
          boyuyordu (orb-oncesi-zemin.png). Mor buradan TAMAMEN çıkarıldı; erik yalnız kürenin
          kendi kenarında bir iz olarak kalır. Duraklar kürenin görünür kenarının (r≈0.38·boyut)
          DIŞINDA olacak şekilde seçildi, yoksa yine görünmezler.
          pointerEvents ZORUNLU: kutunun dışına taşar; tıklamayı yutarsa alttaki düğmeler ölür. */}
      <span aria-hidden="true" style={{ position: "absolute", inset: "-24%", pointerEvents: "none", borderRadius: "50%", background: `radial-gradient(circle, ${T} 0%, ${T} 52%, transparent 78%)`, filter: "blur(38px)", opacity: .11 }} />
      {/* Halo — rAF opacity sürer; çekirdeğin hue'sunda, dar. */}
      <span ref={haloRef} aria-hidden="true" style={{ position: "absolute", inset: "-15%", pointerEvents: "none", borderRadius: "50%", background: `radial-gradient(circle, ${GOK} 0%, ${GOK} 52%, ${T} 68%, transparent 82%)`, filter: "blur(20px)", opacity: .3 }} />
      {/* Küre — rAF scale + clipPath sürer. İÇ GÖLGE YOK (bkz. üstteki tasarım ilkesi).
          willChange clip-path'i de SAYAR: path() basit-şekil optimizasyonuna girmiyor, her
          karede maske olarak uygulanıyor; beyan edilmezse alt ağaç (blur + blend) boşuna
          yeniden boyanır. */}
      <span ref={orbRef} aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", willChange: "transform, clip-path" }}>
        {/* Taban: merkezden dışa açılan ışık.
            İKİ ÖLÇÜLMÜŞ HATA DÜZELTİLDİ:
            · `closest-side` ZORUNLU. Varsayılan `farthest-corner` menzili ~154 px olurken
              kürenin görünür yarıçapı yalnız ~80 px — yani duraklarının %60'ından sonrası
              HİÇ RENDER EDİLMİYORDU. Eski sürümün "koyu kenar" durakları (V %74, siyah %100)
              tam da bu yüzden ölü koddu; ekrandaki tek-renklilik buradan geliyordu.
            · Aynı rengi iki durakta tekrarlamak (eski: T %0 ve T %34) merkezde DÜPEDÜZ bir
              plato yaratıyor ve görünür yüzün ~yarısında hacim duygusunu öldürüyordu.
            En dış durak SAYDAMA gider: gövde kenarı kapanan koyu bir hatla bitmez, hâlenin
            içine sızar. Kapanan hat silüet çizer ve cismi katılaştırırdı.
            HUE ANİMASYONU KALDIRILDI: 13 sn'de 20° dönüş = ~1,5°/sn. Doygun bir turkuazı 20°
            döndürmek onu hâlâ turkuaz bırakıyor ve yan yana referans olmadan fark edilmiyor
            (ölçüldü) — buna karşılık filtrelenen katman her karede yeniden boyanıyordu.
            Algılanmayan bir efekt için ödenen bedel. İç canlılık artık gerçekten görünen
            şeyden geliyor: aşağıdaki blob'ların açık/koyu çalkantısı. */}
        <span style={{ position: "absolute", inset: 0, background: `radial-gradient(circle closest-side at 50% 47%, ${GOK_UST} 0%, ${GOK} 18%, ${T} 40%, color-mix(in srgb, ${V} 62%, ${T}) 60%, color-mix(in srgb, ${T} 70%, ${GOK}) 80%, color-mix(in srgb, ${GOK} 62%, transparent) 100%)` }} />
        {/* Dönen sıvı blob'lar — iç akış.
            BLEND KARIŞIMI KASITLI: eski sürümde hareketli katmanların HEPSİ `screen`'di ve
            screen yalnız AÇAR (sonuç ≥ max(a,b)). Sonuç iki katlıydı — (a) hiçbir katman iç
            kontrast üretemiyordu, kürenin görünen tüm kontrastı statikti; (b) doygun renkler
            soluyordu: screen(#2f8fa6,#8e3d66) = #a3aac9, yani mühür moru soluk lavantaya
            çöküyordu ve MERCAN hiç görünmüyordu. Şimdi erik blob'u `overlay` ile KOYULTUYOR:
            açık-koyu bölgeler birbirine göre geziniyor — canlılık tam olarak bu. */}
        <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${GOK_UST} 0%, transparent 56%)`, filter: "blur(22px)", mixBlendMode: "screen", opacity: .75, animation: anim("ke-orb-b 21s linear infinite") }} />
        <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${GOK} 0%, transparent 52%)`, filter: "blur(26px)", mixBlendMode: "screen", opacity: .7, animation: anim("ke-orb-a 16s linear infinite") }} />
        {/* Erik katmanı KOYULTUR (overlay) — ama düşük opaklıkta ve geniş: yüksek opaklıkta
            tek yönde toplanıp yarım-ay bir gölge çiziyordu, yani kaldırdığımız "aydınlatılmış
            küre" okumasını başka yönden geri getiriyordu. Amaç gölge değil, iç çalkantı. */}
        {/* İKİ erik katmanı, KARŞI YÖNDE dönen: tek katman yörüngesinin bulunduğu yarıyı
            sistematik koyultuyordu (ölçüldü: üst/alt ortalama farkı ~20 L). Karşı-fazlı ikinci
            katman bu yönlü bileşeni büyük ölçüde söndürüyor ama çalkantıyı korumak için
            farklı periyotta koşuyor — eşit periyot olsaydı ikisi kilitlenip donuk bir maske
            oluştururdu. */}
        <span style={{ position: "absolute", inset: "-18%", background: `radial-gradient(circle at 50% 50%, ${V} 0%, transparent 58%)`, filter: "blur(38px)", mixBlendMode: "overlay", opacity: .17, animation: anim("ke-orb-c 30s linear infinite") }} />
        <span style={{ position: "absolute", inset: "-18%", background: `radial-gradient(circle at 50% 50%, ${V} 0%, transparent 58%)`, filter: "blur(38px)", mixBlendMode: "overlay", opacity: .17, animation: anim("ke-orb-c 23s linear infinite reverse") }} />
        {/* Dönen ışık süpürmesi (conic) — yüzeyde gezinen enerji. Eski sürümde bu katmanın
            üstünde %90 alfalı sabit bir "sheen" duruyordu ve tam da hareketin yoğunlaştığı
            merkez–sol bölgeyi örtüyordu; sheen kaldırıldı, süpürme artık görünür. */}
        <span aria-hidden="true" style={{ position: "absolute", inset: "-8%", borderRadius: "50%", background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, ${GOK_UST} 62%, transparent) 26deg, transparent 70deg, transparent 200deg, color-mix(in srgb, ${T} 55%, transparent) 236deg, transparent 300deg)`, filter: "blur(12px)", mixBlendMode: "screen", opacity: .5, animation: anim("nu-spin 8s linear infinite") }} />
        {/* ÇEKİRDEK PARLAMASI — rAF opacity sürer (genliğe bağlı). Durum dilinin asıl taşıyıcısı:
            "Yanıtlıyor" ile "Hazır" arasındaki fark artık kenar biçimi değil PARLAKLIK; bu,
            ses seviyesinin göze en hızlı ulaşan karşılığı ve bakışta okunuyor. */}
        <span ref={parlaRef} aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(circle closest-side at 50% 47%, ${GOK_UST} 0%, color-mix(in srgb, ${GOK_UST} 50%, transparent) 24%, transparent 52%)`, mixBlendMode: "screen", opacity: .1 }} />
        {/* Grain */}
        <span style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: .09, mixBlendMode: "overlay" }} />
        {/* KENAR IŞIĞI ARTIK GRADYANIN KENDİSİNDE (yukarıdaki %80 durağı), ayrı bir inset
            gölgede DEĞİL. Neden: inset gölge KUTUNUN dairesine (r≈105 px) yaslanır, oysa
            gövde clip-path ile r≈80 px'te kesiliyor — yani o ışık halkasının tamamı kırpılan
            bölgede kalıyor ve HİÇ GÖRÜNMÜYORDU (ölçüldü: kaldırınca metrik değişmedi).
            Gradyan durağı ise clip'le birlikte ölçekleniyor, her genlikte kenarda kalıyor. */}
      </span>
    </>
  );
}
