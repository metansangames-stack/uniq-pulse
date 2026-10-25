/**
 * uniq.pulse curve + fee math. Pure functions, no I/O. Every number follows PRODUCT_BRIEF.md.
 *
 * Constant-product curve with virtual reserves (Pump.fun shape, quoted in PLS):
 *   (V0 + reservePls) * (T0 - tokensSold) = K
 * T0 = 1,073,000,000 virtual tokens. V0 is derived so selling 793,100,000 tokens deposits
 * exactly 200,000,000 PLS of real reserve: V0 = 200M * (T0 - 793.1M) / 793.1M ≈ 70,583,785 PLS.
 */

export const TOTAL_SUPPLY = 1_000_000_000
export const CURVE_TOKENS = 793_100_000
export const LP_TOKENS = TOTAL_SUPPLY - CURVE_TOKENS // 206,900,000 reserved for graduated PulseX pool
export const GRAD_PLS = 200_000_000
export const T0 = 1_073_000_000
export const T1 = T0 - CURVE_TOKENS // 279,900,000 tokens left (virtual) at graduation
export const V0 = (GRAD_PLS * T1) / CURVE_TOKENS
export const K = V0 * T0
export const FEE_RATE = 0.0125
/**
 * Total Curve Trading Fee = 1.25% (0.0125):
 *  - 0.50% (40% of 1.25% total fee) -> Platform Developer (@uniq_pulse) in USDC/PLS
 *  - 0.50% (40% of 1.25% total fee) -> Token Holders Rewards Pool (PLS), locked in curve & claimable in profile ONLY after 200M PLS migration!
 *  - 0.25% (20% of 1.25% total fee) -> Coin Creator (@launcher) Rewards Pool (PLS), locked in curve & claimable ONLY after 200M PLS migration!
 * Creation / Launch Fee (500,000 PLS) goes 100% to the Platform Developer (@uniq_pulse).
 */
export const TOTAL_CURVE_FEE_RATE = 0.0125
export const PLATFORM_CURVE_FEE_RATE = 0.005
export const HOLDER_CURVE_FEE_RATE = 0.005
export const DEV_CURVE_FEE_RATE = 0.0025
/** Post-migration PulseX V2 LP provider fee share (0.22% = 0.0022), accrued into unharvestedLpFeesPls and split 40% holders / 20% creator / 40% platform on harvest. FEE_RATE (1.25%) applies to bonding-curve trades only. */
export const POST_MIGRATION_LP_FEE = 0.0022
export const POST_MIGRATION_FEE_RATE = POST_MIGRATION_LP_FEE
export const POST_MIGRATION_PLATFORM_RATE = POST_MIGRATION_LP_FEE * 0.4
export const POST_MIGRATION_HOLDER_RATE = POST_MIGRATION_LP_FEE * 0.4
/** Graduation Fee at 200M PLS bond (2% = 4,000,000 PLS): 2,000,000 PLS to @uniq_pulse, 1,500,000 PLS to Long-Term Holders Pool, 500,000 PLS to Coin Creator. */
export const GRADUATION_FEE_PLS = 4_000_000
export const GRADUATION_PLATFORM_PLS = 2_000_000
export const GRADUATION_HOLDER_PLS = 1_500_000
export const GRADUATION_DEV_PLS = 500_000
/** Net PLS seeded into PulseX LP after deducting the 4,000,000 PLS (2%) graduation fee from the 200,000,000 PLS curve reserve. */
export const GRAD_LP_PLS = GRAD_PLS - GRADUATION_FEE_PLS // 196,000,000 PLS
/** Spot price in PLS per token at the exact moment the curve reaches 200,000,000 PLS reserve. */
export const LAST_CURVE_PRICE_PLS = (V0 + GRAD_PLS) / (T0 - CURVE_TOKENS)
/** Tokens paired with 196,000,000 PLS so the PulseX opening price equals LAST_CURVE_PRICE_PLS (~202,747,953.50 tokens). */
export const GRAD_LP_TOKENS = GRAD_LP_PLS / LAST_CURVE_PRICE_PLS
/** Leftover LP reserve tokens (~4,152,046.50 tokens) burned at graduation so PulseX opening price matches the final curve price. */
export const GRAD_BURNED_TOKENS = LP_TOKENS - GRAD_LP_TOKENS
/** Spend that lands exactly GRAD_PLS in an empty curve after the 1.25% fee = 200,000,000 / 0.9875 ≈ 202,531,645.57 PLS. */
export const FILL_PLS = GRAD_PLS / (1 - FEE_RATE)
/** Launch deployment fee (like pump.tires) routed 100% to @uniq_pulse. */
export const LAUNCH_FEE_PLS = 500_000
/** Graduation creator bonus (500,000 PLS from the 4M PLS graduation fee) + 1 Free Next-Launch Pass awarded to the dev when their coin bonds at 200M PLS. */
export const MIGRATION_DEV_BONUS_PLS = 500_000
/** Autonomous DexScreener Enhanced Token Info ($299 USD — payable via PulseChain PLS/USDC or Solana Phantom SOL/USDC). No free cash rebates paid out by the platform. */
export const DEX_PREPAY_USD = 299
export const DEX_PREPAY_GRAD_REBATE_USD = 0
export const DEX_PREPAY_GRAD_BURN_USD = 0
/** Browser play-money desk account. */
export const DESK_START_PLS = 1_000_000_000
/**
 * 1.25% curve fee split (out of the total 1.25% fee = 100% of feePls):
 *  - 40% of 1.25% (= 0.50% of trade) -> Platform (@uniq_pulse)
 *  - 40% of 1.25% (= 0.50% of trade) -> Coin Holder Pool (PLS)
 *  - 20% of 1.25% (= 0.25% of trade) -> Coin Creator Pool (PLS)
 */
export const SPLIT = { platform: 0.4, holders: 0.4, creator: 0.2 } as const

const EPS = 1e-6

export interface GraduationSplit {
  feePls: number
  platformPls: number
  holdersPls: number
  creatorPls: number
}

export interface Curve {
  reservePls: number
  tokensSold: number
  graduated: boolean
  /** Post-graduation PulseX AMM pool reserves (initialized to 196M PLS + ~202.75M tokens on migration) */
  dexPls?: number
  dexTokens?: number
  /** Leftover tokens (~4.15M) burned at graduation so PulseX opening price matches the last curve price. */
  burnedTokens?: number
  /** Timestamp when the coin graduated to PulseX. */
  graduatedAt?: number
  /** Breakdown of the 4,000,000 PLS graduation fee deducted from the 200M reserve. */
  graduationSplit?: GraduationSplit
}

export const newCurve = (): Curve => ({ reservePls: 0, tokensSold: 0, graduated: false })

/** Spot price in PLS per token (uses PulseX AMM pool reserves once graduated). */
export const pricePls = (c: Curve) => {
  if (c.graduated && c.dexPls && c.dexTokens) {
    return c.dexPls / c.dexTokens
  }
  return (V0 + c.reservePls) / (T0 - c.tokensSold)
}

/** Market cap = latest price × all 1B tokens. */
export const mcapPls = (c: Curve) => pricePls(c) * TOTAL_SUPPLY
/** Market cap in USD at the given PLS price. This is what the UI shows. */
export const mcapUsd = (c: Curve, plsUsd: number) => mcapPls(c) * plsUsd

/** 0..1 progress toward graduation. */
export const progress = (c: Curve) => Math.min(1, c.reservePls / GRAD_PLS)

export const plsToUsd = (pls: number, plsUsd: number) => pls * plsUsd

export interface FeeSplit {
  feePls: number
  platformPls: number // 40% of 1.25% fee (0.50% of trade) -> @uniq_pulse platform
  holdersPoolPls: number // 40% of 1.25% fee (0.50% of trade) -> coin holder pool
  creatorPoolPls: number // 20% of 1.25% fee (0.50% of trade) -> coin creator pool
  totalPaidOutPls: number // platformPls + holdersPoolPls + creatorPoolPls (== feePls)
  platformUsd: number // USD value of platform share
}

export interface CurveFeeBreakdown {
  totalFeePls: number // 1.25% of trade PLS
  platformPls: number // 0.50% to @uniq_pulse
  platformUsd: number
  holdersPoolPls: number // 0.50% to this coin's Token Holders Rewards Pool (unlocks at 200M PLS migration)
  launcherPoolPls: number // 0.25% to this coin's Creator Rewards Pool (unlocks at 200M PLS migration)
}

/**
 * Spoof-proof 1.25% curve trading fee breakdown:
 * 40% platform (0.50% of trade) / 40% coin holder pool (0.50% of trade) / 20% coin creator pool (0.25% of trade).
 */
export function splitCurveTradeFee(tradePls: number, plsUsd = 0.000008): CurveFeeBreakdown {
  const feePls = tradePls * TOTAL_CURVE_FEE_RATE
  const s = splitFee(feePls, plsUsd)
  return {
    totalFeePls: s.feePls,
    platformPls: s.platformPls,
    platformUsd: s.platformUsd,
    holdersPoolPls: s.holdersPoolPls,
    launcherPoolPls: s.creatorPoolPls,
  }
}

export function splitFee(feePls: number, plsUsd = 0.000008): FeeSplit {
  if (!(plsUsd > 0) || plsUsd >= 1) throw new Error('Refusing to price PLS at $1 or more; check PLS_USD.')
  const platformPls = feePls * SPLIT.platform
  const holdersPoolPls = feePls * SPLIT.holders
  const creatorPoolPls = feePls - platformPls - holdersPoolPls
  return {
    feePls,
    platformPls,
    holdersPoolPls,
    creatorPoolPls,
    totalPaidOutPls: platformPls + holdersPoolPls + creatorPoolPls,
    platformUsd: platformPls * plsUsd,
  }
}

export interface BuyQuote {
  ok: boolean
  error?: string
  spend: number // PLS actually spent (may be less than requested if it would overfill)
  fee: number
  net: number // PLS that enters the curve
  tokens: number
  graduates: boolean
  refunded: number
  priceImpactPct: number
  minReceivedTokens: number
}

export interface BuyOpts {
  /** Slippage tolerance in percent (e.g. 0.5, 1, 3). Defaults to 1%. */
  slippagePct?: number
}

/** Max spend (incl. fee) that fills the curve exactly. */
export const spendToFill = (c: Curve) => Math.max(0, (GRAD_PLS - c.reservePls) / (1 - FEE_RATE))

export function quoteBuy(c: Curve, spendRequested: number, opts: BuyOpts = {}): BuyQuote {
  const fail = (error: string): BuyQuote => ({
    ok: false,
    error,
    spend: 0,
    fee: 0,
    net: 0,
    tokens: 0,
    graduates: false,
    refunded: 0,
    priceImpactPct: 0,
    minReceivedTokens: 0,
  })
  if (!(spendRequested > 0)) return fail('Enter a PLS amount.')
  const slip = Math.max(0, Math.min(99.9, opts.slippagePct ?? 1))

  // Post-graduation: trade stays live on uniq.pulse, routed through the migrated PulseX AMM pool!
  // FEE_RATE (1.25%) applies to bonding-curve trades only; post-migration trades accrue only POST_MIGRATION_LP_FEE.
  if (c.graduated) {
    const dexPls = c.dexPls ?? GRAD_LP_PLS
    const dexTokens = c.dexTokens ?? GRAD_LP_TOKENS
    const spotBefore = dexPls / dexTokens
    const spend = spendRequested
    const fee = spend * POST_MIGRATION_LP_FEE
    const net = spend - fee
    const kDex = dexPls * dexTokens
    const newDexPls = dexPls + net
    const newDexTokens = kDex / newDexPls
    const tokens = dexTokens - newDexTokens
    if (!(tokens > 0)) return fail('Amount too small.')
    const avgExecPrice = net / tokens
    const priceImpactPct = spotBefore > 0 ? Math.max(0, (avgExecPrice / spotBefore - 1) * 100) : 0
    const minReceivedTokens = tokens * (1 - slip / 100)
    return { ok: true, spend, fee, net, tokens, graduates: false, refunded: 0, priceImpactPct, minReceivedTokens }
  }

  const spotBefore = pricePls(c)
  const spend = Math.min(spendRequested, spendToFill(c))
  const fee = spend * FEE_RATE
  let net = spend - fee
  let reserve = c.reservePls + net
  if (reserve > GRAD_PLS - EPS) {
    reserve = GRAD_PLS
    net = GRAD_PLS - c.reservePls
  }
  const tokensLeftAfter = K / (V0 + reserve)
  const tokens = T0 - c.tokensSold - tokensLeftAfter
  if (!(tokens > 0)) return fail('Amount too small.')
  const avgExecPrice = net / tokens
  const priceImpactPct = spotBefore > 0 ? Math.max(0, (avgExecPrice / spotBefore - 1) * 100) : 0
  const minReceivedTokens = tokens * (1 - slip / 100)
  return {
    ok: true,
    spend,
    fee,
    net,
    tokens,
    graduates: reserve >= GRAD_PLS - EPS,
    refunded: spendRequested - spend,
    priceImpactPct,
    minReceivedTokens,
  }
}

export function applyBuy(c: Curve, q: BuyQuote, now = Date.now()): Curve {
  if (!q.ok) return c
  if (c.graduated) {
    const dexPls = (c.dexPls ?? GRAD_LP_PLS) + q.net
    const dexTokens = Math.max(1, (c.dexTokens ?? GRAD_LP_TOKENS) - q.tokens)
    return { ...c, dexPls, dexTokens }
  }
  const reservePls = q.graduates ? GRAD_PLS : c.reservePls + q.net
  return {
    reservePls,
    tokensSold: q.graduates ? CURVE_TOKENS : c.tokensSold + q.tokens,
    graduated: q.graduates,
    ...(q.graduates
      ? {
          dexPls: GRAD_LP_PLS,
          dexTokens: GRAD_LP_TOKENS,
          burnedTokens: GRAD_BURNED_TOKENS,
          graduatedAt: now,
          graduationSplit: {
            feePls: GRADUATION_FEE_PLS,
            platformPls: GRADUATION_PLATFORM_PLS,
            holdersPls: GRADUATION_HOLDER_PLS,
            creatorPls: GRADUATION_DEV_PLS,
          },
        }
      : {}),
  }
}

export interface SellQuote {
  ok: boolean
  error?: string
  tokens: number
  gross: number
  fee: number
  plsOut: number
  priceImpactPct: number
  minReceivedPls: number
}

export interface SellOpts {
  /** Slippage tolerance in percent (e.g. 0.5, 1, 3). Defaults to 1%. */
  slippagePct?: number
}

export function quoteSell(c: Curve, tokens: number, held: number, opts: SellOpts = {}): SellQuote {
  const fail = (error: string): SellQuote => ({
    ok: false,
    error,
    tokens: 0,
    gross: 0,
    fee: 0,
    plsOut: 0,
    priceImpactPct: 0,
    minReceivedPls: 0,
  })
  if (!(tokens > 0)) return fail('Enter a token amount.')
  if (tokens > held + EPS) return fail("You don't hold that many.")
  const slip = Math.max(0, Math.min(99.9, opts.slippagePct ?? 1))

  // Post-graduation: sell stays live on uniq.pulse, routed through the migrated PulseX AMM pool!
  // FEE_RATE (1.25%) applies to bonding-curve trades only; post-migration trades accrue only POST_MIGRATION_LP_FEE.
  if (c.graduated) {
    const dexPls = c.dexPls ?? GRAD_LP_PLS
    const dexTokens = c.dexTokens ?? GRAD_LP_TOKENS
    const spotBefore = dexPls / dexTokens
    const kDex = dexPls * dexTokens
    const newDexTokens = dexTokens + tokens
    const newDexPls = kDex / newDexTokens
    const gross = dexPls - newDexPls
    if (!(gross > 0) || gross > dexPls + EPS) return fail("The pool can't pay that sell.")
    const fee = gross * POST_MIGRATION_LP_FEE
    const plsOut = gross - fee
    const avgExecPrice = gross / tokens
    const priceImpactPct = spotBefore > 0 ? Math.max(0, Math.abs(avgExecPrice / spotBefore - 1) * 100) : 0
    const minReceivedPls = plsOut * (1 - slip / 100)
    return { ok: true, tokens, gross, fee, plsOut, priceImpactPct, minReceivedPls }
  }

  const spotBefore = pricePls(c)
  const virtualPls = V0 + c.reservePls
  const tokensLeftAfter = T0 - c.tokensSold + tokens
  const gross = virtualPls - K / tokensLeftAfter
  if (!(gross > 0) || gross > c.reservePls + EPS) return fail("The curve can't pay that sell.")
  const fee = gross * FEE_RATE
  const plsOut = gross - fee
  const avgExecPrice = gross / tokens
  const priceImpactPct = spotBefore > 0 ? Math.max(0, Math.abs(avgExecPrice / spotBefore - 1) * 100) : 0
  const minReceivedPls = plsOut * (1 - slip / 100)
  return { ok: true, tokens, gross, fee, plsOut, priceImpactPct, minReceivedPls }
}

export function applySell(c: Curve, q: SellQuote): Curve {
  if (!q.ok) return c
  if (c.graduated) {
    const dexPls = Math.max(1, (c.dexPls ?? GRAD_LP_PLS) - q.gross)
    const dexTokens = (c.dexTokens ?? GRAD_LP_TOKENS) + q.tokens
    return { ...c, dexPls, dexTokens }
  }
  return { reservePls: Math.max(0, c.reservePls - q.gross), tokensSold: Math.max(0, c.tokensSold - q.tokens), graduated: false }
}

/* ------------------------------------------------------------------ */
/* Formatting — plain words, plain numbers                             */
/* ------------------------------------------------------------------ */

/** Plain full dollars for chart axes and market caps: "$7,734". Never K/M, never scientific notation. */
export function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 100) return sign + '$' + Math.round(a).toLocaleString('en-US')
  if (a >= 1) return sign + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return sign + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

/** Full PLS/token amounts with commas: "202,020,202". */
export function fmtNum(v: number, maxDecimals = 0): string {
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', { maximumFractionDigits: maxDecimals })
}

/** Small prices like 0.000000123 without scientific notation. */
export function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return v.toLocaleString('en-US', { maximumSignificantDigits: 4, maximumFractionDigits: 12 })
}
