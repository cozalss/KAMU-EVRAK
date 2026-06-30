import Hero from "./sections/Hero.jsx";
import Stats from "./sections/Stats.jsx";
import Projects from "./sections/Projects.jsx";
import About from "./sections/About.jsx";
import Brands from "./sections/Brands.jsx";
import Faq from "./sections/Faq.jsx";
import Footer from "./sections/Footer.jsx";

// Page shell. Hero is fixed in the background; <main> starts at margin-top:100vh
// with a solid #050505 background, so it slides over the hero as the user scrolls.
export default function Portfolio() {
  return (
    <div className="min-h-screen bg-ink">
      <Hero />

      <main className="relative z-10 bg-ink" style={{ marginTop: "100vh" }}>
        <Stats />
        <Projects />
        <About />
        <Brands />
        <Faq />
        <Footer />
      </main>
    </div>
  );
}
