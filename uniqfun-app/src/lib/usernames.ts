/**
 * Username & Smart Anti-Clone rules (pure, tested).
 * - A username is unique, case-insensitive, and lookalikes are blocked ("Gain_Zee", "gainzee", "ga1n_zee").
 * - Good devs CAN launch multiple projects under their username (no 1-launch cap!).
 * - Exact tickers and exact coin names launch once forever.
 * - Blatant clone wrappers (e.g. $BABYBELL, $BELLV2, "Official Harbor Bell", "Harbor Bell 2.0") are blocked,
 *   while distinct crypto meta coins ($PULSEAI, $APEX, $SUPERNOVA, $BELLS, etc.) are never false-flagged.
 */

export const USERNAME_RE = /^[a-z0-9_]{3,16}$/

/** Canonical form used for uniqueness: NFKC, lowercase, homoglyph folding, underscores removed. */
export function canonicalUsername(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1il|!]/g, 'l')
    .replace(/[5$]/g, 's')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/[_\-.\s]/g, '')
}

export interface Registered { name: string; wallet: string }

/** Always-reserved platform usernames (including 'uniq_anon' so no user can claim it). */
export const RESERVED_USERNAMES = ['uniq_pulse', 'uniq_anon'] as const

/** Reserved names are not registered in advance, but nobody can claim them (or a lookalike). */
export function validateUsername(raw: string, registry: Registered[], wallet: string, reserved: string[] = []): string | null {
  const trimmed = raw.trim()
  if (/[^\x00-\x7f]/.test(trimmed)) return 'Use plain letters a–z, numbers and underscores only (no look-alike characters).'
  const name = trimmed.toLowerCase()
  if (!USERNAME_RE.test(name)) return 'Use 3–16 letters, numbers or underscores.'
  const folded = canonicalUsername(name)
  if (folded.length < 3) return 'That username is too short once underscores are removed.'
  const allReserved = [...new Set([...RESERVED_USERNAMES, ...reserved])]
  const res = allReserved.find((r) => canonicalUsername(r) === folded)
  if (res) return `@${res} is reserved for the platform account.`
  const clash = registry.find((r) => canonicalUsername(r.name) === folded)
  if (clash) return clash.name.toLowerCase() === name ? 'That username is taken.' : `Too close to an existing username (@${clash.name}). Pick something more distinct.`
  const w = wallet.toLowerCase()
  const bound = registry.find((r) => r.wallet.toLowerCase() === w)
  if (bound) return `This wallet is already bound to @${bound.name}. One username per wallet.`
  return null
}

/**
 * Exact alphanumeric normalization for coin names/tickers (without aggressive homoglyph folding
 * like I->L or RN->M that would falsely collide distinct English words or tickers).
 */
export function normalizeCoinKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Strips ONLY unambiguous scam-clone wrappers ("baby", "mini", "real", "official", "clone", "copy", "v2", "v3", "2", "ii")
 * while preserving genuine crypto meta narratives ("ai", "inu", "pls", "pulse", "based", "super", "x", plural "s", etc.).
 */
export function canonicalCoinStem(raw: string): string {
  let s = normalizeCoinKey(raw)
  const clonePrefixes = ['baby', 'mini', 'real', 'official', 'clone', 'copy']
  const cloneSuffixes = ['v2', 'v3', 'ii', 'iii', '2', '3', 'clone', 'copy']
  for (const p of clonePrefixes) {
    if (s.startsWith(p) && s.length - p.length >= 4) {
      s = s.slice(p.length)
      break
    }
  }
  for (const suf of cloneSuffixes) {
    if (s.endsWith(suf) && s.length - suf.length >= 4) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  return s
}

export interface ExistingCoinRef {
  ticker: string
  name: string
}

/**
 * Checks whether a proposed (name, ticker) is an exact duplicate OR a direct clone wrapper
 * of any existing coin on uniq.pulse, without over-blocking distinct crypto meta projects.
 */
export function validateAntiReplica(
  rawName: string,
  rawTicker: string,
  existing: ExistingCoinRef[]
): string | null {
  const ticker = rawTicker.trim().toUpperCase()
  const name = rawName.trim()
  const tickerKey = normalizeCoinKey(ticker)
  const tickerStem = canonicalCoinStem(ticker)
  const nameKey = normalizeCoinKey(name)
  const nameStem = canonicalCoinStem(name)

  for (const c of existing) {
    const exTicker = c.ticker.toUpperCase()
    const exTickerKey = normalizeCoinKey(exTicker)
    const exTickerStem = canonicalCoinStem(exTicker)
    const exNameKey = normalizeCoinKey(c.name)
    const exNameStem = canonicalCoinStem(c.name)

    if (ticker && ticker === exTicker) {
      return `$${exTicker} already launched. Each ticker launches once.`
    }
    if (name && nameKey.length >= 2 && nameKey === exNameKey) {
      return `"${c.name}" ($${exTicker}) already launched. Each name launches once.`
    }
    // Only block ticker if it is a direct clone wrapper (e.g. $BABYBELL or $BELLV2 off >=4-char $BELL)
    if (ticker && tickerKey !== exTickerKey && exTickerStem.length >= 4 && tickerStem === exTickerStem) {
      return `Clone blocked: $${ticker} is a direct derivative wrapper of $${exTicker} (${c.name}). Distinct meta tickers are welcome.`
    }
    // Only block name if it is a direct clone wrapper (e.g. "Baby Harbor Bell" or "Harbor Bell V2")
    if (name && nameKey !== exNameKey && exNameStem.length >= 5 && nameStem === exNameStem) {
      return `Clone blocked: "${name}" is a direct derivative wrapper of "${c.name}" ($${exTicker}).`
    }
  }
  return null
}
