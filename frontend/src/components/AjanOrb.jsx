/* AjanOrb — canlı işlem sahnesinin BEYNİ. Sesli görüşme orb'unun aynı görsel gövdesi
   (SesliOrb + lib/orbCizim), bu kez mikrofon yerine PIPELINE tarafından sürülür.

   NEDEN BURADA: sahnenin daha önce tek bir kıvılcım ikonu vardı; koşumun "kim yürütüyor"
   sorusunun görsel bir öznesi yoktu. Orb ürünün maskotu ve beyni — işin nerede olduğunu
   tek bakışta anlatan özne. Sesli sahnede zaten ölçülmüş, ayarlanmış bir gövdesi var;
   ikinci bir görsel dil icat etmek yerine AYNISI yeniden kullanılır (tek maskot, tek dil).

   ÜÇ HAREKET — HEPSİ ANLAM TAŞIR AMA HİÇBİRİ TEK KANAL DEĞİL. Orb koşumun İKİNCİL,
   yedekli görsel anlatımıdır: aktif adım, ilerleme yüzdesi ve hata durumu her zaman
   orb'un DIŞINDA da verilir (üst çubuk çipi + yüzde barı + SahneAkis istasyon listesi +
   aria-live bölgesi). Bu yüzden gövde aria-hidden ve reduced-motion'da hareketsiz
   kalabiliyor. Buradan bir hareket sökülürse hiçbir bilgi kaybolmaz — AMA tersi de
   geçerli: buraya yalnız burada var olan bir bilgi EKLENMEMELİ, eklenirse orb dekoratif
   olmaktan çıkar ve aria-hidden ile reduced-motion sözleşmeleri ikisi birden bozulur.

   1. DURUM — Görev 1 çalışırken düşünme halkaları, Görev 2'de en parlak çekirdek, adımlar
      arasında uyanık ama sessiz, boşta sakin. Eşleme lib/orbEnerji.orbDurumu'nda, testli.
   2. YUTMA — biten adım orb'un altında BELİRİR, okunacak kadar SABİT DURUR, sonra içeri
      çekilir; vardığı an gövde parlar ve bir halka dışa açılır. Ayrıntı aşağıda.
   3. SEVK — yeni adım başlayınca orb aşağıya, akışa doğru bir ışık bırakır: görevi verdi.

   YUTMA JESTİ — ÜÇ VURUŞ, TEK KUYRUK (7 Ağu 2026 revizyonu):
   İlk sürüm etiketi tek sürekli uçuşla orb'a taşıyordu ve OKUNMUYORDU (kullanıcı bulgusu):
   okunması gereken metin okunduğu sırada hareket hâlindeydi, hızlı koşumda da birden çok
   etiket üst üste biniyordu. Okunabilirlik hareketi yavaşlatmakla değil DURGUNLUKLA gelir.
   Şimdi her adım sırayla (kuyrukta) tek tek işlenir ve üç vuruş yaşar:
     · BELİR  — orb'un altında, hâlenin dışında maddeleşir (opacity + hafif ölçek; 0'dan
                DEĞİL .94'ten — hiçlikten belirmez).
     · DUR    — hiçbir şey kıpırdamaz. Bilgiyi taşıyan tek vuruş budur.
     · ÇEKİL  — orb tarafından yutulur: yükselir, küçülür, son anda bulanıklaşarak gövdeye
                karışır (blur, iki ayrı nesne görünmesin diye).
   Süreler lib/orbEnerji.yutmaTempo'da ve TESTLİ: kuyruk uzayınca jest hızlanır ama sabit
   durma süresi BEKLE_TABAN'ın altına İNMEZ. Sıkışma hızla değil, arkada biriken görünür
   kuyrukla anlatılır — hızlandırarak çözmek tam da düzeltilen hatayı geri getirirdi.
   Mekanizma keyframe DEĞİL transition: vuruşlar arası geçiş kesilebilir ve yeniden
   hedeflenebilir (emil-design-eng: hızlı tetiklenen UI'da keyframe sıfırdan başlar).

   ÖLÇÜ SÖZLEŞMESİ: kap KARE ve SABİT px olmalı (BOYUT) — orbCizim'in sıvı kenarı px
   geometrisiyle çalışır, yüzdeyle esneyen bir kutuda blob yarıçapı ile clip kutusu ayrışır.
   Alt LANE parçacıkların uçuş şeridi: rezerve edilmezse etiket alttaki başlığın üstüne biner.
   YER_BEKLE, hâlenin (inset -15% → yarıçap ≈0.65·BOYUT) DIŞINDA seçilmiştir; içeride
   kalsaydı etiket orb'un ışığı üstünde okunurluğunu kaybederdi.

   a11y: tamamı aria-hidden — koşum ilerlemesi zaten üst çubuktaki yüzde ve aria-live
   bölgesiyle veriliyor; orb ikinci (ve yalnız görsel) bir kanal olurdu. reduced-motion'da
   rAF hiç başlamaz, etiket kuyruğu hiç işlemez; orb statik dairesine oturur ama durum
   tabanları (parlaklık/hâle) KALIR — onlar hareket değil, durumun rengidir. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import SesliOrb from "./SesliOrb.jsx";
import { orbKare } from "../lib/orbCizim.js";
import { orbDurumu, enerjiSonraki, yutmaKarari, yutmaTempo, kuyrugaEkle } from "../lib/orbEnerji.js";
import { T, V, PAL, BANT, DERIN_OF, TYPE, RAD, SH } from "./neonUi.jsx";

const BOYUT = 132;
// Etiketin durduğu şerit. Ölçü: durma yeri 96px + etiket yüksekliği (~32px) + arkadaki iki
// hayaletin kaydırması (16px) tam sığmalı — dar bırakılırsa yığının altı alttaki başlığa taşar.
const LANE = 78;
const HALKA_R = 46;           // ilerleme halkası yarıçapı (100'lük viewBox)
const CEVRE = 2 * Math.PI * HALKA_R;
const ILK_KARE = 32;          // "belir" stilinin bir kare uygulanması için gereken gecikme

/* Üç vuruşun görsel değerleri. YER_BEKLE (96px) hâlenin dışıdır — etiket orb'un ışığının
   üstünde değil, temiz zeminde durur. YER_GIRIS ondan 12px aşağıda: maddeleşme sırasında
   minik bir yükselme var, ama şeridi taşıracak kadar değil. */
const YER = { belir: 108, dur: 96, cekil: 0 };
const OLCEK = { belir: 0.94, dur: 1, cekil: 0.34 };
const OPAK = { belir: 0, dur: 1, cekil: 0 };
const BULANIK = { belir: 0, dur: 0, cekil: 3 };

const azHareketMi = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

export default function AjanOrb({ display = [], kosumda = false, hataVar = false }) {
  const orbRef = useRef(null);
  const haloRef = useRef(null);
  const parlaRef = useRef(null);
  const rafRef = useRef(0);
  const sonTsRef = useRef(0);
  const enerjiRef = useRef(0);
  const vurusRef = useRef(0);          // rAF'ın bir sonraki karede tüketeceği tamamlanma sayısı
  const durumRef = useRef("hazir");
  const kosumdaRef = useRef(false);
  const azRef = useRef(azHareketMi());
  const gorulenRef = useRef(new Set());
  const sonBitenRef = useRef(0);       // bir önceki karede tamamlanmış görünen adım sayısı
  const ilkKareRef = useRef(true);
  const sayacRef = useRef(0);

  const [az, setAz] = useState(azHareketMi);
  const [kuyruk, setKuyruk] = useState([]);    // yutulmayı bekleyen adımlar (FIFO)
  const [aktif, setAktif] = useState(null);    // o an sahnedeki tek etiket + temposu
  const [faz, setFaz] = useState("belir");
  const [yutum, setYutum] = useState(0);       // yutma halkasını remount eden sayaç

  const aktifAdim = display.find((a) => a.status === "active") || null;
  const aktifGorev = aktifAdim ? aktifAdim.gorev : null;
  const durum = orbDurumu({ kosumda, aktifGorev, hataVar });
  const bitenSayi = display.filter((a) => a.status === "done").length;
  const oran = display.length ? bitenSayi / display.length : 0;
  const tamam = display.length > 0 && bitenSayi === display.length;
  // Halka rengi = o an yürüyen fazın rengi; koşum bitince yeşil, hata varsa kırmızı.
  // Renk TEK sinyal değil: halka dolgusu (uzunluk) aynı bilgiyi biçimle de taşır.
  const col = hataVar ? BANT.kirmizi.c : tamam ? BANT.yesil.c : aktifGorev === 2 ? V : T;

  durumRef.current = durum;
  kosumdaRef.current = kosumda;

  // Tek yazma noktası — rAF de, statik yol da aynı üç katmanı sürer (SesliOrb sözleşmesi:
  // gövde transform+clipPath, hâle opacity, çekirdek parlaması opacity).
  const yazKare = useCallback((kare) => {
    if (orbRef.current) {
      orbRef.current.style.transform = `scale(${kare.scale.toFixed(4)})`;
      orbRef.current.style.clipPath = kare.clipPath;
    }
    if (haloRef.current) haloRef.current.style.opacity = kare.haloOpacity.toFixed(3);
    if (parlaRef.current) parlaRef.current.style.opacity = kare.parlaklik.toFixed(3);
  }, []);

  // reduced-motion canlı izlenir: kullanıcı ayarı koşum ortasında değişirse rAF de değişir.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const din = (e) => { azRef.current = e.matches; setAz(e.matches); };
    mq.addEventListener?.("change", din);
    return () => mq.removeEventListener?.("change", din);
  }, []);

  // rAF döngüsü — React state'ine DOKUNMAZ; değerler doğrudan style'a yazılır (kare başına
  // render yok). Bağımlılık YALNIZ `az`: durum ve koşum ref üzerinden okunur, yoksa her adım
  // geçişinde döngü sökülüp yeniden kurulurdu (enerji zarfı sürekliliğini kaybederdi).
  useEffect(() => {
    if (az) return undefined;
    const dongu = (ts) => {
      const dt = sonTsRef.current ? ts - sonTsRef.current : 16;
      sonTsRef.current = ts;
      const vurus = vurusRef.current;
      vurusRef.current = 0;
      enerjiRef.current = enerjiSonraki(enerjiRef.current, dt, { vurus, kosumda: kosumdaRef.current });
      yazKare(orbKare({ boyut: BOYUT, seviye: enerjiRef.current, ts, azHareket: false, durum: durumRef.current }));
      rafRef.current = requestAnimationFrame(dongu);
    };
    rafRef.current = requestAnimationFrame(dongu);
    return () => { cancelAnimationFrame(rafRef.current); sonTsRef.current = 0; };
    // yazKare useCallback([]) ile sabittir — döngüyü yeniden kurmaz.
  }, [az, yazKare]);

  // Hareket kısıtlıyken rAF hiç koşmaz — ama durum tabanları (parlaklık/hâle) yine
  // uygulanmalı: onlar hareket değil, durumun rengidir. Tek statik kare, durum değişince.
  useEffect(() => {
    if (!az) return;
    yazKare(orbKare({ boyut: BOYUT, seviye: 0, ts: 0, azHareket: true, durum }));
  }, [az, durum, yazKare]);

  // Tamamlanan adımları KUYRUĞA al (doğrudan sahneye değil — sahnede daima tek etiket var).
  useEffect(() => {
    // MOUNT ANI TOHUMLAMASI — useSahneTempo'nun aynı sınıftan hatası burada da geçerli:
    // memur başka görünüme geçip koşum sürerken geri döndüğünde bileşen yeniden mount olur
    // ve o ana dek bitmiş TÜM adımlar "yeni bitmiş" sayılırdı; orb sahte bir yutma
    // salvosu oynatırdı. Mount'ta zaten bitmiş olanlar görülmüş kabul edilir.
    if (ilkKareRef.current) {
      ilkKareRef.current = false;
      gorulenRef.current = new Set(display.filter((a) => a.status === "done").map((a) => a.id));
      sonBitenRef.current = gorulenRef.current.size;
      return;
    }
    // Sıfırlama kararı saf katmanda (lib/orbEnerji.yutmaKarari) ve TESTLİ: sinyalin neden
    // kimlik değil SAYI olması gerektiği oradaki yorumda — paralel dallarda kimlik-tabanlı
    // kontrol koşum sağlamken defteri siliyordu.
    const karar = yutmaKarari(gorulenRef.current, sonBitenRef.current, display);
    sonBitenRef.current = karar.bitenSayi;
    if (karar.sifirla) {
      gorulenRef.current = new Set();
      // Sahne ve kuyruk boşaltılır; havadaki zamanlayıcıları aşağıdaki vuruş effect'inin
      // kendi cleanup'ı temizler (aktif → null onu söker), ayrı bir defter tutulmasına
      // gerek kalmaz.
      setKuyruk([]);
      setAktif(null);
      return;
    }
    if (!karar.yeni.length) return;
    // DEFTER HER HÂLÜKÂRDA İŞLENİR — sahne kurulmasa bile. Sıra kritik: `az` kontrolünden
    // ÖNCE. Aksi hâlde hareket kısıtlıyken biten adımlar "görülmemiş" kalır ve kullanıcı
    // ayarı koşum ortasında kapatırsa dakikalar önce bitmiş adımlar tek seferde "yeni bitmiş"
    // gibi kuyruğa dolar (inceleme bulgusu — kod, kendi yorumuyla çelişiyordu).
    karar.yeni.forEach((a) => gorulenRef.current.add(a.id));
    if (azRef.current) return;   // hareket kısıtlı: defter işlendi, sahne kurulmaz
    setKuyruk((k) => kuyrugaEkle(k, karar.yeni.map((a) => ({
      anahtar: `${a.id}-${sayacRef.current++}`,
      label: a.label || a.id,
      col: a.gorev === 2 ? V : T,
    }))));
  }, [display]);

  // Kuyruktan sahneye — sahnede yer boşaldığı anda sıradaki etiket alınır. Tempo o ANDAKİ
  // sıkışıklığa göre hesaplanır (kalan kuyruk), yani birikme arttıkça jest hızlanır.
  // useLayoutEffect ZORUNLU (passive useEffect DEĞİL): sıradaki etiket ancak `aktif` null'dan
  // geçtikten sonra alınabiliyor, yani sahne bir an boş kalıyor. Passive effect boyamadan
  // SONRA boşaltıldığından tarayıcı o boş kareyi gerçekten çizip iki etiket arasında görünür
  // bir boşluk bırakıyordu; layout effect commit ile boyama arasında koştuğu için devrediş
  // hiç ekrana yansımaz. Effect gövdesi ucuz (tek dizi kopyası) — boyamayı geciktirmez.
  useLayoutEffect(() => {
    if (aktif || !kuyruk.length) return;
    setAktif({ ...kuyruk[0], tempo: yutmaTempo(kuyruk.length - 1) });
    setFaz("belir");
    setKuyruk((k) => k.slice(1));
  }, [aktif, kuyruk]);

  // Üç vuruşun zamanlaması. Bağımlılık yalnız `aktif`: faz ayrı state'te tutulur, yoksa her
  // vuruşta effect yeniden koşar ve kendi zamanlayıcılarını iptal ederdi.
  useEffect(() => {
    if (!aktif) return undefined;
    const { giris, bekle, cek } = aktif.tempo;
    const durBasi = ILK_KARE + giris;
    const cekilBasi = durBasi + bekle;
    const zam = [
      setTimeout(() => setFaz("dur"), ILK_KARE),
      setTimeout(() => setFaz("cekil"), cekilBasi),
      // Vuruş ÇEKİLİŞİN SONUNA yakın: gövde parlaması etiket yüzeye değdiği an olmalı.
      // az kontrolü ateşleme anında da yapılır — uçuş sırasında hareket kısıtlanmış olabilir.
      setTimeout(() => {
        if (azRef.current) return;
        vurusRef.current += 1;
        setYutum((y) => y + 1);
      }, cekilBasi + cek * 0.82),
      setTimeout(() => setAktif(null), cekilBasi + cek),
    ];
    return () => zam.forEach(clearTimeout);
  }, [aktif]);

  const etiketTaban = {
    position: "absolute", left: "50%", top: BOYUT / 2, pointerEvents: "none",
    whiteSpace: "nowrap", maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis",
    padding: "5px 13px", borderRadius: RAD.chip, background: PAL.surf,
    border: `1px solid ${PAL.line}`, ...TYPE.ui, fontWeight: 600,
  };
  const gecis = aktif && {
    belir: "none",
    dur: `transform ${aktif.tempo.giris}ms var(--ke-ease-out), opacity ${aktif.tempo.giris}ms var(--ke-ease-out)`,
    cekil: `transform ${aktif.tempo.cek}ms var(--ke-ease-in-out), opacity ${aktif.tempo.cek}ms var(--ke-ease-in-out), filter ${aktif.tempo.cek}ms var(--ke-ease-in-out)`,
  }[faz];

  return (
    <div aria-hidden="true" style={{ position: "relative", width: BOYUT, height: BOYUT + LANE, flexShrink: 0 }}>
      {/* Orb gövdesi — SesliOrb'un kendi katman sözleşmesi: kap 1:1 ve position:relative. */}
      <div style={{ position: "absolute", top: 0, left: 0, width: BOYUT, height: BOYUT }}>
        <SesliOrb dusunuyor={durum === "dusunuyor"} azHareket={az}
          orbRef={orbRef} haloRef={haloRef} parlaRef={parlaRef} />
        {/* Yutma halkası — etiket gövdeye değdiği anda dışa açılan tek atım. key=yutum:
            her yutumda remount → vuruş tam o anda oynar (CSS animasyonu yeniden başlar). */}
        {yutum > 0 && !az && (
          <span key={yutum} style={{ position: "absolute", inset: "14%", borderRadius: RAD.dot, border: `1.5px solid ${DERIN_OF(col)}`, animation: "nu-halka .7s var(--ke-ease-out) both", pointerEvents: "none" }} />
        )}
        {/* İlerleme halkası — orb kaç adımı yuttu. Dolgu UZUNLUKLA da okunur, renk tek
            sinyal değil. Dış yarıçap düşünme halkalarının söndüğü yerin hemen dışında. */}
        <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: "-15%", transform: "rotate(-90deg)", pointerEvents: "none", overflow: "visible" }}>
          <circle cx="50" cy="50" r={HALKA_R} fill="none" stroke={PAL.line} strokeWidth="1.6" />
          <circle cx="50" cy="50" r={HALKA_R} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round"
            strokeDasharray={CEVRE} strokeDashoffset={CEVRE * (1 - oran)}
            style={{ transition: "stroke-dashoffset .45s var(--ke-ease-out), stroke .3s ease" }} />
        </svg>
      </div>

      {/* SEVK — aktif adım değişince orb aşağıya, akışa doğru ışık bırakır. key=id:
          remount animasyonu bir kez oynatır, state gerekmez. */}
      {kosumda && !az && aktifAdim && (
        <span key={`sevk-${aktifAdim.id}`} aria-hidden="true" style={{
          position: "absolute", left: "50%", top: BOYUT / 2, width: 9, height: 9,
          marginLeft: -4.5, borderRadius: RAD.dot, pointerEvents: "none", opacity: 0,
          background: aktifGorev === 2 ? V : T,
          animation: "ke-orb-sevk 620ms var(--ke-ease-out) both",
        }} />
      )}

      {/* BEKLEYEN KUYRUK — sahnedeki etiketin arkasında hafifçe kaydırılmış hayaletler.
          Sıkışıklığı hızla değil GÖRÜNÜRLÜKLE anlatır: "arkada iki adım daha var" bilgisi,
          jesti okunamayacak kadar hızlandırmadan verilir. En çok iki tane — üçüncüsü yığını
          okunmaz bir merdivene çevirirdi. */}
      {!az && kuyruk.slice(0, 2).map((g, i) => (
        <span key={g.anahtar} style={{
          ...etiketTaban,
          color: PAL.mut2,
          boxShadow: SH.card,
          transform: `translate(-50%, ${YER.dur + 8 * (i + 1)}px) scale(${0.95 - i * 0.05})`,
          opacity: 0.42 - i * 0.18,
        }}>{g.label}</span>
      ))}

      {/* SAHNEDEKİ ETİKET — belir · dur · çekil. Yığının üstünde (kuyruktan sonra render). */}
      {aktif && !az && (
        <span style={{
          ...etiketTaban,
          color: DERIN_OF(aktif.col),
          boxShadow: SH.pop,
          transform: `translate(-50%, ${YER[faz]}px) scale(${OLCEK[faz]})`,
          opacity: OPAK[faz],
          filter: BULANIK[faz] ? `blur(${BULANIK[faz]}px)` : "none",
          transition: gecis,
        }}>{aktif.label}</span>
      )}
    </div>
  );
}
