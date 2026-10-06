/* DenetimZincir — Denetim izi görünümünün kanıt parçaları (DenetimView'den ayrıldı).
   · ParmakIzi: son hash'in 64 hex'inden türeyen 16 çubukluk mono barkod. Sabit genişlik;
     iki kaydın aynı zincirden geldiği (aynı son hash) bakışta görülür. Süs değil, VERİ.
   · ZincirCekmece: satıra tıklanınca sağdan açılan "zincir doğrulama" çekmecesi. Halkalar
     dikey dizilir; "Zinciri doğrula" sunucunun BAĞIMSIZ yeniden hesaplamasını çağırır
     (GET /islem/{id}/denetim/dogrula — salt okuma) ve her halka sırayla mühürlenir; kırık
     halka varsa ACELE kırmızısıyla işaretlenir. İstemci hash'i yeniden HESAPLAMAZ: Python'un
     kanonik JSON'u (1.0 ↔ 1) tarayıcıda birebir üretilemez → yanlış "kırık" alarmı olurdu.
   · Adım adları yalnız zincirin kendisi (oturum sonucu) taşıyorsa basılır; DB kaydı yalnız
     adım SAYISINI taşır → halkalar numarayla gösterilir (olmayan bilgi uydurulmaz). */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { apiGet } from "../lib/authApi.js";
import { MONO, T, V, R, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, EASE_BEZIER, Icon, Btn, Damga, focusRing, odakDongusu } from "./neonUi.jsx";

/* Backend agents/nodes/denetim_izi._ADIMLAR anahtarlarının okunur adları (yalnız SUNUM). */
const ADIM_AD = {
  siniflandir: "Tür sınıflandırma", cikar: "Bilgi unsurları", eksik_tespit: "Eksik tespiti",
  mevzuat_oner: "Mevzuat önerisi", ozetle: "Özet", route_birim: "Birim yönlendirme",
  yazi_taslak: "Yazı taslağı", verify: "Doğrulama", risk_guard: "Risk bandı",
  onay: "Onay kararı", arsiv: "Arşiv (SDP)", sla_triyaj: "Yasal süre",
};
const MUHUR_ARALIK = 120;
const SIRA_HALKA = 6;          // kompakt zincirde satır başına halka (12 → iki eşit satır)   // halkalar arası mühür vuruşu (ms)

export const kisaHash = (h) => { const s = String(h || ""); return s.length > 12 ? `${s.slice(0, 5)}…${s.slice(-5)}` : s || "—"; };

/* 16 çubuk: hash'in her 4. hex'i (nibble 0–15) → yükseklik. Hash yoksa kesikli boş çizgi. */
export function ParmakIzi({ h, yukseklik = 16, cubuk = 3, aralik = 2, renk = DERIN.V }) {
  const s = String(h || "").replace(/[^0-9a-f]/gi, "");
  const n = 16;
  const genislik = n * cubuk + (n - 1) * aralik;
  if (s.length < 16) {
    return <span aria-hidden="true" style={{ display: "inline-block", width: genislik, height: yukseklik, borderBottom: `1.5px dashed ${PAL.lineHi}` }} />;
  }
  const adim = Math.floor(s.length / n);
  return (
    <svg aria-hidden="true" width={genislik} height={yukseklik} viewBox={`0 0 ${genislik} ${yukseklik}`} style={{ display: "block", flexShrink: 0 }}>
      {Array.from({ length: n }, (_, i) => {
        const v = parseInt(s[i * adim], 16);
        const hh = Math.max(3, Math.round(((v + 1) / 16) * yukseklik));
        return <rect key={i} x={i * (cubuk + aralik)} y={yukseklik - hh} width={cubuk} height={hh} rx={0.5} fill={renk} opacity={0.45 + (v / 15) * 0.55} />;
      })}
    </svg>
  );
}

/* Halka listesi girdisi: zincir varsa adım adı + hash, yoksa yalnız sıra numarası. */
function halkalar(di) {
  const zincir = Array.isArray(di?.zincir) ? di.zincir : [];
  if (zincir.length) return zincir.map((z, i) => ({ no: i + 1, ad: ADIM_AD[z.adim] || z.adim, hash: z.hash }));
  const n = Number.isFinite(di?.adim_sayisi) ? di.adim_sayisi : 0;
  return Array.from({ length: n }, (_, i) => ({ no: i + 1, ad: null, hash: i === n - 1 ? (di.son_hash || di.kok_hash) : null }));
}

/* Doğrulama durumu: bos → bekliyor → (mühürleme sürüyor) → sonuc | hata. */
function useZincirDogrula(islemId, toplam, az) {
  const [durum, setDurum] = useState({ asama: "bos", muhurlu: 0, sonuc: null });
  const zaman = useRef([]);
  useEffect(() => () => zaman.current.forEach(clearTimeout), []);
  const dogrula = async () => {
    if (!islemId) return;
    zaman.current.forEach(clearTimeout); zaman.current = [];
    setDurum({ asama: "bekliyor", muhurlu: 0, sonuc: null });
    try {
      const s = await apiGet(`/islem/${encodeURIComponent(islemId)}/denetim/dogrula`);
      if (!s?.var) { setDurum({ asama: "yok", muhurlu: 0, sonuc: s }); return; }
      const hedef = s.butunluk ? s.adim_sayisi : Math.max(0, (s.kirik_adim || 1) - 1);
      if (az) { setDurum({ asama: "sonuc", muhurlu: hedef, sonuc: s }); return; }
      setDurum({ asama: "muhurleniyor", muhurlu: 0, sonuc: s });
      for (let i = 1; i <= hedef; i += 1) zaman.current.push(setTimeout(() => setDurum((d) => ({ ...d, muhurlu: i })), i * MUHUR_ARALIK));
      zaman.current.push(setTimeout(() => setDurum((d) => ({ ...d, asama: "sonuc" })), (hedef + 1) * MUHUR_ARALIK + 80));
    } catch (e) {
      setDurum({ asama: "hata", muhurlu: 0, sonuc: null, mesaj: e?.status >= 500 ? "Sunucu doğrulamayı tamamlayamadı." : e?.status ? String(e.message || "Doğrulama reddedildi.") : "Sunucuya ulaşılamadı." });
    }
  };
  return { ...durum, toplam, dogrula };
}

/* Tek halka satırı: numaralı halka · adım adı · hash; önceki halkaya ince iplikle bağlı. */
function HalkaSatir({ h, son, durum, az }) {
  const muhurlu = durum === "muhurlu", kirik = durum === "kirik";
  const renk = kirik ? R : muhurlu ? V : PAL.lineHi;
  return (
    <li style={{ position: "relative", display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", columnGap: SP.m, alignItems: "center", minHeight: 34 }}>
      {!son && <span aria-hidden="true" style={{ position: "absolute", left: 13, top: 28, bottom: -6, width: 2, background: muhurlu ? `color-mix(in srgb, ${V} 45%, transparent)` : PAL.line, transition: "background .2s ease-out" }} />}
      <motion.span aria-hidden="true" initial={false} animate={muhurlu || kirik ? { scale: az ? 1 : [1.35, 1] } : { scale: 1 }} transition={{ duration: 0.28, ease: EASE_BEZIER.out }}
        style={{ position: "relative", width: 28, height: 28, borderRadius: RAD.dot, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 11, fontWeight: 600, ...TNUM,
          border: `1.5px ${kirik ? "dashed" : "solid"} ${renk}`, background: muhurlu ? ALFA(V) : kirik ? ALFA(R) : PAL.surf, color: kirik ? DERIN.R : muhurlu ? DERIN.V : PAL.mut2,
          transition: "background .2s ease-out, color .2s ease-out, border-color .2s ease-out" }}>
        {muhurlu ? <Icon.check width={13} height={13} strokeWidth={2.4} /> : kirik ? "×" : String(h.no).padStart(2, "0")}
      </motion.span>
      <span style={{ minWidth: 0, ...TYPE.data, color: h.ad ? PAL.ink2 : PAL.mut2, fontWeight: h.ad ? 500 : 400 }}>
        {h.ad || `Halka ${String(h.no).padStart(2, "0")}`}
        {kirik && <span style={{ display: "block", ...TYPE.meta, color: DERIN.R, fontWeight: 600 }}>Bu halkanın hash'i yeniden hesapla tutmuyor</span>}
      </span>
      <span title={h.hash || ""} style={{ fontFamily: MONO, fontSize: 11, color: h.hash ? PAL.mut2 : PAL.mut3, ...TNUM }}>{h.hash ? kisaHash(h.hash) : "—"}</span>
    </li>
  );
}

/* Adım adları bilinmiyorsa (DB kaydı) halkalar tek satırlık bir zincir olarak dizilir —
   12 boş "Halka 01" satırı yerine kökten sona okunan mühür dizisi. */
function KompaktZincir({ liste, d, az }) {
  return (
    <ol aria-label="Hash zinciri halkaları" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(${SIRA_HALKA}, 36px)`, rowGap: SP.m }}>
      {liste.map((h, i) => {
        const dr = halkaDurumu(i, d);
        const renk = dr === "kirik" ? R : dr === "muhurlu" ? V : PAL.lineHi;
        return (
          <li key={h.no} aria-label={`Halka ${h.no}: ${dr === "muhurlu" ? "doğrulandı" : dr === "kirik" ? "kırık" : "doğrulanmadı"}`} style={{ position: "relative", display: "flex", alignItems: "center" }}>
            {i % SIRA_HALKA !== SIRA_HALKA - 1 && i < liste.length - 1 && <span aria-hidden="true" style={{ position: "absolute", left: 26, width: 10, top: 12, height: 2, background: i < d.muhurlu ? `color-mix(in srgb, ${V} 50%, transparent)` : PAL.line, transition: "background .2s ease-out" }} />}
            <motion.span aria-hidden="true" initial={false} animate={dr !== "bos" ? { scale: az ? 1 : [1.35, 1] } : { scale: 1 }} transition={{ duration: 0.28, ease: EASE_BEZIER.out }}
              style={{ width: 26, height: 26, borderRadius: RAD.dot, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 10.5, fontWeight: 600, ...TNUM,
                border: `1.5px ${dr === "kirik" ? "dashed" : "solid"} ${renk}`, background: dr === "muhurlu" ? ALFA(V) : dr === "kirik" ? ALFA(R) : PAL.surf,
                color: dr === "kirik" ? DERIN.R : dr === "muhurlu" ? DERIN.V : PAL.mut2, transition: "background .2s ease-out, color .2s ease-out, border-color .2s ease-out" }}>
              {dr === "muhurlu" ? <Icon.check width={12} height={12} strokeWidth={2.4} /> : dr === "kirik" ? "×" : String(h.no).padStart(2, "0")}
            </motion.span>
          </li>
        );
      })}
    </ol>
  );
}

function halkaDurumu(i, d) {
  if (i < d.muhurlu) return "muhurlu";
  if (d.asama === "sonuc" && d.sonuc && !d.sonuc.butunluk && i === (d.sonuc.kirik_adim || 1) - 1) return "kirik";
  return "bos";
}

/* Hüküm satırı — ekranın ikinci (ve son) damgası: doğrulama bittiğinde basılır. */
function Hukum({ d }) {
  if (d.asama === "sonuc" && d.sonuc) {
    const tam = !!d.sonuc.butunluk;
    return (
      <div role="status" style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
        <Damga ton={tam ? V : R} egim={-5} oncelik={1}>{tam ? `Zincir sağlam ${d.sonuc.adim_sayisi}/${d.sonuc.adim_sayisi}` : `Kırık halka: ${d.sonuc.kirik_adim ?? "son"}`}</Damga>
        <span style={{ ...TYPE.meta, color: PAL.mut2, maxWidth: 260 }}>
          {tam ? "Sunucu her halkayı öncekinin hash'iyle yeniden hesapladı; hiçbir kayıt değişmemiş." : "Bu halkadan sonraki kayıtlar değiştirilmiş olabilir — kaydı denetim birimine bildirin."}
        </span>
      </div>
    );
  }
  if (d.asama === "yok") return <p role="status" style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Bu işlemin zincir adımları veritabanında bulunamadı; doğrulama yapılamıyor.</p>;
  if (d.asama === "hata") return <p role="alert" style={{ margin: 0, ...TYPE.data, color: DERIN.R }}>{d.mesaj} Tekrar deneyebilirsiniz.</p>;
  return null;
}

function CekmeceBaslik({ kayit, onKapat, kapatRef }) {
  return (
    <header style={{ padding: `${SP.l}px ${SP.xl}px ${SP.m}px`, borderBottom: `1px solid ${PAL.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m }}>
        <span style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" }}>Zincir doğrulama · SHA-256</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
        <button ref={kapatRef} type="button" onClick={onKapat} aria-label="Zincir doğrulama çekmecesini kapat" {...focusRing} data-press=""
          style={{ cursor: "pointer", width: 44, height: 44, marginRight: -10, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: "none", background: "transparent", color: PAL.ink2 }}>
          <Icon.x />
        </button>
      </div>
      <h2 id="zincir-cekmece-h" style={{ margin: `${SP.xs}px 0 0`, ...TYPE.h2, color: PAL.ink, textWrap: "balance" }}>{kayit.baslik}</h2>
      <p style={{ margin: `${SP.xs}px 0 0`, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.mut2, ...TNUM }}>{kayit.meta}</p>
    </header>
  );
}

function SonHashKutusu({ h }) {
  const gruplu = String(h || "").match(/.{1,8}/g) || ["—"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: SP.l, alignItems: "center", padding: SP.m, borderRadius: RAD.card, background: PAL.surf2, border: `1px solid ${PAL.line}` }}>
      <ParmakIzi h={h} yukseklik={34} cubuk={4} aralik={2} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", marginBottom: 2 }}>Son hash · parmak izi</div>
        <code style={{ display: "block", fontFamily: MONO, fontSize: 11.5, lineHeight: "17px", color: PAL.ink2, wordSpacing: 2, overflowWrap: "anywhere" }}>{gruplu.join(" ")}</code>
      </div>
    </div>
  );
}

/* Çekmece altı — tek primary: "Zinciri doğrula" (kalıcı kaydı olmayan satırda pasif). */
const CekmeceAlt = ({ islemId, d, calisiyor }) => (
  <footer style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: `${SP.m}px ${SP.xl}px`, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
    <span style={{ flex: "1 1 180px", ...TYPE.meta, color: PAL.mut2 }}>
      {islemId ? "Doğrulama sunucuda bağımsız yeniden hesaplanır; kayıt değiştirilmez." : "Bu kayıt henüz deftere yazılmadı; doğrulama kalıcı kayıtta yapılır."}
    </span>
    <Btn primary accent={T} onClick={d.dogrula} disabled={!islemId || calisiyor}>
      {calisiyor ? <><Icon.spin width={14} height={14} /> Doğrulanıyor…</> : <><Icon.shield width={15} height={15} /> {d.asama === "sonuc" ? "Yeniden doğrula" : "Zinciri doğrula"}</>}
    </Btn>
  </footer>
);

/* Çekmece kabuğu: scrim + sağdan kayan panel; Esc/scrim kapatır, odak içeride döner. */
export function ZincirCekmece({ kayit, onKapat }) {
  const az = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const liste = halkalar(kayit.di);
  const d = useZincirDogrula(kayit.islemId, liste.length, az);
  const kapatRef = useRef(null);
  useEffect(() => {
    const onceki = document.activeElement;
    kapatRef.current?.focus();
    const tus = (e) => { if (e.key === "Escape") onKapat(); };
    document.addEventListener("keydown", tus);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", tus); document.body.style.overflow = eski; onceki?.focus?.(); };
  }, [onKapat]);
  const calisiyor = d.asama === "bekliyor" || d.asama === "muhurleniyor";
  // Portal ZORUNLU: ViewWrap içeriği kendi yığın bağlamını (zIndex 1) kurar; içeride kalan
  // sabit çekmece telefonun alt sekme şeridinin (z 90) ALTINDA kalıyordu (ölçüldü, 390 px).
  return createPortal(
    <div role="presentation" onClick={onKapat} style={{ position: "fixed", inset: 0, zIndex: 300, background: PAL.scrim, display: "flex", justifyContent: "flex-end", animation: "nu-sol .16s var(--ke-ease-out) both" }}>
      <motion.aside role="dialog" aria-modal="true" aria-labelledby="zincir-cekmece-h" onClick={(e) => e.stopPropagation()} onKeyDown={odakDongusu}
        initial={{ x: az ? 0 : 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.26, ease: EASE_BEZIER.out }}
        style={{ width: "min(460px, 100vw)", height: "100dvh", display: "flex", flexDirection: "column", background: PAL.surfPop, borderLeft: `1px solid ${PAL.lineHi}`, boxShadow: SH.modal }}>
        <CekmeceBaslik kayit={kayit} onKapat={onKapat} kapatRef={kapatRef} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: `${SP.l}px ${SP.xl}px ${SP.xl}px`, display: "grid", gap: SP.l, alignContent: "start" }}>
          <SonHashKutusu h={kayit.di.son_hash || kayit.di.kok_hash} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: SP.s }}>
              <span style={{ ...TYPE.antet, color: PAL.ink2, textTransform: "uppercase" }}>Halkalar · kök → son</span>
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>{d.muhurlu}/{liste.length} mühürlü</span>
            </div>
            {liste.some((h) => h.ad) ? (
              <ol aria-label="Hash zinciri halkaları" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {liste.map((h, i) => <HalkaSatir key={h.no} h={h} son={i === liste.length - 1} durum={halkaDurumu(i, d)} az={az} />)}
              </ol>
            ) : <KompaktZincir liste={liste} d={d} az={az} />}
            {!liste.some((h) => h.ad) && liste.length > 0 && (
              <p style={{ margin: `${SP.s}px 0 0`, ...TYPE.meta, color: PAL.mut3 }}>Kalıcı kayıt halka sayısını ve son hash'i taşır; adım içerikleri sunucuda saklanır ve doğrulamada kullanılır.</p>
            )}
          </div>
          <Hukum d={d} />
        </div>
        <CekmeceAlt islemId={kayit.islemId} d={d} calisiyor={calisiyor} />
      </motion.aside>
    </div>,
    document.body,
  );
}

