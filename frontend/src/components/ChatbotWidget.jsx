/* ChatbotWidget — sağ altta yuvarlak FAB + Hero Light sohbet paneli.
   Backend POST /sohbet (auth'lu): niyet + araç (gelen/giden/taslak/işlem/panel/mevzuat) +
   yanıt; LLM yoksa deterministik fallback (kaynak rozetinde görünür). Kayıtlar yapısal
   kart olarak çizilir; oneri_gorunum "Görünüme git" butonuna bağlanır (onNavigate=goView).
   Geçmiş oturumluk (component state — DashboardApp ömrünce yaşar). Tema yalnız neonUi
   token'ları; z-index FAB 150 / panel 160 (Toast 200 üstte kalır).
   Spec: docs/09-sohbet-asistani.md */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, authFetch } from "../lib/authApi.js";
import { mdSatirTipi } from "../lib/mdSatir.js";
import { satirIciParcala, kayitAdi, notSaati } from "../lib/sohbetMetin.js";
import { sttDestekleniyorMu } from "../lib/sesliMod.js";
import { hafizaKaydet, hafizaTemizle, hafizaYukle } from "../lib/sohbetHafiza.js";
import SesliGorusme from "./SesliGorusme.jsx";
import { BANT, MONO, DISPLAY, PAL, T, V, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, EASE_BEZIER, Icon, Damga, focusRing, SR_ONLY } from "./neonUi.jsx";

/* Panelin çapası: kenar çubuğu (cilt) sağ kenarının 12px yanı, tetikle aynı taban hizası.
   Telefonda (≤720) null → panel ekran genişliğinde alttan açılır (dar rayın yanında 300px'lik
   bir tepsi okunmaz). Açılış anında BİR KEZ ölçülür; açıkken kenar çubuğu daralırsa panel
   yerinde kalır (bir sonraki açılışta yeni ölçü). */
function capaHesapla() {
  if (window.matchMedia?.("(max-width: 720px)").matches) return null;
  const tetik = document.querySelector("[data-asistan-tetik]");
  const ray = tetik?.closest("[data-ray]")?.getBoundingClientRect();
  const t = tetik?.getBoundingClientRect();
  if (!ray || !t) return { left: SP.xl, bottom: SP.xl };
  return { left: Math.round(ray.right + 12), bottom: Math.max(SP.s, Math.round(window.innerHeight - t.bottom)) };
}

const GORUNUM_ETIKET = {
  gelen: "Gelen evrak", giden: "Giden evrak", taslaklar: "Taslaklar",
  mevzuat: "Mevzuat", denetim: "Denetim", panel: "Panel", islenen: "İşlenen evrak",
};
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

/* Hafif markdown: **kalın** + *eğik* + satır sonu + "• " madde + "---" yatay ayraç
   (kütüphanesiz). Bilinen evrak kodları (bilgi_edinme, dilekce, tarih_yok) Türkçe etikete
   çevrilir — ham anahtar ve çıplak "*" ekrana/ekran okuyucuya sızmaz (lib/sohbetMetin). */
function Md({ text }) {
  return (text || "").split("\n").map((satir, i) => {
    const tip = mdSatirTipi(satir);
    if (tip === "hr") {
      return <hr key={i} aria-hidden="true" style={{ border: "none", borderTop: `1px solid ${PAL.line}`, margin: "8px 0" }} />;
    }
    const madde = tip === "madde";
    const icerik = satirIciParcala(madde ? satir.slice(2) : satir).map((p, j) =>
      p.tip === "kalin" ? <strong key={j} style={{ fontWeight: 650, color: "inherit" }}>{p.metin}</strong>
        : p.tip === "egik" ? <em key={j} style={{ fontStyle: "italic" }}>{p.metin}</em>
          : <React.Fragment key={j}>{p.metin}</React.Fragment>);
    return madde
      ? <span key={i} style={{ display: "flex", gap: SP.s }}><span aria-hidden="true" style={{ color: DERIN.T }}>•</span><span style={{ minWidth: 0 }}>{icerik}</span></span>
      : <span key={i} style={{ display: "block" }}>{icerik}</span>;
  });
}

/* Tek kayıt kartı — tür-bilinçli alanlar (MONO yalnız makine-verisi meta satırı + risk noktası). */
function KayitKart({ tur, k }) {
  const ad = kayitAdi(k);   // dosya adı ("ornek-x.txt") başlık olmaz — konu / tür etiketi
  const risk = k.risk || k.bant;
  const satir2 = [
    tur === "gelen" && k.evrak_no,
    tur === "giden" && k.durum, tur === "giden" && k.alici_birim,
    tur === "islem" && k.evrak_turu, tur === "islem" && k.hedef_birim,
    tur === "taslak" && k.yazi_turu_kod,
    tur === "mevzuat" && (k.kanun_no || k.no) && `${k.kanun_no || k.no} sayılı`,
    tur === "mevzuat" && k.madde_no && `m. ${k.madde_no}`,
    tur === "mevzuat" && k.madde_sayisi && `${k.madde_sayisi} madde`,
    (k.olusturuldu || k.gonderim_tarihi || "").slice(0, 10),
  ].filter(Boolean);
  return (
    <div style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `2px solid ${PAL.lineHi}`, borderRadius: RAD.ctl, padding: "8px 12px", display: "grid", gap: SP.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        {risk && BANT[risk] && <span title={BANT[risk].l} aria-label={`Risk: ${BANT[risk].l}`} style={{ width: 8, height: 8, borderRadius: RAD.dot, background: BANT[risk].c, flexShrink: 0 }} />}
        <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>
      </div>
      {satir2.length > 0 && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2 }}>{satir2.join(" · ")}</span>}
      {tur === "mevzuat" && k.snippet && <span style={{ ...TYPE.meta, color: PAL.mut }}>{k.snippet}</span>}
    </div>
  );
}

/* Mevzuat kaynak çipi — asistan cevabının dayandığı madde; tıklanınca okuma modalı
   ilgili maddede açılır (DashboardApp köprüsü → MevzuatView.hedef). */
function KaynakCip({ kaynak, onMevzuatAc, onClose }) {
  const etiket = [kaynak.no && `${kaynak.no}`, kaynak.baslik, kaynak.madde_no != null && `m.${kaynak.madde_no}`]
    .filter(Boolean).join(" · ");
  return (
    <button type="button" {...focusRing} title={`${kaynak.baslik}: tam metni oku`}
      onClick={() => { onMevzuatAc?.({ dosya: kaynak.dosya, maddeNo: kaynak.madde_no ?? null }); onClose(); }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, maxWidth: "100%", minHeight: 32, ...TYPE.meta, fontWeight: 500, color: DERIN.V, background: ALFA(V), border: "none", borderRadius: RAD.chip, padding: "4px 10px", transition: "background .12s ease-out" }}>
      <Icon.book width={12} height={12} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etiket}</span>
    </button>
  );
}

const KAYIT_TUR_ETIKET = { gelen: "Gelen", giden: "Giden", islem: "İşlem", taslak: "Taslak", mevzuat: "Mevzuat", panel: "Panel" };

/* Zımba — araç sonucu kayıtları nota "zımbalı ek" olarak tutturulur (Hamle 14). Saf dekor. */
const Zimba = () => (
  <svg aria-hidden="true" width="24" height="8" viewBox="0 0 24 8" style={{ position: "absolute", left: 16, top: 0, zIndex: 1 }}>
    <path d="M2.5 6.5 V4 H21.5 V6.5" fill="none" stroke={PAL.mut2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 3.2 H20" stroke={PAL.surf} strokeWidth="1" strokeLinecap="round" opacity=".5" />
  </svg>
);

/* Mesaj — kullanıcı sağda (tükenmez mavisi), asistan solda "danışma notu fişi" (beyaz kâğıt +
   hairline). Hata fişi kırmızı kenar + ikonla ayrışır (renk tek sinyal değil). Araç sonucu:
   kayıt kartları zımbalı ek olarak altta; EN SON araç sonucu mini damga taşır ("3 KAYIT ·
   GELEN") — panel başına tek damga (dikkat bütçesi), eski mesajlar damgasız. */
function Balon({ m, onNavigate, onClose, onTeyit, onMevzuatAc, bekliyor, damgali }) {
  const kullanici = m.rol === "kullanici";
  const kayitSayi = m.kayitlar?.length || 0;
  const saat = notSaati(m.zaman);
  // Künye: notun türü (mono) — Karşılama · Danışma notu · İşlem durdu; sağda saat.
  const kunye = m.karsilama ? "Karşılama" : m.hata ? "İşlem durdu" : "Danışma notu";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: kullanici ? "flex-end" : "flex-start", gap: SP.s, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      {kullanici ? (
        /* Memurun sorusu — tükenmez mavisi dolgulu kısa not; balon kuyruğu yok (kâğıt köşesi). */
        <div style={{ maxWidth: "88%", padding: "9px 13px", ...TYPE.ui, overflowWrap: "anywhere", background: DERIN.T, color: PAL.onAccent, borderRadius: RAD.ctl }}>
          <Md text={m.icerik} />
        </div>
      ) : (
        /* Asistanın cevabı = DANIŞMA NOTU FİŞİ (tur 4, jüri A#32/B#18): balon değil kâğıt —
           mono künye satırı (tür · saat) + kesikli ayraç + gövde; sol kenarda ıstampa moru
           cilt çizgisi. Karşılama da aynı fişle başlar: panelin ilk izlenimi sohbet balonu değil. */
        <div style={{ position: "relative", width: "92%", background: PAL.surf, border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${m.hata ? BANT.kirmizi.c : V}`, borderRadius: RAD.ctl, boxShadow: SH.card, color: PAL.ink2, overflowWrap: "anywhere" }}>
          <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "7px 12px 6px", borderBottom: `1px dashed ${PAL.lineHi}`, ...TYPE.antet, fontSize: 10, lineHeight: "14px", textTransform: "uppercase", color: m.hata ? DERIN.kirmizi : PAL.mut3 }}>
            {m.hata && <Icon.alert width={12} height={12} />}
            <span>{kunye}</span>
            <span style={{ flex: 1 }} />
            {saat && <span style={TNUM}>{saat}</span>}
          </div>
          <div style={{ padding: "9px 12px 11px", ...TYPE.ui }}><Md text={m.icerik} /></div>
        </div>
      )}
      {kayitSayi > 0 && (
        <div style={{ position: "relative", display: "grid", gap: SP.s, width: "88%", paddingTop: SP.xs }}>
          <Zimba />
          {damgali && (
            <Damga ton={V} egim={-5} kucuk style={{ position: "absolute", right: 6, top: -12, zIndex: 2, background: PAL.surf }}>
              {kayitSayi} kayıt{KAYIT_TUR_ETIKET[m.kayit_turu] ? ` · ${KAYIT_TUR_ETIKET[m.kayit_turu]}` : ""}
            </Damga>
          )}
          {m.kayitlar.slice(0, 8).map((k, i) => <KayitKart key={i} tur={m.kayit_turu} k={k} />)}
          {kayitSayi > 8 && <span style={{ ...TYPE.meta, color: PAL.mut2 }}>+{kayitSayi - 8} kayıt daha — tümü ilgili görünümde</span>}
        </div>
      )}
      {m.mevzuat_kaynaklari?.length > 0 && (
        <div role="group" aria-label="Cevabın mevzuat kaynakları" style={{ display: "flex", flexWrap: "wrap", gap: SP.s, maxWidth: "88%" }}>
          {m.mevzuat_kaynaklari.map((k, i) => (
            <KaynakCip key={`${k.dosya}-${k.madde_no ?? i}`} kaynak={k} onMevzuatAc={onMevzuatAc} onClose={onClose} />
          ))}
        </div>
      )}
      {m.onay_bekleyen && !m.onay_kullanildi && (
        <div style={{ display: "flex", gap: SP.s }}>
          {/* Başka bir mesaj akışta iken (bekliyor) devre dışı: aksi halde onTeyit balonu
              hemen "kullanıldı" işaretler ama gonder() kendi bekliyor kontrolünde isteği
              sessizce atlar — karar hiç gönderilmeden kaybolurdu (regresyon bulgusu). */}
          <button type="button" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, true)}
            style={{ cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.data, fontWeight: 500, color: PAL.onAccent, background: DERIN.T, border: "none", borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            <Icon.check /> Evet, uygula
          </button>
          <button type="button" {...focusRing} disabled={bekliyor} onClick={() => onTeyit(m, false)}
            style={{ cursor: bekliyor ? "not-allowed" : "pointer", opacity: bekliyor ? 0.5 : 1, ...TYPE.data, fontWeight: 500, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", transition: "background .12s ease-out" }}>
            Vazgeç
          </button>
        </div>
      )}
      {m.oneri_gorunum && GORUNUM_ETIKET[m.oneri_gorunum] && (
        <button type="button" {...focusRing}
          onClick={() => { onNavigate?.(m.oneri_gorunum); onClose(); }}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, minHeight: 32, ...TYPE.data, fontWeight: 500, color: DERIN.T, background: ALFA(T), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          {GORUNUM_ETIKET[m.oneri_gorunum]} görünümüne git <Icon.arrow width={13} height={13} />
        </button>
      )}
      {m.hata && (
        <button type="button" {...focusRing} onClick={m.tekrar}
          style={{ cursor: "pointer", ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi, background: ALFA(BANT.kirmizi.c), border: "none", borderRadius: RAD.ctl, padding: "4px 12px" }}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

/* "Yazıyor" — üç nokta değil, kalem karalaması: tükenmez çizgisi kendini çizip silen döngü
   (stroke-dashoffset). Reduced-motion'da global kural animasyonu söndürür → durağan çizgi kalır. */
function Yaziyor() {
  return (
    <div role="status" aria-label="Asistan yazıyor" style={{ display: "inline-flex", alignItems: "center", gap: SP.s, padding: "8px 12px", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: `${RAD.chip}px ${RAD.card}px ${RAD.card}px ${RAD.card}px`, width: "fit-content" }}>
      <svg width="46" height="16" viewBox="0 0 46 16" fill="none" aria-hidden="true">
        <path className="ke-karala" d="M2 11 C6 3 9 3 9 9 C9 13 7 13 9 8 C11 4 15 4 15 9 C16 12 18 11 21 6 C23 3 25 6 24 10 C27 6 30 5 32 9 C34 12 37 10 44 5"
          stroke={T} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" pathLength="100" />
      </svg>
      <span style={{ ...TYPE.meta, color: PAL.mut2 }}>yazıyor</span>
    </div>
  );
}

/* Bileşen-yerel kurallar (satır-içi stil :hover/@keyframes/medya yazamaz). */
const SOHBET_CSS = `
@keyframes ke-karala{0%{stroke-dashoffset:100}55%{stroke-dashoffset:0}100%{stroke-dashoffset:-100}}
.ke-karala{stroke-dasharray:100;animation:ke-karala 1.5s cubic-bezier(0.77,0,0.175,1) infinite}
.ke-sohbet-ikon:hover:not(:disabled){background:${PAL.hov}!important;color:${PAL.ink}!important}
.ke-sohbet-oneri:hover{background:${PAL.hov}!important}
.ke-sohbet-girdi:focus{border-color:${T}!important;box-shadow:0 0 0 3px color-mix(in srgb, ${T} 18%, transparent)}
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
  const [kaynak, setKaynak] = useState(null);   // son yanıtın kaynağı (llm|fallback) — şeffaflık
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

  // Yeni mesaj/durumda en alta kay (kullanıcı son cevabı görsün).
  useEffect(() => {
    if (listeRef.current) listeRef.current.scrollTop = listeRef.current.scrollHeight;
  }, [mesajlar, bekliyor, acik]);
  useEffect(() => { if (acik) inputRef.current?.focus(); }, [acik]);

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
    hafizaTemizle(); setMesajlar([KARSILAMA]); setKaynak(null); inputRef.current?.focus();
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
        setKaynak(ev.kaynak);
        // Updater SAF kalır (StrictMode çift çağrı — BelgeModal notu); duyuru dışarıda set edilir.
        if (ev.yanit) setSrDuyuru(ev.yanit);
        sonuGuncelle((son) => ({ ...son, icerik: ev.yanit || son.icerik, akiyor: false }));
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
        setKaynak(y.kaynak);
        const msg = { rol: "asistan", zaman: Date.now(), icerik: y.yanit, kayitlar: y.kayitlar, kayit_turu: y.kayit_turu, oneri_gorunum: y.oneri_gorunum, onay_bekleyen: y.onay_bekleyen, mevzuat_kaynaklari: y.mevzuat_kaynaklari };
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
          initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.14, ease: EASE_BEZIER.out } }}
          transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
          style={{
            position: "fixed", zIndex: 160, transformOrigin: "bottom left",
            ...(konum ? { left: konum.left, bottom: konum.bottom } : { left: SP.s, right: SP.s, bottom: SP.s }),
            width: konum ? "min(400px, calc(100vw - 32px))" : "auto", height: konum ? `min(600px, calc(100vh - ${konum.bottom + 24}px))` : "min(640px, calc(100dvh - 16px))",
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop,
            boxShadow: SH.modal,
          }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Başlık — antet dili: mono künye satırı + display başlık + çift antet çizgisi. */}
          <header style={{ padding: "14px 16px 0", background: PAL.surfPop }}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Künye (tur 4, jüri B#18): "Havale notu" resmî yazışmada SEVK notudur — yanlış
                    etiketti; "canlı model" jargondu. Danışma masası + son cevabın kaynağı. */}
                <div style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", display: "flex", gap: SP.s, alignItems: "center" }}>
                  <span aria-hidden="true">T.C. · Kamu-Evrak · Danışma</span>
                  {kaynak && <span style={{ color: kaynak === "llm" ? DERIN.T : PAL.mut3 }}>· {kaynak === "llm" ? "yapay zekâ yanıtı" : "kural tabanlı yanıt"}</span>}
                </div>
                <h2 style={{ margin: "2px 0 0", fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: 18, lineHeight: "22px", letterSpacing: "-.01em", color: PAL.ink }}>Evrak asistanı</h2>
              </div>
              {sttVar && (
                <button type="button" className="ke-sohbet-ikon" data-press="" onClick={() => { setSesliAcik(true); setAcik(false); }}
                  aria-label="Kamu Evrak ile sesli görüş" title="Sesli görüş" {...focusRing}
                  style={{ ...IKON_DUGME, width: "auto", padding: "0 10px", gap: 6, display: "inline-flex", alignItems: "center", color: DERIN.T, ...TYPE.meta, fontWeight: 600 }}>
                  <Icon.audio width={16} height={16} /> Sesli
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
            {mesajlar.map((m, i) => <Balon key={i} m={m} damgali={i === sonAracIdx && !m.akiyor} onNavigate={onNavigate} onClose={kapat} onTeyit={onTeyit} onMevzuatAc={onMevzuatAc} bekliyor={bekliyor} />)}
            {bekliyor && mesajlar[mesajlar.length - 1]?.rol === "kullanici" && <Yaziyor />}
            {ilkAcilis && !bekliyor && (
              <div style={{ marginTop: SP.xs }}>
                {/* Sık sorulanlar = numaralı soru listesi (form maddesi gibi), hap çip değil (jüri A#32). */}
                <div id="ke-sohbet-oneri-baslik" style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", marginBottom: SP.s }}>Sık sorulanlar</div>
                <ol aria-labelledby="ke-sohbet-oneri-baslik" style={{ listStyle: "none", margin: 0, padding: 0, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, overflow: "hidden" }}>
                  {ONERILER.map((o, n) => (
                    <li key={o} style={{ borderTop: n ? `1px solid ${PAL.line}` : "none" }}>
                      <button type="button" className="ke-sohbet-oneri" {...focusRing} data-press="" onClick={() => gonder(o)}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.m, width: "100%", minHeight: 36, padding: "6px 12px", ...TYPE.data, fontWeight: 500, color: PAL.ink2, background: "transparent", border: "none", textAlign: "left", transition: `background .12s ease, transform .14s ${EASE.out}` }}>
                        <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut3, ...TNUM }}>{String(n + 1).padStart(2, "0")}</span>
                        <span style={{ flex: 1 }}>{o}</span>
                        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut3 }}><Icon.arrow width={13} height={13} /></span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <div role="status" aria-live="polite" style={SR_ONLY}>{srDuyuru}</div>

          {/* Giriş — tek satır yazı alanı + gönder. Ataç ve mikrofon bilinçli olarak YOK
              (kullanıcı kararı): konuşmak → sesli görüşme diski, yazmak → bu kutu. */}
          <form onSubmit={(e) => { e.preventDefault(); gonder(); }}
            style={{ display: "flex", gap: SP.s, padding: SP.m, borderTop: `1px solid ${PAL.line}`, background: PAL.surfPop }}>
            <input ref={inputRef} type="text" value={girdi} onChange={(e) => setGirdi(e.target.value)}
              placeholder="Evrak sorun, mevzuat arayın…" aria-label="Asistana mesaj yaz"
              maxLength={1000} className="ke-sohbet-girdi"
              style={{ flex: 1, minWidth: 0, ...TYPE.ui, fontSize: 16, color: PAL.ink, background: PAL.surf, border: `1px solid ${PAL.inputLine}`, borderRadius: RAD.ctl, padding: "8px 12px", minHeight: 40, boxSizing: "border-box", outline: "none", transition: "border-color .15s ease, box-shadow .2s ease" }} />
            <button type="submit" aria-label="Mesajı gönder" disabled={gonderPasif} {...focusRing} data-press=""
              onMouseEnter={(e) => { if (!gonderPasif) e.currentTarget.style.background = DERIN.Th; }}
              onMouseLeave={(e) => { if (!gonderPasif) e.currentTarget.style.background = DERIN.T; }}
              style={{
                cursor: gonderPasif ? "not-allowed" : "pointer", width: 44, height: 40, borderRadius: RAD.ctl, border: "none",
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
      <SesliGorusme acik={sesliAcik} ekran={ekran} onKomut={sesliKomutUygula} konum={konum}
        onKapat={() => { setSesliAcik(false); acKapa(true); }} />
    </>
  );
}

const IKON_DUGME = { cursor: "pointer", width: 32, height: 32, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "none", color: PAL.mut, display: "grid", placeItems: "center", padding: 0, flexShrink: 0, transition: `background .12s ease, color .12s ease, transform .14s ${EASE.out}` };
