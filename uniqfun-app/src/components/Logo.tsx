export function Shield({ className = 'h-12 w-12 md:h-16 md:w-16 xl:h-[72px] xl:w-[72px]', withHalo = false }: { className?: string; withHalo?: boolean }) {
  const img = (
    <img
      src="/logo-shield.png?v=pulse"
      alt="uniq.pulse hooded shield logo"
      className={`relative z-10 rounded-xl object-contain select-none logo-shield-glow ${className}`}
    />
  )
  if (!withHalo) return img
  return (
    <span className="relative inline-flex items-center justify-center shrink-0">
      <span aria-hidden="true" className="logo-halo" />
      {img}
    </span>
  )
}

export function BrandBanner({ className = 'w-full max-w-md rounded-2xl' }: { className?: string }) {
  return (
    <img
      src="/logo-full.png?v=pulse"
      alt="uniq.pulse — Each ticker launches once"
      className={`object-contain select-none border border-line/60 shadow-[var(--shadow-glow)] ${className}`}
    />
  )
}

/** Wordmark: always "uniq.pulse" (lowercase, with the dot). */
export function Wordmark({
  className = 'text-[26px] md:text-[34px] xl:text-[42px]',
}: {
  className?: string
}) {
  return (
    <span
      className={`font-display font-extrabold leading-none tracking-[-0.02em] whitespace-nowrap grad-text logo-wordmark-glow ${className}`}
    >
      uniq.pulse
    </span>
  )
}

export default function Logo() {
  return (
    <span className="inline-flex items-center gap-3 md:gap-3.5 xl:gap-4 whitespace-nowrap shrink-0">
      <Shield withHalo className="h-12 w-12 md:h-16 md:w-16 xl:h-[72px] xl:w-[72px]" />
      <Wordmark />
    </span>
  )
}
