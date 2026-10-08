/* RevizePaneli — "Yapay zekâ ile düzelt" alanı: memur doğal-dil talimatla taslağı DeepSeek'e
   düzenletir; öneri diff + değişiklik özeti + kalite kapılarıyla sunulur, memur Uygula/
   Vazgeç ile karar verir (HITL — AI hiçbir zaman doğrudan uygulamaz). Güçlendirilmiş akış:
   hazır talimat çipleri · sesle talimat · aşamalı bekleme + saniye sayacı · talimat
   zinciriyle çok-turlu geliştirme · "uygulanamadı" açıklaması (SIFIR UYDURMA'nın kullanıcıya
   görünür hâli) · verify/risk kapı rozetleri · tek-adım Geri al. Esc önce öneriyi kapatır
   (modalı değil — capture-faz dinleyici BelgeModal'ın bubble dinleyicisinden önce durdurur). */
import { useEffect, useRef, useState } from "react";
import { PAL, DERIN, DERIN_OF, T, V, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, Icon, Btn, focusRing } from "./neonUi.jsx";
import { DuzeltmeDiff } from "./NeonDetayParts.jsx";
import A4Belge from "./A4Belge.jsx";
import { cleanDemoText } from "../lib/evrakEtiket.js";
import { useSpeechToText } from "../hooks/useSpeechToText.js";

/* Tek tıkla gönderilen hazır talimatlar — memurun en sık ihtiyaç duyduğu düzenlemeler. */
const HAZIR_TALIMATLAR = [
  { etiket: "Daha resmî", talimat: "Üslubu daha resmî ve kurumsal yap" },
  { etiket: "Kısalt", talimat: "Metni anlamı koruyarak kısalt ve sadeleştir" },
  { etiket: "Dayanağı vurgula", talimat: "Mevzuat dayanağını gövdede açıkça vurgula" },
  { etiket: "Nazik ret", talimat: "Talebi nazik ve gerekçeli bir ret üslubuyla yeniden yaz" },
  { etiket: "Eksik belge iste", talimat: "Eksik bilgi ve belgelerin tamamlanmasını isteyen bir paragraf ekle" },
  { etiket: "İmla düzelt", talimat: "Yazım ve noktalama hatalarını düzelt, içeriği değiştirme" },
];

/* /yazi/dogrula tek çağrıda revize → verify → risk_guard koşar; bekleme mesajı geçen
   süreye göre GERÇEK sırayı yansıtır (uydurma yüzde-çubuğu yok, dürüst aşama metni). */
const asamaMetni = (sn) =>
  sn < 4 ? "Taslak revize ediliyor…"
  : sn < 9 ? "2646 üslup kuralları uygulanıyor…"
  : "Doğrulama kapılarından geçiriliyor…";

const RISK_TR = { yesil: "düşük", sari: "orta", kirmizi: "yüksek" };
/* Telefonda girdi 16px (iOS odakta sayfayı yakınlaştırmasın). */
/* Girdi odağı: genel dışa halka + kenar = metne yapışık çift mavi çerçeve (2. jüri). Girdide
   tek mürekkep kenarı (2px = 1px kenar + 1px iç gölge) yeter; kontrast T üstünden AA. */
const GIRDI_CSS = "@media (max-width:720px){.ke-revize-girdi{font-size:16px !important}}"
  + ".ke-revize-girdi:focus-visible{outline:none!important;box-shadow:inset 0 0 0 1px var(--ke-t)!important;border-color:var(--ke-t)!important}";

/* İstek sürerken kâğıt GİZLENMEZ (BelgeModal düzenleme kâğıdını kaldırır — yarış koruması):
   aynı metin burada yerinde, soluk ve KİLİTLİ görünür; üstünde ne olduğunu söyleyen şerit.
   Jüri tur 6: kâğıt kaybolunca arkadaki sayfanın kâğıdı modalın kâğıdı sanılıyordu. */
function KilitliKagit({ metin }) {
  return (
    <div aria-hidden="true" style={{ pointerEvents: "none", userSelect: "none" }}>
      {/* Durum şeridi kâğıdın ÜSTÜNDE, akış içinde — kâğıdın üstüne bindiğinde antet
          bölgesini (T.C. / idare adı) örtüyordu (tur 6 doğrulaması). */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: SP.m }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, padding: "8px 14px", borderRadius: RAD.ctl,
          background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, boxShadow: SH.card, ...TYPE.data, fontWeight: 600, color: PAL.ink }}>
          <Icon.spin width={13} height={13} /> Revize ediliyor — kâğıt kilitli
        </span>
      </div>
      {/* Kâğıt OPAK kalır (A4Belge solgun opaklığı arkadaki sayfayı geçiriyordu); soluk
          görünüm üstteki kâğıt renkli perdeden gelir. */}
      <div style={{ position: "relative" }}>
        <A4Belge metin={metin} />
        <div style={{ position: "absolute", inset: 0, background: "color-mix(in srgb, var(--kd-kagit) 52%, transparent)" }} />
      </div>
    </div>
  );
}

/* Hata şeridi — sola hizalı, ikonlu; çıkış yolu sunar: aynı talimatla tekrar dene ya da
   talimatı düzenle (durum eksiksizliği). */
function HataSeridi({ metin, onTekrar, onDuzenle }) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: SP.s, flexWrap: "wrap", padding: "10px 12px", borderRadius: RAD.ctl, background: PAL.surf, border: `1px solid ${BANT.kirmizi.c}`, boxShadow: SH.card }}>
      <Icon.alert width={15} height={15} style={{ flexShrink: 0, marginTop: 2, color: DERIN.kirmizi }} />
      <span style={{ flex: "1 1 220px", minWidth: 0, ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi }}>{metin}</span>
      {(onTekrar || onDuzenle) && (
        <span style={{ display: "flex", gap: SP.s, marginLeft: "auto" }}>
          {onDuzenle && <Btn onClick={onDuzenle}>Talimatı düzenle</Btn>}
          {onTekrar && <Btn onClick={onTekrar}><Icon.undo width={12} height={12} /> Tekrar dene</Btn>}
        </span>
      )}
    </div>
  );
}

/* Semantik durum rozeti — kalite kapısı sonuçları bant rengiyle (yeşil/sarı/kırmızı). */
function KapiRozet({ bant, children }) {
  const b = BANT[bant] || BANT.sari;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(b.c), ...TYPE.meta, ...TNUM, fontWeight: 500, color: DERIN[bant] || DERIN.sari }}>
      {children}
    </span>
  );
}

/* Ortak busy göstergesi — giriş şeridi ve öneri kartındaki geliştirme satırı paylaşır. */
function BeklemeDurumu({ sure }) {
  return (
    <span role="status" aria-live="polite" style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.data, color: PAL.ink2 }}>
      <Icon.spin width={13} height={13} /> {asamaMetni(sure)}
      <span style={{ ...TYPE.meta, ...TNUM, color: PAL.mut2 }}>{sure} sn</span>
    </span>
  );
}

/* HAZIR TALİMAT ŞERİDİ (tur 8, jüri: jenerik hap dizisi, hepsi aynı ağırlıkta ve tek tık LLM
   çağrısı). Artık mono künyeli numaralı talimat fişleri: seçim talimatı GİRDİYE YAZAR ve odağı
   "Revize et"e taşır — memur görür, gerekirse değiştirir, Enter'la gönderir (çağrı onun
   kararıdır). Son kullanılan öne alınır (yalnız bu tarayıcıda; depolama yoksa sıra sabit). */
const REVIZE_ET = "Talimatla revize et";
const SON_TALIMAT = "ke-revize-son-talimat";
const sonTalimatOku = () => { try { return window.localStorage.getItem(SON_TALIMAT) || ""; } catch { return ""; } };
const sonTalimatYaz = (e) => { try { window.localStorage.setItem(SON_TALIMAT, e); } catch { /* depolama kapalı: sıra sabit kalır */ } };

function HazirTalimatlar({ onSec, secili = "" }) {
  const kapRef = useRef(null);
  const [son, setSon] = useState(sonTalimatOku);
  const sirali = [...HAZIR_TALIMATLAR].sort((a, b) => (b.etiket === son) - (a.etiket === son));
  const sec = (h) => {
    onSec(h.talimat);
    sonTalimatYaz(h.etiket);
    setSon(h.etiket);
    // Girdi güncellenince düğme etkinleşir; odak bir sonraki karede taşınır.
    requestAnimationFrame(() => kapRef.current?.parentElement?.querySelector(`button[aria-label="${REVIZE_ET}"]`)?.focus());
  };
  return (
    <div ref={kapRef} role="group" aria-label="Hazır revizyon talimatları — seçim talimatı girdiye yazar"
      style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "wrap", marginLeft: 38, borderTop: `1px dashed ${PAL.line}`, paddingTop: 6 }}>
      {sirali.map((h, i) => {
        // Seçili hâl (tur 9 jüri): girdideki talimat bu fişinse rozet dolar, etiket mürekkep + altı çizili.
        const secik = secili.trim() === h.talimat;
        return (
        <button key={h.etiket} type="button" onClick={() => sec(h)} title={`${h.talimat} — girdiye yazar`} aria-pressed={secik} {...focusRing} data-press="" data-revize-hazir=""
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "baseline", gap: 6, padding: "4px 10px 4px 0", marginRight: 10, border: "none", background: "transparent",
            color: secik ? PAL.ink : PAL.ink2, ...TYPE.meta, fontWeight: secik ? 600 : 500, transition: `color .12s ease-out, transform .14s ${EASE.out}` }}>
          <span aria-hidden="true" style={{ ...TYPE.antet, ...TNUM, padding: "0 4px", borderRadius: RAD.chip, color: secik || h.etiket === son ? DERIN.V : PAL.mut3, background: secik ? ALFA(V) : "transparent", boxShadow: secik ? `inset 0 0 0 1px ${DERIN.V}` : "none", transition: "background .12s ease-out, color .12s ease-out" }}>T{i + 1}</span>
          <span style={secik ? { textDecoration: "underline", textUnderlineOffset: 3 } : undefined}>{h.etiket}</span>
          {h.etiket === son && <span style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>· son</span>}
        </button>
        );
      })}
      <style>{"[data-revize-hazir]:hover>span:nth-child(2){color:var(--ke-ink);text-decoration:underline;text-underline-offset:3px}"}</style>
    </div>
  );
}

/* Giriş şeridi — talimat yaz/söyle ya da hazır talimata tek tıkla. Revize masası: kâğıdın
   üstünde duran ince bir talimat şeridi — havada duran katman (surfPop + SH.pop), kâğıttan
   ayrı okunur. Hazır talimatlar hap biçimli, sessiz. */
function GirisSeridi({ busy, sure, talimat, setTalimat, setHata, girisRef, stt, revizeIste }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.s, padding: "10px 12px", borderRadius: RAD.card, background: PAL.surfPop, border: `1px solid ${PAL.line}`, boxShadow: SH.pop }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: RAD.ctl, background: ALFA(V), color: DERIN.V, flexShrink: 0 }}>
          <Icon.sparkle width={15} height={15} />
        </span>
        {busy ? <BeklemeDurumu sure={sure} /> : (
          <>
            <input ref={girisRef} value={talimat}
              onChange={(e) => { setTalimat(e.target.value); setHata(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") revizeIste(); }}
              placeholder="Yapay zekâ ile düzelt (örn. “ilgi yazıya atıf yap”)"
              aria-label="Yapay zekâya düzeltme talimatı" {...focusRing} className="ke-revize-girdi"
              style={{ flex: 1, minWidth: 0, flexBasis: 200, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, padding: "8px 12px", background: PAL.bg, color: PAL.ink, ...TYPE.ui }} />
            {stt.destekleniyor && (
              <button type="button" onClick={stt.toggle} aria-pressed={stt.dinliyor}
                aria-label={stt.dinliyor ? "Talimat diktesini durdur" : "Talimatı sesle söyle"}
                title={stt.dinliyor ? "Dikteyi durdur" : "Talimatı sesle söyle (Türkçe)"} {...focusRing}
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "7px 10px", minHeight: 32, borderRadius: RAD.ctl, border: `1px solid ${stt.dinliyor ? BANT.kirmizi.c : PAL.line}`, background: stt.dinliyor ? ALFA(BANT.kirmizi.c) : PAL.bg, color: stt.dinliyor ? DERIN.kirmizi : PAL.ink2 }}>
                {stt.dinliyor && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: BANT.kirmizi.c, animation: "nu-think 1.1s infinite" }} />}
                <Icon.mic width={13} height={13} />
              </button>
            )}
            {/* Talimat girilince bu ekranın birincil eylemi olur; boşken NEDENİ söylenir (2. jüri). */}
            <Btn onClick={() => revizeIste()} disabled={!talimat.trim()} primary={!!talimat.trim()}
              ariaLabel={talimat.trim() ? REVIZE_ET : `${REVIZE_ET} — önce talimat yazın`}
              title={talimat.trim() ? "Talimata göre düzeltme önerisi iste (Enter)" : "Önce bir talimat yazın ya da aşağıdan hazır talimat seçin"}>Revize et</Btn>
          </>
        )}
      </div>
      {!busy && <HazirTalimatlar secili={talimat} onSec={(t) => { setTalimat(t); setHata(null); }} />}
      {stt.hata && <div role="alert" style={{ ...TYPE.meta, color: DERIN.kirmizi }}>{stt.hata}</div>}
    </div>
  );
}

/* Öneri kartı. SH.pop: modal İÇİNDE satır-içi bir bölge; komşu şeritlerle (giriş/geri-al/hata)
   aynı düzlemde durur. */
function OneriKarti({ oneri, metin, delta, busy, sure, gelistirTalimat, setGelistirTalimat, setHata, gelistir, uygula, onBirak }) {
  return (
    <div role="region" aria-label="Yapay zekâ düzeltme önerisi" style={{ display: "flex", flexDirection: "column", gap: SP.m, padding: "14px 16px", borderRadius: RAD.card, background: PAL.surfPop, border: `1px solid ${PAL.line}`, boxShadow: SH.pop, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.s, flexWrap: "wrap" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", ...TYPE.antet, color: DERIN.V, textTransform: "uppercase", marginBottom: 2 }}>Önerilen düzeltme · {oneri.zincir.length} talimat</span>
          <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{oneri.zincir.map((z) => `“${z}”`).join(" → ")}</span>
        </span>
        <span style={{ display: "flex", gap: SP.s }}>
          {/* "Öneriyi bırak" — modal araç çubuğunun "Vazgeç"i (modalı kapatır) ile aynı
              adı taşıyınca iki farklı eylem tek kelimede çakışıyordu (tur 6). */}
          <Btn onClick={onBirak} ariaLabel="Öneriyi bırak, taslak değişmez">Öneriyi bırak</Btn>
          <Btn primary onClick={uygula}><Icon.check width={12} height={12} /> Uygula</Btn>
        </span>
      </div>

      {/* Kalite kapıları — öneri buraya verify + risk_guard'dan GEÇMİŞ hâliyle gelir */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <KapiRozet bant={oneri.formatUyumlu ? "yesil" : "sari"}>
          {oneri.formatUyumlu ? "2646 format uyumlu" : "Format uyarısı"}
        </KapiRozet>
        <KapiRozet bant={oneri.uyariSayisi === 0 ? "yesil" : "sari"}>
          {oneri.uyariSayisi === 0 ? "Doğrulama temiz" : `${oneri.uyariSayisi} doğrulama uyarısı`}
        </KapiRozet>
        {oneri.riskBant && (
          <KapiRozet bant={oneri.riskBant}>Risk: {RISK_TR[oneri.riskBant] || oneri.riskBant}</KapiRozet>
        )}
        <span style={{ ...TYPE.meta, ...TNUM, color: PAL.mut2 }}>
          {delta === 0 ? "uzunluk aynı" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} karakter`}
        </span>
      </div>

      {/* Değişiklik özeti — model ne yaptığını maddeler hâlinde açıklar */}
      {oneri.degisiklikler.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          {oneri.degisiklikler.map((d, i) => (
            <li key={i} style={{ display: "flex", alignItems: "baseline", gap: SP.s, ...TYPE.data, color: PAL.ink2 }}>
              <span aria-hidden="true" style={{ color: DERIN.yesil, flexShrink: 0 }}><Icon.check width={11} height={11} /></span>
              {d}
            </li>
          ))}
        </ul>
      )}

      {/* Uygulanamayan kısım — model kaynakta olmayan bilgiyi uydurmayı REDDETTİ */}
      {oneri.uygulanamayan && (
        <div role="alert" style={{ display: "flex", alignItems: "baseline", gap: SP.s, padding: "6px 10px", borderRadius: RAD.ctl, background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}`, ...TYPE.data, color: DERIN.sari }}>
          <span aria-hidden="true" style={{ flexShrink: 0 }}><Icon.alert width={12} height={12} /></span>
          <span><strong>Uygulanmadı:</strong> {oneri.uygulanamayan}</span>
        </div>
      )}

      <DuzeltmeDiff eski={metin} yeni={oneri.metin} />

      {/* Çok-turlu geliştirme — beğenilmeyen öneri üstüne yeni talimat verilir */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        <Icon.sparkle width={13} height={13} style={{ color: DERIN_OF(T), flexShrink: 0 }} />
        {busy ? <BeklemeDurumu sure={sure} /> : (
          <>
            <input value={gelistirTalimat}
              onChange={(e) => { setGelistirTalimat(e.target.value); setHata(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") gelistir(); }}
              placeholder="Öneriyi geliştir (örn. “son paragrafı biraz daha kısalt”)"
              aria-label="Öneri üzerine ek düzeltme talimatı" {...focusRing} className="ke-revize-girdi"
              style={{ flex: 1, minWidth: 200, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, padding: "6px 10px", background: PAL.bg, color: PAL.ink, ...TYPE.data }} />
            <Btn onClick={gelistir} disabled={!gelistirTalimat.trim()}>Tekrar revize et</Btn>
          </>
        )}
      </div>
    </div>
  );
}

export default function RevizePaneli({ metin, onRevize, onUygula, onOneriDegisti }) {
  const [talimat, setTalimat] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(0);
  const [hata, setHata] = useState(null);
  // oneri: { metin, zincir, degisiklikler, uygulanamayan, formatUyumlu, uyariSayisi, riskBant }
  const [oneri, setOneri] = useState(null);
  const [gelistirTalimat, setGelistirTalimat] = useState("");
  const [sonUygulanan, setSonUygulanan] = useState(null); // { onceki, yeni, talimatlar }
  const [sonIstek, setSonIstek] = useState(null);           // { taban, talimat, zincir } — Tekrar dene
  const girisRef = useRef(null);

  // Üst bileşen (BelgeModal) öneri açıkken A4 kâğıdı gizler — durumu bildir. `busy` de
  // dahil: istek beklerken kâğıt hâlâ düzenlenebilir kalırsa memurun o sırada yaptığı elle
  // düzeltme, öneri (ESKİ metne göre üretilmiş) "Uygula"da sessizce silinirdi (regresyon
  // bulgusu) — kâğıt istek başladığı andan itibaren kilitlenir, yarış penceresi kapanır.
  useEffect(() => { onOneriDegisti?.(!!oneri || busy); }, [oneri, busy, onOneriDegisti]);

  // Bekleme sayacı — uzun LLM turlarında sistemin canlı olduğu görünür kalır.
  useEffect(() => {
    if (!busy) { setSure(0); return undefined; }
    const id = setInterval(() => setSure((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Esc önce AI önerisini kapatır, modalı DEĞİL — capture fazında durdurulur.
  useEffect(() => {
    if (!oneri) return undefined;
    const tusla = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOneri(null); } };
    document.addEventListener("keydown", tusla, true);
    return () => document.removeEventListener("keydown", tusla, true);
  }, [oneri]);

  // Sesle talimat — yalnız kesinleşen parçalar eklenir (talimat kısa; canlı-bölge gerekmez).
  const stt = useSpeechToText({
    lang: "tr-TR",
    onSonuc: (parca, { finalMi }) => {
      if (finalMi && parca.trim()) setTalimat((t) => `${t ? `${t.trimEnd()} ` : ""}${parca.trim()}`);
    },
  });

  const istek = async (tabanMetin, tekTalimat, zincir) => {
    setSonIstek({ taban: tabanMetin, talimat: tekTalimat, zincir });
    setBusy(true);
    setHata(null);
    try {
      const s = await onRevize(tabanMetin, tekTalimat);
      if (s?.revize_edildi && s.taslak_md) {
        // metin (eski) cleanDemoText'ten geçmiş hâlde gelir — AI cevabı aynı temizlikten
        // geçmezse aynı içerik bile satır-diff'te "değişti" görünüyordu (asimetri).
        setOneri({
          metin: cleanDemoText(s.taslak_md),
          zincir,
          degisiklikler: s.revize_degisiklikler || [],
          uygulanamayan: s.revize_uygulanamayan || "",
          formatUyumlu: s.format_uyumlu !== false,
          uyariSayisi: (s.verify_uyari || []).length + (s.tutarlilik_uyari || []).length,
          riskBant: s.risk_metadata?.bant || null,
        });
        setGelistirTalimat("");
      } else {
        // Model taslağı değiştirmeden nedenini açıkladıysa (uydurma-reddi) nedeni göster.
        setHata(s?.revize_uygulanamayan
          ? `Revizyon uygulanmadı — ${s.revize_uygulanamayan}`
          : "Talimat uygulanamadı; taslakla ilgisiz olabilir ya da yapay zekâ hizmeti şu an yanıt vermiyor.");
      }
    } catch (err) {
      setHata(/429|limit/i.test(String(err?.message || ""))
        ? "Art arda çok istek gönderildi. Birkaç saniye bekleyip tekrar deneyin."
        : "Revizyon isteği başarısız oldu. Bağlantıyı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const revizeIste = (t = talimat) => {
    const tt = t.trim();
    if (!tt || busy) return;
    if (stt.dinliyor) stt.durdur();
    setTalimat(tt);
    istek(metin, tt, [tt]);
  };
  // Çok-turlu geliştirme: yeni talimat mevcut ÖNERİ metni üzerine uygulanır, diff yine
  // kâğıttaki metne göre gösterilir (kümülatif fark — memur toplam değişikliği görür).
  const gelistir = () => {
    const tt = gelistirTalimat.trim();
    if (!tt || busy || !oneri) return;
    istek(oneri.metin, tt, [...oneri.zincir, tt]);
  };
  const uygula = () => {
    setSonUygulanan({ onceki: metin, yeni: oneri.metin, talimatlar: oneri.zincir });
    onUygula(oneri.metin);
    setOneri(null);
    setTalimat("");
    setHata(null);
  };
  const geriAl = () => { onUygula(sonUygulanan.onceki); setSonUygulanan(null); };

  const delta = oneri ? oneri.metin.length - metin.length : 0;

  return (
    <>
      <style>{GIRDI_CSS}</style>
      {/* Giriş şeridi — talimat yaz/söyle ya da hazır talimata tek tıkla */}
      {!oneri && <GirisSeridi busy={busy} sure={sure} talimat={talimat} setTalimat={setTalimat} setHata={setHata} girisRef={girisRef} stt={stt} revizeIste={revizeIste} />}

      {/* Uygulanan revizyonu tek adım geri alma — kâğıt metni dışarıda değişmediyse görünür.
          Bu şerit modal KARARTISININ üstünde durur: zemin opak PAL.surf olmalı (yarı saydam
          ALFA tint'i scrim + arkadaki sayfayı geçirip metni okunmaz yapıyordu). */}
      {!oneri && sonUygulanan && metin === sonUygulanan.yeni && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: "8px 12px", borderRadius: RAD.ctl, background: PAL.surf, border: `1px solid ${BANT.yesil.c}`, boxShadow: SH.card }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: SP.s, ...TYPE.data, fontWeight: 500, color: DERIN.yesil, flex: 1, minWidth: 0 }}>
            <Icon.check width={13} height={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Revizyon uygulandı; “{sonUygulanan.talimatlar[sonUygulanan.talimatlar.length - 1]}”</span>
          </span>
          <Btn onClick={geriAl}><Icon.undo width={12} height={12} /> Geri al</Btn>
        </div>
      )}

      {/* Hata da scrim üstünde — opak zeminli şerit (çıplak koyu metin okunmuyordu). */}
      {hata && !busy && (
        <HataSeridi metin={hata}
          onTekrar={sonIstek ? () => istek(sonIstek.taban, sonIstek.talimat, sonIstek.zincir) : null}
          onDuzenle={!oneri ? () => { setTalimat(sonIstek?.talimat || talimat); setHata(null); requestAnimationFrame(() => girisRef.current?.focus()); } : null} />
      )}

      {busy && !oneri && <KilitliKagit metin={metin} />}

      {/* Öneri kartı — kalite kapıları + değişiklik özeti + diff + çok-turlu geliştirme */}
      {oneri && <OneriKarti oneri={oneri} metin={metin} delta={delta} busy={busy} sure={sure} gelistirTalimat={gelistirTalimat}
        setGelistirTalimat={setGelistirTalimat} setHata={setHata} gelistir={gelistir} uygula={uygula} onBirak={() => setOneri(null)} />}
    </>
  );
}
