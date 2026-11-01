export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="26" height="26" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 7.5v13M21.5 7.5v13" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 7.5 14 20l7-12.5" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="14" cy="20" r="1.7" fill="#e5a33a" />
      <circle cx="7" cy="7.5" r="1.2" fill="currentColor" />
      <circle cx="21" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function BrandLockup({ subtitle = "ENGINEERING WORKSPACE" }: { subtitle?: string }) {
  return (
    <span className="brand">
      <BrandMark />
      <span>
        <span className="brand-word">VECTRIX</span>
        <span className="brand-sub">{subtitle}</span>
      </span>
    </span>
  );
}
