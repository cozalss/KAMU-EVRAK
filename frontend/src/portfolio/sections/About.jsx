import { Badge } from "../components/ui.jsx";
import { Bolt, ArrowUpRight } from "../components/icons.jsx";

const PORTRAIT = "/portfolio/el.webp";

// Çekirdek teknoloji yığını — pill rozetler.
const STACK = ["FastAPI", "LangGraph", "DeepSeek", "React"];

// "KAMU EVRAK nedir?" — iki sütun. Sol görsel: mühürlü evrakı tutan robotik el
// (siyah zemin sayfayla kaynaşır). Sağ: açıklama + teknoloji pill satırı + "Detaylar".
export default function About() {
  return (
    <section id="about" className="mx-auto max-w-shell px-6 py-24 md:px-12">
      <Badge icon={<Bolt />}>Proje Hakkında</Badge>
      <h2 className="mt-5 text-5xl font-semibold tracking-tight text-white md:text-6xl">
        KAMU EVRAK nedir?
      </h2>

      <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2">
        {/* Left — visual. Natural height (h-auto) so the column doesn't
            collapse to 0 before load — avoids layout shift. */}
        <div className="overflow-hidden rounded-3xl">
          <img
            src={PORTRAIT}
            alt="Mühürlü resmî evrakı tutan robotik el — kamu-evrak sistemi görseli"
            className="block h-auto w-full"
          />
        </div>

        {/* Right — text, socials, CTA. */}
        <div className="flex flex-col">
          <p className="text-lg leading-relaxed text-muted">
            kamu-evrak, gelen resmî evrakı uçtan uca işleyen, 20 otomatik işlem
            adımından oluşan bir yapay zekâ sistemidir. OCR ile okur, 19 evrak
            türünü sınıflandırır, bilgi unsurlarını çıkarıp eksikleri tespit eder,
            304 mevzuat / 1916 madde korpusundan akıllı arama ile ilgili maddeleri
            önerir ve özetler. Ardından Resmî Yazışma Yönetmeliği'ne uygun taslağı
            hazırlar, doğru birime yönlendirir ve kullanıcıyı bilgilendirir.
            Kişisel veriler buluta gitmeden maskelenir; her karar değiştirilemez
            şekilde kaydedilir ve sonradan denetlenebilir. Aynı sistem anahtarsız
            (mock), bulut (DeepSeek) ve kurum-içi (on-prem) modlarında çalışır;
            kurumların evrak ve yazışma yükünü saniyelere indirir.
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
