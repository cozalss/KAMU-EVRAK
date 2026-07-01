import { useState } from "react";
import { Badge, chamferRight } from "../components/ui.jsx";
import { QuestionSquare, ArrowUpRight, Plus } from "../components/icons.jsx";
import { FAQS, APP_URL } from "../data.js";

// Split section: left heading + CTA, right collapsible accordion (6 items).
// Each FAQ box is chamfered on the top-right and bottom-right.
export default function Faq() {
  const [open, setOpen] = useState(-1);

  return (
    <section id="contact" className="mx-auto max-w-shell px-6 py-24 md:px-12">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
        {/* Left */}
        <div>
          <Badge icon={<QuestionSquare />}>SSS</Badge>
          <h2 className="mt-5 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl">
            KAMU EVRAK'ı denemek ister misiniz? Hadi birlikte inceleyelim.
          </h2>
          <a
            href={APP_URL}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-card px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-card2"
          >
            Giriş Yap
            <ArrowUpRight />
          </a>
        </div>

        {/* Right — accordion. */}
        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="bg-card" style={chamferRight(16)}>
                <button
                  id={`faq-btn-${i}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-base font-medium text-white">
                    {item.q}
                  </span>
                  <span
                    className="shrink-0 text-white transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(45deg)" : "none" }}
                  >
                    <Plus />
                  </span>
                </button>
                {isOpen && (
                  <p
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-btn-${i}`}
                    className="px-6 pb-5 text-sm leading-relaxed text-muted"
                  >
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
