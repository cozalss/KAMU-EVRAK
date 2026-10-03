/* Dayanak ipliği — taslaktaki bir değerin KAYNAK BELGEDE nereden geldiğini görünür kılar.

   Memur taslakta "Konu", "Tarih", "Gönderen" gibi bir değerin üstüne gelince (ya da şeritteki
   düğmeye odaklanınca) kaynaktaki fosforlu işaret koyulaşır ve iki kâğıt arasına ince bir
   "kırmızı ip" çizilir. Hiçbir şey hareket etmeden önce de bilgi yazıyla mevcuttur (şerit).

   DÜRÜSTLÜK SÖZLEŞMESİ — istemcide eşleşme UYDURULMAZ:
   · Kaynak ucu yalnız backend'in verdiği kanıt aralığıdır (`kanit_metadata.spanlar`, start/end
     ile işaretlenmiş <mark>). Aralığı olmayan değer için ip çizilmez.
   · Taslak ucu, AYNI değerin (`span.deger`) taslak metninde HARFİYEN geçtiği yerdir — benzerlik,
     bulanık eşleme, NLI yok. Değer taslakta harfiyen yoksa düğme hiç basılmaz.
   · Kaynağı olmayan iddiaları ("uydurma" sinyali) işaretlemek cümle-düzeyi grounding verisi
     ister; sonuç bunu taşımıyor, bu yüzden o katman bilerek YOK (bkz. rapor).

   DOM'a dokunmaz (React'in yönettiği metni sarmalamaz): taslak ucu Range.getClientRects ile
   ölçülür, çizim ızgaranın üstünde ayrı bir katmanda yapılır. Ölçüm yalnız ip etkinken. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SR_ONLY, focusRing } from "./neonUi.jsx";
import { arr, clean } from "./sonucOrtak.js";

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const KISA_ASGARI = 4;   // "Var", "1" gibi kısa değerler harfiyen eşlemede yanlış yere düşer

/* Bağlanabilir alanlar: kanıt aralığı olan VE değeri taslakta harfiyen geçen. */
export function dayanakBaglari(r) {
  const taslaklar = [r?.yazi_taslak_md, ...arr(r?.alt_talepler).map((a) => a?.yazi_taslak_md)]
    .filter(Boolean).map((t) => norm(clean(t)));
  const gorulen = new Set();
  return arr(r?.kanit_metadata?.spanlar).flatMap((sp) => {
    const deger = norm(sp?.deger);
    if (deger.length < KISA_ASGARI || gorulen.has(deger)) return [];
    if (!taslaklar.some((t) => t.includes(deger))) return [];
    gorulen.add(deger);
    return [{ deger, etiket: clean(sp.label || sp.alan || "Alan") }];
  });
}

function kaynakIsareti(grid, deger) {
  return Array.from(grid.querySelectorAll(".sc-source-slot mark"))
    .find((m) => norm(m.textContent) === deger) || null;
}

/* Görünen taslak kâğıdındaki ilk harfiyen geçiş (pager'da etkin olmayan slaytlar `inert`). */
function taslakAraligi(grid, deger) {
  const sayfalar = Array.from(grid.querySelectorAll(".sc-main-draft-shell .ke-a4-sayfa"))
    .filter((el) => !el.closest("[inert]"));
  for (const sayfa of sayfalar) {
    const yuruyen = document.createTreeWalker(sayfa, NodeFilter.SHOW_TEXT);
    for (let n = yuruyen.nextNode(); n; n = yuruyen.nextNode()) {
      const i = n.data.indexOf(deger);
      if (i < 0) continue;
      const aralik = document.createRange();
      aralik.setStart(n, i);
      aralik.setEnd(n, i + deger.length);
      return aralik;
    }
  }
  return null;
}

/* Kaydırılan kabın içinde öğeyi görünür kıl — yalnız İÇ kap; sayfa (window) zıplatılmaz. */
function kaptaGoster(el, kapSecici) {
  const kap = el?.closest?.(kapSecici);
  if (!kap || kap.scrollHeight <= kap.clientHeight) return;
  const k = kap.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  if (e.top >= k.top + 8 && e.bottom <= k.bottom - 8) return;
  kap.scrollTop += (e.top - k.top) - kap.clientHeight / 2;
}

/* İP YALNIZ BOŞLUKTAN GEÇER — metnin üstünden asla.
   Uçlar kelimenin kendisinde değil, kâğıdın KENAR BOŞLUĞUNDA (yönetmelik m.8/1'in 1,5 cm'lik
   yazısız alanı) duran birer düzeltmen işaretidir: satır yüksekliğinde kısa dikey çizgi.
   İp bir işaretten kâğıt kenarına, iki kâğıt arasındaki oluktan öbür kâğıdın kenarına geçer.
   · Yan yana: kaynak SAĞ kenar boşluğu → oluk → taslak SOL kenar boşluğu.
   · Üst üste (dar ekran): iki kâğıdın SOL kenarının dışından dikey iner. */
const KENAR_ORAN = 15 / 210;   // kenar boşluğu / sayfa genişliği (A4Belge ile aynı ölçü)

function geometri(grid, deger) {
  const isaret = kaynakIsareti(grid, deger);
  const aralik = taslakAraligi(grid, deger);
  const g = grid.getBoundingClientRect();
  const rel = (b) => ({ x: b.left - g.left, y: b.top - g.top, w: b.width, h: b.height });
  const hedefler = aralik ? Array.from(aralik.getClientRects()).filter((b) => b.width > 0).map(rel) : [];
  const kKagit = isaret?.closest?.('[data-kd="kaynak-kagit"]');
  const tKagit = aralik?.startContainer?.parentElement?.closest?.(".ke-a4-sayfa");
  if (!isaret || !hedefler.length || !kKagit || !tKagit) return { isaret, hedefler, yol: null, imler: [] };
  const s = rel(isaret.getBoundingClientRect());
  const t = hedefler[0];
  const kp = rel(kKagit.getBoundingClientRect());
  const tp = rel(tKagit.getBoundingClientRect());
  const kKenar = kp.w * KENAR_ORAN;
  const tKenar = tp.w * KENAR_ORAN;
  const sy = s.y + s.h / 2;
  const ey = t.y + t.h / 2;
  let yol;
  let imler;
  if (kp.x + kp.w <= tp.x) {                               // yan yana: kaynak solda
    const ax = kp.x + kp.w - kKenar * 0.45;
    const bx = tp.x + tKenar * 0.45;
    const [ox, ix] = [kp.x + kp.w + 2, tp.x - 2];
    const c = Math.max(16, (ix - ox) * 0.55);
    yol = { d: `M ${ax} ${sy} H ${ox} C ${ox + c} ${sy}, ${ix - c} ${ey}, ${ix} ${ey} H ${bx}`, a: [ax, sy], b: [bx, ey] };
    imler = [{ x: ax, y: s.y, h: s.h }, { x: bx, y: t.y, h: t.h }];
  } else {                                                  // üst üste (dar ekran)
    const ax = kp.x + kKenar * 0.45;
    const bx = tp.x + tKenar * 0.45;
    const x0 = Math.min(kp.x, tp.x) - 5;
    const r = 8;
    const yon = ey >= sy ? 1 : -1;
    yol = {
      d: `M ${ax} ${sy} H ${x0 + r} Q ${x0} ${sy}, ${x0} ${sy + r * yon} V ${ey - r * yon} Q ${x0} ${ey}, ${x0 + r} ${ey} H ${bx}`,
      a: [ax, sy], b: [bx, ey],
    };
    imler = [{ x: ax, y: s.y, h: s.h }, { x: bx, y: t.y, h: t.h }];
  }
  return { isaret, hedefler, yol, imler };
}

export function useDayanakIpligi(r, gridRef) {
  const baglar = useMemo(() => dayanakBaglari(r), [r]);
  const [aktif, setAktif] = useState(null);       // { deger, kaynak: "dugme" | "uzerinde" }
  const [geo, setGeo] = useState(null);

  const olc = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || !aktif) { setGeo(null); return; }
    setGeo(geometri(grid, aktif.deger));
  }, [aktif, gridRef]);

  // Etkinleşince: (düğmeden geldiyse) iki ucu kendi kaplarında görünür kıl, ölç, işareti koyulaştır.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !aktif) { setGeo(null); return undefined; }
    const isaret = kaynakIsareti(grid, aktif.deger);
    if (aktif.kaynak === "dugme") {
      kaptaGoster(isaret, '[data-kd="kaynak-masa"]');
      const aralik = taslakAraligi(grid, aktif.deger);
      if (aralik) kaptaGoster(aralik.startContainer.parentElement, ".sc-document-stage");
    }
    isaret?.classList.add("kd-ip-aktif");
    let kare = requestAnimationFrame(olc);
    const yeniden = () => { cancelAnimationFrame(kare); kare = requestAnimationFrame(olc); };
    window.addEventListener("scroll", yeniden, true);
    window.addEventListener("resize", yeniden);
    return () => {
      cancelAnimationFrame(kare);
      isaret?.classList.remove("kd-ip-aktif");
      window.removeEventListener("scroll", yeniden, true);
      window.removeEventListener("resize", yeniden);
    };
  }, [aktif, gridRef, olc]);

  // Taslak üzerinde gezinme: imleç bağlı bir değerin üstündeyse ip kendiliğinden çekilir.
  const kutularRef = useRef(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !baglar.length) return undefined;
    let kare = 0;
    const sifirla = () => { kutularRef.current = null; };
    const kutular = () => {
      if (!kutularRef.current) {
        kutularRef.current = baglar.map((b) => {
          const aralik = taslakAraligi(grid, b.deger);
          return { deger: b.deger, rects: aralik ? Array.from(aralik.getClientRects()) : [] };
        });
      }
      return kutularRef.current;
    };
    const hareket = (e) => {
      if (kare) return;
      const { clientX: x, clientY: y, target } = e;
      kare = requestAnimationFrame(() => {
        kare = 0;
        if (!target?.closest?.(".sc-main-draft-shell .ke-a4-sayfa")) {
          setAktif((a) => (a?.kaynak === "uzerinde" ? null : a));
          return;
        }
        const bulunan = kutular().find((k) => k.rects.some((b) => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2));
        setAktif((a) => {
          if (a?.kaynak === "dugme") return a;
          if (!bulunan) return a ? null : a;
          return a?.deger === bulunan.deger ? a : { deger: bulunan.deger, kaynak: "uzerinde" };
        });
      });
    };
    const ayril = () => setAktif((a) => (a?.kaynak === "uzerinde" ? null : a));
    grid.addEventListener("pointermove", hareket);
    grid.addEventListener("pointerleave", ayril);
    window.addEventListener("scroll", sifirla, true);
    window.addEventListener("resize", sifirla);
    return () => {
      cancelAnimationFrame(kare);
      grid.removeEventListener("pointermove", hareket);
      grid.removeEventListener("pointerleave", ayril);
      window.removeEventListener("scroll", sifirla, true);
      window.removeEventListener("resize", sifirla);
    };
  }, [baglar, gridRef]);

  return { baglar, aktif, setAktif, geo };
}

/* Şerit: klavye/ekran okuyucu yolu ve "bu özellik var" ipucu. Düğme = etkinleştirici. */
export function DayanakSeridi({ ip }) {
  const { baglar, aktif, setAktif } = ip;
  if (!baglar.length) return null;
  const aktifBag = baglar.find((b) => b.deger === aktif?.deger);
  return (
    <div className="kd-ip-serit" role="group" aria-label="Dayanak ipliği — taslaktaki değerin kaynaktaki yeri">
      <span className="kd-ip-serit-etiket">Dayanak ipliği</span>
      {baglar.map((b) => {
        const ac = () => setAktif({ deger: b.deger, kaynak: "dugme" });
        const kapat = () => setAktif((a) => (a?.deger === b.deger && a.kaynak === "dugme" ? null : a));
        return (
          <button key={b.deger} type="button" className="kd-ip-dugme" data-press=""
            aria-pressed={aktif?.deger === b.deger}
            onMouseEnter={ac} onMouseLeave={kapat} onFocus={ac} onBlur={kapat} onClick={ac}
            onKeyDown={(e) => { if (e.key === "Escape") setAktif(null); }}
            {...focusRing}>
            <i aria-hidden="true" />{b.etiket}
          </button>
        );
      })}
      <span className="kd-ip-not">
        <span className="kd-ip-not-imlec">Taslaktaki değerin üstüne gelin: kaynakta alındığı yer işaretlenir.</span>
        <span className="kd-ip-not-dokun">Bir alana dokunun: kaynakta alındığı yer ve taslaktaki karşılığı işaretlenir.</span>
      </span>
      <span style={SR_ONLY} aria-live="polite">
        {aktifBag ? `${aktifBag.etiket}: taslaktaki “${aktifBag.deger}” değeri kaynak belgede işaretli yerden alındı.` : ""}
      </span>
    </div>
  );
}

/* Çizim katmanı — ızgaranın üstünde, tıklanamaz. */
export function DayanakKatmani({ ip }) {
  const azHareket = useReducedMotion();
  const { geo, aktif } = ip;
  if (!aktif || !geo) return null;
  return (
    <svg className="kd-ip-katman" width="100%" height="100%" aria-hidden="true">
      {geo.hedefler.map((b, i) => (
        <rect key={i} x={b.x - 2} y={b.y + b.h * 0.18} width={b.w + 4} height={b.h * 0.74} rx={2}
          style={{ fill: "var(--kd-fosfor-koyu)", mixBlendMode: "multiply" }} />
      ))}
      {geo.yol && (
        <g key={aktif.deger}>
          <motion.path d={geo.yol.d} fill="none" strokeWidth={1.5} strokeLinecap="round"
            style={{ stroke: "var(--kd-ip)" }}
            initial={azHareket ? false : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }} />
          {geo.imler.map((m, i) => (
            <rect key={i} x={m.x - 1.25} y={m.y + 1} width={2.5} height={Math.max(6, m.h - 2)} rx={1.25}
              style={{ fill: "var(--kd-ip)" }} />
          ))}
        </g>
      )}
    </svg>
  );
}
