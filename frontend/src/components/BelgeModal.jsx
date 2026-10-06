/* BelgeModal — Kaynak belge / Resmî yazı taslağını A4 kâğıt görünümünde büyütüp inceleme.
   Havada duran katman disiplini (MASTER): karartı + SH.modal + RAD.pop; kâğıt gerçek belge
   gibi durur (A4 oranında min yükseklik + geniş belge kenar boşlukları).
   a11y: @radix-ui/react-dialog — odak tuzağı, Esc, dış-tık. Gövde kaydırma kilidi Radix'te
   Dialog.Overlay'in RemoveScroll'una bağlıdır: karartı katmanı Overlay'dir, içerik onun
   İÇİNDE kayar (Radix'in "scrollable overlay" deseni). Odak iadesi: Dialog.Trigger yok
   (satır/düğme tetikler) → açılışta odaktaki öğe yakalanır, kapanışta ona döner (tur 6
   doğrulaması: Esc sonrası odak BODY'ye düşüyor, memur defterdeki yerini kaybediyordu).
   Katman: z 300 — telefondaki alt sekme şeridinin (KabukAltSerit z 90) ÜSTÜNDE, hata/deneme
   şeritlerinin (390/400) altında; modal açıkken şerit örtülür ve tıklanamaz.
   "Kirli" (kaydedilmemiş değişiklik) koruması KONTROLLÜ open prop'uyla kurulur:
   onOpenChange(false) geldiğinde kapatIstegi ya gerçekten kapatır (onKapat) ya da yalnız
   uyarı şeridini açar — acik prop'u değişmediği sürece Radix diyaloğu kapatmaz.
   Giriş/çıkış motion ile (AnimatePresence + Portal/Overlay/Content forceMount). PDF
   kaynaklarda gerçek sayfa önizlemesi (react-pdf, tembel) — metin yolunda maskeli içerik. */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { SANS, MONO, PAL, DERIN, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, SR_ONLY, EASE, EASE_BEZIER, Icon, focusRing } from "./neonUi.jsx";
import { useDarEkran } from "../hooks/useMedya.js";
import RevizePaneli from "./RevizePaneli.jsx";
import A4Belge from "./A4Belge.jsx";
import { FOSFOR_STIL, KAGIT_YUZEY, kagitStilYukle } from "./kagitDoku.js";
import { useDikte } from "./belgeModalDikte.js";
import { telefonNushaMetni } from "../lib/nushaAkis.js";

const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

/* Perde (koyu karartı) üstü düğme dili — renkler on-ink token'ından color-mix ile türer;
   hover CSS'te. `birincil`: perdenin TEK dolu düğmesi (tükenmez mavisi + onAccent).
   Telefonda her perde düğmesi 44 px dokunma hedefi (data-dokunma, neonUi genel kuralı). */
const PERDE_CSS = `
[data-perde-dugme]{--pd-zemin:color-mix(in srgb, var(--ke-on-ink) 10%, transparent);--pd-hov:color-mix(in srgb, var(--ke-on-ink) 18%, transparent);
  border:1px solid color-mix(in srgb, var(--ke-on-ink) 35%, transparent);background:var(--pd-zemin);color:var(--ke-on-ink)}
[data-perde-dugme]:hover:not(:disabled){background:var(--pd-hov)}
[data-perde-dugme][data-birincil]{border-color:transparent;background:var(--ke-t);color:var(--ke-on-accent);font-weight:600}
[data-perde-dugme][data-birincil]:hover:not(:disabled){background:color-mix(in srgb, var(--ke-t) 86%, var(--ke-on-ink))}
[data-perde-ipucu]{color:color-mix(in srgb, var(--ke-on-ink) 62%, transparent)}
@media (max-width:640px){[data-perde-dugme]{justify-content:center}}
`;
const perdeDugmeStil = (disabled) => ({ cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "6px 12px", minHeight: 32, borderRadius: RAD.ctl, opacity: disabled ? 0.55 : 1, ...TYPE.data, fontWeight: 500, transition: `background .12s ease-out, transform .14s ${EASE.out}` });

/* Karartı — scrimKoyu üç kat serilir (1−(1−a)³ ≈ .99): tek kat (a≈.82) sayfanın Archivo
   başlığını modal başlık şeridinin tam arkasından okutuyordu, iki kat hâlâ hayalet bırakıyordu
   (tur 6 ölçümü). Okuma perdesi: arkadaki sayfa yalnız bir gölge olarak sezilir. Hex yok. */
const KAT = `linear-gradient(${PAL.scrimKoyu}, ${PAL.scrimKoyu})`;
const KARARTI = { background: PAL.scrimKoyu, backgroundImage: `${KAT}, ${KAT}` };

export function ScrimDugme({ onClick, onMouseDown, disabled, children, title, ariaLabel, ariaPressed, birincil = false }) {
  return (
    <button type="button" onClick={onClick} onMouseDown={onMouseDown} disabled={disabled} title={title} aria-label={ariaLabel} aria-pressed={ariaPressed} {...focusRing} data-press="" data-dokunma=""
      data-perde-dugme="" {...(birincil ? { "data-birincil": "" } : null)} style={perdeDugmeStil(disabled)}>
      {children}
    </button>
  );
}

/* Nüsha kâğıdı — salt-okunur metnin kâğıt yüzeyi. Geniş ekranda GERÇEK A4 düzeni; telefonda
   A4Belge'nin OKUMA DÜZENİ (sigdir="genislik": ölçek okunurluk eşiğinin altına düşünce aynı
   dizgi kuralları — ortalı antet, Sayı hizasında sağda tarih, ortalı muhatap, sağ yarıda imza
   — kâğıt genişliğine akar). Önceki "düz pre-wrap" telefon kâğıdı belge biçimini siliyordu.
   Hizalama boşlukları ve sabit genişlikte sarılmış dilekçe satırları lib/nushaAkis'te
   düzeltilir (yalnız biçim; sözcük değişmez).
   `kose`: kâğıdın sağ üst köşesine basılan öğe (posta damgası) — kâğıdın parçasıdır. */
function NushaKagit({ metin, dar, kose }) {
  const koseKatmani = kose ? <span data-evrak-kagit="" style={{ position: "absolute", top: dar ? 8 : 18, right: dar ? 8 : 22, zIndex: 2, pointerEvents: "none" }}>{kose}</span> : null;
  return (
    <div style={{ position: "relative" }}>
      {koseKatmani}
      {dar ? <A4Belge metin={telefonNushaMetni(metin)} sigdir="genislik" /> : <A4Belge metin={metin} />}
    </div>
  );
}

/* Odak iadesi — açılışta odaktaki öğe (satır / "Nüsha" düğmesi) yakalanır; kapanışta hâlâ
   belgedeyse ona döner. Yakalama useLayoutEffect'te: Radix'in odak tuzağı (useEffect) odağı
   modala taşımadan ÖNCE koşar. */
function useOdakIadesi(acik) {
  const acanRef = useRef(null);
  useLayoutEffect(() => {
    if (!acik) return;
    const el = document.activeElement;
    acanRef.current = el && el !== document.body ? el : null;
  }, [acik]);
  return useCallback((e) => {
    const el = acanRef.current;
    if (!el?.isConnected) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
  }, []);
}

/* Kâğıt içinde kaydırma OLMAZ — metin alanı içeriği kadar uzar (iç içe iki kaydırma çubuğu
   olmasın; gerçek kâğıt uzar). Ölçüm boyamadan ÖNCE; `height:auto` küçülmede şart. */
function useOtomatikYukseklik(alanRef, bagimliliklar) {
  useLayoutEffect(() => {
    const el = alanRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, bagimliliklar); // eslint-disable-line react-hooks/exhaustive-deps
}

function DikteDugmesi({ stt, degistir }) {
  return (
    <ScrimDugme
      // Odak metin alanından ayrılmasın (imleç görünür kalsın) — click yine tetiklenir.
      onMouseDown={(e) => e.preventDefault()} onClick={degistir} ariaPressed={stt.dinliyor}
      ariaLabel={stt.dinliyor ? "Dikteyi durdur" : "Sesle dikte et"}
      title={stt.dinliyor ? "Dikteyi durdur" : "Sesle dikte et (Türkçe)"}>
      {stt.dinliyor && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: BANT.kirmizi.c, animation: "nu-think 1.1s infinite" }} />}
      <Icon.mic width={13} height={13} /> {stt.dinliyor ? "Dinliyor…" : "Sesle yaz"}
    </ScrimDugme>
  );
}

/* Düzenleme eylemleri — yalnız düzenlenebilir kipte (Taslaklar). */
function DuzenlemeEylemleri({ d }) {
  return (
    <>
      <span style={{ ...TYPE.meta, ...TNUM, color: PAL.onInk2 }}>{d.metinD.length} karakter</span>
      {d.stt.destekleniyor && <DikteDugmesi stt={d.stt} degistir={d.dikteDegistir} />}
      {d.onIndir && <ScrimDugme onClick={() => d.onIndir(d.metinD)} title="Düzenlenen metni DOCX indir">DOCX indir</ScrimDugme>}
      <ScrimDugme onClick={() => d.onKaydet?.(d.metinD)} disabled={!d.kirli || d.gonderBusy} title={d.kirli ? "Değişiklikleri kaydet" : "Değişiklik yok"}>
        <Icon.check width={12} height={12} /> Kaydet
      </ScrimDugme>
      {d.onGonder && (
        <ScrimDugme onClick={d.gonderIste} disabled={d.gonderBusy} title="Doğrula, kaydet ve Giden Evrak'a gönder">
          {d.gonderBusy ? <><Icon.spin width={12} height={12} /> Gönderiliyor…</> : <><Icon.arrow width={12} height={12} /> Gönder</>}
        </ScrimDugme>
      )}
    </>
  );
}

/* Üst şerit — künye no + başlık + dosya kimliği + eylemler + Kapat + (sağda) tek birincil. */
function UstSerit({ kayitNo, baslik, dosyaAdi, duzenleme, eylemler, kapatRef, kapatIstegi, birincil }) {
  const duz = !!duzenleme;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: `${SP.s}px ${SP.m}px`, flexWrap: "wrap" }}>
      {kayitNo && <span style={{ fontFamily: MONO, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: PAL.onInk, letterSpacing: ".02em", ...TNUM }}>{kayitNo}</span>}
      <Dialog.Title asChild>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.onInk, minWidth: 0 }}>{baslik}</span>
      </Dialog.Title>
      {dosyaAdi && <span style={{ fontFamily: SANS, fontSize: 12, lineHeight: "16px", color: PAL.onInk2 }}>{dosyaAdi}</span>}
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
        {duz && <DuzenlemeEylemleri d={duzenleme} />}
        {eylemler}
        <button ref={kapatRef} type="button" onClick={kapatIstegi} aria-label={duz ? "Vazgeç ve kapat (Esc)" : "Kapat (Esc)"} {...focusRing} data-press="" data-dokunma=""
          data-perde-dugme="" style={perdeDugmeStil(false)}>
          <Icon.x width={12} height={12} /> {duz ? "Vazgeç" : "Kapat"}
        </button>
        {birincil}
      </span>
    </div>
  );
}

/* Düzenleme / PDF / vurgulu kaynak kâğıdı — A4 bölmesine girmeyen üç kip. */
function CalismaKagidi({ fileUrl, duzenlenebilir, segmentler, metin, alanRef, metinD, onYaz }) {
  return (
    <div style={{ ...(fileUrl ? { background: PAL.surf } : KAGIT_YUZEY), borderRadius: 2, boxShadow: SH.modal, minHeight: "min(1040px, 137vw)", padding: fileUrl ? SP.l : "clamp(36px, 8vw, 76px) clamp(28px, 9vw, 88px)" }}>
      {fileUrl ? (
        <Suspense fallback={<div style={{ padding: SP.l, ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
          <PdfOnizleme fileUrl={fileUrl} tam />
        </Suspense>
      ) : duzenlenebilir ? (
        /* Kâğıt üzerinde doğrudan yazım — çerçevesiz; yükseklik içeriğe kilitli (iç çubuk yok). */
        <textarea ref={alanRef} value={metinD} onChange={(e) => onYaz(e.target.value)}
          aria-label="Resmî yazı taslağı metni" spellCheck={false}
          style={{ width: "100%", boxSizing: "border-box", minHeight: 800, border: "none", outline: "none", background: "transparent", resize: "none", overflow: "hidden", ...TYPE.read, color: "inherit", padding: 0 }} />
      ) : (
        <div style={{ ...TYPE.read, color: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {/* Çıkarım vurguları A4'te de korunur — panel ile aynı sarı <mark> dili. */}
          {segmentler.map((sg, i) => (sg.mark ? <mark key={i} style={FOSFOR_STIL}>{sg.t}</mark> : <span key={i}>{sg.t}</span>))}
          {!segmentler.length && (metin || "İçerik henüz hazır değil.")}
        </div>
      )}
    </div>
  );
}

function KirliUyari({ onKaydet, onCik }) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap", padding: "8px 12px", borderRadius: RAD.ctl, background: ALFA(BANT.sari.c), border: `1px solid ${BANT.sari.c}` }}>
      <span style={{ ...TYPE.data, fontWeight: 500, color: DERIN.sari, flex: 1 }}>Kaydedilmemiş değişiklikler var.</span>
      <ScrimDugme onClick={onKaydet}>Kaydet ve kapat</ScrimDugme>
      <ScrimDugme onClick={onCik}>Kaydetmeden çık</ScrimDugme>
    </div>
  );
}

/* Düzenleme durumu — taslak metni, kirli koruması, gönderim kilidi, dikte. Modal her
   açılışta taze kurulur (çağıran koşullu render eder; kapanınca unmount → durum sızmaz). */
function useDuzenleme({ metin, duzenlenebilir, alanRef, onKaydet, onGonder, onIndir }) {
  const [metinD, setMetinD] = useState(metin);
  const [kapatUyari, setKapatUyari] = useState(false);
  const kirli = duzenlenebilir && metinD !== metin;
  // Busy koruması: hızlı çift tıklama aynı taslak için iki Giden Evrak kaydı açmasın.
  const [gonderBusy, setGonderBusy] = useState(false);
  const gonderIste = async () => {
    if (gonderBusy || !onGonder) return;
    setGonderBusy(true);
    try { await onGonder(metinD); } finally { setGonderBusy(false); }
  };
  const { stt, degistir } = useDikte({ metinD, setMetinD, alanRef, onDegis: () => setKapatUyari(false) });
  const yaz = (v) => { setMetinD(v); setKapatUyari(false); };
  return { metinD, yaz, kapatUyari, setKapatUyari, kirli, gonderBusy, gonderIste, stt, dikteDegistir: degistir, onKaydet, onGonder, onIndir };
}

/* Ek yuvalar (evrak defterleri — "arşiv nüshası" ailesi): kayitNo: başlığın önünde mono
   künye · ustIcerik: kâğıdın üstünde künye fişi · kagitKose: kâğıdın sağ üst köşesine basılan
   öğe (posta damgası) · altKunye: kâğıdın dibinde mono künye (denetim hash'i) · birincil:
   Kapat'ın SAĞINDA tek dolu eylem. */
export default function BelgeModal({ acik, baslik, dosyaAdi = "", metin = "", segmentler = null, fileUrl = "", onKapat = () => {}, eylemler = null, duzenlenebilir = false, onKaydet = null, onGonder = null, onIndir = null, onRevize = null, kayitNo = "", ustIcerik = null, kagitKose = null, altKunye = null, birincil = null }) {
  const dar = useDarEkran();
  const kapatRef = useRef(null);
  const alanRef = useRef(null);
  const d = useDuzenleme({ metin, duzenlenebilir, alanRef, onKaydet, onGonder, onIndir });
  // Revize önerisi incelenirken kâğıt gizlenir (aynı metni iki kez göstermek yığılma yaratır;
  // istek sürerken elle düzeltme "Uygula"da sessizce ezilmesin). HITL: AI doğrudan uygulamaz.
  const [revizeOneriAcik, setRevizeOneriAcik] = useState(false);
  useOtomatikYukseklik(alanRef, [d.metinD, acik, duzenlenebilir, revizeOneriAcik]);
  const odakIade = useOdakIadesi(acik);
  useEffect(() => { kagitStilYukle(); }, []);
  const kapatIstegi = () => { if (d.kirli) { d.setKapatUyari(true); return; } onKapat(); };
  const vurgulu = !!(segmentler && segmentler.length);
  const calisma = !!fileUrl || duzenlenebilir || vurgulu;

  return (
    <Dialog.Root open={acik} onOpenChange={(v) => { if (!v) kapatIstegi(); }}>
      <AnimatePresence>
        {acik && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
                style={{ position: "fixed", inset: 0, zIndex: 300, ...KARARTI, overflowY: "auto", overscrollBehavior: "contain", padding: dar ? "16px 12px calc(32px + env(safe-area-inset-bottom))" : "32px 16px 48px" }}>
                <Dialog.Content asChild forceMount onCloseAutoFocus={odakIade}
                  onOpenAutoFocus={(e) => { e.preventDefault(); (duzenlenebilir ? alanRef.current : kapatRef.current)?.focus(); }}>
                  <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
                    style={{ width: "min(760px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: SP.m, outline: "none" }}>
                    <style>{PERDE_CSS}</style>
                    <Dialog.Description style={SR_ONLY}>{baslik} — A4 belge önizlemesi.</Dialog.Description>
                    <UstSerit kayitNo={kayitNo} baslik={baslik} dosyaAdi={dosyaAdi} duzenleme={duzenlenebilir ? d : null} eylemler={eylemler}
                      kapatRef={kapatRef} kapatIstegi={kapatIstegi} birincil={birincil} />
                    {/* Perde hep koyu → hata rengi tema-bağımsız açık mercan (onInkHata). */}
                    {duzenlenebilir && d.stt.hata && <div role="alert" style={{ ...TYPE.data, fontWeight: 500, color: PAL.onInkHata, textAlign: "center" }}>{d.stt.hata}</div>}
                    {d.kapatUyari && d.kirli && <KirliUyari onKaydet={() => onKaydet?.(d.metinD)} onCik={onKapat} />}
                    {duzenlenebilir && onRevize && (
                      <RevizePaneli metin={d.metinD} onRevize={onRevize} onUygula={d.yaz} onOneriDegisti={setRevizeOneriAcik} />
                    )}
                    {ustIcerik}
                    {/* Düz metin + düzenlenemez + vurgusuz → GERÇEK A4 düzeni (A4Belge). Diğer üç kip
                        (PDF, kâğıt üstünde düzenleme, çıkarım vurgulu kaynak) kendi düzenini korur. */}
                    {!revizeOneriAcik && !calisma && <NushaKagit metin={metin || "İçerik henüz hazır değil."} dar={dar} kose={kagitKose} />}
                    {!revizeOneriAcik && calisma && (
                      <CalismaKagidi fileUrl={fileUrl} duzenlenebilir={duzenlenebilir} segmentler={vurgulu ? segmentler : []} metin={metin}
                        alanRef={alanRef} metinD={d.metinD} onYaz={d.yaz} />
                    )}
                    {altKunye}
                    {!dar && (
                      <div data-perde-ipucu="" style={{ ...TYPE.meta, textAlign: "center" }}>
                        {duzenlenebilir ? "Esc vazgeçer; kaydedilmemiş değişiklikte önce sorar" : "Kapatmak için Esc'e basın ya da dışarı tıklayın"}
                      </div>
                    )}
                  </motion.div>
                </Dialog.Content>
              </motion.div>
            </Dialog.Overlay>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
