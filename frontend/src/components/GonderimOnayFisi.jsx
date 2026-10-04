/* GonderimOnayFisi — "Onayla ve gönder"in İKİNCİ ADIMI: bilinçli onay.

   Ürünün temel sözü "memur onaylamadan hiçbir yazı çıkmaz". Sonuç ekranındaki düğme önceden
   tek tıkla Giden'e yazıyordu (bağımsız kullanılabilirlik denetimi, 1 numaralı kusur). Artık
   düğme bu fişi açar; fiş, gidecek yazının künyesini KENDİ METNİNDEN okur (lib/gonderimHazirlik)
   ve memur ancak gördükten sonra onaylar.

   Sözleşmeler:
   · Gönderim YALNIZ "Onayla ve gönder" ile olur; Esc / Vazgeç / zemin tıklaması hiçbir şey
     yazmaz. Odak açılışta birincil düğmede (Enter = onay), kapanışta tetikleyiciye döner.
   · Engelleyen kusur varsa (boş gövde, açıklama vaadi, [DOĞRULA]) onay düğmesi KİLİTLİDİR;
     yerine "Düzenle" önerilir — boş yazı memurun dikkatinden kaçıp gönderilemez.
   · Gönderim sürerken fiş kilitli kalır; başarısızlıkta fiş AÇIK kalır ve hata satır içinde
     söylenir (toast tek sinyal değil). Başarıda fiş kapanır, mühür kâğıda iner (HukumMuhru).
   · Bu fiş damga BASMAZ — ekran başına ≤2 damga bütçesi kâğıttaki mühre aittir.
   · Risk bandı yazıyla söylenir; skor yüzde olarak gösterilmez (riskOlcuEtiketi). */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Btn, Icon, MONO, DISPLAY, PAL, DERIN, BANT, ALFA, TYPE, TNUM, RAD, SP, SH, odakDongusu, focusRing } from "./neonUi.jsx";
import { riskOlcuEtiketi } from "../lib/detayYorum.js";

const bugun = () => new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Satir({ etiket, children, not }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: SP.m, padding: "9px 0", borderTop: `1px solid ${PAL.line}` }}>
      <dt style={{ ...TYPE.meta, color: PAL.mut2, paddingTop: 1 }}>{etiket}</dt>
      <dd style={{ margin: 0, minWidth: 0, ...TYPE.data, color: PAL.ink, fontWeight: 500, overflowWrap: "anywhere" }}>
        {children || <span style={{ color: PAL.mut2, fontWeight: 400 }}>Metinde bulunamadı</span>}
        {not && <span style={{ display: "block", marginTop: 2, ...TYPE.meta, color: PAL.mut2, fontWeight: 400 }}>{not}</span>}
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
    // Odak son (birincil) etkin düğmede: hazırsa Enter = onay, kilitliyse Enter = düzenle.
    const dugmeler = Array.from(kutuRef.current?.querySelectorAll("button:not([disabled])") || []);
    dugmeler[dugmeler.length - 1]?.focus();
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

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="presentation" onMouseDown={() => { if (!gonderiliyor) onVazgec(); }}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 16,
        background: "color-mix(in srgb, var(--ke-ink) 38%, transparent)", animation: "ke-fis-zemin .16s ease-out both" }}>
      <style>{"@keyframes ke-fis-zemin{from{opacity:0}to{opacity:1}}"}</style>
      <section ref={kutuRef} role="alertdialog" aria-modal="true" aria-labelledby="ke-fis-baslik" aria-describedby="ke-fis-aciklama"
        onKeyDown={odakDongusu} onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "calc(100vh - 32px)", overflow: "auto", background: PAL.surfPop,
          border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, animation: "nu-rise .22s var(--ke-ease-out) both" }}>
        <div style={{ padding: "16px 24px 0" }}>
          <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>
            <span style={{ color: PAL.ink, fontWeight: 600 }}>Giden evrak</span>
            <span>Onay fişi</span>
            <span style={{ flex: 1, height: 1, background: PAL.line }} />
            <span style={{ fontFamily: MONO, ...TNUM }}>{bugun()}</span>
          </div>
          <div aria-hidden="true" style={{ marginTop: SP.s, height: 4, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}` }} />
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
          <Satir etiket="Muhatap">{kunye.muhatap}</Satir>
          <Satir etiket="Konu">{kunye.konu}</Satir>
          <Satir etiket="Sayı" not="Kayıt numarası gönderimde evrak kaydı sırasında verilir.">
            {kunye.sayi && <span style={{ fontFamily: MONO, fontSize: 13, ...TNUM }}>{kunye.sayi}</span>}
          </Satir>
          <Satir etiket="Tarih">{kunye.tarih && <span style={{ ...TNUM }}>{kunye.tarih}</span>}</Satir>
          <Satir etiket="Kapanış · imza" not={ayrinti}>{[kunye.kapanis, kunye.imza].filter(Boolean).join(" — ")}</Satir>
          {bant && (
            <Satir etiket="Risk bandı">
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

        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", padding: "16px 24px 20px", marginTop: 16, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
          {onaylayan && (
            <span style={{ ...TYPE.meta, color: PAL.mut2, marginRight: "auto" }}>
              Onaylayan: <strong style={{ color: PAL.ink2, fontWeight: 600 }}>{onaylayan}</strong>
            </span>
          )}
          <Btn onClick={onVazgec} disabled={gonderiliyor} style={{ minHeight: 42, marginLeft: onaylayan ? 0 : "auto" }}>Vazgeç</Btn>
          {hazir ? (
            <button type="button" onClick={onOnayla} disabled={gonderiliyor} data-press="" {...focusRing}
              aria-label={gonderiliyor ? "Gönderiliyor" : "Yazıyı onayla ve Giden Evrak'a gönder"}
              style={{ cursor: gonderiliyor ? "progress" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, minHeight: 42, padding: "9px 20px",
                borderRadius: RAD.ctl, border: "1px solid transparent", background: DERIN.T, color: PAL.onAccent, ...TYPE.ui, fontWeight: 600 }}>
              {gonderiliyor ? <><Icon.spin width={14} height={14} /> Gönderiliyor…</> : <><Icon.send width={14} height={14} /> {hata ? "Tekrar dene" : "Onayla ve gönder"}</>}
            </button>
          ) : (
            <Btn primary onClick={onDuzenle} style={{ minHeight: 42 }}><Icon.edit width={14} height={14} /> Taslağı düzenle</Btn>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
