/* MevzuatView — kapsamlı mevzuat referans paneli. Sistemdeki TÜM mevzuat (backend
   /mevzuat/katalog → data/mevzuat korpusu, RAG ile aynı kaynak) aranabilir katalog;
   kart tıklanınca okuma modalı tam metni gösterir (/mevzuat/icerik/{dosya}). Oturumda RAG'in
   önerdiği mevzuat da tıklanınca ilgili maddeye kaydırılmış açılır. Backend yoksa statik
   çekirdek katalog fallback.

   Görsel dil (2026-10 "Antet & Damga" — "Resmî Gazete okuma salonu"): arama-önce başlık,
   solda yapışkan tipografik DİZİN (kitap içindekiler sayfası: sıra no · konu · noktalı
   kılavuz · adet), sağda bölümler (§ 01 …) ve kitap sırtı gibi kartlar — mevzuat numarası
   Archivo ile kartın kahramanı, künye mono tarih satırı. Çekirdek mevzuat sırt şeridiyle,
   mülga mevzuat üstü çizili numarayla işaretlenir. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { ViewWrap, EmptyState, Icon, Btn, MONO, DISPLAY, T, V, R, BANT, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, SR_ONLY } from "./neonUi.jsx";
import { cleanDemoText } from "./result-cards.jsx";
import { OkumaModal } from "./MevzuatOkuma.jsx";
import { kunyeCoz, NITELIK, atifCoz, katalogEslesir } from "../lib/mevzuatKunye.js";
import { vurguParcala } from "../lib/mevzuatVurgu.js";

/* Sistemin dayandığı çekirdek mevzuat — katalogda etiketlenir + listede öne alınır.
   2709 = Anayasa (dilekçe/bilgi edinme üst-normu, m.74); 2026-07 genişletmesiyle eklendi. */
const CEKIRDEK_NO = new Set(["2709", "3071", "4982", "7201", "2646", "5018", "2005-7", "6698"]);

/* Backend kapalıyken (statik dağıtım / demo) asgari referans listesi — eski davranış. */
const STATIK_KATALOG = [
  { no: "2709", tur: "Anayasa", ad: "Türkiye Cumhuriyeti Anayasası (seçili md.)", aciklama: "Dilekçe/bilgi edinme hakkı (m.74), başvuru yollarının bildirilmesi (m.40), idari işleme karşı yargı yolu (m.125); evrak haklarının üst normu." },
  { no: "3071", tur: "Kanun", ad: "Dilekçe Hakkının Kullanılmasına Dair Kanun", aciklama: "Zorunlu unsurlar (ad-soyad, imza, adres) ve 30 günlük cevap süresi (m.4, m.7)." },
  { no: "4982", tur: "Kanun", ad: "Bilgi Edinme Hakkı Kanunu", aciklama: "Bilgi/belge taleplerinde 15 iş günü cevap süresi ve istisnalar." },
  { no: "7201", tur: "Kanun", ad: "Tebligat Kanunu", aciklama: "Resmî tebligat usulü; dava açma sürelerinin başlangıcı." },
  { no: "2646", tur: "Yönetmelik", ad: "Resmî Yazışmalarda Usul ve Esaslar Yönetmeliği", aciklama: "Üst/cevabi/olur yazı formatı, sayı-konu-ilgi düzeni, e-imza." },
  { no: "5018", tur: "Kanun", ad: "Kamu Mali Yönetimi ve Kontrol Kanunu", aciklama: "Ödeme/tahakkuk süreçleri; mali evrak yönlendirme." },
  { no: "2005-7", tur: "Genelge", ad: "Standart Dosya Planı (Başbakanlık Genelgesi)", aciklama: "Evrak saklama/arşiv kodları ve saklama süreleri." },
  { no: "6698", tur: "Kanun", ad: "Kişisel Verilerin Korunması Kanunu (KVKK)", aciklama: "TCKN/telefon gibi kişisel verilerin maskelenmesi ve işlenme ilkeleri." },
];

const trLower = (s) => String(s || "").toLocaleLowerCase("tr");

/* Kategori başlığı altındaki tek satırlık rehber — personelin grubu tanıması için.
   Anahtarlar backend _KATEGORI_KURALLARI adlarıyla birebir; eksik ad = açıklamasız grup. */
const KATEGORI_ACIKLAMA = {
  "İdari Usul & Yazışma": "Anayasal haklar, dilekçe, bilgi edinme, tebligat, resmî yazışma, arşiv, e-imza ve bilgi güvenliği; günlük evrak işinin temeli.",
  "Vergi & Kamu Maliyesi": "Vergi kanunları, harçlar, amme alacakları, kamu ihalesi ve mali yönetim.",
  "Sağlık": "Sağlık hizmetleri, meslek kanunları (hekim/eczacı/hemşire), hasta hakları.",
  "Yargı & Adalet": "Usul kanunları, icra-iflas, ceza ve infaz, arabuluculuk, adli meslekler.",
  "Kamu Personeli": "Memur statüsü, disiplin, şikâyet-müracaat, harcırah, mal bildirimi.",
  "Çalışma, Sosyal Güvenlik & Aile": "İş kanunları, SGK, emeklilik, sendikalar, sosyal hizmet ve aile koruması.",
  "Eğitim, Gençlik & Spor": "Eğitim sistemi, yükseköğretim, burs-yurt, mesleki yeterlilik, spor.",
  "Güvenlik & Kamu Düzeni": "Askerlik, terörle mücadele, kaçakçılık, özel güvenlik, toplantı-gösteri.",
  "Tarım, Hayvancılık & Gıda": "Tarım destekleri, veterinerlik, tohum-ıslah, mera ve toprak koruma.",
  "Çevre, Orman & Su": "Çevre izin/denetim, atık, hava-su-gürültü kontrolü, orman ve sular.",
  "İmar, Şehircilik & Afet": "İmar, yapı ruhsatı, tapu-kadastro, kamulaştırma, afet ve dönüşüm.",
  "Enerji & Madencilik": "Maden, petrol, doğal gaz, elektrik piyasası ve yenilenebilir enerji.",
  "Ulaştırma & Haberleşme": "Trafik, taşıma, havacılık-denizcilik, posta ve elektronik haberleşme.",
  "Kültür, Turizm & Medya": "Kültür varlıkları, turizm, basın-yayın, internet ve fikri haklar.",
  "STK & Meslek Kuruluşları": "Dernekler, vakıflar, yardım toplama, odalar-borsalar ve esnaf kuruluşları.",
  "Ekonomi, Ticaret & Sanayi": "Ticaret, rekabet, tüketici, bankacılık-finans, gümrük, sanayi ve yatırımlar.",
  "Kamu Yönetimi & Yerel İdare": "Teşkilat, il ve belediye idaresi, nüfus-vatandaşlık, Sayıştay, seçimler.",
  "Diğer": "Belirli bir gruba atanmamış mevzuat.",
};

/* RAG önerisi → katalog dosyası + madde no + tür. Backend artık `kaynak_dosya`/`madde_no`/
   `madde_tur` gönderir (chunk metadata'sından gelen DOĞRULANABİLİR bağ) — onu tercih ederiz.
   `madde_tur` şart: "Ek Madde 1" ve normal "Madde 1" aynı no'yu taşır; modal doğru bloğu
   ancak tür ile ayırır. Alanları taşımayan eski/statik öneriler için başlıktan türetmeye
   düşülür ("3071 dilekce hakki kanunu m.4" → dosya adı sözleşmesi). Katalogda yoksa null. */
function oneriHedef(m, dosyalar) {
  const maddeNo = (x) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
  const dogrudan = String(m?.kaynak_dosya || "");
  if (dogrudan && dosyalar.has(dogrudan)) {
    return { dosya: dogrudan, maddeNo: maddeNo(m.madde_no), maddeTur: m.madde_tur || "madde" };
  }
  const ham = String(m?.baslik || "");
  const madde = ham.match(/\s+m\.(\d+)\s*$/i);
  const etiket = ham.replace(/\s+m\.\d+\s*$/i, "").replace(/\s*\[DOĞRULA:.*$/i, "").trim();
  const dosya = etiket.replace(/\s+/g, "_");
  if (!dosyalar.has(dosya)) return null;
  return { dosya, maddeNo: madde ? Number(madde[1]) : null, maddeTur: "madde" };
}

/* ——— Görüntü türetmeleri (YALNIZ sunum; arama/filtre ham alanlar üzerinde çalışır) ——— */

/* Başlıktan tür etiketi (sırtın alt satırı). */
const TURLER = [
  ["anayasa", "Anayasa"], ["yönetmeli", "Yönetmelik"], ["tebliğ", "Tebliğ"],
  ["genelge", "Genelge"], ["kararname", "Kararname"], ["usul ve esas", "Usul ve Esas"], ["esas ve usul", "Usul ve Esas"],
  ["kanun", "Kanun"],
];
function turBul(m) {
  const b = trLower(m.baslik);
  // "… Hakkında Kanun" / "… Kanunu (G.V.K.)": ad kanunla bitiyorsa içinde "usul" geçse de kanundur.
  if (/kanunu?$/.test(b.replace(/\s*\(.*?\)\s*/g, " ").trim()) && !b.includes("yönetmeli")) return "Kanun";
  const bulunan = TURLER.find(([anahtar]) => b.includes(anahtar)) || (String(m.no).includes("-") ? TURLER[3] : null);
  return bulunan ? bulunan[1] : "Mevzuat";
}

/* Künye satırı: RG tarih/sayı çözülürse onu, yoksa kabul/karar tarihi ya da alt başlığı gösterir
   (ham künye dağınıklığı karta düşmez — ayrıştırıcı okuma başlığıyla ORTAK, lib/mevzuatKunye). */
// Büyük/küçük harf DUYARLI: "kısmen mülga" notu taşıyan yürürlükteki kanun üstü çizilmez (bkz. lib).
const mulgaMi = (m, kn) => kn.mulga || /\bMÜLGA\b/.test(m.baslik);

/* Görünüme özgü CSS — yalnız düzen kırılımları ve hover mekaniği (var() token'ları; hex yok).
   Satır-içi stil medya sorgusu/hover taşıyamadığı için tek <style>; sınıflar "mv-" önekli.
   İmza: kart üzerinde mevzuat numarası Archivo'nun GENİŞLİK ekseninde açılır (font-stretch) —
   sırt sütunu sabit genişlikte, komşu yerleşim kıpırdamaz. */
const MV_CSS = `
.mv-duzen{display:grid;grid-template-columns:clamp(232px,17vw,296px) minmax(0,1fr);gap:${SP.xxl + 8}px;align-items:start}
.mv-dizin{min-width:0;position:sticky;top:${SP.l}px;max-height:calc(100vh - ${SP.xxl}px);overflow-y:auto;overscroll-behavior:contain;padding-bottom:${SP.l}px;scrollbar-width:thin}
.mv-dizin-oge:hover{background:var(--ke-hov)}
.mv-dizin-oge:hover .mv-dizin-ad{color:var(--ke-ink)}
.mv-kart{transition:border-color .14s ease-out, box-shadow .14s ease-out, transform .14s var(--ke-ease-out)}
.mv-kart:hover{border-color:var(--ke-line-hi)!important;box-shadow:var(--ke-sh-card)}
.mv-kart .mv-no{transition:font-stretch .42s var(--ke-ease-out), letter-spacing .42s var(--ke-ease-out)}
.mv-kart:hover .mv-no,.mv-kart:focus-visible .mv-no{font-stretch:125%!important;letter-spacing:-.045em!important}
.mv-kart .mv-ok{opacity:0;transform:translateX(-4px);transition:opacity .16s ease-out, transform .2s var(--ke-ease-out)}
.mv-kart:hover .mv-ok,.mv-kart:focus-visible .mv-ok{opacity:1;transform:none}
.mv-ara:focus-within{border-color:var(--ke-t)!important;box-shadow:0 0 0 3px color-mix(in srgb, var(--ke-t) 18%, transparent)!important}
/* Tek odak halkası: halka KAPTA (label) çizilir; içteki girdi global :focus-visible kuralından
   muaf (tur 6: iç içe iki dikdörtgen halka). Tarayıcının kalın "×" temizleme glifi gizli —
   yerine token renkli kendi temizle düğmemiz var. */
.mv-ara input:focus-visible{box-shadow:none!important;border-color:transparent!important;outline:none!important}
.mv-ara input::-webkit-search-cancel-button,.mv-ara input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;display:none}
.mv-temizle{opacity:.72;transition:opacity .12s ease-out, background .12s ease-out}
.mv-temizle:hover{opacity:1;background:var(--ke-hov)}
.mv-bolum > summary{list-style:none}
.mv-vurgu{color:inherit;border-radius:2px;padding:0;background-image:linear-gradient(color-mix(in srgb, var(--ke-bant-sari) 38%, transparent),color-mix(in srgb, var(--ke-bant-sari) 38%, transparent));background-repeat:no-repeat;background-position:0 85%;background-size:100% 70%;background-color:transparent;animation:mv-kalem .18s var(--ke-ease-out) both}
@keyframes mv-kalem{from{background-size:0% 70%}to{background-size:100% 70%}}
@media (max-width:1023px){
  .mv-duzen{grid-template-columns:minmax(0,1fr);gap:${SP.l}px}
  .mv-dizin{position:static;max-height:none;overflow:visible;padding:0;margin:0 calc(-1 * clamp(16px,4vw,40px))}
  .mv-dizin-baslik,.mv-dizin-kilavuz,.mv-dizin-sira,.mv-dizin-dip{display:none!important}
  .mv-dizin-liste{display:flex!important;gap:${SP.xs}px;overflow-x:auto;padding:2px clamp(16px,4vw,40px) ${SP.s}px!important;scroll-snap-type:x proximity;scrollbar-width:none}
  .mv-dizin-liste::-webkit-scrollbar{display:none}
  .mv-dizin-liste > li{flex-shrink:0;scroll-snap-align:start}
  .mv-dizin-oge{border:1px solid var(--ke-line)!important;border-radius:999px!important;padding:7px 14px!important;min-height:44px;display:inline-flex!important;align-items:center}
  .mv-dizin-oge[aria-pressed="true"]{border-color:transparent!important}
  .mv-dizin-imlec{display:none}
  .mv-dizin-ad{white-space:nowrap}
}
@media (max-width:640px){
  .mv-ara-satir{flex-direction:column;align-items:stretch!important}
  .mv-kisayol{display:none}
  .mv-ara{flex:none!important}
  .mv-kart{grid-template-columns:76px minmax(0,1fr)!important}
  .mv-tur{font-size:8.5px;letter-spacing:.03em}
}
`;

/* Fosforlu kalem — sorgu sözcükleri kart başlığında / madde alıntısında işaretlenir
   (background-size 0→100%, 180 ms). Yalnız görüntü: eşleşme mantığı listelenen filtresinde
   ve backend BM25'te; parçalama lib/mevzuatVurgu (tr büyük/küçük harf, test edilmiş). */
function Vurgulu({ metin, q }) {
  return vurguParcala(metin, q).map((p, i) => (p.vurgu ? <mark key={i} className="mv-vurgu">{p.metin}</mark> : p.metin));
}

/* Kitap sırtı kartı — sol sütun "sırt" (numara kahraman), sağda başlık + RG tarih satırı.
   Numarasız kayıt (yönetmelik/tebliğ) sırtta Resmî Gazete YILINI taşır — mono "RG" önekiyle,
   soluk renkte (numarayla karışmaz); yıl da yoksa § glifi. "Yön."/"Gen." kısaltması YOK (tur 6).
   ek: aynı numaralı ikinci kayıt (2646 — Elektronik Yazışma) sırtta kısa ek etiketi alır. */
function SirtNumara({ no, yil, tur, mulga, cekirdek, ek }) {
  const uzun = String(no || "").length > 4;
  const ana = no || yil || "§";
  const renk = mulga ? PAL.mut3 : cekirdek ? DERIN.T : no ? PAL.ink : PAL.mut2;
  return (
    <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: SP.s, padding: `${SP.m + 2}px ${SP.s}px ${SP.m}px ${SP.m + 2}px`,
      background: cekirdek ? ALFA(T) : PAL.surf2, borderRight: `1px solid ${PAL.line}`, position: "relative", minWidth: 0 }}>
      {cekirdek && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: T }} />}
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {!no && yil && <span style={{ ...TYPE.antet, fontSize: 9.5, color: PAL.mut3 }}>RG YILI</span>}
        <span className="mv-no" style={{ fontFamily: DISPLAY, fontWeight: no ? 800 : 700, fontSize: uzun ? 19 : no ? 28 : 24, lineHeight: uzun ? "22px" : "28px",
          fontStretch: "100%", letterSpacing: "-.03em", color: renk, textDecoration: mulga ? "line-through" : "none", textDecorationThickness: 2, whiteSpace: "nowrap", ...TNUM }}>{ana}</span>
        {ek && <span style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: 10, lineHeight: "14px", fontWeight: 600, letterSpacing: ".06em", color: cekirdek ? DERIN.T : PAL.mut2, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.chip, padding: "0 5px" }}>EK · {ek}</span>}
      </span>
      <span style={{ ...TYPE.antet, fontSize: 9.5, letterSpacing: ".1em", color: cekirdek ? DERIN.T : PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <span className="mv-tur">{tur}</span>
      </span>
    </span>
  );
}

/* Başlığın "— Ek Bölüm" kuyruğundan kısa ek etiketi: "Elektronik Yazışma" → "EY". */
const ekKisaltma = (baslik) => {
  const kuyruk = String(baslik || "").split(/\s[—–]\s/)[1];
  if (!kuyruk) return null;
  return kuyruk.split(/\s+/).filter((k) => k.length > 2).map((k) => k[0]).join("").toLocaleUpperCase("tr").slice(0, 3) || null;
};
const rgYili = (kn) => (String(kn.rgTarih || kn.kabul || kn.kararTarih || "").match(/(1[89]|20)\d\d/) || [null])[0];

/* Metnin niteliği (sunucu katalogda hesaplar: lafzi | yakin | ozet | null). Korpusun çoğu
   madde özetidir → özet sessiz gri; yalnız lafzî metin yeşil. Açıklama title + ekran okuyucuda
   (renk tek sinyal değil). Beyan yoksa hiçbir şey basılmaz — nitelik uydurulmaz. */
const NITELIK_KISA = { lafzi: "lafzî", yakin: "yakın-lafzî", ozet: "özet" };
function NitelikEtiketi({ nitelik }) {
  const n = nitelik && NITELIK[nitelik];
  if (!n) return null;
  return (
    <span title={`${n.ad} — ${n.aciklama}`} style={{ color: nitelik === "lafzi" ? DERIN.yesil : nitelik === "yakin" ? PAL.mut2 : PAL.mut3, fontWeight: nitelik === "lafzi" ? 600 : 400 }}>
      {NITELIK_KISA[nitelik]}<span style={SR_ONLY}>: {n.aciklama}</span>
    </span>
  );
}

/* Künye satırı: RG tarih + sayı TEK PARÇA ve asla kırpılmaz (hukuki atfın kimliği); dar
   kartta önce nitelik etiketi, sonra madde sayısı geri çekilir (tur 6: "S.…" kesiliyordu). */
function KartKunye({ m, kn, mulga }) {
  const yedek = kn.kabul ? `Kabul ${kn.kabul}` : kn.kararTarih ? `Karar ${kn.kararTarih}` : kn.duz ? "Düstur" : kn.altBaslik;
  return (
    <span style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: SP.s, minWidth: 0, fontFamily: MONO, fontSize: 11.5, lineHeight: "16px", color: PAL.mut2, ...TNUM }}>
      {kn.rgTarih ? (
        <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          <span style={{ color: PAL.mut3 }}>RG </span>{kn.rgTarih}{kn.rgSayi && <span style={{ color: PAL.mut3 }}> · S.{kn.rgSayi}</span>}
        </span>
      ) : (
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{yedek || "künye yok"}</span>
      )}
      {mulga && <span style={{ ...TYPE.meta, fontSize: 11, fontWeight: 600, color: DERIN.R, whiteSpace: "nowrap", flexShrink: 0 }}>Mülga</span>}
      {kn.durum === "kismen" && <span style={{ ...TYPE.meta, fontSize: 11, fontWeight: 600, color: DERIN.sari, whiteSpace: "nowrap", flexShrink: 0 }}>Kısmen yürürlükte</span>}
      <span style={{ marginLeft: "auto", flexShrink: 0, whiteSpace: "nowrap", color: PAL.mut3, display: "inline-flex", alignItems: "center", gap: SP.xs }}>
        <span>{m.madde_sayisi > 0 ? `${m.madde_sayisi} md.` : "tam metin"}</span>
        <span className="mv-ok" style={{ display: "inline-flex", color: DERIN.T, flexShrink: 0 }}><Icon.arrow width={14} height={14} /></span>
      </span>
    </span>
  );
}

function KatalogKart({ m, onAc, sira = 0, q = "", ciftNo = false }) {
  const cekirdek = CEKIRDEK_NO.has(m.no);
  const kn = kunyeCoz(m.kunye);
  const mulga = mulgaMi(m, kn);
  return (
    <button type="button" onClick={() => onAc({ dosya: m.dosya, maddeNo: null })} aria-haspopup="dialog" {...focusRing} data-press="" className="mv-kart"
      title={m.kunye || undefined} data-dosya={m.dosya}
      style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", textAlign: "left", padding: 0, overflow: "hidden", borderRadius: RAD.card, background: PAL.surf,
        border: `1px solid ${PAL.line}`, cursor: "pointer", minHeight: 112, color: "inherit", font: "inherit",
        animation: `nu-rise .38s var(--ke-ease-out) ${Math.min(sira, 14) * 28}ms backwards` }}>
      <SirtNumara no={m.no} yil={rgYili(kn)} tur={turBul(m)} mulga={mulga} cekirdek={cekirdek} ek={ciftNo ? ekKisaltma(m.baslik) : null} />
      <span style={{ display: "flex", flexDirection: "column", gap: SP.s, padding: `${SP.m + 2}px ${SP.l}px ${SP.m}px`, minWidth: 0 }}>
        {(cekirdek || NITELIK[m.nitelik]) && (
          /* Üst künye: solda ÇEKİRDEK, sağda metnin niteliği — alt satırdaki RG sayısıyla yer
             yarışmaz (tur 6: "S.…" ve "yakın-l…" kesiliyordu). */
          <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginBottom: -4, ...TYPE.antet, fontSize: 10 }}>
            {cekirdek && <span title="Sınıflandırma ve yasal süre kurallarının dayandığı çekirdek mevzuat" style={{ color: DERIN.T }}>ÇEKİRDEK</span>}
            <span className="mv-nit" style={{ marginLeft: "auto", fontFamily: MONO, letterSpacing: ".02em", whiteSpace: "nowrap" }}><NitelikEtiketi nitelik={m.nitelik} /></span>
          </span>
        )}
        <span style={{ ...TYPE.ui, fontWeight: 600, color: mulga ? PAL.mut2 : PAL.ink, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textWrap: "pretty" }}><Vurgulu metin={m.baslik} q={q} /></span>
        <KartKunye m={m} kn={kn} mulga={mulga} />
      </span>
    </button>
  );
}

/* Oturumda RAG'in önerdiği kaynak — katalogda karşılığı varsa tıklanınca ilgili maddeye açılır.
   Hover/press diğer tıklanabilir kartlarla (KatalogKart/DerinSonucSatir) AYNI dilde — önceden
   bu kart hover'da sessiz kalıyordu (sayfada ilk görülen öneri bölgesi tıklanabilirliğini
   göstermiyordu). */
function OneriSatir({ m, dosyalar, katalogAd, onAc }) {
  const hedef = oneriHedef(m, dosyalar);
  // Görünen ad: backend gosterim_adi → katalogdaki resmî ad + madde → (son çare) ham başlık.
  // Ham başlık dosya slug'ıdır ("kvkk aydinlatma yukumlulugu tebligi m.5") — tur4 bulgusu.
  const resmi = hedef && katalogAd?.get(hedef.dosya);
  const ad = m.gosterim_adi || (resmi ? `${resmi}${hedef.maddeNo != null ? ` m.${hedef.maddeNo}` : ""}` : cleanDemoText(m.baslik));
  const govde = (
    <>
      <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{ad}</div>
      {m.snippet && <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cleanDemoText(m.snippet)}</p>}
    </>
  );
  const stil = { borderLeft: `2px solid ${V}`, paddingLeft: SP.m };
  if (!hedef) return <div style={{ ...stil, padding: `${SP.s}px 0 ${SP.s}px ${SP.m}px` }}>{govde}</div>;
  return (
    <button type="button" onClick={() => onAc(hedef)} aria-haspopup="dialog" {...focusRing} data-press="" className="mv-kart"
      style={{ display: "block", textAlign: "left", background: "transparent", border: "1px solid transparent", borderLeft: stil.borderLeft, borderRadius: `0 ${RAD.ctl}px ${RAD.ctl}px 0`, cursor: "pointer", padding: `${SP.s}px ${SP.m}px ${SP.s}px ${SP.m}px`, width: "100%", color: "inherit", font: "inherit" }}>
      {govde}
      <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, marginTop: SP.s, ...TYPE.meta, fontWeight: 600, color: DERIN.V }}>
        {hedef.maddeNo != null ? `m.${hedef.maddeNo} — tam metinde aç` : "Tam metni oku"} <Icon.arrow />
      </span>
    </button>
  );
}

/* Tipografik dizin — kitabın içindekiler sayfası: sıra no · konu · noktalı kılavuz · adet.
   Seçili konu, yay fiziğiyle kayan mürekkep imleci (layoutId) ile işaretlenir. Telefonda
   yatay kaydırılan şeride dönüşür (CSS). Filtre mantığı değişmedi: tıklama = kategori seç/bırak. */
function DizinOge({ ad, adet, sira, aktif, onSec }) {
  return (
    <li style={{ position: "relative", minWidth: 0 }}>
      {aktif && <motion.span layoutId="mv-dizin-imlec" className="mv-dizin-imlec" aria-hidden="true"
        transition={{ type: "spring", stiffness: 520, damping: 40 }}
        style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 2, borderRadius: 2, background: T }} />}
      <button type="button" onClick={onSec} aria-pressed={aktif} {...focusRing} data-press="" className="mv-dizin-oge"
        style={{ display: "flex", alignItems: "last baseline", gap: SP.s, width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer", border: "none",
          background: aktif ? ALFA(T) : "transparent", borderRadius: RAD.chip, padding: "6px 10px 6px 14px", color: "inherit", font: "inherit",
          transition: "background .12s ease-out" }}>
        <span className="mv-dizin-sira" style={{ alignSelf: "first baseline", fontFamily: MONO, fontSize: 11, color: aktif ? DERIN.T : PAL.mut3, minWidth: 18, ...TNUM }}>{sira}</span>
        <span className="mv-dizin-ad" style={{ ...TYPE.data, fontWeight: aktif ? 600 : 450, color: aktif ? PAL.ink : PAL.ink2, minWidth: 0, textWrap: "balance", transition: "color .12s ease-out" }}>{ad}</span>
        <span className="mv-dizin-kilavuz" aria-hidden="true" style={{ flex: 1, minWidth: 8, alignSelf: "flex-end", marginBottom: 4, borderBottom: `1px dotted ${PAL.lineHi}` }} />
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: aktif ? DERIN.T : PAL.mut, ...TNUM }}>{adet}</span>
      </button>
    </li>
  );
}

function Dizin({ kategoriler, kategoriAdet, toplam, kategori, setKategori, cekirdekSayi }) {
  return (
    <nav aria-label="Kategori dizini" className="mv-dizin">
      <div className="mv-dizin-baslik" style={{ ...TYPE.antet, color: PAL.mut3, display: "flex", alignItems: "center", gap: SP.s, padding: `0 0 ${SP.s}px 14px`, borderBottom: `1px solid ${PAL.ink}`, marginBottom: SP.s }}>
        DİZİN<span style={{ marginLeft: "auto" }}>ADET</span>
      </div>
      <div role="group" aria-label="Kategori filtresi">
        <ol className="mv-dizin-liste" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 1 }}>
          <DizinOge ad="Tüm mevzuat" adet={toplam} sira="—" aktif={!kategori} onSec={() => setKategori("")} />
          {kategoriler.map((ad, i) => (
            <DizinOge key={ad} ad={ad} sira={String(i + 1).padStart(2, "0")} adet={kategoriAdet.get(ad) || 0} aktif={kategori === ad}
              onSec={() => setKategori(kategori === ad ? "" : ad)} />
          ))}
        </ol>
      </div>
      <div className="mv-dizin-dip" style={{ marginTop: SP.l, padding: `${SP.m}px 0 0 14px`, borderTop: `1px solid ${PAL.line}`, display: "grid", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: SP.s }}>
          <span aria-hidden="true" style={{ width: 10, height: 14, background: ALFA(T), boxShadow: `inset 3px 0 0 ${T}`, borderRadius: 2 }} />
          Çekirdek mevzuat · {cekirdekSayi}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: SP.s }}>
          <span aria-hidden="true" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 11, color: PAL.mut3, textDecoration: "line-through", textDecorationThickness: 2 }}>00</span>
          Mülga (yürürlükte değil)
        </span>
        <span style={{ display: "flex", alignItems: "flex-start", gap: SP.s, textWrap: "pretty" }}>
          <span aria-hidden="true" style={{ flexShrink: 0, width: 10, height: 10, marginTop: 3, borderRadius: 2, background: ALFA(BANT.sari.c), boxShadow: `inset 0 0 0 1px ${BANT.sari.c}` }} />
          Metnin niteliği (lafzî / madde özeti) okuma penceresinde yazar; özet metin hukuki atıf için yeterli değildir.
        </span>
      </div>
    </nav>
  );
}

/* Açılır chevron — <summary> katlama durumunu gösterir (details[open]'da 90° döner). */
const ChevronSag = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const KART_IZGARA = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: SP.m, alignItems: "stretch" };

/* Kategori bölümü — katlanabilir (native <details>), kitap bölümü gibi: "§ 01" + geniş başlık.
   Katalog tek sayfada 304 kayıt = 18.7 ekranlık kesintisiz kaydırma (Playwright ölçümü) →
   memur konu grubunu göz ile arıyordu. <details> ile: klavye/erişilebilirlik native,
   reduced-motion'da anında, sıfır bağımlılık. Arama/filtre aktifken (acik) tüm gruplar açık gelir. */
function KategoriGrup({ ad, sira, mevzuatlar, onAc, acik, q, ciftNolar }) {
  return (
    <details open={acik} aria-label={`${ad} mevzuatı`} className="mv-bolum" style={{ borderTop: `1px solid ${PAL.lineHi}`, padding: `${SP.m}px 0 ${SP.l}px` }}>
      <summary data-dokunma="" style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: SP.m, padding: `${SP.s}px ${SP.s}px ${SP.s}px 0`, borderRadius: RAD.ctl }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: DERIN.T, minWidth: 34, ...TNUM }}>§ {sira}</span>
        <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink, minWidth: 0 }}>{ad}</h2>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: PAL.mut, ...TNUM, whiteSpace: "nowrap" }}>{mevzuatlar.length} kaynak</span>
        <span aria-hidden="true" style={{ display: "flex", alignSelf: "center", color: PAL.mut2, transition: "transform .18s var(--ke-ease-out)", flexShrink: 0 }} className="mev-chevron"><ChevronSag /></span>
      </summary>
      {KATEGORI_ACIKLAMA[ad] && (
        <p style={{ margin: `0 0 ${SP.l}px 46px`, ...TYPE.data, color: PAL.mut2, maxWidth: 720 }}>{KATEGORI_ACIKLAMA[ad]}</p>
      )}
      <div style={KART_IZGARA}>
        {mevzuatlar.map((m, i) => <KatalogKart key={m.dosya} m={m} onAc={onAc} sira={i} q={q} ciftNo={!!m.no && ciftNolar?.has(m.no)} />)}
      </div>
    </details>
  );
}

/* Arama modu seçici — "Katalogda" (başlık/künye) | "Madde içinde" (BM25 derin arama). */
function AramaModSecici({ modu, onSec }) {
  const secenekler = [["katalog", "Katalogda"], ["derin", "Madde içinde"]];
  return (
    <div role="group" aria-label="Arama modu" style={{ display: "inline-flex", padding: 3, borderRadius: RAD.ctl + 2, border: `1px solid ${PAL.line}`, background: PAL.surfHi, flexShrink: 0 }}>
      {secenekler.map(([k, ad]) => (
        <button key={k} type="button" onClick={() => onSec(k)} aria-pressed={modu === k} {...focusRing} data-press="" data-dokunma=""
          style={{ position: "relative", cursor: "pointer", padding: "8px 14px", borderRadius: RAD.ctl, border: "none", background: "transparent",
            color: modu === k ? DERIN.T : PAL.mut2, ...TYPE.data, fontWeight: modu === k ? 600 : 500, flex: 1, whiteSpace: "nowrap" }}>
          {modu === k && <motion.span layoutId="mv-mod-zemin" aria-hidden="true" transition={{ type: "spring", stiffness: 500, damping: 38 }}
            style={{ position: "absolute", inset: 0, borderRadius: RAD.ctl, background: PAL.surf, boxShadow: SH.card }} />}
          <span style={{ position: "relative" }}>{ad}</span>
        </button>
      ))}
    </div>
  );
}

/* Derin arama sonucu — madde alıntısı: sırtta madde no (mühür moru), sağda kanun + alıntı.
   Tıklanınca okuma modalı İLGİLİ MADDEDE açılır. */
function DerinSonucSatir({ s, onAc, sira = 0, q = "" }) {
  return (
    <button type="button" onClick={() => onAc({ dosya: s.dosya, maddeNo: s.madde_no ?? null, maddeTur: s.madde_tur ?? null, sorgu: q })}
      aria-haspopup="dialog" {...focusRing} data-press="" className="mv-kart"
      style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", width: "100%", textAlign: "left", padding: 0, overflow: "hidden", borderRadius: RAD.card, background: PAL.surf,
        border: `1px solid ${PAL.line}`, cursor: "pointer", color: "inherit", font: "inherit", animation: `nu-rise .34s var(--ke-ease-out) ${Math.min(sira, 12) * 24}ms backwards` }}>
      <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: `${SP.m + 2}px ${SP.s}px ${SP.m}px ${SP.m + 2}px`, background: ALFA(V), borderRight: `1px solid ${PAL.line}` }}>
        <span style={{ ...TYPE.antet, fontSize: 9.5, color: DERIN.V }}>{s.madde_tur === "ek" ? "EK" : s.madde_tur === "gecici" ? "GEÇİCİ" : "MADDE"}</span>
        <span className="mv-no" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, lineHeight: "30px", fontStretch: "100%", letterSpacing: "-.03em", color: DERIN.V, ...TNUM }}>{s.madde_no ?? "§"}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: SP.xs + 2, padding: `${SP.m + 2}px ${SP.l}px ${SP.m}px`, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, minWidth: 0 }}>
          {s.no && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: DERIN.T, flexShrink: 0 }}>{s.no}</span>}
          <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{s.baslik}</span>
        </span>
        <span style={{ ...TYPE.ui, color: PAL.ink2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}><Vurgulu metin={s.snippet} q={q} /></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, marginTop: "auto", ...TYPE.meta, fontWeight: 600, color: DERIN.T }}>Maddeye git <Icon.arrow /></span>
      </span>
    </button>
  );
}

/* Hata bandı — ne oldu · ne yapılmalı · tek eylem · (ikincil) mono teknik kod. Katalog ve
   madde-içi arama aynı dili konuşur; renk tek sinyal değil (ikon + kalın başlık metni). */
function HataBandi({ baslik, aciklama, kod, onTekrar }) {
  return (
    <div role="alert" style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", columnGap: SP.m, alignItems: "start", padding: `${SP.l}px ${SP.l}px ${SP.l}px ${SP.l + 2}px`,
      marginBottom: SP.xl, borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: `inset 3px 0 0 ${R}` }}>
      <span aria-hidden="true" style={{ display: "flex", color: DERIN.R, paddingTop: 1 }}><Icon.alert width={20} height={20} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.ui, fontWeight: 650, color: PAL.ink }}>{baslik}</div>
        <p style={{ margin: `${SP.xs}px 0 ${SP.m}px`, ...TYPE.data, color: PAL.mut2, maxWidth: 640, textWrap: "pretty" }}>{aciklama}</p>
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
          <Btn onClick={onTekrar}>Tekrar dene</Btn>
          {kod && <span style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: ".04em", color: PAL.mut3 }}>{kod}</span>}
        </div>
      </div>
    </div>
  );
}

const hataKodu = (e) => (/^\d+$/.test(e?.message) ? `HTTP ${e.message}` : "AĞ BAĞLANTISI");

/* Backend kapalıyken statik çekirdek liste (tıklanamaz — tam metin backend'den gelir). */
function StatikKatalog({ kod, onTekrar }) {
  return (
    <>
      <HataBandi baslik="Canlı katalog alınamadı" kod={kod} onTekrar={onTekrar}
        aciklama="Aşağıda sistemin dayandığı çekirdek mevzuatın kısa referans listesi var; tam metinler ve madde içi arama bağlantı gelince açılır." />
      <div style={{ ...TYPE.antet, color: PAL.mut3, margin: `0 0 ${SP.m}px` }}>ÇEVRİMDIŞI REFERANS · ÇEKİRDEK {STATIK_KATALOG.length} KAYNAK</div>
      <div style={KART_IZGARA}>
        {STATIK_KATALOG.map((k) => (
          <div key={k.no} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", overflow: "hidden", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, minHeight: 112 }}>
            <SirtNumara no={k.no} tur={k.tur} cekirdek />
            <div style={{ padding: `${SP.m + 2}px ${SP.l}px` }}>
              <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{k.ad}</div>
              <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>{k.aciklama}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* Yükleniyor — GERÇEK düzenin iskeleti: solda dizin çizgileri, sağda "§ 01" bölüm şeridi +
   iki sütun kart (sırt + iki satır). Katalog gelince hiçbir blok yer değiştirmez (tur 6: üç
   sütunlu iskeletten dizinli düzene sıçrama). */
const IskeletCubuk = ({ w, h = 12 }) => <span style={{ display: "block", height: h, width: w, borderRadius: 3, background: PAL.press }} />;
function KatalogIskelet() {
  return (
    <div aria-busy="true" className="mv-duzen">
      <span role="status" style={SR_ONLY}>Mevzuat kataloğu yükleniyor…</span>
      <div aria-hidden="true" className="mv-dizin" style={{ display: "grid", gap: SP.m, paddingLeft: 14, animation: "nu-think 1.6s ease-in-out infinite" }}>
        <span className="mv-dizin-baslik" style={{ display: "block", paddingBottom: SP.s, borderBottom: `1px solid ${PAL.ink}` }}><IskeletCubuk w={56} h={10} /></span>
        {[78, 64, 88, 58, 72, 84, 60, 70].map((w, i) => <IskeletCubuk key={i} w={`${w}%`} h={11} />)}
      </div>
      <div aria-hidden="true" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m + SP.s}px 0 ${SP.l}px`, borderTop: `1px solid ${PAL.lineHi}` }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3 }}>§ 01</span><IskeletCubuk w={220} h={16} />
        </div>
        <div style={KART_IZGARA}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "92px 1fr", height: 112, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, overflow: "hidden", background: PAL.surf, animation: `nu-think 1.6s ease-in-out ${i * 90}ms infinite` }}>
              <span style={{ background: PAL.surf2, borderRight: `1px solid ${PAL.line}`, padding: SP.m }}><IskeletCubuk w={48} h={22} /></span>
              <span style={{ padding: SP.l, display: "grid", gap: SP.s, alignContent: "start" }}><IskeletCubuk w="85%" /><IskeletCubuk w="55%" /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Arama başlığı — görünümün birincil öğesi: geniş arama alanı + mod seçici + sayaç satırı. */
function AramaBasligi({ aramaRef, filtre, setFiltre, aramaModu, setAramaModu, sayac }) {
  const [odakta, setOdakta] = useState(false);
  return (
    <div style={{ marginBottom: SP.xl + 4 }}>
      <div className="mv-ara-satir" style={{ display: "flex", alignItems: "center", gap: SP.m }}>
        <label className="mv-ara" style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: SP.m, padding: `0 ${SP.m}px 0 ${SP.l}px`, height: 54,
          borderRadius: RAD.card, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, boxShadow: SH.card, transition: "border-color .12s ease-out, box-shadow .16s ease-out", cursor: "text" }}>
          <span aria-hidden="true" style={{ display: "flex", color: odakta ? DERIN.T : PAL.mut2, transition: "color .12s ease-out" }}><Icon.search width={20} height={20} /></span>
          <input ref={aramaRef} type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)}
            placeholder={aramaModu === "derin" ? "Madde metninde ara: dilekçede zorunlu şartlar…" : "Kanun adı, numara veya konu ara…"}
            aria-label={aramaModu === "derin" ? "Mevzuat maddelerinin içinde ara" : "Mevzuat kataloğunda ara"}
            onFocus={() => setOdakta(true)} onBlur={() => setOdakta(false)}
            style={{ flex: 1, minWidth: 0, height: "100%", border: "none", background: "transparent", ...TYPE.read, color: PAL.ink, outline: "none" }} />
          {filtre && (
            <button type="button" className="mv-temizle" data-dokunma="" onClick={() => { setFiltre(""); aramaRef.current?.focus(); }} aria-label="Aramayı temizle" {...focusRing} data-press=""
              style={{ cursor: "pointer", display: "grid", placeItems: "center", width: 32, height: 32, flexShrink: 0, borderRadius: RAD.ctl, border: "none", background: "transparent", color: PAL.mut2, padding: 0 }}>
              <Icon.x width={16} height={16} />
            </button>
          )}
          {!filtre && !odakta && (
            <span aria-hidden="true" className="mv-kisayol" style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderBottomWidth: 2, borderRadius: RAD.chip, padding: "1px 7px", background: PAL.surf2, pointerEvents: "none" }}>/</span>
          )}
        </label>
        <AramaModSecici modu={aramaModu} onSec={setAramaModu} />
      </div>
      <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", marginTop: SP.m, ...TYPE.antet, color: PAL.mut3, ...TNUM }}>
        {sayac}
      </div>
    </div>
  );
}

const Sayi = ({ n }) => <NumberFlow value={n} style={{ color: "var(--ke-ink)", fontWeight: 600 }} />;

export default function MevzuatView({ history = [] }) {
  const [katalog, setKatalog] = useState(null);   // null=yükleniyor, "hata", [liste]
  const [kategoriler, setKategoriler] = useState([]); // backend'in sıralı grup listesi
  const [kategori, setKategori] = useState("");   // "" = tüm gruplar
  const [filtre, setFiltre] = useState("");
  const [aramaModu, setAramaModu] = useState("katalog"); // "katalog" | "derin" (madde içinde)
  const [derin, setDerin] = useState(null);       // null | "hata" | {q, sonuclar}
  const [derinBekliyor, setDerinBekliyor] = useState(false);
  const [katalogDeneme, setKatalogDeneme] = useState(0); // "Tekrar dene" → effect yeniden koşar
  const [derinDeneme, setDerinDeneme] = useState(0);
  const [hataKod, setHataKod] = useState(null);
  const [secili, setSecili] = useState(null);     // {dosya, maddeNo} → okuma modalı açık
  const sonOdak = useRef(null);
  const aramaRef = useRef(null);

  // "/" ile arama kutusuna odaklan (GitHub/Linear alışkanlığı) — yalnız Mevzuat aktifken
  // bağlı (mount/unmount ile), başka bir alanda yazarken (input/textarea) müdahale etmez.
  useEffect(() => {
    const dinle = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      e.preventDefault();
      aramaRef.current?.focus();
    };
    document.addEventListener("keydown", dinle);
    return () => document.removeEventListener("keydown", dinle);
  }, []);

  useEffect(() => {
    let iptal = false;
    setKatalog(null);
    fetch("/mevzuat/katalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (iptal) return;
        setKatalog(Array.isArray(d?.mevzuatlar) ? d.mevzuatlar : []);
        setKategoriler(Array.isArray(d?.kategoriler) ? d.kategoriler : []);
      })
      .catch((e) => { if (!iptal) { setHataKod(hataKodu(e)); setKatalog("hata"); } });
    return () => { iptal = true; };
  }, [katalogDeneme]);

  const ac = useCallback((h) => { sonOdak.current = document.activeElement; setSecili(h); }, []);
  const kapat = useCallback(() => { setSecili(null); sonOdak.current?.focus?.(); }, []); // odak tetikleyene döner (a11y)

  // Derin arama: mod aktif + sorgu ≥3 karakter → debounce'lu /mevzuat/derin-ara.
  useEffect(() => {
    if (aramaModu !== "derin") return undefined;
    const q = filtre.trim();
    if (q.length < 3) { setDerin(null); setDerinBekliyor(false); return undefined; }
    let iptal = false;
    setDerinBekliyor(true);
    const t = setTimeout(() => {
      fetch(`/mevzuat/derin-ara?q=${encodeURIComponent(q)}&limit=30`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        // Şekil doğrula: aşağıdaki render derin.sonuclar.length/.map çağırır — backend 200 ama
        // beklenmedik gövde (sonuclar yok/null/dizi değil) dönerse guard'sız erişim TypeError
        // fırlatıp TÜM Mevzuat görünümünü beyaz ekrana düşürürdü. Dizi değilse boş sonuç say.
        .then((d) => { if (!iptal) setDerin(d && Array.isArray(d.sonuclar) ? d : { q, sonuclar: [] }); })
        .catch((e) => { if (!iptal) { setHataKod(hataKodu(e)); setDerin("hata"); } })
        .finally(() => { if (!iptal) setDerinBekliyor(false); });
    }, 350);
    return () => { iptal = true; clearTimeout(t); };
  }, [aramaModu, filtre, derinDeneme]);

  // Oturumda RAG'in önerdiği mevzuat (gerçek), başlığa göre tekilleştir.
  const onerilen = useMemo(() => {
    const seen = new Map();
    for (const h of history) for (const m of (h.result?.mevzuat_onerileri || [])) {
      if (m?.baslik && !seen.has(m.baslik)) seen.set(m.baslik, m);
    }
    return [...seen.values()];
  }, [history]);

  const dosyalar = useMemo(() => new Set(Array.isArray(katalog) ? katalog.map((m) => m.dosya) : []), [katalog]);
  const katalogAd = useMemo(() => new Map(Array.isArray(katalog) ? katalog.map((m) => [m.dosya, m.baslik]) : []), [katalog]);

  // Arama + kategori filtresi birlikte; grup içi sıra: çekirdek önce, sonra Türkçe alfabetik.
  const listelenen = useMemo(() => {
    if (!Array.isArray(katalog)) return [];
    const q = filtre.trim();
    let uyan = q ? katalog.filter((m) => katalogEslesir(m, q)) : katalog;
    if (kategori) uyan = uyan.filter((m) => m.kategori === kategori);
    return [...uyan].sort((a, b) =>
      (CEKIRDEK_NO.has(b.no) - CEKIRDEK_NO.has(a.no)) || a.baslik.localeCompare(b.baslik, "tr"));
  }, [katalog, filtre, kategori]);

  // Kategori başına adet (dizin) — arama uygulanmış hâliyle değil, tüm katalogla sayılır
  // (dizin adetleri sabit kalır; arama sonucu bölüm başlıklarındaki adetten okunur).
  const kategoriAdet = useMemo(() => {
    const sayim = new Map();
    if (Array.isArray(katalog)) for (const m of katalog) sayim.set(m.kategori, (sayim.get(m.kategori) || 0) + 1);
    return sayim;
  }, [katalog]);
  // Aynı numarayı taşıyan birden çok kayıt (2646 Yönetmelik + Elektronik Yazışma bölümü):
  // sırtta ek etiketi alır — kahraman rakam aynı olunca kopya kayıt gibi okunuyordu (tur 6).
  const ciftNolar = useMemo(() => {
    const say = new Map();
    if (Array.isArray(katalog)) for (const m of katalog) if (m.no) say.set(m.no, (say.get(m.no) || 0) + 1);
    return new Set([...say].filter(([, n]) => n > 1).map(([no]) => no));
  }, [katalog]);
  const cekirdekSayi = useMemo(() => (Array.isArray(katalog) ? katalog.filter((m) => CEKIRDEK_NO.has(m.no)).length : 0), [katalog]);

  // Gruplu görünüm: backend'in kategori sırasıyla, yalnız eşleşmesi olan gruplar.
  // Bölüm numarası (§ 01) dizindeki sıra numarasıyla AYNI — filtrelenince de değişmez.
  const gruplar = useMemo(() => {
    const sira = kategoriler.length ? kategoriler : [...new Set(listelenen.map((m) => m.kategori))];
    return sira
      .map((ad, i) => [ad, listelenen.filter((m) => m.kategori === ad), String(i + 1).padStart(2, "0")])
      .filter(([, uyeler]) => uyeler.length > 0);
  }, [kategoriler, listelenen]);

  const katalogHazir = aramaModu === "katalog" && Array.isArray(katalog);
  // Atıf sorgusu ("4982 m.11") → o kanunun maddesini doğrudan açan kısayol (aynı numaralı
  // birden çok dosya varsa — 2646 gibi — her biri için ayrı düğme).
  const atif = atifCoz(filtre);
  const atifHedefleri = katalogHazir && atif ? listelenen : [];
  const sayac = aramaModu === "derin"
    ? (derin && derin !== "hata" ? <span><Sayi n={derin.sonuclar.length} /> MADDE EŞLEŞTİ</span> : <span>MADDE METİNLERİNDE TAM METİN ARAMA</span>)
    : Array.isArray(katalog) ? (
      filtre.trim() || kategori
        ? <span><Sayi n={listelenen.length} /> / {katalog.length} KAYNAK{kategori ? ` · ${kategori.toLocaleUpperCase("tr")}` : ""}</span>
        : <><span><Sayi n={katalog.length} /> KAYNAK</span><span aria-hidden="true">·</span><span><Sayi n={kategoriler.length} /> KONU</span><span aria-hidden="true">·</span><span><Sayi n={cekirdekSayi} /> ÇEKİRDEK</span></>
    ) : katalog === "hata" ? <span>KATALOG ÇEVRİMDIŞI</span> : <span>KATALOG YÜKLENİYOR…</span>;

  return (
    <ViewWrap id="mevzuat-h" title="Mevzuat" kunye="Mevzuat kütüphanesi · Resmî Gazete dizini"
      sub="Ajanların dayandığı tüm kaynak metinler — kanun, yönetmelik, kararname ve genelgeler. Konuya göre gezin, numarayla arayın ya da madde içinde tam metin arayın.">
      <style>{MV_CSS}</style>
      <AramaBasligi aramaRef={aramaRef} filtre={filtre} setFiltre={setFiltre} aramaModu={aramaModu} setAramaModu={setAramaModu} sayac={sayac} />

      {onerilen.length > 0 && (
        // Öneri bölgesi kataloğun geri kalanından zeminle ayrışır (mühür moru tint) —
        // anlama aşamasının mevzuat çıktısı, sayfada ilk görülen öge.
        <section aria-labelledby="mv-oneri-h" style={{ marginBottom: SP.xxl, padding: `${SP.l}px ${SP.l}px ${SP.m}px`, borderRadius: RAD.card, background: ALFA(V), border: `1px solid ${PAL.line}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, marginBottom: SP.m }}>
            <h2 id="mv-oneri-h" style={{ margin: 0, ...TYPE.h2, fontSize: 17, color: PAL.ink }}>Bu oturumda önerilen mevzuat</h2>
            <span style={{ ...TYPE.antet, color: DERIN.V }}>ÖNERİ · {onerilen.length} KAYNAK</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: SP.s }}>
            {onerilen.map((m, i) => <OneriSatir key={i} m={m} dosyalar={dosyalar} katalogAd={katalogAd} onAc={ac} />)}
          </div>
        </section>
      )}

      {aramaModu === "derin" && (
        filtre.trim().length < 3 ? (
          <p role="status" style={{ margin: "8px 0 0", ...TYPE.ui, color: PAL.mut2, maxWidth: 620 }}>
            Madde içinde arama: en az 3 karakter yazın — sonuç, ilgili maddeye kaydırılmış okuma paneliyle açılır.
          </p>
        ) : derinBekliyor && !derin ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.mut2, padding: "12px 0" }}>
            <Icon.spin /> Maddelerde aranıyor…
          </div>
        ) : derin === "hata" ? (
          <HataBandi baslik="Madde içinde arama yapılamadı" kod={hataKod}
            onTekrar={() => { setDerin(null); setDerinDeneme((n) => n + 1); }}
            aciklama="Arama sunucusuna ulaşılamadı. Sorgunuz duruyor; tekrar deneyin ya da kataloğa geçip kanun adı ve numarasıyla arayın." />
        ) : derin && derin.sonuclar.length === 0 ? (
          <EmptyState icon={<Icon.book />} title="Eşleşen madde yok"
            sub={`"${filtre.trim()}" için madde metinlerinde sonuç bulunamadı. Farklı terimlerle deneyin.`}
            actions={<Btn onClick={() => setFiltre("")}>Aramayı temizle</Btn>} />
        ) : derin ? (
          <div aria-live="polite" style={{ ...KART_IZGARA, gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", opacity: derinBekliyor ? 0.6 : 1, transition: "opacity .12s ease-out" }}>
            {derin.sonuclar.map((s, i) => <DerinSonucSatir key={`${s.dosya}-${s.madde_no}-${s.madde_tur ?? "madde"}`} s={s} onAc={ac} sira={i} q={filtre.trim()} />)}
          </div>
        ) : null
      )}

      {aramaModu === "katalog" && katalog === null && <KatalogIskelet />}
      {aramaModu === "katalog" && katalog === "hata" && <StatikKatalog kod={hataKod} onTekrar={() => setKatalogDeneme((n) => n + 1)} />}

      {katalogHazir && (
        <div className="mv-duzen">
          {kategoriler.length > 0 ? (
            <Dizin kategoriler={kategoriler} kategoriAdet={kategoriAdet} toplam={katalog.length} kategori={kategori} setKategori={setKategori} cekirdekSayi={cekirdekSayi} />
          ) : <span />}
          <div style={{ minWidth: 0 }}>
            {atifHedefleri.length > 0 && (
              <div role="group" aria-label="Atıf kısayolu" style={{ display: "flex", flexWrap: "wrap", gap: SP.s, alignItems: "center", marginBottom: SP.l }}>
                <span style={{ ...TYPE.antet, color: PAL.mut2 }}>ATIF · {atif.no} m.{atif.madde}</span>
                {atifHedefleri.map((m) => (
                  <Btn key={m.dosya} primary={atifHedefleri.length === 1} onClick={() => ac({ dosya: m.dosya, maddeNo: atif.madde, maddeTur: null })}>
                    <Icon.book /> {m.baslik} — Madde {atif.madde}
                  </Btn>
                ))}
              </div>
            )}
            {listelenen.length === 0 ? (
              <EmptyState icon={<Icon.book />} title="Eşleşen mevzuat yok"
                sub={filtre.trim()
                  ? `"${filtre.trim()}" için ${kategori ? `${kategori} grubunda` : "katalogda"} kaynak adı eşleşmedi. Aynı ifadeyi madde metinlerinin içinde arayabilirsiniz.`
                  : "Bu grupta gösterilecek mevzuat yok."}
                actions={filtre.trim()
                  ? [<Btn key="d" primary onClick={() => setAramaModu("derin")}><Icon.search /> Madde içinde ara</Btn>,
                    ...(kategori ? [<Btn key="k" onClick={() => setKategori("")}>Konu süzgecini kaldır</Btn>] : [])]
                  : <Btn onClick={() => setKategori("")}>Konu süzgecini kaldır</Btn>} />
            ) : (
              // Açık gelenler: arama/filtre aktifse hepsi (sonuç zaten dar) VEYA tek grup varsa
              // o. Aksi halde yalnız ilk grup açık; gerisi katlı → memur konu seçip açar.
              gruplar.map(([ad, uyeler, sira], gi) => (
                <KategoriGrup key={ad} ad={ad} sira={sira} mevzuatlar={uyeler} onAc={ac} q={trLower(filtre.trim())} ciftNolar={ciftNolar}
                  acik={!!filtre.trim() || !!kategori || gruplar.length === 1 || gi === 0} />
              ))
            )}
          </div>
        </div>
      )}

      {secili && <OkumaModal dosya={secili.dosya} maddeNo={secili.maddeNo} maddeTur={secili.maddeTur} sorgu={secili.sorgu} onClose={kapat} />}
    </ViewWrap>
  );
}
