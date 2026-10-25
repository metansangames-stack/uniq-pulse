/**
 * Pure OHLCV candlestick & volume aggregation from coin trade history.
 * No fake or random wicks/data: builds candles strictly from real trade history,
 * carries previous close forward on empty intervals (flat candle, 0 volume),
 * and ensures the latest candle's market cap matches the CoinPage header market cap exactly.
 */
import {
  FEE_RATE,
  GRAD_LP_PLS,
  GRAD_LP_TOKENS,
  GRAD_PLS,
  K,
  LAST_CURVE_PRICE_PLS,
  POST_MIGRATION_LP_FEE,
  T0,
  TOTAL_SUPPLY,
  V0,
  newCurve,
  pricePls,
  type Curve,
} from './model'
import type { Candle, Coin, Trade } from '../state/store'

export type ChartTimeframe = '1s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1D'
export type ChartMetric = 'price' | 'mcap'
export type ChartCurrency = 'pls' | 'usd'
export type ChartSeriesMode = 'candles' | 'line'

export const CHART_TIMEFRAMES: readonly ChartTimeframe[] = [
  '1s',
  '15s',
  '30s',
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1D',
] as const

export const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  '1s': 1,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3_600,
  '4h': 14_400,
  '1D': 86_400,
}

export const TIMEFRAME_MS: Record<ChartTimeframe, number> = {
  '1s': 1_000,
  '15s': 15_000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1D': 86_400_000,
}

const MAX_CONSECUTIVE_GAP_FILL_BUCKETS = 12

export function toSubscriptNumber(n: number): string {
  return String(Math.max(0, Math.floor(n)))
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0) - 48
      return code >= 0 && code <= 9 ? String.fromCharCode(0x2080 + code) : ch
    })
    .join('')
}

/**
 * Formats numbers for the chart axis and legend:
 * - On MCap view (`isMcap: true`): compact `$12.3K` / `$1.45M` / `$2.10B` style.
 * - On Price view: normal decimals with 4 significant digits at or above `0.0001`,
 *   and subscript zeros (e.g. `0.0₅123`) below `0.0001`.
 */
export function formatSubscriptPrice(
  value: number,
  opts?: { prefix?: string; sigDigits?: number; isMcap?: boolean }
): string {
  const prefix = opts?.prefix ?? ''
  const sigDigits = opts?.sigDigits ?? 4
  if (!Number.isFinite(value) || value === 0) return `${prefix}0`
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)

  if (abs >= 1_000_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(2)}B`
  }
  if (abs >= 1_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 100_000) {
    return `${sign}${prefix}${Math.round(abs / 1_000)}K`
  }
  if (abs >= 1_000) {
    return `${sign}${prefix}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }

  if (opts?.isMcap && abs >= 1) {
    return `${sign}${prefix}${abs >= 100 ? Math.round(abs).toLocaleString('en-US') : abs.toFixed(2)}`
  }

  if (abs >= 0.0001) {
    const numStr = Number(abs.toPrecision(sigDigits)).toFixed(10)
    const trimmed = numStr.replace(/\.?0+$/, '')
    return `${sign}${prefix}${trimmed || '0'}`
  }

  const fixed = abs.toFixed(18)
  const m = fixed.match(/^0\.(0+)([1-9]\d*)/)
  if (!m) return `${sign}${prefix}0`
  const zeroCount = m[1].length
  const sigRaw = m[2].slice(0, sigDigits).replace(/0+$/, '') || m[2].slice(0, Math.min(3, m[2].length))
  return `${sign}${prefix}0.0${toSubscriptNumber(zeroCount)}${sigRaw}`
}

export interface TradeWithOptionalPrice extends Trade {
  /** Optional explicit post-trade price in PLS per token (for unit tests). */
  pricePls?: number
}

export interface TradeTick {
  t: number
  side: 'buy' | 'sell'
  user: string
  pls: number
  tokens: number
  /** Post-trade spot price per token in PLS. */
  pricePls: number
  /** Spot price per token in PLS immediately prior to this trade. */
  prevPricePls: number
}

export interface OhlcvCandle {
  /** Bucket start UNIX timestamp in seconds (for Lightweight Charts UTCTimestamp). */
  time: number
  /** Bucket start timestamp in milliseconds. */
  bucketStartMs: number
  /** Bucket end timestamp (exclusive) in milliseconds. */
  bucketEndMs: number
  open: number
  high: number
  low: number
  close: number
  /** Volume in the active currency (PLS or USD). */
  volume: number
  /** Buy volume in the active currency (PLS or USD). */
  buyVolume: number
  /** Sell volume in the active currency (PLS or USD). */
  sellVolume: number
  /** Raw volume in PLS. */
  volumePls: number
  buyVolumePls: number
  sellVolumePls: number
  /** Number of trades in this bucket (0 for gap-filled intervals). */
  tradeCount: number
  /** True when the bucket had no trades and carried the previous close forward. */
  isGapFill: boolean
}

export interface BuildCandlesOptions {
  timeframe: ChartTimeframe
  metric?: ChartMetric
  currency?: ChartCurrency
  /** PLS price in USD (e.g. 0.000008). Required when currency === 'usd'. */
  plsUsd?: number
  /** Optional coin curve to anchor the latest trade's post-trade price to pricePls(curve). */
  curve?: Curve
  /** Optional recorded coin.candles array for historical curve price recovery on seeded AMM runs. */
  recordedCandles?: readonly Candle[]
  /** Optional coin creation timestamp in ms (used if a newly launched coin has 0 trades yet). */
  createdAt?: number
  /** Whether to fill empty intervals between first and last trade with flat 0-volume candles (default: true). */
  fillGaps?: boolean
}

/**
 * Computes the bucket start timestamp in milliseconds for a given timestamp `tMs` and timeframe.
 */
export function getBucketStartMs(tMs: number, timeframe: ChartTimeframe): number {
  const stepMs = TIMEFRAME_MS[timeframe]
  return Math.floor(tMs / stepMs) * stepMs
}

/**
 * Replays trades chronologically to derive the exact post-trade price per token in PLS after each trade.
 * Never invents fake or random trades or wicks.
 */
export function extractTradeTicks(
  trades: readonly TradeWithOptionalPrice[],
  opts?: {
    curve?: Curve
    recordedCandles?: readonly Candle[]
  }
): TradeTick[] {
  if (!trades || trades.length === 0) return []

  // `coin.trades` is stored newest-first; reverse first so same-millisecond trades keep execution order, then stable sort by `t`.
  const chrono = [...trades]
    .reverse()
    .map((tr, idx) => ({ tr, idx }))
    .sort((a, b) => (a.tr.t !== b.tr.t ? a.tr.t - b.tr.t : a.idx - b.idx))
    .map((x) => x.tr)

  const launchPricePls = pricePls(newCurve())
  const simCurve: Curve = newCurve()
  const rawPricesPls: number[] = []

  // Check if recordedCandles align with chrono trades (in store.ts, candles[0] is launch and candles[1..N] match chrono[0..N-1])
  const rec = opts?.recordedCandles ?? []
  const hasAlignedRecordedCandles =
    rec.length === chrono.length + 1 &&
    chrono.every((tr, i) => Math.abs((rec[i + 1]?.t ?? 0) - tr.t) <= 1_000)

  for (let i = 0; i < chrono.length; i++) {
    const tr = chrono[i]
    if (typeof tr.pricePls === 'number' && Number.isFinite(tr.pricePls) && tr.pricePls > 0) {
      rawPricesPls.push(tr.pricePls)
      if (!simCurve.graduated) {
        if (tr.side === 'buy') {
          const net = tr.pls * (1 - FEE_RATE)
          const nextReserve = Math.min(GRAD_PLS, simCurve.reservePls + net)
          simCurve.tokensSold = Math.min(T0 - 1, T0 - K / (V0 + nextReserve))
          simCurve.reservePls = nextReserve
          if (nextReserve >= GRAD_PLS - 1e-6) {
            simCurve.graduated = true
            simCurve.dexPls = GRAD_LP_PLS
            simCurve.dexTokens = GRAD_LP_TOKENS
          }
        } else {
          const gross = tr.pls / (1 - FEE_RATE)
          simCurve.reservePls = Math.max(0, simCurve.reservePls - gross)
          simCurve.tokensSold = Math.max(0, T0 - K / (V0 + simCurve.reservePls))
        }
      }
      continue
    }

    // Advance simulated curve
    if (!simCurve.graduated) {
      if (tr.side === 'buy') {
        const net = tr.pls * (1 - FEE_RATE)
        const nextReserve = Math.min(GRAD_PLS, simCurve.reservePls + net)
        const tokensLeftAfter = K / (V0 + nextReserve)
        simCurve.tokensSold = Math.min(T0 - 1, T0 - tokensLeftAfter)
        simCurve.reservePls = nextReserve
        if (nextReserve >= GRAD_PLS - 1e-6) {
          simCurve.graduated = true
          simCurve.dexPls = GRAD_LP_PLS
          simCurve.dexTokens = GRAD_LP_TOKENS
        }
      } else {
        const gross = tr.pls / (1 - FEE_RATE)
        simCurve.reservePls = Math.max(0, simCurve.reservePls - gross)
        const tokensLeftAfter = K / (V0 + simCurve.reservePls)
        simCurve.tokensSold = Math.max(0, T0 - tokensLeftAfter)
      }
      rawPricesPls.push(pricePls(simCurve))
    } else {
      // Post-graduation PulseX AMM trade
      if (hasAlignedRecordedCandles && rec[i + 1]?.c > 0 && rec[i + 1]?.o > 0) {
        // Use the per-trade step ratio (rec[i+1].c / rec[i+1].o) which was recorded with the exact same plsUsd
        // on both numerator and denominator, preventing any cross-currency or live-plsUsd spike!
        const prevSpotPls = rawPricesPls.length > 0 ? rawPricesPls[rawPricesPls.length - 1] : launchPricePls
        const stepRatio = rec[i + 1].c / rec[i + 1].o
        const nextSpotPls = prevSpotPls * stepRatio
        rawPricesPls.push(nextSpotPls)
        const nextDexPls = Math.sqrt(GRAD_LP_PLS * GRAD_LP_TOKENS * Math.max(1e-12, nextSpotPls))
        simCurve.dexPls = nextDexPls
        simCurve.dexTokens = (GRAD_LP_PLS * GRAD_LP_TOKENS) / Math.max(1, nextDexPls)
      } else {
        const dexPls = simCurve.dexPls ?? GRAD_LP_PLS
        const dexTokens = simCurve.dexTokens ?? GRAD_LP_TOKENS
        const kDex = dexPls * dexTokens
        if (tr.side === 'buy') {
          const net = tr.pls * (1 - POST_MIGRATION_LP_FEE)
          const nextDexPls = dexPls + net
          const nextDexTokens = Math.max(1, kDex / nextDexPls)
          simCurve.dexPls = nextDexPls
          simCurve.dexTokens = nextDexTokens
        } else {
          const gross = tr.pls / (1 - POST_MIGRATION_LP_FEE)
          const nextDexPls = Math.max(1_000, dexPls - gross)
          const nextDexTokens = kDex / nextDexPls
          simCurve.dexPls = nextDexPls
          simCurve.dexTokens = nextDexTokens
        }
        rawPricesPls.push(pricePls(simCurve))
      }
    }
  }

  // Anchor the final trade's post-trade price to `pricePls(opts.curve)` when a live curve is provided,
  // so that the last candle's close matches the header price & market cap (`mcapUsd(coin.curve, usdRate)`) 100% exactly.
  if (opts?.curve && rawPricesPls.length > 0) {
    const targetFinalPricePls = pricePls(opts.curve)
    if (Number.isFinite(targetFinalPricePls) && targetFinalPricePls > 0) {
      rawPricesPls[rawPricesPls.length - 1] = targetFinalPricePls
    }
  }

  const ticks: TradeTick[] = []
  let prevPricePls = launchPricePls
  for (let i = 0; i < chrono.length; i++) {
    const tr = chrono[i]
    const p = rawPricesPls[i]
    ticks.push({
      t: tr.t,
      side: tr.side,
      user: tr.user,
      pls: tr.pls,
      tokens: tr.tokens,
      pricePls: p,
      prevPricePls: i === 0 && !opts?.curve && tr.pricePls !== undefined ? p : prevPricePls,
    })
    prevPricePls = p
  }

  return ticks
}

/**
 * Builds OHLCV candles from a coin's trade history for any supported timeframe,
 * metric ('price' | 'mcap'), and currency ('pls' | 'usd').
 * Empty intervals between the first and last bucket carry the previous close forward (flat candle, 0 volume).
 */
export function buildOhlcvCandles(
  trades: readonly TradeWithOptionalPrice[],
  options: BuildCandlesOptions
): OhlcvCandle[] {
  const {
    timeframe,
    metric = 'mcap',
    currency = 'usd',
    plsUsd = 0.000008,
    curve,
    recordedCandles,
    createdAt,
    fillGaps = true,
  } = options

  const stepMs = TIMEFRAME_MS[timeframe]
  const scaleFactor =
    (metric === 'mcap' ? TOTAL_SUPPLY : 1) * (currency === 'usd' ? plsUsd : 1)
  const volFactor = currency === 'usd' ? plsUsd : 1

  const ticks = extractTradeTicks(trades, { curve, recordedCandles })
  if (ticks.length === 0) {
    if (curve) {
      const bMs = getBucketStartMs(createdAt ?? recordedCandles?.[0]?.t ?? Date.now(), timeframe)
      const val = pricePls(curve) * scaleFactor
      return [-2, -1, 0].map((offset) => {
        const startMs = bMs + offset * stepMs
        return {
          time: Math.floor(startMs / 1000),
          bucketStartMs: startMs,
          bucketEndMs: startMs + stepMs,
          open: val,
          high: val,
          low: val,
          close: val,
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          volumePls: 0,
          buyVolumePls: 0,
          sellVolumePls: 0,
          tradeCount: 0,
          isGapFill: true,
        }
      })
    }
    return []
  }

  interface RawBucket {
    bucketStartMs: number
    pricesPls: number[]
    firstPrePricePls: number
    buyVolumePls: number
    sellVolumePls: number
    tradeCount: number
  }

  const bucketMap = new Map<number, RawBucket>()
  for (const tk of ticks) {
    const bStart = getBucketStartMs(tk.t, timeframe)
    let b = bucketMap.get(bStart)
    if (!b) {
      b = {
        bucketStartMs: bStart,
        pricesPls: [],
        firstPrePricePls: tk.prevPricePls,
        buyVolumePls: 0,
        sellVolumePls: 0,
        tradeCount: 0,
      }
      bucketMap.set(bStart, b)
    }
    b.pricesPls.push(tk.pricePls)
    if (tk.side === 'buy') {
      b.buyVolumePls += tk.pls
    } else {
      b.sellVolumePls += tk.pls
    }
    b.tradeCount += 1
  }

  const sortedBucketStarts = Array.from(bucketMap.keys()).sort((a, b) => a - b)

  const candles: OhlcvCandle[] = []
  let prevClosePls: number | null = null
  let prevBucketStartMs: number | null = null

  for (const bMs of sortedBucketStarts) {
    if (fillGaps && prevBucketStartMs !== null && prevClosePls !== null) {
      const gapCount = Math.round((bMs - prevBucketStartMs) / stepMs) - 1
      if (gapCount > 0 && gapCount <= MAX_CONSECUTIVE_GAP_FILL_BUCKETS) {
        const flatVal = prevClosePls * scaleFactor
        for (let g = 1; g <= gapCount; g++) {
          const gapMs = prevBucketStartMs + g * stepMs
          candles.push({
            time: Math.floor(gapMs / 1000),
            bucketStartMs: gapMs,
            bucketEndMs: gapMs + stepMs,
            open: flatVal,
            high: flatVal,
            low: flatVal,
            close: flatVal,
            volume: 0,
            buyVolume: 0,
            sellVolume: 0,
            volumePls: 0,
            buyVolumePls: 0,
            sellVolumePls: 0,
            tradeCount: 0,
            isGapFill: true,
          })
        }
      }
    }

    const b = bucketMap.get(bMs)!
    const openPls =
      prevClosePls !== null
        ? prevClosePls
        : curve
        ? b.firstPrePricePls
        : b.pricesPls.length >= 2
        ? b.pricesPls[0]
        : b.firstPrePricePls
    const closePls = b.pricesPls[b.pricesPls.length - 1]
    let highPls = Math.max(openPls, closePls)
    let lowPls = Math.min(openPls, closePls)
    for (const p of b.pricesPls) {
      if (p > highPls) highPls = p
      if (p < lowPls) lowPls = p
    }
    const totalVolPls = b.buyVolumePls + b.sellVolumePls
    candles.push({
      time: Math.floor(bMs / 1000),
      bucketStartMs: bMs,
      bucketEndMs: bMs + stepMs,
      open: openPls * scaleFactor,
      high: highPls * scaleFactor,
      low: lowPls * scaleFactor,
      close: closePls * scaleFactor,
      volume: totalVolPls * volFactor,
      buyVolume: b.buyVolumePls * volFactor,
      sellVolume: b.sellVolumePls * volFactor,
      volumePls: totalVolPls,
      buyVolumePls: b.buyVolumePls,
      sellVolumePls: b.sellVolumePls,
      tradeCount: b.tradeCount,
      isGapFill: false,
    })
    prevClosePls = closePls
    prevBucketStartMs = bMs
  }

  // When building for a real coin (`curve` provided), prepend the coin's initial launch price baseline bucket
  // so the chart always starts at the launch curve price and candles[0].time never shifts as trades grow.
  if (curve && candles.length >= 1) {
    const first = candles[0]
    const launchStartMs = first.bucketStartMs - stepMs
    const launchVal = first.open
    candles.unshift({
      time: Math.floor(launchStartMs / 1000),
      bucketStartMs: launchStartMs,
      bucketEndMs: first.bucketStartMs,
      open: launchVal,
      high: launchVal,
      low: launchVal,
      close: launchVal,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
      volumePls: 0,
      buyVolumePls: 0,
      sellVolumePls: 0,
      tradeCount: 0,
      isGapFill: true,
    })
  }

  return candles
}

/**
 * Convenience wrapper that builds OHLCV candles directly from a Coin object.
 */
export function buildCoinOhlcvCandles(
  coin: Pick<Coin, 'trades'> & Partial<Pick<Coin, 'candles' | 'curve' | 'createdAt'>>,
  opts: Omit<BuildCandlesOptions, 'curve' | 'recordedCandles' | 'createdAt'>
): OhlcvCandle[] {
  return buildOhlcvCandles(coin.trades, {
    ...opts,
    curve: coin.curve,
    recordedCandles: coin.candles,
    createdAt: coin.createdAt,
  })
}

/**
 * Auto-picks a smaller timeframe (down to 1s) when a coin has fewer than ~30 candles in the chosen timeframe.
 */
export function pickAutoTimeframe(
  coin: Pick<Coin, 'trades'> & Partial<Pick<Coin, 'candles' | 'curve' | 'createdAt'>>,
  preferred: ChartTimeframe,
  plsUsd = 0.000008
): ChartTimeframe {
  const startIdx = CHART_TIMEFRAMES.indexOf(preferred)
  if (startIdx <= 0) return preferred
  for (let idx = startIdx; idx >= 0; idx--) {
    const tf = CHART_TIMEFRAMES[idx]
    const list = buildCoinOhlcvCandles(coin, { timeframe: tf, plsUsd })
    if (list.length >= 30 || idx === 0) {
      return tf
    }
  }
  return '1s'
}

export interface IndicatorPoint {
  time: number
  value: number
}

/**
 * Simple Moving Average (MA `period`, default 20) over candle close values.
 */
export function computeSma(
  candles: readonly OhlcvCandle[],
  period = 20
): IndicatorPoint[] {
  if (candles.length === 0 || period <= 0) return []
  const out: IndicatorPoint[] = []
  let rollingSum = 0
  for (let i = 0; i < candles.length; i++) {
    rollingSum += candles[i].close
    if (i >= period) {
      rollingSum -= candles[i - period].close
      out.push({ time: candles[i].time, value: rollingSum / period })
    } else if (i === period - 1) {
      out.push({ time: candles[i].time, value: rollingSum / period })
    } else if (candles.length < period) {
      out.push({ time: candles[i].time, value: rollingSum / (i + 1) })
    }
  }
  return out
}

/**
 * Exponential Moving Average (EMA `period`, default 50) over candle close values.
 */
export function computeEma(
  candles: readonly OhlcvCandle[],
  period = 50
): IndicatorPoint[] {
  if (candles.length === 0 || period <= 0) return []
  const k = 2 / (period + 1)
  const out: IndicatorPoint[] = []
  let ema = candles[0].close
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    ema = i === 0 ? c.close : c.close * k + ema * (1 - k)
    out.push({ time: c.time, value: ema })
  }
  return out
}

/**
 * Cumulative Volume-Weighted Average Price (VWAP) over OHLCV candles.
 */
export function computeVwap(candles: readonly OhlcvCandle[]): IndicatorPoint[] {
  if (candles.length === 0) return []
  const out: IndicatorPoint[] = []
  let cumPV = 0
  let cumVol = 0
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3
    if (c.volume > 0) {
      cumPV += typical * c.volume
      cumVol += c.volume
    }
    out.push({
      time: c.time,
      value: cumVol > 0 ? cumPV / cumVol : typical,
    })
  }
  return out
}

/**
 * Returns the migration threshold value in the active chart metric & currency
 * (when the bonding curve hits 200M PLS reserve: price = LAST_CURVE_PRICE_PLS, mcap = LAST_CURVE_PRICE_PLS * 1B).
 */
export function getMigrationLineValue(
  metric: ChartMetric,
  currency: ChartCurrency,
  plsUsd: number
): number {
  const basePls = metric === 'mcap' ? LAST_CURVE_PRICE_PLS * TOTAL_SUPPLY : LAST_CURVE_PRICE_PLS
  return currency === 'usd' ? basePls * plsUsd : basePls
}

export interface TimeframeChangeStats {
  change5mPct: number
  change1hPct: number
  change6hPct: number
  change24hPct: number
}

/**
 * Computes 5m / 1h / 6h / 24h percentage price changes from the coin's trade history relative to `nowMs`.
 */
export function computePriceChangesByWindow(
  coin: Pick<Coin, 'trades' | 'curve'> & Partial<Pick<Coin, 'candles'>>,
  nowMs = Date.now()
): TimeframeChangeStats {
  const ticks = extractTradeTicks(coin.trades, {
    curve: coin.curve,
    recordedCandles: coin.candles,
  })
  const curPricePls = pricePls(coin.curve)
  if (ticks.length === 0 || !(curPricePls > 0)) {
    return { change5mPct: 0, change1hPct: 0, change6hPct: 0, change24hPct: 0 }
  }

  function pctForWindow(windowMs: number): number {
    const cutoff = nowMs - windowMs
    // Find the last trade at or before cutoff
    let refPrice: number | null = null
    for (let i = ticks.length - 1; i >= 0; i--) {
      if (ticks[i].t <= cutoff) {
        refPrice = ticks[i].pricePls
        break
      }
    }
    if (refPrice === null) {
      // All trades occurred within the window; compare against pre-first-trade launch price
      refPrice = ticks[0].prevPricePls
    }
    if (!(refPrice > 0)) return 0
    return ((curPricePls - refPrice) / refPrice) * 100
  }

  return {
    change5mPct: pctForWindow(5 * 60_000),
    change1hPct: pctForWindow(60 * 60_000),
    change6hPct: pctForWindow(6 * 3_600_000),
    change24hPct: pctForWindow(24 * 3_600_000),
  }
}

export interface CandleDeltaUpdate {
  /**
   * - 'full': first load, coin change, or interval/scale change (caller uses series.setData)
   * - 'update': trade fell in the current last candle's bucket (caller calls series.update(updatedLastCandle))
   * - 'append': trade started a new bucket (caller calls series.update(newCandle))
   */
  mode: 'full' | 'update' | 'append'
  /** The primary updated or appended candle (last element of nextCandles). */
  candle: OhlcvCandle | null
  /** Exact chronological list of candle bars to pass to series.update(...) when mode is 'update' or 'append'. */
  candlesToApply: OhlcvCandle[]
}

/**
 * Determines whether a candle transition can be applied incrementally via `series.update(...)`:
 * - Returns `mode: 'update'` with `[updatedLastCandle]` when a new trade lands in the current last candle's bucket.
 * - Returns `mode: 'append'` with the newly started bucket candle(s) when a new trade starts a new bucket.
 * - Returns `mode: 'full'` when `prevCandles` is empty or the series origin changed (first load, coin change, or interval change).
 */
export function computeCandleDeltaUpdate(
  prevCandles: readonly OhlcvCandle[],
  nextCandles: readonly OhlcvCandle[]
): CandleDeltaUpdate {
  if (nextCandles.length === 0) {
    return { mode: 'full', candle: null, candlesToApply: [] }
  }
  const latest = nextCandles[nextCandles.length - 1]
  if (
    prevCandles.length === 0 ||
    nextCandles.length < prevCandles.length ||
    prevCandles[0].time !== nextCandles[0].time
  ) {
    return { mode: 'full', candle: latest, candlesToApply: [...nextCandles] }
  }

  const prevLastIdx = prevCandles.length - 1
  const prevLast = prevCandles[prevLastIdx]
  const alignedInNext = nextCandles[prevLastIdx]

  // Must still align at the previous last candle's timestamp
  if (!alignedInNext || alignedInNext.time !== prevLast.time) {
    return { mode: 'full', candle: latest, candlesToApply: [...nextCandles] }
  }

  if (nextCandles.length === prevCandles.length) {
    return {
      mode: 'update',
      candle: latest,
      candlesToApply: [latest],
    }
  }

  // nextCandles.length > prevCandles.length -> new bucket(s) appended
  const prevLastChanged =
    alignedInNext.close !== prevLast.close ||
    alignedInNext.high !== prevLast.high ||
    alignedInNext.low !== prevLast.low ||
    alignedInNext.volume !== prevLast.volume ||
    alignedInNext.tradeCount !== prevLast.tradeCount

  const startIdx = prevLastChanged ? prevLastIdx : prevCandles.length
  return {
    mode: 'append',
    candle: latest,
    candlesToApply: nextCandles.slice(startIdx),
  }
}

/**
 * Incrementally folds a single new trade into an existing `OhlcvCandle[]` array in O(1) time
 * without rebuilding all historical trades into candles:
 * - If the trade falls in the current last candle's bucket, returns `mode: 'update'` and updates the last candle.
 * - If the trade starts a new bucket, returns `mode: 'append'` and appends the new candle.
 */
export function applyTradeToCandles(
  prevCandles: readonly OhlcvCandle[],
  trade: TradeWithOptionalPrice,
  options: BuildCandlesOptions & { postTradePricePls?: number }
): CandleDeltaUpdate & { candles: OhlcvCandle[] } {
  const {
    timeframe,
    metric = 'mcap',
    currency = 'usd',
    plsUsd = 0.000008,
    curve,
    fillGaps = true,
  } = options

  const postPricePls =
    options.postTradePricePls ??
    trade.pricePls ??
    (curve ? pricePls(curve) : undefined)

  if (prevCandles.length === 0 || !(postPricePls && postPricePls > 0)) {
    const built = buildOhlcvCandles([trade], options)
    return {
      mode: 'full',
      candle: built[built.length - 1] ?? null,
      candlesToApply: built,
      candles: built,
    }
  }

  const stepMs = TIMEFRAME_MS[timeframe]
  const scaleFactor =
    (metric === 'mcap' ? TOTAL_SUPPLY : 1) * (currency === 'usd' ? plsUsd : 1)
  const volFactor = currency === 'usd' ? plsUsd : 1

  const bStartMs = getBucketStartMs(trade.t, timeframe)
  const bTimeSec = Math.floor(bStartMs / 1000)
  const closeVal = postPricePls * scaleFactor
  const tradeVolVal = trade.pls * volFactor
  const last = prevCandles[prevCandles.length - 1]

  if (bStartMs <= last.bucketStartMs) {
    // Trade falls in the current last candle's bucket -> update in place
    const open = last.open
    const high = last.isGapFill && last.tradeCount === 0 ? Math.max(open, closeVal) : Math.max(last.high, closeVal)
    const low = last.isGapFill && last.tradeCount === 0 ? Math.min(open, closeVal) : Math.min(last.low, closeVal)
    const updatedLastCandle: OhlcvCandle = {
      time: last.time,
      bucketStartMs: last.bucketStartMs,
      bucketEndMs: last.bucketEndMs,
      open,
      high,
      low,
      close: closeVal,
      volume: last.volume + tradeVolVal,
      buyVolume: last.buyVolume + (trade.side === 'buy' ? tradeVolVal : 0),
      sellVolume: last.sellVolume + (trade.side === 'sell' ? tradeVolVal : 0),
      volumePls: last.volumePls + trade.pls,
      buyVolumePls: last.buyVolumePls + (trade.side === 'buy' ? trade.pls : 0),
      sellVolumePls: last.sellVolumePls + (trade.side === 'sell' ? trade.pls : 0),
      tradeCount: last.tradeCount + 1,
      isGapFill: false,
    }
    const nextCandles = [...prevCandles.slice(0, -1), updatedLastCandle]
    return {
      mode: 'update',
      candle: updatedLastCandle,
      candlesToApply: [updatedLastCandle],
      candles: nextCandles,
    }
  }

  // Trade starts a new bucket -> append new candle (plus any small gap fills)
  const appended: OhlcvCandle[] = []
  if (fillGaps) {
    const gapCount = Math.round((bStartMs - last.bucketStartMs) / stepMs) - 1
    if (gapCount > 0 && gapCount <= MAX_CONSECUTIVE_GAP_FILL_BUCKETS) {
      const flatVal = last.close
      for (let g = 1; g <= gapCount; g++) {
        const gapMs = last.bucketStartMs + g * stepMs
        appended.push({
          time: Math.floor(gapMs / 1000),
          bucketStartMs: gapMs,
          bucketEndMs: gapMs + stepMs,
          open: flatVal,
          high: flatVal,
          low: flatVal,
          close: flatVal,
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          volumePls: 0,
          buyVolumePls: 0,
          sellVolumePls: 0,
          tradeCount: 0,
          isGapFill: true,
        })
      }
    }
  }

  const openVal = last.close
  const newCandle: OhlcvCandle = {
    time: bTimeSec,
    bucketStartMs: bStartMs,
    bucketEndMs: bStartMs + stepMs,
    open: openVal,
    high: Math.max(openVal, closeVal),
    low: Math.min(openVal, closeVal),
    close: closeVal,
    volume: tradeVolVal,
    buyVolume: trade.side === 'buy' ? tradeVolVal : 0,
    sellVolume: trade.side === 'sell' ? tradeVolVal : 0,
    volumePls: trade.pls,
    buyVolumePls: trade.side === 'buy' ? trade.pls : 0,
    sellVolumePls: trade.side === 'sell' ? trade.pls : 0,
    tradeCount: 1,
    isGapFill: false,
  }
  appended.push(newCandle)

  const nextCandles = [...prevCandles, ...appended]
  return {
    mode: 'append',
    candle: newCandle,
    candlesToApply: appended,
    candles: nextCandles,
  }
}

/**
 * Computes a holder's average entry price in PLS per token on `coin` (or null if they hold <= 0 tokens).
 */
export function computeUserAvgEntryPricePls(
  coin: Pick<Coin, 'trades' | 'holders'> & Partial<Pick<Coin, 'curve'>>,
  username?: string
): number | null {
  if (!username) return null
  const clean = username.replace(/^@/, '').toLowerCase()
  const holderEntry = Object.entries(coin.holders ?? {}).find(([u]) => u.toLowerCase() === clean)
  const heldTokens = holderEntry ? holderEntry[1] : 0
  if (!(heldTokens > 1e-4)) return null

  const chrono = [...(coin.trades ?? [])].reverse()
  let trackedTokens = 0
  let trackedCostPls = 0

  for (const tr of chrono) {
    if (tr.user.toLowerCase() !== clean) continue
    if (tr.side === 'buy' && tr.tokens > 0) {
      trackedTokens += tr.tokens
      trackedCostPls += tr.pls
    } else if (tr.side === 'sell' && trackedTokens > 0) {
      const matched = Math.min(trackedTokens, tr.tokens)
      trackedCostPls = trackedCostPls * Math.max(0, (trackedTokens - matched) / trackedTokens)
      trackedTokens = Math.max(0, trackedTokens - matched)
    }
  }

  if (trackedTokens > 1e-4 && trackedCostPls > 0) {
    return trackedCostPls / trackedTokens
  }
  if (coin.curve) {
    return pricePls(coin.curve) * 0.42
  }
  return null
}

/**
 * Converts a holder's average entry price in PLS per token into the active chart metric ('price' | 'mcap')
 * and currency ('pls' | 'usd').
 */
export function getHolderAvgEntryLineValue(
  coin: Pick<Coin, 'trades' | 'holders'> & Partial<Pick<Coin, 'curve'>>,
  username: string | undefined,
  metric: ChartMetric,
  currency: ChartCurrency,
  plsUsd: number
): number | null {
  const avgPricePls = computeUserAvgEntryPricePls(coin, username)
  if (avgPricePls === null || !(avgPricePls > 0)) return null
  const scaleFactor =
    (metric === 'mcap' ? TOTAL_SUPPLY : 1) * (currency === 'usd' ? plsUsd : 1)
  return avgPricePls * scaleFactor
}

export interface AutoscaleRangeResult {
  priceRange: {
    minValue: number
    maxValue: number
  }
  margins: {
    above: number
    below: number
  }
}

/**
 * Clamps Lightweight Charts autoscale range so `minValue` is NEVER below 0 (`Math.max(0, min)`),
 * and sets `margins.below = 0` so the right price axis never extrapolates into negative values (-$25K, -$50K).
 */
export function clampNonNegativeAutoscale(
  rawRange: { minValue: number; maxValue: number } | null | undefined
): AutoscaleRangeResult | null {
  if (!rawRange) return null
  const rawMin = Number.isFinite(rawRange.minValue) ? rawRange.minValue : 0
  const rawMax = Number.isFinite(rawRange.maxValue) ? rawRange.maxValue : 0
  const minValue = Math.max(0, rawMin)
  const span = Math.max(0, rawMax - minValue)
  const topPad = span > 0 ? span * 0.08 : Math.max(minValue * 0.08, 1e-9)
  const maxValue = Math.max(minValue + 1e-9, rawMax + topPad)
  return {
    priceRange: {
      minValue,
      maxValue,
    },
    margins: {
      above: 10,
      below: 0,
    },
  }
}

export type TradeBubbleActorKind = 'dev' | 'you' | 'following'

export interface ClassifyTradeBubbleOptions {
  launcher: string
  currentUser?: string | null
  following?: readonly string[]
}

/**
 * Classifies a trade's user into `'dev' | 'you' | 'following' | null` (other users ignored).
 * - If `tradeUser` is the current logged-in user (and not the coin launcher, or `currentUser` is trading), returns `'you'`.
 * - If `tradeUser` is the coin launcher (`dev`), returns `'dev'`.
 * - If `tradeUser` is in `following`, returns `'following'`.
 * - Otherwise returns `null` (ignored).
 */
export function classifyTradeBubbleActor(
  tradeUser: string,
  opts: ClassifyTradeBubbleOptions
): TradeBubbleActorKind | null {
  const u = (tradeUser ?? '').trim().replace(/^@/, '').toLowerCase()
  if (!u) return null
  const dev = (opts.launcher ?? '').trim().replace(/^@/, '').toLowerCase()
  const me = (opts.currentUser ?? '').trim().replace(/^@/, '').toLowerCase()

  if (me && u === me && u !== dev) {
    return 'you'
  }
  if (dev && u === dev) {
    return 'dev'
  }
  if (me && u === me) {
    return 'you'
  }
  if (opts.following && opts.following.some((f) => f.trim().replace(/^@/, '').toLowerCase() === u)) {
    return 'following'
  }
  return null
}

export interface ChartTradeBubble {
  id: string
  /** Candle bucket UNIX timestamp in seconds (matches OhlcvCandle.time). */
  candleTime: number
  /** Candle bucket start timestamp in ms. */
  bucketStartMs: number
  actorKind: TradeBubbleActorKind
  side: 'buy' | 'sell'
  user: string
  /** Short badge text inside the 18px circle: 'DB', 'DS', 'YB', 'YS', or 2-letter uppercase initials for followed users. */
  label: string
  /** Background/ring hex color (#22c55e for buy, #ef4444 for sell). */
  color: '#22c55e' | '#ef4444'
  /** Optional avatar/identicon URL for followed users. */
  avatarUrl?: string
  /** Exact y-anchor price/mcap value in the active chart metric & currency (never below candle.low). */
  anchorValue: number
  /** Raw post-trade price in PLS per token. */
  tradePricePls: number
  /** Market cap in USD at the time of the trade. */
  mcapUsdAtTrade: number
  /** Summed token amount in this candle bucket for this user. */
  tokens: number
  /** Summed PLS amount in this candle bucket for this user. */
  pls: number
  /** Summed USD value in this candle bucket for this user. */
  usd: number
  /** Number of trades by this user aggregated into this candle bubble. */
  tradeCount: number
  /** Timestamp (ms) of the latest trade in this bubble. */
  latestTs: number
  /** 0-based vertical stack index on this candle (0, 1, or 2; max 3 visible per candle). */
  stackIndex: number
  /** True if this bubble is within the top 3 visible bubbles on its candle. */
  visible: boolean
  /** If > 0 on the top visible bubble (stackIndex === 2), shows a "+N" pill for extra bubbles on the same candle. */
  overflowCount: number
}

export interface BuildChartTradeBubblesOptions {
  timeframe: ChartTimeframe
  metric?: ChartMetric
  currency?: ChartCurrency
  plsUsd?: number
  curve?: Curve
  recordedCandles?: readonly Candle[]
  candles?: readonly OhlcvCandle[]
  launcher: string
  currentUser?: string | null
  following?: readonly string[]
  showDev?: boolean
  showMe?: boolean
  showFollowing?: boolean
  avatarsByUser?: Record<string, string>
}

/**
 * Builds Padre/Photon-style circular trade bubbles grouped by `(candleTime, user)` on the active timeframe.
 * - Anchors each bubble at `y = tradePrice` in the active chart units (clamped `>= candle.low` so never below the candle low).
 * - Stacks multiple bubbles on the same candle upward with a 2px gap, max 3 visible, then "+N".
 */
export function buildChartTradeBubbles(
  trades: readonly TradeWithOptionalPrice[],
  options: BuildChartTradeBubblesOptions
): ChartTradeBubble[] {
  const {
    timeframe,
    metric = 'mcap',
    currency = 'usd',
    plsUsd = 0.000008,
    curve,
    recordedCandles,
    launcher,
    currentUser,
    following = [],
    showDev = true,
    showMe = true,
    showFollowing = true,
    avatarsByUser,
  } = options

  const ticks = extractTradeTicks(trades, { curve, recordedCandles })
  if (ticks.length === 0) return []

  const candles =
    options.candles ??
    buildOhlcvCandles(trades, {
      timeframe,
      metric,
      currency,
      plsUsd,
      curve,
      recordedCandles,
    })

  const candleByTime = new Map<number, OhlcvCandle>()
  for (const c of candles) {
    candleByTime.set(c.time, c)
  }

  const scaleFactor =
    (metric === 'mcap' ? TOTAL_SUPPLY : 1) * (currency === 'usd' ? plsUsd : 1)

  const grouped = new Map<string, Omit<ChartTradeBubble, 'stackIndex' | 'visible' | 'overflowCount'>>()
  const cleanMe = (currentUser ?? '').trim().replace(/^@/, '').toLowerCase()
  const cleanDev = (launcher ?? '').trim().replace(/^@/, '').toLowerCase()

  // Current market cap in PLS for the 0.5% followed-user significance threshold on 1m/5m
  const currentSpotPls = curve ? pricePls(curve) : ticks[ticks.length - 1].pricePls
  const currentMcapPls = Math.max(0, currentSpotPls * TOTAL_SUPPLY)
  const minFollowedTradePls = currentMcapPls * 0.005

  // Track each user's first buy index and final sell index on this coin
  const firstBuyIdxByUser = new Map<string, number>()
  const finalSellIdxByUser = new Map<string, number>()
  for (let i = 0; i < ticks.length; i++) {
    const u = ticks[i].user.trim().replace(/^@/, '').toLowerCase()
    if (ticks[i].side === 'buy') {
      if (!firstBuyIdxByUser.has(u)) {
        firstBuyIdxByUser.set(u, i)
      }
    } else {
      finalSellIdxByUser.set(u, i)
    }
  }

  const filterSmallFollowedAdds = timeframe === '1m' || timeframe === '5m'

  for (let idx = 0; idx < ticks.length; idx++) {
    const tk = ticks[idx]
    const cleanUser = tk.user.trim().replace(/^@/, '').toLowerCase()
    let actorKind = classifyTradeBubbleActor(tk.user, {
      launcher,
      currentUser,
      following,
    })
    // If the logged-in user IS the coin launcher and executes a live buy/sell after initial launch trades,
    // classify their latest personal trade as 'you' ('B'/'S') when showMe is enabled so manual buys on own coin show B
    if (actorKind === 'dev' && cleanMe && cleanUser === cleanMe && cleanMe === cleanDev && idx > 0 && idx === ticks.length - 1) {
      actorKind = 'you'
    }
    if (!actorKind) continue
    if (actorKind === 'dev' && !showDev) continue
    if (actorKind === 'you' && !showMe) continue
    if (actorKind === 'following' && !showFollowing) continue

    // Followed-user declutter rule on 1m/5m: only show trades worth >= 0.5% of current MC,
    // or the user's first buy / final sell on that coin (hide smaller adds).
    if (actorKind === 'following' && filterSmallFollowedAdds) {
      const isFirstBuy = tk.side === 'buy' && firstBuyIdxByUser.get(cleanUser) === idx
      const isFinalSell = tk.side === 'sell' && finalSellIdxByUser.get(cleanUser) === idx
      const isAtLeastHalfPctMcap = tk.pls >= minFollowedTradePls
      if (!isAtLeastHalfPctMcap && !isFirstBuy && !isFinalSell) {
        continue
      }
    }

    const bucketStartMs = getBucketStartMs(tk.t, timeframe)
    const candleTime = Math.floor(bucketStartMs / 1000)
    const candle = candleByTime.get(candleTime)

    const rawAnchorValue = tk.pricePls * scaleFactor
    const anchorValue = candle ? Math.max(candle.low, rawAnchorValue) : rawAnchorValue
    const mcapUsdAtTrade = tk.pricePls * TOTAL_SUPPLY * plsUsd
    // At most one bubble per user per candle
    const key = `${candleTime}:${cleanUser}`

    const existing = grouped.get(key)
    const side = tk.side
    const color: '#22c55e' | '#ef4444' = side === 'buy' ? '#22c55e' : '#ef4444'
    const label =
      actorKind === 'dev'
        ? side === 'buy'
          ? 'DB'
          : 'DS'
        : actorKind === 'you'
        ? side === 'buy'
          ? 'B'
          : 'S'
        : cleanUser.slice(0, 2).toUpperCase()

    if (!existing) {
      grouped.set(key, {
        id: key,
        candleTime,
        bucketStartMs,
        actorKind,
        side,
        user: tk.user,
        label,
        color,
        avatarUrl: avatarsByUser?.[cleanUser] ?? avatarsByUser?.[tk.user],
        anchorValue,
        tradePricePls: tk.pricePls,
        mcapUsdAtTrade,
        tokens: tk.tokens,
        pls: tk.pls,
        usd: tk.pls * plsUsd,
        tradeCount: 1,
        latestTs: tk.t,
      })
    } else {
      existing.side = side
      existing.label = label
      existing.color = color
      existing.anchorValue = candle ? Math.max(candle.low, rawAnchorValue) : rawAnchorValue
      existing.tradePricePls = tk.pricePls
      existing.mcapUsdAtTrade = mcapUsdAtTrade
      existing.tokens += tk.tokens
      existing.pls += tk.pls
      existing.usd += tk.pls * plsUsd
      existing.tradeCount += 1
      existing.latestTs = Math.max(existing.latestTs, tk.t)
    }
  }

  // Group by candleTime so we can assign stackIndex (0..2, max 3 visible) and "+N" overflowCount
  const byCandle = new Map<number, Array<Omit<ChartTradeBubble, 'stackIndex' | 'visible' | 'overflowCount'>>>()
  for (const b of grouped.values()) {
    const arr = byCandle.get(b.candleTime) ?? []
    arr.push(b)
    byCandle.set(b.candleTime, arr)
  }

  const priorityOrder: Record<TradeBubbleActorKind, number> = {
    you: 0,
    dev: 1,
    following: 2,
  }

  const result: ChartTradeBubble[] = []
  for (const [, list] of byCandle.entries()) {
    list.sort((a, b) => {
      if (priorityOrder[a.actorKind] !== priorityOrder[b.actorKind]) {
        return priorityOrder[a.actorKind] - priorityOrder[b.actorKind]
      }
      return a.latestTs - b.latestTs
    })
    const overflow = Math.max(0, list.length - 3)
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      result.push({
        ...item,
        stackIndex: Math.min(i, 2),
        visible: i < 3,
        overflowCount: i === 2 ? overflow : 0,
      })
    }
  }

  return result.sort((a, b) => (a.candleTime !== b.candleTime ? a.candleTime - b.candleTime : a.stackIndex - b.stackIndex))
}
