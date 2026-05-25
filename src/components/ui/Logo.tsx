/**
 * Krishnam HRMS brand mark — a warp & weft weave lattice that nods to fabric
 * manufacturing. Uses currentColor so it adapts to whatever container it sits in
 * (e.g. white on the brand-colored badge).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* warp (vertical threads) */}
      <path d="M8.5 3.75V20.25" />
      <path d="M15.5 3.75V20.25" />
      {/* weft (horizontal threads) */}
      <path d="M3.75 8.5H20.25" />
      <path d="M3.75 15.5H20.25" />
    </svg>
  );
}
