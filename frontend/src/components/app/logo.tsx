export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M16 6v20M6 16h20" stroke="var(--primary-foreground)" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
      <ellipse cx="16" cy="16" rx="5.2" ry="10" fill="none" stroke="var(--primary-foreground)" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="1.9" fill="var(--primary-foreground)" />
    </svg>
  );
}
