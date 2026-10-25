import { pricePls } from './model'
import type { Coin, Trade } from '../state/store'

export type TraderArchetypeId = 'conviction' | 'swing' | 'momentum' | 'flipper'

export interface TraderArchetype {
  id: TraderArchetypeId
  label: string
  shortLabel: string
  emoji: string
  tone: 'up' | 'violet' | 'warn' | 'down'
  convictionScore: number // 0..100
  description: string
}

export interface EnrichedTrade extends Trade {
  ticker: string
  coinName: string
  usd: number
  /** Realized PnL in PLS (populated on SELL trades) */
  pnlPls?: number
  /** Realized PnL in USD (populated on SELL trades) */
  pnlUsd?: number
  /** Realized ROI % on the sold lot (populated on SELL trades) */
  pnlPct?: number
  /** Duration held before selling in ms (populated on SELL trades) */
  heldMs?: number
}

export interface UserCoinPnlPosition {
  coin: Coin
  heldTokens: number
  supplyPct: number
  currentValuePls: number
  currentValueUsd: number
  totalBoughtPls: number
  totalBoughtUsd: number
  totalSoldPls: number
  totalSoldUsd: number
  remainingCostPls: number
  remainingCostUsd: number
  realizedPnlPls: number
  realizedPnlUsd: number
  unrealizedPnlPls: number
  unrealizedPnlUsd: number
  totalPnlPls: number
  totalPnlUsd: number
  totalRoiPct: number
  unrealizedRoiPct: number
  heldMs: number
  isHolding: boolean
}

export interface UserPnlSummary {
  realizedPnlPls: number
  realizedPnlUsd: number
  unrealizedPnlPls: number
  unrealizedPnlUsd: number
  totalPnlPls: number
  totalPnlUsd: number
  totalCostBasisPls: number
  totalCostBasisUsd: number
  totalRoiPct: number
  winRatePct: number
  winningSells: number
  losingSells: number
  avgHoldTimeMs: number
  longestHoldMs: number
  activeHoldTimeMs: number
  archetype: TraderArchetype
  positions: UserCoinPnlPosition[]
  enrichedTrades: EnrichedTrade[]
}

const CONVICTION_USERS = new Set([
  'gainzee',
  'uniq_pulse',
  'pls_maxi',
  'trench_rat',
  'harbor',
  'solana_refugee',
  'violet',
  'quietbuyer',
])

const SWING_USERS = new Set([
  'pulsepilled',
  'nightowl',
  'kettle',
  'ember',
  'marshal',
  'northwind',
])

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Formats a duration in ms into a clean trading-terminal hold timer:
 * e.g. "4h 18m 09s", "32m 14s", "45s", or "1d 06h 12m"
 */
export function fmtHoldDuration(ms: number, showSeconds = true): string {
  const safeMs = Math.max(1000, Math.floor(ms))
  const totalSec = Math.floor(safeMs / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60

  if (days > 0) {
    return showSeconds
      ? `${days}d ${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
      : `${days}d ${hours}h ${mins}m`
  }
  if (hours > 0) {
    return showSeconds
      ? `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
      : `${hours}h ${mins}m`
  }
  if (mins > 0) {
    return showSeconds ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${mins}m`
  }
  return `${secs}s`
}

/**
 * Normalizes seeded historical timestamps into realistic live session offsets
 * while preserving exact real-time timestamps for any trade placed in the last 12 hours.
 */
function effectiveTradeTimeMs(rawT: number, user: string, ticker: string, nowMs: number): number {
  const age = nowMs - rawT
  // Real trade placed during the current or recent session (< 12 hours ago)
  if (age >= 0 && age < 12 * 3600_000) {
    return rawT
  }
  const h = hashStr(`${user.toLowerCase()}:${ticker}`)
  const uClean = user.toLowerCase()
  if (CONVICTION_USERS.has(uClean)) {
    // Conviction players entered 1h 45m to 5h 20m ago
    const baseAgoMs = (105 + (h % 215)) * 60_000 + (h % 59) * 1000
    return nowMs - baseAgoMs
  }
  if (SWING_USERS.has(uClean)) {
    // Swing players entered 25m to 85m ago
    const baseAgoMs = (25 + (h % 60)) * 60_000 + (h % 59) * 1000
    return nowMs - baseAgoMs
  }
  // Quick flippers / scalpers entered 2m to 14m ago
  const baseAgoMs = (2 + (h % 12)) * 60_000 + (h % 59) * 1000
  return nowMs - baseAgoMs
}

export function classifyTraderArchetype(
  avgHoldTimeMs: number,
  sellRatio: number,
  buyCount: number,
  sellCount: number
): TraderArchetype {
  const mins = avgHoldTimeMs / 60_000

  if (mins >= 60 && sellRatio <= 0.4) {
    const score = Math.min(99, Math.round(78 + Math.min(20, mins / 15) - sellRatio * 20))
    return {
      id: 'conviction',
      label: 'Conviction Diamond-Hand',
      shortLabel: 'Conviction',
      emoji: '💎',
      tone: 'up',
      convictionScore: score,
      description: 'High-conviction accumulator. Holds bags for hours through curve volatility and PulseX migration.',
    }
  }

  if (mins >= 20 && sellRatio <= 0.7) {
    const score = Math.max(55, Math.min(77, Math.round(58 + mins / 4 - sellRatio * 15)))
    return {
      id: 'swing',
      label: 'Swing Accumulator',
      shortLabel: 'Swing Trader',
      emoji: '🏛️',
      tone: 'violet',
      convictionScore: score,
      description: 'Patient swing trader. Enters early waves and holds through multi-leg breakouts before scaling out.',
    }
  }

  if (mins >= 6 || (sellCount === 0 && buyCount > 0)) {
    const score = Math.max(32, Math.min(54, Math.round(38 + mins * 1.5 - sellRatio * 15)))
    return {
      id: 'momentum',
      label: 'Momentum Rotator',
      shortLabel: 'Momentum',
      emoji: '⚡',
      tone: 'warn',
      convictionScore: score,
      description: 'Active momentum trader. Rides volume spikes and rotates capital across hot tickers.',
    }
  }

  const score = Math.max(8, Math.min(30, Math.round(25 - sellRatio * 15)))
  return {
    id: 'flipper',
    label: 'Quick Flipper / Scalper',
    shortLabel: 'Quick Flipper',
    emoji: '🏃',
    tone: 'down',
    convictionScore: score,
    description: 'Fast scalper / short-term flipper. Enters and exits curves in minutes for quick scalps.',
  }
}

/**
 * Computes enriched trades (with per-sell Realized PnL $, PLS, ROI %, and Hold Duration)
 * for a single coin. Returned in newest-first order matching `coin.trades`.
 */
export function computeCoinTradesWithPnl(
  coin: Coin,
  usdRate: number,
  nowMs = Date.now()
): EnrichedTrade[] {
  // Walk oldest -> newest
  const chronological = [...coin.trades].reverse()
  const tracker: Record<
    string,
    {
      tokens: number
      costPls: number
      entryTimeMs: number
    }
  > = {}

  const enrichedChrono: EnrichedTrade[] = chronological.map((tr, idx) => {
    const uKey = tr.user.toLowerCase()
    const cur = tracker[uKey] ?? {
      tokens: 0,
      costPls: 0,
      entryTimeMs: effectiveTradeTimeMs(tr.t, tr.user, coin.ticker, nowMs),
    }

    if (tr.side === 'buy') {
      const trTime = effectiveTradeTimeMs(tr.t, tr.user, coin.ticker, nowMs)
      const totalTokens = cur.tokens + tr.tokens
      const nextEntryTime =
        cur.tokens > 0 && totalTokens > 0
          ? (cur.tokens * cur.entryTimeMs + tr.tokens * trTime) / totalTokens
          : trTime
      tracker[uKey] = {
        tokens: totalTokens,
        costPls: cur.costPls + tr.pls,
        entryTimeMs: nextEntryTime,
      }
      return {
        ...tr,
        ticker: coin.ticker,
        coinName: coin.name,
        usd: tr.pls * usdRate,
      }
    }

    // SELL trade: calculate realized PnL against average cost basis
    let costBasisPls = 0
    let heldMs = 180_000
    if (cur.tokens > 1e-4 && cur.costPls > 0) {
      const avgCostPerToken = cur.costPls / cur.tokens
      const matchedTokens = Math.min(cur.tokens, tr.tokens)
      costBasisPls = matchedTokens * avgCostPerToken
      if (tr.tokens > matchedTokens) {
        // Remainder estimated from earlier curve price
        const fallbackFactor = 0.62
        costBasisPls += (tr.tokens - matchedTokens) * (tr.pls / Math.max(tr.tokens, 1)) * fallbackFactor
      }
      const sellTime = tr.t > nowMs - 12 * 3600_000 ? tr.t : nowMs - (chronological.length - idx) * 15_000
      heldMs = Math.max(12_000, sellTime - cur.entryTimeMs)
      const remainingRatio = Math.max(0, (cur.tokens - matchedTokens) / cur.tokens)
      tracker[uKey] = {
        tokens: Math.max(0, cur.tokens - matchedTokens),
        costPls: cur.costPls * remainingRatio,
        entryTimeMs: cur.entryTimeMs,
      }
    } else {
      // Seeded / simulated pullback sell without an explicit earlier buy in the capped trade window
      const h = hashStr(`${tr.user}:${coin.ticker}:${idx}`)
      // 72% of pullback sellers took profit (+24% to +210%), 28% panic-sold a dip (-8% to -24%)
      const isWin = h % 100 < 72
      const entryRatio = isWin ? 0.35 + ((h % 45) / 100) : 1.09 + ((h % 22) / 100)
      costBasisPls = tr.pls * entryRatio
      heldMs = CONVICTION_USERS.has(uKey)
        ? (45 + (h % 90)) * 60_000
        : SWING_USERS.has(uKey)
        ? (12 + (h % 28)) * 60_000
        : (1 + (h % 6)) * 60_000 + ((h % 50) * 1000)
    }

    const pnlPls = tr.pls - costBasisPls
    const pnlUsd = pnlPls * usdRate
    const pnlPct = costBasisPls > 0 ? (pnlPls / costBasisPls) * 100 : 0

    return {
      ...tr,
      ticker: coin.ticker,
      coinName: coin.name,
      usd: tr.pls * usdRate,
      pnlPls,
      pnlUsd,
      pnlPct,
      heldMs,
    }
  })

  return enrichedChrono.reverse()
}

/**
 * Computes full PnL (Realized + Unrealized), Win Rate, Per-Coin Positions,
 * Average Time Held (live timer), and Trader Archetype for any @username.
 */
export function computeUserPnlAndHoldProfile(
  username: string,
  coins: Coin[],
  usdRate: number,
  nowMs = Date.now()
): UserPnlSummary {
  const clean = username.replace(/^@/, '').toLowerCase()
  const positions: UserCoinPnlPosition[] = []
  const enrichedTrades: EnrichedTrade[] = []

  let realizedPnlPls = 0
  let unrealizedPnlPls = 0
  let totalCostBasisPls = 0
  let winningSells = 0
  let losingSells = 0
  let totalBoughtTokensAll = 0
  let totalSoldTokensAll = 0
  let holdWeightedSumMs = 0
  let holdWeightTotalPls = 0
  let longestHoldMs = 0
  let activeHoldWeightedSumMs = 0
  let activeHoldWeightPls = 0

  for (const c of coins) {
    const coinTrades = computeCoinTradesWithPnl(c, usdRate, nowMs)
    const myTradesChrono = [...coinTrades].reverse().filter((t) => t.user.toLowerCase() === clean)
    const heldTokens = c.holders[username] ?? c.holders[clean] ?? 0

    if (myTradesChrono.length === 0 && heldTokens <= 1e-4) continue

    let boughtPls = 0
    let soldPls = 0
    let coinRealizedPls = 0
    let trackedTokens = 0
    let trackedCostPls = 0
    let entryTimeMs = effectiveTradeTimeMs(c.createdAt, clean, c.ticker, nowMs)

    for (const tr of myTradesChrono) {
      enrichedTrades.push(tr)
      if (tr.side === 'buy') {
        const trTime = effectiveTradeTimeMs(tr.t, clean, c.ticker, nowMs)
        const nextTokens = trackedTokens + tr.tokens
        if (nextTokens > 0) {
          entryTimeMs = (trackedTokens * entryTimeMs + tr.tokens * trTime) / nextTokens
        }
        trackedTokens = nextTokens
        trackedCostPls += tr.pls
        boughtPls += tr.pls
        totalBoughtTokensAll += tr.tokens
      } else {
        soldPls += tr.pls
        totalSoldTokensAll += tr.tokens
        const tradePnlPls = tr.pnlPls ?? 0
        coinRealizedPls += tradePnlPls
        if (tradePnlPls >= 0) winningSells++
        else losingSells++

        const matched = Math.min(trackedTokens, tr.tokens)
        if (trackedTokens > 0) {
          trackedCostPls = trackedCostPls * Math.max(0, (trackedTokens - matched) / trackedTokens)
          trackedTokens = Math.max(0, trackedTokens - matched)
        }

        const hMs = tr.heldMs ?? 180_000
        holdWeightedSumMs += hMs * tr.pls
        holdWeightTotalPls += tr.pls
        if (hMs > longestHoldMs) longestHoldMs = hMs
      }
    }

    const curPricePls = pricePls(c.curve)
    const currentValuePls = heldTokens * curPricePls

    let remainingCostPls = trackedCostPls
    if (heldTokens > 1e-4 && remainingCostPls <= 0) {
      // Estimate cost basis if user holds tokens whose initial buys were before the trade window
      remainingCostPls = currentValuePls * 0.42
      boughtPls = Math.max(boughtPls, remainingCostPls)
    }

    const coinUnrealizedPls = heldTokens > 1e-4 ? currentValuePls - remainingCostPls : 0
    const coinTotalPnlPls = coinRealizedPls + coinUnrealizedPls
    const coinCostBasis = Math.max(boughtPls, remainingCostPls, 1)
    const coinTotalRoiPct = (coinTotalPnlPls / coinCostBasis) * 100
    const coinUnrealizedRoiPct = remainingCostPls > 0 ? (coinUnrealizedPls / remainingCostPls) * 100 : 0

    const openHeldMs =
      heldTokens > 1e-4
        ? Math.max(5_000, nowMs - entryTimeMs)
        : myTradesChrono[myTradesChrono.length - 1]?.heldMs ?? 180_000

    if (heldTokens > 1e-4) {
      const weight = Math.max(currentValuePls, remainingCostPls, 100_000)
      holdWeightedSumMs += openHeldMs * weight
      holdWeightTotalPls += weight
      activeHoldWeightedSumMs += openHeldMs * weight
      activeHoldWeightPls += weight
      if (openHeldMs > longestHoldMs) longestHoldMs = openHeldMs
    }

    realizedPnlPls += coinRealizedPls
    unrealizedPnlPls += coinUnrealizedPls
    totalCostBasisPls += coinCostBasis

    positions.push({
      coin: c,
      heldTokens,
      supplyPct: (heldTokens / 1_000_000_000) * 100,
      currentValuePls,
      currentValueUsd: currentValuePls * usdRate,
      totalBoughtPls: boughtPls,
      totalBoughtUsd: boughtPls * usdRate,
      totalSoldPls: soldPls,
      totalSoldUsd: soldPls * usdRate,
      remainingCostPls,
      remainingCostUsd: remainingCostPls * usdRate,
      realizedPnlPls: coinRealizedPls,
      realizedPnlUsd: coinRealizedPls * usdRate,
      unrealizedPnlPls: coinUnrealizedPls,
      unrealizedPnlUsd: coinUnrealizedPls * usdRate,
      totalPnlPls: coinTotalPnlPls,
      totalPnlUsd: coinTotalPnlPls * usdRate,
      totalRoiPct: coinTotalRoiPct,
      unrealizedRoiPct: coinUnrealizedRoiPct,
      heldMs: openHeldMs,
      isHolding: heldTokens > 1e-4,
    })
  }

  enrichedTrades.sort((a, b) => b.t - a.t)
  positions.sort((a, b) => b.totalPnlUsd - a.totalPnlUsd)

  const defaultHoldMs = CONVICTION_USERS.has(clean)
    ? 3 * 3600_000 + 24 * 60_000
    : SWING_USERS.has(clean)
    ? 44 * 60_000
    : 4 * 60_000 + 18_000

  const avgHoldTimeMs =
    holdWeightTotalPls > 0 ? holdWeightedSumMs / holdWeightTotalPls : defaultHoldMs
  const activeHoldTimeMs =
    activeHoldWeightPls > 0 ? activeHoldWeightedSumMs / activeHoldWeightPls : avgHoldTimeMs

  const sellCount = winningSells + losingSells
  const profitableOpenPositions = positions.filter((p) => p.isHolding && p.unrealizedPnlPls > 0).length
  const totalOpenPositions = positions.filter((p) => p.isHolding).length

  const winRatePct =
    sellCount > 0
      ? (winningSells / sellCount) * 100
      : totalOpenPositions > 0
      ? (profitableOpenPositions / totalOpenPositions) * 100
      : 100

  const sellRatio =
    totalBoughtTokensAll > 0
      ? Math.min(1, totalSoldTokensAll / totalBoughtTokensAll)
      : sellCount > 0
      ? 0.85
      : 0

  const archetype = classifyTraderArchetype(
    avgHoldTimeMs,
    sellRatio,
    enrichedTrades.filter((t) => t.side === 'buy').length,
    sellCount
  )

  const totalPnlPls = realizedPnlPls + unrealizedPnlPls
  const totalRoiPct = totalCostBasisPls > 0 ? (totalPnlPls / totalCostBasisPls) * 100 : 0

  return {
    realizedPnlPls,
    realizedPnlUsd: realizedPnlPls * usdRate,
    unrealizedPnlPls,
    unrealizedPnlUsd: unrealizedPnlPls * usdRate,
    totalPnlPls,
    totalPnlUsd: totalPnlPls * usdRate,
    totalCostBasisPls,
    totalCostBasisUsd: totalCostBasisPls * usdRate,
    totalRoiPct,
    winRatePct,
    winningSells,
    losingSells,
    avgHoldTimeMs,
    longestHoldMs: Math.max(longestHoldMs, avgHoldTimeMs),
    activeHoldTimeMs,
    archetype,
    positions,
    enrichedTrades,
  }
}
