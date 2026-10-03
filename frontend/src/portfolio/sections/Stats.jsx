import { Badge, chamferAll } from "../components/ui.jsx";
import { ArrowRight } from "../components/icons.jsx";

// "My best work" — split left/right. Right has two chamfered stat cards.
export default function Stats() {
  return (
    <section className="mx-auto max-w-shell px-6 py-24 md:px-12">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
        {/* Left */}
        <div>
          <Badge>Yapay Zekâ Destekli</Badge>
          <h2 className="mt-5 text-5xl font-semibold tracking-tight text-white md:text-6xl">
            Rakamlarla KAMU EVRAK
          </h2>
          <a
            href="#projects"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-card px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-card2"
          >
            Tüm yetenekler
            <ArrowRight />
          </a>
        </div>

        {/* Right — two chamfered cards side by side. */}
        <div className="grid grid-cols-2 gap-5">
          {[
            { value: "15", label: "Otomatik İşlem Adımı" },
            { value: "%93,5", label: "Doğru Evrak Türü Tespiti" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col justify-between bg-card p-7"
              style={chamferAll(22)}
            >
              <span className="text-5xl font-semibold text-white">{stat.value}</span>
              <span className="mt-10 text-sm text-muted">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
