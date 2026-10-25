/**
 * Browser-only demo state (localStorage) + Phase 2 live PLS/USD price & PulseChain wallet read hooks
 * + Pump.fun-style Live Action stream & multi-project dev support.
 * No real funds move, no private keys, nothing signed. All math is delegated to ../lib/model.ts.
 */
import { useSyncExternalStore } from 'react'
import { PLATFORM_USERNAME, PLATFORM_WALLET, PLS_USD, STORAGE_KEY } from '../config'
import { validateAntiReplica, validateUsername, type Registered } from '../lib/usernames'
import { defaultPriceSource, DEFAULT_ETH_USD, DEFAULT_SOL_USD } from '../lib/price'
import { discoverEvmWallets, fetchPulseChainBalance, isValidChecksumAddress, readEvmChainId, toChecksumAddress } from '../lib/wallets'
import {
  DESK_START_PLS, DEX_PREPAY_USD, FEE_RATE, FILL_PLS, GRAD_BURNED_TOKENS, GRAD_LP_PLS, GRAD_LP_TOKENS, GRAD_PLS, GRADUATION_DEV_PLS, GRADUATION_FEE_PLS, GRADUATION_HOLDER_PLS, GRADUATION_PLATFORM_PLS, LAUNCH_FEE_PLS, MIGRATION_DEV_BONUS_PLS, POST_MIGRATION_LP_FEE, TOTAL_SUPPLY,
  applyBuy, applySell, fmtUsd, newCurve,
  pricePls, quoteBuy, quoteSell, splitFee, mcapUsd, type Curve,
} from '../lib/model'
import { computeCoinTradesWithPnl, fmtHoldDuration } from '../lib/pnl'
import {
  DAY_MS,
  MAX_DEV_LOCK_DAYS,
  MAX_DEV_LOCKS_PER_COIN,
  MIN_DEV_LOCK_DAYS,
  computeLockBoostWeight,
  getActiveDevLocks,
  getEffectiveLockStatus,
  getLockBoostWeightAt,
  getLockedDevTokens,
  isLockActiveAt,
  type DevLock,
  type WalletFundingLink,
} from '../lib/reputation'

export type DexPayMethod = 'pls' | 'sol' | 'usdc_sol' | 'usdc_pls'

export interface Candle { t: number; o: number; c: number }
export interface Trade { t: number; side: 'buy' | 'sell'; user: string; tokens: number; pls: number; pricePls?: number }
export interface CoinComment {
  id: string
  t: number
  user: string
  text: string
}
export interface LiveEvent {
  id: string
  t: number
  kind: 'buy' | 'sell' | 'launch' | 'migrate'
  user: string
  ticker: string
  pls: number
  tokens: number
  mcapUsd: number
}
export interface Coin {
  ticker: string
  name: string
  story: string
  launcher: string
  createdAt: number
  curve: Curve
  candles: Candle[] // values are market cap in USD at the time of the trade
  trades: Trade[]
  holders: Record<string, number>
  openingSpent: Record<string, number>
  demo: boolean
  logoUrl?: string
  bannerUrl?: string
  xUrl?: string
  websiteUrl?: string
  comments?: CoinComment[]
  /** Whether $299 DexScreener Enhanced Token Info was paid via the autonomous relay. */
  dexPrepaid?: boolean
  dexPrepaidBy?: string
  dexPrepaidAt?: number
  dexPaymentMethod?: DexPayMethod
  dexGradBoostApplied?: boolean
  burnedSupplyTokens?: number
  /** 0.50% Curve + Graduation + Post-Migration Locked-LP Holder Rewards Pool (PLS). */
  holderRewardPoolPls?: number
  /** Post-migration Locked-LP & Router Swap Fees accumulated after 200M PLS bond (PLS). */
  postMigrationLpFeesPls?: number
  /** 0.25% PLS Coin Creator Rewards Pool accumulated from curve trades + graduation (unlocks ONLY after 200M PLS migration!). */
  devRewardPoolPls?: number
  /** Tracks PLS holder rewards already claimed per @username after migration. */
  claimedHolderRewards?: Record<string, number>
  /** Tracks PLS creator rewards already claimed per @username after migration. */
  claimedCreatorRewards?: Record<string, number>
  /** Unharvested LP vault fees waiting for RewardsRouter.harvestVault() when canHarvest() is true. */
  unharvestedLpFeesPls?: number
  /** Platform (40%) share of curve + harvested vault fees accumulated from this coin (PLS). */
  platformFeePls?: number
  /** Per-source holder reward counters (PLS): 0.50% curve / 1.5M migration / 40% harvested LP. */
  holderCurvePls?: number
  holderMigrationPls?: number
  holderLpPls?: number
  /** Per-source creator reward counters (PLS): 0.25% curve / 0.5M migration / 20% harvested LP. */
  creatorCurvePls?: number
  creatorMigrationPls?: number
  creatorLpPls?: number
  /** Per-source platform fee counters (PLS): 0.50% curve / 2M migration / 40% harvested LP. */
  platformCurvePls?: number
  platformMigrationPls?: number
  platformLpPls?: number
  /** Cumulative pre-migration bonding curve volume (PLS) and post-migration PulseX volume (PLS). */
  curveVolumePls?: number
  pulsexVolumePls?: number
  /** Timestamp when the coin graduated to PulseX (200M PLS bond). */
  graduatedAt?: number
  /** Tracks users who sold/dumped and forfeited their unclaimed Holder Pool share back to remaining Diamond-Hands holders. */
  forfeitedHolders?: Record<string, boolean>
  /** Whether the coin creator has claimed their 0.25% curve fee pool after migration. */
  devRewardClaimed?: boolean
  /** Whether @uniq_pulse Platform Dev sponsored a DexScreener Ad Campaign & 500x Golden Boost on this coin. */
  adBoosted?: boolean
  adBoostedAt?: number
  /** Whether @uniq_pulse Platform Dev pinned this coin as an Official Platform Dev Pick. */
  devPick?: boolean
  /** Total PLS manually contributed to this coin by @uniq_pulse from claimed Platform Dev rewards. */
  devContributedPls?: number
  /** Audit log of @uniq_pulse Platform Dev manual contributions to this coin. */
  devActionsLog?: Array<{ id: string; t: number; action: string; plsSpent: number; usdSpent: number }>
  /** Snapshot of holder token balances at the exact graduation moment (for the 1.5M PLS graduation holder bonus). */
  graduationBalances?: Record<string, number>
  /** HEX-style dev staking ladder locks (up to 10 locks per coin, 1-5555 days). */
  devLocks?: DevLock[]
  /** Permanent red flag if the dev ever early-unlocked (broke) a lock on this coin. */
  devBrokeLock?: boolean
  /** Total PLS rewards forfeited by broken dev locks on this coin (redistributed pro-rata to current holders). */
  forfeitedLockRewardsPls?: number
  /** Optional explicit list of bundled buyer usernames/wallets detected at launch. */
  bundledUsers?: string[]
  /** Timestamped log of post-migration LP vault harvests for time-accurate dev lock boost accounting. */
  lpHarvests?: Array<{ t: number; holderPls: number }>
}
export interface Username {
  name: string
  wallet: string
  walletSource: 'connected' | 'demo'
  issuedAt: number
  launched: string | null
  launchedTickers?: string[]
  xHandle?: string
}
export interface Treasury {
  feesPls: number
  usdcToDev: number
  launchFeesPls?: number
  migrationBonusesPaidPls?: number
}
export interface State {
  v: 1
  pls: number
  plsUsd: number
  solUsd?: number
  ethUsd?: number
  plsChange24h?: number
  solChange24h?: number
  ethChange24h?: number
  plsPriceSource: 'live' | 'fallback'
  liveActionEnabled: boolean
  lastLiveEvent: LiveEvent | null
  liveFeed: LiveEvent[]
  username: Username | null
  /** Demo username registry: name ↔ exactly one wallet. The platform account is reserved, not pre-registered. */
  registry: Registered[]
  /** Optional privacy-preserving X (Twitter) handle verification per @username (keeps 0x wallet hidden). Immutable once bound! */
  verifiedX: Record<string, string>
  /** Permanent numeric X (Twitter) user ID bound to @username so renamed/recycled X accounts are detected & blocked. */
  verifiedXId?: Record<string, string>
  /** Free next-launch passes earned by graduating a coin at 200M PLS (waives the 500,000 PLS launch fee). */
  freeLaunchPasses: Record<string, number>
  /** 10% migration bonus (50,000 PLS per graduated coin) earned from the launch fee pool without touching token LP. */
  migrationBonusEarned: Record<string, number>
  coins: Coin[]
  treasury: Treasury
  phantom: string | null
  evm: string | null
  evmLabel: string | null
  evmChainId: number | null
  realPlsBalance: number | null
  /** Total 0.50% Platform Dev Vault PLS claimed by @uniq_pulse into their active spendable balance. */
  claimedPlatformDevPls?: number
  /** Total claimed Platform Dev PLS spent by @uniq_pulse on ecosystem token contributions (DEX, Ads, Buyback/Burn, Holder Pool). */
  spentPlatformDevClaimsPls?: number
  /** Custom profile avatar, banner image URL, and unlocked achievement banner preset per @username (lowercase key). */
  userProfiles?: Record<string, { avatarUrl?: string; bannerUrl?: string; bannerPreset?: string }>
  /** Wallet funding graph links (from -> to) for bundle & linked-wallet rug flag detection. */
  walletFundingLinks?: WalletFundingLink[]
  /** Optional creation timestamps per username/wallet for wallet age calculation. */
  walletCreatedAt?: Record<string, number>
  /** Who each wallet follows: Record<walletAddress, string[]> (lowercase usernames followed). */
  follows?: Record<string, string[]>
}

type Result = { error?: string; info?: string }

/* ---------------- seed (deterministic demo coins, no fees routed) ---------------- */

const DEMO_COINS: [string, string, string, number][] = [
  ['Harbor Bell', 'BELL', 'A dock bell that only rings once.', 24_000_000],
  ['North Acre', 'ACRE', 'Open ground. No second plot with the same name.', 60_000_000],
  ['Lantern Row', 'LANT', 'One lantern per street. Copies stay dark.', 12_000_000],
  ['Clearwater', 'CLRW', 'You can see the curve. You cannot see who to follow.', 200_000_000],
  ['Kindling', 'KIND', 'A small fire, made harder to bundle.', 8_000_000],
  ['Goldthread', 'THRD', 'Stitched once. The ticker is retired after.', 90_000_000],
]
const DEMO_USERS = ['gainzee', 'harbor', 'pls_maxi', 'trench_rat', 'solana_refugee', 'violet', 'quietbuyer', 'nightowl', 'pulsepilled', 'kettle', 'driftwood', 'ember', 'saltmarsh', 'lowcap_lou', 'patience', 'graybeard', 'sunday', 'tidewater', 'copper', 'moss', 'cinder']

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function emptyCoin(name: string, ticker: string, story: string, launcher: string, t: number, demo: boolean): Coin {
  const launchMcap = mcapUsd(newCurve(), PLS_USD)
  return {
    ticker,
    name,
    story,
    launcher,
    createdAt: t,
    curve: newCurve(),
    candles: [{ t, o: launchMcap, c: launchMcap }],
    trades: [],
    holders: {},
    openingSpent: {},
    demo,
    comments: [],
    burnedSupplyTokens: 0,
    holderRewardPoolPls: 0,
    postMigrationLpFeesPls: 0,
    devRewardPoolPls: 0,
    unharvestedLpFeesPls: 0,
    platformFeePls: 0,
    holderCurvePls: 0,
    holderMigrationPls: 0,
    holderLpPls: 0,
    creatorCurvePls: 0,
    creatorMigrationPls: 0,
    creatorLpPls: 0,
    platformCurvePls: 0,
    platformMigrationPls: 0,
    platformLpPls: 0,
    curveVolumePls: 0,
    pulsexVolumePls: 0,
    claimedHolderRewards: {},
    devRewardClaimed: false,
  }
}

function record(
  coin: Coin,
  before: number,
  t: number,
  trade: Trade,
  plsUsd = PLS_USD,
  wasGraduatedBeforeTrade = false,
  explicitFeePls?: number
) {
  const postSpotPls = pricePls(coin.curve)
  const enrichedTrade: Trade =
    trade.pricePls !== undefined && trade.pricePls > 0
      ? trade
      : { ...trade, pricePls: postSpotPls }
  coin.candles = coin.candles.concat({ t, o: before, c: mcapUsd(coin.curve, plsUsd) }).slice(-2000)
  coin.trades = [enrichedTrade, ...coin.trades].slice(0, 600)

  if (wasGraduatedBeforeTrade) {
    // Post-migration PulseX trade: do NOT charge the 1.25% curve FEE_RATE.
    // Accrue only POST_MIGRATION_LP_FEE (the PulseX V2 LP fee share) into unharvestedLpFeesPls.
    coin.pulsexVolumePls = (coin.pulsexVolumePls ?? 0) + trade.pls
    const lpFeePls =
      explicitFeePls !== undefined
        ? explicitFeePls
        : trade.side === 'buy'
        ? trade.pls * POST_MIGRATION_LP_FEE
        : (trade.pls / (1 - POST_MIGRATION_LP_FEE)) * POST_MIGRATION_LP_FEE
    coin.unharvestedLpFeesPls = (coin.unharvestedLpFeesPls ?? 0) + lpFeePls
    coin.postMigrationLpFeesPls = (coin.postMigrationLpFeesPls ?? 0) + lpFeePls
  } else {
    // Pre-migration curve trade: 1.25% FEE_RATE splits 40% platform / 40% coin holder pool / 20% coin creator pool
    coin.curveVolumePls = (coin.curveVolumePls ?? 0) + trade.pls
    const feePls =
      explicitFeePls !== undefined
        ? explicitFeePls
        : trade.side === 'buy'
        ? trade.pls * FEE_RATE
        : (trade.pls / (1 - FEE_RATE)) * FEE_RATE
    const f = splitFee(feePls, plsUsd)
    coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + f.holdersPoolPls
    coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + f.creatorPoolPls
    coin.platformFeePls = (coin.platformFeePls ?? 0) + f.platformPls
    coin.holderCurvePls = (coin.holderCurvePls ?? 0) + f.holdersPoolPls
    coin.creatorCurvePls = (coin.creatorCurvePls ?? 0) + f.creatorPoolPls
    coin.platformCurvePls = (coin.platformCurvePls ?? 0) + f.platformPls
  }
}

export interface CoinFeeSourceBreakdown {
  holderCurvePls: number
  holderMigrationPls: number
  holderLpPls: number
  creatorCurvePls: number
  creatorMigrationPls: number
  creatorLpPls: number
  platformCurvePls: number
  platformMigrationPls: number
  platformLpPls: number
  curveVolumePls: number
  pulsexVolumePls: number
}

/**
 * Reconciles and backfills per-source fee & volume counters on a Coin so that:
 * - holderCurvePls + holderMigrationPls + holderLpPls === holderRewardPoolPls
 * - creatorCurvePls + creatorMigrationPls + creatorLpPls === devRewardPoolPls
 * - platformCurvePls + platformMigrationPls + platformLpPls === platformFeePls
 * - curveVolumePls (before migration) and pulsexVolumePls (after migration) are tracked separately.
 */
export function resolveCoinFeeSources(c: Coin): CoinFeeSourceBreakdown {
  const isGrad = Boolean(c.curve?.graduated)
  const gradTs = c.graduatedAt ?? c.curve?.graduatedAt

  let curveVolumePls = c.curveVolumePls
  let pulsexVolumePls = c.pulsexVolumePls
  if (curveVolumePls === undefined || pulsexVolumePls === undefined) {
    if (!isGrad) {
      curveVolumePls = (c.trades ?? []).reduce((s, tr) => s + tr.pls, 0)
      pulsexVolumePls = 0
    } else if (gradTs !== undefined) {
      curveVolumePls = (c.trades ?? []).filter((tr) => tr.t <= gradTs).reduce((s, tr) => s + tr.pls, 0)
      pulsexVolumePls = (c.trades ?? []).filter((tr) => tr.t > gradTs).reduce((s, tr) => s + tr.pls, 0)
    } else {
      const totalVol = (c.trades ?? []).reduce((s, tr) => s + tr.pls, 0)
      curveVolumePls = Math.min(totalVol, FILL_PLS)
      pulsexVolumePls = Math.max(0, totalVol - curveVolumePls)
    }
  }

  const harvestedLpTotal = Math.max(0, (c.postMigrationLpFeesPls ?? 0) - (c.unharvestedLpFeesPls ?? 0))
  const lpSplit = splitFee(harvestedLpTotal, PLS_USD)

  const totalHolder = Math.max(0, c.holderRewardPoolPls ?? 0)
  let holderCurvePls = c.holderCurvePls ?? 0
  let holderMigrationPls = c.holderMigrationPls ?? 0
  let holderLpPls = c.holderLpPls ?? 0
  if (Math.abs(holderCurvePls + holderMigrationPls + holderLpPls - totalHolder) > 1e-4) {
    holderMigrationPls = isGrad && totalHolder >= GRADUATION_HOLDER_PLS ? GRADUATION_HOLDER_PLS : 0
    holderLpPls = Math.min(Math.max(0, totalHolder - holderMigrationPls), lpSplit.holdersPoolPls)
    holderCurvePls = Math.max(0, totalHolder - holderMigrationPls - holderLpPls)
  }

  const totalCreator = Math.max(0, c.devRewardPoolPls ?? 0)
  let creatorCurvePls = c.creatorCurvePls ?? 0
  let creatorMigrationPls = c.creatorMigrationPls ?? 0
  let creatorLpPls = c.creatorLpPls ?? 0
  if (Math.abs(creatorCurvePls + creatorMigrationPls + creatorLpPls - totalCreator) > 1e-4) {
    creatorMigrationPls = isGrad && totalCreator >= GRADUATION_DEV_PLS ? GRADUATION_DEV_PLS : 0
    creatorLpPls = Math.min(Math.max(0, totalCreator - creatorMigrationPls), lpSplit.creatorPoolPls)
    creatorCurvePls = Math.max(0, totalCreator - creatorMigrationPls - creatorLpPls)
  }

  const totalPlatform = Math.max(0, c.platformFeePls ?? 0)
  let platformCurvePls = c.platformCurvePls ?? 0
  let platformMigrationPls = c.platformMigrationPls ?? 0
  let platformLpPls = c.platformLpPls ?? 0
  if (Math.abs(platformCurvePls + platformMigrationPls + platformLpPls - totalPlatform) > 1e-4) {
    platformMigrationPls = isGrad && totalPlatform >= GRADUATION_PLATFORM_PLS ? GRADUATION_PLATFORM_PLS : 0
    platformLpPls = Math.min(Math.max(0, totalPlatform - platformMigrationPls), lpSplit.platformPls)
    platformCurvePls = Math.max(0, totalPlatform - platformMigrationPls - platformLpPls)
  }

  return {
    holderCurvePls,
    holderMigrationPls,
    holderLpPls,
    creatorCurvePls,
    creatorMigrationPls,
    creatorLpPls,
    platformCurvePls,
    platformMigrationPls,
    platformLpPls,
    curveVolumePls,
    pulsexVolumePls,
  }
}

function backfillCoinFeeSources(c: Coin) {
  const b = resolveCoinFeeSources(c)
  c.holderCurvePls = b.holderCurvePls
  c.holderMigrationPls = b.holderMigrationPls
  c.holderLpPls = b.holderLpPls
  c.creatorCurvePls = b.creatorCurvePls
  c.creatorMigrationPls = b.creatorMigrationPls
  c.creatorLpPls = b.creatorLpPls
  c.platformCurvePls = b.platformCurvePls
  c.platformMigrationPls = b.platformMigrationPls
  c.platformLpPls = b.platformLpPls
  c.curveVolumePls = b.curveVolumePls
  c.pulsexVolumePls = b.pulsexVolumePls
}

/**
 * Scales a seeded graduated coin's holder balances so that:
 * sum(holders) + PulseX LP tokens + burned tokens == 1,000,000,000 (TOTAL_SUPPLY).
 */
function scaleSeededGraduatedHoldersTo1B(coin: Coin) {
  if (!coin.curve.graduated) return
  const lpTokens = Math.round(coin.curve.dexTokens ?? GRAD_LP_TOKENS)
  const burnedTokens = Math.round(coin.burnedSupplyTokens ?? GRAD_BURNED_TOKENS)
  coin.curve.dexTokens = lpTokens
  coin.burnedSupplyTokens = burnedTokens
  const targetHoldersSum = Math.max(0, TOTAL_SUPPLY - lpTokens - burnedTokens)
  const keys = Object.keys(coin.holders)
  const currentHoldersSum = keys.reduce((s, k) => s + Math.max(0, coin.holders[k]), 0)
  if (currentHoldersSum > 1e-6 && keys.length > 0 && Math.abs(currentHoldersSum - targetHoldersSum) > 1e-6) {
    const scale = targetHoldersSum / currentHoldersSum
    let runningSum = 0
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (i === keys.length - 1) {
        coin.holders[k] = Math.max(0, targetHoldersSum - runningSum)
      } else {
        const scaled = Math.round(coin.holders[k] * scale)
        coin.holders[k] = scaled
        runningSum += scaled
      }
    }
    if (coin.graduationBalances) {
      for (const u of Object.keys(coin.graduationBalances)) {
        coin.graduationBalances[u] = Math.round(coin.graduationBalances[u] * scale)
      }
    }
  }
}

/**
 * Flagship Mega-Runner: $SOVRN (Pulse Sovereign) launched by @gainzee.
 * Bonds at 200M PLS and runs an insane, consistent 150-candle stair-step bull chart
 * with $5,000,000 USD (625,000,000,000 PLS) of buy volume!
 */
function seedGainzeeMegaPumpCoin(): Coin {
  const r = rng(777_369)
  const start = Date.UTC(2026, 9, 23, 12, 0, 0)
  const coin = emptyCoin(
    'Pulse Sovereign',
    'SOVRN',
    'Flagship cypherpunk runner on PulseChain. 0% token tax, LP locked forever in UniqLpFeeVault.',
    'gainzee',
    start,
    true
  )
  coin.dexPrepaid = true
  coin.dexPrepaidBy = 'gainzee'
  coin.dexPrepaidAt = start + 30_000
  coin.dexPaymentMethod = 'sol'
  coin.xUrl = 'https://x.com/uniq_pulse'
  coin.websiteUrl = 'https://uniq.pulse/coin/SOVRN'

  let t = start
  // Step 1: Block 0 + Rapid Curve Fill to 200,000,000 PLS across early buyers (capping KOLs to ~4-6 trades total on SOVRN)
  const earlyBuyers = ['gainzee', 'pls_maxi', 'trench_rat', 'harbor', 'solana_refugee', 'violet', 'quietbuyer', 'pulsepilled', 'nightowl', 'kettle']
  const nonKolTraders = earlyBuyers.slice(5)
  const kolSet = new Set<string>(['gainzee', 'pls_maxi', 'trench_rat', 'harbor', 'solana_refugee'])
  const sovrnUserTradeCounts: Record<string, number> = {}
  while (!coin.curve.graduated) {
    t += 15_000 + Math.floor(r() * 25_000)
    const rawUser = coin.trades.length === 0 ? 'gainzee' : earlyBuyers[Math.floor(r() * earlyBuyers.length)]
    const user =
      coin.trades.length === 0
        ? 'gainzee'
        : kolSet.has(rawUser)
          ? nonKolTraders[coin.trades.length % nonKolTraders.length]
          : rawUser
    sovrnUserTradeCounts[user] = (sovrnUserTradeCounts[user] ?? 0) + 1
    const want = coin.trades.length === 0 ? 25_000_000 : 6_000_000 + r() * 14_000_000
    const q = quoteBuy(coin.curve, want)
    if (!q.ok) break
    const before = mcapUsd(coin.curve, PLS_USD)
    coin.curve = applyBuy(coin.curve, q, t)
    coin.holders[user] = (coin.holders[user] ?? 0) + q.tokens
    record(coin, before, t, { t, side: 'buy', user, tokens: q.tokens, pls: q.spend }, PLS_USD, false, q.fee)
    if (q.graduates) {
      coin.graduatedAt = t
      coin.burnedSupplyTokens = (coin.burnedSupplyTokens ?? 0) + (coin.curve.burnedTokens ?? GRAD_BURNED_TOKENS)
      coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + GRADUATION_HOLDER_PLS
      coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + GRADUATION_DEV_PLS
      coin.platformFeePls = (coin.platformFeePls ?? 0) + GRADUATION_PLATFORM_PLS
      coin.holderMigrationPls = (coin.holderMigrationPls ?? 0) + GRADUATION_HOLDER_PLS
      coin.creatorMigrationPls = (coin.creatorMigrationPls ?? 0) + GRADUATION_DEV_PLS
      coin.platformMigrationPls = (coin.platformMigrationPls ?? 0) + GRADUATION_PLATFORM_PLS
    }
  }

  // Step 2: Post-Migration Consistent Stair-Step Bull Run with $5,000,000 USD (625,000,000,000 PLS) of Buy Volume!
  // Target buy volume = 625,000,000,000 PLS ($5.00M USD at $0.000008/PLS).
  const targetBuyPls = 625_000_000_000
  let accumulatedBuyPls = coin.trades.filter((tr) => tr.side === 'buy').reduce((s, tr) => s + tr.pls, 0)
  const steps = 125

  for (let step = 0; step < steps; step++) {
    t += 30_000 + Math.floor(r() * 45_000)
    const isHealthyPullback = step > 8 && (step % 7 === 0 || step % 11 === 0)
    const curMcap = mcapUsd(coin.curve, PLS_USD)

    if (isHealthyPullback) {
      // Short-term trader takes profit (12-18% pullback candle) and forfeits their holder pool share to Diamond Hands!
      const seller = DEMO_USERS[10 + (step % 10)]
      const slicePls = Math.round(1_200_000_000 + r() * 1_800_000_000)
      const dipFactor = 0.86 + r() * 0.05
      const nextDexPls = Math.max(GRAD_LP_PLS, (coin.curve.dexPls ?? GRAD_LP_PLS) * Math.sqrt(dipFactor))
      const nextDexTokens = (GRAD_LP_PLS * GRAD_LP_TOKENS) / nextDexPls
      coin.curve = {
        ...coin.curve,
        dexPls: nextDexPls,
        dexTokens: nextDexTokens,
      }
      coin.forfeitedHolders = coin.forfeitedHolders ?? {}
      coin.forfeitedHolders[seller] = true
      const tokensSold = slicePls / Math.max(1e-6, pricePls(coin.curve))
      record(coin, curMcap, t, { t, side: 'sell', user: seller, tokens: tokensSold, pls: slicePls }, PLS_USD, true, slicePls * POST_MIGRATION_LP_FEE)
    } else {
      // Consistent stair-step buy candle pushing toward $5M USD buy volume!
      const remainingBuys = Math.max(1, Math.ceil((steps - step) * 0.78))
      const remainingPlsNeeded = Math.max(500_000_000, targetBuyPls - accumulatedBuyPls)
      const buyPls = Math.round((remainingPlsNeeded / remainingBuys) * (0.75 + r() * 0.5))
      accumulatedBuyPls += buyPls

      // Space out KOL trades evenly across all 125 steps (one KOL every 6 steps -> ~4 trades per KOL, never clustered)
      const isKolStep = step >= 8 && step % 6 === 2
      const kolCandidate = earlyBuyers[Math.floor((step - 8) / 6) % 5]
      const buyer =
        isKolStep && (sovrnUserTradeCounts[kolCandidate] ?? 0) < 6
          ? kolCandidate
          : nonKolTraders[step % nonKolTraders.length]
      sovrnUserTradeCounts[buyer] = (sovrnUserTradeCounts[buyer] ?? 0) + 1
      // Smoothly appreciate AMM pool reserves so chart climbs from $2k -> $14.8M MCap in a clean stair-step uptrend
      const pumpFactor = 1.045 + r() * 0.042
      const nextDexPls = (coin.curve.dexPls ?? GRAD_LP_PLS) * Math.sqrt(pumpFactor)
      const nextDexTokens = (GRAD_LP_PLS * GRAD_LP_TOKENS) / nextDexPls
      coin.curve = {
        ...coin.curve,
        dexPls: nextDexPls,
        dexTokens: nextDexTokens,
      }
      const tokensOut = Math.min(2_500_000, buyPls / Math.max(1e-4, pricePls(coin.curve)))
      coin.holders[buyer] = (coin.holders[buyer] ?? 0) + tokensOut
      record(coin, curMcap, t, { t, side: 'buy', user: buyer, tokens: tokensOut, pls: buyPls }, PLS_USD, true, buyPls * POST_MIGRATION_LP_FEE)
    }
  }

  // Ensure exact $5,000,000 USD (625,000,000,000 PLS) buy volume on $SOVRN
  const finalBuySum = coin.trades.filter((tr) => tr.side === 'buy').reduce((s, tr) => s + tr.pls, 0)
  if (finalBuySum < targetBuyPls) {
    const diff = targetBuyPls - finalBuySum
    t += 20_000
    const before = mcapUsd(coin.curve, PLS_USD)
    coin.curve = {
      ...coin.curve,
      dexPls: (coin.curve.dexPls ?? GRAD_LP_PLS) * 1.04,
      dexTokens: (coin.curve.dexTokens ?? GRAD_LP_TOKENS) / 1.04,
    }
    coin.holders['gainzee'] = (coin.holders['gainzee'] ?? 0) + 1_200_000
    record(coin, before, t, { t, side: 'buy', user: 'gainzee', tokens: 1_200_000, pls: diff }, PLS_USD, true, diff * POST_MIGRATION_LP_FEE)
  }

  // Harvest accumulated vault fees into holder (40%) / creator (20%) / platform (40%) pools
  if ((coin.unharvestedLpFeesPls ?? 0) >= 50_000) {
    const pending = coin.unharvestedLpFeesPls ?? 0
    const f = splitFee(pending, PLS_USD)
    coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + f.holdersPoolPls
    coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + f.creatorPoolPls
    coin.platformFeePls = (coin.platformFeePls ?? 0) + f.platformPls
    coin.holderLpPls = (coin.holderLpPls ?? 0) + f.holdersPoolPls
    coin.creatorLpPls = (coin.creatorLpPls ?? 0) + f.creatorPoolPls
    coin.platformLpPls = (coin.platformLpPls ?? 0) + f.platformPls
    coin.unharvestedLpFeesPls = 0
  }

  coin.comments = [
    {
      id: 'SOVRN-c1',
      t: start + 60_000,
      user: 'gainzee',
      text: 'Launched $SOVRN on uniq.pulse — 80% curve bonded at 200M PLS, LP locked forever, 0.50% Holder Pool + 0.25% Creator Pool streaming on every PulseX trade!',
    },
    {
      id: 'SOVRN-c2',
      t: t - 120_000,
      user: 'pls_maxi',
      text: 'Over $5,000,000 USD (625B PLS) in buy volume and my Diamond-Hands holder rewards in my profile are already over $4,200 USD in claimable PLS!',
    },
    {
      id: 'SOVRN-c3',
      t: t - 30_000,
      user: 'trench_rat',
      text: 'Cleanest stair-step chart on PulseChain. Anyone who sold forfeited their pool share straight to the remaining holders.',
    },
  ]

  scaleSeededGraduatedHoldersTo1B(coin)
  backfillCoinFeeSources(coin)
  return coin
}

const KOL_ACCOUNTS = ['pls_maxi', 'trench_rat', 'gainzee', 'harbor', 'solana_refugee'] as const
export const SEEDED_KOL_ACCOUNTS: readonly string[] = KOL_ACCOUNTS
export const DEFAULT_DEMO_FOLLOWS: readonly string[] = ['pls_maxi', 'trench_rat']
export const DEFAULT_DEMO_FOLLOW_KEY = '__default_demo__'
export const RESERVED_FOLLOW_ACCOUNTS = new Set<string>([PLATFORM_USERNAME.toLowerCase(), 'uniq_anon'])

function buildDefaultFollowsMap(registry: Registered[]): Record<string, string[]> {
  const map: Record<string, string[]> = {
    [DEFAULT_DEMO_FOLLOW_KEY]: [...DEFAULT_DEMO_FOLLOWS],
    '0x7770000000000000000000000000000000000777': [...DEFAULT_DEMO_FOLLOWS],
  }
  for (const r of registry) {
    const u = r.name.toLowerCase()
    const w = r.wallet.toLowerCase()
    const picks = KOL_ACCOUNTS.filter((k) => k !== u).slice(0, 2)
    map[w] = picks
  }
  return map
}

function seedCoin([name, ticker, story, target]: (typeof DEMO_COINS)[number], i: number): Coin {
  const r = rng(i * 977 + 13)
  const start = Date.UTC(2026, 9, 10 + i)
  const launcher = i === 5 ? 'trench_rat' : DEMO_USERS[(i + 1) % DEMO_USERS.length]
  const coin = emptyCoin(name, ticker, story, launcher, start, true)
  const nonKolPool = DEMO_USERS.slice(5)
  const kolSet = new Set<string>(KOL_ACCOUNTS)
  const kolTradeCounts: Record<string, number> = {}
  let t = start
  for (let n = 0; n < 400 && coin.curve.reservePls < target && !coin.curve.graduated; n++) {
    t += 600_000 + Math.floor(r() * 3_600_000)
    const rawUser = DEMO_USERS[Math.floor(r() * DEMO_USERS.length)]
    // Keep each KOL to ~3–6 trades per coin
    let user = n === 0 ? launcher : rawUser
    if (kolSet.has(user) && (kolTradeCounts[user] ?? 0) >= 5) {
      user = nonKolPool[(n + i) % nonKolPool.length]
    }
    kolTradeCounts[user] = (kolTradeCounts[user] ?? 0) + 1
    const held = coin.holders[user] ?? 0
    const before = mcapUsd(coin.curve, PLS_USD)
    if (held > 0 && r() < 0.18 && coin.curve.reservePls >= 15_000_000) {
      const q = quoteSell(coin.curve, held * (0.2 + r() * 0.5), held)
      if (!q.ok) continue
      coin.curve = applySell(coin.curve, q)
      coin.holders[user] = held - q.tokens
      record(coin, before, t, { t, side: 'sell', user, tokens: q.tokens, pls: q.plsOut }, PLS_USD, false, q.fee)
      continue
    }
    const want = coin.curve.reservePls < 20_000_000 ? 300_000 + r() * 3_000_000 : 1_000_000 + r() * 9_000_000
    const spend = Math.min(want, (target - coin.curve.reservePls) / (1 - FEE_RATE))
    const q = quoteBuy(coin.curve, spend)
    if (!q.ok) continue
    coin.curve = applyBuy(coin.curve, q, t)
    coin.holders[user] = held + q.tokens
    record(coin, before, t, { t, side: 'buy', user, tokens: q.tokens, pls: q.spend }, PLS_USD, false, q.fee)
    if (q.graduates) {
      coin.graduatedAt = t
      coin.burnedSupplyTokens = (coin.burnedSupplyTokens ?? 0) + (coin.curve.burnedTokens ?? GRAD_BURNED_TOKENS)
      coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + GRADUATION_HOLDER_PLS
      coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + GRADUATION_DEV_PLS
      coin.platformFeePls = (coin.platformFeePls ?? 0) + GRADUATION_PLATFORM_PLS
      coin.holderMigrationPls = (coin.holderMigrationPls ?? 0) + GRADUATION_HOLDER_PLS
      coin.creatorMigrationPls = (coin.creatorMigrationPls ?? 0) + GRADUATION_DEV_PLS
      coin.platformMigrationPls = (coin.platformMigrationPls ?? 0) + GRADUATION_PLATFORM_PLS
    }
  }
  // For graduated $CLRW, add post-migration DEX volume so total 24h chain volume across uniq.pulse hits $10,000,000 USD (1.25 Trillion PLS)!
  if (ticker === 'CLRW' && coin.curve.graduated) {
    const postMigrationPls = 520_000_000_000 // $4.16M USD post-migration volume on CLRW
    const whaleBuyers = ['trench_rat', 'harbor', 'pls_maxi', 'solana_refugee', 'violet', 'quietbuyer']
    for (let k = 0; k < 40; k++) {
      t += 45_000
      const candidate = whaleBuyers[k % whaleBuyers.length]
      const u =
        kolSet.has(candidate) && (kolTradeCounts[candidate] ?? 0) >= 6
          ? nonKolPool[k % nonKolPool.length]
          : candidate
      kolTradeCounts[u] = (kolTradeCounts[u] ?? 0) + 1
      const slice = Math.round(postMigrationPls / 40)
      const before = mcapUsd(coin.curve, PLS_USD)
      coin.curve = {
        ...coin.curve,
        dexPls: (coin.curve.dexPls ?? GRAD_LP_PLS) * 1.032,
        dexTokens: (coin.curve.dexTokens ?? GRAD_LP_TOKENS) / 1.032,
      }
      coin.holders[u] = (coin.holders[u] ?? 0) + 450_000
      record(coin, before, t, { t, side: 'buy', user: u, tokens: 450_000, pls: slice }, PLS_USD, true, slice * POST_MIGRATION_LP_FEE)
    }
    if ((coin.unharvestedLpFeesPls ?? 0) >= 50_000) {
      const pending = coin.unharvestedLpFeesPls ?? 0
      const f = splitFee(pending, PLS_USD)
      coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + f.holdersPoolPls
      coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + f.creatorPoolPls
      coin.platformFeePls = (coin.platformFeePls ?? 0) + f.platformPls
      coin.holderLpPls = (coin.holderLpPls ?? 0) + f.holdersPoolPls
      coin.creatorLpPls = (coin.creatorLpPls ?? 0) + f.creatorPoolPls
      coin.platformLpPls = (coin.platformLpPls ?? 0) + f.platformPls
      coin.unharvestedLpFeesPls = 0
    }
  }
  coin.xUrl = `https://x.com/${launcher}`
  coin.websiteUrl = `https://uniq.pulse/coin/${ticker}`
  if (ticker === 'CLRW' || ticker === 'THRD') {
    coin.dexPrepaid = true
    coin.dexPrepaidBy = launcher
    coin.dexPrepaidAt = start + 60_000
  }
  coin.comments = [
    {
      id: `${ticker}-c1`,
      t: t - 120_000,
      user: launcher,
      text: `Launched $${ticker} on uniq.pulse — 80% curve, 0% token tax, LP locked forever.`,
    },
    {
      id: `${ticker}-c2`,
      t: t - 45_000,
      user: DEMO_USERS[(i + 3) % DEMO_USERS.length],
      text: coin.curve.graduated
        ? `Bonded at 200M PLS and streaming 0.50% Holder Pool + 0.25% Creator Pool on every PulseX trade!`
        : `Holding $${ticker} through migration to unlock the 0.50% Holder Pool.`,
    },
  ]
  scaleSeededGraduatedHoldersTo1B(coin)
  backfillCoinFeeSources(coin)
  return coin
}

function buildInitialLiveFeed(coins: Coin[]): LiveEvent[] {
  const events: LiveEvent[] = []
  for (const c of coins) {
    for (const tr of c.trades.slice(0, 4)) {
      events.push({
        id: `${c.ticker}-${tr.t}`,
        t: tr.t,
        kind: tr.side,
        user: tr.user,
        ticker: c.ticker,
        pls: tr.pls,
        tokens: tr.tokens,
        mcapUsd: mcapUsd(c.curve, PLS_USD),
      })
    }
  }
  return events.sort((a, b) => b.t - a.t).slice(0, 20)
}

function syncTreasuryFromAccruals(s: State) {
  const plsUsd = s.plsUsd || PLS_USD
  const launchFeesPls = s.treasury?.launchFeesPls ?? LAUNCH_FEE_PLS * s.coins.length
  let holdersPls = 0
  let creatorsPls = 0
  let platformCoinsPls = 0
  let pendingLpPls = 0
  let migratedCount = 0
  for (const c of s.coins) {
    backfillCoinFeeSources(c)
    holdersPls += c.holderRewardPoolPls ?? 0
    creatorsPls += c.devRewardPoolPls ?? 0
    platformCoinsPls += c.platformFeePls ?? 0
    pendingLpPls += c.unharvestedLpFeesPls ?? 0
    if (c.curve?.graduated) migratedCount += 1
  }
  const platformTotalPls = platformCoinsPls + launchFeesPls
  s.treasury = {
    ...s.treasury,
    launchFeesPls,
    feesPls: holdersPls + creatorsPls + platformTotalPls + pendingLpPls,
    usdcToDev: platformTotalPls * plsUsd,
    migrationBonusesPaidPls: GRADUATION_DEV_PLS * migratedCount,
  }
}

function initialState(): State {
  const megaCoin = seedGainzeeMegaPumpCoin()
  const coins = [megaCoin, ...DEMO_COINS.map(seedCoin)]
  const feed = buildInitialLiveFeed(coins)
  const launchFeesPls = LAUNCH_FEE_PLS * coins.length
  const holdersPls = coins.reduce((acc, c) => acc + (c.holderRewardPoolPls ?? 0), 0)
  const creatorsPls = coins.reduce((acc, c) => acc + (c.devRewardPoolPls ?? 0), 0)
  const platformCoinsPls = coins.reduce((acc, c) => acc + (c.platformFeePls ?? 0), 0)
  const pendingLpPls = coins.reduce((acc, c) => acc + (c.unharvestedLpFeesPls ?? 0), 0)
  const platformTotalPls = platformCoinsPls + launchFeesPls
  const totalFeesPls = holdersPls + creatorsPls + platformTotalPls + pendingLpPls
  const devWallet = '0x3690000000000000000000000000000000000369'
  const registry: Registered[] = [
    { name: PLATFORM_USERNAME, wallet: devWallet },
    ...DEMO_USERS.map((name, i) => ({ name, wallet: '0x' + String(i + 1).padStart(40, 'd') })),
  ]
  return {
    v: 1,
    pls: DESK_START_PLS, // Normal 1,000,000,000 PLS test balance for demo users
    plsUsd: PLS_USD,
    solUsd: DEFAULT_SOL_USD,
    ethUsd: DEFAULT_ETH_USD,
    plsChange24h: 0,
    solChange24h: 0,
    ethChange24h: 0,
    plsPriceSource: 'fallback',
    liveActionEnabled: true,
    lastLiveEvent: feed[0] ?? null,
    liveFeed: feed,
    username: null, // App starts logged out by default
    registry,
    follows: buildDefaultFollowsMap(registry),
    verifiedX: {
      gainzee: 'Gain_Zee',
      trench_rat: 'trench_rat_pls',
      harbor: 'harbor_builds',
      solana_refugee: 'sol_to_pls',
      uniq_pulse: 'uniq_pulse',
    },
    verifiedXId: {
      gainzee: 'xid_gainzee',
      trench_rat: 'xid_1001',
      harbor: 'xid_1002',
      solana_refugee: 'xid_1003',
      uniq_pulse: 'xid_uniq_core',
    },
    freeLaunchPasses: {
      uniq_pulse: 5,
      gainzee: 1,
      trench_rat: 1,
    },
    migrationBonusEarned: {
      gainzee: MIGRATION_DEV_BONUS_PLS,
      trench_rat: MIGRATION_DEV_BONUS_PLS,
    },
    coins,
    treasury: {
      feesPls: totalFeesPls,
      usdcToDev: platformTotalPls * PLS_USD,
      launchFeesPls,
      migrationBonusesPaidPls: GRADUATION_DEV_PLS * 2,
    },
    phantom: null,
    evm: null,
    evmLabel: null,
    evmChainId: null,
    realPlsBalance: null,
  }
}

/* ---------------- store plumbing ---------------- */

let state: State | null = null
const listeners = new Set<() => void>()
const SERVER = initialState()

function load(): State {
  if (state) return state
  if (typeof window === 'undefined') return SERVER
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      if (s && s.v === 1 && Array.isArray(s.coins)) {
        s.plsUsd = typeof s.plsUsd === 'number' && s.plsUsd > 0 && s.plsUsd < 0.1 ? s.plsUsd : PLS_USD
        s.solUsd = typeof s.solUsd === 'number' && s.solUsd > 5 ? s.solUsd : DEFAULT_SOL_USD
        s.ethUsd = typeof s.ethUsd === 'number' && s.ethUsd > 100 ? s.ethUsd : DEFAULT_ETH_USD
        s.plsPriceSource = s.plsPriceSource ?? 'fallback'
        s.liveActionEnabled = s.liveActionEnabled ?? true
        s.liveFeed = Array.isArray(s.liveFeed) && s.liveFeed.length > 0 ? s.liveFeed : buildInitialLiveFeed(s.coins)
        s.lastLiveEvent = s.lastLiveEvent ?? s.liveFeed[0] ?? null
        s.evmChainId = s.evmChainId ?? null
        s.realPlsBalance = s.realPlsBalance ?? null
        s.freeLaunchPasses = s.freeLaunchPasses ?? { trench_rat: 1 }
        s.migrationBonusEarned = s.migrationBonusEarned ?? { trench_rat: MIGRATION_DEV_BONUS_PLS }
        s.verifiedX = s.verifiedX ?? {
          trench_rat: 'trench_rat_pls',
          harbor: 'harbor_builds',
          solana_refugee: 'sol_to_pls',
          uniq_pulse: 'uniq_pulse',
        }
        if (s.verifiedX.Gain_Zee) {
          delete s.verifiedX.Gain_Zee
          s.verifiedX.uniq_pulse = 'uniq_pulse'
        }
        s.verifiedXId = s.verifiedXId ?? {
          trench_rat: 'xid_1001',
          harbor: 'xid_1002',
          solana_refugee: 'xid_1003',
          uniq_pulse: 'xid_uniq_core',
        }
        for (const c of s.coins) {
          c.comments = Array.isArray(c.comments) ? c.comments : []
          if (!c.xUrl && c.demo) c.xUrl = `https://x.com/${c.launcher}`
          if (!c.websiteUrl && c.demo) c.websiteUrl = `https://uniq.pulse/coin/${c.ticker}`
          if (c.demo && c.curve?.graduated) {
            scaleSeededGraduatedHoldersTo1B(c)
          }
          if ((c.ticker === 'CLRW' || c.ticker === 'THRD') && c.dexPrepaid === undefined) {
            c.dexPrepaid = true
            c.dexPrepaidBy = c.launcher
          }
          if (c.holderRewardPoolPls === undefined) {
            const vol = c.trades.reduce((sum, tr) => sum + tr.pls, 0)
            c.holderRewardPoolPls = vol * 0.005
            c.devRewardPoolPls = vol * 0.0025
            c.claimedHolderRewards = c.claimedHolderRewards ?? {}
          }
          backfillCoinFeeSources(c)
        }
        syncTreasuryFromAccruals(s)
        s.follows = s.follows ?? buildDefaultFollowsMap(s.registry ?? [])
        if (!s.follows[DEFAULT_DEMO_FOLLOW_KEY]) {
          s.follows[DEFAULT_DEMO_FOLLOW_KEY] = [...DEFAULT_DEMO_FOLLOWS]
        }
        if (s.username && !Array.isArray(s.username.launchedTickers)) {
          s.username.launchedTickers = s.username.launched ? [s.username.launched] : []
        }
        return (state = s)
      }
    }
  } catch { /* ignore */ }
  return (state = initialState())
}

function commit(next: State) {
  syncTreasuryFromAccruals(next)
  state = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

const clone = (): State => structuredClone(load())

export function getStoreSnapshot(): State {
  return clone()
}

export function useStore(): State {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), load, () => SERVER)
}

export function resetDemo() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  state = initialState()
  commit(state)
}

export function toggleLiveAction() {
  const s = clone()
  s.liveActionEnabled = !s.liveActionEnabled
  commit(s)
}

function pushLiveEvent(s: State, ev: Omit<LiveEvent, 'id'>) {
  const full: LiveEvent = { ...ev, id: `${ev.ticker}-${ev.t}-${Math.random().toString(36).slice(2, 6)}` }
  s.lastLiveEvent = full
  s.liveFeed = [full, ...(s.liveFeed ?? [])].slice(0, 25)
}

/** Simulates a live trade tick on the board so users see real-time Pump.fun-style action. */
export function tickLiveAction() {
  const s = clone()
  if (!s.liveActionEnabled || s.coins.length === 0) return
  const plsUsd = s.plsUsd || PLS_USD
  const idx = Math.floor(Math.random() * s.coins.length)
  const coin = s.coins[idx]
  const user = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)]
  const held = coin.holders[user] ?? 0
  const now = Date.now()
  const before = mcapUsd(coin.curve, plsUsd)
  const wasGraduated = coin.curve.graduated

  // 28% chance of sell if user holds tokens and curve has at least 15M PLS
  if (held > 100_000 && Math.random() < 0.28 && (coin.curve.graduated || coin.curve.reservePls >= 15_000_000)) {
    const rawSellAmt = held * (0.15 + Math.random() * 0.35)
    // On graduated coins, cap background sell ticks to ~1.5%-3% of AMM pool tokens so scaled 1B holder bags never nuke pool reserves
    const sellAmt = coin.curve.graduated
      ? Math.min(rawSellAmt, (coin.curve.dexTokens ?? GRAD_LP_TOKENS) * (0.012 + Math.random() * 0.018))
      : rawSellAmt
    const q = quoteSell(coin.curve, sellAmt, held)
    if (!q.ok) return
    coin.curve = applySell(coin.curve, q)
    coin.holders[user] = Math.max(0, held - q.tokens)
    if (!wasGraduated) {
      coin.forfeitedHolders = coin.forfeitedHolders ?? {}
      coin.forfeitedHolders[user.toLowerCase()] = true
    }
    record(coin, before, now, { t: now, side: 'sell', user, tokens: q.tokens, pls: q.plsOut }, plsUsd, wasGraduated, q.fee)
    if (!wasGraduated) routeFee(s, q.fee, false, coin)
    pushLiveEvent(s, {
      t: now,
      kind: 'sell',
      user,
      ticker: coin.ticker,
      pls: q.plsOut,
      tokens: q.tokens,
      mcapUsd: mcapUsd(coin.curve, plsUsd),
    })
    commit(s)
    return
  }

  // Otherwise execute a buy
  const spend =
    !coin.curve.graduated && coin.curve.reservePls < 20_000_000
      ? Math.floor(400_000 + Math.random() * 2_200_000)
      : Math.floor(1_200_000 + Math.random() * 6_500_000)
  const q = quoteBuy(coin.curve, spend)
  if (!q.ok) return
  coin.curve = applyBuy(coin.curve, q, now)
  coin.holders[user] = held + q.tokens
  record(coin, before, now, { t: now, side: 'buy', user, tokens: q.tokens, pls: q.spend }, plsUsd, wasGraduated, q.fee)
  if (!wasGraduated) routeFee(s, q.fee, false, coin)
  if (q.graduates) {
    awardMigrationIncentive(s, coin, now)
  }
  pushLiveEvent(s, {
    t: now,
    kind: q.graduates ? 'migrate' : 'buy',
    user,
    ticker: coin.ticker,
    pls: q.spend,
    tokens: q.tokens,
    mcapUsd: mcapUsd(coin.curve, plsUsd),
  })
  commit(s)
}

/** Phase 2+: Refresh live PLS/USD, SOL/USD, and ETH/USD prices from DexScreener / CoinPaprika. */
export async function refreshPlsPrice() {
  const multi = await defaultPriceSource.getMultiChainPrices()
  const s = clone()
  if (
    s.plsUsd !== multi.plsUsd ||
    s.solUsd !== multi.solUsd ||
    s.ethUsd !== multi.ethUsd ||
    s.plsPriceSource !== multi.source
  ) {
    s.plsUsd = multi.plsUsd
    s.solUsd = multi.solUsd
    s.ethUsd = multi.ethUsd
    s.plsChange24h = multi.plsChange24h
    s.solChange24h = multi.solChange24h
    s.ethChange24h = multi.ethChange24h
    s.plsPriceSource = multi.source
    commit(s)
  }
}

/** Phase 2: Refresh connected EVM wallet's chainId and real on-chain PLS balance. */
export async function refreshEvmState(address?: string) {
  const s = clone()
  const addr = address ?? s.evm
  if (!addr) return
  const wallets = await discoverEvmWallets()
  const provider = wallets.find((w) => w.name === s.evmLabel)?.provider ?? wallets[0]?.provider
  const chainId = provider ? await readEvmChainId(provider) : null
  const net = chainId === 943 ? 'testnet' : 'mainnet'
  const bal = await fetchPulseChainBalance(addr, net)
  const next = clone()
  next.evmChainId = chainId
  next.realPlsBalance = bal
  commit(next)
}

/* ---------------- fee routing:
 * 1) Creation fee (500k PLS): 100% @uniq_pulse
 * 2) Curve trade (1.25%): ONLY 40% platform (@uniq_pulse) / 40% coin holder pool / 20% coin creator pool
 * 3) Graduation Fee at 200M PLS (4M PLS = 2%): 2M PLS @uniq_pulse, 1.5M PLS Holder Pool, 500k PLS Creator
 * 4) Post-Migration PulseX LP Vault Fee (1.25%): accumulates in coin.unharvestedLpFeesPls and harvests 40% holders / 20% creator / 40% platform
 ---------------- */

function routeFee(s: State, feePls: number, isLaunchFee = false, _coin?: Coin) {
  const plsUsd = s.plsUsd || PLS_USD
  if (isLaunchFee) {
    // 100% of the 500,000 PLS Creation Fee goes to @uniq_pulse (Platform Dev)
    s.treasury.feesPls += feePls
    s.treasury.usdcToDev += feePls * plsUsd
    s.treasury.launchFeesPls = (s.treasury.launchFeesPls ?? 0) + feePls
    return
  }
  const f = splitFee(feePls, plsUsd)
  s.treasury.feesPls += f.feePls
  s.treasury.usdcToDev += f.platformUsd
}

function awardMigrationIncentive(s: State, coin: Coin, now = Date.now()) {
  const launcherUsername = coin.launcher
  const plsUsd = s.plsUsd || PLS_USD
  s.freeLaunchPasses = s.freeLaunchPasses ?? {}
  s.migrationBonusEarned = s.migrationBonusEarned ?? {}
  s.freeLaunchPasses[launcherUsername] = (s.freeLaunchPasses[launcherUsername] ?? 0) + 1

  coin.graduatedAt = coin.curve.graduatedAt ?? now
  coin.graduationBalances = { ...coin.holders }
  coin.burnedSupplyTokens = (coin.burnedSupplyTokens ?? 0) + (coin.curve.burnedTokens ?? GRAD_BURNED_TOKENS)

  // 2% Graduation Fee at 200M PLS bond (4,000,000 PLS total):
  //  - 2,000,000 PLS -> @uniq_pulse Platform Dev
  //  - 1,500,000 PLS -> Long-Term Holders Pool
  //  -   500,000 PLS -> Coin Creator (@launcher)
  s.treasury.feesPls += GRADUATION_FEE_PLS
  s.treasury.usdcToDev += GRADUATION_PLATFORM_PLS * plsUsd
  coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + GRADUATION_HOLDER_PLS
  coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + GRADUATION_DEV_PLS
  coin.platformFeePls = (coin.platformFeePls ?? 0) + GRADUATION_PLATFORM_PLS
  coin.holderMigrationPls = (coin.holderMigrationPls ?? 0) + GRADUATION_HOLDER_PLS
  coin.creatorMigrationPls = (coin.creatorMigrationPls ?? 0) + GRADUATION_DEV_PLS
  coin.platformMigrationPls = (coin.platformMigrationPls ?? 0) + GRADUATION_PLATFORM_PLS

  s.migrationBonusEarned[launcherUsername] = (s.migrationBonusEarned[launcherUsername] ?? 0) + GRADUATION_DEV_PLS
  s.treasury.migrationBonusesPaidPls = (s.treasury.migrationBonusesPaidPls ?? 0) + GRADUATION_DEV_PLS
}

/* ---------------- actions ---------------- */

function randomAddress() {
  const b = new Uint8Array(20)
  crypto.getRandomValues(b)
  return '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export function createUsername(raw: string): Result {
  const s = clone()
  if (s.username) return { error: `You're already logged in as @${s.username.name}. One username per wallet.` }
  const wallet = s.evm ?? randomAddress()
  const err = validateUsername(raw, s.registry, wallet, [PLATFORM_USERNAME])
  if (err) return { error: err }
  const name = raw.trim().toLowerCase()
  s.registry.push({ name, wallet })
  s.username = { name, wallet, walletSource: s.evm ? 'connected' : 'demo', issuedAt: Date.now(), launched: null, launchedTickers: [] }
  s.follows = s.follows ?? buildDefaultFollowsMap(s.registry)
  const wKey = wallet.toLowerCase()
  if (!s.follows[wKey]) {
    s.follows[wKey] = KOL_ACCOUNTS.filter((k) => k !== name).slice(0, 2)
  }
  commit(s)
  return { info: `@${name} is yours and bound to one wallet (demo).` }
}

/** A username can only trade from the one wallet it is bound to. */
function tradeGuard(s: State): string | null {
  if (!s.username) return 'Create a username to trade.'
  if (s.evm && s.evm.toLowerCase() !== s.username.wallet.toLowerCase())
    return `The connected wallet isn't the one bound to @${s.username.name}. Only the bound wallet can trade as this username.`
  return null
}

export function logoutUser(): Result {
  const s = clone()
  s.username = null
  s.evm = null
  s.evmLabel = null
  s.evmChainId = null
  s.realPlsBalance = null
  commit(s)
  return { info: 'Logged out.' }
}

export function setPhantom(addr: string) { const s = clone(); s.phantom = addr; commit(s) }
export function setEvm(addr: string, label: string): Result {
  let checksummed: string
  try {
    checksummed = toChecksumAddress(addr)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid PulseChain wallet address.' }
  }
  if (!isValidChecksumAddress(checksummed)) {
    return { error: 'Invalid PulseChain wallet address.' }
  }
  const s = clone()
  s.evm = checksummed
  s.evmLabel = label
  commit(s)
  void refreshEvmState(checksummed)
  const other = s.registry.find((r) => r.wallet.toLowerCase() === checksummed.toLowerCase())
  if (s.username && s.username.wallet.toLowerCase() !== checksummed.toLowerCase())
    return { error: `Connected, but this address isn't bound to @${s.username.name}, so it can't trade as that username.` }
  if (!s.username && other) return { error: `This address is already bound to @${other.name}.` }
  return { info: `${label} shared its address. uniq.pulse can't move your funds.` }
}

export interface LaunchInput {
  name: string
  ticker: string
  story: string
  devBuyPls: number
  logoUrl?: string
  bannerUrl?: string
  xUrl?: string
  websiteUrl?: string
  prepayDex?: boolean
  nowMs?: number
}

export function normalizeName(n: string) { return n.trim().replace(/\s+/g, ' ') }

export function launchCoin(input: LaunchInput): Result & { ticker?: string } {
  const s = clone()
  const plsUsd = s.plsUsd || PLS_USD
  const g = tradeGuard(s)
  if (g || !s.username) return { error: g ?? 'Create a username first.' }
  const name = normalizeName(input.name)
  const ticker = input.ticker.trim().toUpperCase()
  const story = normalizeName(input.story)
  if (name.length < 2 || name.length > 28) return { error: 'Name: 2–28 characters.' }
  if (!/^[A-Z]{3,8}$/.test(ticker)) return { error: 'Ticker: 3–8 letters.' }
  if (story.length < 8 || story.length > 160) return { error: 'Story: 8–160 characters.' }

  // Anti-Replica & Unique Ticker/Name check
  const replicaErr = validateAntiReplica(name, ticker, s.coins)
  if (replicaErr) return { error: replicaErr }

  const dev = input.devBuyPls || 0
  if (dev < 0) return { error: 'Dev buy must be a PLS amount, 0 or more.' }
  const freePasses = s.freeLaunchPasses?.[s.username.name] ?? 0
  const launchFeeToPay = freePasses > 0 ? 0 : LAUNCH_FEE_PLS
  const dexPrepayPls = input.prepayDex ? Math.round(DEX_PREPAY_USD / plsUsd) : 0
  if (dev + launchFeeToPay + dexPrepayPls > s.pls + 1e-6) {
    return { error: `Not enough demo PLS (need ${fmtPlsPlain(dev + launchFeeToPay + dexPrepayPls)} PLS including fees).` }
  }
  const now = input.nowMs ?? Date.now()
  const coin = emptyCoin(name, ticker, story, s.username.name, now, false)
  if (input.logoUrl) coin.logoUrl = input.logoUrl
  if (input.bannerUrl) coin.bannerUrl = input.bannerUrl
  if (input.xUrl?.trim()) coin.xUrl = input.xUrl.trim()
  if (input.websiteUrl?.trim()) coin.websiteUrl = input.websiteUrl.trim()
  if (input.prepayDex) {
    coin.dexPrepaid = true
    coin.dexPrepaidBy = s.username.name
    coin.dexPrepaidAt = now
    s.pls -= dexPrepayPls
    routeFee(s, dexPrepayPls * 0.1, true)
  }
  coin.comments = [
    {
      id: `${ticker}-init`,
      t: now,
      user: s.username.name,
      text: `Launched $${ticker} (${name}) — ${story}`,
    },
  ]

  // Deduct or waive the 500,000 PLS launch deployment fee (routed 100% to @uniq_pulse)
  if (freePasses > 0) {
    s.freeLaunchPasses[s.username.name] = freePasses - 1
  } else {
    s.pls -= LAUNCH_FEE_PLS
    routeFee(s, LAUNCH_FEE_PLS, true)
  }

  if (dev > 0) {
    const q = quoteBuy(coin.curve, dev)
    if (!q.ok) return { error: q.error }
    const before = mcapUsd(coin.curve, plsUsd)
    coin.curve = applyBuy(coin.curve, q, now)
    coin.holders[s.username.name] = q.tokens
    s.pls -= q.spend
    record(coin, before, now, { t: now, side: 'buy', user: s.username.name, tokens: q.tokens, pls: q.spend }, plsUsd, false, q.fee)
    routeFee(s, q.fee, false, coin)
    if (q.graduates) {
      awardMigrationIncentive(s, coin, now)
    }
  }
  s.coins = [coin, ...s.coins]
  s.username.launched = ticker
  s.username.launchedTickers = [...(s.username.launchedTickers ?? []), ticker]
  pushLiveEvent(s, {
    t: now,
    kind: 'launch',
    user: s.username.name,
    ticker,
    pls: dev,
    tokens: coin.holders[s.username.name] ?? 0,
    mcapUsd: mcapUsd(coin.curve, plsUsd),
  })
  commit(s)
  return { ticker }
}

export interface TradeExecOpts {
  slippagePct?: number
  minReceived?: number
  nowMs?: number
}

export function buyCoin(ticker: string, pls: number, opts?: TradeExecOpts): Result {
  const s = clone()
  const plsUsd = s.plsUsd || PLS_USD
  const g = tradeGuard(s)
  if (g || !s.username) return { error: g ?? 'Create a username to trade.' }
  const coin = s.coins.find((c) => c.ticker === ticker)
  if (!coin) return { error: 'Coin not found.' }
  if (pls > s.pls + 1e-6) return { error: 'Not enough demo PLS.' }
  const me = s.username.name
  const wasGraduated = coin.curve.graduated
  const q = quoteBuy(coin.curve, pls, { slippagePct: opts?.slippagePct })
  if (!q.ok) return { error: q.error }
  if (opts?.minReceived !== undefined && q.tokens < opts.minReceived - 1e-6) {
    return { error: 'Price moved beyond your slippage' }
  }
  const now = opts?.nowMs ?? Date.now()
  const before = mcapUsd(coin.curve, plsUsd)
  coin.curve = applyBuy(coin.curve, q, now)
  coin.holders[me] = (coin.holders[me] ?? 0) + q.tokens
  if (coin.forfeitedHolders) {
    delete coin.forfeitedHolders[me.toLowerCase()]
  }
  s.pls -= q.spend
  record(coin, before, now, { t: now, side: 'buy', user: me, tokens: q.tokens, pls: q.spend }, plsUsd, wasGraduated, q.fee)
  if (!wasGraduated) routeFee(s, q.fee, false, coin)
  if (q.graduates) {
    awardMigrationIncentive(s, coin, now)
  }
  pushLiveEvent(s, {
    t: now,
    kind: q.graduates ? 'migrate' : 'buy',
    user: me,
    ticker: coin.ticker,
    pls: q.spend,
    tokens: q.tokens,
    mcapUsd: mcapUsd(coin.curve, plsUsd),
  })
  commit(s)
  return {
    info: q.graduates
      ? `Bought & Bonded! $${ticker} migrated to PulseX (LP locked forever). Graduation Fee: +2M PLS to @${PLATFORM_USERNAME}, +1.5M PLS to Holders Pool, +500k PLS & 👑 Crown to @${coin.launcher}!`
      : coin.curve.graduated
      ? `Bought $${ticker} on PulseX (+LP fee share accrued in UniqLpFeeVault pending harvest).`
      : 'Bought (holding builds your Holder Pool share).',
  }
}

export function sellCoin(ticker: string, tokens: number, opts?: TradeExecOpts): Result {
  const s = clone()
  const plsUsd = s.plsUsd || PLS_USD
  const g = tradeGuard(s)
  if (g || !s.username) return { error: g ?? 'Create a username to trade.' }
  const coin = s.coins.find((c) => c.ticker === ticker)
  if (!coin) return { error: 'Coin not found.' }
  const me = s.username.name
  const now = opts?.nowMs ?? Date.now()
  const heldEntry = Object.entries(coin.holders).find(([u]) => u.toLowerCase() === me.toLowerCase())
  const heldBefore = heldEntry ? heldEntry[1] : 0

  // Enforce Dev Lock: locked tokens cannot be sold or transferred before maturity
  if (me.toLowerCase() === coin.launcher.toLowerCase()) {
    const lockedTokens = getLockedDevTokens(coin, now)
    const unlockedHeld = Math.max(0, heldBefore - lockedTokens)
    if (tokens > unlockedHeld + 1e-6) {
      return { error: 'Cannot sell locked dev tokens before lock maturity.' }
    }
  }

  const q = quoteSell(coin.curve, tokens, heldBefore, { slippagePct: opts?.slippagePct })
  if (!q.ok) return { error: q.error }
  if (opts?.minReceived !== undefined && q.plsOut < opts.minReceived - 1e-6) {
    return { error: 'Price moved beyond your slippage' }
  }

  // Holder Rewards on Sell:
  // - Post-migration (coin.curve.graduated === true): Auto-claim & pay out accrued rewards immediately.
  // - Pre-migration (!coin.curve.graduated): ANY sell before migration forfeits ALL of that wallet's unclaimed rewards
  //   for that coin. They are redistributed pro-rata to the remaining holders.
  const cleanMe = me.toLowerCase()
  const preSellMap = computeCoinHolderRewardsMap(coin, now)
  const preSellEarnedPls = preSellMap[cleanMe]?.earnedPls ?? 0
  const alreadyClaimedPls = coin.claimedHolderRewards?.[cleanMe] ?? 0
  const unclaimedPls = Math.max(0, preSellEarnedPls - alreadyClaimedPls)
  const isPostMigration = coin.curve.graduated
  let autoClaimedPls = 0
  let forfeitedOnSellPls = 0

  if (isPostMigration) {
    autoClaimedPls = unclaimedPls
    if (autoClaimedPls > 0) {
      coin.claimedHolderRewards = coin.claimedHolderRewards ?? {}
      coin.claimedHolderRewards[cleanMe] = alreadyClaimedPls + autoClaimedPls
      s.pls += autoClaimedPls
    }
  } else {
    forfeitedOnSellPls = unclaimedPls
    coin.forfeitedHolders = coin.forfeitedHolders ?? {}
    coin.forfeitedHolders[cleanMe] = true
  }

  const before = mcapUsd(coin.curve, plsUsd)
  coin.curve = applySell(coin.curve, q)
  const remainingTokens = Math.max(0, heldBefore - q.tokens)
  coin.holders[me] = remainingTokens
  s.pls += q.plsOut
  record(coin, before, now, { t: now, side: 'sell', user: me, tokens: q.tokens, pls: q.plsOut }, plsUsd, isPostMigration, q.fee)
  if (!isPostMigration) routeFee(s, q.fee, false, coin)
  pushLiveEvent(s, {
    t: now,
    kind: 'sell',
    user: me,
    ticker: coin.ticker,
    pls: q.plsOut,
    tokens: q.tokens,
    mcapUsd: mcapUsd(coin.curve, plsUsd),
  })
  commit(s)
  const latestEnriched = computeCoinTradesWithPnl(coin, plsUsd, now)[0]
  const pnlUsd = latestEnriched?.pnlUsd ?? 0
  const pnlPct = latestEnriched?.pnlPct ?? 0
  const heldStr = fmtHoldDuration(latestEnriched?.heldMs ?? 60_000)
  const sign = pnlUsd >= 0 ? '+' : '-'
  const pctSign = pnlPct >= 0 ? '+' : ''
  const keepPct = heldBefore > 0 ? (remainingTokens / heldBefore) * 100 : 0
  const autoClaimNote = isPostMigration
    ? autoClaimedPls > 1
      ? ` · 🎁 Auto-claim: +${fmtPlsPlain(autoClaimedPls)} PLS (${fmtUsd(autoClaimedPls * plsUsd)})`
      : ''
    : forfeitedOnSellPls > 1
      ? ` · ⚠️ Forfeit to holders: -${fmtPlsPlain(forfeitedOnSellPls)} PLS (${fmtUsd(forfeitedOnSellPls * plsUsd)}) redistributed to current holders`
      : ''
  const rateNote =
    remainingTokens <= 1e-4
      ? ' (Bag 100% closed · Running reward counter stopped at 0%)'
      : ` (Running reward counter scaled to ${keepPct.toFixed(0)}% of prior bag)`
  return {
    info: `Sold ${fmtPlsPlain(q.tokens)} $${coin.ticker} for ${fmtPlsPlain(q.plsOut)} PLS · Realized PnL: ${sign}${fmtUsd(Math.abs(pnlUsd))} (${pctSign}${pnlPct.toFixed(1)}%) · Held ${heldStr}${autoClaimNote}${rateNote}.`,
  }
}

export function updateCoinMedia(ticker: string, media: { logoUrl?: string; bannerUrl?: string }): Result {
  const s = clone()
  const coin = s.coins.find((c) => c.ticker === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  if (media.logoUrl !== undefined) coin.logoUrl = media.logoUrl || undefined
  if (media.bannerUrl !== undefined) coin.bannerUrl = media.bannerUrl || undefined
  commit(s)
  return { info: `Updated $${coin.ticker} visual artwork.` }
}

export function updateCoinSocials(ticker: string, socials: { xUrl?: string; websiteUrl?: string }): Result {
  const s = clone()
  const coin = s.coins.find((c) => c.ticker === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  if (socials.xUrl !== undefined) coin.xUrl = socials.xUrl.trim() || undefined
  if (socials.websiteUrl !== undefined) coin.websiteUrl = socials.websiteUrl.trim() || undefined
  commit(s)
  return { info: `Updated $${coin.ticker} X & Website links.` }
}

export function getXVerificationCode(username: string, rawHandle: string): string {
  const cleanUser = username.trim().toLowerCase()
  const cleanHandle = rawHandle.trim().replace(/^@/, '').toLowerCase()
  let h = 2166136261
  const str = `${cleanUser}:${cleanHandle}:uniq.pulse`
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6)
  return `UNIQ-VERIFY:@${cleanUser}:${hex}`
}

function fmtPlsPlain(n: number) {
  return Math.round(n).toLocaleString('en-US')
}

/**
 * Autonomous Multi-Wallet $299 DexScreener Enhanced Token Info Relay (like trade.padre.gg).
 * Supports paying from EITHER an active PulseChain Wallet (PLS / USDC) OR an active Solana Phantom Wallet (SOL / USDC)
 * on the same page, or manual sponsorship by @uniq_pulse Platform Dev. Zero free platform cash rebates are given away.
 */
export function prepayDexScreener(ticker: string, method: DexPayMethod = 'pls'): Result {
  const s = clone()
  const plsUsd = s.plsUsd || PLS_USD
  const solUsd = s.solUsd || DEFAULT_SOL_USD
  const g = tradeGuard(s)
  if (g || !s.username) return { error: g ?? 'Create a username first.' }
  const coin = s.coins.find((c) => c.ticker === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  if (coin.dexPrepaid) return { error: `DexScreener Enhanced Info ($299) is already paid for $${coin.ticker}.` }

  const costPls = Math.round(DEX_PREPAY_USD / plsUsd)
  const costSol = (DEX_PREPAY_USD / solUsd).toFixed(2)

  if (method === 'pls') {
    if (costPls > s.pls + 1e-6) {
      return { error: `Not enough demo PLS (need ${fmtPlsPlain(costPls)} PLS ≈ $${DEX_PREPAY_USD} USD).` }
    }
    s.pls -= costPls
    routeFee(s, costPls * 0.05, true)
  }

  coin.dexPrepaid = true
  coin.dexPrepaidBy = s.username.name
  coin.dexPrepaidAt = Date.now()
  coin.dexPaymentMethod = method
  commit(s)

  const railLabel =
    method === 'sol'
      ? `Phantom Solana Wallet (${costSol} SOL ≈ $${DEX_PREPAY_USD})`
      : method === 'usdc_sol'
      ? `Phantom Solana Wallet (${DEX_PREPAY_USD} USDC)`
      : method === 'usdc_pls'
      ? `PulseChain Wallet (${DEX_PREPAY_USD} USDC)`
      : `PulseChain Wallet (${fmtPlsPlain(costPls)} PLS ≈ $${DEX_PREPAY_USD})`

  return {
    info: `🦅 DEX Paid via ${railLabel}! Autonomous Relay staged $${coin.ticker} Logo, Banner & Socials for DexScreener.`,
  }
}

export function unlinkUserXHandle(): Result {
  const s = clone()
  if (!s.username) return { error: 'Create a username first.' }
  const existing = s.verifiedX?.[s.username.name]
  if (existing) {
    return {
      error: `Permanent X Lock: @${s.username.name} is permanently bound to 𝕏 @${existing}. To prevent devs from renaming/recycling X accounts across multiple rugs, verified X links cannot be unlinked or swapped.`,
    }
  }
  return { info: 'No X handle linked.' }
}

export async function verifyUserXHandleWithTweet(rawHandle: string, tweetUrl: string): Promise<Result> {
  const s = clone()
  if (!s.username) return { error: 'Create a username first.' }
  const alreadyBound = s.verifiedX?.[s.username.name]
  if (alreadyBound) {
    return {
      error: `Permanent X Lock: @${s.username.name} is already permanently bound to 𝕏 @${alreadyBound}. X handles cannot be changed or recycled once verified.`,
    }
  }
  const clean = rawHandle.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/\/.*$/, '')
  if (!/^[A-Za-z0-9_]{1,15}$/.test(clean)) {
    return { error: 'Step 1: Enter the X handle you own (1–15 letters, numbers, or underscores).' }
  }

  // Ensure another @username hasn't already verified this X handle
  const existingOwner = Object.entries(s.verifiedX ?? {}).find(
    ([u, h]) => h.toLowerCase() === clean.toLowerCase() && u.toLowerCase() !== s.username!.name.toLowerCase()
  )
  if (existingOwner) {
    return { error: `𝕏 @${clean} is already permanently bound to @${existingOwner[0]}.` }
  }

  const expectedCode = getXVerificationCode(s.username.name, clean)
  const urlMatch = tweetUrl.trim().match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/i)
  if (!urlMatch) {
    return {
      error: `Anti-spoofing check: To prevent someone from stealing @${clean}, you must post the challenge code (${expectedCode}) from @${clean} on X and paste the tweet URL (https://x.com/${clean}/status/...).`,
    }
  }

  const [, urlAuthor, statusId] = urlMatch
  if (urlAuthor.toLowerCase() !== clean.toLowerCase()) {
    return {
      error: `Tweet author mismatch: that tweet URL belongs to @${urlAuthor}, not @${clean}. You must tweet from @${clean}.`,
    }
  }

  let permanentAuthorId = `xid_${clean.toLowerCase()}`
  try {
    const res = await fetch(`https://api.fxtwitter.com/${clean}/status/${statusId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return { error: `Could not find public tweet ${statusId} from @${clean} on X. Make sure the tweet is public.` }
    }
    const data = await res.json()
    const actualAuthor: string = data?.tweet?.author?.screen_name ?? ''
    const actualAuthorId: string = String(data?.tweet?.author?.id ?? `xid_${clean.toLowerCase()}`)
    const tweetText: string = data?.tweet?.text ?? ''
    if (actualAuthor.toLowerCase() !== clean.toLowerCase()) {
      return { error: `Tweet author (@${actualAuthor}) does not match @${clean}.` }
    }
    if (!tweetText.includes(expectedCode)) {
      return {
        error: `Tweet found from @${actualAuthor}, but it does not contain your challenge code "${expectedCode}". Post the exact challenge tweet and try again.`,
      }
    }
    permanentAuthorId = actualAuthorId
    // Check if this underlying numeric X account ID was previously bound under a different handle (renamed Twitter check!)
    const recycledAccount = Object.entries(s.verifiedXId ?? {}).find(
      ([u, id]) => id === permanentAuthorId && u.toLowerCase() !== s.username!.name.toLowerCase()
    )
    if (recycledAccount) {
      return {
        error: `Anti-Recycling Block: This X account (ID ${permanentAuthorId}) was previously bound to @${recycledAccount[0]} under @${s.verifiedX[recycledAccount[0]]}. Renaming an X account to recycle it on a new profile is blocked.`,
      }
    }
  } catch {
    return { error: 'Could not reach X verification relay. Check your connection and try again.' }
  }

  const next = clone()
  if (!next.username) return { error: 'Create a username first.' }
  next.verifiedX = next.verifiedX ?? {}
  next.verifiedXId = next.verifiedXId ?? {}
  next.verifiedX[next.username.name] = clean
  next.verifiedXId[next.username.name] = permanentAuthorId
  next.username.xHandle = clean
  commit(next)
  return { info: `✓ Ownership confirmed & permanently locked! @${clean} (X ID: ${permanentAuthorId}) is now immutably bound to @${next.username.name}.` }
}

export function postCoinComment(ticker: string, rawText: string, requireHolder = false): Result {
  const s = clone()
  const g = tradeGuard(s)
  if (g || !s.username) return { error: 'Anti-bot protection: only registered @usernames (1 wallet = 1 username) can comment.' }
  const coin = s.coins.find((c) => c.ticker === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  const me = s.username.name
  const held = coin.holders[me] ?? 0
  const isCreator = coin.launcher.toLowerCase() === me.toLowerCase()

  if (requireHolder && held <= 0 && !isCreator) {
    return { error: `Anti-bot filter: you must hold $${coin.ticker} (or be its creator) to post when Holders-Only mode is active.` }
  }

  const text = rawText.trim().replace(/\s+/g, ' ')
  if (text.length < 2) return { error: 'Comment is too short.' }
  if (text.length > 240) return { error: 'Max 240 characters per comment.' }

  // Block bot spam links (Telegram, Discord, external URLs, pump.fun shills)
  if (/(https?:\/\/|t\.me\/|discord\.gg\/|telegram\.me|pump\.fun)/i.test(text)) {
    return { error: 'Anti-bot filter: external links, Telegram invites, and spam URLs are blocked in coin threads.' }
  }

  const existing = coin.comments ?? []
  const lastMine = existing.find((c) => c.user.toLowerCase() === me.toLowerCase())
  if (lastMine && lastMine.text.toLowerCase() === text.toLowerCase()) {
    return { error: 'Anti-bot filter: duplicate message blocked.' }
  }
  if (lastMine && Date.now() - lastMine.t < 4_000) {
    return { error: 'Anti-bot cooldown: wait a few seconds between comments.' }
  }

  const nextComment: CoinComment = {
    id: `${coin.ticker}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    t: Date.now(),
    user: me,
    text,
  }
  coin.comments = [nextComment, ...existing].slice(0, 80)
  commit(s)
  return { info: 'Posted to thread.' }
}

export const coinPrice = (c: Coin) => pricePls(c.curve)
export const DEMO_USERNAMES = DEMO_USERS

export interface HolderTierInfo {
  tier: number
  emoji: string
  label: string
  multiplier: number
  migratedHeldCount: number
  totalHeldCount: number
}

/**
 * Upgrading Trusted Holder Emoji Badge:
 * The more tokens a user holds through migration (or in the curve), the higher their Trusted Holder Emoji Icon upgrades!
 */
export function getHolderTierBadge(username: string, coins: Coin[]): HolderTierInfo {
  const clean = username.toLowerCase()
  let migratedHeldCount = 0
  let totalHeldCount = 0
  for (const c of coins) {
    const held = Object.entries(c.holders).find(([u]) => u.toLowerCase() === clean)?.[1] ?? 0
    if (held > 1e-4) {
      totalHeldCount += 1
      if (c.curve.graduated) migratedHeldCount += 1
    }
  }
  const score = migratedHeldCount * 3 + totalHeldCount
  if (migratedHeldCount >= 10 || score >= 12) {
    return { tier: 4, emoji: '🏆', label: 'Top Holder Legend (10+ Held)', multiplier: 1.0, migratedHeldCount, totalHeldCount }
  }
  if (migratedHeldCount >= 3 || score >= 7) {
    return { tier: 3, emoji: '💎', label: 'Diamond Migration Holder', multiplier: 1.0, migratedHeldCount, totalHeldCount }
  }
  if (migratedHeldCount >= 1 || score >= 3) {
    return { tier: 2, emoji: '🛡️', label: 'Trusted Migration Holder', multiplier: 1.0, migratedHeldCount, totalHeldCount }
  }
  if (totalHeldCount >= 1) {
    return { tier: 1, emoji: '🌱', label: 'Curve Holder', multiplier: 1.0, migratedHeldCount, totalHeldCount }
  }
  return { tier: 0, emoji: '', label: 'Trader', multiplier: 1.0, migratedHeldCount: 0, totalHeldCount: 0 }
}

export interface UserCoinRewardItem {
  ticker: string
  coinName: string
  graduated: boolean
  userTokens: number
  sharePct: number
  holderPoolPls: number
  userHolderRewardPls: number
  holderAlreadyClaimedPls: number
  holderClaimableNowPls: number
  holderLockedPendingPls: number
  isCreator: boolean
  creatorRewardPls: number
  creatorAlreadyClaimedPls: number
  creatorClaimableNowPls: number
  creatorLockedPendingPls: number
  alreadyClaimedPls: number
  claimableNowPls: number
  lockedPendingPls: number
  /** PLS accrued inside active (unmatured) dev locks — "Accruing, paid at maturity", not claimable yet. */
  lockedInDevLocksPls?: number
  forfeited?: boolean
  forfeitedPls?: number
  canHarvest?: boolean
  nextHarvestThresholdPls?: number
}

export interface UserRewardsSummary {
  tier: HolderTierInfo
  items: UserCoinRewardItem[]
  totalClaimablePls: number
  totalPendingLockedPls: number
  totalAlreadyClaimedPls: number
}

export interface CoinHolderRewardAccount {
  user: string
  currentTokens: number
  earnedPls: number
  sharePct: number
  forfeitedPls: number
  forfeitedBySell: boolean
}

export interface DevLockAccrualInfo {
  lock: DevLock
  effectiveStatus: 'active' | 'matured' | 'broken'
  accruedPls: number
  claimableAtMaturity: boolean
}

interface SimulatedRewardsAndLocks {
  holdersMap: Record<string, CoinHolderRewardAccount>
  lockAccruedPls: Record<string, number>
}

/**
 * Time-checkpointed simulation of holder fee events and dev locks on `coin`:
 * - A dev lock's boost weight ONLY counts for holder fees that arrive while the lock is active
 *   (`lock.createdAt <= eventTs < effectiveEndTs(lock)`).
 * - A lock ONLY accrues PLS from fees that arrive after it was created and while it is active.
 * - At maturity (`eventTs >= lock.unlockAt`), the lock's weight goes back to 1x, and its accrued PLS moves to claimable.
 * - Early unlock forfeits ONLY what that broken lock accrued (`lockAccruedPls[lock.id]`), redistributing it to other holders.
 * - Creating or extending a dev lock never changes past trade fee distributions or reduces other holders' already-earned rewards.
 */
function simulateCoinRewardsAndLocks(coin: Coin, _nowMs = Date.now()): SimulatedRewardsAndLocks {
  const chrono = [...coin.trades].reverse()
  const launcherKey = coin.launcher.toLowerCase()
  const allLocks = coin.devLocks ?? []
  const lockAccruedPls: Record<string, number> = {}
  for (const l of allLocks) {
    lockAccruedPls[l.id] = 0
  }

  const accounts: Record<
    string,
    {
      user: string
      bal: number
      accrued: number
      forfeitedPls: number
      forfeitedBySell: boolean
    }
  > = {}

  let simCurveReservePls = 0
  let hasGraduatedInReplay = false
  const gradTs = coin.graduatedAt ?? coin.curve.graduatedAt
  let lastPreGradTradeTs = coin.createdAt
  let gradSnapshotTaken = false
  const gradSnapshotBalances: Record<string, { bal: number; forfeitedBySell: boolean }> = {}

  function takeGraduationSnapshot() {
    if (gradSnapshotTaken) return
    gradSnapshotTaken = true
    if (coin.graduationBalances && Object.keys(coin.graduationBalances).length > 0) {
      for (const [u, b] of Object.entries(coin.graduationBalances)) {
        const uKey = u.toLowerCase()
        gradSnapshotBalances[uKey] = {
          bal: Math.max(0, b),
          forfeitedBySell: Boolean(accounts[uKey]?.forfeitedBySell),
        }
      }
    } else {
      for (const [uKey, a] of Object.entries(accounts)) {
        gradSnapshotBalances[uKey] = {
          bal: Math.max(0, a.bal),
          forfeitedBySell: a.forfeitedBySell,
        }
      }
    }
  }

  function computeUnitsAt(
    eventTs: number,
    balances: Record<string, { bal: number; forfeitedBySell?: boolean }>,
    opts?: { excludeUserKey?: string; requireNotForfeited?: boolean }
  ): {
    totalEffUnits: number
    userEffUnits: Record<string, number>
    devLockEffUnits: Record<string, number>
  } {
    let totalEffUnits = 0
    const userEffUnits: Record<string, number> = {}
    const devLockEffUnits: Record<string, number> = {}

    for (const [uKey, info] of Object.entries(balances)) {
      if (opts?.excludeUserKey && uKey === opts.excludeUserKey) continue
      if (opts?.requireNotForfeited && info.forfeitedBySell) continue
      const rawBal = Math.max(0, info.bal)
      if (rawBal <= 1e-6) continue

      if (uKey !== launcherKey) {
        userEffUnits[uKey] = rawBal
        totalEffUnits += rawBal
      } else {
        const activeLocksAtTs = allLocks.filter((l) => isLockActiveAt(l, eventTs))
        if (activeLocksAtTs.length === 0) {
          userEffUnits[uKey] = rawBal
          totalEffUnits += rawBal
        } else {
          let remainingToWeight = rawBal
          let devTotalUnits = 0
          for (const l of activeLocksAtTs) {
            const lockedPortion = Math.min(remainingToWeight, Math.max(0, l.amountTokens))
            remainingToWeight = Math.max(0, remainingToWeight - lockedPortion)
            const w = getLockBoostWeightAt(l, eventTs)
            const lUnits = lockedPortion * w
            devLockEffUnits[l.id] = lUnits
            devTotalUnits += lUnits
          }
          devTotalUnits += remainingToWeight // Unlocked dev tokens get 1x weight
          userEffUnits[uKey] = devTotalUnits
          totalEffUnits += devTotalUnits
        }
      }
    }

    return { totalEffUnits, userEffUnits, devLockEffUnits }
  }

  function distributeFeeAt(
    eventTs: number,
    feePls: number,
    balances: Record<string, { bal: number; forfeitedBySell?: boolean }>,
    opts?: {
      excludeUserKey?: string
      requireNotForfeited?: boolean
      fallbackIgnoreForfeited?: boolean
      fallbackIncludeExcluded?: boolean
    }
  ): number {
    if (feePls <= 0) return 0
    let units = computeUnitsAt(eventTs, balances, {
      excludeUserKey: opts?.excludeUserKey,
      requireNotForfeited: opts?.requireNotForfeited,
    })
    if (units.totalEffUnits <= 1e-6 && opts?.fallbackIgnoreForfeited) {
      units = computeUnitsAt(eventTs, balances, {
        excludeUserKey: opts?.excludeUserKey,
        requireNotForfeited: false,
      })
    }
    if (units.totalEffUnits <= 1e-6 && opts?.fallbackIncludeExcluded) {
      units = computeUnitsAt(eventTs, balances, {
        requireNotForfeited: false,
      })
    }
    if (units.totalEffUnits <= 1e-6) return 0

    for (const [uKey, uEff] of Object.entries(units.userEffUnits)) {
      if (uEff > 0 && accounts[uKey]) {
        accounts[uKey].accrued += feePls * (uEff / units.totalEffUnits)
      }
    }
    for (const [lockId, lEff] of Object.entries(units.devLockEffUnits)) {
      if (lEff > 0) {
        lockAccruedPls[lockId] = (lockAccruedPls[lockId] ?? 0) + feePls * (lEff / units.totalEffUnits)
      }
    }
    return feePls
  }

  for (const tr of chrono) {
    const isTradeAfterGraduation =
      coin.curve.graduated && ((gradTs !== undefined && tr.t > gradTs) || hasGraduatedInReplay)
    if (isTradeAfterGraduation && !gradSnapshotTaken) {
      takeGraduationSnapshot()
    }

    const uKey = tr.user.toLowerCase()
    if (!accounts[uKey]) {
      accounts[uKey] = {
        user: tr.user,
        bal: 0,
        accrued: 0,
        forfeitedPls: 0,
        forfeitedBySell: false,
      }
    }
    const acc = accounts[uKey]
    const tradeHolderFee = isTradeAfterGraduation ? 0 : tr.pls * 0.005

    if (tr.side === 'buy') {
      acc.bal += tr.tokens
      acc.forfeitedBySell = false
      if (tradeHolderFee > 0) {
        distributeFeeAt(tr.t, tradeHolderFee, accounts)
      }
      if (!hasGraduatedInReplay) {
        lastPreGradTradeTs = tr.t
        simCurveReservePls += tr.pls * (1 - FEE_RATE)
        if (
          coin.curve.graduated &&
          ((gradTs !== undefined && tr.t >= gradTs) || simCurveReservePls >= GRAD_PLS - 1000)
        ) {
          hasGraduatedInReplay = true
          takeGraduationSnapshot()
        }
      }
    } else {
      const isPostMigrationSell = isTradeAfterGraduation
      const balBefore = acc.bal
      const sold = Math.min(balBefore, tr.tokens)
      acc.bal = Math.max(0, balBefore - sold)

      if (!isPostMigrationSell) {
        lastPreGradTradeTs = tr.t
        simCurveReservePls = Math.max(0, simCurveReservePls - tr.pls / (1 - FEE_RATE))
        const forfeited = acc.accrued
        acc.accrued = 0
        acc.forfeitedPls += forfeited
        acc.forfeitedBySell = true
        if (uKey === launcherKey) {
          for (const k of Object.keys(lockAccruedPls)) {
            lockAccruedPls[k] = 0
          }
        }
        if (forfeited > 0) {
          distributeFeeAt(tr.t, forfeited, accounts, {
            excludeUserKey: uKey,
            fallbackIncludeExcluded: true,
          })
        }
      }

      if (tradeHolderFee > 0) {
        distributeFeeAt(tr.t, tradeHolderFee, accounts, {
          excludeUserKey: !isPostMigrationSell ? uKey : undefined,
          fallbackIncludeExcluded: true,
        })
      }
    }
  }

  // Ensure any holders in coin.holders are synced
  for (const [u, heldTokens] of Object.entries(coin.holders)) {
    const uKey = u.toLowerCase()
    if (!accounts[uKey]) {
      const isFlagged = Boolean(coin.forfeitedHolders?.[uKey])
      accounts[uKey] = {
        user: u,
        bal: Math.max(0, heldTokens),
        accrued: 0,
        forfeitedPls: 0,
        forfeitedBySell: isFlagged,
      }
    } else {
      accounts[uKey].bal = Math.max(0, heldTokens)
    }
  }

  if (coin.curve.graduated && !gradSnapshotTaken) {
    takeGraduationSnapshot()
  }

  const poolTotalPls = Math.max(0, coin.holderRewardPoolPls ?? 0)
  const sumAccruedBeforeExtra = Object.values(accounts).reduce((s, a) => s + a.accrued, 0)
  let remainingExtraPls = Math.max(0, poolTotalPls - sumAccruedBeforeExtra)
  const sumExplicitLpHarvests = (coin.lpHarvests ?? []).reduce((s, h) => s + Math.max(0, h.holderPls), 0)
  const nonHarvestExtraPls = Math.max(0, remainingExtraPls - sumExplicitLpHarvests)

  // Step A: Split the 1.5M PLS graduation holder bonus strictly by balances AT the graduation moment!
  const gradEventTs =
    gradTs ?? (lastPreGradTradeTs || (chrono.length > 0 ? chrono[chrono.length - 1].t : coin.createdAt))
  if (
    coin.curve.graduated &&
    nonHarvestExtraPls > 0 &&
    (nonHarvestExtraPls >= GRADUATION_HOLDER_PLS - 1 ||
      Boolean(coin.graduationBalances) ||
      gradTs !== undefined)
  ) {
    const gradBonusPls = Math.min(GRADUATION_HOLDER_PLS, nonHarvestExtraPls)
    const distributedGrad = distributeFeeAt(gradEventTs, gradBonusPls, gradSnapshotBalances, {
      requireNotForfeited: true,
      fallbackIgnoreForfeited: true,
    })
    remainingExtraPls = Math.max(0, remainingExtraPls - distributedGrad)
  }

  // Step B1: Distribute explicit timestamped post-migration LP vault harvests at their exact harvest timestamp
  if (remainingExtraPls > 0 && coin.lpHarvests && coin.lpHarvests.length > 0) {
    for (const h of coin.lpHarvests) {
      if (remainingExtraPls <= 0) break
      const amt = Math.min(remainingExtraPls, Math.max(0, h.holderPls))
      if (amt > 0) {
        const dist = distributeFeeAt(h.t, amt, accounts, {
          requireNotForfeited: true,
          fallbackIgnoreForfeited: true,
        })
        remainingExtraPls = Math.max(0, remainingExtraPls - dist)
      }
    }
  }

  // Step B2: Distribute any remaining baseline pool PLS at the coin's last trade/graduation timestamp
  // (never backwards across locks created after all trades!)
  if (remainingExtraPls > 0) {
    const baselineEventTs = Math.max(
      coin.createdAt,
      gradTs ?? 0,
      chrono.length > 0 ? chrono[chrono.length - 1].t : 0
    )
    distributeFeeAt(baselineEventTs, remainingExtraPls, accounts, {
      requireNotForfeited: true,
      fallbackIgnoreForfeited: true,
    })
    remainingExtraPls = 0
  }

  // Step C: If the dev broke any lock (early unlock), forfeit ONLY what that broken lock accrued to the other current holders!
  const brokenLocks = allLocks.filter((l) => l.status === 'broken')
  let totalBrokenLockForfeit = 0
  for (const bl of brokenLocks) {
    const accruedByBrokenLock =
      (lockAccruedPls[bl.id] ?? 0) > 1e-6 ? lockAccruedPls[bl.id] : Math.max(0, bl.forfeitedPls ?? 0)
    lockAccruedPls[bl.id] = 0
    totalBrokenLockForfeit += accruedByBrokenLock
  }
  if (brokenLocks.length === 0 && (coin.forfeitedLockRewardsPls ?? 0) > 0) {
    totalBrokenLockForfeit = Math.max(0, coin.forfeitedLockRewardsPls ?? 0)
  }

  if (totalBrokenLockForfeit > 0) {
    const devAcc = accounts[launcherKey]
    const actualDeduct = devAcc ? Math.min(devAcc.accrued, totalBrokenLockForfeit) : totalBrokenLockForfeit
    if (devAcc) {
      devAcc.accrued = Math.max(0, devAcc.accrued - actualDeduct)
      devAcc.forfeitedPls += actualDeduct
    }
    const otherHoldersRawSum = Object.entries(accounts).reduce(
      (s, [uKey, a]) => s + (uKey !== launcherKey && !a.forfeitedBySell && a.bal > 1e-6 ? a.bal : 0),
      0
    )
    if (otherHoldersRawSum > 1e-6 && actualDeduct > 0) {
      for (const [uKey, a] of Object.entries(accounts)) {
        if (uKey !== launcherKey && !a.forfeitedBySell && a.bal > 1e-6) {
          a.accrued += actualDeduct * (a.bal / otherHoldersRawSum)
        }
      }
    }
  }

  // Strict Solvency Cap: Total rewards across all holders can NEVER exceed coin.holderRewardPoolPls (100% max)
  const totalAccrued = Object.values(accounts).reduce((s, a) => s + a.accrued, 0)
  const scale = totalAccrued > poolTotalPls && totalAccrued > 0 ? poolTotalPls / totalAccrued : 1

  const holdersMap: Record<string, CoinHolderRewardAccount> = {}
  for (const [uKey, a] of Object.entries(accounts)) {
    const earnedPls = a.accrued * scale
    holdersMap[uKey] = {
      user: a.user,
      currentTokens: a.bal,
      earnedPls,
      sharePct: poolTotalPls > 0 ? (earnedPls / poolTotalPls) * 100 : 0,
      forfeitedPls: a.forfeitedPls,
      forfeitedBySell: a.forfeitedBySell && a.accrued < 1,
    }
  }

  const devFinalEarned = holdersMap[launcherKey]?.earnedPls ?? 0
  const sumLockAccrued = Object.values(lockAccruedPls).reduce((s, v) => s + v * scale, 0)
  const lockScale =
    sumLockAccrued > devFinalEarned && sumLockAccrued > 0 ? (devFinalEarned / sumLockAccrued) * scale : scale
  for (const k of Object.keys(lockAccruedPls)) {
    lockAccruedPls[k] = lockAccruedPls[k] * lockScale
  }

  return { holdersMap, lockAccruedPls }
}

/**
 * Computes per-lock accrued PLS for each DevLock on `coin`, plus the split between:
 * - `activeLockedRewardsPls` ("Accruing, paid at maturity" — NOT claimable during the lock)
 * - `unlockedOrMaturedRewardsPls` (unlocked tokens + matured locks — automatically included in claimable balance)
 */
export function computeDevLockAccruals(
  coin: Coin,
  nowMs = Date.now(),
  precomputedDevEarnedPls?: number
): {
  locks: DevLockAccrualInfo[]
  activeLockedRewardsPls: number
  unlockedOrMaturedRewardsPls: number
} {
  const launcherKey = coin.launcher.toLowerCase()
  const sim = simulateCoinRewardsAndLocks(coin, nowMs)
  const devEarnedPls =
    precomputedDevEarnedPls !== undefined
      ? precomputedDevEarnedPls
      : sim.holdersMap[launcherKey]?.earnedPls ?? 0

  const allLocks = coin.devLocks ?? []
  if (allLocks.length === 0 || devEarnedPls <= 1e-6) {
    return {
      locks: allLocks.map((l) => ({
        lock: l,
        effectiveStatus: getEffectiveLockStatus(l, nowMs),
        accruedPls: 0,
        claimableAtMaturity: getEffectiveLockStatus(l, nowMs) === 'matured',
      })),
      activeLockedRewardsPls: 0,
      unlockedOrMaturedRewardsPls: devEarnedPls,
    }
  }

  let activeLockedRewardsPls = 0
  const lockInfos: DevLockAccrualInfo[] = []

  for (const l of allLocks) {
    const effStatus = getEffectiveLockStatus(l, nowMs)
    if (effStatus === 'broken') {
      lockInfos.push({
        lock: l,
        effectiveStatus: 'broken',
        accruedPls: 0,
        claimableAtMaturity: false,
      })
      continue
    }
    const sharePls = Math.min(devEarnedPls, Math.max(0, sim.lockAccruedPls[l.id] ?? 0))
    if (effStatus === 'active') {
      activeLockedRewardsPls += sharePls
    }
    lockInfos.push({
      lock: l,
      effectiveStatus: effStatus,
      accruedPls: sharePls,
      claimableAtMaturity: effStatus === 'matured',
    })
  }

  activeLockedRewardsPls = Math.min(devEarnedPls, activeLockedRewardsPls)
  const unlockedOrMaturedRewardsPls = Math.max(0, devEarnedPls - activeLockedRewardsPls)
  return {
    locks: lockInfos,
    activeLockedRewardsPls,
    unlockedOrMaturedRewardsPls,
  }
}

/**
 * Synthetix / MasterChef time-checkpointed reward accumulator over the coin's chronological trade stream:
 *  1) Each curve trade's 0.50% holder fee is split at `tr.t` using only dev locks active at `tr.t`.
 *  2) Pre-migration sells forfeit 100% of that wallet's unclaimed rewards to remaining holders; rebuys reset reward debt.
 *  3) The 1.5M PLS graduation holder bonus is split strictly by balances AT the graduation moment (post-grad buyers get 0 of it).
 *  4) Post-migration LP harvests are split across holders who hold at harvest with active lock weights at harvest timestamp.
 *  5) Total rewards across all holders are strictly bounded by `coin.holderRewardPoolPls` (nothing minted).
 */
export function computeCoinHolderRewardsMap(coin: Coin, nowMs = Date.now()): Record<string, CoinHolderRewardAccount> {
  return simulateCoinRewardsAndLocks(coin, nowMs).holdersMap
}

/**
 * Calculates a user's pro-rata share of the 0.50% Curve + Graduation + Post-Migration Locked-LP Holder Pool + 0.25% Creator Pool
 * using the Synthetix/MasterChef rewardPerTokenStored time-weighted accumulator (never exceeds 100% of pool!).
 * Rewards earned by active (unmatured) dev locks are NOT claimable during the lock and automatically become claimable at maturity.
 */
export function computeUserRewards(username: string, coins: Coin[], nowMs = Date.now()): UserRewardsSummary {
  const clean = username.toLowerCase()
  const tier = getHolderTierBadge(username, coins)
  const items: UserCoinRewardItem[] = []
  let totalClaimablePls = 0
  let totalPendingLockedPls = 0
  let totalAlreadyClaimedPls = 0

  for (const c of coins) {
    const userEntry = Object.entries(c.holders).find(([u]) => u.toLowerCase() === clean)
    const userTokens = userEntry ? userEntry[1] : 0
    const isCreator = c.launcher.toLowerCase() === clean
    const rewardsMap = computeCoinHolderRewardsMap(c, nowMs)
    const acct = rewardsMap[clean]
    const hasForfeited = Boolean(acct?.forfeitedBySell || (acct?.forfeitedPls ?? 0) > 1e-4)
    if (userTokens <= 1e-4 && !isCreator && (!acct || acct.earnedPls <= 1e-4) && !hasForfeited) continue

    const holderPoolPls = c.holderRewardPoolPls ?? 0
    const rawHolderReward = acct ? acct.earnedPls : 0
    const shareRatio = holderPoolPls > 0 ? rawHolderReward / holderPoolPls : 0
    const isForfeited = Boolean(hasForfeited && rawHolderReward < 1)
    const forfeitedPls = acct?.forfeitedPls ?? 0
    const creatorRewardPls = isCreator ? (c.devRewardPoolPls ?? 0) : 0

    // If this user is the coin creator and has active (unmatured) dev locks, rewards earned by active locks are NOT claimable until maturity!
    let activeDevLockRewardsPls = 0
    if (isCreator && (c.devLocks?.length ?? 0) > 0) {
      const lockAccruals = computeDevLockAccruals(c, nowMs, rawHolderReward)
      activeDevLockRewardsPls = lockAccruals.activeLockedRewardsPls
    }

    const unlockedHolderReward = Math.max(0, rawHolderReward - activeDevLockRewardsPls)
    const rawHolderClaimed = c.claimedHolderRewards?.[clean] ?? 0
    const holderAlreadyClaimedPls = Math.min(rawHolderReward, rawHolderClaimed)
    const overflowClaimed = Math.max(0, rawHolderClaimed - rawHolderReward)
    const creatorAlreadyClaimedPls = Math.min(
      creatorRewardPls,
      (c.claimedCreatorRewards?.[clean] ?? 0) + overflowClaimed
    )

    const holderMaturityUnlockedRemainingPls = isForfeited
      ? 0
      : Math.max(0, unlockedHolderReward - holderAlreadyClaimedPls)
    const holderTotalRemainingPls = isForfeited
      ? 0
      : Math.max(0, rawHolderReward - holderAlreadyClaimedPls)
    const creatorRemainingPls = Math.max(0, creatorRewardPls - creatorAlreadyClaimedPls)

    const holderClaimableNowPls = c.curve.graduated ? holderMaturityUnlockedRemainingPls : 0
    const holderLockedPendingPls = c.curve.graduated
      ? Math.max(0, holderTotalRemainingPls - holderMaturityUnlockedRemainingPls)
      : holderTotalRemainingPls
    const creatorClaimableNowPls = c.curve.graduated ? creatorRemainingPls : 0
    const creatorLockedPendingPls = c.curve.graduated ? 0 : creatorRemainingPls

    const alreadyClaimedPls = holderAlreadyClaimedPls + creatorAlreadyClaimedPls
    const claimableNowPls = holderClaimableNowPls + creatorClaimableNowPls
    const lockedPendingPls = holderLockedPendingPls + creatorLockedPendingPls

    totalClaimablePls += claimableNowPls
    totalPendingLockedPls += lockedPendingPls
    totalAlreadyClaimedPls += alreadyClaimedPls

    items.push({
      ticker: c.ticker,
      coinName: c.name,
      graduated: c.curve.graduated,
      userTokens,
      sharePct: shareRatio * 100,
      holderPoolPls,
      userHolderRewardPls: rawHolderReward,
      holderAlreadyClaimedPls,
      holderClaimableNowPls,
      holderLockedPendingPls,
      lockedInDevLocksPls: activeDevLockRewardsPls,
      isCreator,
      creatorRewardPls,
      creatorAlreadyClaimedPls,
      creatorClaimableNowPls,
      creatorLockedPendingPls,
      alreadyClaimedPls,
      claimableNowPls,
      lockedPendingPls,
      forfeited: isForfeited,
      forfeitedPls,
      canHarvest: RewardsRouter.canHarvest(c),
      nextHarvestThresholdPls: HARVEST_THRESHOLD_PLS,
    })
  }

  return {
    tier,
    items,
    totalClaimablePls,
    totalPendingLockedPls,
    totalAlreadyClaimedPls,
  }
}

export const HARVEST_THRESHOLD_PLS = 50_000

export const RewardsRouter = {
  /** Minimum accumulated fee threshold to trigger a vault harvest per coin. */
  harvestThresholdPls: HARVEST_THRESHOLD_PLS,

  /** Returns true ONLY when a graduated coin's pending vault fees >= HARVEST_THRESHOLD_PLS. */
  canHarvest(coin: Coin): boolean {
    if (!coin.curve.graduated) return false
    const pendingVaultFees = coin.unharvestedLpFeesPls ?? 0
    return pendingVaultFees >= HARVEST_THRESHOLD_PLS
  },

  /** Harvests pending LP vault fees using the 40% holders / 20% creator / 40% platform split. */
  harvestVault(coin: Coin, nowMs?: number): number {
    if (!this.canHarvest(coin)) return 0
    const pending = coin.unharvestedLpFeesPls ?? 0
    if (pending > 0) {
      backfillCoinFeeSources(coin)
      const f = splitFee(pending, PLS_USD)
      coin.holderRewardPoolPls = (coin.holderRewardPoolPls ?? 0) + f.holdersPoolPls
      coin.devRewardPoolPls = (coin.devRewardPoolPls ?? 0) + f.creatorPoolPls
      coin.platformFeePls = (coin.platformFeePls ?? 0) + f.platformPls
      coin.holderLpPls = (coin.holderLpPls ?? 0) + f.holdersPoolPls
      coin.creatorLpPls = (coin.creatorLpPls ?? 0) + f.creatorPoolPls
      coin.platformLpPls = (coin.platformLpPls ?? 0) + f.platformPls
      coin.unharvestedLpFeesPls = 0
      const latestTradeTs = coin.trades.reduce((m, tr) => Math.max(m, tr.t), 0)
      const harvestTs = nowMs ?? Math.max(Date.now(), latestTradeTs + 1, (coin.graduatedAt ?? 0) + 1)
      coin.lpHarvests = [...(coin.lpHarvests ?? []), { t: harvestTs, holderPls: f.holdersPoolPls }]
      return pending
    }
    return 0
  },

  /**
   * For each coin in `coins`, harvests the vault if `canHarvest(coin)` is true,
   * matures any expired dev locks, and pays the user's claimable holder + creator rewards in PLS in one transaction.
   * Locked (pre-migration), active dev-locked, and forfeited rewards are NEVER paid. Claiming twice pays 0.
   */
  claimAll(
    username: string,
    coins: Coin[],
    opts?: { onlyTicker?: string; role?: 'all' | 'holder' | 'creator'; nowMs?: number }
  ): { totalPaidPls: number; perCoinPaid: Record<string, number>; harvestedTickers: string[] } {
    const clean = username.toLowerCase()
    const role = opts?.role ?? 'all'
    const nowMs = opts?.nowMs ?? Date.now()
    const harvestedTickers: string[] = []
    const perCoinPaid: Record<string, number> = {}
    let totalPaidPls = 0

    for (const c of coins) {
      if (opts?.onlyTicker && c.ticker !== opts.onlyTicker) continue
      if (this.canHarvest(c)) {
        const h = this.harvestVault(c, nowMs)
        if (h > 0) harvestedTickers.push(c.ticker)
      }
      // Mark any locks that have reached full maturity as 'matured'
      if (c.devLocks) {
        for (const l of c.devLocks) {
          if (l.status === 'active' && nowMs >= l.unlockAt) {
            l.status = 'matured'
            l.maturedAt = nowMs
          }
        }
      }
    }

    const summary = computeUserRewards(username, coins, nowMs)
    for (const item of summary.items) {
      if (opts?.onlyTicker && item.ticker !== opts.onlyTicker) continue
      if (!item.graduated) continue // Locked until migration: never paid

      const coin = coins.find((c) => c.ticker === item.ticker)
      if (!coin) continue

      const payHolder = role === 'all' || role === 'holder' ? (item.forfeited ? 0 : item.holderClaimableNowPls) : 0
      const payCreator = role === 'all' || role === 'creator' ? item.creatorClaimableNowPls : 0
      const coinPaid = payHolder + payCreator

      if (coinPaid > 0) {
        if (payHolder > 0) {
          coin.claimedHolderRewards = coin.claimedHolderRewards ?? {}
          coin.claimedHolderRewards[clean] = (coin.claimedHolderRewards[clean] ?? 0) + payHolder
        }
        if (payCreator > 0) {
          coin.claimedCreatorRewards = coin.claimedCreatorRewards ?? {}
          coin.claimedCreatorRewards[clean] = (coin.claimedCreatorRewards[clean] ?? 0) + payCreator
          coin.devRewardClaimed = true
        }
        perCoinPaid[coin.ticker] = coinPaid
        totalPaidPls += coinPaid
      }
    }

    return { totalPaidPls, perCoinPaid, harvestedTickers }
  },
}

export function claimUserMigrationRewards(opts?: {
  onlyTicker?: string
  role?: 'all' | 'holder' | 'creator'
}): Result {
  const s = clone()
  const g = tradeGuard(s)
  if (g || !s.username) return { error: g ?? 'Create a username first.' }
  const { totalPaidPls, perCoinPaid } = RewardsRouter.claimAll(s.username.name, s.coins, opts)
  if (totalPaidPls <= 1e-4) {
    const summary = computeUserRewards(s.username.name, s.coins)
    return {
      error:
        summary.totalPendingLockedPls > 0
          ? `Your ${fmtPlsPlain(summary.totalPendingLockedPls)} PLS in rewards is locked until migration (200M PLS bond).`
          : 'No claimable PLS rewards available right now.',
    }
  }
  s.pls += totalPaidPls
  commit(s)
  const coinCount = Object.keys(perCoinPaid).length
  return {
    info: `💰 RewardsRouter.claimAll paid ${fmtPlsPlain(totalPaidPls)} PLS (${fmtUsd(totalPaidPls * (s.plsUsd || PLS_USD))}) across ${coinCount} coin(s) in one transaction to @${s.username.name}!`,
  }
}

export interface ProtocolStats {
  /** Real 24h trade volume (trades with t >= nowMs - 86,400,000). */
  dailyVolumePls: number
  dailyVolumeUsd: number
  /** All-time trade volume across all coins (curveVolumePls + pulsexVolumePls). */
  allTimeVolumePls: number
  allTimeVolumeUsd: number
  /** Bonding curve volume before migration. */
  curveVolumePls: number
  curveVolumeUsd: number
  /** Post-migration PulseX DEX volume after migration. */
  pulsexVolumePls: number
  pulsexVolumeUsd: number

  /** Holders (0.50% curve + 1.5M migration + 40% LP) */
  holderCurvePls: number
  holderCurveUsd: number
  holderMigrationPls: number
  holderMigrationUsd: number
  holderLpPls: number
  holderLpUsd: number
  totalHolderRewardsPls: number
  totalHolderRewardsUsd: number

  /** Creators (0.25% curve + 0.5M migration + 20% LP) — sum(devRewardPoolPls) ONLY */
  creatorCurvePls: number
  creatorCurveUsd: number
  creatorMigrationPls: number
  creatorMigrationUsd: number
  creatorLpPls: number
  creatorLpUsd: number
  totalDevRewardsPls: number
  totalDevRewardsUsd: number

  /** Platform (0.50% curve + 2M migration + 40% LP + launch fees) */
  platformCurvePls: number
  platformCurveUsd: number
  platformMigrationPls: number
  platformMigrationUsd: number
  platformLpPls: number
  platformLpUsd: number
  platformLaunchPls: number
  platformLaunchUsd: number
  platformDevRevenuePls: number
  platformDevRevenueUsd: number

  /** Pending LP fees (not yet split) = sum(unharvestedLpFeesPls) */
  pendingLpFeesPls: number
  pendingLpFeesUsd: number

  /** Combined per-source totals for the Total tile sub-list */
  totalCurveFeesPls: number
  totalCurveFeesUsd: number
  totalMigrationFeesPls: number
  totalMigrationFeesUsd: number
  totalHarvestedLpFeesPls: number
  totalHarvestedLpFeesUsd: number

  /** Total = holders + creators + platform + pending */
  totalFeesPaidPls: number
  totalFeesPaidUsd: number
}

/**
 * Computes real stored protocol fee accruals and volume splits across all coins:
 * - Holders (0.50% curve + 1.5M migration + 40% LP)
 * - Creators (0.25% curve + 0.5M migration + 20% LP) = sum(devRewardPoolPls) ONLY
 * - Platform (0.50% curve + 2M migration + 40% LP + launch fees)
 * - Pending LP fees (not yet split) = sum(unharvestedLpFeesPls)
 * - Total = holders + creators + platform + pending (equals sum of tiles exactly)
 * - Volume: curveVolumePls (before migration), pulsexVolumePls (after migration), and dailyVolumePls (t >= now - 86,400,000).
 */
export function getProtocolStats(s: State, nowMs = Date.now()): ProtocolStats {
  const plsUsd = s.plsUsd || PLS_USD
  const cutoff24h = nowMs - 86_400_000

  let dailyVolumePls = 0
  let curveVolumePls = 0
  let pulsexVolumePls = 0

  let holderCurvePls = 0
  let holderMigrationPls = 0
  let holderLpPls = 0

  let creatorCurvePls = 0
  let creatorMigrationPls = 0
  let creatorLpPls = 0

  let platformCurvePls = 0
  let platformMigrationPls = 0
  let platformLpPls = 0

  let pendingLpFeesPls = 0

  for (const c of s.coins) {
    const src = resolveCoinFeeSources(c)
    curveVolumePls += src.curveVolumePls
    pulsexVolumePls += src.pulsexVolumePls

    for (const tr of c.trades ?? []) {
      if (tr.t >= cutoff24h) {
        dailyVolumePls += tr.pls
      }
    }

    holderCurvePls += src.holderCurvePls
    holderMigrationPls += src.holderMigrationPls
    holderLpPls += src.holderLpPls

    creatorCurvePls += src.creatorCurvePls
    creatorMigrationPls += src.creatorMigrationPls
    creatorLpPls += src.creatorLpPls

    platformCurvePls += src.platformCurvePls
    platformMigrationPls += src.platformMigrationPls
    platformLpPls += src.platformLpPls

    pendingLpFeesPls += c.unharvestedLpFeesPls ?? 0
  }

  const allTimeVolumePls = curveVolumePls + pulsexVolumePls
  const platformLaunchPls = s.treasury?.launchFeesPls ?? 0

  const totalHolderRewardsPls = holderCurvePls + holderMigrationPls + holderLpPls
  const totalDevRewardsPls = creatorCurvePls + creatorMigrationPls + creatorLpPls
  const platformDevRevenuePls = platformCurvePls + platformMigrationPls + platformLpPls + platformLaunchPls

  const totalCurveFeesPls = holderCurvePls + creatorCurvePls + platformCurvePls
  const totalMigrationFeesPls = holderMigrationPls + creatorMigrationPls + platformMigrationPls
  const totalHarvestedLpFeesPls = holderLpPls + creatorLpPls + platformLpPls

  const totalFeesPaidPls = totalHolderRewardsPls + totalDevRewardsPls + platformDevRevenuePls + pendingLpFeesPls

  return {
    dailyVolumePls,
    dailyVolumeUsd: dailyVolumePls * plsUsd,
    allTimeVolumePls,
    allTimeVolumeUsd: allTimeVolumePls * plsUsd,
    curveVolumePls,
    curveVolumeUsd: curveVolumePls * plsUsd,
    pulsexVolumePls,
    pulsexVolumeUsd: pulsexVolumePls * plsUsd,

    holderCurvePls,
    holderCurveUsd: holderCurvePls * plsUsd,
    holderMigrationPls,
    holderMigrationUsd: holderMigrationPls * plsUsd,
    holderLpPls,
    holderLpUsd: holderLpPls * plsUsd,
    totalHolderRewardsPls,
    totalHolderRewardsUsd: totalHolderRewardsPls * plsUsd,

    creatorCurvePls,
    creatorCurveUsd: creatorCurvePls * plsUsd,
    creatorMigrationPls,
    creatorMigrationUsd: creatorMigrationPls * plsUsd,
    creatorLpPls,
    creatorLpUsd: creatorLpPls * plsUsd,
    totalDevRewardsPls,
    totalDevRewardsUsd: totalDevRewardsPls * plsUsd,

    platformCurvePls,
    platformCurveUsd: platformCurvePls * plsUsd,
    platformMigrationPls,
    platformMigrationUsd: platformMigrationPls * plsUsd,
    platformLpPls,
    platformLpUsd: platformLpPls * plsUsd,
    platformLaunchPls,
    platformLaunchUsd: platformLaunchPls * plsUsd,
    platformDevRevenuePls,
    platformDevRevenueUsd: platformDevRevenuePls * plsUsd,

    pendingLpFeesPls,
    pendingLpFeesUsd: pendingLpFeesPls * plsUsd,

    totalCurveFeesPls,
    totalCurveFeesUsd: totalCurveFeesPls * plsUsd,
    totalMigrationFeesPls,
    totalMigrationFeesUsd: totalMigrationFeesPls * plsUsd,
    totalHarvestedLpFeesPls,
    totalHarvestedLpFeesUsd: totalHarvestedLpFeesPls * plsUsd,

    totalFeesPaidPls,
    totalFeesPaidUsd: totalFeesPaidPls * plsUsd,
  }
}

/**
 * 1-Click Simulator: Injects a fresh $5M USD (625B PLS) consistent buy wave on @gainzee's $SOVRN
 * (and brings total 24h chain volume to $10M+ USD) so users can inspect holder, creator, and @uniq_pulse rewards!
 */
export function triggerMegaPumpSim(): Result {
  const s = clone()
  const plsUsd = s.plsUsd || PLS_USD
  const freshSovrn = seedGainzeeMegaPumpCoin()
  const existingIdx = s.coins.findIndex((c) => c.ticker === 'SOVRN')
  if (existingIdx >= 0) {
    // Add another +$1M USD (125B PLS) stair-step surge on top of existing $SOVRN!
    const coin = s.coins[existingIdx]
    let t = Date.now()
    const buyers = ['gainzee', 'pls_maxi', 'trench_rat', 'harbor', 'solana_refugee', 'violet']
    for (let i = 0; i < 20; i++) {
      t += 5_000
      const u = buyers[i % buyers.length]
      const buyPls = 6_250_000_000 // 20 * 6.25B = 125B PLS ($1M USD)
      const before = mcapUsd(coin.curve, plsUsd)
      coin.curve = {
        ...coin.curve,
        graduated: true,
        dexPls: (coin.curve.dexPls ?? GRAD_LP_PLS) * 1.035,
        dexTokens: (coin.curve.dexTokens ?? GRAD_LP_TOKENS) / 1.035,
      }
      coin.holders[u] = (coin.holders[u] ?? 0) + 150_000
      record(coin, before, t, { t, side: 'buy', user: u, tokens: 150_000, pls: buyPls }, plsUsd, true, buyPls * POST_MIGRATION_LP_FEE)
    }
  } else {
    s.coins = [freshSovrn, ...s.coins]
  }
  commit(s)
  return {
    info: '🚀 Pumped $SOVRN (@gainzee) with consistent stair-step buy volume! Check $SOVRN chart, Leaderboard & Holder Rewards!',
  }
}

export function isDevModeActive(searchStr?: string): boolean {
  const isViteDev = Boolean((typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV))
  if (!isViteDev) return false
  const rawSearch = searchStr ?? (typeof window !== 'undefined' ? window.location.search : '')
  const params = new URLSearchParams(rawSearch)
  return params.get('dev') === '1'
}

export function loginAsPlatformDev(opts?: { allowInTests?: boolean }): Result {
  if (!opts?.allowInTests && !isDevModeActive() && typeof window !== 'undefined') {
    return { error: 'Demo account switching is disabled unless ?dev=1 is active in DEV mode.' }
  }
  const s = clone()
  const devWallet = '0x3690000000000000000000000000000000000369'
  if (!s.registry.some((r) => r.name === PLATFORM_USERNAME)) {
    s.registry.unshift({ name: PLATFORM_USERNAME, wallet: devWallet })
  }
  const devLaunched = s.coins.filter((c) => c.launcher === PLATFORM_USERNAME).map((c) => c.ticker)
  s.username = {
    name: PLATFORM_USERNAME,
    wallet: devWallet,
    walletSource: 'demo',
    issuedAt: Date.now() - 86_400_000,
    launched: devLaunched[0] ?? null,
    launchedTickers: devLaunched,
    xHandle: 'uniq_pulse',
  }
  // Never grant PLS balance top-ups or platform-fee claim rights through demo switcher
  commit(s)
  return { info: `Switched demo view to @${PLATFORM_USERNAME}.` }
}

export function loginAsPersonalWallet(targetName = 'gainzee', opts?: { allowInTests?: boolean }): Result {
  if (!opts?.allowInTests && !isDevModeActive() && typeof window !== 'undefined') {
    return { error: 'Demo account switching is disabled unless ?dev=1 is active in DEV mode.' }
  }
  const s = clone()
  const clean = targetName.trim().toLowerCase() || 'gainzee'
  const existingReg = s.registry.find((r) => r.name.toLowerCase() === clean)
  const personalWallet = s.evm ?? existingReg?.wallet ?? '0x7770000000000000000000000000000000000777'
  if (!existingReg) {
    s.registry.push({ name: clean, wallet: personalWallet })
  }
  const myLaunched = s.coins.filter((c) => c.launcher.toLowerCase() === clean).map((c) => c.ticker)
  s.username = {
    name: clean,
    wallet: personalWallet,
    walletSource: s.evm ? 'connected' : 'demo',
    issuedAt: Date.now() - 43_200_000,
    launched: myLaunched[0] ?? null,
    launchedTickers: myLaunched,
    xHandle: s.verifiedX?.[clean],
  }
  s.follows = s.follows ?? buildDefaultFollowsMap(s.registry)
  const wKey = personalWallet.toLowerCase()
  if (!s.follows[wKey]) {
    s.follows[wKey] = KOL_ACCOUNTS.filter((k) => k !== clean).slice(0, 2)
  }
  // Never grant PLS balance top-ups through demo switcher
  commit(s)
  return { info: `Switched demo view to @${clean}.` }
}

export interface SimRunUpInput {
  mode: 'mcap' | 'volume'
  targetMcapUsd?: number
  injectBuyUsd?: number
  sellPressurePct: number
}

export interface SimRunUpResult extends Result {
  summary?: {
    startMcapUsd: number
    endMcapUsd: number
    buyVolUsd: number
    sellVolUsd: number
    totalVolUsd: number
    totalVolPls: number
    totalFeesUsd: number
    totalFeesPls: number
    platformDevFeeUsd: number
    platformDevFeePls: number
    holderPoolFeeUsd: number
    holderPoolFeePls: number
    creatorFeeUsd: number
    creatorFeePls: number
    sellPressurePct: number
  }
}

/**
 * Interactive Coin Market Cap & Sell-Pressure Simulator:
 * Lets the Platform Dev (@uniq_pulse) run any coin up to a specific Target Market Cap (or inject specific USD buy volume)
 * with a configurable Sell Pressure % (0% to 80%), updating candles, holders, and exact 1.25% fees!
 */
export function simulateCoinRunUp(ticker: string, input: SimRunUpInput): SimRunUpResult {
  const s = clone()
  const plsUsd = s.plsUsd || PLS_USD
  const coin = s.coins.find((c) => c.ticker === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }

  const sellPct = Math.max(0, Math.min(80, input.sellPressurePct || 0))
  const sellRatio = sellPct / 100
  const startMcapUsd = mcapUsd(coin.curve, plsUsd)

  let targetBuyUsd = 0
  let targetEndMcapUsd = startMcapUsd

  if (input.mode === 'mcap') {
    targetEndMcapUsd = Math.max(startMcapUsd * 1.15, input.targetMcapUsd || 1_000_000)
    const mcapDeltaUsd = Math.max(10_000, targetEndMcapUsd - startMcapUsd)
    // Net buying needed to move MCap by mcapDeltaUsd, scaled by sell pressure (higher sell pressure = more gross buy volume needed to reach the same MCap!)
    const churnMultiplier = 1 / Math.max(0.2, 1 - sellRatio * 0.85)
    targetBuyUsd = mcapDeltaUsd * 0.42 * churnMultiplier
  } else {
    targetBuyUsd = Math.max(1_000, input.injectBuyUsd || 1_000_000)
    const netInflowUsd = targetBuyUsd * Math.max(0.15, 1 - sellRatio * 0.85)
    targetEndMcapUsd = startMcapUsd + netInflowUsd * 2.35
  }

  const totalBuyPls = targetBuyUsd / plsUsd
  const totalSellPls = totalBuyPls * sellRatio
  const totalVolPls = totalBuyPls + totalSellPls
  const totalVolUsd = totalVolPls * plsUsd

  let t = Date.now()
  const buyers = [
    s.username?.name || PLATFORM_USERNAME,
    'gainzee',
    'pls_maxi',
    'trench_rat',
    'harbor',
    'solana_refugee',
    'violet',
    'quietbuyer',
    'pulsepilled',
  ]
  const sellers = ['nightowl', 'kettle', 'driftwood', 'ember', 'saltmarsh', 'lowcap_lou']

  // Step 1: If the coin is still in the bonding curve and targetEndMcapUsd > $7,800 (graduation MCap), bond it through 200M PLS first!
  if (!coin.curve.graduated && (targetEndMcapUsd >= 7_800 || totalBuyPls >= 200_000_000)) {
    while (!coin.curve.graduated) {
      t += 2_000
      const u = buyers[coin.trades.length % buyers.length]
      const q = quoteBuy(coin.curve, 25_000_000)
      if (!q.ok) break
      const before = mcapUsd(coin.curve, plsUsd)
      coin.curve = applyBuy(coin.curve, q, t)
      coin.holders[u] = (coin.holders[u] ?? 0) + q.tokens
      record(coin, before, t, { t, side: 'buy', user: u, tokens: q.tokens, pls: q.spend }, plsUsd, false, q.fee)
      routeFee(s, q.fee, false, coin)
      if (q.graduates) {
        awardMigrationIncentive(s, coin, t)
      }
    }
  }

  // Step 2: Generate 32 stair-step buy & sell-pressure candles reaching targetEndMcapUsd
  const steps = 32
  const sellStepsCount = Math.round((steps * sellPct) / 100)
  const buyStepsCount = Math.max(1, steps - sellStepsCount)
  const buyPlsPerStep = totalBuyPls / buyStepsCount
  const sellPlsPerStep = sellStepsCount > 0 ? totalSellPls / sellStepsCount : 0

  let curMcap = mcapUsd(coin.curve, plsUsd)
  const mcapRatio = Math.max(1.05, targetEndMcapUsd / Math.max(400, curMcap))
  const perStepGrowth = Math.pow(mcapRatio, 1 / buyStepsCount)

  let buysDone = 0
  let sellsDone = 0

  for (let i = 0; i < steps; i++) {
    t += 3_000
    const shouldSell =
      sellsDone < sellStepsCount &&
      i > 2 &&
      ((i % Math.max(2, Math.floor(steps / Math.max(1, sellStepsCount))) === 0) || buysDone >= buyStepsCount)

    const before = mcapUsd(coin.curve, plsUsd)
    const isGraduatedNow = coin.curve.graduated

    if (shouldSell) {
      sellsDone++
      const seller = sellers[sellsDone % sellers.length]
      const dip = Math.max(0.84, 1 - 0.035 * (1 + sellRatio))
      if (isGraduatedNow) {
        const nextDexPls = Math.max(GRAD_LP_PLS, (coin.curve.dexPls ?? GRAD_LP_PLS) * Math.sqrt(dip))
        const nextDexTokens = (GRAD_LP_PLS * GRAD_LP_TOKENS) / nextDexPls
        coin.curve = { ...coin.curve, dexPls: nextDexPls, dexTokens: nextDexTokens }
      } else {
        coin.curve.reservePls = Math.max(1_000_000, coin.curve.reservePls * dip)
        coin.forfeitedHolders = coin.forfeitedHolders ?? {}
        coin.forfeitedHolders[seller.toLowerCase()] = true
      }
      const tokensSold = Math.max(10_000, sellPlsPerStep / Math.max(1e-6, pricePls(coin.curve)))
      const sellFeePls = isGraduatedNow ? sellPlsPerStep * POST_MIGRATION_LP_FEE : sellPlsPerStep * FEE_RATE
      record(coin, before, t, { t, side: 'sell', user: seller, tokens: tokensSold, pls: sellPlsPerStep }, plsUsd, isGraduatedNow, sellFeePls)
      if (!isGraduatedNow) routeFee(s, sellFeePls, false, coin)
    } else {
      buysDone++
      const buyer = buyers[buysDone % buyers.length]
      const pump = perStepGrowth * (sellStepsCount > 0 ? 1 + (0.035 * sellStepsCount) / buyStepsCount : 1)
      if (isGraduatedNow) {
        const nextDexPls = (coin.curve.dexPls ?? GRAD_LP_PLS) * Math.sqrt(pump)
        const nextDexTokens = (GRAD_LP_PLS * GRAD_LP_TOKENS) / nextDexPls
        coin.curve = { ...coin.curve, dexPls: nextDexPls, dexTokens: nextDexTokens }
      } else {
        coin.curve.reservePls = Math.min(GRAD_PLS * 0.98, coin.curve.reservePls + buyPlsPerStep)
      }
      const tokensOut = Math.max(25_000, Math.min(3_000_000, buyPlsPerStep / Math.max(1e-6, pricePls(coin.curve))))
      coin.holders[buyer] = (coin.holders[buyer] ?? 0) + tokensOut
      const buyFeePls = isGraduatedNow ? buyPlsPerStep * POST_MIGRATION_LP_FEE : buyPlsPerStep * FEE_RATE
      record(coin, before, t, { t, side: 'buy', user: buyer, tokens: tokensOut, pls: buyPlsPerStep }, plsUsd, isGraduatedNow, buyFeePls)
      if (!isGraduatedNow) routeFee(s, buyFeePls, false, coin)
    }
    curMcap = mcapUsd(coin.curve, plsUsd)
  }

  // Snap final reserve so end MCap matches targetEndMcapUsd cleanly when in mcap mode
  if (coin.curve.graduated && input.mode === 'mcap') {
    const currentMcap = mcapUsd(coin.curve, plsUsd)
    if (currentMcap > 0) {
      const adjust = Math.sqrt(targetEndMcapUsd / currentMcap)
      const nextDexPls = Math.max(GRAD_LP_PLS, (coin.curve.dexPls ?? GRAD_LP_PLS) * adjust)
      const nextDexTokens = (GRAD_LP_PLS * GRAD_LP_TOKENS) / nextDexPls
      coin.curve = { ...coin.curve, dexPls: nextDexPls, dexTokens: nextDexTokens }
      if (coin.candles.length > 0) {
        coin.candles[coin.candles.length - 1].c = mcapUsd(coin.curve, plsUsd)
      }
    }
  }

  const endMcapUsd = mcapUsd(coin.curve, plsUsd)
  const platformDevFeePls = totalVolPls * 0.005
  const holderPoolFeePls = totalVolPls * 0.005
  const creatorFeePls = totalVolPls * 0.0025
  const totalFeesPls = platformDevFeePls + holderPoolFeePls + creatorFeePls

  pushLiveEvent(s, {
    t,
    kind: 'buy',
    user: s.username?.name || PLATFORM_USERNAME,
    ticker: coin.ticker,
    pls: totalBuyPls,
    tokens: 1_000_000,
    mcapUsd: endMcapUsd,
  })

  commit(s)
  return {
    info: `⚡ Ran $${coin.ticker} to ${fmtUsd(endMcapUsd)} MCap with ${sellPct}% sell pressure! Total Vol: ${fmtUsd(totalVolUsd)} -> @${PLATFORM_USERNAME} Earned: ${fmtUsd(platformDevFeePls * plsUsd)} | Holders Pool: ${fmtUsd(holderPoolFeePls * plsUsd)} | Creator: ${fmtUsd(creatorFeePls * plsUsd)}`,
    summary: {
      startMcapUsd,
      endMcapUsd,
      buyVolUsd: totalBuyPls * plsUsd,
      sellVolUsd: totalSellPls * plsUsd,
      totalVolUsd,
      totalVolPls,
      totalFeesUsd: totalFeesPls * plsUsd,
      totalFeesPls,
      platformDevFeeUsd: platformDevFeePls * plsUsd,
      platformDevFeePls,
      holderPoolFeeUsd: holderPoolFeePls * plsUsd,
      holderPoolFeePls,
      creatorFeeUsd: creatorFeePls * plsUsd,
      creatorFeePls,
      sellPressurePct: sellPct,
    },
  }
}

export function getPlatformDevVaultStatus(stateSnapshot: State = load()) {
  const plsUsd = stateSnapshot.plsUsd || PLS_USD
  const proto = getProtocolStats(stateSnapshot)
  const totalEarnedPls = proto.platformDevRevenuePls
  const claimedPls = stateSnapshot.claimedPlatformDevPls ?? 0
  const unclaimedPls = Math.max(0, totalEarnedPls - claimedPls)
  const spentOnCoinsPls = stateSnapshot.spentPlatformDevClaimsPls ?? 0
  const availableFromClaimedPls = Math.max(0, claimedPls - spentOnCoinsPls)
  return {
    totalEarnedPls,
    totalEarnedUsd: totalEarnedPls * plsUsd,
    claimedPls,
    claimedUsd: claimedPls * plsUsd,
    unclaimedPls,
    unclaimedUsd: unclaimedPls * plsUsd,
    spentOnCoinsPls,
    spentOnCoinsUsd: spentOnCoinsPls * plsUsd,
    availableFromClaimedPls,
    availableFromClaimedUsd: availableFromClaimedPls * plsUsd,
  }
}

export function claimPlatformDevVaultRewards(opts?: { configuredPlatformWallet?: string }): Result {
  const s = clone()
  const configuredWallet = (opts?.configuredPlatformWallet ?? PLATFORM_WALLET).trim()
  if (!configuredWallet) {
    return { error: 'Platform wallet not configured' }
  }
  if (!s.evm || !isValidChecksumAddress(s.evm) || s.evm.toLowerCase() !== configuredWallet.toLowerCase()) {
    return { error: 'Permission denied: connected wallet must match PLATFORM_WALLET.' }
  }
  const st = getPlatformDevVaultStatus(s)
  if (st.unclaimedPls < 1) {
    return { error: `All earned @${PLATFORM_USERNAME} protocol fees (${fmtPlsPlain(st.claimedPls)} PLS / ${fmtUsd(st.claimedUsd)}) have already been claimed.` }
  }
  s.claimedPlatformDevPls = (s.claimedPlatformDevPls ?? 0) + st.unclaimedPls
  s.pls += st.unclaimedPls
  commit(s)
  return {
    info: `💰 Claimed +${fmtPlsPlain(st.unclaimedPls)} PLS (${fmtUsd(st.unclaimedUsd)}) from the 0.50% @${PLATFORM_USERNAME} Protocol Fee Vault into PLATFORM_WALLET!`,
  }
}

/* ---------------- HEX-Style Dev Lock Ladder (up to 10 locks per coin, 1-5555 days) ---------------- */

export function createDevLock(
  ticker: string,
  amountTokens: number,
  termDays: number,
  nowMs = Date.now()
): Result & { lock?: DevLock } {
  const s = clone()
  const coin = s.coins.find((c) => c.ticker.toUpperCase() === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  if (!s.username || s.username.name.toLowerCase() !== coin.launcher.toLowerCase()) {
    return { error: `Only the coin creator (@${coin.launcher}) can create dev token locks.` }
  }
  if (!Number.isFinite(amountTokens) || amountTokens <= 0) {
    return { error: 'Enter a valid token amount to lock.' }
  }
  if (!Number.isFinite(termDays) || termDays < MIN_DEV_LOCK_DAYS || termDays > MAX_DEV_LOCK_DAYS) {
    return { error: `Lock term must be between ${MIN_DEV_LOCK_DAYS} and ${MAX_DEV_LOCK_DAYS} days.` }
  }

  const activeLocks = getActiveDevLocks(coin, nowMs)
  if (activeLocks.length >= MAX_DEV_LOCKS_PER_COIN) {
    return { error: `Maximum of ${MAX_DEV_LOCKS_PER_COIN} active dev locks reached on $${coin.ticker}.` }
  }

  const devEntry = Object.entries(coin.holders).find(([u]) => u.toLowerCase() === coin.launcher.toLowerCase())
  const devHeld = devEntry ? devEntry[1] : 0
  const currentlyLocked = getLockedDevTokens(coin, nowMs)
  const unlockedAvailable = Math.max(0, devHeld - currentlyLocked)
  if (amountTokens > unlockedAvailable + 1e-6) {
    return { error: `Insufficient unlocked dev tokens (available: ${fmtPlsPlain(unlockedAvailable)} $${coin.ticker}).` }
  }

  const cleanDays = Math.round(termDays)
  const boostWeight = computeLockBoostWeight(cleanDays)
  const unlockAt = nowMs + cleanDays * DAY_MS
  const lock: DevLock = {
    id: `${coin.ticker}-lock-${nowMs}-${(coin.devLocks?.length ?? 0) + 1}`,
    amountTokens: Math.min(amountTokens, unlockedAvailable),
    termDays: cleanDays,
    createdAt: nowMs,
    unlockAt,
    boostWeight,
    weightHistory: [{ fromTs: nowMs, toTs: unlockAt, weight: boostWeight }],
    status: 'active',
  }

  coin.devLocks = [...(coin.devLocks ?? []), lock]
  commit(s)
  return {
    lock,
    info: `🔒 Locked ${fmtPlsPlain(lock.amountTokens)} $${coin.ticker} for ${cleanDays} days (Lock boost: ${boostWeight.toFixed(2)}×).`,
  }
}

export function extendDevLock(
  ticker: string,
  lockId: string,
  newTermDays: number,
  nowMs = Date.now()
): Result & { lock?: DevLock } {
  const s = clone()
  const coin = s.coins.find((c) => c.ticker.toUpperCase() === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  if (!s.username || s.username.name.toLowerCase() !== coin.launcher.toLowerCase()) {
    return { error: `Only @${coin.launcher} can extend dev locks on $${coin.ticker}.` }
  }
  const lock = (coin.devLocks ?? []).find((l) => l.id === lockId)
  if (!lock) return { error: 'Lock not found.' }
  if (getEffectiveLockStatus(lock, nowMs) !== 'active') {
    return { error: 'Only active locks can be extended.' }
  }
  const cleanDays = Math.round(newTermDays)
  if (!Number.isFinite(cleanDays) || cleanDays <= lock.termDays) {
    return { error: 'Locks can only be extended, never shortened.' }
  }
  if (cleanDays > MAX_DEV_LOCK_DAYS) {
    return { error: `Lock term cannot exceed ${MAX_DEV_LOCK_DAYS} days.` }
  }

  const prevWeight = lock.boostWeight || computeLockBoostWeight(lock.termDays)
  const newUnlockAt = lock.createdAt + cleanDays * DAY_MS
  const newWeight = computeLockBoostWeight(cleanDays)
  const history = lock.weightHistory ? [...lock.weightHistory] : [{ fromTs: lock.createdAt, toTs: lock.unlockAt, weight: prevWeight }]
  const lastSeg = history[history.length - 1]
  if (lastSeg && lastSeg.fromTs >= nowMs) {
    lastSeg.toTs = newUnlockAt
    lastSeg.weight = newWeight
  } else {
    if (lastSeg) lastSeg.toTs = nowMs
    history.push({ fromTs: nowMs, toTs: newUnlockAt, weight: newWeight })
  }

  lock.termDays = cleanDays
  lock.unlockAt = newUnlockAt
  lock.boostWeight = newWeight
  lock.weightHistory = history
  commit(s)
  return {
    lock,
    info: `🔒 Extended lock to ${cleanDays} days (Lock boost: ${lock.boostWeight.toFixed(2)}×).`,
  }
}

export interface EarlyUnlockPreview {
  ok: boolean
  error?: string
  lock?: DevLock
  daysRemaining: number
  penaltyRatio: number
  penaltyPct: number
  returnedTokens: number
  burnedTokens: number
  forfeitedPls: number
  scoreHit: number
}

export function previewEarlyUnlockDevLock(
  coin: Coin,
  lockId: string,
  nowMs = Date.now()
): EarlyUnlockPreview {
  const lock = (coin.devLocks ?? []).find((l) => l.id === lockId)
  if (!lock) {
    return {
      ok: false,
      error: 'Lock not found.',
      daysRemaining: 0,
      penaltyRatio: 0,
      penaltyPct: 0,
      returnedTokens: 0,
      burnedTokens: 0,
      forfeitedPls: 0,
      scoreHit: -25,
    }
  }
  if (getEffectiveLockStatus(lock, nowMs) !== 'active') {
    return {
      ok: false,
      error: 'This lock is not active.',
      daysRemaining: 0,
      penaltyRatio: 0,
      penaltyPct: 0,
      returnedTokens: 0,
      burnedTokens: 0,
      forfeitedPls: 0,
      scoreHit: -25,
    }
  }

  const daysRemaining = Math.max(0, (lock.unlockAt - nowMs) / DAY_MS)
  const rawPenaltyRatio = 0.5 * (daysRemaining / Math.max(1, lock.termDays))
  const penaltyRatio = Math.max(0.05, Math.min(0.5, rawPenaltyRatio))
  const burnedTokens = lock.amountTokens * penaltyRatio
  const returnedTokens = Math.max(0, lock.amountTokens - burnedTokens)

  const accruals = computeDevLockAccruals(coin, nowMs)
  const lockInfo = accruals.locks.find((x) => x.lock.id === lockId)
  const forfeitedPls = lockInfo?.accruedPls ?? 0

  return {
    ok: true,
    lock,
    daysRemaining,
    penaltyRatio,
    penaltyPct: penaltyRatio * 100,
    returnedTokens,
    burnedTokens,
    forfeitedPls,
    scoreHit: -25,
  }
}

export function earlyUnlockDevLock(
  ticker: string,
  lockId: string,
  nowMs = Date.now()
): Result & {
  returnedTokens?: number
  burnedTokens?: number
  forfeitedPls?: number
  scoreHit?: number
} {
  const s = clone()
  const coin = s.coins.find((c) => c.ticker.toUpperCase() === ticker.toUpperCase())
  if (!coin) return { error: 'Coin not found.' }
  if (!s.username || s.username.name.toLowerCase() !== coin.launcher.toLowerCase()) {
    return { error: `Only @${coin.launcher} can early-unlock dev locks on $${coin.ticker}.` }
  }

  const preview = previewEarlyUnlockDevLock(coin, lockId, nowMs)
  if (!preview.ok || !preview.lock) {
    return { error: preview.error ?? 'Cannot early-unlock this lock.' }
  }

  const targetLock = (coin.devLocks ?? []).find((l) => l.id === lockId)!
  targetLock.status = 'broken'
  targetLock.brokenAt = nowMs
  targetLock.returnedTokens = preview.returnedTokens
  targetLock.burnedTokens = preview.burnedTokens
  targetLock.forfeitedPls = preview.forfeitedPls
  targetLock.accruedPls = 0

  // 100% of penalty tokens are burned instantly (no tokens to platform or holders); dev gets the rest back unlocked
  const devEntry = Object.entries(coin.holders).find(([u]) => u.toLowerCase() === coin.launcher.toLowerCase())
  const devKey = devEntry ? devEntry[0] : coin.launcher
  coin.holders[devKey] = Math.max(0, (coin.holders[devKey] ?? 0) - preview.burnedTokens)
  coin.burnedSupplyTokens = (coin.burnedSupplyTokens ?? 0) + preview.burnedTokens

  // All PLS rewards earned by that lock are forfeited and redistributed pro-rata to current holders
  coin.forfeitedLockRewardsPls = (coin.forfeitedLockRewardsPls ?? 0) + preview.forfeitedPls
  coin.devBrokeLock = true

  commit(s)
  return {
    returnedTokens: preview.returnedTokens,
    burnedTokens: preview.burnedTokens,
    forfeitedPls: preview.forfeitedPls,
    scoreHit: -25,
    info: `⚠️ Early-unlocked lock: returned ${fmtPlsPlain(preview.returnedTokens)} $${coin.ticker}, burned ${fmtPlsPlain(preview.burnedTokens)} $${coin.ticker} (${preview.penaltyPct.toFixed(1)}%), forfeited ${fmtPlsPlain(preview.forfeitedPls)} PLS to holders, and applied −25 dev score + "Dev broke lock" badge.`,
  }
}

export function recordWalletFundingLink(from: string, to: string, t = Date.now()): void {
  const s = clone()
  s.walletFundingLinks = [...(s.walletFundingLinks ?? []), { from, to, t }]
  commit(s)
}

export const MAX_PROFILE_IMAGE_BYTES = 1_048_576 // 1 MB

/**
 * Validates profile avatar and banner URLs:
 * - Empty string "" is allowed (resets custom image).
 * - Uploaded data:image/(png|jpeg|jpg|webp|gif);base64,... must decode to <= 1MB (1,048,576 bytes).
 * - External URLs must be strict https:// URLs with no CSS/HTML injection characters.
 */
export function validateProfileImageUrl(raw: string): { ok: boolean; url?: string; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, url: '' }
  if (trimmed === '/logo-shield.png?v=pulse') return { ok: true, url: trimmed }

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i)
    if (!match) {
      return { ok: false, error: 'Only PNG, JPEG, WEBP, or GIF image uploads are allowed.' }
    }
    const b64 = match[2]
    const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
    const byteLength = Math.floor((b64.length * 3) / 4) - pad
    if (byteLength > MAX_PROFILE_IMAGE_BYTES) {
      return { ok: false, error: 'Profile image upload must be under 1MB.' }
    }
    return { ok: true, url: trimmed }
  }

  if (/["'\\<>]/.test(trimmed)) {
    return { ok: false, error: 'Invalid characters in image URL.' }
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only https:// image URLs are allowed.' }
    }
    return { ok: true, url: parsed.toString() }
  } catch {
    return { ok: false, error: 'Only valid https:// image URLs or uploads under 1MB are allowed.' }
  }
}

/**
 * Resizes and compresses a banner (max 1500x500) or PFP (max 400x400) client-side using a canvas,
 * exporting image/webp at quality 0.85 (with image/jpeg fallback) and looping quality down until < 1MB.
 */
export async function compressProfileImageFile(
  file: File,
  kind: 'avatar' | 'banner'
): Promise<{ ok: boolean; dataUrl?: string; byteLength?: number; error?: string }> {
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
    return { ok: false, error: 'Only PNG, JPEG, WEBP, or GIF image uploads are allowed.' }
  }
  const maxW = kind === 'banner' ? 1500 : 400
  const maxH = kind === 'banner' ? 500 : 400

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    const tinyWebp =
      'data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    return { ok: true, dataUrl: tinyWebp, byteLength: 68 }
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ ok: false, error: 'Failed to read image file.' })
    reader.onload = () => {
      const srcUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!srcUrl) {
        resolve({ ok: false, error: 'Failed to read image file.' })
        return
      }
      const img = new Image()
      img.onerror = () => resolve({ ok: false, error: 'Invalid image file.' })
      img.onload = () => {
        let w = img.naturalWidth || img.width || maxW
        let h = img.naturalHeight || img.height || maxH
        const scale = Math.min(1, maxW / w, maxH / h)
        w = Math.max(1, Math.round(w * scale))
        h = Math.max(1, Math.round(h * scale))

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ ok: false, error: 'Canvas context unavailable.' })
          return
        }
        ctx.drawImage(img, 0, 0, w, h)

        let quality = 0.85
        let dataUrl = ''
        let byteLength = Infinity

        while (quality >= 0.2) {
          let candidate = canvas.toDataURL('image/webp', quality)
          if (!candidate.startsWith('data:image/webp')) {
            candidate = canvas.toDataURL('image/jpeg', quality)
          }
          const commaIdx = candidate.indexOf(',')
          const b64 = commaIdx >= 0 ? candidate.slice(commaIdx + 1) : ''
          const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
          byteLength = Math.floor((b64.length * 3) / 4) - pad
          dataUrl = candidate
          if (byteLength <= MAX_PROFILE_IMAGE_BYTES) break
          quality = Number((quality - 0.15).toFixed(2))
        }

        if (byteLength > MAX_PROFILE_IMAGE_BYTES) {
          resolve({ ok: false, error: 'Image could not be compressed under 1MB.' })
          return
        }
        resolve({ ok: true, dataUrl, byteLength })
      }
      img.src = srcUrl
    }
    reader.readAsDataURL(file)
  })
}

export function updateUserProfileCustomization(opts: {
  avatarUrl?: string
  bannerUrl?: string
  bannerPreset?: string
}): Result {
  const s = clone()
  if (!s.username) return { error: 'Claim or connect your @username first.' }

  let cleanAvatar = opts.avatarUrl
  if (cleanAvatar !== undefined) {
    const v = validateProfileImageUrl(cleanAvatar)
    if (!v.ok) return { error: v.error }
    cleanAvatar = v.url
  }

  let cleanBanner = opts.bannerUrl
  if (cleanBanner !== undefined) {
    const v = validateProfileImageUrl(cleanBanner)
    if (!v.ok) return { error: v.error }
    cleanBanner = v.url
  }

  const key = s.username.name.toLowerCase()
  s.userProfiles = s.userProfiles ?? {}
  const prev = s.userProfiles[key] ?? {}
  s.userProfiles[key] = {
    avatarUrl: cleanAvatar !== undefined ? cleanAvatar : prev.avatarUrl,
    bannerUrl: cleanBanner !== undefined ? cleanBanner : prev.bannerUrl,
    bannerPreset: opts.bannerPreset !== undefined ? opts.bannerPreset : prev.bannerPreset,
  }
  commit(s)
  return { info: `Updated profile picture & banner for @${s.username.name}!` }
}

/* ---------------- follow system & deterministic wallet identicon avatars ---------------- */

function normalizeFollowTarget(raw: string, s: State): string {
  const clean = raw.trim().replace(/^@/, '').toLowerCase()
  if (!clean) return ''
  // If a wallet address was passed, resolve to its registered username if one exists
  if (/^0x[a-f0-9]{40}$/i.test(clean)) {
    const reg = s.registry.find((r) => r.wallet.toLowerCase() === clean)
    if (reg) return reg.name.toLowerCase()
  }
  return clean
}

function getActiveViewerWalletKey(s: State): string | null {
  if (s.username?.wallet) return s.username.wallet.toLowerCase()
  if (s.evm) return s.evm.toLowerCase()
  return null
}

/**
 * Follows a target user (by @username or wallet address) from the currently connected wallet/username.
 * Blocks self-follow and reserved accounts (`uniq_pulse`, `uniq_anon`).
 */
export function followUser(target: string): Result {
  const s = clone()
  const walletKey = getActiveViewerWalletKey(s)
  if (!walletKey) {
    return { error: 'Connect wallet to follow' }
  }
  const cleanTarget = normalizeFollowTarget(target, s)
  if (!cleanTarget) {
    return { error: 'Invalid user to follow.' }
  }
  if (RESERVED_FOLLOW_ACCOUNTS.has(cleanTarget)) {
    return { error: `@${cleanTarget} is a reserved system account and cannot be followed.` }
  }
  const myUsername =
    s.username?.name.toLowerCase() ??
    s.registry.find((r) => r.wallet.toLowerCase() === walletKey)?.name.toLowerCase()
  if ((myUsername && cleanTarget === myUsername) || cleanTarget === walletKey) {
    return { error: 'You cannot follow yourself.' }
  }

  s.follows = s.follows ?? buildDefaultFollowsMap(s.registry)
  const currentList = s.follows[walletKey] ? [...s.follows[walletKey]] : []
  if (!currentList.includes(cleanTarget)) {
    currentList.push(cleanTarget)
  }
  s.follows[walletKey] = currentList
  commit(s)
  return { info: `Following @${cleanTarget}.` }
}

/**
 * Unfollows a target user from the currently connected wallet/username.
 */
export function unfollowUser(target: string): Result {
  const s = clone()
  const walletKey = getActiveViewerWalletKey(s)
  if (!walletKey) {
    return { error: 'Connect wallet to follow' }
  }
  const cleanTarget = normalizeFollowTarget(target, s)
  if (!cleanTarget) {
    return { error: 'Invalid user.' }
  }
  s.follows = s.follows ?? buildDefaultFollowsMap(s.registry)
  const currentList = s.follows[walletKey] ?? []
  s.follows[walletKey] = currentList.filter((u) => u.toLowerCase() !== cleanTarget)
  commit(s)
  return { info: `Unfollowed @${cleanTarget}.` }
}

/**
 * Returns the list of lowercase usernames followed by the active user (or default demo follows if logged out).
 */
export function getFollowing(stateSnapshot?: State): string[] {
  const s = stateSnapshot ?? load()
  const followsMap = s.follows ?? buildDefaultFollowsMap(s.registry)
  const walletKey = getActiveViewerWalletKey(s)
  if (walletKey) {
    const list = followsMap[walletKey]
    if (Array.isArray(list)) {
      return list.filter((u) => !RESERVED_FOLLOW_ACCOUNTS.has(u.toLowerCase()))
    }
    const myName = s.username?.name.toLowerCase()
    return KOL_ACCOUNTS.filter((k) => k !== myName).slice(0, 2)
  }
  return [...(followsMap[DEFAULT_DEMO_FOLLOW_KEY] ?? DEFAULT_DEMO_FOLLOWS)]
}

/**
 * Returns true if the active user follows `target` (@username or wallet).
 */
export function isFollowing(target: string, stateSnapshot?: State): boolean {
  const s = stateSnapshot ?? load()
  const cleanTarget = normalizeFollowTarget(target, s)
  if (!cleanTarget || RESERVED_FOLLOW_ACCOUNTS.has(cleanTarget)) return false
  const myUsername = s.username?.name.toLowerCase()
  if (myUsername && cleanTarget === myUsername) return false
  const list = getFollowing(s)
  return list.some((u) => u.toLowerCase() === cleanTarget)
}

/**
 * Returns how many accounts a given user (@username or wallet) is following.
 */
export function getFollowingCount(userOrWallet: string, stateSnapshot?: State): number {
  const s = stateSnapshot ?? load()
  const clean = userOrWallet.trim().replace(/^@/, '').toLowerCase()
  const followsMap = s.follows ?? buildDefaultFollowsMap(s.registry)
  const reg = s.registry.find((r) => r.name.toLowerCase() === clean || r.wallet.toLowerCase() === clean)
  const walletKey = reg
    ? reg.wallet.toLowerCase()
    : s.username?.name.toLowerCase() === clean
    ? s.username.wallet.toLowerCase()
    : clean
  const list = followsMap[walletKey]
  if (!Array.isArray(list)) return 0
  return list.filter((u) => !RESERVED_FOLLOW_ACCOUNTS.has(u.toLowerCase()) && u.toLowerCase() !== clean).length
}

/**
 * Returns how many wallets follow a given user (@username or wallet).
 */
export function getFollowerCount(userOrWallet: string, stateSnapshot?: State): number {
  const s = stateSnapshot ?? load()
  const cleanTarget = normalizeFollowTarget(userOrWallet, s)
  if (!cleanTarget || RESERVED_FOLLOW_ACCOUNTS.has(cleanTarget)) return 0
  const followsMap = s.follows ?? buildDefaultFollowsMap(s.registry)
  let count = 0
  for (const [followerWallet, targets] of Object.entries(followsMap)) {
    if (followerWallet === DEFAULT_DEMO_FOLLOW_KEY) continue
    if (!Array.isArray(targets)) continue
    if (targets.some((t) => t.toLowerCase() === cleanTarget)) {
      count += 1
    }
  }
  return count
}

/**
 * Resolves the deterministic or registered wallet address for a given username.
 */
export function getUserWalletAddress(username: string, stateSnapshot?: State): string {
  const s = stateSnapshot ?? load()
  const clean = username.trim().replace(/^@/, '').toLowerCase()
  if (clean === PLATFORM_USERNAME.toLowerCase()) {
    return '0x3690000000000000000000000000000000000369'
  }
  if (s.username && s.username.name.toLowerCase() === clean) {
    return s.username.wallet
  }
  const reg = s.registry.find((r) => r.name.toLowerCase() === clean)
  if (reg) return reg.wallet
  // Deterministic fallback wallet derived from username
  let h1 = 0x811c9dc5
  for (let i = 0; i < clean.length; i++) {
    h1 ^= clean.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193)
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, '0')
  return `0x${hex.repeat(5)}`
}

/**
 * Generates a deterministic 5x5 symmetric block-matrix SVG identicon data URL from a wallet address.
 */
export function generateWalletIdenticonDataUrl(walletOrSeed: string): string {
  const seed = (walletOrSeed || '0x0').trim().toLowerCase()
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hash = h >>> 0
  const hue1 = hash % 360
  const hue2 = (hue1 + 65 + ((hash >>> 8) % 90)) % 360
  const fg = `hsl(${hue1}, 82%, 62%)`
  const acc = `hsl(${hue2}, 86%, 56%)`
  const bg = '#120924'

  let rects = ''
  let bitIdx = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = ((hash >>> (bitIdx % 28)) ^ (seed.charCodeAt(bitIdx % seed.length) >> (bitIdx % 5))) & 1
      const useAccent = ((hash >>> ((bitIdx + 7) % 28)) & 1) === 1
      bitIdx++
      if (bit === 1 || (row === 2 && col === 2)) {
        const fill = useAccent ? acc : fg
        const x1 = 4 + col * 6
        const y = 4 + row * 6
        rects += `<rect x="${x1}" y="${y}" width="6" height="6" rx="1.2" fill="${fill}"/>`
        const mirrorCol = 4 - col
        if (mirrorCol !== col) {
          const x2 = 4 + mirrorCol * 6
          rects += `<rect x="${x2}" y="${y}" width="6" height="6" rx="1.2" fill="${fill}"/>`
        }
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38" width="38" height="38"><rect width="38" height="38" rx="19" fill="${bg}"/>${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Returns the avatar URL for a user: their uploaded/custom profile logo if set,
 * `/logo-shield.png?v=pulse` for `@uniq_pulse`, or their deterministic wallet identicon.
 */
export function getUserAvatarUrl(username: string, stateSnapshot?: State): string {
  const s = stateSnapshot ?? load()
  const clean = username.trim().replace(/^@/, '').toLowerCase()
  const customRaw = s.userProfiles?.[clean]?.avatarUrl
  if (customRaw) {
    const v = validateProfileImageUrl(customRaw)
    if (v.ok && v.url) return v.url
  }
  if (clean === PLATFORM_USERNAME.toLowerCase()) {
    return '/logo-shield.png?v=pulse'
  }
  const wallet = getUserWalletAddress(clean, s)
  return generateWalletIdenticonDataUrl(wallet)
}
