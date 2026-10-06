/* kabukNav — kenar çubuğu (ray) ve telefon alt şeridinin ORTAK gezinme parçaları (tur 6, A-kabuk).
   NAV tanımı, ikon eşlemesi, rozet değeri ve dar-ray ipucu tek yerde: masaüstü ray ile telefon
   kulakçıkları aynı kaynaktan çizilir (iki ayrı liste kayardı).

   İkon dili (jüri: kalkan dört anlamda kullanılıyordu): İşlenen = arşiv kutusu, Giden = gönderim,
   Denetim izi = rulo kayıt; kalkan artık hiçbir gezinme öğesinde yok. Tüm ikonlar 18 px ve 18 px
   kutuya oturur → etiket hizası her satırda aynı (Giden 15 px ok yüzünden 3 px kayıyordu). */
import * as RTooltip from "@radix-ui/react-tooltip";
import { Activity, Archive, ScrollText, Send } from "lucide-react";
import { PAL, TYPE, TNUM, RAD, SP, SH, EASE, Icon, focusRing } from "./neonUi.jsx";
import { SayiRozet } from "./kabukAtomlari.jsx";

// Kurgu sırası iş akışını izler: Panel → İşlenen (arşiv, rozet YOK — birikimli arşive "iş bekliyor"
// rozeti yanlış sinyal) → Gelen (kuyruk) → İşleniyor (canlı) → Taslaklar → Giden → Mevzuat.
export const NAV = [
  { id: "panel", label: "Panel", icon: "grid" },
  { id: "islenen", label: "İşlenen evrak", icon: "arsiv" },
  { id: "gelen", label: "Gelen evrak", icon: "inbox", sayac: "gelen" },
  { id: "isleniyor", label: "İşleniyor", icon: "spin", live: true },
  { id: "taslaklar", label: "Taslaklar", icon: "doc", sayac: "taslak" },
  { id: "giden", label: "Giden evrak", icon: "giden", sayac: "giden" },
  { id: "mevzuat", label: "Mevzuat", icon: "book" },
];
/* Denetim izi ana NAV'da DEĞİL (hesap menüsünden açılır); açıkken geçici sırt satırı olarak belirir. */
export const DENETIM_OGE = { id: "denetim", label: "Denetim izi", icon: "denetim" };

const IKON18 = { size: 18, strokeWidth: 1.75, "aria-hidden": "true" };
const YEREL = {
  arsiv: (p) => <Archive {...IKON18} {...p} />,
  giden: (p) => <Send {...IKON18} {...p} />,
  denetim: (p) => <ScrollText {...IKON18} {...p} />,
  /* Boşta nabız çizgisi; yay yalnız koşum GERÇEKTEN sürerken döner (hareket = bilgi). */
  nabiz: ({ donuk: _d, ...p }) => <Activity {...IKON18} {...p} />,
};

/* Öğenin ikonu — "İşleniyor": koşum yoksa ya da etkin satırda sağdaki halka dönüyorsa nabız. */
export function NavIkon({ item, busy, canli }) {
  const Ic = item.icon === "spin" && (!busy || canli) ? YEREL.nabiz : YEREL[item.icon] || Icon[item.icon];
  return (
    <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 18, height: 18, flexShrink: 0 }}>
      {Ic && <Ic {...(item.icon === "spin" ? { donuk: !busy } : {})} />}
    </span>
  );
}

/* Rozet değeri + aciliyet + bayatlık — sayac anahtarına göre. n null → bilinmiyor (kaynak hiç
   yanıt vermedi); bayat → kendi kaynağının son denemesi hata verdi (kabukSicil.kabukSayaclari). */
export function rozetDegeri(item, sayac = {}) {
  const b = sayac.bayat || {};
  if (item.sayac === "gelen") return { n: sayac.gelen, acil: sayac.gecikmis || 0, bayat: false };
  if (item.sayac === "taslak") return { n: sayac.taslak, acil: 0, bayat: !!b.taslak };
  if (item.sayac === "giden") return { n: sayac.giden, acil: 0, bayat: !!b.giden };
  return { n: 0, acil: 0, bayat: false };
}

/* Rozet çizilecek mi: sayı > 0, ya da sayı bilinmiyor VE kaynak hata verdi ("—" çizilir —
   eskiden Taslaklar rozeti 500'de sessizce kayboluyordu). */
export const rozetCizilir = (r) => r?.n > 0 || (r?.n == null && !!r?.bayat);

/* Erişilebilir ad eki — ikon-only öğelerde (dar ray, alt şerit) düğmenin aria-label'ı rozetin
   kendi etiketini ezer; sayı/aciliyet/bilinmezlik buradan söylenir. */
export function rozetAdEki(r) {
  if (r?.n == null && r?.bayat) return " (sayı bilinmiyor)";
  if (!(r?.n > 0)) return "";
  return ` (${r.n} öğe${r.acil ? `, ${r.acil} gecikmiş` : ""}${r.bayat ? ", son bilinen" : ""})`;
}

/* Dosya sırtı — etkin öğe rayın sağ kenarını aşıp sayfa zeminiyle birleşir (iç bükey köşeler).
   Düz span; giriş yalnız nu-sirt clip-path (motion layoutId KULLANILMAZ — MASTER imza öğesi 3). */
export function DosyaSirti({ dar }) {
  return (
    <span aria-hidden="true"
      style={{ position: "absolute", zIndex: 0, left: 0, right: dar ? -9 : -13, top: 0, bottom: 0, background: "var(--ke-sayfa)", borderRadius: `${RAD.card}px 0 0 ${RAD.card}px`, animation: `nu-sirt .22s ${EASE.out} both` }}>
      <span style={{ position: "absolute", right: 0, top: -12, width: 12, height: 12, background: "radial-gradient(circle at 0 0, transparent 11.5px, var(--ke-sayfa) 12px)" }} />
      <span style={{ position: "absolute", right: 0, bottom: -12, width: 12, height: 12, background: "radial-gradient(circle at 0 100%, transparent 11.5px, var(--ke-sayfa) 12px)" }} />
      <span data-sirt-cizgi="" style={{ position: "absolute", left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, background: "var(--ke-sayfa-t)" }} />
    </span>
  );
}

/* Dar ray ipucu — işletim sisteminin gecikmeli title'ı yerine stilli Radix ipucu: antet künyesi
   satırında etiket + sayı (gecikmiş ayrıca). Provider kenar çubuğu kökünde. */
export function RayIpucu({ acik, etiket, ek, children }) {
  if (!acik) return children;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side="right" sideOffset={14} collisionPadding={12}
          style={{ zIndex: 70, display: "flex", alignItems: "center", gap: SP.s, padding: "7px 10px", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.ctl, boxShadow: SH.pop, animation: "nu-kagit-pop .16s var(--ke-ease-out) both", transformOrigin: "var(--radix-tooltip-content-transform-origin)" }}>
          <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap" }}>{etiket}</span>
          {ek && <span style={{ ...TYPE.antet, textTransform: "uppercase", color: PAL.mut2, whiteSpace: "nowrap", ...TNUM }}>{ek}</span>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

const ipucuEk = ({ n, acil, bayat }) => {
  if (n == null && bayat) return "Sunucu yanıtsız · sayı bilinmiyor";
  if (!(n > 0)) return null;
  const s = acil > 0 ? `${n} kayıt · ${acil} gecikmiş` : `${n} kayıt`;
  return bayat ? `${s} · son bilinen` : s;
};

/* NavBtn — ray öğesi. Geri bildirim basış ANINDA (hover zemin + data-press). */
export function NavBtn({ item, active, onClick, busy, sayac, dar }) {
  const canli = item.live && active && busy;
  const rozet = rozetDegeri(item, sayac);
  const rozetVar = rozetCizilir(rozet);
  const base = { position: "relative", display: "flex", alignItems: "center", gap: SP.s, width: "100%", padding: dar ? "10px 0" : "9px 12px", borderRadius: RAD.card, border: "1px solid transparent", background: "transparent", ...TYPE.ui, textAlign: "left", cursor: "pointer", justifyContent: dar ? "center" : rozetVar ? "space-between" : "flex-start", transition: `background .12s ease-out, transform .14s ${EASE.out}` };
  const renk = active ? { color: "var(--ke-sayfa-ink)", fontWeight: 600 } : { color: PAL.mut };
  const ikonRenk = active ? "var(--ke-sayfa-t)" : PAL.mut2;
  return (
    <RayIpucu acik={dar} etiket={item.label} ek={ipucuEk(rozet)}>
      <button type="button" onClick={onClick} aria-current={active ? "page" : undefined}
        aria-label={dar ? `${item.label}${rozetAdEki(rozet)}` : undefined}
        {...focusRing} data-press="" data-dokunma=""
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ ...base, ...renk }}>
        {active && <DosyaSirti dar={dar} />}
        {dar ? (
          <span style={{ position: "relative", zIndex: 1, display: "flex", color: ikonRenk }}>
            <NavIkon item={item} busy={busy} canli={canli} />
            {canli && <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -5, width: 7, height: 7, borderRadius: RAD.dot, background: "var(--ke-t)", animation: "nu-think 1.2s ease-in-out infinite" }} />}
            {!canli && rozetVar && <span style={{ position: "absolute", top: -8, left: 11 }}><SayiRozet n={rozet.n} acil={rozet.acil} bayat={rozet.bayat} kucuk /></span>}
          </span>
        ) : (
          <>
            <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: SP.s + 2 }}>
              <span style={{ color: ikonRenk, display: "flex" }}><NavIkon item={item} busy={busy} canli={canli} /></span>{item.label}
            </span>
            {canli
              ? <span aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, boxSizing: "border-box", borderRadius: RAD.dot, border: "2px solid color-mix(in srgb, var(--ke-sayfa-ink) 16%, transparent)", borderTopColor: "var(--ke-sayfa-t)", animation: "nu-spin .8s linear infinite", marginLeft: "auto", position: "relative", zIndex: 1 }} />
              : <SayiRozet n={rozet.n} acil={rozet.acil} bayat={rozet.bayat} etkin={active} />}
          </>
        )}
      </button>
    </RayIpucu>
  );
}

export const RayIpucuSaglayici = ({ children }) => <RTooltip.Provider delayDuration={250} skipDelayDuration={400}>{children}</RTooltip.Provider>;
