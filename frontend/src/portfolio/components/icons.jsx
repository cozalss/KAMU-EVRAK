// Minimal inline SVG icons — stroke uses currentColor so callers control color.
// No decorative effects; shapes only.

export function ArrowRight({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Diagonal top-right arrow (↗).
export function ArrowUpRight({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Bolt({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

// Square with a question mark.
export function QuestionSquare({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 9.3a2.8 2.8 0 1 1 3.7 2.65c-.6.23-.9.6-.9 1.25v.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function Plus({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Mail({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m3.5 7 8.5 6 8.5-6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function Twitter({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.06L4 22H.74l8.02-9.17L1.5 2h7.07l4.88 6.46L18.244 2Zm-1.21 18h1.8L7.06 3.9H5.13L17.034 20Z" />
    </svg>
  );
}

export function Sparkle({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Behance({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8.2 11.4c.9-.45 1.4-1.15 1.4-2.2 0-2-1.55-2.7-3.35-2.7H1v11h5.45c1.95 0 3.75-.95 3.75-3.15 0-1.4-.65-2.5-2-2.95ZM3.4 8.35h2.3c.85 0 1.5.35 1.5 1.25 0 .85-.6 1.25-1.45 1.25H3.4V8.35Zm2.55 6.95H3.4v-2.6h2.6c.95 0 1.65.4 1.65 1.35 0 .9-.7 1.25-1.7 1.25Zm12.9-5.55c-2.45 0-4.1 1.85-4.1 4.25 0 2.45 1.55 4.2 4.1 4.2 1.9 0 3.2-.85 3.75-2.65h-2.05c-.25.65-.85.95-1.6.95-1.1 0-1.7-.65-1.75-1.7h5.55c.2-2.6-1.15-5.3-3.9-5.3Zm-1.65 3.35c.1-.95.7-1.55 1.65-1.55.95 0 1.5.6 1.55 1.55h-3.2ZM15.05 7.5h4.9v1.2h-4.9V7.5Z" />
    </svg>
  );
}

export function ContraMark({ size = 16, className = "" }) {
  // Simple "C" mark stand-in for Contra.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M17 7.5A6 6 0 1 0 17 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
