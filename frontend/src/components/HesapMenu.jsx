/* HesapMenu — sidebar tabanındaki kullanıcı kartı + hesap açılır menüsü (ChatGPT hesap
   menüsü deseninin kamu-evrak uyarlaması). Kart tetiktir; menü YUKARI açılır. Her öğe
   GERÇEK aksiyon: profil/yardım/KVKK modalları, hareket azaltma tercihi (canlı ajan izi
   animasyonları), denetim izine geçiş (Sayıştay/KVKK kanıtı — günlük iş akışının önünde
   durmasın diye ana NAV'da değil burada), oturumu kapat. Renk/tip/radius yalnız neonUi token'ları.
   Açılır menü @radix-ui/react-dropdown-menu (roving-focus/ok tuşları/Home-End/tip-ahead/dış-tık/
   Esc/odak-iadesi kütüphaneden), alt-modallar (Profil/Kurum/Yardım/KVKK) @radix-ui/react-dialog
   (odak tuzağı/scroll kilidi/Esc kütüphaneden) — görünüm birebir eski (yalnız davranış
   sağlamlaştı, elle yazılan klavye/portal mantığı kalktı). */
import React, { useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "motion/react";
import { MONO, T, V, PAL, BANT, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, EASE_BEZIER, SR_ONLY, focusRing, Icon, Btn } from "./neonUi.jsx";

const ROL_TR = { memur: "Memur", yetkili: "Yetkili", yonetici: "Yönetici", sistem: "Sistem" };

function bashHarfler(ad) {
  const p = (ad || "").trim().split(/\s+/).filter(Boolean);
  // tr-TR: "irfan" → "İ" (locale'siz toUpperCase noktasız ASCII "I" üretiyordu — bug avı bulgusu).
  return ((p[0]?.[0] || "") + (p[1]?.[0] || p[0]?.[1] || "")).toLocaleUpperCase("tr-TR") || "?";
}

/* Menü satırı ikonları — neonUi Icon setinde karşılığı olmayanlar, setin çizgi diliyle
   (24 viewBox, 1.6-1.8 stroke, round cap) satır-içi tanımlanır (NeonSidebar deseni). */
const MIC = {
  kisi: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.6" /><path d="M5 20 C5 16.5 8 14.5 12 14.5 C16 14.5 19 16.5 19 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  kurum: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 21V6.5L12 3l7 3.5V21" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9.5 21v-5h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
  tema: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z" fill="currentColor" /></svg>,
  yardim: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M9.6 9.3 C9.6 7.9 10.7 7 12 7 C13.3 7 14.4 7.9 14.4 9.2 C14.4 11 12 11.2 12 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="16.4" r="1" fill="currentColor" /></svg>,
  kvkk: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 L19 6 V11 C19 15.5 16 19.2 12 21 C8 19.2 5 15.5 5 11 V6 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 11.5 L11.2 13.7 L15 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  cikis: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

/* Durum çipi — semantik renk + metin (renk tek sinyal değil). */
const Cip = ({ renk, zemin, children }) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: RAD.chip, background: zemin, ...TYPE.meta, fontWeight: 500, color: renk }}>{children}</span>
);

/* Kip (modal) — Radix Dialog: scrim + dialog, Esc/dış-tık kapatır, açılışta kapat butonu
   odaklanır, gövde kaydırması otomatik kilitlenir (react-remove-scroll, kütüphane içinde).
   Eskiden elle portal+focus-trap+Esc dinleyicisi vardı (sidebar'ın position:sticky'si kendi
   stacking context'ini kurduğundan portal ŞARTTI) — Dialog.Portal aynı işi görür. */
function Kip({ baslik, onKapat, donusRef, children }) {
  const kapatRef = useRef(null);
  return (
    <Dialog.Root open onOpenChange={(v) => { if (!v) onKapat(); }}>
      {/* BelgeModal deseni: Portal forceMount + motion — scrim YALNIZ solar (karartma perdesi
          mekânda hareket etmez), içerik y+scale ile girer ve AnimatePresence (HesapMenu'de,
          koşullu render'ın dışında) sayesinde AYNI yoldan çıkar. */}
      <Dialog.Portal forceMount>
        <Dialog.Overlay asChild forceMount>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
            style={{ position: "fixed", inset: 0, zIndex: 320, background: PAL.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Dialog.Content asChild forceMount aria-label={baslik}
            onOpenAutoFocus={(e) => { e.preventDefault(); kapatRef.current?.focus(); }}
            // Odak-iadesi Radix varsayılanına (kapanmadan önce en son odaklı öğe) bırakılmaz —
            // o öğe DropdownMenu.Item'dı ve menü zaten kapanıp unmount olacak; odak HER ZAMAN
            // hesap menüsü tetikleyicisine (kart) dönsün diye açıkça kontrol ediyoruz.
            onCloseAutoFocus={(e) => { e.preventDefault(); donusRef?.current?.focus(); }}>
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
            style={{ width: "min(440px,100%)", maxHeight: "84vh", overflowY: "auto", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, outline: "none" }}>
            <Dialog.Description style={SR_ONLY}>{baslik} bilgi penceresi.</Dialog.Description>
            <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "14px 16px", borderBottom: `1px solid ${PAL.line}` }}>
              <Dialog.Title asChild>
                <h2 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1 }}>{baslik}</h2>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" ref={kapatRef} aria-label="Kapat" {...focusRing}
                  onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{ cursor: "pointer", width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: "transparent", color: PAL.mut, transition: "background .12s ease-out" }}>
                  <Icon.x />
                </button>
              </Dialog.Close>
            </div>
            <div style={{ padding: 16 }}>{children}</div>
          </motion.div>
          </Dialog.Content>
          </motion.div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
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

function ProfilKip({ user, onKapat, donusRef }) {
  return (
    <Kip baslik="Profil bilgileri" onKapat={onKapat} donusRef={donusRef}>
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

/* Aktif kurum modal'ı — demo senaryosuna göre değiştirilebilir kurum adı (19 Tem revizyonu:
   sabit tek-tenant zorunlu değil). Antet + kurum-içi yönlendirme bu değere göre üretilir. */
function KurumKip({ aktifKurum, onKaydet, onKapat, donusRef }) {
  const [deger, setDeger] = useState(aktifKurum || "");
  const girisRef = useRef(null);
  const kaydet = (e) => {
    e.preventDefault();
    onKaydet(deger);
    onKapat();
  };
  return (
    <Kip baslik="Aktif kurum" onKapat={onKapat} donusRef={donusRef}>
      <p style={{ margin: "0 0 12px", ...TYPE.data, color: PAL.ink2 }}>
        Bu değer resmî yazı antetinde ve kurum-içi yönlendirmede kullanılır. Demo senaryosuna göre değiştirin
        — ör. Odunpazarı örneğiyle çalışırken <strong style={{ fontWeight: 600 }}>Odunpazarı Belediye Başkanlığı</strong>.
      </p>
      <form onSubmit={kaydet}>
        <label style={{ display: "block", ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: 6 }} htmlFor="ke-aktif-kurum-giris">
          Kurum adı
        </label>
        <input id="ke-aktif-kurum-giris" ref={girisRef} type="text" value={deger} maxLength={200} autoFocus
          onChange={(e) => setDeger(e.target.value)} onFocus={(e) => e.currentTarget.select()} {...focusRing}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, ...TYPE.data, color: PAL.ink, marginBottom: SP.m }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: SP.s }}>
          <Btn onClick={onKapat}>Vazgeç</Btn>
          <Btn type="submit" primary disabled={!deger.trim()}>Kaydet</Btn>
        </div>
      </form>
    </Kip>
  );
}

function YardimKip({ onKapat, donusRef }) {
  const Kisayol = ({ k, a }) => (
    <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "6px 0" }}>
      <kbd style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 8px", flexShrink: 0 }}>{k}</kbd>
      <span style={{ ...TYPE.data, color: PAL.ink2 }}>{a}</span>
    </div>
  );
  return (
    <Kip baslik="Yardım ve kısayollar" onKapat={onKapat} donusRef={donusRef}>
      <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: SP.xs }}>Üç adımda evrak işleme</div>
      {[
        ["1", "Gelen evraktan seçin, yeni belge yükleyin ya da örnek evrakla deneyin."],
        ["2", "Canlı ajan izini izleyin: Görev 1 evrakı anlar, Görev 2 resmî yazıyı üretir."],
        ["3", "Taslağı onaylayın, düzenleyin ya da reddedin; karar her zaman memurundur (HITL)."],
      ].map(([n, s]) => (
        <div key={n} style={{ display: "flex", gap: SP.m, padding: "6px 0", alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, flexShrink: 0, borderRadius: RAD.dot, background: ALFA(T), color: DERIN.T, ...TYPE.meta, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", ...TNUM }}>{n}</span>
          <span style={{ ...TYPE.data, color: PAL.ink2 }}>{s}</span>
        </div>
      ))}
      <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, margin: `${SP.l}px 0 ${SP.xs}px` }}>Klavye kısayolları</div>
      <Kisayol k="Esc" a="Açık menü ve pencereleri kapatır" />
      <Kisayol k="Tab" a="Tüm denetimlerde klavye gezinmesi (odak halkasıyla)" />
    </Kip>
  );
}

function KvkkKip({ onKapat, donusRef }) {
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

/* Menü öğesi — DropdownMenu.Item/CheckboxItem'ı MenuSatir'in eski görünümüyle sarar.
   Radix roving-focus ile klavye odağını üstlendiğinden hover VE klavye-odağı AYNI vurguyu
   paylaşır (yerel menülerin yerleşik dili — ayrı bir odak halkası gerekmez). */
function DItem({ ikon, label, sag, tehlike, onSelect, isCheckbox, checked }) {
  const [hover, setHover] = useState(false);
  const renk = tehlike ? DERIN.kirmizi : hover ? PAL.ink : PAL.ink2;
  const stil = { cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: SP.s, padding: "8px 10px", borderRadius: RAD.ctl, outline: "none", background: hover ? PAL.hov : "transparent", ...TYPE.ui, fontWeight: 500, color: renk, transition: "background .12s ease-out, color .12s ease-out" };
  const vurgula = { onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false), onFocus: () => setHover(true), onBlur: () => setHover(false) };
  const inner = (
    <>
      <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: tehlike ? DERIN.kirmizi : hover ? DERIN.T : PAL.mut2, transition: "color .12s ease-out" }}>{ikon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {sag}
    </>
  );
  return isCheckbox ? (
    <DropdownMenu.CheckboxItem checked={checked} onCheckedChange={onSelect} {...vurgula} style={stil}>{inner}</DropdownMenu.CheckboxItem>
  ) : (
    <DropdownMenu.Item onSelect={onSelect} {...vurgula} style={stil}>{inner}</DropdownMenu.Item>
  );
}

/* Anahtar görseli (checkbox sağ ucu) — durum ayrıca aria-checked ile verilir (Radix CheckboxItem). */
const Anahtar = ({ acik }) => (
  <span aria-hidden="true" style={{ width: 28, height: 16, flexShrink: 0, borderRadius: 8, background: acik ? DERIN.T : PAL.press, border: `1px solid ${acik ? DERIN.T : PAL.inputLine}`, position: "relative", transition: "background .15s ease-out" }}>
    <span style={{ position: "absolute", top: 1, left: acik ? 13 : 1, width: 12, height: 12, borderRadius: RAD.dot, background: PAL.onAccent, transition: "left .15s ease-out" }} />
  </span>
);

export default function HesapMenu({ user, onLogout, onDenetimAc, tema, onTemaDegistir, dar = false, aktifKurum, onAktifKurumDegistir }) {
  const [acik, setAcik] = useState(false);
  const [modal, setModal] = useState(null);   // "profil" | "kurum" | "yardim" | "kvkk"
  const tetikRef = useRef(null);   // sub-modal kapanınca odak buraya döner (Kip.onCloseAutoFocus)

  const modalAc = (m) => setModal(m);

  return (
    <div style={{ position: "relative", marginTop: "auto" }}>
      <DropdownMenu.Root open={acik} onOpenChange={setAcik}>
        {/* Tetik — kullanıcı kartı; daraltılmış rayda yalnız avatar (title + aynı aria) */}
        <DropdownMenu.Trigger asChild>
          <button type="button" ref={tetikRef} data-press=""
            aria-label={`Hesap menüsü: ${user?.ad_soyad || "kullanıcı"}`}
            title={dar ? `Hesap menüsü: ${user?.ad_soyad || "kullanıcı"}` : undefined} {...focusRing}
            onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = acik ? PAL.hov : PAL.surfHi; }}
            style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: dar ? "center" : "flex-start", gap: SP.m, padding: dar ? SP.s : SP.m, borderRadius: RAD.card, background: acik ? PAL.hov : PAL.surfHi, border: `1px solid ${acik ? PAL.lineHi : PAL.line}`, textAlign: "left", transition: `background .12s ease-out, border-color .12s ease-out, transform .14s ${EASE.out}` }}>
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
        </DropdownMenu.Trigger>

        {/* Menü — kart üstüne açılır (portal: sidebar'ın position:sticky'si kendi stacking
            context'ini kurduğundan, ana içerik kartlarının ALTINDA boyanma riskini böyle
            kapatıyoruz — NeonSidebar'daki "örnek evrak" dropdown'ıyla aynı gerekçe). */}
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="top" align="start" sideOffset={8} collisionPadding={12}
            style={{ width: 236, background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.s, boxShadow: SH.pop, zIndex: 60, animation: "nu-rise .16s var(--ke-ease-out) both", outline: "none" }}>
            {/* Kimlik başlığı — etkileşimsiz; Radix'in ok-tuşu gezinmesi yalnız Item/CheckboxItem'ları sayar. */}
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
            <DropdownMenu.Separator style={{ height: 1, background: PAL.line, margin: `${SP.xs}px ${SP.s}px` }} />
            <DItem ikon={MIC.kisi} label="Profil bilgileri" onSelect={() => modalAc("profil")} />
            <DItem ikon={MIC.kurum} label="Aktif kurum" onSelect={() => modalAc("kurum")}
              sag={<span style={{ ...TYPE.meta, color: PAL.mut3, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aktifKurum}</span>} />
            <DItem ikon={MIC.tema} label="Koyu görünüm" isCheckbox checked={tema === "dark"}
              sag={<Anahtar acik={tema === "dark"} />} onSelect={() => onTemaDegistir?.()} />
            <DItem ikon={MIC.yardim} label="Yardım ve kısayollar" onSelect={() => modalAc("yardim")} />
            <DItem ikon={<Icon.shield width={15} height={15} />} label="Denetim izi" onSelect={() => onDenetimAc?.()} />
            <DItem ikon={MIC.kvkk} label="KVKK ve gizlilik" onSelect={() => modalAc("kvkk")} />
            <DropdownMenu.Separator style={{ height: 1, background: PAL.line, margin: `${SP.xs}px ${SP.s}px` }} />
            <DItem ikon={MIC.cikis} label="Oturumu kapat" tehlike onSelect={() => onLogout?.()} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* AnimatePresence koşulun DIŞINDA: modal null olunca Kip, çıkış animasyonu bitene
          dek mounted kalır — giriş-çıkış aynı yoldan (spatial consistency). */}
      <AnimatePresence>
        {modal === "profil" && <ProfilKip key="profil" user={user} onKapat={() => setModal(null)} donusRef={tetikRef} />}
        {modal === "kurum" && <KurumKip key="kurum" aktifKurum={aktifKurum} onKaydet={(v) => onAktifKurumDegistir?.(v)}
          onKapat={() => setModal(null)} donusRef={tetikRef} />}
        {modal === "yardim" && <YardimKip key="yardim" onKapat={() => setModal(null)} donusRef={tetikRef} />}
        {modal === "kvkk" && <KvkkKip key="kvkk" onKapat={() => setModal(null)} donusRef={tetikRef} />}
      </AnimatePresence>
    </div>
  );
}
