import { Badge } from "../components/ui.jsx";
import { Bolt, ArrowUpRight } from "../components/icons.jsx";

const PORTRAIT = "/portfolio/portre.jpg";

// Çekirdek teknoloji yığını — pill rozetler.
const STACK = ["FastAPI", "LangGraph", "DeepSeek", "React"];

// "Sistem nedir?" — iki sütun. Sol portre (turuncu yay görselin parçası, CSS
// glow eklenmedi). Sağ: açıklama + teknoloji pill satırı + "Detaylar".
export default function About() {
  return (
    <section id="about" className="mx-auto max-w-shell px-6 py-24 md:px-12">
      <Badge icon={<Bolt />}>Proje Hakkında</Badge>
      <h2 className="mt-5 text-5xl font-semibold tracking-tight text-white md:text-6xl">
        Sistem nedir?
      </h2>

      <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2">
        {/* Left — portrait. Natural height (h-auto) so the column doesn't
            collapse to 0 before load — avoids layout shift — and the baked-in
            orange arc is never cropped. */}
        <div className="overflow-hidden rounded-3xl">
          <img
            src={PORTRAIT}
            alt="kamu-evrak sistemi görseli"
            className="block h-auto w-full"
          />
        </div>

        {/* Right — text, socials, CTA. */}
        <div className="flex flex-col">
          <p className="text-lg leading-relaxed text-muted">
            kamu-evrak, gelen resmî evrakı uçtan uca işleyen 20 düğümlü bir
            LangGraph ajan hattıdır. OCR ile okur, 18 evrak türünü sınıflandırır,
            bilgi unsurlarını çıkarıp eksikleri tespit eder, 233 mevzuat / 1506
            madde korpusundan BM25 ile ilgili maddeleri önerir ve özetler.
            Ardından Resmî Yazışma Yönetmeliği'ne uygun taslağı hazırlar, doğru
            birime yönlendirir ve kullanıcıyı bilgilendirir. Kişisel veriler
            buluta gitmeden maskelenir; her karar SHA-256 hash-zinciriyle
            denetlenebilir kaydedilir. Aynı hat mock, bulut (DeepSeek) ve on-prem
            modlarında çalışır — TEKNOFEST 2026 Yapay Zeka Dil Ajanları Yarışması
            1. Senaryo için geliştirilmiştir.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {STACK.map((tech) => (
              <span
                key={tech}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2.5 text-sm font-medium text-white"
              >
                <Bolt size={14} />
                {tech}
              </span>
            ))}
          </div>

          <a
            href="#projects"
            className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-card px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-card2"
          >
            Detaylar
            <ArrowUpRight />
          </a>
        </div>
      </div>
    </section>
  );
}
