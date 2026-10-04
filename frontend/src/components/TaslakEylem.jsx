/* TaslakEylem — Taslaklar karar panelinin EYLEM katmanı + kuyruk boşalınca "zafer" ekranı.
   (TaslaklarView 800 satır sınırına dayandığı için ayrıldı; davranış sözleşmeleri aynen.)

   Sözleşmeler (geri döndürme):
   · Gönder ekranın TEK primary'sidir; gönderim İKİ ADIMLIDIR (Gönder → Onayla ve gönder).
   · Onay durumları (sil/gönder/hata) eylem yığınının YERİNE geçer — iki karar aynı anda açık kalmaz.
   · sendBusy tüm eylemleri kilitler (in-flight yarış koruması).
   · Gönderim başarısızsa onay AÇIK kalır ve hata satır içinde söylenir (toast tek sinyal değil).

   Telefon (kompakt): eylemler sayfanın dibine yapışan bir KARAR ÇUBUĞUNA taşınır. Önceden Gönder
   390px'te ~1600px aşağıdaydı (liste + kâğıt + fiş geçilmeden ulaşılamıyordu). Çubuk sohbet
   düğmesiyle (sağ alt, 52px) aynı tabana oturur; sağ ucu o düğmeye yer bırakır — ikisi tek bir
   "dok" gibi okunur, biri ötekini örtmez. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Btn, Damga, Icon, MONO, DISPLAY, PAL, DERIN, BANT, TYPE, TNUM, RAD, SP, SH, focusRing, ViewWrap } from "./neonUi.jsx";

const TAM_GENIS = { width: "100%", justifyContent: "center" };
const FAB_PAY = 68;   // sağ alttaki sohbet düğmesi (52px + 16px aralık) — çubuk onun üstüne binmez

/* Sağ altta yüzen bir düğme (sohbet FAB'ı) var mı? Kabuk düzeni değişebildiği için varsayılmaz,
   ÖLÇÜLÜR: yalnız gerçekten çubuğun bandında duran sabit konumlu öğe için yer açılır. */
function useSagAltDolu(aktif) {
  const [dolu, setDolu] = useState(false);
  useLayoutEffect(() => {
    if (!aktif || typeof window === "undefined") return undefined;
    const olc = () => {
      const fab = document.querySelector('button[aria-label="Evrak asistanını aç"]');
      const r = fab?.getBoundingClientRect();
      const sabit = fab && window.getComputedStyle(fab).position === "fixed";
      setDolu(!!(sabit && r && r.width > 0 && r.bottom > window.innerHeight - 96 && r.left > window.innerWidth - 120));
    };
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, [aktif]);
  return dolu;
}

export const KALEM = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z M14 6l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const COP = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* Sakin metin-düğme — ikincil/yıkıcı eylemler. */
export function MetinEylem({ onClick, renk = DERIN.T, ariaLabel, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, padding: "8px 10px", minHeight: 36, border: "none", background: "transparent", borderRadius: RAD.ctl, ...TYPE.data, fontWeight: 500, color: renk, opacity: disabled ? 0.55 : 1, transition: "background .12s ease-out, transform .14s var(--ke-ease-out)" }}>
      {children}
    </button>
  );
}

/* Onay cümlesi — birim bilinmiyorsa "Yazı — birimine" gibi kırık bir cümle kurulmaz. */
function GonderimCumlesi({ birim }) {
  if (!birim || birim === "—") return <>Yazı Giden Evrak&apos;a kalıcı kaydedilecek. Emin misiniz?</>;
  return <>Yazı <strong style={{ fontWeight: 600, color: PAL.ink }}>{birim}</strong> birimine gönderilecek ve Giden Evrak&apos;a kalıcı kaydedilecek. Emin misiniz?</>;
}

/**
 * Eylem içeriği — masaüstünde dikey yığın, telefonda yapışkan çubuk.
 * @param {{ ad: string, birim: string, sendBusy: boolean, kompakt?: boolean,
 *   durum: "bos"|"gonder"|"sil", hata: boolean, setDurum: (d: string) => void,
 *   onGonder: () => void, onDuzenle: () => void, onKurul: () => void, onSil: () => void }} p
 */
export function KararEylemleri({ ad, birim, sendBusy, kompakt = false, durum, hata, setDurum, onGonder, onDuzenle, onKurul, onSil, gonderKilit = false }) {
  const kapRef = useRef(null);
  const fabVar = useSagAltDolu(kompakt);
  // Onay açılınca odak doğrudan onay düğmesine — klavyeyle (G kısayolu) gelen memur Enter'la
  // gönderir, Esc ile vazgeçer. Fareyle açılınca da aynı: odak düğmeyi kaybetmez.
  useEffect(() => {
    if (durum !== "bos") kapRef.current?.querySelector("button")?.focus?.();
  }, [durum]);
  // Esc onayı kapatır ve odağı kuyruğa döndürür (klavye döngüsü: ↓ → G → Esc → ↓ …).
  const esc = (e) => {
    if (e.key !== "Escape" || durum === "bos" || sendBusy) return;
    e.stopPropagation(); setDurum("bos");
    document.querySelector('[role="listbox"][aria-label="Taslak kuyruğu"]')?.focus();
  };

  const mesaj = durum === "sil"
    ? <p role="status" style={{ margin: 0, ...TYPE.data, color: DERIN.kirmizi, fontWeight: 500 }}>Taslak kalıcı olarak silinecek. Emin misiniz?</p>
    : durum === "gonder"
      ? (hata
        ? <p role="alert" style={{ margin: 0, display: "flex", gap: SP.s, alignItems: "flex-start", ...TYPE.data, color: DERIN.kirmizi, fontWeight: 500 }}>
            <Icon.alert width={14} height={14} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>Gönderim tamamlanmadı — taslak kuyrukta duruyor. Nedeni bildirimde; bağlantıyı kontrol edip tekrar deneyebilirsiniz.</span>
          </p>
        : <p role="status" style={{ margin: 0, ...TYPE.data, color: PAL.ink2 }}><GonderimCumlesi birim={birim} /></p>)
      : null;

  // Telefon çubuğunda onay düğmeleri yan yana: birincil esner (tek satır), Vazgeç içerik kadar.
  const birincilStil = kompakt ? { flex: 1, justifyContent: "center", whiteSpace: "nowrap", minHeight: 44 } : { ...TAM_GENIS, minHeight: 44 };
  const ikincilStil = kompakt ? { flex: "none", justifyContent: "center", minHeight: 44 } : { ...TAM_GENIS, minHeight: 44 };
  const dugmeler = durum === "sil" ? (
    <>
      <Btn onClick={onSil} style={{ ...birincilStil, color: DERIN.kirmizi }} ariaLabel="Silmeyi onayla"><COP /> Evet, sil</Btn>
      <Btn onClick={() => setDurum("bos")} style={ikincilStil}>Vazgeç</Btn>
    </>
  ) : durum === "gonder" ? (
    <>
      <Btn primary onClick={onGonder} disabled={sendBusy} style={birincilStil} ariaLabel={`${ad} gönderimini onayla`}>
        {sendBusy ? <><Icon.spin width={14} height={14} /> Gönderiliyor…</> : <><Icon.check width={14} height={14} /> {hata ? "Tekrar dene" : "Onayla ve gönder"}</>}
      </Btn>
      <Btn onClick={() => setDurum("bos")} disabled={sendBusy} style={ikincilStil}>Vazgeç</Btn>
    </>
  ) : kompakt ? (
    <>
      <Btn onClick={onDuzenle} disabled={sendBusy} ariaLabel={`${ad} taslağını düzenle`} title="Düzenle" style={{ minWidth: 44, minHeight: 44, padding: 0, justifyContent: "center" }}><KALEM width={16} height={16} /></Btn>
      <Btn onClick={onKurul} disabled={sendBusy} ariaLabel={`${ad} taslağı için Bürokrasi Kurulu'nu topla`} title="Kurulu topla" style={{ minWidth: 44, minHeight: 44, padding: 0, justifyContent: "center" }}><Icon.scale width={16} height={16} /></Btn>
      <Btn primary onClick={() => setDurum("gonder")} disabled={sendBusy || gonderKilit} style={{ flex: 1, justifyContent: "center", minHeight: 44 }} ariaLabel={`${ad} taslağını gönder — önce onay istenir`}>
        <Icon.send width={14} height={14} /> Gönder
      </Btn>
    </>
  ) : (
    <>
      <Btn primary onClick={() => setDurum("gonder")} disabled={sendBusy || gonderKilit} style={{ ...TAM_GENIS, minHeight: 42 }} ariaLabel={`${ad} taslağını gönder — önce onay istenir`}>
        <Icon.send width={14} height={14} /> Gönder
      </Btn>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: SP.s }}>
        <Btn onClick={onDuzenle} disabled={sendBusy} style={TAM_GENIS} ariaLabel={`${ad} taslağını düzenle`}><KALEM /> Düzenle</Btn>
        <Btn onClick={onKurul} disabled={sendBusy} style={TAM_GENIS} ariaLabel={`${ad} taslağı için Bürokrasi Kurulu'nu topla`}>
          <Icon.scale width={14} height={14} /> Kurulu topla
        </Btn>
      </div>
      <div style={{ marginTop: SP.xs }}>
        <MetinEylem onClick={() => setDurum("sil")} disabled={sendBusy} renk={DERIN.kirmizi} ariaLabel={`${ad} taslağını sil`}><COP /> Sil</MetinEylem>
      </div>
    </>
  );

  if (kompakt) {
    return (
      <div ref={kapRef} onKeyDown={esc} role="group" aria-label="Karar çubuğu"
        style={{ position: "sticky", bottom: 24, zIndex: 5, display: "flex", flexDirection: "column", gap: SP.s, padding: 4, paddingRight: fabVar ? FAB_PAY : 4, minHeight: 52, boxSizing: "border-box",
          background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.pop }}>
        {mesaj && <div style={{ padding: "8px 8px 0" }}>{mesaj}</div>}
        <div style={{ display: "flex", gap: SP.xs, alignItems: "center" }}>{dugmeler}</div>
      </div>
    );
  }
  return (
    <div ref={kapRef} onKeyDown={esc} style={{ padding: 20, paddingTop: SP.l, display: "flex", flexDirection: "column", gap: SP.s, borderTop: `1px solid ${PAL.line}`, background: PAL.surf2 }}>
      {mesaj && <div style={{ marginBottom: 4 }}>{mesaj}</div>}
      {dugmeler}
    </div>
  );
}

/* Kuyruk temiz — bu oturumda kuyruk ÇALIŞILARAK boşaltıldı. Bir zafer anıdır ama gürültüsüz:
   eskiden genel boş durumun "KAYIT YOK" damgası basılıyordu (zafer anında "kayıt yok" yanlış
   hüküm). Artık oturum defteri: kaç karar verildi, kaçı gönderildi/silindi — sayılar Archivo,
   hüküm TEK damga ("Kuyruk temiz", yeşil). Damga girişi bir kez oynar; reduced-motion global
   kuralla statik. */
export function KuyrukTemiz({ gonderildi, silindi, onGoOutbox, onGoInbox }) {
  const toplam = gonderildi + silindi;
  const Satir = ({ etiket, n, renk }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, padding: "10px 0", borderTop: `1px solid ${PAL.line}` }}>
      <span style={{ ...TYPE.data, color: PAL.ink2, flex: 1 }}>{etiket}</span>
      <span style={{ ...TYPE.num, color: renk }}>{n}</span>
    </div>
  );
  return (
    <ViewWrap id="taslak-h" title="Taslaklar" kunye="Karar kuyruğu" sub="Bu oturumdaki bütün taslaklar karara bağlandı">
      <div style={{ display: "grid", placeItems: "center", padding: "24px 0 40px" }}>
        <div style={{ position: "relative", width: "min(440px, 100%)", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, animation: "nu-rise .32s var(--ke-ease-out) both" }}>
          <div style={{ display: "flex", alignItems: "center", height: 34, padding: "0 20px", borderBottom: `1px solid ${PAL.lineHi}`, ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase" }}>
            <span>Oturum defteri</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, ...TNUM }}>{new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div style={{ padding: "22px 20px 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.m, marginBottom: SP.l, flexWrap: "wrap" }}>
              <div>
                <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", marginBottom: 4 }}>Verilen karar</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 56, lineHeight: "56px", fontWeight: 800, fontStretch: "118%", letterSpacing: "-.03em", color: PAL.ink, ...TNUM }}>{toplam}</div>
              </div>
              <Damga ton={BANT.yesil.c} egim={-7} style={{ marginBottom: 8 }}>Kuyruk temiz</Damga>
            </div>
            <Satir etiket="Giden Evrak'a gönderildi" n={gonderildi} renk={DERIN.yesil} />
            <Satir etiket="Silindi" n={silindi} renk={PAL.mut} />
            <p style={{ margin: `${SP.m}px 0 ${SP.l}px`, ...TYPE.meta, color: PAL.mut2 }}>
              Karar bekleyen taslak kalmadı. Yeni evrak işlendikçe taslaklar buraya düşer.
            </p>
            <div style={{ display: "flex", gap: SP.s, flexWrap: "wrap" }}>
              {onGoOutbox && <Btn primary onClick={onGoOutbox} style={{ flex: "1 1 160px", justifyContent: "center", minHeight: 44 }}><Icon.send width={14} height={14} /> Giden evrakı aç</Btn>}
              <Btn onClick={onGoInbox} style={{ flex: "1 1 140px", justifyContent: "center", minHeight: 44 }}><Icon.inbox /> Gelen evrak</Btn>
            </div>
          </div>
        </div>
      </div>
    </ViewWrap>
  );
}
