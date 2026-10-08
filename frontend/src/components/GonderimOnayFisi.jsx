/* GonderimOnayFisi — "Onayla ve gönder"in İKİNCİ ADIMI: bilinçli onay.

   Ürünün temel sözü "memur onaylamadan hiçbir yazı çıkmaz". Sonuç ekranındaki düğme önceden
   tek tıkla Giden'e yazıyordu (bağımsız kullanılabilirlik denetimi, 1 numaralı kusur). Artık
   düğme bu fişi açar; fiş, gidecek yazının künyesini KENDİ METNİNDEN okur (lib/gonderimHazirlik)
   ve memur ancak gördükten sonra onaylar.

   Sözleşmeler:
   · Gönderim YALNIZ "Onayla ve gönder" ile olur; Esc / Vazgeç / zemin tıklaması hiçbir şey
     yazmaz. Odak açılışta GÜVENLİ varsayılanda (tur 9 jüri): hazırsa Vazgeç'te — Enter kalıcı
     kaydı tetiklemez; kilitliyse "Taslağı düzenle"de. Kapanışta tetikleyiciye döner.
   · Engelleyen kusur varsa (boş gövde, açıklama vaadi, [DOĞRULA]) onay düğmesi KİLİTLİDİR;
     yerine "Düzenle" önerilir — boş yazı memurun dikkatinden kaçıp gönderilemez.
   · Gönderim sürerken fiş kilitli kalır; başarısızlıkta fiş AÇIK kalır ve hata satır içinde
     söylenir (toast tek sinyal değil). Başarıda fiş kapanır, mühür kâğıda iner (HukumMuhru).
   · Bu fiş damga BASMAZ — ekran başına ≤2 damga bütçesi kâğıttaki mühre aittir.
   · Risk bandı yazıyla söylenir; skor yüzde olarak gösterilmez (riskOlcuEtiketi). */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Btn, Damga, Icon, MONO, DISPLAY, V, PAL, DERIN, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, odakDongusu, focusRing } from "./neonUi.jsx";
import { riskOlcuEtiketi } from "../lib/detayYorum.js";
import { bugunTarihi as bugun, tarihFarkli as tarihFarkliMi } from "../lib/gonderimTarihi.js";

/* Konu, kuyruk ve karar fişindeki gibi baş harfi büyük gösterilir (yalnız sunum; metne dokunulmaz). */
const basHarf = (s) => (s ? s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1) : s);
const SATIR_GECIKME_MS = 40;

/* KONTROL ÇİZELGESİ — künye satırları yukarıdan aşağı sırayla "görülür": sol kenarda tik
   (değer metinde var) ya da boş halka (bulunamadı). Hareket yalnız opaklık + 2px kayma, satır
   başına 40ms; reduced-motion global kuralıyla anında. İşaret salt görsel — durum metinle de
   yazılı ("Metinde bulunamadı"), renk tek sinyal değil. */
function Satir({ etiket, children, not, notKunye = false, sira = 0, isaret = "tamam" }) {
  const tamam = isaret === "tamam";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "18px 100px minmax(0, 1fr)", gap: SP.m, padding: "9px 0", borderTop: `1px solid ${PAL.line}`,
      animation: `ke-fis-satir .22s var(--ke-ease-out) ${120 + sira * SATIR_GECIKME_MS}ms both` }}>
      <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 16, height: 16, marginTop: 1, borderRadius: RAD.dot,
        border: `1px solid ${tamam ? "transparent" : PAL.lineHi}`, background: tamam ? ALFA(BANT.yesil.c) : "transparent", color: DERIN.yesil }}>
        {tamam && <Icon.check width={11} height={11} />}
      </span>
      <dt style={{ ...TYPE.meta, color: PAL.mut2, paddingTop: 1 }}>{etiket}</dt>
      <dd style={{ margin: 0, minWidth: 0, ...TYPE.data, color: PAL.ink, fontWeight: 500, overflowWrap: "anywhere" }}>
        {children || <span style={{ color: PAL.mut2, fontWeight: 400 }}>Metinde bulunamadı</span>}
        {not && <span style={{ display: "block", marginTop: 2, ...(notKunye ? { ...TYPE.antet, textTransform: "uppercase", color: PAL.mut3 } : { ...TYPE.meta, color: PAL.mut2 }), fontWeight: 400 }}>{not}</span>}
      </dd>
    </div>
  );
}

function Madde({ ton, children }) {
  const kirmizi = ton === "kirmizi";
  return (
    <li style={{ display: "flex", gap: SP.s, alignItems: "flex-start", padding: "8px 10px", borderRadius: RAD.ctl,
      background: ALFA(kirmizi ? BANT.kirmizi.c : BANT.sari.c), ...TYPE.data, color: kirmizi ? DERIN.kirmizi : DERIN.sari }}>
      <Icon.alert width={14} height={14} style={{ flex: "none", marginTop: 3 }} aria-hidden="true" />
      <span style={{ color: PAL.ink2 }}>{children}</span>
    </li>
  );
}

/**
 * @param {{ denetim: ReturnType<import("../lib/gonderimHazirlik.js").gonderimDenetimi>,
 *   r: object|null, onaylayan?: string, gonderiliyor: boolean, hata: boolean,
 *   onOnayla: () => void, onVazgec: () => void, onDuzenle: () => void }} p
 */
export default function GonderimOnayFisi({ denetim, r, onaylayan = "", gonderiliyor, hata, onOnayla, onVazgec, onDuzenle }) {
  const kutuRef = useRef(null);
  const kilitliRef = useRef(gonderiliyor);
  const vazgecFn = useRef(onVazgec);
  useEffect(() => { vazgecFn.current = onVazgec; kilitliRef.current = gonderiliyor; });

  useEffect(() => {
    const onceki = document.activeElement;
    // Güvenli varsayılan: [data-ilk-odak] (hazırsa Vazgeç, kilitliyse Düzenle).
    kutuRef.current?.querySelector("[data-ilk-odak] button:not([disabled]), button[data-ilk-odak]:not([disabled])")?.focus();
    const tus = (e) => { if (e.key === "Escape" && !kilitliRef.current) { e.stopPropagation(); vazgecFn.current(); } };
    window.addEventListener("keydown", tus, true);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tus, true);
      document.body.style.overflow = eski;
      if (onceki && document.contains(onceki)) onceki.focus({ preventScroll: true });
    };
  }, []);

  const { kunye, engel, uyari, hazir } = denetim;
  const bant = BANT[r?.risk_metadata?.bant] ? r.risk_metadata.bant : null;
  const olcu = riskOlcuEtiketi(r?.risk_metadata);
  const ayrinti = [kunye.antet && `Gönderen: ${kunye.antet}`].filter(Boolean)[0];
  // Yazı tarihi gönderim gününden farklıysa söylenir (imza öncesi son kontrol bunu yakalamalı).
  // Yüklem lib/gonderimTarihi'nden — karar fişinin "Gönderim kontrolü" ile AYNI hüküm (jüri tur 8).
  const tarihFarkli = tarihFarkliMi(kunye.tarih);
  const isaret = (v) => (v ? "tamam" : "eksik");

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="presentation" onMouseDown={() => { if (!gonderiliyor) onVazgec(); }}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 16,
        background: `color-mix(in srgb, ${PAL.scrim}, ${PAL.scrimKoyu} 55%)`, animation: "ke-fis-zemin .16s ease-out both" }}>
      {/* Tur 9: %30 → %55 — kuyruk metni fiş kenarından okunuyordu (blur yerine opaklık:
          modallarda backdropFilter yasak, jank). Örtü scrim + scrimKoyu (jüri tur 8: açık temada fiş aynı tonlu panellerden
          ayrışmıyordu). Örtü PAL.scrim: iki temada da KARARTIR (eski ink-%38 karışımı koyu temada açık
          renk olduğundan sayfayı griye boyuyor, fiş yükselmek yerine çöküyordu). */}
      <style>{"@keyframes ke-fis-zemin{from{opacity:0}to{opacity:1}}@keyframes ke-fis-satir{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}"
        /* Fiş dibi odak halkası (2. jüri): mavi dolgunun üstüne ikinci mavi halka ağırdı. Boşluk
           dip zemininde, halka MÜREKKEP rengi — dolgu tonundan ayrışır, iki temada AA. */
        + "[data-fis-dip] button:focus-visible{box-shadow:0 0 0 2px var(--ke-odak-bosluk),0 0 0 4px var(--ke-ink)!important}"}</style>
      <section ref={kutuRef} role="alertdialog" aria-modal="true" aria-labelledby="ke-fis-baslik" aria-describedby="ke-fis-aciklama"
        onKeyDown={odakDongusu} onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "calc(100vh - 32px)", overflow: "auto", background: PAL.surfPop,
          border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, animation: "nu-rise .22s var(--ke-ease-out) both" }}>
        <div style={{ position: "relative", padding: "16px 24px 0" }}>
          <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>
            <span style={{ color: PAL.ink, fontWeight: 600 }}>Giden evrak</span>
            <span>Onay fişi</span>
            <span style={{ flex: 1, height: 1, background: PAL.line }} />
            <span style={{ fontFamily: MONO, ...TNUM }}>{bugun()}</span>
          </div>
          <div aria-hidden="true" style={{ marginTop: SP.s, height: 4, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}` }} />
          {gonderiliyor && hazir && (
            /* İmza anı (2. jüri): onay verildiği an fişe ıstampa basılır — gönderim sürerken görünür,
               hata olursa kalkar ("Onaylandı" olgudur; "Gönderildi" iddia edilmez). Basma hareketi
               Damga atomunun kendi animasyonu; reduced-motion global kuralıyla anında. */
            <span style={{ position: "absolute", right: 24, top: 44, pointerEvents: "none" }}>
              <Damga ton={V} egim={-6} oncelik={1}>Onaylandı</Damga>
            </span>
          )}
          <h2 id="ke-fis-baslik" style={{ margin: "14px 0 4px", fontFamily: DISPLAY, fontSize: 24, lineHeight: "28px", fontWeight: 800, fontStretch: "112%", letterSpacing: "-.02em", color: PAL.ink }}>
            {hazir ? "Bu yazı gönderilsin mi?" : "Bu yazı henüz gönderilemez"}
          </h2>
          <p id="ke-fis-aciklama" style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>
            {hazir
              ? "Onayladığınızda yazı imzanızla Giden Evrak'a kalıcı olarak kaydedilir. Künyeyi son kez kontrol edin."
              : "Aşağıdaki eksik giderilmeden yazı imzaya açılmaz."}
          </p>
        </div>

        <dl style={{ margin: "14px 24px 0" }}>
          <Satir sira={0} isaret={isaret(kunye.muhatap)} etiket="Muhatap">{kunye.muhatap}</Satir>
          <Satir sira={1} isaret={isaret(kunye.konu)} etiket="Konu">{basHarf(kunye.konu)}</Satir>
          <Satir sira={2} isaret={isaret(kunye.sayi)} etiket="Sayı" notKunye not="Kayıt no · gönderim anında verilir">
            {kunye.sayi && <span style={{ fontFamily: MONO, fontSize: 13, ...TNUM }}>{kunye.sayi}</span>}
          </Satir>
          <Satir sira={3} isaret={tarihFarkli ? "eksik" : isaret(kunye.tarih)} etiket="Tarih"
            not={tarihFarkli ? (
              /* Tarih uyarısı satırın İÇİNDE (tur 9 jüri: aynı sorun satırda ve altta ayrı kutuda
                 iki kez yazıyordu). */
              <span style={{ color: DERIN.sari }}>
                Bugün {bugun()} — yazının tarihi farklı.{" "}
                <button type="button" onClick={onDuzenle} disabled={gonderiliyor} {...focusRing} data-press=""
                  style={{ cursor: "pointer", padding: 0, border: "none", background: "transparent", ...TYPE.meta, fontWeight: 600, color: DERIN.T, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Tarihi düzenle
                </button>
              </span>
            ) : null}>
            {kunye.tarih && <span style={{ ...TNUM }}>{kunye.tarih}</span>}
          </Satir>
          <Satir sira={4} isaret={isaret(kunye.kapanis || kunye.imza)} etiket="Kapanış · imza" not={ayrinti}>{[kunye.kapanis, kunye.imza].filter(Boolean).join(" — ")}</Satir>
          {bant && (
            <Satir sira={5} etiket="Risk bandı">
              <span style={{ color: BANT[bant].c === BANT.yesil.c ? DERIN.yesil : bant === "kirmizi" ? DERIN.kirmizi : DERIN.sari, fontWeight: 600 }}>{BANT[bant].l}</span>
              {olcu && <span style={{ color: PAL.mut2, fontWeight: 400 }}> · {olcu}</span>}
            </Satir>
          )}
        </dl>

        {(engel.length > 0 || uyari.length > 0) && (
          <ul aria-label="Gönderim öncesi bulgular" style={{ listStyle: "none", margin: "12px 24px 0", padding: 0, display: "grid", gap: SP.xs }}>
            {engel.map((e) => <Madde key={e.kod} ton="kirmizi">{e.metin}</Madde>)}
            {uyari.map((u) => <Madde key={u.kod} ton="sari">{u.metin}</Madde>)}
          </ul>
        )}

        {hata && (
          <p role="alert" style={{ margin: "12px 24px 0", display: "flex", gap: SP.s, ...TYPE.data, color: DERIN.kirmizi, fontWeight: 500 }}>
            <Icon.alert width={14} height={14} style={{ flex: "none", marginTop: 3 }} />
            Gönderim tamamlanmadı — yazı taslak olarak duruyor. Bağlantıyı kontrol edip tekrar deneyin.
          </p>
        )}

        <div data-fis-dip="" style={{ "--ke-odak-bosluk": PAL.surf2, display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", padding: "16px 24px 20px", marginTop: 16, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
          {onaylayan && (
            <span style={{ ...TYPE.meta, color: PAL.mut2, marginRight: "auto" }}>
              Onaylayan: <strong style={{ color: PAL.ink2, fontWeight: 600 }}>{onaylayan}</strong>
            </span>
          )}
          <span data-ilk-odak={hazir ? "" : undefined} style={{ marginLeft: onaylayan ? 0 : "auto" }}><Btn onClick={onVazgec} disabled={gonderiliyor} style={{ minHeight: 44 }}>Vazgeç</Btn></span>
          {hazir ? (
            /* Btn primary (tur 8): elle çizilen düğme koyu temada açık lavanta zemin + koyu metin
               çiziyordu, Taslaklar'daki "Gönder" ise dolgu mavisi + beyaz — aynı eylem zincirinde
               iki primary dili. Artık tek atom, tek token çifti (--ke-dolgu-t / --ke-on-dolgu). */
            <Btn primary onClick={onOnayla} disabled={gonderiliyor}
              ariaLabel={gonderiliyor ? "Gönderiliyor" : "Yazıyı onayla ve Giden Evrak'a gönder"}
              style={{ minHeight: 44, padding: "9px 20px", fontWeight: 600, cursor: gonderiliyor ? "progress" : "pointer" }}>
              {gonderiliyor ? <><Icon.spin width={14} height={14} /> Gönderiliyor…</> : <><Icon.send width={14} height={14} /> {hata ? "Tekrar dene" : "Onayla ve gönder"}</>}
            </Btn>
          ) : (
            <span data-ilk-odak=""><Btn primary onClick={onDuzenle} style={{ minHeight: 44 }}><Icon.edit width={14} height={14} /> Taslağı düzenle</Btn></span>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
