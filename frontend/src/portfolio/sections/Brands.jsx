import { BRANDS } from "../data.js";

// Static flush grid (2 rows x 6 cols on desktop). Dark squares separated by a
// 1px gap via the container background showing through.
export default function Brands() {
  return (
    <section className="mx-auto max-w-shell px-6 py-24 md:px-12">
      <h2
        className="font-semibold tracking-tight text-white"
        style={{ fontSize: "36px" }}
      >
        KULLANDIĞIMIZ TEKNOLOJİLER
      </h2>
      <p className="mt-4 text-base text-muted">
        FastAPI ve LangGraph üzerine kurulu; OCR (RapidOCR), mevzuat araması
        (BM25 + BGE-M3) ve PDF üretimi (pypdfium2 · ReportLab) — tamamı açık
        kaynak ve AGPL-free.
      </p>

      {/* gap-px + bg-line yields a 1px separator line between flush cells. */}
      <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-line md:grid-cols-6">
        {BRANDS.map((brand, i) => (
          <div
            key={`${brand}-${i}`}
            className="flex aspect-square items-center justify-center bg-card"
          >
            <span className="text-base font-semibold tracking-wide text-white/80">
              {brand}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
