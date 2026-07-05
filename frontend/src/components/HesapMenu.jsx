/* HesapMenu — sidebar tabanındaki kullanıcı kartı + hesap açılır menüsü (ChatGPT hesap
   menüsü deseninin kamu-evrak uyarlaması). Kart tetiktir; menü YUKARI açılır. Her öğe
   GERÇEK aksiyon: profil/yardım/KVKK modalları, hareket azaltma tercihi (canlı ajan izi
   animasyonları), komut paleti, oturumu kapat. Renk/tip/radius yalnız neonUi token'ları.
   Klavye: Esc + ok tuşları + Home/End; dış tık kapatır; kapanınca odak tetiğe döner.
   Scrim/dialog deseni KomutPaleti/MevzuatView ile birebir (rgba scrim + RAD.pop + SH.modal). */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MONO, T, V, PAL, BANT, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, Icon } from "./neonUi.jsx";

const ROL_TR = { memur: "Memur", yetkili: "Yetkili", yonetici: "Yönetici", sistem: "Sistem" };

function bashHarfler(ad) {
  const p = (ad || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || p[0]?.[1] || "")).toUpperCase() || "?";
}

/* Menü satırı ikonları — neonUi Icon setinde karşılığı olmayanlar, setin çizgi diliyle
   (24 viewBox, 1.6-1.8 stroke, round cap) satır-içi tanımlanır (NeonSidebar deseni). */
const MIC = {
  kisi: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.6" /><path d="M5 20 C5 16.5 8 14.5 12 14.5 C16 14.5 19 16.5 19 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  hareket: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12 H9 L11 7 L13 17 L15 12 H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  yardim: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M9.6 9.3 C9.6 7.9 10.7 7 12 7 C13.3 7 14.4 7.9 14.4 9.2 C14.4 11 12 11.2 12 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="16.4" r="1" fill="currentColor" /></svg>,
  kvkk: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 L19 6 V11 C19 15.5 16 19.2 12 21 C8 19.2 5 15.5 5 11 V6 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 11.5 L11.2 13.7 L15 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  cikis: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  palet: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
};

/* Durum çipi — semantik renk + metin (renk tek sinyal değil). */
const Cip = ({ renk, zemin, children }) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: RAD.chip, background: zemin, ...TYPE.meta, fontWeight: 500, color: renk }}>{children}</span>
);

/* Kip (modal) — scrim + dialog; Esc kapatır, açılışta kapat butonu odaklanır, gövde
   kaydırması kilitlenir (KomutPaleti modal disiplini). PORTAL ŞART: sidebar position:sticky
   olduğundan kendi stacking context'ini kurar — fixed+zIndex bile içeride hapsolur ve
   ana içerik kartları modalın üstünde boyanırdı (görülen hata); body'ye taşınır. */
function Kip({ baslik, onKapat, children }) {
  const kapatRef = useRef(null);
  useEffect(() => {
    kapatRef.current?.focus();
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = eski; };
  }, []);
  const klavye = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onKapat(); return; }
    // Modal açıkken Ctrl+K paleti AÇMASIN — iki eşzamanlı aria-modal katman oluşurdu
    // (DashboardApp'in window dinleyicisine ulaşmadan burada yutulur).
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); e.stopPropagation(); return; }
    // Focus trap: Tab/Shift+Tab diyalog içinde döner — aria-modal sözleşmesi (arkadaki
    // scrim'li içeriğe klavyeyle çıkılmaz).
    if (e.key === "Tab") {
      const odaklar = e.currentTarget.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!odaklar.length) return;
      const ilk = odaklar[0], son = odaklar[odaklar.length - 1];
      if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
    }
  };
  return createPortal(
    <div role="presentation" onClick={onKapat} onKeyDown={klavye}
      style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(35,26,18,.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-label={baslik} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(440px,100%)", maxHeight: "84vh", overflowY: "auto", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, animation: "nu-rise .16s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "14px 16px", borderBottom: `1px solid ${PAL.line}` }}>
          <h2 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1 }}>{baslik}</h2>
          <button type="button" ref={kapatRef} onClick={onKapat} aria-label="Kapat" {...focusRing}
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{ cursor: "pointer", width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "transparent", color: PAL.mut, transition: "background .12s ease-out" }}>
            <Icon.x />
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* Profil modal satırı — etiket + değer (makine verisi MONO). */
const PRow = ({ l, v, mono, renk }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: SP.m, padding: "8px 0", borderBottom: `1px solid ${PAL.line}` }}>
    <span style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0 }}>{l}</span>
    <span style={mono
      ? { fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: renk || PAL.ink2, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...TNUM }
      : { ...TYPE.data, fontWeight: 500, color: renk || PAL.ink2, textAlign: "right" }}>{v}</span>
  </div>
);

function ProfilKip({ user, onKapat }) {
  return (
    <Kip baslik="Profil bilgileri" onKapat={onKapat}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginBottom: SP.m }}>
        <span aria-hidden="true" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: RAD.dot, background: V, display: "flex", alignItems: "center", justifyContent: "center", ...TYPE.ui, fontWeight: 600, color: PAL.onAccent }}>{bashHarfler(user?.ad_soyad)}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{user?.ad_soyad || "Kullanıcı"}</span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.eposta || "—"}</span>
        </span>
      </div>
      <PRow l="Unvan" v={user?.unvan || "—"} />
      <PRow l="Rol" v={ROL_TR[user?.rol] || user?.rol || "—"} renk={DERIN.V} />
      <PRow l="E-imza yetkisi" v={user?.e_imza_yetkisi ? "Var" : "Yok"} renk={user?.e_imza_yetkisi ? DERIN.yesil : PAL.mut2} />
      {user?.id && <PRow l="Kullanıcı no" v={String(user.id).slice(0, 13) + "…"} mono />}
      <p style={{ margin: `${SP.m}px 0 0`, ...TYPE.meta, color: PAL.mut2 }}>
        Profil bilgileri kurum yöneticisi tarafından tanımlanır; değişiklik için sistem yöneticinize başvurun.
      </p>
    </Kip>
  );
}

function YardimKip({ onKapat }) {
  const Kisayol = ({ k, a }) => (
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "6px 0" }}>
      <kbd style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 8px", flexShrink: 0 }}>{k}</kbd>
      <span style={{ ...TYPE.data, color: PAL.ink2 }}>{a}</span>
    </div>
  );
  return (
    <Kip baslik="Yardım ve kısayollar" onKapat={onKapat}>
      <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: SP.xs }}>Üç adımda evrak işleme</div>
      {[
        ["1", "Gelen Evrak'tan seçin, yeni belge yükleyin ya da örnek evrakla deneyin."],
        ["2", "Canlı ajan izini izleyin — Görev 1 evrakı anlar, Görev 2 resmî yazıyı üretir."],
        ["3", "Taslağı onaylayın, düzenleyin ya da reddedin — karar her zaman memurundur (HITL)."],
      ].map(([n, s]) => (
        <div key={n} style={{ display: "flex", gap: SP.m, padding: "6px 0", alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, flexShrink: 0, borderRadius: RAD.dot, background: ALFA(T), color: DERIN.T, ...TYPE.meta, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", ...TNUM }}>{n}</span>
          <span style={{ ...TYPE.data, color: PAL.ink2 }}>{s}</span>
        </div>
      ))}
      <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, margin: `${SP.l}px 0 ${SP.xs}px` }}>Klavye kısayolları</div>
      <Kisayol k="Ctrl K" a="Komut paleti — görünüm, eylem ve örnek evrak tek kutudan" />
      <Kisayol k="Esc" a="Açık menü, palet ve pencereleri kapatır" />
      <Kisayol k="Tab" a="Tüm denetimlerde klavye gezinmesi (odak halkasıyla)" />
    </Kip>
  );
}

function KvkkKip({ onKapat }) {
  const Madde = ({ children }) => (
    <div style={{ display: "flex", gap: SP.s, padding: "6px 0", alignItems: "flex-start" }}>
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.yesil, marginTop: 2 }}><Icon.check width={12} height={12} /></span>
      <span style={{ ...TYPE.data, color: PAL.ink2 }}>{children}</span>
    </div>
  );
  return (
    <Kip baslik="KVKK ve gizlilik" onKapat={onKapat}>
      <Madde>Çıkarılan kişisel veriler (TCKN, telefon) işleme sırasında <strong style={{ fontWeight: 600 }}>maskelenir</strong>; ham hâliyle saklanmaz.</Madde>
      <Madde>Sistem yalnız <strong style={{ fontWeight: 600 }}>sentetik/kurgu evrak</strong> ve kamuya açık mevzuatla çalışır; gerçek vatandaş verisi kullanılmaz.</Madde>
      <Madde>Her koşum SHA-256 <strong style={{ fontWeight: 600 }}>hash-zincirli denetim izi</strong> üretir — kayıtlar sonradan değiştirilemez (Denetim izi görünümünden doğrulanır).</Madde>
      <Madde>Yapay zekâ yalnız <strong style={{ fontWeight: 600 }}>öneri</strong> üretir; gönderim kararı her zaman yetkili memurdadır.</Madde>
      <p style={{ margin: `${SP.m}px 0 0`, ...TYPE.meta, color: PAL.mut2 }}>
        Ayrıntı için kurumunuzun KVKK aydınlatma metnine başvurun.
      </p>
    </Kip>
  );
}

/* Tek menü satırı — roving focus (tabIndex dışarıdan), hover/focus zemini, sağ uç aksesuarı. */
const MenuSatir = React.forwardRef(function MenuSatir({ ikon, label, sag, tehlike, role = "menuitem", checked, onClick }, ref) {
  const [hover, setHover] = useState(false);
  const renk = tehlike ? DERIN.kirmizi : hover ? PAL.ink : PAL.ink2;
  return (
    <button type="button" ref={ref} role={role} aria-checked={role === "menuitemcheckbox" ? checked : undefined}
      tabIndex={-1} onClick={onClick} {...focusRing}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: SP.s, padding: "8px 10px", borderRadius: RAD.ctl, border: "none", background: hover ? PAL.hov : "transparent", ...TYPE.ui, fontWeight: 500, color: renk, textAlign: "left", transition: "background .12s ease-out, color .12s ease-out" }}>
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: tehlike ? DERIN.kirmizi : hover ? DERIN.T : PAL.mut2, transition: "color .12s ease-out" }}>{ikon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {sag}
    </button>
  );
});

/* Anahtar görseli (menuitemcheckbox sağ ucu) — durum ayrıca aria-checked ile verilir. */
const Anahtar = ({ acik }) => (
  <span aria-hidden="true" style={{ width: 28, height: 16, flexShrink: 0, borderRadius: 8, background: acik ? DERIN.T : PAL.press, border: `1px solid ${acik ? DERIN.T : PAL.inputLine}`, position: "relative", transition: "background .15s ease-out" }}>
    <span style={{ position: "absolute", top: 1, left: acik ? 13 : 1, width: 12, height: 12, borderRadius: RAD.dot, background: PAL.onAccent, transition: "left .15s ease-out" }} />
  </span>
);

/* Açık menü paneli — kimlik başlığı + satırlar (HesapMenu gövdesi <50 satır kalsın diye ayrı). */
function MenuIcerik({ user, satirRefs, hareketAzalt, onHareketAzalt, onPalet, onLogout, sec, modalAc }) {
  const ayrac = <div role="separator" aria-hidden="true" style={{ height: 1, background: PAL.line, margin: `${SP.xs}px ${SP.s}px` }} />;
  return (
    <div role="menu" aria-label="Hesap menüsü"
      style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 236, background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.s, boxShadow: SH.pop, zIndex: 60, animation: "nu-rise .16s ease-out both" }}>
      {/* Kimlik başlığı — etkileşimsiz; menu rolünün erişilebilirlik ağacına satır olarak girmesin */}
      <div role="presentation" style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.s}px 10px ${SP.m}px` }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: RAD.dot, background: V, display: "flex", alignItems: "center", justifyContent: "center", ...TYPE.ui, fontWeight: 600, color: PAL.onAccent }}>{bashHarfler(user?.ad_soyad)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", ...TYPE.ui, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.ad_soyad || "Kullanıcı"}</span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.eposta || "—"}</span>
          <span style={{ display: "flex", gap: SP.xs, marginTop: 4, flexWrap: "wrap" }}>
            <Cip renk={DERIN.V} zemin={ALFA(V)}>{ROL_TR[user?.rol] || user?.rol || "Kullanıcı"}</Cip>
            {user?.e_imza_yetkisi && <Cip renk={DERIN.yesil} zemin={ALFA(BANT.yesil.c)}>E-imza</Cip>}
          </span>
        </span>
      </div>
      {ayrac}
      <MenuSatir ref={(el) => { satirRefs.current[0] = el; }} ikon={MIC.kisi} label="Profil bilgileri"
        onClick={() => modalAc("profil")} />
      <MenuSatir ref={(el) => { satirRefs.current[1] = el; }} ikon={MIC.hareket} label="Animasyonları azalt"
        role="menuitemcheckbox" checked={hareketAzalt} sag={<Anahtar acik={hareketAzalt} />}
        onClick={() => onHareketAzalt?.()} />
      {onPalet && (
        <MenuSatir ref={(el) => { satirRefs.current[2] = el; }} ikon={MIC.palet} label="Komut paleti"
          sag={<kbd style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "0 6px", flexShrink: 0 }}>Ctrl K</kbd>}
          onClick={sec(onPalet)} />
      )}
      <MenuSatir ref={(el) => { satirRefs.current[3] = el; }} ikon={MIC.yardim} label="Yardım ve kısayollar"
        onClick={() => modalAc("yardim")} />
      <MenuSatir ref={(el) => { satirRefs.current[4] = el; }} ikon={MIC.kvkk} label="KVKK ve gizlilik"
        onClick={() => modalAc("kvkk")} />
      {ayrac}
      <MenuSatir ref={(el) => { satirRefs.current[5] = el; }} ikon={MIC.cikis} label="Oturumu kapat" tehlike
        onClick={sec(onLogout)} />
    </div>
  );
}

export default function HesapMenu({ user, onLogout, onPalet, hareketAzalt = false, onHareketAzalt, dar = false }) {
  const [acik, setAcik] = useState(false);
  const [modal, setModal] = useState(null);   // "profil" | "yardim" | "kvkk"
  const kokRef = useRef(null);
  const tetikRef = useRef(null);
  const satirRefs = useRef([]);

  const kapat = useCallback((odakTetige = true) => {
    setAcik(false);
    if (odakTetige) tetikRef.current?.focus();
  }, []);

  // Dış tık kapatır (menü açıkken tek dinleyici; modal scrim'i kendi katmanında yakalar).
  useEffect(() => {
    if (!acik) return undefined;
    const dinle = (e) => { if (!kokRef.current?.contains(e.target)) setAcik(false); };
    document.addEventListener("pointerdown", dinle);
    return () => document.removeEventListener("pointerdown", dinle);
  }, [acik]);

  // Açılınca ilk satıra odak (menü klavye sözleşmesi).
  useEffect(() => { if (acik) satirRefs.current[0]?.focus(); }, [acik]);

  const klavye = (e) => {
    const satirlar = satirRefs.current.filter(Boolean);
    const i = satirlar.indexOf(document.activeElement);
    if (e.key === "Escape") { e.stopPropagation(); kapat(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); satirlar[(i + 1) % satirlar.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); satirlar[(i - 1 + satirlar.length) % satirlar.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); satirlar[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); satirlar[satirlar.length - 1]?.focus(); }
    else if (e.key === "Tab") setAcik(false);   // odak doğal akışına döner
  };

  // Satır ref'leri sabit indeksli (MenuIcerik); koşullu satır (palet) unmount olunca React
  // ref(null) çağırır, klavye gezinmesi filter(Boolean) ile boşluğu atlar.
  const sec = (eylem) => () => { kapat(false); eylem?.(); };

  return (
    <div ref={kokRef} style={{ position: "relative", marginTop: "auto" }} onKeyDown={acik ? klavye : undefined}>
      {/* Tetik — kullanıcı kartı; daraltılmış rayda yalnız avatar (title + aynı aria) */}
      <button type="button" ref={tetikRef} onClick={() => setAcik((v) => !v)}
        aria-haspopup="menu" aria-expanded={acik} aria-label={`Hesap menüsü — ${user?.ad_soyad || "kullanıcı"}`}
        title={dar ? `Hesap menüsü — ${user?.ad_soyad || "kullanıcı"}` : undefined} {...focusRing}
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = acik ? PAL.hov : PAL.surfHi; }}
        style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: dar ? "center" : "flex-start", gap: SP.m, padding: dar ? SP.s : SP.m, borderRadius: RAD.card, background: acik ? PAL.hov : PAL.surfHi, border: `1px solid ${acik ? PAL.lineHi : PAL.line}`, textAlign: "left", transition: "background .12s ease-out, border-color .12s ease-out" }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: RAD.dot, background: V, display: "flex", alignItems: "center", justifyContent: "center", ...TYPE.meta, fontWeight: 500, color: PAL.onAccent }}>{bashHarfler(user?.ad_soyad)}</span>
        {!dar && (
          <>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.ad_soyad || "Kullanıcı"}</span>
              <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.unvan || ROL_TR[user?.rol] || "—"}</span>
            </span>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: PAL.mut2, transition: "transform .15s ease-out", transform: acik ? "rotate(180deg)" : "none" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 15 L12 9 L18 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </>
        )}
      </button>

      {/* Menü — kart üstüne açılır */}
      {acik && (
        <MenuIcerik user={user} satirRefs={satirRefs} hareketAzalt={hareketAzalt}
          onHareketAzalt={onHareketAzalt} onPalet={onPalet} onLogout={onLogout}
          sec={sec} modalAc={(m) => { kapat(false); setModal(m); }} />
      )}

      {modal === "profil" && <ProfilKip user={user} onKapat={() => { setModal(null); tetikRef.current?.focus(); }} />}
      {modal === "yardim" && <YardimKip onKapat={() => { setModal(null); tetikRef.current?.focus(); }} />}
      {modal === "kvkk" && <KvkkKip onKapat={() => { setModal(null); tetikRef.current?.focus(); }} />}
    </div>
  );
}
