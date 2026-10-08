/* TaslaklarView — KARAR BEKLEYEN taslakların çalışma kuyruğu: MASTER-DETAIL TRİYAJ
   (Linear triage / posta istemcisi deseni — 2026-07-17 yeniden tasarım). Solda dar kuyruk
   listesi (satır = konu + meta, eylem YOK), sağda sabit karar paneli (büyük önizleme +
   eylem çubuğu). Gerekçe: eski 420px kart grid'i 61 taslak × 4 buton = ~244 eş-vurgulu
   hedefti; triyajda bilişsel yükü düşüren şey tek seferde TEK karar + kalıcı önizlemedir.
   Kurgu ayrımı: işlenen arşivi IslenenEvrakView (sicil defteri), gönderilmiş GidenEvrakView.
   Düzenleme yüzeyi TEK kalır: A4 kâğıt modalı (BelgeModal); kurul = KurulModal. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ViewWrap, Btn, EmptyState, Icon, MONO, PAL, RAD, SP, SH } from "./neonUi.jsx";
import BelgeModal from "./BelgeModal.jsx";
import TaslakImza from "./TaslakImza.jsx";
import { KuyrukTemiz } from "./TaslakEylem.jsx";
import { KurulModal } from "./MuzakereKurulu.jsx";
import { useFilter, deriveOptions } from "../hooks/useFilter.js";
import { EVRAK_TR, BIRIM_LBL, cleanDemoText } from "../lib/evrakEtiket.js";
import { sutunButcesi, BOSLUK, KUYRUK_AZAMI } from "../lib/taslakSutun.js";
import { gonderimDenetimi, taslakKunyesi } from "../lib/gonderimHazirlik.js";
import { SATIR_H, defterZemini, useIslemDurumu, IskeletSatirlar, KararIskeleti } from "./TaslakDefter.jsx";
import { AracCubugu, DefterBasligi, KuyrukSatiri, BosFiltre, Tus, icOdak, KUYRUK_ODAK_CSS, useSatirKati } from "./TaslakKuyruk.jsx";
import KararPaneli, { BosMasa } from "./TaslakKararPaneli.jsx";
import TaslakBosMasa from "./TaslakBosMasa.jsx";

/* Düzenlenen metni DOĞRUDAN DOCX indir (pipeline yok → /yazi/render). Gövde olduğu gibi. */
async function docxIndir(text, name, onToast) {
  if (!text.trim()) return;
  let url = "";
  try {
    const res = await fetch("/yazi/render?format=docx", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title: name || "Resmî Yazı Taslağı" }),
    });
    if (!res.ok) throw new Error(`İndirilemedi (${res.status})`);
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(name || "taslak").replace(/[^\w.-]+/g, "_")}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    onToast?.("Taslak DOCX olarak indirildi.");
  } catch (e) {
    onToast?.(e?.message || "İndirme tamamlanamadı. Lütfen tekrar deneyin.");
  } finally {
    if (url) { const u = url; setTimeout(() => URL.revokeObjectURL(u), 1500); }
  }
}

/* Kuyruk varsayılanı EN YENİ ÖNCE — memurun az önce kuyruğa aldığı taslak listenin başında
   görünsün (İşlenen→Düzenle akışı; kullanıcı isteği 2026-07-17). SLA/kuyruk adaleti için
   "En eski önce" seçenekte durur. */
const BASE_CONFIG = {
  search: { enabled: true, placeholder: "Konu, dosya adı…" },
  select: [
    { id: "evrak_turu", label: "Evrak türü", options: [] },
    { id: "hedef_birim", label: "Hedef birim", options: [] },
  ],
  sort: { enabled: true, default: "ts_desc", options: [
    { value: "ts_desc", label: "En yeni" }, { value: "ts_asc", label: "En eski" }, { value: "name_asc", label: "Ad (A–Z)" },
  ] },
  dataMapping: { search: ["name", "konu", "muhatap"], evrak_turu: "evrak_turu", hedef_birim: "hedef_birim", dateField: "ts" },
};


/* NOT: risk bandı bu görünümde GÖSTERİLMEZ (kullanıcı kararı 2026-08-02) — taslak kuyruğu
   karar vermeye odaklanır, risk değerlendirmesi Panel/Denetim yüzeylerinde kalır. Risk
   VERİSİ üretilmeye devam eder (result.risk_metadata.bant); yalnız bu ekranda çizilmez. */

/* Taslak metninden KONU + gövdenin ilk anlamlı paragrafını çıkar — önizleme her taslakta
   aynı olan resmî başlık kalıbını ("T.C. / KAMU KURUMU / Sayı…") tekrarlamasın. */
function taslakOzeti(md) {
  const temiz = cleanDemoText(md) || "";
  let konu = temiz.match(/^\s*Konu\s*:\s*(.+)$/m)?.[1]?.trim() || "";
  if (konu) konu = konu.charAt(0).toLocaleUpperCase("tr-TR") + konu.slice(1);   // başlık zarafeti
  const satirlar = temiz.split("\n");
  const konuIdx = satirlar.findIndex((s) => /^\s*Konu\s*:/.test(s));
  let govde = "";
  for (let k = konuIdx + 1; k < satirlar.length; k++) {
    const s = satirlar[k].trim();
    if (!s || /^(Sayın|Sayı\s*:|İlgi\s*:)/.test(s)) continue;   // hitap/künye satırlarını geç
    govde = satirlar.slice(k).join("\n").trim();
    break;
  }
  return { konu, govde: govde || temiz };
}

/* Kuyruk parçaları (araç çubuğu · defter başlığı · satır · boş filtre) → TaslakKuyruk.jsx;
   masa + karar sütunu → TaslakKararPaneli.jsx (dosya <800 kuralı, tur 6). */

/* Geniş ekran eşiği — altında liste + panel alt alta yığılır (iki ayrı desen icat edilmez). */
function useGenisEkran() {
  const [genis, setGenis] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1100px)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 1100px)");
    const onChange = () => setGenis(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return genis;
}

/* Sütun yüksekliği — 100vh VARSAYILMAZ, ÖLÇÜLÜR.

   NEDEN (gerçek hata, Playwright'ta ölçüldü): kuyruk ve karar paneli `calc(100vh - 48px)` ile
   kapatılıyordu. Ama bu iki sütun sayfanın TEPESİNDE başlamıyor — üstlerinde ViewWrap dolgusu +
   başlık + araç çubuğu (~154px), altlarında ViewWrap'ın 96px alt dolgusu var. Sonuç: belge
   1118px, pencere 900px → sayfa 218px taşıyor ve bir SAYFA kaydırma çubuğu doğuyordu. O çubuk,
   karar panelinin kendi iç çubuğunun 33px yanına düşünce ekranda YAN YANA İKİ ÇUBUK görünüyordu.
   Taşan 218px zaten işe yaramıyordu: yalnız başlığı yukarı kaydırıyordu.

   Ölçüm ViewWrap'ın iç değerlerine BAĞLANMAZ — alt dolgu DOM'dan okunur, üst boşluk elemanın
   kendi konumundan gelir. Başlık sarsa, araç çubuğu iki satıra düşse veya ViewWrap dolgusu
   değişse ölçü kendiliğinden doğru kalır (sabit sayı yazılsaydı sessizce bozulurdu).

   `rect.top + scrollY` KARARLI bir ölçüdür: sütunlar kısalıp sayfa sığınca tarayıcı scrollY'yi
   sıfırlar ama rect.top aynı miktarda artar; toplam değişmez. Bu yüzden ResizeObserver kendi
   değişikliğimizle tetiklense de aynı sonucu üretir ve döngü oluşmaz (ayrıca 1px eşiği var). */
const SUTUN_MIN = 320;
/* 2026-10 DÜZELTMESİ — ölçüm hiç koşmuyordu (Playwright'ta ölçüldü: grid kalıcı olarak yedek
   "420px 297px 300px" sütunlarında, kâğıt 298px'e sıkışıp ASGARI_OLCEK yüzünden sağdan
   kırpılıyordu). Neden: ref nesnesi efektin ilk koşusunda boştu (taslaklar henüz yüklenmemiş)
   ve gövde gözlemcisi kurtarmıyordu — ViewWrap `minHeight: 100vh` taşıdığından grid belirince
   BODY'nin boyu DEĞİŞMİYOR, gözlemci hiç tetiklenmiyordu. Artık ref bir STATE'tir (callback
   ref): grid DOM'a girdiği anda efekt yeniden koşar ve grid'in KENDİSİ de gözlenir. Body
   gözlemcisi kalır (başlık sarması gibi grid dışı kaymalar için). */
function useSutunYuksekligi(genis) {
  const [el, setEl] = useState(null);
  const [olcu, setOlcu] = useState(null);   // { yukseklik, genislik } — ikisi tek commit'te
  useLayoutEffect(() => {
    if (!genis || !el || typeof window === "undefined") { setOlcu(null); return undefined; }
    const olc = () => {
      const bolum = el.closest("section");
      if (!bolum) return;
      const altDolgu = parseFloat(window.getComputedStyle(bolum).paddingBottom) || 0;
      const ust = el.getBoundingClientRect().top + window.scrollY;
      const h = Math.max(SUTUN_MIN, Math.round(window.innerHeight - ust - altDolgu));
      const w = Math.round(el.clientWidth);
      setOlcu((eski) => (!eski || Math.abs(eski.yukseklik - h) > 1 || Math.abs(eski.genislik - w) > 1
        ? { yukseklik: h, genislik: w }
        : eski));
    };
    olc();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(olc) : null;
    ro?.observe(document.body);
    ro?.observe(el);
    window.addEventListener("resize", olc);
    return () => { ro?.disconnect(); window.removeEventListener("resize", olc); };
  }, [genis, el]);
  return [setEl, olcu?.yukseklik ?? null, olcu?.genislik ?? null];
}

/* Sütun bütçesi — üçünün piksel genişliği `sutunButcesi`de (saf, taslakSutun.test.js'te
   birim testli). Kâğıt hâlâ ölçülen YÜKSEKLİKTEN A4 oranıyla türer; sayfayı büyütmenin tek
   yolu sütuna daha çok yükseklik açmaktır (taşma payıyla büyütme denendi ve kullanıcı
   kararıyla geri alındı, 2026-08-02).

   2026-08-12 DÜZELTMESİ — artan genişlik artık sütun ARALARINA dağıtılmıyor. Eski düzende
   kuyruk 420 / karar 300 sabit tavanlıydı; kâğıt ise yükseklikten türediği için alçak
   ekranda daralıyordu. Artan yer `justifyContent:space-between` ile aralara düşüyor ve
   1080p'de 2x185px, 1440p'de 2x378px uçurum açıyordu (Playwright'ta ölçüldü) — ekran üç
   küçük ada + iki delik olarak görünüyordu. Artık artık sütunlara gider, kalanı tek parça
   SAĞ boşluktur; sütunlar bitişik ve başlık/araç çubuğuyla aynı sol hizada başlar.
   Gerekçenin tamamı + ölçüm tablosu: `lib/taslakSutun.js`. */
const GRID_BOSLUK = BOSLUK;

const optIdOf = (id) => `tas-${String(id).replace(/[^\w-]+/g, "_")}`;

export default function TaslaklarView({ drafts = [], onGoInbox, onGoOutbox = null, onUpdate = () => {}, onDelete = () => {}, onSend = () => {}, onRevize = null, onToast = () => {}, hedef = null, onHedefAcildi, yukleniyor: yukleniyorProp, hata: hataProp, onYenidenDene }) {
  const islem = useIslemDurumu();
  const yukleniyorHam = drafts.length === 0 && (yukleniyorProp ?? islem.yukleniyor);
  /* "Boş" ancak BİR commit sonra kesinleşir (jüri tur 8, ölçüldü): /islemler yanıtı gelince
     sorgu "yüklendi" der ama taslak listesi üst bileşenin efektinde türetilir — arada tek
     commit'te drafts=[] + yükleniyor=false olur, boş durum bir kare basılır ve masa ızgarası
     sökülüp yeniden kurulur (kuyruk soluklaşıp yeniden belirir, kâğıt+fiş ~1 kare yok). Boşluk
     efekt turunu atlatınca kesinleşir; o tura kadar iskelet kalır. */
  const hamBos = drafts.length === 0 && !yukleniyorHam;
  const [bosKesin, setBosKesin] = useState(false);
  useEffect(() => { setBosKesin(hamBos); }, [hamBos]);
  const yukleniyor = yukleniyorHam || (hamBos && !bosKesin);
  const yuklemeHatasi = drafts.length === 0 && !yukleniyor && !!(hataProp ?? islem.hata);
  // drafts: yalnız karar bekleyenler (her biri result.yazi_taslak_md taşır; onay_durumu yok).
  const [duzenleId, setDuzenleId] = useState(null);
  const [kurulId, setKurulId] = useState(null);
  // KARŞILIKLI DIŞLAMA: iki modal aynı anda açılamaz — aksi halde BelgeModal'da kaydedilen
  // metnin üstüne, kurulun ESKİ result'tan türettiği uzlaşı yazılabilirdi (stale-write).
  const acDuzenle = (id) => { setKurulId(null); setDuzenleId(id); };
  const acKurul = (id) => { setDuzenleId(null); setKurulId(id); };
  const [seciliId, setSeciliId] = useState(null);
  // Oturum sayacı — kuyruk boşalınca "sakin zafer" ekranını besler (ilerleme = motivasyon).
  const [karar, setKarar] = useState({ gonderildi: 0, silindi: 0 });
  const [sendBusy, setSendBusy] = useState(false);
  const [komut, setKomut] = useState(null);   // klavye kısayolu → karar paneline tek seferlik komut
  const genis = useGenisEkran();
  // gridRef ölçüm içindir (bkz. useSutunYuksekligi); ölçü gelmeden önce güvenli yedeğe düşülür.
  const [gridRef, sutunH, gridGen] = useSutunYuksekligi(genis);
  const butce = sutunButcesi(sutunH, gridGen);
  const [listeRef] = useAutoAnimate();   // karar sonrası satırın kuyruğu terk edişi + FLIP

  // Hedefli geliş: ilgili taslak kuyrukta SEÇİLİR ve görünür kılınır — A4 modalı otomatik
  // AÇILMAZ (kullanıcı bulgusu: "Düzenle" doğrudan kâğıda ışınlıyor, karar paneli atlanıyordu).
  // Açık modal varsa kapatılır ki seçim görünsün; A4'e geçiş memurun tıkında (satıra Enter /
  // önizleme). Her koşulda hedef tüketilir.
  useEffect(() => {
    if (!hedef) return;
    if (drafts.some((d) => d.id === hedef)) {
      setSeciliId(hedef); setKurulId(null); setDuzenleId(null);
      document.getElementById(optIdOf(hedef))?.scrollIntoView({ block: "nearest" });
    }
    onHedefAcildi?.();
  }, [hedef, drafts, onHedefAcildi]);

  const config = useMemo(() => ({
    ...BASE_CONFIG,
    select: [
      { ...BASE_CONFIG.select[0], options: [{ value: "", label: "Tüm türler" }, ...deriveOptions(drafts, "evrak_turu", EVRAK_TR)] },
      { ...BASE_CONFIG.select[1], options: [{ value: "", label: "Tüm birimler" }, ...deriveOptions(drafts, "hedef_birim", BIRIM_LBL)] },
    ],
  }), [drafts]);
  // Arama, satırda görünen KONU başlığını da taramalı; özet türetimi tek geçişte saklanır.
  const aramaKaynagi = useMemo(() => drafts.map((d) => {
    const ozet = taslakOzeti(d.result?.yazi_taslak_md);
    // Muhatap kuyruk satırında birim yokken ayırıcıdır (aynı konulu taslaklar) — metnin
    // kendisinden okunur (gonderim fişiyle aynı çözücü), uydurulmaz.
    const muhatap = taslakKunyesi(cleanDemoText(d.result?.yazi_taslak_md)).muhatap;
    return { ...d, konu: ozet.konu, muhatap, _govde: ozet.govde };
  }), [drafts]);
  const filter = useFilter(aramaKaynagi, config);
  const sonuc = filter.results;

  // Seçim türetilir: seçili id listede yoksa (gönderildi/silindi/filtrelendi) ilk satıra düşer.
  const secili = sonuc.find((d) => d.id === seciliId) || sonuc[0] || null;
  const aktif = drafts.find((d) => d.id === duzenleId) || null;
  const kurulAktif = drafts.find((d) => d.id === kurulId) || null;

  // Karar sonrası otomatik SIRADAKİ: kuyruk momentumu kendini besler (modal açıp kapatma yok).
  const sonrakineGec = (id) => {
    const i = sonuc.findIndex((d) => d.id === id);
    setSeciliId(sonuc[i + 1]?.id ?? sonuc[i - 1]?.id ?? null);
  };

  const gonder = async (h, metin) => {
    if (sendBusy) return false;
    // Son kapı (düzenleyici yolu dahil): gönderime hazır olmayan yazı çıkmaz — neden söylenir.
    const kapi = gonderimDenetimi(metin);
    if (!kapi.hazir) {
      onToast(`Gönderilmedi — ${kapi.engel[0]?.metin || "yazı gönderime hazır değil."}`);
      return false;
    }
    // sendBusy: /yazi/dogrula ağ turu — koruma olmadan çift tıklama iki Giden kaydı açabilir.
    setSendBusy(true);
    try {
      const ok = await onSend(h, metin);
      if (ok) { setKarar((k) => ({ ...k, gonderildi: k.gonderildi + 1 })); sonrakineGec(h.id); }
      return ok;
    } finally { setSendBusy(false); }
  };
  /* Hüküm anı (TaslakImza): imza katmanı gönderimle AYNI anda başlar — çağrı beklemez;
     damga yalnız ok===true dönünce iner. Kâğıdın o anki yeri ölçülür (katman sabit konumlu,
     panel sıradaki taslağa geçse de kendi kopyasını taşır). */
  const [imza, setImza] = useState(null);
  const imzaBitti = useCallback(() => setImza(null), []);
  const gonderImzali = async (h, metin) => {
    const sayfa = document.querySelector("[data-karar-kagit] .ke-a4-sayfa");
    const rect = sayfa?.getBoundingClientRect();
    const k = Date.now();
    if (!sendBusy && rect && rect.width > 0) {
      const az = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setImza({ k, rect, metin: cleanDemoText(metin) || "", ok: null, az });
    }
    const ok = await gonder(h, metin);
    setImza((i) => (i && i.k === k ? { ...i, ok: !!ok } : i));
    return ok;
  };
  const sil = (h) => {
    onDelete(h.id);
    setKarar((k) => ({ ...k, silindi: k.silindi + 1 }));
    sonrakineGec(h.id);
  };

  // Klavye triyajı: ↑/↓ seçim, Enter = A4 düzenleme (animasyonsuz — klavye eylemi beklemez).
  // sendBusy'de seçim kilitli: panel remount olup başka taslağın üstünde "Gönderiliyor…"
  // göstermesin (review bulgusu).
  const klavye = (e) => {
    if (!sonuc.length || sendBusy) return;
    const i = Math.max(0, sonuc.findIndex((d) => d.id === secili?.id));
    if (e.key === "ArrowDown") { e.preventDefault(); setSeciliId(sonuc[Math.min(sonuc.length - 1, i + 1)].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSeciliId(sonuc[Math.max(0, i - 1)].id); }
    else if (e.key === "Enter" && secili) { e.preventDefault(); acDuzenle(secili.id); }
    // Kısayollar (Hamle 11): animasyonsuz, değiştiricisiz. G gönderim ONAYINI açar (iki adım
    // korunur — odak onay düğmesine geçer, Enter gönderir, Esc vazgeçer); K kurulu toplar.
    else if (e.metaKey || e.ctrlKey || e.altKey || !secili) return;
    else if (e.key === "g" || e.key === "G") { e.preventDefault(); setKomut((k) => ({ tip: "gonder", n: (k?.n || 0) + 1 })); }
    else if (e.key === "k" || e.key === "K") { e.preventDefault(); acKurul(secili.id); }
  };
  // ↑/↓ odak listede DEĞİLKEN de çalışır (tur-4: ipucu "↑↓ seç" diyor ama ilk tıklamaya
  // kadar tuşlar boşa gidiyordu). Yalnız odak hiçbir denetimde değilse (body) ve modal
  // kapalıyken; liste odağı alır ve aynı işleyici çalışır — iki ayrı klavye yolu yok.
  const klavyeRef = useRef(klavye);
  klavyeRef.current = klavye;
  const modalAcik = !!(duzenleId || kurulId);
  useEffect(() => {
    const dinle = (e) => {
      if (modalAcik || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      const a = document.activeElement;
      if (a && a !== document.body && a !== document.documentElement) return;
      const liste = document.querySelector('[role="listbox"][aria-label="Taslak kuyruğu"]');
      if (!liste || liste.hidden) return;
      liste.focus({ preventScroll: true });
      klavyeRef.current(e);
    };
    document.addEventListener("keydown", dinle);
    return () => document.removeEventListener("keydown", dinle);
  }, [modalAcik]);
  // İlk açılışta sayfa kaydırılmaz: telefonda görünüm açılır açılmaz kâğıda atlıyor, antet
  // başlığı ve kuyruk ekran dışında kalıyordu (tur-3 durum matrisi bulgusu). Kaydırma yalnız
  // memurun SEÇİMİ değiştiğinde.
  // Son kaydırılan id tutulur (bayrak değil): StrictMode efektleri iki kez koşturur, bayrak
  // ikinci koşuda "ilk değil" sanıp yine kaydırıyordu.
  const sonSecim = useRef(null);
  useEffect(() => {
    if (!secili) return;
    const ilk = sonSecim.current === null;
    if (sonSecim.current === secili.id) return;
    sonSecim.current = secili.id;
    if (ilk) return;
    document.getElementById(optIdOf(secili.id))?.scrollIntoView({ block: "nearest" });
    // Dar ekranda kâğıt listenin ALTINDA — seçim değişince görünür kalsın (blok: nearest,
    // smooth değil; reduced-motion tartışması doğmaz). Hedef KÂĞITTIR, karar sütunu değil:
    // memur önce belgeyi görmek ister, eylemler onun altında zaten erişilebilir.
    if (!genis) document.querySelector("[data-karar-kagit]")?.scrollIntoView({ block: "nearest" });
  }, [secili?.id, genis]); // eslint-disable-line react-hooks/exhaustive-deps
  const satirKati = useSatirKati(genis);

  /* Başlık TÜM durumlarda aynı (künye + 40px başlık + aynı alt satır): tur-4'te boş/yükleniyor
     hâli künyeli, dolu hâli künyesiz (ustSik) çiziliyordu — veri gelince H1 ~40px zıplıyor,
     künye kayboluyordu (CLS 0,03). Sayım damgası KALDIRILDI: aynı sayı kenar çubuğunda ve
     defter başlığında zaten var; damga yalnız karar anında basılır (gönderim mührü). */
  const baslik = { id: "taslak-h", title: "Taslaklar", kunye: "Karar kuyruğu", altDolgu: genis ? SP.xl : undefined };
  const bos = drafts.length === 0 && !yukleniyor;
  const oturumKarari = karar.gonderildi + karar.silindi;
  // Kuyruk BU oturumda çalışarak boşaltıldıysa: sakin zafer — oturum özeti + Giden'e köprü.
  if (bos && oturumKarari > 0) {
    return <KuyrukTemiz gonderildi={karar.gonderildi} silindi={karar.silindi} onGoOutbox={onGoOutbox} onGoInbox={onGoInbox} />;
  }
  const yenidenDene = onYenidenDene || islem.yeniden;
  // Telefonda boş/hata hâli kısa kart olarak kalır (dar düzen değişmedi); geniş düzende masa.
  if (bos && !genis) {
    if (yuklemeHatasi) {
      return (
        <ViewWrap {...baslik} altDolgu={undefined} sub="Karar bekleyen taslaklar alınamadı">
          <EmptyState icon={<Icon.alert />} damga="Bağlantı yok" title="Taslaklar şu an alınamadı"
            sub="Kalıcı kayda ulaşılamadı. Taslaklar sunucuda duruyor; bağlantı düzelince liste geri gelir."
            actions={[<Btn key="r" primary onClick={yenidenDene}><Icon.undo /> Tekrar dene</Btn>]} />
        </ViewWrap>
      );
    }
    return (
      <ViewWrap {...baslik} altDolgu={undefined} sub="Üretilen resmî yazı taslakları">
        <EmptyState icon={<Icon.doc />} title="Henüz taslak ayrılmadı"
          sub="İşleniyor görünümündeki onay kartında “Düzenle” seçtiğinizde ya da önceki oturumlardan karar bekleyen bir taslak bulunduğunda, resmî yazı taslağı burada listelenir."
          actions={[<Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>]} />
      </ViewWrap>
    );
  }

  const dar = !genis || (butce?.kuyruk ?? KUYRUK_AZAMI) < 360;
  // Dar KUYRUK (masaüstünde ~1440 ve altı): tarih kısalır, konuya yer kalır. Telefon değişmez.
  const kisaTarih = genis && (butce?.kuyruk ?? KUYRUK_AZAMI) < 400;
  // Arama kutusunun "dar"ı YALNIZ telefondur (44px hedef + 16px girdi); dar masaüstü kuyruğu (1440)
  // kısa yer tutucu alır ama "/" kısayol rozetini korur (jüri tur 8: rozet yalnız 1920'de vardı).
  const aracIcerde = <AracCubugu filter={filter} dar={!genis} kisa={dar} siraSecenek={BASE_CONFIG.sort.options}
    turSecenek={config.select[0].options.slice(1)} birimSecenek={config.select[1].options.slice(1)} />;
  // Alt başlık DURUMU söyler (jüri tur 8: yeniden deneme sürerken "Satırı seçin…" diyordu).
  const altBaslik = yukleniyor ? (islem.deneme > 0 ? "Bağlantı yeniden deneniyor — taslaklar sunucuda duruyor" : "Karar kuyruğu açılıyor")
    : bos ? (yuklemeHatasi ? "Karar bekleyen taslaklar alınamadı" : "Karar bekleyen taslak yok") : null;
  const oturumEki = karar.gonderildi + karar.silindi > 0 ? ` · oturumda ${karar.gonderildi + karar.silindi} karar` : "";
  /* altDolgu (JS yorumu — JSX yorumu DEĞİL; kök elemanın önüne konsa iki kardeş doğar ve
     sözdizimi hatası verir, bu depoda daha önce yaşandı): geniş düzende sütunlar pencereye
     kilitli, sayfa kaydırılmıyor — o hâlde 96px alt dolgu nefes payı değil, doğrudan kâğıttan
     kısılan ölü alandır (sütun yüksekliği = pencere − üst boşluk − alt dolgu). 24'e çekmek
     kâğıda ~72px yükseklik kazandırır: sayfa yine TAM sığar, yalnız büyür. Yığılmış (dar)
     düzende sayfa kaydırıldığından varsayılan 96px korunur — yüzen sohbet düğmesi son satırı
     örtmesin. */
  return (
    <ViewWrap {...baslik} sub={altBaslik ?? `Satırı seçin, belgeyi okuyun, karar verin${oturumEki}`}>
      {(
        /* Üç sütun: kuyruk | kâğıt | karar — üçünün genişliği de `sutunButcesi`den gelir
           (saf + birim testli). Kâğıt ölçülen yükseklikten türer (A4 oranı); artan genişlik
           kuyruk ve karar sütunlarına dağıtılır, kalanı SAĞ boşluk olur — aralara ASLA değil.
           Ölçüm gelmeden önce oransal bir yedek kullanılır — ilk karede de üç sütunlu düzen
           görünür, yerleşim sonradan sıçramaz.
           Seçim yokken kâğıt/karar hücreleri boş kalmasın diye grid tek sütuna iner.
           NOT: bu bir JS yorumudur, JSX yorumu DEĞİL — ternary'nin ifade konumunda
           süslü-parantezli JSX yorumu sözdizimi hatası verir (bu depoda daha önce yaşandı). */
        <div ref={gridRef} style={{
          display: "grid",
          gridTemplateColumns: !genis ? "minmax(0, 1fr)"
            // Üç sütun HER hâlde (yükleniyor · filtre boş · kayıt yok · hata): eskiden ölçüm
            // gelmeden seçim yoksa iki sütuna iniyordu (jüri tur 8: 2→3 sütun sıçraması).
            // Filtre boşsa kâğıt+karar yerine tek "boş masa" hücresi (BosMasa, 2 / -1).
            : butce ? `${butce.kuyruk}px minmax(${butce.kagit}px, 1fr) ${butce.karar}px`
            // Ölçüm gelmeden önceki tek kare: oransal yedek — ilk karede de üç sütun görünür.
            : "minmax(260px, 420px) minmax(0, 0.8fr) minmax(236px, 300px)",
          // justifyContent YOK (varsayılan `start`): artan yer sütun ARALARINA dağıtılamaz —
          // `space-between` tam da bu yüzden kaldırıldı (bkz. lib/taslakSutun.js). Sütunlar
          // bitişik durur, kalan genişlik tek parça sağ boşluk olur ve düzen sol hizada kalır.
          gap: GRID_BOSLUK, alignItems: "start",
        }}>
          {bos ? <TaslakBosMasa hata={yuklemeHatasi} sutunH={sutunH} onGoInbox={onGoInbox} onYenidenDene={yenidenDene} /> : <>
          {/* Kuyruk listesi — listbox: ↑/↓ gezinme, Enter düzenleme; satırda eylem yok
              (eylemler panelde — Hick yasası: 244 hedef → 4 hedef). */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden",
            height: genis ? (sutunH ?? undefined) : undefined, animation: "nu-rise .32s var(--ke-ease-out) .04s both" }}>
            {aracIcerde}
            <DefterBasligi adet={yukleniyor ? null : sonuc.length} toplam={drafts.length} dar={dar} deneme={yukleniyor ? islem.deneme : 0}
              filtreli={!yukleniyor && filter.hasActiveFilters} onTemizle={filter.clearAll} />
            {yukleniyor && <IskeletSatirlar />}
            {/* Liste kabı boşken de DOM'da kalır (hidden): auto-animate'in çıkış hayaletleri
                sökülen kabın yerine boş durumun üstüne biniyordu (tur-3 ölçümü). */}
            {sonuc.length === 0 && !yukleniyor && <BosFiltre toplam={drafts.length} onTemizle={filter.clearAll} />}
            <div ref={satirKati.kapRef} style={{ flex: 1, minHeight: 0, display: sonuc.length === 0 || yukleniyor ? "none" : "flex", flexDirection: "column" }}>
            <div ref={listeRef} role="listbox" aria-label="Taslak kuyruğu" tabIndex={0} onKeyDown={klavye}
              aria-activedescendant={secili ? optIdOf(secili.id) : undefined} {...icOdak}
              style={{ ...defterZemini(sonuc.length), flex: satirKati.yuk ? "none" : 1, height: satirKati.yuk ?? undefined, minHeight: genis ? 0 : SATIR_H * 3, overflowY: "auto", outline: "none",
                // Telefonda 4,5 satır: yarım görünen satır kaydırılabilirliği söyler ve kâğıt
                // ilk ekrana yaklaşır (tur 6: belge y=800'de başlıyordu).
                maxHeight: genis ? undefined : Math.round(SATIR_H * 4.5) }}>
              {sonuc.map((h, i) => (
                <KuyrukSatiri key={h.id} h={h} konu={h.konu} muhatap={h.muhatap} sira={i + 1} kisa={kisaTarih} secili={secili?.id === h.id} optId={optIdOf(h.id)}
                  onSec={() => { if (!sendBusy) setSeciliId(h.id); }} onAc={() => { if (!sendBusy) acDuzenle(h.id); }} />
              ))}
            </div>
            </div>
            {genis && sonuc.length > 0 && (
              <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.m, height: 30, flexShrink: 0, padding: "0 14px", whiteSpace: "nowrap", overflow: "hidden", borderTop: `1px solid ${PAL.line}`, background: PAL.surf2, fontFamily: MONO, fontSize: 11, color: PAL.mut3 }}>
                <span><Tus>↑</Tus><Tus>↓</Tus> seç</span>
                <span><Tus>↵</Tus> aç</span>
                <span><Tus>G</Tus> gönder</span>
                <span><Tus>K</Tus> kurul</span>
              </div>
            )}
          </div>
          {yukleniyor && <KararIskeleti genis={genis} sutunH={sutunH} />}
          {!secili && !yukleniyor && genis && <BosMasa sutunH={sutunH} toplam={drafts.length} />}
          {secili && (
            <KararPaneli key={secili.id} h={secili} konu={secili.konu} govde={secili._govde}
              sira={sonuc.findIndex((d) => d.id === secili.id) + 1} toplam={sonuc.length}
              tamMetin={secili.result?.yazi_taslak_md} genis={genis} sutunH={sutunH} kagitGen={butce?.kagit} sendBusy={sendBusy} komut={komut}
              onDuzenle={() => acDuzenle(secili.id)} onKurul={() => acKurul(secili.id)}
              onGonder={() => gonderImzali(secili, secili.result.yazi_taslak_md)} onSil={() => sil(secili)} />
          )}
          </>}
        </div>
      )}

      <style>{KUYRUK_ODAK_CSS}</style>
      {imza && <TaslakImza key={imza.k} kare={imza} onBitti={imzaBitti} />}

      {/* A4 düzenleme modalı — koşullu render: kapanınca unmount, her açılış taze taslakla başlar */}
      {aktif && (
        <BelgeModal key={aktif.id} acik duzenlenebilir
          baslik="Resmî yazı taslağını düzenle" dosyaAdi={aktif.name}
          metin={cleanDemoText(aktif.result.yazi_taslak_md) || ""}
          onKapat={() => setDuzenleId(null)}
          onKaydet={(t) => { onUpdate(aktif.id, t); onToast("Taslak güncellendi."); setDuzenleId(null); }}
          onGonder={async (t) => { if (await gonder(aktif, t)) setDuzenleId(null); }}
          onIndir={(t) => docxIndir(t, aktif.name, onToast)}
          onRevize={onRevize ? (metinGuncel, talimat) => onRevize(aktif.result, metinGuncel, talimat) : null} />
      )}

      {/* Bürokrasi Kurulu — dört üye seçilen taslağı gerçek pipeline sinyalleriyle tartışır;
          "Revize taslağını uygula" MEMUR kararıdır → taslağa yazılır (updateDraft yolu). */}
      {kurulAktif && (
        <KurulModal key={kurulAktif.id}
          taslakAdi={aramaKaynagi.find((d) => d.id === kurulAktif.id)?.konu || kurulAktif.name}
          result={kurulAktif.result}
          onKapat={() => setKurulId(null)}
          // Tutanaktaki "Taslağa işle" → BelgeModal'ın AI-revize yoluyla AYNI uç (/yazi/dogrula).
          onRevize={onRevize ? (metinGuncel, talimat) => onRevize(kurulAktif.result, metinGuncel, talimat) : null}
          onToast={onToast}
          onUygula={(metin) => {
            onUpdate(kurulAktif.id, metin);
            onToast("Kurul revize taslağı uygulandı; taslak güncellendi.");
            setKurulId(null);
          }}
          // Kurulun kapanışı — memur doğruluğu onaylar → gönder (Giden Evrak) → modal kapanır.
          // ok döner: başarısızlıkta GonderimeHazir hata gösterip modalı açık tutar (dürüst HITL).
          onGonder={async (metin) => {
            const ok = await gonderImzali(kurulAktif, metin);
            if (ok) { onToast("Kurul onayıyla taslak Giden Evrak'a gönderildi."); setKurulId(null); }
            return ok;
          }} />
      )}
    </ViewWrap>
  );
}
