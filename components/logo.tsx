export function LogoMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      <path
        d="M16 7.2c.35 3.4 1.7 6.1 4.7 8.2-3 .7-5.1 2.4-6.4 5.4-1.2-3.1-3.4-4.8-6.5-5.5 3.1-2 4.5-4.7 4.8-8.1.9 2.2 2.2 3.7 3.4 0Z"
        fill="var(--bg, #212121)"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[15.5px] font-semibold tracking-[-0.02em] ${className}`}>
      DeepRomeo
    </span>
  );
}
