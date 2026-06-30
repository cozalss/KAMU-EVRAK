// Shared small atoms for the portfolio. Outlined badge + chamfer clip-paths.

// Small outlined pill badge with optional leading icon.
export function Badge({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-muted">
      {icon}
      {children}
    </span>
  );
}

// Chamfered (cut) corners. Size is the cut depth in px.
export function chamferAll(cut = 18) {
  return {
    clipPath: `polygon(${cut}px 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%, 0 ${cut}px)`,
  };
}

// Chamfer only the right side (top-right + bottom-right) — used by FAQ rows.
export function chamferRight(cut = 16) {
  return {
    clipPath: `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)`,
  };
}
