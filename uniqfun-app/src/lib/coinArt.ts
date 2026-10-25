/**
 * Visual Token Logos & Hero Banners for uniq.pulse coins.
 * Provides bespoke illustrated SVG artwork for the 6 flagship coins (BELL, ACRE, LANT, CLRW, KIND, THRD)
 * plus a deterministic procedural emblem (rounded square on #110B2E using the logo palette)
 * and a clean grid + brand-wash + shield-watermark banner when no custom image is uploaded.
 */

function svgDataUri(svg: string): string {
  const clean = svg.trim()
  if (typeof btoa === 'function') {
    return `data:image/svg+xml;base64,${btoa(clean)}`
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(clean)}`
}

const LOGOS: Record<string, string> = {
  BELL: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1B1242"/>
          <stop offset="100%" stop-color="#110B2E"/>
        </linearGradient>
        <linearGradient id="bell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffd166"/>
          <stop offset="55%" stop-color="#f4a261"/>
          <stop offset="100%" stop-color="#b5651d"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="url(#bg)"/>
      <rect x="22" y="22" width="116" height="116" rx="26" fill="none" stroke="#6738D6" stroke-opacity="0.45" stroke-width="2"/>
      <path d="M80 28c-6 0-10 4-10 9h20c0-5-4-9-10-9z" fill="#ffd166"/>
      <path d="M50 104c4-10 7-24 8-38 1-17 10-28 22-28s21 11 22 28c1 14 4 28 8 38H50z" fill="url(#bell)"/>
      <rect x="44" y="104" width="72" height="9" rx="4.5" fill="#ffd166"/>
      <circle cx="80" cy="120" r="8" fill="#f4a261"/>
      <path d="M26 134q27-10 54 0t54 0" fill="none" stroke="#3ddc97" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    </svg>
  `),
  ACRE: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#150E36"/>
          <stop offset="100%" stop-color="#110B2E"/>
        </linearGradient>
        <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#3ddc97"/>
          <stop offset="100%" stop-color="#147a54"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="url(#bg)"/>
      <polygon points="80,34 134,74 80,114 26,74" fill="url(#land)"/>
      <polygon points="80,114 134,74 134,90 80,130 26,90 26,74" fill="#0f523a"/>
      <line x1="80" y1="34" x2="80" y2="114" stroke="#07051A" stroke-opacity="0.35" stroke-width="2"/>
      <line x1="53" y1="54" x2="107" y2="94" stroke="#07051A" stroke-opacity="0.35" stroke-width="2"/>
      <line x1="107" y1="54" x2="53" y2="94" stroke="#07051A" stroke-opacity="0.35" stroke-width="2"/>
      <circle cx="80" cy="68" r="10" fill="#F6F3FF"/>
      <path d="M80 42v26" stroke="#F6F3FF" stroke-width="4" stroke-linecap="round"/>
      <polygon points="80,42 100,49 80,56" fill="#6738D6"/>
    </svg>
  `),
  LANT: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <radialGradient id="glow" cx="50%" cy="52%" r="50%">
          <stop offset="0%" stop-color="#ffb703" stop-opacity="0.9"/>
          <stop offset="55%" stop-color="#6738D6" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#110B2E" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="#110B2E"/>
      <rect x="16" y="16" width="128" height="128" rx="28" fill="url(#glow)"/>
      <path d="M68 34h24l8 14H60l8-14z" fill="#F6F3FF"/>
      <rect x="58" y="50" width="44" height="58" rx="8" fill="#1B1242" stroke="#F6F3FF" stroke-width="4"/>
      <path d="M80 62c9 10 12 20 0 32-12-12-9-22 0-32z" fill="#ffb703"/>
      <rect x="52" y="110" width="56" height="10" rx="5" fill="#F6F3FF"/>
    </svg>
  `),
  CLRW: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="wbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#150E36"/>
          <stop offset="100%" stop-color="#110B2E"/>
        </linearGradient>
        <linearGradient id="drop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#29E8F4"/>
          <stop offset="50%" stop-color="#2870A3"/>
          <stop offset="100%" stop-color="#6738D6"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="url(#wbg)"/>
      <path d="M80 28C80 28 122 76 122 102a42 42 0 1 1-84 0C38 76 80 28 80 28z" fill="url(#drop)"/>
      <path d="M56 102c8 8 20 12 36 6" fill="none" stroke="#F6F3FF" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
      <circle cx="66" cy="84" r="5" fill="#F6F3FF" opacity="0.85"/>
    </svg>
  `),
  KIND: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="fire" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#FB43BB"/>
          <stop offset="55%" stop-color="#ff9f1c"/>
          <stop offset="100%" stop-color="#ffee99"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="#110B2E"/>
      <path d="M82 26c14 22 34 38 30 66-3 22-22 36-40 32-20-4-30-24-22-44 5-12 16-18 14-32 7 4 14 12 18-22z" fill="url(#fire)"/>
      <path d="M80 68c8 12 16 22 12 36-3 10-12 16-20 12-8-4-10-14-4-24 4-8 8-12 12-24z" fill="#fff3b0"/>
      <rect x="44" y="122" width="72" height="10" rx="5" transform="rotate(-10 80 127)" fill="#6c462f"/>
      <rect x="44" y="122" width="72" height="10" rx="5" transform="rotate(10 80 127)" fill="#8d5b3c"/>
    </svg>
  `),
  THRD: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FB43BB"/>
          <stop offset="50%" stop-color="#A342CC"/>
          <stop offset="100%" stop-color="#29E8F4"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="#110B2E"/>
      <rect x="34" y="48" width="60" height="64" rx="18" fill="none" stroke="url(#gold)" stroke-width="10"/>
      <rect x="66" y="48" width="60" height="64" rx="18" fill="none" stroke="#B68CFF" stroke-width="10" stroke-opacity="0.9"/>
      <rect x="76" y="76" width="8" height="8" rx="2" fill="#29E8F4"/>
    </svg>
  `),
}

function hashCode(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const PALETTES: [string, string, string][] = [
  ['#FB43BB', '#6738D6', '#110B2E'],
  ['#6738D6', '#29E8F4', '#110B2E'],
  ['#A342CC', '#29E8F4', '#110B2E'],
  ['#DA42C7', '#6738D6', '#110B2E'],
  ['#29E8F4', '#A342CC', '#110B2E'],
]

export function getCoinLogo(ticker: string, customLogoUrl?: string): string {
  if (customLogoUrl) return customLogoUrl
  const up = ticker.toUpperCase()
  if (LOGOS[up]) return LOGOS[up]
  const h = hashCode(up)
  const [c1, c2, bg] = PALETTES[h % PALETTES.length]
  const label = up.slice(0, 4)
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="${bg}"/>
      <rect x="22" y="22" width="116" height="116" rx="28" fill="url(#g)" fill-opacity="0.22" stroke="url(#g)" stroke-width="4"/>
      <text x="80" y="92" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#F6F3FF">$${label}</text>
    </svg>
  `)
}

/**
 * Clean banner with no upload:
 * fill #110B2E + faint 22px grid + pink->violet->cyan wash + faint shield watermark on right (opacity .14).
 * Zero random circles/bubbles.
 */
export function getCoinBanner(ticker: string, customBannerUrl?: string): string {
  if (customBannerUrl) return customBannerUrl
  const up = ticker.toUpperCase()
  const h = hashCode(up)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="grid22" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#6738D6" stroke-width="1" stroke-opacity="0.18"/>
        </pattern>
        <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FB43BB" stop-opacity="0.22"/>
          <stop offset="48%" stop-color="#6738D6" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#29E8F4" stop-opacity="0.18"/>
        </linearGradient>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="55%" stop-color="#6738D6"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="320" fill="#110B2E"/>
      <rect width="1200" height="320" fill="url(#grid22)"/>
      <rect width="1200" height="320" fill="url(#wash)"/>
      <g transform="translate(940, 32)" opacity="0.14">
        <path d="M110 8 L204 44 L204 134 C204 196 164 238 110 260 C56 238 16 196 16 134 L16 44 Z" fill="url(#shieldGrad)" stroke="#F6F3FF" stroke-width="4"/>
        <path d="M110 34 L178 60 L178 130 C178 176 148 208 110 226 C72 208 42 176 42 130 L42 60 Z" fill="none" stroke="#29E8F4" stroke-width="3"/>
        <path d="M78 118 L104 144 L146 96" fill="none" stroke="#F6F3FF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>
  `)
}
