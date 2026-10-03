import { Mail, Sparkle, Twitter, ArrowUpRight } from "../components/icons.jsx";
import LottieWordmark from "../components/LottieWordmark.jsx";
import { APP_URL } from "../data.js";

const SOCIAL_BTNS = [
  { label: "E-posta", icon: <Mail size={18} /> },
  { label: "GitHub", icon: <Sparkle size={18} /> },
  { label: "X", icon: <Twitter size={16} /> },
];

const FOOTER_LINKS = [
  { label: "Ana Sayfa", href: "#home" },
  { label: "Yetenekler", href: "#projects" },
  { label: "Hakkında", href: "#about" },
];

// Footer spans full width (not capped at 1440px). Bottom holds an edge-to-edge
// animated Lottie wordmark that scales to the viewport on any screen.
export default function Footer() {
  return (
    <footer className="w-full px-6 pb-6 pt-20 md:px-12">
      {/* Top row */}
      <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex gap-3">
          {SOCIAL_BTNS.map((s) => (
            <a
              key={s.label}
              href="#contact"
              aria-label={s.label}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-white transition-colors hover:bg-card"
            >
              {s.icon}
            </a>
          ))}
        </div>

        <nav className="flex gap-8 text-sm text-white/85" aria-label="Footer">
          {FOOTER_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href={APP_URL}
          className="inline-flex items-center gap-2 rounded-lg bg-tukenmez px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Giriş Yap
          <ArrowUpRight />
        </a>
      </div>

      {/* Edge-to-edge animated wordmark (Lottie). Reserves the same box the old
          SVG used, so it stretches full width with no layout shift. */}
      <div className="mt-16 w-full">
        <LottieWordmark />
      </div>
    </footer>
  );
}
