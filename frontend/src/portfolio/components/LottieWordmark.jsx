import { useEffect, useRef } from "react";
// lottie_light: SVG renderer without the eval-based expression engine (we use
// none) — smaller bundle, no eval, safe under strict CSP.
import lottie from "lottie-web/build/player/lottie_light";
import animationData from "./kamuEvrakWordmark.json";

// Edge-to-edge animated "KAMU EVRAK" wordmark (footer).
// Lottie JSON authored per the diffusionstudio/lottie skill (native Inter-800
// text + left→right mask wipe + coral accent line drawn via trim-path), rendered
// with lottie-web (the player the repo recommends for web).
//
// - aspect-ratio reserves the exact box the old SVG used → zero layout shift.
// - Plays once on scroll-into-view, then holds the final frame.
// - prefers-reduced-motion → renders the final frame statically (no motion).
export default function LottieWordmark() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const anim = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    });

    // Last frame from the JSON out-point — a plain property that exists before
    // load, so it never races a half-loaded/destroyed instance.
    const lastFrame = animationData.op - 1;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion: hold the resolved wordmark, no animation.
    if (prefersReducedMotion) {
      const showLastFrame = () => anim.goToAndStop(lastFrame, true);
      if (anim.isLoaded) showLastFrame();
      else anim.addEventListener("DOMLoaded", showLastFrame);
      return () => {
        anim.removeEventListener("DOMLoaded", showLastFrame);
        anim.destroy();
      };
    }

    // Otherwise play once the wordmark scrolls into view. Wiring the observer
    // only after DOMLoaded guarantees play() is never called before the
    // animation is ready (e.g. when already in-viewport on first paint).
    let hasPlayed = false;
    let observer;
    const observeWhenReady = () => {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !hasPlayed) {
              hasPlayed = true;
              anim.play();
            }
          }
        },
        { threshold: 0.35 },
      );
      observer.observe(container);
    };
    if (anim.isLoaded) observeWhenReady();
    else anim.addEventListener("DOMLoaded", observeWhenReady);

    return () => {
      anim.removeEventListener("DOMLoaded", observeWhenReady);
      if (observer) observer.disconnect();
      anim.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="lottie-wordmark w-full"
      role="img"
      aria-label="Kamu Evrak"
      style={{ aspectRatio: "1200 / 230" }}
    />
  );
}
