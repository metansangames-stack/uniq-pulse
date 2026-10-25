import { TOTAL_SUPPLY, mcapUsd, progress } from './model'
import type { Coin, State } from '../state/store'

export const MAX_DEV_LOCKS_PER_COIN = 10
export const MIN_DEV_LOCK_DAYS = 1
export const MAX_DEV_LOCK_DAYS = 5555
export const MIN_CREDIT_LOCK_SUPPLY_PCT = 1
export const MIN_CREDIT_LOCK_TOKENS = TOTAL_SUPPLY * (MIN_CREDIT_LOCK_SUPPLY_PCT / 100) // 10,000,000 tokens (1% of 1B supply)
export const DAY_MS = 86_400_000
export const HOUR_MS = 3_600_000
export const SNIPER_WINDOW_MS = 10_000 // Demo: first 10 seconds (first 3 blocks)

export interface DevLockWeightSegment {
  fromTs: number
  toTs: number
  weight: number
}

export interface DevLock {
  id: string
  amountTokens: number
  termDays: number
  createdAt: number
  unlockAt: number
  /** HEX-style lock boost weight: 1 + min(termDays, 5555) / 5555 (max 2x). */
  boostWeight: number
  status: 'active' | 'matured' | 'broken'
  accruedPls?: number
  maturedAt?: number
  brokenAt?: number
  returnedTokens?: number
  burnedTokens?: number
  forfeitedPls?: number
  /** Optional time-checkpointed weight segments (for createdAt -> extendAt -> unlockAt). */
  weightHistory?: DevLockWeightSegment[]
}

export interface WalletFundingLink {
  from: string
  to: string
  t?: number
}

/**
 * Computes the HEX-style lock boost weight:
 * weight = 1 + min(days, 5555) / 5555 (1 day ≈ 1.00018x, 5555 days = 2.00x).
 */
export function computeLockBoostWeight(termDays: number): number {
  const clamped = Math.min(Math.max(0, termDays), MAX_DEV_LOCK_DAYS)
  return 1 + clamped / MAX_DEV_LOCK_DAYS
}

/**
 * Returns the active boost weight of `lock` at timestamp `ts`.
 * - Before `lock.createdAt`: not created yet -> returns 1 (no boost).
 * - At or after `lock.unlockAt`: matured -> returns 1 (weight goes back to 1x at maturity).
 * - At or after `lock.brokenAt` (if broken): broken -> returns 1.
 * - While active (`createdAt <= ts < effectiveEndTs`): returns the segment weight active at `ts`.
 */
export function getLockBoostWeightAt(lock: DevLock, ts: number): number {
  if (ts < lock.createdAt) return 1
  const effectiveEnd =
    lock.status === 'broken' && lock.brokenAt !== undefined
      ? Math.min(lock.unlockAt, lock.brokenAt)
      : lock.unlockAt
  if (ts >= effectiveEnd) return 1
  if (lock.weightHistory && lock.weightHistory.length > 0) {
    for (let i = lock.weightHistory.length - 1; i >= 0; i--) {
      const seg = lock.weightHistory[i]
      if (ts >= seg.fromTs && ts < seg.toTs) return seg.weight
    }
    const matching = lock.weightHistory.filter((s) => ts >= s.fromTs)
    if (matching.length > 0) return matching[matching.length - 1].weight
  }
  return lock.boostWeight || computeLockBoostWeight(lock.termDays)
}

export function isLockActiveAt(lock: DevLock, ts: number): boolean {
  if (ts < lock.createdAt) return false
  const effectiveEnd =
    lock.status === 'broken' && lock.brokenAt !== undefined
      ? Math.min(lock.unlockAt, lock.brokenAt)
      : lock.unlockAt
  return ts < effectiveEnd
}

export function getEffectiveLockStatus(lock: DevLock, nowMs = Date.now()): 'active' | 'matured' | 'broken' {
  if (lock.status === 'broken') return 'broken'
  if (lock.status === 'matured' || nowMs >= lock.unlockAt) return 'matured'
  return 'active'
}

export function getActiveDevLocks(coin: Coin, nowMs = Date.now()): DevLock[] {
  return (coin.devLocks ?? []).filter((l) => getEffectiveLockStatus(l, nowMs) === 'active')
}

export function getMaturedDevLocks(coin: Coin, nowMs = Date.now()): DevLock[] {
  return (coin.devLocks ?? []).filter((l) => getEffectiveLockStatus(l, nowMs) === 'matured')
}

export function getBrokenDevLocks(coin: Coin): DevLock[] {
  return (coin.devLocks ?? []).filter((l) => l.status === 'broken')
}

export function getLockedDevTokens(coin: Coin, nowMs = Date.now()): number {
  return getActiveDevLocks(coin, nowMs).reduce((sum, l) => sum + l.amountTokens, 0)
}

export interface DevLockSummary {
  activeLocks: DevLock[]
  maturedLocks: DevLock[]
  brokenLocks: DevLock[]
  lockedTokens: number
  lockedSupplyPct: number
  has30DayLock: boolean
  nextUnlockLock: DevLock | null
  nextUnlockSupplyPct: number
  nextUnlockDays: number
  badgeText: string | null
  devBrokeLock: boolean
}

export function computeDevLockSummary(coin: Coin, nowMs = Date.now()): DevLockSummary {
  const activeLocks = getActiveDevLocks(coin, nowMs)
  const maturedLocks = getMaturedDevLocks(coin, nowMs)
  const brokenLocks = getBrokenDevLocks(coin)
  const lockedTokens = activeLocks.reduce((s, l) => s + l.amountTokens, 0)
  const lockedSupplyPct = (lockedTokens / TOTAL_SUPPLY) * 100
  const hasMin1PctLocked = lockedTokens >= MIN_CREDIT_LOCK_TOKENS - 1e-6
  const has30DayLock = hasMin1PctLocked && activeLocks.some((l) => l.termDays >= 30)

  const sortedByUnlock = [...activeLocks].sort((a, b) => a.unlockAt - b.unlockAt)
  const nextUnlockLock = sortedByUnlock[0] ?? null
  const nextUnlockSupplyPct = nextUnlockLock ? (nextUnlockLock.amountTokens / TOTAL_SUPPLY) * 100 : 0
  const nextUnlockDays = nextUnlockLock
    ? Math.max(0, Math.ceil((nextUnlockLock.unlockAt - nowMs) / DAY_MS))
    : 0

  const badgeText =
    activeLocks.length > 0 && nextUnlockLock
      ? `Dev locked ${lockedSupplyPct.toFixed(1)}% across ${activeLocks.length} lock${
          activeLocks.length === 1 ? '' : 's'
        }, next unlock ${nextUnlockSupplyPct.toFixed(1)}% in ${nextUnlockDays} days`
      : null

  const devBrokeLock = Boolean(coin.devBrokeLock || brokenLocks.length > 0)

  return {
    activeLocks,
    maturedLocks,
    brokenLocks,
    lockedTokens,
    lockedSupplyPct,
    has30DayLock,
    nextUnlockLock,
    nextUnlockSupplyPct,
    nextUnlockDays,
    badgeText,
    devBrokeLock,
  }
}

export interface CoinTransparencyMetrics {
  devHeldTokens: number
  devHeldPct: number
  devPeakTokens: number
  devSoldTokens: number
  devSoldPct: number
  devSoldBeforeMigrationPct: number
  devInitialBuyTokens: number
  devInitialBuyPct: number
  isLargeDevAllocation: boolean
  top10HoldersPct: number
  sniperWallets: string[]
  sniperTokens: number
  sniperHoldPct: number
  bundleWallets: string[]
  bundleTokens: number
  bundleHoldPct: number
  lockSummary: DevLockSummary
  isRugged: boolean
  coinDiedWithin1hOfDevSell: boolean
}

function normalizeIdentity(id: string, registry?: Array<{ name: string; wallet: string }>): Set<string> {
  const clean = id.trim().toLowerCase().replace(/^@/, '')
  const set = new Set<string>([clean])
  if (registry) {
    for (const r of registry) {
      if (r.name.toLowerCase() === clean || r.wallet.toLowerCase() === clean) {
        set.add(r.name.toLowerCase())
        set.add(r.wallet.toLowerCase())
      }
    }
  }
  return set
}

/**
 * Computes all transparency badges & metrics for a coin strictly from the store's real trade history & holders.
 */
export function computeCoinTransparencyMetrics(
  coin: Coin,
  state?: Partial<State>,
  nowMs = Date.now()
): CoinTransparencyMetrics {
  const launcherKey = coin.launcher.toLowerCase()
  const chrono = [...coin.trades].reverse()

  // 1. Dev % held (live): dev balance / total supply
  const devHolderEntry = Object.entries(coin.holders).find(([u]) => u.toLowerCase() === launcherKey)
  const devHeldTokens = Math.max(0, devHolderEntry ? devHolderEntry[1] : 0)
  const devHeldPct = (devHeldTokens / TOTAL_SUPPLY) * 100

  // 2. Replay dev trades for initial buy, peak holdings, dev sold %, and 1-hour rug / death checks
  let runningDevBal = 0
  let devPeakTokens = 0
  let devSoldTokens = 0
  let devSoldTokensBeforeMigration = 0
  let devSoldTokensWithin1h = 0
  let devPeakWithin1h = 0
  let devInitialBuyTokens = 0
  let seenFirstDevBuy = false
  const devSellTimestamps: number[] = []

  for (const tr of chrono) {
    const isDev = tr.user.toLowerCase() === launcherKey
    const isWithin1h = tr.t - coin.createdAt <= HOUR_MS
    const isBeforeMigration = !coin.curve.graduated || (coin.graduatedAt ? tr.t < coin.graduatedAt : true)

    if (isDev) {
      if (tr.side === 'buy') {
        if (!seenFirstDevBuy && tr.t - coin.createdAt <= SNIPER_WINDOW_MS) {
          devInitialBuyTokens = tr.tokens
          seenFirstDevBuy = true
        }
        runningDevBal += tr.tokens
        if (runningDevBal > devPeakTokens) devPeakTokens = runningDevBal
        if (isWithin1h && runningDevBal > devPeakWithin1h) devPeakWithin1h = runningDevBal
      } else {
        runningDevBal = Math.max(0, runningDevBal - tr.tokens)
        devSoldTokens += tr.tokens
        devSellTimestamps.push(tr.t)
        if (isBeforeMigration) devSoldTokensBeforeMigration += tr.tokens
        if (isWithin1h) devSoldTokensWithin1h += tr.tokens
      }
    }
  }

  // If the dev has tokens in holders (plus any sold/burned tokens) exceeding trade replay, include them in peak
  const burnedFromLocks = (coin.devLocks ?? []).reduce((s, l) => s + (l.burnedTokens ?? 0), 0)
  if (devHeldTokens + devSoldTokens + burnedFromLocks > devPeakTokens) {
    devPeakTokens = devHeldTokens + devSoldTokens + burnedFromLocks
  }
  if (!seenFirstDevBuy && devPeakTokens > 0 && chrono.length === 0) {
    devInitialBuyTokens = devPeakTokens
  }

  const devSoldPct = devPeakTokens > 0 ? Math.min(100, (devSoldTokens / devPeakTokens) * 100) : 0
  const devSoldBeforeMigrationPct =
    devPeakTokens > 0 ? Math.min(100, (devSoldTokensBeforeMigration / devPeakTokens) * 100) : 0
  const devInitialBuyPct = (devInitialBuyTokens / TOTAL_SUPPLY) * 100
  const isLargeDevAllocation = devInitialBuyPct > 5

  // 3. Top 10 holders % (excluding curve and LP vault)
  const excludedKeys = new Set(['curve', 'lp', 'lp_vault', 'pulsex_lp', 'burn', 'dead'])
  const holderBalances = Object.entries(coin.holders)
    .filter(([u, bal]) => bal > 1e-6 && !excludedKeys.has(u.toLowerCase()))
    .map(([, bal]) => bal)
    .sort((a, b) => b - a)
  const top10Sum = holderBalances.slice(0, 10).reduce((s, v) => s + v, 0)
  const top10HoldersPct = Math.min(100, (top10Sum / TOTAL_SUPPLY) * 100)

  // 4. Snipers hold X%: wallets that bought in the first 3 blocks (demo: first 10 seconds), excluding the launcher's block-0 dev buy
  const sniperSet = new Set<string>()
  for (const tr of chrono) {
    if (
      tr.side === 'buy' &&
      tr.user.toLowerCase() !== launcherKey &&
      tr.t - coin.createdAt >= 0 &&
      tr.t - coin.createdAt <= SNIPER_WINDOW_MS
    ) {
      sniperSet.add(tr.user.toLowerCase())
    }
  }
  const sniperWallets = Array.from(sniperSet)
  const sniperTokens = Object.entries(coin.holders)
    .filter(([u, bal]) => bal > 1e-6 && sniperSet.has(u.toLowerCase()))
    .reduce((s, [, bal]) => s + bal, 0)
  const sniperHoldPct = (sniperTokens / TOTAL_SUPPLY) * 100

  // 5. Bundles hold X%: 3+ wallets buying in the same block (demo: same second) at launch, OR funded from the same wallet
  const bundleSet = new Set<string>((coin.bundledUsers ?? []).map((u) => u.toLowerCase()))
  const bySecondBucket = new Map<number, Set<string>>()
  const allBuyers = new Set<string>()

  for (const tr of chrono) {
    if (tr.side === 'buy') {
      const uLower = tr.user.toLowerCase()
      allBuyers.add(uLower)
      // Launch window same-second block check (within 60s of launch, excluding the launcher's own initial buy)
      if (tr.t - coin.createdAt <= 60_000 && uLower !== launcherKey) {
        const sec = Math.floor(tr.t / 1000)
        const bucket = bySecondBucket.get(sec) ?? new Set<string>()
        bucket.add(uLower)
        bySecondBucket.set(sec, bucket)
      }
    }
  }
  for (const [, usersInSec] of bySecondBucket.entries()) {
    if (usersInSec.size >= 3) {
      for (const u of usersInSec) bundleSet.add(u)
    }
  }

  // Check funding links: wallets funded from the same wallet (or funding each other) that bought this coin
  const fundingLinks = state?.walletFundingLinks ?? []
  if (fundingLinks.length > 0) {
    const registry = state?.registry ?? []
    const funderToBuyers = new Map<string, Set<string>>()

    for (const buyer of allBuyers) {
      const buyerIds = normalizeIdentity(buyer, registry)
      for (const link of fundingLinks) {
        const fromClean = link.from.toLowerCase().replace(/^@/, '')
        const toClean = link.to.toLowerCase().replace(/^@/, '')
        if (buyerIds.has(toClean)) {
          const set = funderToBuyers.get(fromClean) ?? new Set<string>()
          set.add(buyer)
          funderToBuyers.set(fromClean, set)
          // Also if the funder itself is a buyer on this coin, both are bundled
          for (const otherBuyer of allBuyers) {
            if (normalizeIdentity(otherBuyer, registry).has(fromClean) && otherBuyer !== buyer) {
              set.add(otherBuyer)
            }
          }
        }
      }
    }
    for (const [, fundedBuyers] of funderToBuyers.entries()) {
      if (fundedBuyers.size >= 2) {
        for (const b of fundedBuyers) bundleSet.add(b)
      }
    }
  }

  const bundleWallets = Array.from(bundleSet)
  const bundleTokens = Object.entries(coin.holders)
    .filter(([u, bal]) => bal > 1e-6 && bundleSet.has(u.toLowerCase()))
    .reduce((s, [, bal]) => s + bal, 0)
  const bundleHoldPct = (bundleTokens / TOTAL_SUPPLY) * 100

  // 6. Rug & price death detection:
  // A rug = dev sold >80% within 1 hour of launch AND price fell >80%
  const tradePrices = chrono.filter((t) => t.tokens > 0 && t.pls > 0).map((t) => t.pls / t.tokens)
  const candlePrices = (coin.candles ?? []).flatMap((c) => [c.o, c.c]).filter((v) => v > 0)
  const currentMcap = mcapUsd(coin.curve, state?.plsUsd || 0.000008)
  const peakCandle = candlePrices.length > 0 ? Math.max(...candlePrices, currentMcap) : currentMcap
  const minCandleAfterPeak = candlePrices.length > 0 ? Math.min(currentMcap, candlePrices[candlePrices.length - 1]) : currentMcap
  const candleDropPct = peakCandle > 0 ? ((peakCandle - minCandleAfterPeak) / peakCandle) * 100 : 0

  const peakTradePrice = tradePrices.length > 0 ? Math.max(...tradePrices) : 0
  const lastTradePrice = tradePrices.length > 0 ? tradePrices[tradePrices.length - 1] : 0
  const tradePriceDropPct =
    peakTradePrice > 0 ? ((peakTradePrice - lastTradePrice) / peakTradePrice) * 100 : 0

  const maxPriceDropPct = Math.max(candleDropPct, tradePriceDropPct)
  const effectivePeak1h = Math.max(devPeakWithin1h, devPeakTokens)
  const devSoldPctWithin1h =
    effectivePeak1h > 0 ? (devSoldTokensWithin1h / effectivePeak1h) * 100 : 0

  const isRugged = devSoldPctWithin1h > 80 && maxPriceDropPct > 80

  // Check if coin died (price fell >80%) within 1 hour of any dev sell
  let coinDiedWithin1hOfDevSell = isRugged
  if (!coinDiedWithin1hOfDevSell && devSellTimestamps.length > 0 && maxPriceDropPct > 80) {
    const firstDevSell = devSellTimestamps[0]
    const lastTradeT = chrono.length > 0 ? chrono[chrono.length - 1].t : firstDevSell
    if (lastTradeT - firstDevSell <= HOUR_MS) {
      coinDiedWithin1hOfDevSell = true
    }
  }

  const lockSummary = computeDevLockSummary(coin, nowMs)

  return {
    devHeldTokens,
    devHeldPct,
    devPeakTokens,
    devSoldTokens,
    devSoldPct,
    devSoldBeforeMigrationPct,
    devInitialBuyTokens,
    devInitialBuyPct,
    isLargeDevAllocation,
    top10HoldersPct,
    sniperWallets,
    sniperTokens,
    sniperHoldPct,
    bundleWallets,
    bundleTokens,
    bundleHoldPct,
    lockSummary,
    isRugged,
    coinDiedWithin1hOfDevSell,
  }
}

/**
 * Finds all rugged devs/wallets and any wallet funded by or funding a rugger's wallet.
 */
export function computeLinkedRugFlags(
  coins: Coin[],
  state?: Partial<State>,
  nowMs = Date.now()
): {
  ruggedTickers: Set<string>
  ruggerUsers: Set<string>
  linkedFlaggedIds: Set<string>
} {
  const ruggedTickers = new Set<string>()
  const ruggerUsers = new Set<string>()
  const linkedFlaggedIds = new Set<string>()
  const registry = state?.registry ?? []

  for (const c of coins) {
    const m = computeCoinTransparencyMetrics(c, state, nowMs)
    if (m.isRugged) {
      ruggedTickers.add(c.ticker.toUpperCase())
      const launcherClean = c.launcher.toLowerCase()
      ruggerUsers.add(launcherClean)
      for (const id of normalizeIdentity(launcherClean, registry)) {
        linkedFlaggedIds.add(id)
      }
    }
  }

  // Propagate across funding links (funded by or funding a rugger's wallet)
  const links = state?.walletFundingLinks ?? []
  let changed = true
  while (changed) {
    changed = false
    for (const link of links) {
      const fromIds = normalizeIdentity(link.from, registry)
      const toIds = normalizeIdentity(link.to, registry)
      const fromFlagged = Array.from(fromIds).some((id) => linkedFlaggedIds.has(id))
      const toFlagged = Array.from(toIds).some((id) => linkedFlaggedIds.has(id))
      if (fromFlagged && !toFlagged) {
        for (const id of toIds) linkedFlaggedIds.add(id)
        changed = true
      } else if (toFlagged && !fromFlagged) {
        for (const id of fromIds) linkedFlaggedIds.add(id)
        changed = true
      }
    }
  }

  return { ruggedTickers, ruggerUsers, linkedFlaggedIds }
}

export function isWalletOrUserLinkedToFlagged(
  userOrWallet: string,
  coins: Coin[],
  state?: Partial<State>,
  nowMs = Date.now()
): boolean {
  if (!userOrWallet) return false
  const { linkedFlaggedIds } = computeLinkedRugFlags(coins, state, nowMs)
  const candidateIds = normalizeIdentity(userOrWallet, state?.registry)
  return Array.from(candidateIds).some((id) => linkedFlaggedIds.has(id))
}

export interface DevScoreSummary {
  username: string
  isNewDev: boolean
  score: number
  label: string
  walletAgeDays: number
  launchedCount: number
  migratedCount: number
  earlySellCount: number
  diedAfterDevSellCount: number
  locksKeptCount: number
  brokenLocksCount: number
  lockBonusPoints: number
  rugsCount: number
  isLinkedToFlagged: boolean
  hoverBreakdown: string
}

/**
 * Computes a developer's 0-100 Dev Score, Wallet Age in days, and hover breakdown string.
 * Devs with 0 launches return isNewDev = true and label = "New dev".
 */
export function computeDevScore(
  username: string,
  coins: Coin[],
  state?: Partial<State>,
  nowMs = Date.now()
): DevScoreSummary {
  const clean = username.trim().toLowerCase().replace(/^@/, '')
  const launchedCoins = coins.filter((c) => c.launcher.toLowerCase() === clean)

  // Compute wallet age in days from earliest trade, launch, or walletCreatedAt
  let earliestTs = state?.walletCreatedAt?.[clean] ?? nowMs
  for (const c of coins) {
    if (c.launcher.toLowerCase() === clean && c.createdAt < earliestTs) {
      earliestTs = c.createdAt
    }
    for (const tr of c.trades) {
      if (tr.user.toLowerCase() === clean && tr.t < earliestTs) {
        earliestTs = tr.t
      }
    }
  }
  const walletAgeDays = Math.max(1, Math.floor(Math.max(DAY_MS, nowMs - earliestTs) / DAY_MS))
  const isLinkedToFlagged = isWalletOrUserLinkedToFlagged(clean, coins, state, nowMs)

  if (launchedCoins.length === 0) {
    return {
      username: clean,
      isNewDev: true,
      score: 50,
      label: 'New dev',
      walletAgeDays,
      launchedCount: 0,
      migratedCount: 0,
      earlySellCount: 0,
      diedAfterDevSellCount: 0,
      locksKeptCount: 0,
      brokenLocksCount: 0,
      lockBonusPoints: 0,
      rugsCount: 0,
      isLinkedToFlagged,
      hoverBreakdown: '0 launches · New dev',
    }
  }

  let migratedCount = 0
  let earlySellCount = 0
  let diedAfterDevSellCount = 0
  let locksKeptCount = 0
  let brokenLocksCount = 0
  let rawLockBonus = 0
  let rugsCount = 0
  let totalHoldDurationMs = 0

  for (const c of launchedCoins) {
    if (c.curve.graduated) migratedCount += 1
    const m = computeCoinTransparencyMetrics(c, state, nowMs)
    if (m.devSoldBeforeMigrationPct > 50) earlySellCount += 1
    if (m.coinDiedWithin1hOfDevSell) diedAfterDevSellCount += 1
    if (m.isRugged) rugsCount += 1

    if (m.devHeldTokens > 0) {
      totalHoldDurationMs += Math.max(0, nowMs - c.createdAt)
    }

    const locks = c.devLocks ?? []
    for (const l of locks) {
      const effStatus = getEffectiveLockStatus(l, nowMs)
      if (effStatus === 'broken') {
        brokenLocksCount += 1
      } else if (l.amountTokens >= MIN_CREDIT_LOCK_TOKENS - 1e-6) {
        // Per lock (>= 1% of total supply required for score bonus): 7+ days +5, 90+ +10, 365+ +15, 1555+ +20
        if (l.termDays >= 1555) rawLockBonus += 20
        else if (l.termDays >= 365) rawLockBonus += 15
        else if (l.termDays >= 90) rawLockBonus += 10
        else if (l.termDays >= 7) rawLockBonus += 5

        if (effStatus === 'matured') {
          locksKeptCount += 1
          rawLockBonus += 5
        }
      }
    }
    if (c.devBrokeLock && brokenLocksCount === 0) {
      brokenLocksCount += 1
    }
  }

  // Cap total lock bonus at +25
  const lockBonusPoints = Math.min(25, rawLockBonus)
  const avgHoldMs = totalHoldDurationMs / launchedCoins.length
  const holdBonus = avgHoldMs >= DAY_MS ? 10 : avgHoldMs >= 600_000 ? 5 : 0
  const migratedBonus = Math.min(30, migratedCount * 15)
  const noRugBonus = rugsCount === 0 && !isLinkedToFlagged ? 10 : 0

  const rawScore =
    50 +
    migratedBonus +
    holdBonus +
    lockBonusPoints +
    noRugBonus -
    earlySellCount * 20 -
    diedAfterDevSellCount * 20 -
    brokenLocksCount * 25 -
    rugsCount * 40 -
    (isLinkedToFlagged ? 25 : 0)

  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  const parts = [
    `${launchedCoins.length} launch${launchedCoins.length === 1 ? '' : 'es'}`,
    `${migratedCount} migrated`,
    `sold early on ${earlySellCount}`,
  ]
  if (locksKeptCount > 0) parts.push(`${locksKeptCount} lock${locksKeptCount === 1 ? '' : 's'} kept`)
  if (brokenLocksCount > 0) parts.push(`${brokenLocksCount} broken lock${brokenLocksCount === 1 ? '' : 's'}`)
  if (rugsCount > 0) parts.push(`${rugsCount} rug flag${rugsCount === 1 ? '' : 's'}`)

  return {
    username: clean,
    isNewDev: false,
    score,
    label: `Dev score: ${score}/100`,
    walletAgeDays,
    launchedCount: launchedCoins.length,
    migratedCount,
    earlySellCount,
    diedAfterDevSellCount,
    locksKeptCount,
    brokenLocksCount,
    lockBonusPoints,
    rugsCount,
    isLinkedToFlagged,
    hoverBreakdown: parts.join(' · '),
  }
}

export interface CoinsFilterState {
  query: string
  hideNewDevs: boolean
  hideSnipers: boolean
  maxSniperPct: number
  hideBundles: boolean
  maxBundlePct: number
  hideDevSoldOver50: boolean
  onlyDevLocked: boolean
  onlyMigrated: boolean
  hideLinkedFlagDevs: boolean
  sortBy: 'newest' | 'mcap' | 'volume' | 'progress' | 'dev_score'
}

export const COINS_FILTER_STORAGE_KEY = 'uniqpulse-coins-filters-v1'

export const DEFAULT_COINS_FILTERS: CoinsFilterState = {
  query: '',
  hideNewDevs: false,
  hideSnipers: false,
  maxSniperPct: 15,
  hideBundles: false,
  maxBundlePct: 15,
  hideDevSoldOver50: false,
  onlyDevLocked: false,
  onlyMigrated: false,
  hideLinkedFlagDevs: false,
  sortBy: 'mcap',
}

let memoryCoinsFilters: CoinsFilterState = { ...DEFAULT_COINS_FILTERS }

export function loadCoinsFilters(): CoinsFilterState {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const raw = localStorage.getItem(COINS_FILTER_STORAGE_KEY)
      if (raw) return { ...DEFAULT_COINS_FILTERS, ...JSON.parse(raw) }
    }
    return { ...memoryCoinsFilters }
  } catch {
    return { ...memoryCoinsFilters }
  }
}

export function saveCoinsFilters(filters: CoinsFilterState): void {
  memoryCoinsFilters = { ...DEFAULT_COINS_FILTERS, ...filters }
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(COINS_FILTER_STORAGE_KEY, JSON.stringify(memoryCoinsFilters))
    }
  } catch {
    // ignore
  }
}

/**
 * Pure filter & sort engine for /coins.
 * - "Only dev-locked" requires at least 1 active lock of 30+ days.
 * - Locked coins get a sort boost on /coins.
 */
export function filterAndSortCoins(
  coins: Coin[],
  filters: Partial<CoinsFilterState>,
  state?: Partial<State>,
  nowMs = Date.now()
): Coin[] {
  const f: CoinsFilterState = { ...DEFAULT_COINS_FILTERS, ...filters }
  const q = f.query.trim().toLowerCase()
  const usdRate = state?.plsUsd || 0.000008

  const annotated = coins.map((c) => {
    const metrics = computeCoinTransparencyMetrics(c, state, nowMs)
    const devScore = computeDevScore(c.launcher, coins, state, nowMs)
    // A coin's launcher is considered a "new dev" for filtering if they have 0 prior launches and 0 migrations and no 30d+ dev lock
    const isFirstUnprovenLaunch =
      devScore.isNewDev || (devScore.launchedCount <= 1 && devScore.migratedCount === 0 && !metrics.lockSummary.has30DayLock)
    const volPls = c.trades.reduce((s, t) => s + t.pls, 0)
    const mcap = mcapUsd(c.curve, usdRate)
    const prog = progress(c.curve)
    const lockBoostMultiplier =
      metrics.lockSummary.lockedTokens >= MIN_CREDIT_LOCK_TOKENS - 1e-6 ? 1.15 : 1.0
    return {
      coin: c,
      metrics,
      devScore,
      isFirstUnprovenLaunch,
      volPls,
      mcap,
      prog,
      lockBoostMultiplier,
    }
  })

  const filtered = annotated.filter((item) => {
    const { coin, metrics, devScore, isFirstUnprovenLaunch } = item
    if (q) {
      const hay = `${coin.ticker} ${coin.name} ${coin.launcher}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.hideNewDevs && isFirstUnprovenLaunch) return false
    if (f.hideSnipers && metrics.sniperHoldPct > f.maxSniperPct) return false
    if (f.hideBundles && metrics.bundleHoldPct > f.maxBundlePct) return false
    if (f.hideDevSoldOver50 && metrics.devSoldPct > 50) return false
    if (f.onlyDevLocked && !metrics.lockSummary.has30DayLock) return false
    if (f.onlyMigrated && !coin.curve.graduated) return false
    if (f.hideLinkedFlagDevs && (devScore.isLinkedToFlagged || metrics.isRugged)) return false
    return true
  })

  filtered.sort((a, b) => {
    if (f.sortBy === 'newest') {
      return b.coin.createdAt - a.coin.createdAt
    }
    if (f.sortBy === 'volume') {
      return b.volPls * b.lockBoostMultiplier - a.volPls * a.lockBoostMultiplier
    }
    if (f.sortBy === 'progress') {
      if (b.prog !== a.prog) return b.prog - a.prog
      return b.mcap * b.lockBoostMultiplier - a.mcap * a.lockBoostMultiplier
    }
    if (f.sortBy === 'dev_score') {
      if (b.devScore.score !== a.devScore.score) return b.devScore.score - a.devScore.score
      return b.mcap * b.lockBoostMultiplier - a.mcap * a.lockBoostMultiplier
    }
    // default 'mcap' with sort boost for dev-locked coins
    return b.mcap * b.lockBoostMultiplier - a.mcap * a.lockBoostMultiplier
  })

  return filtered.map((x) => x.coin)
}
