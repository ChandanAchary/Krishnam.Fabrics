/**
 * Krishnam HRMS app logo — a self-contained mark: a soft-indigo rounded tile
 * with a bold "K" monogram (for Krishnam). Size it via className (e.g. h-9 w-9).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="Krishnam HRMS logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="krishnamLogoGradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5268a8" />
          <stop offset="1" stopColor="#394a76" />
        </linearGradient>
      </defs>
      {/* tile */}
      <rect width="40" height="40" rx="11" fill="url(#krishnamLogoGradient)" />
      {/* bold "K" monogram */}
      <g stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M14 11v18" />
        <path d="M26.5 11 14 20" />
        <path d="M14 20 26.5 29" />
      </g>
    </svg>
  );
}
