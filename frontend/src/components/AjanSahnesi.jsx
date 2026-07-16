/* AjanSahnesi — AuthPage hero'sunun demo yıldızı: bir A4 evrağın 16 ajanlı boru hattından
   CANLI geçişi. Sol: taranan A4 belge (sweep beam + OCR satır pırıltısı). Sağ: 16 ajanın canlı
   durum rayı — her ajanın NE YAPTIĞI yazılı. Belgenin üzerinde: çıkarılan veri kabarcıkları
   (tür/birim/risk) düğüm ilerledikçe belirir. Bir belge havuzu (BELGELER) sonsuz döngüde işlenir;
   her belgede içerik değişir (evrak no · dosya · tür/birim · mevzuat · sha).
   FİNAL KOREOGRAFİSİ (faz makinesi): tarama biter → MÜHÜR basılır (mühür moru, V) → kağıt
   KATLANIR (üçe) → ZARF'a girer (arka gövde + kapanan kapak) → zarf SOLA UÇAR ve kaybolur;
   ardından sıradaki belge aşağıdan girer. Gerçek veri DEĞİL — aria-hidden salt-sunum demo.
   Faz geçişleri kendi kendini zamanlayan setTimeout zinciriyle (React state); beam + satır
   pırıltısı + mühür/kapak bağımsız CSS @keyframes; katlama/uçuş CSS transition.
   prefers-reduced-motion: zamanlayıcı hiç başlamaz, mühürlü tamamlanmış kare sabit gösterilir —
   global reduced-motion kuralı CSS animasyonlarını da söndürür. */
import { useEffect, useState } from "react";
import { MONO, SANS, T, V, R, PAL, DERIN, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon } from "./neonUi.jsx";

// 16 çekirdek node — her biri "ne yaptığını anlatan" kısa not ile (graph.py topolojisiyle hizalı).
const AJANLAR = [
  { id: "oku", ad: "Oku", not: "OCR + metin çıkarımı" },
  { id: "siniflandir", ad: "Sınıflandır", not: "Evrak türü" },
  { id: "cikar", ad: "Bilgi çıkar", not: "Kişi · tarih · sayı" },
  { id: "eksik_tespit", ad: "Eksik tespit", not: "Zorunlu alanlar" },
  { id: "decompose", ad: "Konu ayır", not: "Çok konulu ayrıştır" },
  { id: "mevzuat_oner", ad: "Mevzuat öner", not: "İlgili maddeler" },
  { id: "ozetle", ad: "Özetle", not: "Yönetici özeti" },
  { id: "route_birim", ad: "Birim yönlendir", not: "Sorumlu birim" },
  { id: "yazi_taslak", ad: "Yazı taslağı", not: "Resmî üslup" },
  { id: "verify", ad: "Doğrula", not: "İddia · kanıt" },
  { id: "risk_guard", ad: "Risk bandı", not: "Yayın güvenliği" },
  { id: "kanit_baglama", ad: "Kanıt bağla", not: "Kaynak izleme" },
  { id: "sdp_kod", ad: "SDP kodu", not: "Saklama planı" },
  { id: "denetim_izi", ad: "Denetim izi", not: "SHA-256 zinciri" },
  { id: "clarifier", ad: "Netleştir", not: "Eksik bilgi iste" },
  { id: "finalize", ad: "Tamamla", not: "İmzaya hazır" },
];
const N = AJANLAR.length;
const A4_W = 280, A4_H = 396;
// Faz süreleri (ms): giriş · düğüm adımı · mühür beklemesi · katlanma · zarfa girme · sola uçuş.
const GIRIS = 440, TICK = 440, MUHUR = 900, KATLA = 650, ZARF = 780, UCUS = 720;

// Belge havuzu — her döngüde sıradakine geç, sona gelince başa dön (sonsuz). İçerik farklı:
// evrak no · dosya adı → başlık; tür/birim → kabarcık + "Sınıflandır" notu; mevzuat →
// "Mevzuat öner" notu; sha → alt bilgi. Gerçek veri DEĞİL, salt-sunum kurgu.
const BELGELER = [
  { evrak: "E-2026/1449", dosya: "kep_bildirim.eyp", tur: "KEP bildirimi", birim: "Yazı İşleri", mevzuat: "BEYD Yönetmeliği · 1 kaynak", sha: "c37a5510_e2b8" },
  { evrak: "E-2026/1502", dosya: "dilekce_basvuru.udf", tur: "Dilekçe", birim: "İnsan Kaynakları", mevzuat: "4982 Bilgi Edinme K. · 2 kaynak", sha: "a91f0d34_77bc" },
  { evrak: "E-2026/1517", dosya: "ihale_teklif.pdf", tur: "İhale teklifi", birim: "Destek Hizmetleri", mevzuat: "4734 Kamu İhale K. · 3 kaynak", sha: "3e8b12aa_04d1" },
  { evrak: "E-2026/1533", dosya: "resmi_yazi.eyp", tur: "Gelen evrak", birim: "Hukuk İşleri", mevzuat: "2577 İYUK · 1 kaynak", sha: "7c44e9f0_be25" },
];
// A4 gövde satır genişlikleri (%). 0 = paragraf boşluğu.
const SATIRLAR = [90, 74, 0, 84, 96, 68, 88, 0, 92, 60, 82, 70];
// Belge üzerinde beliren çıkarım kabarcıkları — hangi düğümden SONRA görünür + konum (A4 içi, px).
const KABARCIKLAR = [
  { sonra: 2, etiket: "Tür", alan: "tur", yer: { top: 46, left: 118 } },
  { sonra: 7, etiket: "Birim", alan: "birim", yer: { top: 176, left: 108 } },
  { sonra: 11, etiket: "Risk", deger: "YEŞİL", bant: true, yer: { top: 306, left: 126 } },
];

const KEYFRAMES = `
@keyframes as-tarama{0%{transform:translateY(-44px)}100%{transform:translateY(${A4_H + 8}px)}}
@keyframes as-oku{0%,72%,100%{background:var(--ke-press)}16%{background:color-mix(in srgb, ${T} 44%, var(--ke-press))}}
@keyframes as-giris{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes as-muhur{0%{opacity:0;transform:translate(-50%,-50%) scale(1.9) rotate(-16deg)}55%{opacity:1}100%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-9deg)}}
@keyframes as-zarf-gel{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes as-kapak{from{transform:rotateX(-168deg)}to{transform:rotateX(0deg)}}
`;
const ISIN_ZEMIN = `linear-gradient(180deg, transparent, color-mix(in srgb, ${T} 20%, transparent) 62%, color-mix(in srgb, ${T} 55%, transparent))`;
// Zarf — manila/kraft palet (dekoratif illüstrasyon; tema token'ı değil, tıpkı tarama ışını gibi
// bilinçli yerel renk). Mum mühür = imza mercanı R (tema token'ı).
const ZARF_GOVDE = "#dcc9a4", ZARF_KAPAK = "#ccb384", ZARF_KENAR = "#b1965f";

function useAzHareket() {
  const [az, setAz] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setAz(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return az;
}

// Mühür — bitince kağıda basılan yuvarlak ıstampa (mühür moru V, çift halka + onay). Kağıdın
// çocuğu: katlanınca onunla birlikte sıkışır (gerçekçi). az → animasyonsuz, statik basılı.
function Muhur({ az }) {
  return (
    <div aria-hidden="true" key="muhur" style={{ position: "absolute", top: "50%", left: "50%", width: 96, height: 96, zIndex: 4, color: V, transform: "translate(-50%,-50%) rotate(-9deg)", animation: az ? "none" : "as-muhur .5s ease-out both" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2.5px solid ${V}`, opacity: 0.9 }} />
      <span style={{ position: "absolute", inset: 8, borderRadius: "50%", border: `1px solid ${V}`, opacity: 0.6 }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".6px", opacity: 0.85 }}>T.C.</span>
        <Icon.check width={24} height={24} />
        <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: ".5px", opacity: 0.85 }}>ONAYLANDI</span>
      </span>
    </div>
  );
}

// Zarf — katlı mektubu tam-opak kraft ön yüzle örten mektup zarfı (z3, kağıdın önünde). Ön yüz
// köşe dikişleri (alt köşeler → kapak ucu) + üstten 3B kapanan kapak + kapak ucunda kırmızı mum
// mühür. Ön yüz opak olduğundan yan boşluk/sızıntı yok — net "zarf" okunur.
function Zarf() {
  const top = 118, h = 168, flapH = 106, tip = flapH; // kapak ucu (mum mühür konumu)
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top, height: h, zIndex: 3, perspective: 800, animation: "as-zarf-gel .4s ease-out both", filter: `drop-shadow(0 6px 14px rgba(60,45,20,.22))` }}>
      {/* Ön yüz — tam opak kraft gövde + köşe dikiş hatları */}
      <div style={{ position: "absolute", inset: 0, background: ZARF_GOVDE, border: `1.5px solid ${ZARF_KENAR}`, borderRadius: RAD.ctl, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${A4_W} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
          <line x1="6" y1={h - 6} x2={A4_W / 2} y2={tip} stroke={ZARF_KENAR} strokeWidth="1.25" opacity=".75" />
          <line x1={A4_W - 6} y1={h - 6} x2={A4_W / 2} y2={tip} stroke={ZARF_KENAR} strokeWidth="1.25" opacity=".75" />
        </svg>
      </div>
      {/* Kapak — üstten kapanan koyu kraft üçgen (3B) */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: flapH, transformOrigin: "top center", clipPath: "polygon(0 0, 100% 0, 50% 100%)", background: ZARF_KAPAK, borderRadius: `${RAD.ctl}px ${RAD.ctl}px 0 0`, boxShadow: `inset 0 -1px 0 ${ZARF_KENAR}`, animation: "as-kapak .55s .15s ease-out both", backfaceVisibility: "hidden" }} />
      {/* Mum mühür — kapak ucunda, kapak kapandıktan sonra basılır */}
      <span style={{ position: "absolute", left: "50%", top: tip - 9, marginLeft: -9, width: 18, height: 18, borderRadius: "50%", background: R, border: `1px solid color-mix(in srgb, ${R} 55%, #000)`, boxShadow: `0 1px 2px rgba(60,45,20,.35)`, animation: "nu-pop .3s .6s var(--ke-ease-out) both" }} />
    </div>
  );
}

// A4 belge sahnesi — kağıt (üst şerit + başlık + gövde OCR pırıltısı) + tarama ışını + mühür +
// zarf. Kağıt mühürden sonra KATLANIR (scaleY transition); tüm sahne UÇUŞ'ta sola kayıp solar.
function Belge({ belge, bitti, isliyor, katli, zarfli, ucus, az }) {
  return (
    <div style={{ flex: `0 0 ${A4_W}px`, position: "relative", height: A4_H, perspective: 900, willChange: "transform, opacity",
      transform: ucus ? "translateX(-480px) rotate(-10deg)" : "translateX(0) rotate(0)", opacity: ucus ? 0 : 1,
      transition: ucus ? "transform .7s cubic-bezier(.55,.06,.9,.3), opacity .7s ease-out" : "none" }}>
      {/* Kağıt — katlanınca üçe iner (scaleY .34, merkez orijin). z: zarfa girerken arka gövde
          ile kapak arasında kalır (z2). */}
      <div style={{ position: "relative", height: A4_H, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, boxShadow: SH.card, overflow: "hidden", transformOrigin: "center", zIndex: 2,
        transform: katli ? "scaleY(.34)" : "scaleY(1)", transition: "transform .6s cubic-bezier(.7,0,.3,1)" }}>
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: SANS, fontSize: 12, letterSpacing: ".32px", color: PAL.mut3 }}>T.C. · EVRAK</span>
            <span style={{ fontFamily: SANS, fontSize: 12, letterSpacing: ".32px", color: PAL.mut3 }}>{belge.evrak}</span>
          </div>
          <span style={{ display: "block", height: 7, width: "56%", margin: "0 auto 7px", borderRadius: 2, background: PAL.lineHi }} />
          <span style={{ display: "block", height: 7, width: "34%", margin: "0 auto 18px", borderRadius: 2, background: PAL.line }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SATIRLAR.map((w, i) => w === 0
              ? <span key={i} aria-hidden="true" style={{ height: 7 }} />
              : <span key={i} aria-hidden="true" style={{ height: 7, width: `${w}%`, borderRadius: 2, background: PAL.press, animation: `as-oku 3s ease-in-out ${(i * 3 / SATIRLAR.length).toFixed(2)}s infinite` }} />)}
          </div>
        </div>
        {/* Tarama ışını — yalnız işlerken tarar; bitince (mühür) durur. */}
        {isliyor && <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 44, background: ISIN_ZEMIN, animation: "as-tarama 2.6s linear infinite", willChange: "transform" }} />}
        {bitti && <Muhur az={az} />}
      </div>
      {zarfli && <Zarf />}
    </div>
  );
}

// Tek ajan durumu — pending (boş halka) · active (spinner) · done (dolu tik).
function Durum({ durum }) {
  if (durum === "active") {
    return (
      <span aria-hidden="true" style={{ position: "relative", width: 13, height: 13, flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 20 20" style={{ animation: "nu-spin 1s linear infinite" }}>
          <circle cx="10" cy="10" r="8" stroke={PAL.line} strokeWidth="3" fill="none" />
          <path d="M10 2 A8 8 0 0 1 18 10" stroke={T} strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (durum === "done") {
    return (
      <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, background: DERIN.T, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: "nu-pop .3s var(--ke-ease-out) both" }}>
        <Icon.check width={8} height={8} />
      </span>
    );
  }
  return <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, border: `1.5px solid ${PAL.lineHi}`, flexShrink: 0 }} />;
}

function AjanSatiri({ a, durum, not }) {
  const aktif = durum === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, height: 22, padding: "0 8px", borderRadius: RAD.chip, background: aktif ? ALFA(T) : "transparent", boxShadow: aktif ? `inset 2px 0 0 ${DERIN.T}` : "none", transition: "background .2s ease-out" }}>
      <Durum durum={durum} />
      <span style={{ ...TYPE.meta, fontWeight: aktif ? 600 : 500, color: durum === "pending" ? PAL.mut3 : PAL.ink2, whiteSpace: "nowrap" }}>{a.ad}</span>
      <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 12, letterSpacing: ".32px", color: PAL.mut3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{not}</span>
    </div>
  );
}

// 16-segment ilerleme + başlık.
function Ilerleme({ node, belge }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: T, flexShrink: 0, animation: "nu-think 1.4s ease-in-out infinite" }} />
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink, flexShrink: 0 }}>Canlı ajan hattı</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: PAL.mut3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...TNUM }}>{belge.evrak} · {belge.dosya}</span>
      </div>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: N }, (_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < node ? T : PAL.press, transition: "background .25s ease-out" }} />)}
      </div>
    </div>
  );
}

// Sağ ray — 16 ajanın canlı durumu (i < node-1 → done · i === node-1 → active · sonrası pending).
function Ray({ node, tamam, belge }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <Ilerleme node={node} belge={belge} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: SP.m }}>
        {AJANLAR.map((a, i) => {
          const durum = tamam || i < node - 1 ? "done" : i === node - 1 ? "active" : "pending";
          // Aktif belgeye göre dinamik notlar: sınıflandırma sonucu + önerilen mevzuat.
          const not = a.id === "siniflandir" ? `${belge.tur} · ${belge.birim}`
            : a.id === "mevzuat_oner" ? belge.mevzuat
            : a.not;
          return <AjanSatiri key={a.id} a={a} durum={durum} not={not} />;
        })}
      </div>
    </div>
  );
}

function Kabarcik({ k, belge }) {
  const deger = k.alan ? belge[k.alan] : k.deger;
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: k.yer.top, left: k.yer.left, zIndex: 5, display: "flex", flexDirection: "column", gap: 2, padding: "7px 11px", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.ctl, boxShadow: SH.pop, animation: "nu-pop .34s var(--ke-ease-out) both" }}>
      <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{k.etiket}</span>
      {k.bant
        ? <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: DERIN.yesil, ...TNUM }}>{deger}</span>
        : <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap" }}>{deger}</span>}
    </div>
  );
}

export default function AjanSahnesi() {
  const az = useAzHareket();
  const [idx, setIdx] = useState(0);            // aktif belge (BELGELER içinde)
  const [node, setNode] = useState(az ? N : 1);
  // faz: "giris"→"islem"→"muhur"→"katla"→"zarf"→"ucus"→(sıradaki belge). az → mühürlü statik kare.
  const [faz, setFaz] = useState(az ? "muhur" : "giris");

  useEffect(() => {
    if (az) { setIdx(0); setNode(N); setFaz("muhur"); return undefined; }
    let alive = true, timer, i = 0, n = 1;
    const gec = (f, ms, sonra) => { if (!alive) return; setFaz(f); timer = setTimeout(sonra, ms); };
    const baslat = () => {
      if (!alive) return;
      n = 1; setIdx(i); setNode(1); setFaz("giris");            // yeni belge aşağıdan girer
      timer = setTimeout(() => { setFaz("islem"); adim(); }, GIRIS);
    };
    const adim = () => {
      if (!alive) return;
      if (n < N) { n += 1; setNode(n); timer = setTimeout(adim, TICK); }
      else {
        // Final koreografisi: mühür → katla → zarf → sola uçuş → sıradaki belge.
        gec("muhur", MUHUR, () => gec("katla", KATLA, () => gec("zarf", ZARF, () => gec("ucus", UCUS, () => {
          i = (i + 1) % BELGELER.length;                        // sona → başa (sonsuz)
          baslat();
        }))));
      }
    };
    baslat();
    return () => { alive = false; clearTimeout(timer); };
  }, [az]);

  const belge = BELGELER[idx];
  const isliyor = faz === "giris" || faz === "islem";
  const bitti = !isliyor;                                       // mühür/katla/zarf/uçuş → tamamlandı
  const katli = faz === "katla" || faz === "zarf" || faz === "ucus";
  const zarfli = faz === "zarf" || faz === "ucus";
  const ucus = faz === "ucus";
  return (
    <div aria-hidden="true" style={{ width: "100%", maxWidth: 720, margin: "0 auto", marginBottom: SP.xl, textAlign: "left" }}>
      <style>{KEYFRAMES}</style>
      {/* İç katman key={idx}: her belgede remount → as-giris (aşağıdan fade-in). Belge sahnesi
          kendi içinde mühür/katla/zarf/uçuş yürütür; ray + alt bilgi uçuşta solar. */}
      <div key={idx} style={{ animation: az ? "none" : "as-giris .5s ease-out both" }}>
        <div style={{ position: "relative", display: "flex", gap: SP.l, alignItems: "stretch" }}>
          <Belge belge={belge} bitti={bitti} isliyor={isliyor} katli={katli} zarfli={zarfli} ucus={ucus} az={az} />
          <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", opacity: ucus ? 0 : 1, transition: "opacity .5s ease-out" }}>
            <Ray node={node} tamam={bitti} belge={belge} />
          </div>
          {/* Kabarcıklar yalnız işlerken/mühürde; katlanma başlayınca kaybolur. */}
          {!katli && KABARCIKLAR.map((k, i) => (bitti || node > k.sonra) && <Kabarcik key={i} k={k} belge={belge} />)}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.s, marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}`, opacity: ucus ? 0 : 1, transition: "opacity .5s ease-out" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>
            {bitti ? `sha256: ${belge.sha}` : `adım ${String(node).padStart(2, "0")}/${N} · ${AJANLAR[Math.min(node, N) - 1].ad}`}
          </span>
          {bitti
            ? <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c), padding: "2px 8px", borderRadius: RAD.chip, ...TNUM }}>{BANT.yesil.l}</span>
            : <span style={{ ...TYPE.meta, color: PAL.mut2 }}>işleniyor…</span>}
        </div>
      </div>
    </div>
  );
}
