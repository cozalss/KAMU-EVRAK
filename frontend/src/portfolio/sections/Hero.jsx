import { useEffect, useRef } from "react";
import { NAV_LINKS, APP_URL } from "../data.js";

// Yerel asset (public/portfolio/) — harici CDN/eklenti bağımlılığı yok.
// WebP (dither uygulanmış): degradede banding olmaz; modern tüm tarayıcılar
// destekler. Yüklenemezse onError → açık fallback gradient.
const HERO_IMG = "/portfolio/hero.webp";

// Fixed full-viewport hero. Stays pinned in the background while page content
// (rendered after it, with margin-top: 100vh) slides over the top on scroll.
export default function Hero() {
  const headerRef = useRef(null);

  // Once the content has slid over the hero, the nav links are visually hidden
  // but would still be in the tab order. Mark the header `inert` when covered so
  // keyboard users don't tab into obscured links (WCAG 2.4.3 focus order).
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const update = () => {
      header.inert = window.scrollY > window.innerHeight * 0.9;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      id="home"
      className="fixed inset-0 z-0 h-screen w-full overflow-hidden"
      // Açık tema: görsel gelmezse siyah yerine açık zemin kalır.
      style={{
        background:
          "radial-gradient(120% 80% at 70% 10%, #f4f4f6 0%, #ededef 45%, #e7e7ea 100%)",
      }}
    >
      {/* Arka plan görseli + açık tema scrim (koyu metni okunur kılar).
          onError: görsel yüklenemezse img gizlenir, fallback gradient görünür. */}
      <img
        src={HERO_IMG}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center" }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      {/* Açık dikey scrim: üst (navbar) ve alt (başlık) bölgesini hafifçe
          aydınlatır → koyu metin net okunur; orta net kalır. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(248,248,250,0.55) 0%, rgba(248,248,250,0) 22%, rgba(248,248,250,0) 60%, rgba(245,245,248,0.62) 100%)",
        }}
      />
      {/* Sol-alttaki başlık için ekstra hafif aydınlatma. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(248,248,250,0.55) 0%, rgba(248,248,250,0) 42%)",
        }}
      />

      {/* Navbar — transparent. */}
      <nav
        aria-label="Main navigation"
        className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12"
      >
        {/* Marka kilidi çalışma alanıyla aynı: Havale amblemi + Archivo geniş logotype + mercan nokta. */}
        <a href="#home" className="flex items-center gap-2.5 text-[#10131d]">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-black/15 bg-white">
            <img src="/logo-kamu-evrak.svg" alt="" className="h-6 w-6" />
          </span>
          <span className="font-display text-[15px] font-extrabold" style={{ fontStretch: "112%" }}>
            KAMU·EVRAK
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-acele" aria-hidden="true" />
        </a>

        <ul className="hidden items-center gap-8 text-sm text-neutral-700 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="transition-colors hover:text-neutral-950"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href={APP_URL}
          className="rounded-lg bg-tukenmez px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-tukenmezKoyu"
        >
          Giriş Yap
        </a>
      </nav>

      {/* Hero content — pinned to the bottom. */}
      <div className="absolute inset-x-0 bottom-0 px-6 pb-10 md:px-12 md:pb-14">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-4xl">
          {/* Antet satırı — çalışma alanındaki her görünümün başındaki künyenin aynısı. */}
          <p className="mb-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[.08em] text-neutral-600">
            <span className="whitespace-nowrap">T.C. · KAMU-EVRAK</span>
            <span className="hidden h-px w-16 bg-neutral-400 sm:block" aria-hidden="true" />
            <span className="hidden whitespace-nowrap sm:inline">Akıllı evrak masası</span>
          </p>
          <h1
            className="font-extrabold leading-[1.02] text-[#10131d]"
            style={{ fontSize: "clamp(34px, 4.6vw, 64px)" }}
          >
            KAMU EVRAK VE YAZIŞMA SÜREÇLERİ İÇİN AKILLI AGENT DESTEK SİSTEMİ
            <span
              className="ml-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ backgroundColor: "#d93a2b" }}
              aria-hidden="true"
            />
          </h1>
          {/* Antet çift çizgisi (kalın + ince) — çalışma alanı başlıklarıyla aynı imza. */}
          <div className="mt-6 h-[5px] max-w-xl border-y border-[#10131d]" style={{ borderTopWidth: 2 }} aria-hidden="true" />
          </div>
        </div>
      </div>
    </header>
  );
}
