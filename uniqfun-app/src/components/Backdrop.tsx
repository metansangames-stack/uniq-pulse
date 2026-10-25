import type { CSSProperties } from 'react'

interface SparkleSpec {
  left: string
  top: string
  dur: string
  delay: string
  mobileHidden?: boolean
}

const SPARKLES: SparkleSpec[] = [
  { left: '6%', top: '12%', dur: '4.5s', delay: '0.2s' },
  { left: '14%', top: '28%', dur: '6.2s', delay: '1.1s', mobileHidden: true },
  { left: '22%', top: '9%', dur: '5.4s', delay: '2.3s' },
  { left: '31%', top: '21%', dur: '7.8s', delay: '0.7s', mobileHidden: true },
  { left: '39%', top: '14%', dur: '4.9s', delay: '1.8s' },
  { left: '47%', top: '32%', dur: '8.4s', delay: '3.0s', mobileHidden: true },
  { left: '55%', top: '11%', dur: '5.8s', delay: '0.4s' },
  { left: '63%', top: '24%', dur: '7.1s', delay: '2.7s', mobileHidden: true },
  { left: '72%', top: '16%', dur: '6.5s', delay: '1.5s' },
  { left: '81%', top: '8%', dur: '8.9s', delay: '3.6s', mobileHidden: true },
  { left: '89%', top: '22%', dur: '5.1s', delay: '0.9s' },
  { left: '94%', top: '36%', dur: '7.4s', delay: '2.1s', mobileHidden: true },
  { left: '9%', top: '46%', dur: '6.8s', delay: '1.3s' },
  { left: '18%', top: '58%', dur: '8.1s', delay: '3.9s', mobileHidden: true },
  { left: '27%', top: '42%', dur: '4.3s', delay: '0.6s' },
  { left: '36%', top: '64%', dur: '7.6s', delay: '2.4s', mobileHidden: true },
  { left: '44%', top: '49%', dur: '5.7s', delay: '1.7s' },
  { left: '53%', top: '69%', dur: '8.7s', delay: '4.1s', mobileHidden: true },
  { left: '61%', top: '44%', dur: '6.0s', delay: '0.8s' },
  { left: '69%', top: '56%', dur: '7.3s', delay: '2.9s', mobileHidden: true },
  { left: '77%', top: '48%', dur: '4.7s', delay: '1.2s' },
  { left: '86%', top: '62%', dur: '8.2s', delay: '3.3s', mobileHidden: true },
  { left: '12%', top: '76%', dur: '5.5s', delay: '2.0s' },
  { left: '29%', top: '82%', dur: '6.9s', delay: '0.5s', mobileHidden: true },
  { left: '48%', top: '78%', dur: '4.4s', delay: '2.6s' },
  { left: '66%', top: '85%', dur: '7.9s', delay: '1.4s', mobileHidden: true },
  { left: '83%', top: '74%', dur: '6.3s', delay: '3.1s' },
  { left: '92%', top: '86%', dur: '8.5s', delay: '0.3s', mobileHidden: true },
]

export default function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#07051A]"
    >
      {/* Top-left violet glow (#6738D6, opacity .16, blur 90px) */}
      <div
        className="absolute -top-32 -left-32 h-[460px] w-[460px] rounded-full"
        style={{
          background: '#6738D6',
          opacity: 0.16,
          filter: 'blur(90px)',
        }}
      />

      {/* Bottom-right cyan glow (#29E8F4, opacity .12, blur 90px) */}
      <div
        className="absolute -bottom-32 -right-32 h-[460px] w-[460px] rounded-full"
        style={{
          background: '#29E8F4',
          opacity: 0.12,
          filter: 'blur(90px)',
        }}
      />

      {/* Perspective grid floor on bottom 70% */}
      <div className="backdrop-grid-floor" />

      {/* 28 white sparkle crosses (half hidden on mobile) */}
      {SPARKLES.map((s, idx) => (
        <span
          key={idx}
          className={`sparkle-cross ${s.mobileHidden ? 'hidden sm:block' : 'block'}`}
          style={
            {
              left: s.left,
              top: s.top,
              '--twinkle-dur': s.dur,
              '--twinkle-delay': s.delay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
