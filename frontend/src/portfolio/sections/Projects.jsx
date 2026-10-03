import { PROJECTS } from "../data.js";

// Stacked-card scroll: each card is sticky to the top with a small incremental
// offset, so the next card slides over the previous one. Fixed 800px height.
export default function Projects() {
  return (
    <section id="projects" className="mx-auto max-w-shell px-6 md:px-12">
      {PROJECTS.map((project, i) => (
        <div
          key={project.title}
          className="sticky"
          style={{ top: `${24 + i * 28}px` }}
        >
          <article
            className="relative overflow-hidden rounded-3xl h-[320px] sm:h-[450px] md:h-[600px] lg:h-[700px] xl:h-[800px]"
          >
            {/* Background image spanning the card. */}
            <img
              src={project.image}
              alt={project.title}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "left top" }}
            />
            <div className="absolute inset-0 bg-black/20" />

            {/* Top-left category badges. */}
            <div className="absolute right-6 top-6 flex gap-2">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Bottom-left dark tab with the project title. */}
            <div className="absolute bottom-6 right-6">
              <span className="inline-block rounded-xl bg-black/70 px-5 py-3 text-lg font-semibold text-white backdrop-blur-sm">
                {project.title}
              </span>
            </div>
          </article>
        </div>
      ))}

      {/* Spacer so the last card can settle before the next section. */}
      <div className="h-24" />
    </section>
  );
}
