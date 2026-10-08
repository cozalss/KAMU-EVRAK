/* ChatbotWidget — sağ altta yuvarlak FAB + Hero Light sohbet paneli.
   Backend POST /sohbet (auth'lu): niyet + araç (gelen/giden/taslak/işlem/panel/mevzuat) +
   yanıt; LLM yoksa deterministik fallback (kaynak rozetinde görünür). Kayıtlar yapısal
   kart olarak çizilir; oneri_gorunum "Görünüme git" butonuna bağlanır (onNavigate=goView).
   Geçmiş oturumluk (component state — DashboardApp ömrünce yaşar). Tema yalnız neonUi
   token'ları; z-index FAB 150 / panel 160 (Toast 200 üstte kalır).
   Spec: docs/09-sohbet-asistani.md */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, authFetch } from "../lib/authApi.js";
import { sttDestekleniyorMu } from "../lib/sesliMod.js";
import { hafizaKaydet, hafizaTemizle, hafizaYukle } from "../lib/sohbetHafiza.js";
import SesliGorusme from "./SesliGorusme.jsx";
import { Balon, BeklemeFisi, MasaSorulari } from "./AsistanFis.jsx";
import { baglamSorulari } from "../lib/sohbetMetin.js";
import { MONO, DISPLAY, PAL, T, DERIN, TYPE, TNUM, RAD, SP, SH, EASE, EASE_BEZIER, Icon, focusRing, SR_ONLY } from "./neonUi.jsx";

/* Panelin çapası: kenar çubuğu (cilt) sağ kenarının 12px yanı, tetikle aynı taban hizası.
   Telefonda (≤720) null → panel ekran genişliğinde alttan açılır (dar rayın yanında 300px'lik
   bir tepsi okunmaz). Açılış anında BİR KEZ ölçülür; açıkken kenar çubuğu daralırsa panel
   yerinde kalır (bir sonraki açılışta yeni ölçü). */
/* Geniş masaüstünde (≥1280) panel yüzen kutu değil, sağ kenara yaslı TAM YÜKSEKLİKTE bir
   danışma sütunudur ve ana içeriği iter (örtmez; tur 8 jüri: 400×600 kutu Panel kartlarını
   örtüyordu, 1920'nin %20'sini kullanıyordu). İtme CSS'te: html[data-asistan-sutun] #nu-main. */
import { SUTUN_GENISLIK } from "./SesliSahne.jsx";
export { SUTUN_GENISLIK };
const SUTUN_MQ = "(min-width: 1280px)";
/* İtme eşiği (tur 9 jüri): 1280–1599'da sütun içeriği iterse Panel ~760 px'e sıkışıp kart
   etiketleri ("Kar…", "Gönderi…") kesiliyordu. Bu aralıkta sütun ÇEKMECE olarak içeriğin
   üstüne biner (itmez); ≥1600'de içerik sütunla birlikte yeniden yerleşecek kadar geniştir. */
const ITME_MQ = "(min-width: 1600px)";
function capaHesapla() {
  if (window.matchMedia?.("(max-width: 720px)").matches) return null;
  if (window.matchMedia?.(SUTUN_MQ).matches) return { sutun: true };
  const tetik = document.querySelector("[data-asistan-tetik]");
  const ray = tetik?.closest("[data-ray]")?.getBoundingClientRect();
  const t = tetik?.getBoundingClientRect();
  if (!ray || !t) return { left: SP.xl, bottom: SP.xl };
  return { left: Math.round(ray.right + 12), bottom: Math.max(SP.s, Math.round(window.innerHeight - t.bottom)) };
}

const ONERILER = [
  "Son gelen evraklar", "Kaç evrak işledik?", "Son işlemin detayı",
  "Reddedilen giden evraklar", "Mevzuat kataloğu", "Risk bandı nedir?",
];
const KARSILAMA = {
  rol: "asistan",
  karsilama: true,  // kararlı bayrak: reload'da referans-eşitliği bozulur, bu bayrak korunur (bug avı)
  icerik: "Gelen ve giden evrakı listeler, işlem geçmişini ve yasal süreleri gösterir, " +
    "mevzuatta madde bulurum. Sorunuzu yazın ya da aşağıdaki listeden seçin.",
};

/* Bileşen-yerel kurallar (satır-içi stil :hover/@keyframes/medya yazamaz). */
const SOHBET_CSS = `
@keyframes ke-kalem{0%{stroke-dashoffset:100;opacity:1}55%{stroke-dashoffset:0;opacity:1}85%{stroke-dashoffset:0;opacity:.25}100%{stroke-dashoffset:0;opacity:0}}
.ke-kalem{stroke-dasharray:100;animation:ke-kalem 1.6s cubic-bezier(0.77,0,0.175,1) infinite}
.ke-sohbet-dipnot:hover{background:${PAL.hov}!important}
.ke-sohbet-dipnot .ke-sohbet-dipnot-ok{opacity:0;transform:translateX(-3px);transition:opacity .14s ease-out, transform .18s ${EASE.out}}
.ke-sohbet-dipnot:hover .ke-sohbet-dipnot-ok,.ke-sohbet-dipnot:focus-visible .ke-sohbet-dipnot-ok{opacity:1;transform:none}
@media (max-width:480px){.ke-sesli-etiket{display:none}}
/* Dokunmatik: her hedef ≥44 px (CLAUDE.md a11y) — fare ile yoğun kalır. */
@media (pointer:coarse){
  .ke-sohbet-ikon{min-width:44px!important;height:44px!important}
  .ke-sohbet-oneri{min-height:44px!important}
  .ke-sohbet-dokun,.ke-sohbet-dipnot{min-height:44px!important}
}
.ke-sohbet-ikon:hover:not(:disabled){background:${PAL.hov}!important;color:${PAL.ink}!important}
.ke-sohbet-oneri:hover{background:${PAL.hov}!important}
/* Tek odak dili (tur 8): kenarlık tükenmeze döner, halka yok — global :focus-visible çift
   çizgisi girdide bastırılır (iki katman üst üste ağır bir kutu çiziyordu). */
.ke-sohbet-girdi:focus,.ke-sohbet-girdi:focus-visible{border-color:${T}!important;box-shadow:inset 0 0 0 1px ${T}!important;outline:none!important}
/* Danışma sütunu ana içeriği iter — yalnız ≥1600; 1280–1599 bindirme çekmece. */
@media ${ITME_MQ}{
  #nu-main{transition:padding-right .28s ${EASE.out}}
  html[data-asistan-sutun] #nu-main{padding-right:${SUTUN_GENISLIK}px}
}
@media (prefers-reduced-motion: reduce){#nu-main{transition:none!important}}
`;

// ekran: kullanıcının o an gördüğü ekranın özeti (lib/ekranBaglami). Her isteğe eklenir —
// asistan "bu evrak", "buradaki liste" gibi işaret eden soruları arama yapmadan çözer.
export default function ChatbotWidget({ onNavigate, onMevzuatAc, ekran = null, onEvrakAc }) {
  const queryClient = useQueryClient();   // teyit sonrası panel/giden senkronu
  const [acik, setAcik] = useState(false);
  // BAŞLATICI KENAR ÇUBUĞUNDA (2026-10, tur 3): sağ-alttaki yüzen düğme içeriği örtüyordu
  // (Panel'de takvim lejantı, telefonda satırın "İşle" düğmesi — ölçüldü). Yüzen düğme her
  // ekranda bir köşeyi işgal eder; güvenli alt boşluk yalnız sayfa SONUNDA işe yarar. Linear'ın
  // 2026 deseni gibi ajan girişi navigasyonun içinde: tetik NeonSidebar'da ("data-asistan-tetik"),
  // haberleşme iki window olayıyla — ke-asistan (aç/kapa isteği) · ke-asistan-durum (açık mı).
  // Kısayol Ctrl/⌘ + . her yerden açar/kapatır (klavye eylemi = animasyonsuz değil ama ≤200ms).
  const [konum, setKonum] = useState(null);   // panelin tetiğe göre çapası {left, bottom} | null=telefon
  const acKapa = useCallback((istek) => {
    setAcik((a) => {
      const yeni = istek === "degistir" ? !a : !!istek;
      if (yeni && !a) setKonum(capaHesapla());
      return yeni;
    });
  }, []);
  useEffect(() => {
    const olay = (e) => acKapa(e.detail?.ac ?? "degistir");
    const tus = (e) => {
      if (e.key !== "." || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      e.preventDefault(); acKapa("degistir");
    };
    window.addEventListener("ke-asistan", olay);
    window.addEventListener("keydown", tus);
    return () => { window.removeEventListener("ke-asistan", olay); window.removeEventListener("keydown", tus); };
  }, [acKapa]);
  // Sohbet geçmişi localStorage'dan hidre edilir (reload/sekme kalıcılığı; DB gerektirmez).
  const [mesajlar, setMesajlar] = useState(() => hafizaYukle() ?? [KARSILAMA]);
  const [girdi, setGirdi] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  // SR duyurusu: akan yanıt token token mutasyona uğrarken liste aria-live "off"a alınır
  // (her delta SR kuyruğuna girmesin — result-cards daktilo idiomu); tamamlanan yanıt tek
  // seferde bu görünmez role=status bölgesinden duyurulur.
  const [srDuyuru, setSrDuyuru] = useState("");
  // STT (mikrofon) tarayıcı desteklemiyorsa (Firefox vb.) sesli butonlar hiç render edilmez.
  const sttVar = sttDestekleniyorMu();
  // Sesli görüşme — asistanın İÇİNDEN başlatılır ve sohbet panelinin YERİNE geçer: panel
  // kapanır, aynı noktada yuvarlak disk açılır (tam ekran DEĞİL; kullanıcı sitede kalır,
  // arkadaki ekranı görür/kullanır). Görüşme bitince panel geri gelir — kullanıcı geldiği
  // yere döner ve yazışma geçmişi elinde kalır.
  const [sesliAcik, setSesliAcik] = useState(false);
  // Ekran bağlamı REF'te tutulur: gonder() bir closure ve ekran her navigasyonda değişiyor —
  // prop'u doğrudan okusaydı kullanıcı soruyu sorduğu anki değil, closure'ın kurulduğu anki
  // ekranı gönderirdi (bayat bağlam = yanlış cevap).
  const ekranRef = useRef(ekran);
  useEffect(() => { ekranRef.current = ekran; }, [ekran]);
  const inputRef = useRef(null);
  const listeRef = useRef(null);

  // Okuma sırası (tur 6): memurun sorusu ve bekleme fişi → dibe kay; asistanın cevabı ise
  // fişin ÜST kenarı görünür alanın tepesine hizalanır — uzun cevapta memur kuyruğu (çipler,
  // "görünüme git") değil ilk cümleyi görür. Akan deltalar kaydırmayı yeniden tetiklemez:
  // hizalama mesaj başına bir kez yapılır (sonHizalanan).
  const sonFisRef = useRef(null);
  const sonHizalanan = useRef(-1);
  useEffect(() => {
    const liste = listeRef.current;
    if (!liste || !acik) return;
    const i = mesajlar.length - 1;
    const son = mesajlar[i];
    if (son?.rol === "asistan" && !son.karsilama && i > 0) {
      if (sonHizalanan.current === i) return;
      sonHizalanan.current = i;
      const fis = sonFisRef.current;
      if (fis) liste.scrollTop = Math.max(0, fis.offsetTop - liste.offsetTop - SP.s);
      return;
    }
    liste.scrollTop = liste.scrollHeight;
  }, [mesajlar, bekliyor, acik]);
  useEffect(() => { if (acik) inputRef.current?.focus(); }, [acik]);
  const sutun = !!konum?.sutun;
  useEffect(() => {
    const kok = document.documentElement;
    if ((acik || sesliAcik) && sutun) kok.setAttribute("data-asistan-sutun", "");
    else kok.removeAttribute("data-asistan-sutun");
    return () => kok.removeAttribute("data-asistan-sutun");
  }, [acik, sesliAcik, sutun]);
  const baglamAdi = String(ekran?.gorunum || "").replace(/\s*\(.*\)$/, "");
  const masaSorulari = useMemo(() => baglamSorulari(ekran), [ekran]);

  // Konuşma bitince (akış sürerken değil) geçmişi localStorage'a yaz — reload'da kalıcı.
  useEffect(() => { if (!bekliyor) hafizaKaydet(mesajlar); }, [mesajlar, bekliyor]);

  // Kapanınca odak kenar çubuğundaki tetiğe döner (WCAG 2.4.3). Durum olayı tetiğin
  // aria-expanded'ını ve "açık" görünümünü sürer; sesli görüşme de "açık" sayılır.
  const odakDon = useRef(false);
  const kapat = () => { odakDon.current = true; setAcik(false); };
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ke-asistan-durum", { detail: { acik: acik || sesliAcik } }));
    if (!acik && odakDon.current) { odakDon.current = false; requestAnimationFrame(() => document.querySelector("[data-asistan-tetik]")?.focus()); }
  }, [acik, sesliAcik]);

  // Sesli komutu kabuğa ilet. useCallback: SesliGorusme'nin tur işleyicisi bunu bağımlılık
  // olarak taşıyor — her render'da yeni referans, dinleme döngüsünü gereksiz yere yeniden kurar.
  const sesliKomutUygula = useCallback((komut) => {
    if (komut?.tur === "gorunum") onNavigate?.(komut.gorunum);
    else if (komut?.tur === "evrak_ac") onEvrakAc?.(komut.baslik);
  }, [onNavigate, onEvrakAc]);
  const gecmisiTemizle = () => {
    hafizaTemizle(); setMesajlar([KARSILAMA]); inputRef.current?.focus();
  };

  // Son (akan) asistan balonunu fonksiyonel güncelle — akış sırasında state yarışı olmaz.
  const sonuGuncelle = (fn) => setMesajlar((ms) => {
    const s = ms.slice();
    s[s.length - 1] = fn(s[s.length - 1]);
    return s;
  });

  // SSE gövdesini işle: meta (kayıtlar/onay) → delta (token) → done (kaynak + tam yanıt).
  const akisiOku = async (res) => {
    setMesajlar((ms) => [...ms, { rol: "asistan", icerik: "", akiyor: true, zaman: Date.now() }]);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    // Tek SSE bloğunu işle (döngüde + döngü sonrası kalan için ortak — bug avı: ayraçsız
    // son 'done' event'i düşüyordu → sessiz yarım yanıt, kaynak rozeti güncellenmiyordu).
    const islemBlok = (blok) => {
      const satir = blok.split("\n").find((l) => l.startsWith("data:"));
      if (!satir) return;
      let ev;
      try { ev = JSON.parse(satir.slice(5)); } catch { return; }
      if (ev.event === "meta") {
        sonuGuncelle((son) => ({ ...son, kayitlar: ev.kayitlar, kayit_turu: ev.kayit_turu, oneri_gorunum: ev.oneri_gorunum, onay_bekleyen: ev.onay_bekleyen, mevzuat_kaynaklari: ev.mevzuat_kaynaklari }));
      } else if (ev.event === "delta" && ev.t) {
        sonuGuncelle((son) => ({ ...son, icerik: (son.icerik || "") + ev.t }));
      } else if (ev.event === "done") {
        // Kaynak (llm|fallback) artık mesajın KENDİ künyesinde ("Danışma notu · Yapay zekâ");
        // başlıktaki anlamsız "YZ" rozeti kaldırıldı (tur 8 jüri).
        // Updater SAF kalır (StrictMode çift çağrı — BelgeModal notu); duyuru dışarıda set edilir.
        if (ev.yanit) setSrDuyuru(ev.yanit);
        sonuGuncelle((son) => ({ ...son, icerik: ev.yanit || son.icerik, akiyor: false, kaynak: ev.kaynak }));
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        islemBlok(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
    buf += dec.decode();               // flush (kalan çok-baytlı karakter)
    if (buf.trim()) islemBlok(buf);    // ayraçsız son event'i de işle
    sonuGuncelle((son) => ({ ...son, akiyor: false }));
  };

  const gonder = async (metin, onayBaglam = null) => {
    const mesaj = (metin ?? girdi).trim();
    if (!mesaj || bekliyor) return;
    setGirdi("");
    setBekliyor(true);
    // gecmis: karşılama + hata balonları hariç son 8 gerçek tur.
    const gecmis = mesajlar
      .filter((m) => !m.karsilama && !m.hata)  // karşılama (reload'da yeni obje) + hata balonları hariç
      .slice(-8)
      .map((m) => ({ rol: m.rol, icerik: m.icerik.slice(0, 4000) }));
    const govde = {
      mesaj, gecmis,
      ...(onayBaglam ? { onay_baglam: onayBaglam } : {}),
      ...(ekranRef.current ? { ekran: ekranRef.current } : {}),
    };
    setMesajlar((ms) => [...ms, { rol: "kullanici", icerik: mesaj, zaman: Date.now() }]);
    try {
      // Birincil: SSE akışı (token-token). Başarısızsa aşağıda düz POST'a düşülür.
      const res = await authFetch("/sohbet/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde),
      });
      if (!res.ok || !res.body) throw new Error(`akış ${res.status}`);
      await akisiOku(res);
    } catch {
      // Onay eylemi taşıyan istek OTOMATİK yeniden gönderilmez (bug avı bulgusu): akış
      // sunucuda eylemi UYGULAMIŞ olabilir — düz-POST tekrarı aynı onayı ikinci kez işleyip
      // Giden Evrak'a çift kayıt açardı. Yarım balon kapatılır, karar kullanıcıya bırakılır.
      if (onayBaglam) {
        setMesajlar((ms) => [
          ...ms
            .filter((m) => !(m.rol === "asistan" && m.akiyor && !m.icerik))
            .map((m) => (m.akiyor ? { ...m, akiyor: false } : m)),
          {
            rol: "asistan", hata: true, zaman: Date.now(), tekrar: () => gonder(mesaj, onayBaglam),
            icerik: "Bağlantı akış sırasında koptu — eylem uygulanmış olabilir. Giden Evrak'ı kontrol edin; uygulanmadıysa Tekrar dene.",
          },
        ]);
        return;
      }
      try {
        const y = await apiPost("/sohbet", govde);
        const msg = { rol: "asistan", zaman: Date.now(), kaynak: y.kaynak, icerik: y.yanit, kayitlar: y.kayitlar, kayit_turu: y.kayit_turu, oneri_gorunum: y.oneri_gorunum, onay_bekleyen: y.onay_bekleyen, mevzuat_kaynaklari: y.mevzuat_kaynaklari };
        setMesajlar((ms) => {
          const s = ms.slice();
          const son = s[s.length - 1];
          // Akış yarıda kesildiyse (kısmi içerikli DÂHİL — çift balon olmasın) üzerine yaz.
          if (son?.rol === "asistan" && son.akiyor) s[s.length - 1] = msg;
          else s.push(msg);
          return s;
        });
      } catch (err2) {
        setMesajlar((ms) => [
          ...ms.map((m) => (m.akiyor ? { ...m, akiyor: false } : m)),
          {
            rol: "asistan", hata: true, zaman: Date.now(), tekrar: () => gonder(mesaj, onayBaglam),
            icerik: `Yanıt alınamadı: ${err2.message || "bağlantı hatası"}`,
          },
        ]);
      }
    } finally {
      setBekliyor(false);
    }
  };

  // HITL teyit butonları — bağlamı geri göndererek eylemi uygula/iptal et.
  // "Evet" DB'ye gerçek karar yazar (sohbet.py → onayla_ve_gonder) — Panel/Taslaklar/Giden
  // ekranları eskiden F5'e dek eski durumu gösteriyordu (denetim bulgusu): kararın ardından
  // islemler + giden-evrak sorguları invalidate edilir, DashboardApp effect'leri DB gerçeğini kurar.
  const onTeyit = async (m, evet) => {
    setMesajlar((ms) => ms.map((x) => (x === m ? { ...x, onay_kullanildi: true } : x)));
    await gonder(evet ? "evet" : "vazgeç", m.onay_bekleyen);
    if (evet) {
      queryClient.invalidateQueries({ queryKey: ["islemler"] });
      queryClient.invalidateQueries({ queryKey: ["giden-evrak"] });
    }
  };

  const ilkAcilis = mesajlar.length <= 1;
  const sonAracIdx = mesajlar.reduce((son, m, i) => (m.kayitlar?.length ? i : son), -1);
  const gonderPasif = bekliyor || !girdi.trim();

  return (
    <>
      <style>{SOHBET_CSS}</style>
      {/* HAVALE NOTU TEPSİSİ (Family "dinamik tepsi" + Emil köken-farkında açılış): panel
          kenar çubuğundaki tetiğin YANINDAN, sol-alt köşesinden büyür (.96→1, hiçlikten değil)
          ve aynı köşeye çekilerek kapanır — kâğıt cilt sırtından çekilip çıkarılır. Yay: hızlı,
          sönümlü (520/40); çıkış 140ms. MotionConfig reducedMotion="user" azaltmada anlık yapar. */}
      <AnimatePresence>
      {acik && (
        <motion.section key="ke-asistan-kap" className="ke-sohbet-panel" role="dialog" aria-label="Evrak asistanı sohbeti"
          onKeyDown={(e) => { if (e.key === "Escape") kapat(); }}
          initial={sutun ? { opacity: 0, x: 24 } : { opacity: 0, scale: 0.96, y: 8 }}
          animate={sutun ? { opacity: 1, x: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={sutun ? { opacity: 0, x: 16, transition: { duration: 0.14, ease: EASE_BEZIER.out } } : { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.14, ease: EASE_BEZIER.out } }}
          transition={sutun ? { duration: 0.28, ease: EASE_BEZIER.out } : { type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
          style={{ position: "fixed", zIndex: 160, display: "flex", flexDirection: "column", overflow: "hidden", background: PAL.surfPop, ...panelYerlesim(konum) }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Başlık — antet dili: mono künye satırı + display başlık + çift antet çizgisi. */}
          <header style={{ padding: "14px 16px 0", background: PAL.surfPop }}>
            {/* Künye kendi tam satırında (tur 8): düğmelerle aynı satırda "PANEL…" diye kırpılıyordu. */}
            <div style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: SP.xs }}>
              Kamu-Evrak · Danışma masası{baglamAdi && <> · <span style={{ color: PAL.mut2 }}>{baglamAdi} bağlamında</span></>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Son cevabın kaynağı (yapay zekâ / kural tabanlı) artık her danışma notunun kendi
                    künyesinde (tur 8). "T.C." yok — bağımsız ürün devlet kimliğini kendi anteti gibi
                    taşımaz (ViewWrap ile aynı karar). */}
                <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0, overflow: "hidden" }}>
                  <h2 style={{ margin: 0, minWidth: 0, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: 18, lineHeight: "22px", letterSpacing: "-.01em", color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Evrak asistanı</h2>
                </div>
              </div>
              {sttVar && (
                <button type="button" className="ke-sohbet-ikon" data-press="" onClick={() => { setSesliAcik(true); setAcik(false); }}
                  aria-label="Kamu Evrak ile sesli görüş" title="Sesli görüş" {...focusRing}
                  style={{ ...IKON_DUGME, width: "auto", padding: "0 10px", gap: 6, display: "inline-flex", alignItems: "center", color: DERIN.T, ...TYPE.meta, fontWeight: 600 }}>
                  <Icon.audio width={16} height={16} /> <span className="ke-sesli-etiket">Sesli</span>
                </button>
              )}
              {mesajlar.length > 1 && (
                <button type="button" className="ke-sohbet-ikon" aria-label="Sohbet geçmişini temizle" title="Geçmişi temizle" onClick={gecmisiTemizle} {...focusRing} data-press="" style={IKON_DUGME}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7 H20 M9 7 V5 a1 1 0 0 1 1-1 H14 a1 1 0 0 1 1 1 V7 M6 7 L7 19 a2 2 0 0 0 2 2 H15 a2 2 0 0 0 2-2 L18 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
              <button type="button" className="ke-sohbet-ikon" aria-label="Sohbeti kapat" onClick={kapat} {...focusRing} data-press="" style={IKON_DUGME}>
                <Icon.x />
              </button>
            </div>
            <div aria-hidden="true" style={{ marginTop: SP.m, height: 4, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.85 }} />
          </header>

          {/* Mesajlar — akış sırasında aria-live "off": SSE delta'ları son balonu token token
              mutasyona uğratır, her mutasyon SR kuyruğuna girerdi (result-cards daktilo idiomu).
              Tam yanıt aşağıdaki SR_ONLY role=status bölgesinden TEK seferde duyurulur. */}
          <div ref={listeRef} role="log" aria-live={bekliyor ? "off" : "polite"} aria-busy={bekliyor} aria-atomic="false" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: SP.m, background: PAL.bg }}>
            {mesajlar.map((m, i) => <Balon key={i} m={m} fisRef={i === mesajlar.length - 1 ? sonFisRef : undefined} damgali={i === sonAracIdx && !m.akiyor} onNavigate={onNavigate} onClose={kapat} onTeyit={onTeyit} onMevzuatAc={onMevzuatAc} bekliyor={bekliyor} />)}
            {bekliyor && mesajlar[mesajlar.length - 1]?.rol === "kullanici" && <BeklemeFisi />}
            {ilkAcilis && !bekliyor && (
              <div style={{ marginTop: SP.xs, display: "grid", gap: SP.l }}>
                <MasaSorulari sorular={masaSorulari} gonder={gonder} baglamAdi={baglamAdi} />
                <div>
                {/* Sık sorulanlar = numaralı soru listesi (form maddesi gibi), hap çip değil (jüri A#32). */}
                <div id="ke-sohbet-oneri-baslik" style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", marginBottom: SP.s }}>Sık sorulanlar</div>
                <ol aria-labelledby="ke-sohbet-oneri-baslik" style={{ listStyle: "none", margin: 0, padding: 0, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, overflow: "hidden" }}>
                  {ONERILER.map((o, n) => (
                    <li key={o} style={{ borderTop: n ? `1px solid ${PAL.line}` : "none" }}>
                      <button type="button" className="ke-sohbet-oneri" {...focusRing} data-press="" onClick={() => gonder(o)}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.m, width: "100%", minHeight: 38, padding: "6px 12px", ...TYPE.data, fontWeight: 500, color: PAL.ink2, background: "transparent", border: "none", textAlign: "left", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
                        <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut3, ...TNUM }}>{String(n + 1).padStart(2, "0")}</span>
                        <span style={{ flex: 1 }}>{o}</span>
                        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3 }}><Icon.arrow width={13} height={13} /></span>
                      </button>
                    </li>
                  ))}
                </ol>
                </div>
              </div>
            )}
          </div>
          <div role="status" aria-live="polite" style={SR_ONLY}>{srDuyuru}</div>

          {/* İlgili sorular (tur 9) — geniş sütunda konuşma sürerken de girdinin üstünde sabit:
              1920'de sohbet alanının çoğu boş kalıyordu. Yalnız sütun modunda (dar kutuya sığmaz). */}
          {sutun && !ilkAcilis && !bekliyor && (
            <nav aria-label="İlgili sorular" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SP.xs, padding: `${SP.s}px ${SP.m}px 0`, background: PAL.surfPop, borderTop: `1px solid ${PAL.line}` }}>
              <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", marginRight: SP.xs }}>İlgili</span>
              {[...masaSorulari, ...ONERILER].slice(0, 3).map((o) => (
                <button key={o} type="button" className="ke-sohbet-oneri" {...focusRing} data-press="" onClick={() => gonder(o)}
                  style={{ cursor: "pointer", minHeight: 28, maxWidth: "100%", padding: "3px 10px", ...TYPE.meta, color: PAL.ink2, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {o}
                </button>
              ))}
            </nav>
          )}
          {/* Giriş — tek satır yazı alanı + gönder. Ataç ve mikrofon bilinçli olarak YOK
              (kullanıcı kararı): konuşmak → sesli görüşme diski, yazmak → bu kutu. */}
          <form onSubmit={(e) => { e.preventDefault(); gonder(); }}
            style={{ display: "flex", gap: SP.s, padding: SP.m, borderTop: sutun && !ilkAcilis && !bekliyor ? "none" : `1px solid ${PAL.line}`, background: PAL.surfPop }}>
            <input ref={inputRef} type="text" value={girdi} onChange={(e) => setGirdi(e.target.value)}
              placeholder="Evrak sorun, mevzuat arayın…" aria-label="Asistana mesaj yaz"
              maxLength={1000} className="ke-sohbet-girdi"
              style={{ flex: 1, minWidth: 0, ...TYPE.ui, fontSize: 16, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", minHeight: 44, boxSizing: "border-box", outline: "none", transition: "border-color .15s ease, box-shadow .2s ease" }} />
            <button type="submit" aria-label="Mesajı gönder" disabled={gonderPasif} {...focusRing} data-press=""
              onMouseEnter={(e) => { if (!gonderPasif) e.currentTarget.style.background = DERIN.Th; }}
              onMouseLeave={(e) => { if (!gonderPasif) e.currentTarget.style.background = DERIN.T; }}
              style={{
                cursor: gonderPasif ? "not-allowed" : "pointer", width: 44, height: 44, borderRadius: RAD.ctl, border: "none",
                background: gonderPasif ? PAL.press : DERIN.T,
                color: gonderPasif ? PAL.mut2 : PAL.onAccent, display: "grid", placeItems: "center", flexShrink: 0,
                transition: `background .12s ease-out, transform .14s ${EASE.out}`,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12 L20 4 L14 20 L11.5 13.5 L4 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            </button>
          </form>
          </div>
        </motion.section>
      )}
      </AnimatePresence>

      {/* Sesli görüşme diski — panelin yerine geçer, AYNI çapada (konum) doğar; bitince panel
          geri açılır (odak, panelin kendi effect'iyle mesaj kutusuna gider: görüşmenin devamı
          yazarak sürdürülebilir). onKomut: sesli komut siteyi GERÇEKTEN sürer. */}
      <SesliGorusme acik={sesliAcik} ekran={ekran} onKomut={sesliKomutUygula} konum={konum} baglamAdi={baglamAdi}
        onKapat={() => { setSesliAcik(false); acKapa(true); }} />
    </>
  );
}

/* Panel yerleşimi: geniş masaüstü = sağ sütun; orta = tetik yanında kutu; telefon = alt tepsi. */
function panelYerlesim(konum) {
  if (konum?.sutun) {
    return { top: 0, right: 0, bottom: 0, width: SUTUN_GENISLIK, borderLeft: `1px solid ${PAL.lineHi}`, boxShadow: SH.pop };
  }
  return {
    transformOrigin: "bottom left", border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal,
    ...(konum ? { left: konum.left, bottom: konum.bottom } : { left: SP.s, right: SP.s, bottom: SP.s }),
    width: konum ? "min(400px, calc(100vw - 32px))" : "auto",
    height: konum ? `min(600px, calc(100vh - ${konum.bottom + 24}px))` : "min(640px, calc(100dvh - 16px))",
  };
}

const IKON_DUGME = { cursor: "pointer", width: 32, height: 32, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "none", color: PAL.mut, display: "grid", placeItems: "center", padding: 0, flexShrink: 0, transition: `background .12s ease, color .12s ease, transform .14s ${EASE.out}` };
