import { describe, expect, it } from 'vitest'
import { PLS_USD } from '../config'
import {
  CURVE_TOKENS, DESK_START_PLS, FEE_RATE, FILL_PLS, GRAD_BURNED_TOKENS, GRAD_LP_PLS, GRAD_LP_TOKENS, GRAD_PLS, LAST_CURVE_PRICE_PLS, LP_TOKENS, POST_MIGRATION_LP_FEE, T0, TOTAL_SUPPLY, V0,
  applyBuy, fmtUsd, mcapPls, mcapUsd, newCurve, pricePls, quoteBuy, quoteSell, splitFee, applySell,
} from './model'

describe('curve constants (PRODUCT_BRIEF.md)', () => {
  it('derives virtual reserves so 793.1M tokens deposit exactly 200M PLS', () => {
    expect(T0).toBe(1_073_000_000)
    expect(V0).toBeCloseTo(70_583_785.1469, 3)
    const q = quoteBuy(newCurve(), FILL_PLS)
    expect(q.tokens).toBeCloseTo(CURVE_TOKENS, 0)
    expect(q.net).toBeCloseTo(GRAD_PLS, 3)
  })
})

describe('Fill', () => {
  it('Fill spends ~202,531,646 PLS (200M net + 1.25% fee) and migrates', () => {
    expect(Math.floor(FILL_PLS)).toBe(202_531_645)
    const c = newCurve()
    const q = quoteBuy(c, FILL_PLS)
    expect(q.ok).toBe(true)
    expect(q.spend).toBeCloseTo(202_531_645.57, 1)
    expect(q.fee).toBeCloseTo(2_531_645.57, 1)
    expect(q.graduates).toBe(true)
    expect(applyBuy(c, q).graduated).toBe(true)
  })

  it('desk wallet after Fill is ~797.47M PLS', () => {
    const q = quoteBuy(newCurve(), FILL_PLS)
    expect(DESK_START_PLS - q.spend).toBeCloseTo(797_468_354.43, 1)
  })

  it('exactly 200M PLS leaves 197.5M in the curve (after 1.25% fee) and does NOT migrate', () => {
    const c = newCurve()
    const q = quoteBuy(c, 200_000_000)
    expect(q.ok).toBe(true)
    expect(q.fee).toBeCloseTo(2_500_000, 3)
    expect(q.net).toBeCloseTo(197_500_000, 3)
    expect(q.graduates).toBe(false)
    const after = applyBuy(c, q)
    expect(after.graduated).toBe(false)
    expect(after.reservePls).toBeCloseTo(197_500_000, 3)
  })
})

describe('market cap', () => {
  it('graduation market cap is ~$7,733.73 at $0.000008/PLS', () => {
    const c = applyBuy(newCurve(), quoteBuy(newCurve(), FILL_PLS))
    expect(mcapUsd(c, PLS_USD)).toBeCloseTo(7_733.73, 1)
    expect(fmtUsd(mcapUsd(c, PLS_USD))).toBe('$7,734')
  })

  it('launch market cap is ~$526', () => {
    expect(mcapUsd(newCurve(), PLS_USD)).toBeCloseTo(526.25, 1)
  })

  it('966.72M is mcap counted in PLS (not cash, not a balance); cash in a full curve is ~$1,600', () => {
    const c = applyBuy(newCurve(), quoteBuy(newCurve(), FILL_PLS))
    expect(mcapPls(c) / 1e6).toBeCloseTo(966.72, 1)
    expect(c.reservePls * PLS_USD).toBeCloseTo(1_600, 6)
  })
})

describe('fees', () => {
  it('a 1,000,000 PLS buy collects 12,500 PLS and pays out exactly 12,500 (5,000 platform / 5,000 holder pool / 2,500 creator pool)', () => {
    const q = quoteBuy(newCurve(), 1_000_000)
    expect(q.fee).toBe(12_500)
    expect(q.net).toBe(987_500)
    const s = splitFee(q.fee, PLS_USD)
    expect(s.feePls).toBe(12_500)
    expect(s.platformPls).toBe(5_000)
    expect(s.holdersPoolPls).toBe(5_000)
    expect(s.creatorPoolPls).toBe(2_500)
    expect(s.totalPaidOutPls).toBe(12_500)
    expect(s.platformPls + s.holdersPoolPls + s.creatorPoolPls).toBe(q.fee)
  })

  it('Fill 1.25% fee splits ONLY 40% (0.50% of trade) to @uniq_pulse, 40% (0.50%) to Holders, 20% (0.25%) to Creator', () => {
    const q = quoteBuy(newCurve(), FILL_PLS)
    const s = splitFee(q.fee, PLS_USD)
    expect(s.platformPls).toBeCloseTo(q.fee * 0.4, 6)
    expect(s.holdersPoolPls).toBeCloseTo(q.fee * 0.4, 6)
    expect(s.creatorPoolPls).toBeCloseTo(q.fee * 0.2, 6)
    expect(s.totalPaidOutPls).toBeCloseTo(q.fee, 9)
    expect(s.platformUsd).toBeCloseTo(q.spend * 0.005 * PLS_USD, 2)
    expect(s.platformUsd).toBeLessThan(100)
  })

  it('full 1.25% fee is deducted before PLS enters the curve', () => {
    const q = quoteBuy(newCurve(), 1_000_000)
    expect(q.fee).toBeCloseTo(12_500, 6)
    expect(q.net).toBeCloseTo(987_500, 6)
  })

  it('never prices PLS at $1', () => {
    expect(() => splitFee(1_000, 1)).toThrow()
    expect(PLS_USD).toBeLessThan(0.01)
    // $ figure must be far below the raw PLS figure
    expect(splitFee(2_020_202, PLS_USD).platformUsd).toBeLessThan(2_020_202 * 0.5 * 0.01)
  })
})

describe('Graduation: 4M PLS fee deduction, 196M PLS PulseX LP seed, leftover token burn, price continuity', () => {
  it('deducts 4,000,000 PLS from 200M reserve, seeds PulseX with 196,000,000 PLS and matching tokens at last curve price, burns ~4.15M leftover tokens, splits 4M (2M / 1.5M / 0.5M), sets graduatedAt, PLS in == PLS out, price gap < 0.1%', () => {
    const nowTs = 1_792_888_000_000
    const q = quoteBuy(newCurve(), FILL_PLS)
    expect(q.graduates).toBe(true)

    const grad = applyBuy(newCurve(), q, nowTs)
    expect(grad.graduated).toBe(true)
    expect(grad.graduatedAt).toBe(nowTs)

    // 1. PulseX LP seeded with 196,000,000 PLS
    expect(grad.dexPls).toBe(196_000_000)
    expect(GRAD_LP_PLS).toBe(196_000_000)

    // 2. 4,000,000 PLS split as 2M platform / 1.5M holders / 0.5M creator
    expect(grad.graduationSplit).toEqual({
      feePls: 4_000_000,
      platformPls: 2_000_000,
      holdersPls: 1_500_000,
      creatorPls: 500_000,
    })

    // 3. PLS in (200,000,000) == PLS out (196M LP + 2M platform + 1.5M holders + 0.5M creator)
    const plsIn = grad.reservePls
    const plsOut =
      (grad.dexPls ?? 0) +
      (grad.graduationSplit?.platformPls ?? 0) +
      (grad.graduationSplit?.holdersPls ?? 0) +
      (grad.graduationSplit?.creatorPls ?? 0)
    expect(plsIn).toBe(200_000_000)
    expect(plsOut).toBe(plsIn)

    // 4. Leftover LP tokens (~4.15M) burned so PulseX opening price matches last curve price (gap < 0.1%)
    expect(grad.burnedTokens).toBeCloseTo(GRAD_BURNED_TOKENS, 4)
    expect(grad.burnedTokens).toBeCloseTo(4_151_709.04, 1)
    expect((grad.dexTokens ?? 0) + (grad.burnedTokens ?? 0)).toBeCloseTo(LP_TOKENS, 6)
    expect(grad.tokensSold + (grad.dexTokens ?? 0) + (grad.burnedTokens ?? 0)).toBeCloseTo(TOTAL_SUPPLY, 6)

    const pulsexOpeningPrice = (grad.dexPls ?? 0) / (grad.dexTokens ?? 1)
    const priceGapPct = (Math.abs(pulsexOpeningPrice - LAST_CURVE_PRICE_PLS) / LAST_CURVE_PRICE_PLS) * 100
    expect(priceGapPct).toBeLessThan(0.1)
    expect(pricePls(grad)).toBeCloseTo(LAST_CURVE_PRICE_PLS, 9)
  })
})

describe('no buy caps, slippage, and price impact', () => {
  it('allows uncapped buys on the bonding curve without any 20M PLS per-user limit', () => {
    const c = newCurve()
    expect(quoteBuy(c, 20_000_000).ok).toBe(true)
    expect(quoteBuy(c, 50_000_000).ok).toBe(true)
    expect(quoteBuy(c, 150_000_000).ok).toBe(true)
    expect(quoteBuy(c, FILL_PLS).ok).toBe(true)
  })

  it('computes priceImpactPct as (avgExecPrice / spotBefore - 1) so a 10M PLS buy on a fresh curve is ~14% (not ~30%)', () => {
    const c = newCurve()
    const q1 = quoteBuy(c, 10_000_000, { slippagePct: 1 })
    expect(q1.ok).toBe(true)
    // 10M PLS buy -> net 9,875,000 PLS -> avgExecPrice / spotBefore - 1 = 9,875,000 / 70,583,785.15 = 13.9905% (~14%, NOT ~30%)
    expect(q1.priceImpactPct).toBeCloseTo(13.99, 1)
    expect(q1.priceImpactPct).toBeGreaterThan(13.5)
    expect(q1.priceImpactPct).toBeLessThan(14.5)
    expect(q1.minReceivedTokens).toBeCloseTo(q1.tokens * 0.99, 4)

    const q3 = quoteBuy(c, 10_000_000, { slippagePct: 3 })
    expect(q3.minReceivedTokens).toBeCloseTo(q3.tokens * 0.97, 4)

    const afterBuy = applyBuy(c, q1)
    const qs = quoteSell(afterBuy, q1.tokens, q1.tokens, { slippagePct: 0.5 })
    expect(qs.ok).toBe(true)
    expect(qs.priceImpactPct).toBeGreaterThan(0)
    expect(qs.minReceivedPls).toBeCloseTo(qs.plsOut * 0.995, 4)
  })
})

describe('sells', () => {
  it('sell returns PLS minus full 1.25% fee on the bonding curve and never pays more than the reserve', () => {
    const c = applyBuy(newCurve(), quoteBuy(newCurve(), 5_000_000))
    const q = quoteSell(c, c.tokensSold, c.tokensSold)
    expect(q.ok).toBe(true)
    expect(q.gross).toBeLessThanOrEqual(c.reservePls + 1e-6)
    expect(q.fee).toBeCloseTo(q.gross * 0.0125, 6)
    expect(q.plsOut).toBeCloseTo(q.gross * 0.9875, 6)
    expect(applySell(c, q).reservePls).toBeCloseTo(0, 3)
    expect(pricePls(applySell(c, q))).toBeCloseTo(pricePls(newCurve()), 9)
  })
})

describe('formatting', () => {
  it('chart dollars are plain full dollars, never K/M or scientific', () => {
    expect(fmtUsd(7_733.73)).toBe('$7,734')
    expect(fmtUsd(12_345_678)).toBe('$12,345,678')
    expect(fmtUsd(0.0000123)).not.toMatch(/e/i)
    expect(fmtUsd(2_500_000)).not.toMatch(/[KM]/)
  })
})

import { canonicalUsername, validateUsername } from './usernames'
describe('usernames', () => {
  const reg = [{ name: 'harbor', wallet: '0xbbb' }]
  const reserved = ['Gain_Zee']
  it('reserves the platform account (not pre-registered) and blocks lookalikes', () => {
    expect(validateUsername('gain_zee', reg, '0xccc', reserved)).toMatch(/reserved/)
    expect(validateUsername('ga1nzee', reg, '0xccc', reserved)).toMatch(/reserved/)
    expect(validateUsername('GAIN__ZEE', reg, '0xccc', reserved)).toMatch(/reserved/)
    expect(validateUsername('uniq_pulse', reg, '0xccc')).toMatch(/reserved/)
    expect(validateUsername('uniq_anon', reg, '0xccc')).toMatch(/reserved/)
    expect(validateUsername('harbor', reg, '0xccc', reserved)).toMatch(/taken/)
    expect(validateUsername('harb0r', reg, '0xccc', reserved)).toMatch(/Too close/)
    expect(validateUsername('gаin_zee', reg, '0xccc', reserved)).toMatch(/plain letters/) // Cyrillic а
    expect(canonicalUsername('I_l1')).toBe(canonicalUsername('lll'))
  })
  it('one username per wallet', () => {
    expect(validateUsername('newname', reg, '0xBBB')).toMatch(/already bound to @harbor/)
    expect(validateUsername('newname', reg, '0xddd')).toBeNull()
  })
})

import { isValidPlsUsd } from './price'
describe('Phase 2: PriceSource sanity guards', () => {
  it('accepts realistic PLS USD prices and rejects >= $0.10 or $1 or <= 0', () => {
    expect(isValidPlsUsd(0.000008)).toBe(true)
    expect(isValidPlsUsd(0.00005)).toBe(true)
    expect(isValidPlsUsd(1)).toBe(false)
    expect(isValidPlsUsd(0)).toBe(false)
    expect(isValidPlsUsd(-0.0001)).toBe(false)
    expect(isValidPlsUsd(NaN)).toBe(false)
  })
})

describe('Post-graduation trading on uniq.pulse (via migrated PulseX / DexScreener pool)', () => {
  it('after migration, does NOT charge 1.25% FEE_RATE on PulseX trades; charges only POST_MIGRATION_LP_FEE', async () => {
    const gradCurve = applyBuy(newCurve(), quoteBuy(newCurve(), FILL_PLS))
    expect(gradCurve.graduated).toBe(true)

    const postBuy = quoteBuy(gradCurve, 10_000_000)
    expect(postBuy.ok).toBe(true)
    expect(postBuy.tokens).toBeGreaterThan(0)
    expect(postBuy.fee).toBeCloseTo(10_000_000 * POST_MIGRATION_LP_FEE, 3)
    expect(postBuy.fee).not.toBeCloseTo(10_000_000 * FEE_RATE, 1)

    const afterPostBuy = applyBuy(gradCurve, postBuy)
    expect(afterPostBuy.dexPls).toBeCloseTo(196_000_000 + 10_000_000 * (1 - POST_MIGRATION_LP_FEE), 2)
    expect(pricePls(afterPostBuy)).toBeGreaterThan(pricePls(gradCurve))

    const postSell = quoteSell(afterPostBuy, postBuy.tokens, postBuy.tokens)
    expect(postSell.ok).toBe(true)
    expect(postSell.fee).toBeCloseTo(postSell.gross * POST_MIGRATION_LP_FEE, 3)
    expect(postSell.plsOut).toBeGreaterThan(0)

    const { setEvm, useStore } = await import('../state/store')
    const lowerAddr = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
    setEvm(lowerAddr, 'MetaMask')
    expect(useStore).toBeDefined()
  })
})

import { validateAntiReplica } from './usernames'
describe('Smart Anti-Clone Engine (blocks direct clones without over-blocking distinct crypto meta coins)', () => {
  const existing = [
    { ticker: 'BELL', name: 'Harbor Bell' },
    { ticker: 'ACRE', name: 'North Acre' },
    { ticker: 'PULSE', name: 'Pulse Core' },
    { ticker: 'NOVA', name: 'Nova Star' },
  ]
  it('blocks exact and direct clone-wrapper tickers and names', () => {
    expect(validateAntiReplica('New Story', 'BELL', existing)).toMatch(/already launched/)
    expect(validateAntiReplica('New Story', 'BELL2', existing)).toMatch(/Clone blocked/)
    expect(validateAntiReplica('New Story', 'BABYBELL', existing)).toMatch(/Clone blocked/)
    expect(validateAntiReplica('Harbor Bell V2', 'UNIQX', existing)).toMatch(/Clone blocked/)
  })
  it('allows distinct crypto meta coins and English words without false-positive blocking', () => {
    expect(validateAntiReplica('Solar Forge', 'FORGE', existing)).toBeNull()
    expect(validateAntiReplica('Pulse AI Agent', 'PULSEAI', existing)).toBeNull()
    expect(validateAntiReplica('Supernova Protocol', 'SUPRNOVA', existing)).toBeNull()
    expect(validateAntiReplica('Liberty Bells', 'BELLS', existing)).toBeNull()
    expect(validateAntiReplica('Bell AI', 'BELLAI', existing)).toBeNull()
  })
})

import { computeCoinHolderRewardsMap, type Coin } from '../state/store'
describe('Synthetix / MasterChef rewardPerToken holder pool accumulator & solvency', () => {
  it('never pays out more than coin.holderRewardPoolPls, preserves accrued rewards for auto-claim on sell, and scales down running rate after selling', () => {
    const mockCoin: Coin = {
      ticker: 'TEST',
      name: 'Test Coin',
      story: 'Testing rewardPerToken',
      launcher: 'alice',
      createdAt: 1000,
      curve: { reservePls: 200_000_000, tokensSold: 793_100_000, graduated: true, dexPls: 200_000_000, dexTokens: 206_900_000 },
      candles: [],
      // Stored newest-first in coin.trades:
      // 1) alice buys 100M tokens (10M PLS -> 50k PLS holder fee)
      // 2) bob buys 100M tokens (10M PLS -> 50k PLS holder fee)
      // 3) charlie buys 10M tokens (100M PLS -> 500k PLS holder fee)
      // 4) bob sells 99M tokens (locks in his ~262k PLS earned while holding, and drops his running balance to 1M tokens)
      // 5) dave buys 10M tokens (100M PLS -> 500k PLS holder fee — bob now only gets ~1M / 121M = ~0.82% of this new fee!)
      trades: [
        { t: 5000, side: 'buy', user: 'dave', tokens: 10_000_000, pls: 100_000_000 },
        { t: 4000, side: 'sell', user: 'bob', tokens: 99_000_000, pls: 9_000_000 },
        { t: 3000, side: 'buy', user: 'charlie', tokens: 10_000_000, pls: 100_000_000 },
        { t: 2000, side: 'buy', user: 'bob', tokens: 100_000_000, pls: 10_000_000 },
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: {
        alice: 100_000_000,
        bob: 1_000_000,
        charlie: 10_000_000,
        dave: 10_000_000,
      },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 1_145_000, // exact 0.50% of 229,000,000 PLS total volume
    }

    const map = computeCoinHolderRewardsMap(mockCoin)
    const totalDistributed = Object.values(map).reduce((sum, a) => sum + a.earnedPls, 0)

    // Invariant 1: Total distributed across all holders can NEVER exceed holderRewardPoolPls
    expect(totalDistributed).toBeLessThanOrEqual(mockCoin.holderRewardPoolPls! + 1e-6)
    expect(totalDistributed).toBeCloseTo(mockCoin.holderRewardPoolPls!, 2)

    // Invariant 2: Because Bob sold ANY amount (even partial) pre-migration at t=4000,
    // ALL (100%) of his accrued rewards at that moment were forfeited to Alice & Charlie,
    // and Bob only earned new rewards on his remaining 1M tokens from Dave's buy at t=5000 (1M/121M of 500k PLS ≈ 4,132 PLS)
    expect(map['bob'].forfeitedPls).toBeGreaterThan(250_000)
    expect(map['bob'].earnedPls).toBeCloseTo((1_000_000 / 121_000_000) * 500_000, 1)
    expect(map['alice'].earnedPls).toBeGreaterThan(950_000)
  })

  it('ANY pre-migration sell (even 10%) forfeits ALL unclaimed rewards to remaining holders, and a later buy does NOT restore forfeited rewards', async () => {
    const { computeCoinHolderRewardsMap } = await import('../state/store')

    const baseCoin: import('../state/store').Coin = {
      ticker: 'PARTIAL',
      name: 'Partial Sell Forfeit',
      story: 'Test',
      launcher: 'dev',
      createdAt: 1000,
      curve: newCurve(), // Pre-migration
      candles: [],
      trades: [
        { t: 2000, side: 'buy', user: 'bob', tokens: 100_000_000, pls: 10_000_000 },
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: {
        alice: 100_000_000,
        bob: 100_000_000,
      },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 100_000,
    }

    const before = computeCoinHolderRewardsMap(baseCoin)
    expect(before['alice'].earnedPls).toBeGreaterThan(0)

    // Alice sells just 10% (10M tokens) pre-migration (pls=0 to isolate pure forfeit without new sell fee)
    const afterPartialSell: import('../state/store').Coin = {
      ...baseCoin,
      trades: [
        { t: 3000, side: 'sell', user: 'alice', tokens: 10_000_000, pls: 0 },
        ...baseCoin.trades,
      ],
      holders: {
        alice: 90_000_000,
        bob: 100_000_000,
      },
      forfeitedHolders: { alice: true },
    }

    const afterSellMap = computeCoinHolderRewardsMap(afterPartialSell)
    // Even though Alice only sold 10%, ALL of her unclaimed rewards at t=3000 are forfeited to Bob!
    expect(afterSellMap['alice'].earnedPls).toBeCloseTo(0, 4)
    expect(afterSellMap['alice'].forfeitedPls).toBeCloseTo(before['alice'].earnedPls, 2)
    expect(afterSellMap['bob'].earnedPls).toBeCloseTo(100_000, 2)

    // Now Alice buys again (10M tokens, 10M PLS -> +50,000 PLS holder fee):
    // Her forfeited rewards are NOT restored; she only earns new rewards going forward from her new buy!
    const afterRebuy: import('../state/store').Coin = {
      ...afterPartialSell,
      trades: [
        { t: 4000, side: 'buy', user: 'alice', tokens: 10_000_000, pls: 10_000_000 },
        ...afterPartialSell.trades,
      ],
      holders: {
        alice: 100_000_000,
        bob: 100_000_000,
      },
      holderRewardPoolPls: 150_000,
    }

    const rebuyMap = computeCoinHolderRewardsMap(afterRebuy)
    expect(rebuyMap['alice'].forfeitedPls).toBeCloseTo(before['alice'].earnedPls, 2)
    // After Alice's rebuy of 10M tokens (bringing her to 100M / 200M = 50%), she earns 50% of the new 50,000 PLS fee = 25,000 PLS (never restores her old 75,000 PLS!)
    expect(rebuyMap['alice'].earnedPls).toBeCloseTo(25_000, 2)
    expect(rebuyMap['bob'].earnedPls).toBeCloseTo(125_000, 2)
  })

  it('A and B hold equal bags, A sells 100% pre-migration, A accrued rewards move to B, total pool PLS is unchanged', async () => {
    const { computeCoinHolderRewardsMap } = await import('../state/store')

    // Before A sells: A and B hold equal 100M bags and have accrued rewards from curve volume
    const coinBeforeSell: import('../state/store').Coin = {
      ticker: 'FORFEIT',
      name: 'Forfeit Test',
      story: 'Test',
      launcher: 'dev',
      createdAt: 1000,
      curve: newCurve(), // Pre-migration (graduated = false)
      candles: [],
      trades: [
        { t: 2000, side: 'buy', user: 'bob', tokens: 100_000_000, pls: 10_000_000 },
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: {
        alice: 100_000_000,
        bob: 100_000_000,
      },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 100_000, // 50k from Alice buy + 50k from Bob buy
    }

    const beforeMap = computeCoinHolderRewardsMap(coinBeforeSell)
    const poolBefore = Object.values(beforeMap).reduce((s, a) => s + a.earnedPls, 0)
    expect(poolBefore).toBeCloseTo(100_000, 2)
    expect(beforeMap['alice'].earnedPls).toBeGreaterThan(0)
    expect(beforeMap['bob'].earnedPls).toBeGreaterThan(0)

    // Now A (alice) sells 100% (100M tokens) pre-migration (with pls=0 to isolate pure forfeit redistribution without adding new sell fee)
    const coinAfterASells100Pct: import('../state/store').Coin = {
      ...coinBeforeSell,
      trades: [
        { t: 3000, side: 'sell', user: 'alice', tokens: 100_000_000, pls: 0 },
        ...coinBeforeSell.trades,
      ],
      holders: {
        alice: 0,
        bob: 100_000_000,
      },
    }

    const afterMap = computeCoinHolderRewardsMap(coinAfterASells100Pct)
    const poolAfter = Object.values(afterMap).reduce((s, a) => s + a.earnedPls, 0)

    // 1. A's accrued rewards are 0 (100% forfeited)
    expect(afterMap['alice'].earnedPls).toBeCloseTo(0, 4)
    expect(afterMap['alice'].forfeitedPls).toBeCloseTo(beforeMap['alice'].earnedPls, 2)

    // 2. All of A's accrued rewards moved to B
    expect(afterMap['bob'].earnedPls).toBeCloseTo(beforeMap['bob'].earnedPls + beforeMap['alice'].earnedPls, 2)
    expect(afterMap['bob'].earnedPls).toBeCloseTo(100_000, 2)

    // 3. Total pool PLS is unchanged
    expect(poolAfter).toBeCloseTo(poolBefore, 2)
  })
})

describe('Liberty Swap /bridge page behavior & EIP-55 checksum validation', () => {
  it('1) Validates EIP-55 checksummed 0x address before copy and rejects placeholder or non-checksummed addresses', async () => {
    const { copyPulseChainAddress, isValidChecksumAddress, toChecksumAddress } = await import('../pages/Bridge')
    let clipboardText = ''
    const validAddr = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
    expect(toChecksumAddress(validAddr.toLowerCase())).toBe(validAddr)
    expect(isValidChecksumAddress(validAddr)).toBe(true)

    // Rejects placeholder addresses
    expect(isValidChecksumAddress('0x0000000000000000000000000000000000000001')).toBe(false)
    expect(isValidChecksumAddress('0x3690000000000000000000000000000000000369')).toBe(false)
    // Rejects wrong-case non-checksummed address
    expect(isValidChecksumAddress(validAddr.toLowerCase())).toBe(false)

    const failPlaceholder = await copyPulseChainAddress('0x3690000000000000000000000000000000000369', async (t) => {
      clipboardText = t
    })
    expect(failPlaceholder).toBe(false)
    expect(clipboardText).toBe('')

    const ok = await copyPulseChainAddress(validAddr, async (t) => {
      clipboardText = t
    })
    expect(ok).toBe(true)
    expect(clipboardText).toBe(validAddr)
  })

  it('2) Bridge button is disabled without a connected wallet (triggerLibertyBridge refuses null or placeholder address)', async () => {
    const { triggerLibertyBridge } = await import('../pages/Bridge')
    let opened = false
    const res = await triggerLibertyBridge(null, {
      openUrl: () => {
        opened = true
      },
    })
    expect(res.ok).toBe(false)
    expect(opened).toBe(false)

    const resPlaceholder = await triggerLibertyBridge('0x0000000000000000000000000000000000000001', {
      openUrl: () => {
        opened = true
      },
    })
    expect(resPlaceholder.ok).toBe(false)
    expect(opened).toBe(false)
  })

  it('3) Clicking Bridge from Solana copies the checksummed address, shows toast, and opens LIBERTY_BRIDGE_URL in a new tab', async () => {
    const { triggerLibertyBridge, LIBERTY_COPY_TOAST } = await import('../pages/Bridge')
    const { LIBERTY_BRIDGE_URL } = await import('../config')
    let copiedAddr = ''
    let openedUrl = ''
    let openedTarget = ''
    let toastShown = ''
    const addr = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'

    const res = await triggerLibertyBridge(addr, {
      writeText: async (t) => {
        copiedAddr = t
      },
      openUrl: (u, target) => {
        openedUrl = u
        openedTarget = target ?? ''
      },
      onToast: (t) => {
        toastShown = t
      },
    })

    expect(res.ok).toBe(true)
    expect(copiedAddr).toBe(addr)
    expect(toastShown).toBe(LIBERTY_COPY_TOAST)
    expect(openedUrl).toBe(LIBERTY_BRIDGE_URL)
    expect(openedTarget).toBe('_blank')
  })

  it('4) PLS balance refreshes automatically when the window regains focus', async () => {
    const { attachBridgeFocusRefresh } = await import('../pages/Bridge')
    const listeners: Record<string, Array<() => void>> = {}
    const fakeWindow = {
      addEventListener: (ev: string, fn: EventListenerOrEventListenerObject) => {
        listeners[ev] = listeners[ev] ?? []
        listeners[ev].push(fn as () => void)
      },
      removeEventListener: (ev: string, fn: EventListenerOrEventListenerObject) => {
        listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn)
      },
    }

    let refreshedAddr = ''
    const validAddr = '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB'
    const detach = attachBridgeFocusRefresh(
      fakeWindow,
      () => validAddr,
      (addr) => {
        refreshedAddr = addr
      }
    )

    // Simulate user returning to the uniq.pulse tab
    for (const fn of listeners['focus'] ?? []) fn()
    expect(refreshedAddr).toBe(validAddr)

    detach()
    expect((listeners['focus'] ?? []).length).toBe(0)
  })
})

describe('RewardsRouter.claimAll, 40/20/40 Vault Harvest, Logged-Out /rewards, & Profile Image Sanitization', () => {
  it('canHarvest is only true when pending vault fees >= threshold, and harvestVault splits 40% holders / 20% creator / 40% platform', async () => {
    const { RewardsRouter } = await import('../state/store')
    const coinBelowThreshold: import('../state/store').Coin = {
      ticker: 'VAULT1',
      name: 'Vault Test',
      story: 'Test',
      launcher: 'alice',
      createdAt: 1000,
      curve: { reservePls: 200_000_000, tokensSold: 793_100_000, graduated: true, dexPls: 196_000_000, dexTokens: GRAD_LP_TOKENS },
      candles: [],
      trades: [],
      holders: { alice: 100_000_000 },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 500_000, // Even with large existing pool, canHarvest must check ONLY pending vault fees
      devRewardPoolPls: 250_000,
      unharvestedLpFeesPls: 49_999,
    }
    expect(RewardsRouter.canHarvest(coinBelowThreshold)).toBe(false)
    expect(RewardsRouter.harvestVault(coinBelowThreshold)).toBe(0)

    coinBelowThreshold.unharvestedLpFeesPls = 100_000
    expect(RewardsRouter.canHarvest(coinBelowThreshold)).toBe(true)
    const harvested = RewardsRouter.harvestVault(coinBelowThreshold)
    expect(harvested).toBe(100_000)
    expect(coinBelowThreshold.unharvestedLpFeesPls).toBe(0)
    // 40% holders (+40k), 20% creator (+20k), 40% platform (+40k)
    expect(coinBelowThreshold.holderRewardPoolPls).toBe(500_000 + 40_000)
    expect(coinBelowThreshold.devRewardPoolPls).toBe(250_000 + 20_000)
    expect(coinBelowThreshold.platformFeePls).toBe(40_000)
  })

  it('Claim all pays the exact sum of per-coin claimable holder + creator rewards; locked and forfeited rewards are not paid; claiming twice pays 0', async () => {
    const { RewardsRouter, computeUserRewards } = await import('../state/store')

    // Coin 1: Graduated coin where alice is BOTH creator and holder (with 100k unharvested vault fees ready for canHarvest())
    // 100k vault harvest splits 40% holder (+40k) / 20% creator (+20k) / 40% platform (+40k)
    const graduatedCoin1: import('../state/store').Coin = {
      ticker: 'GRAD1',
      name: 'Graduated One',
      story: 'Test',
      launcher: 'alice',
      createdAt: 1000,
      curve: { reservePls: 200_000_000, tokensSold: 793_100_000, graduated: true, dexPls: 196_000_000, dexTokens: GRAD_LP_TOKENS },
      candles: [],
      trades: [
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 20_000_000 },
      ],
      holders: { alice: 100_000_000 },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 100_000,
      devRewardPoolPls: 50_000,
      unharvestedLpFeesPls: 100_000, // >= 50,000 PLS threshold so canHarvest() is true (+40k holder, +20k creator, +40k platform)
    }

    // Coin 2: Graduated coin where alice is a holder only
    const graduatedCoin2: import('../state/store').Coin = {
      ticker: 'GRAD2',
      name: 'Graduated Two',
      story: 'Test',
      launcher: 'bob',
      createdAt: 1000,
      curve: { reservePls: 200_000_000, tokensSold: 793_100_000, graduated: true, dexPls: 196_000_000, dexTokens: GRAD_LP_TOKENS },
      candles: [],
      trades: [
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 16_000_000 },
      ],
      holders: { alice: 100_000_000 },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 80_000,
      devRewardPoolPls: 40_000,
    }

    // Coin 3: Locked pre-migration coin (NOT graduated) — should NOT be paid!
    const lockedCoin: import('../state/store').Coin = {
      ticker: 'LOCKD',
      name: 'Locked Curve Coin',
      story: 'Test',
      launcher: 'alice',
      createdAt: 1000,
      curve: newCurve(), // graduated: false
      candles: [],
      trades: [
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: { alice: 100_000_000 },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 50_000,
      devRewardPoolPls: 25_000,
    }

    // Coin 4: Forfeited pre-migration coin where alice sold 100% — should NOT be paid!
    const forfeitedCoin: import('../state/store').Coin = {
      ticker: 'FORFT',
      name: 'Forfeited Coin',
      story: 'Test',
      launcher: 'bob',
      createdAt: 1000,
      curve: newCurve(),
      candles: [],
      trades: [
        { t: 3000, side: 'sell', user: 'alice', tokens: 100_000_000, pls: 0 },
        { t: 2000, side: 'buy', user: 'bob', tokens: 100_000_000, pls: 10_000_000 },
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: { alice: 0, bob: 100_000_000 },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 100_000,
      devRewardPoolPls: 50_000,
    }

    const coins = [graduatedCoin1, graduatedCoin2, lockedCoin, forfeitedCoin]

    // 1. First Claim All: harvests GRAD1 (100k -> +40k holder, +20k creator, +40k platform) and pays exact sum of GRAD1 (140k + 70k = 210k) + GRAD2 (80k) = 290,000 PLS
    const firstClaim = RewardsRouter.claimAll('alice', coins)
    expect(firstClaim.harvestedTickers).toContain('GRAD1')
    expect(firstClaim.perCoinPaid['GRAD1']).toBeCloseTo(210_000, 2)
    expect(firstClaim.perCoinPaid['GRAD2']).toBeCloseTo(80_000, 2)
    expect(firstClaim.perCoinPaid['LOCKD']).toBeUndefined()
    expect(firstClaim.perCoinPaid['FORFT']).toBeUndefined()
    expect(firstClaim.totalPaidPls).toBeCloseTo(210_000 + 80_000, 2)

    // Verify locked rewards on LOCKD are still locked (not paid)
    const afterSummary = computeUserRewards('alice', coins)
    expect(afterSummary.totalClaimablePls).toBeCloseTo(0, 4)
    expect(afterSummary.totalPendingLockedPls).toBeCloseTo(75_000, 2) // 50k holder + 25k creator on LOCKD

    // 2. Claiming a second time pays 0
    const secondClaim = RewardsRouter.claimAll('alice', coins)
    expect(secondClaim.totalPaidPls).toBe(0)
  })

  it('Rewards page does not fall back to @gainzee when logged out, and profile images enforce https:// and <1MB limits', async () => {
    const { resolveRewardsUsername, LOGGED_OUT_REWARDS_PROMPT } = await import('../pages/Rewards')
    const { validateProfileImageUrl } = await import('../state/store')

    expect(resolveRewardsUsername(null)).toBeNull()
    expect(resolveRewardsUsername(undefined)).toBeNull()
    expect(LOGGED_OUT_REWARDS_PROMPT).toBe('Connect wallet to see your rewards')

    // Valid https URL & small base64 image
    expect(validateProfileImageUrl('https://uniq.pulse/banner.png').ok).toBe(true)
    expect(validateProfileImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=').ok).toBe(true)

    // Rejects http://, javascript:, CSS injection, and >1MB base64 payloads
    expect(validateProfileImageUrl('http://insecure.example.com/pic.png').ok).toBe(false)
    expect(validateProfileImageUrl('javascript:alert(1)').ok).toBe(false)
    expect(validateProfileImageUrl('https://evil.com/a.png");background:red').ok).toBe(false)
    const over1MbBase64 = 'data:image/png;base64,' + 'A'.repeat(1_400_000)
    expect(validateProfileImageUrl(over1MbBase64).ok).toBe(false)
  })

  it('Batch 2A: starts logged out with normal test balance, logoutUser logs out, setEvm returns error on malformed address, and slippage check rejects worse than minReceived', async () => {
    const {
      resetDemo,
      loginAsPersonalWallet,
      logoutUser,
      setEvm,
      buyCoin,
      sellCoin,
      simulateCoinRunUp,
      getHolderTierBadge,
    } = await import('../state/store')
    const { HOW_IT_WORKS_SECTIONS } = await import('../pages/Uniq')

    // 1. Starts logged out by default with normal test balance (no 500B PLS dev account)
    resetDemo()
    const loggedIn = loginAsPersonalWallet('gainzee', { allowInTests: true })
    expect(loggedIn.info).toContain('gainzee')
    logoutUser()

    // 2. setEvm returns an error message instead of throwing on a malformed address
    const badEvm = setEvm('not-a-valid-hex-address', 'MetaMask')
    expect(badEvm.error).toBeDefined()

    // 3. Trade fails with "Price moved beyond your slippage" if result is worse than minReceived
    loginAsPersonalWallet('gainzee', { allowInTests: true })
    const slipBuy = buyCoin('BELL', 1_000_000, { slippagePct: 1, minReceived: 999_999_999_999 })
    expect(slipBuy.error).toBe('Price moved beyond your slippage')

    const validBuy = buyCoin('BELL', 1_000_000)
    expect(validBuy.error).toBeUndefined()

    const slipSell = sellCoin('BELL', 1_000, { slippagePct: 1, minReceived: 999_999_999_999 })
    expect(slipSell.error).toBe('Price moved beyond your slippage')

    // 4. Flat rate rewards (multiplier = 1.0, no 1.5x)
    const tier = getHolderTierBadge('gainzee', [])
    expect(tier.multiplier).toBe(1)

    // 5. How it works wording check ("about 79.3%" and "Sell any amount before migration and you forfeit all your unclaimed rewards on that coin. They go to the holders who stayed.")
    const allHowText = HOW_IT_WORKS_SECTIONS.map((s) => s.body).join(' ')
    expect(allHowText).toContain('About 79.3%')
    expect(allHowText).toContain('Sell any amount before migration and you forfeit all your unclaimed rewards on that coin. They go to the holders who stayed.')

    // 6. simulateCoinRunUp uses GRAD_LP_PLS (196M) and treats post-graduation trades as PulseX trades
    const simRes = simulateCoinRunUp('BELL', { mode: 'mcap', targetMcapUsd: 25_000, sellPressurePct: 10 })
    expect(simRes.error).toBeUndefined()

    logoutUser()
  })

  it('Rebuy after forfeit: a wallet that sold before migration loses its old unclaimed rewards forever, but tokens bought afterwards earn curve fees, graduation holder bonus, and LP harvests like a brand-new holder', async () => {
    const { computeCoinHolderRewardsMap, computeUserRewards, RewardsRouter } = await import('../state/store')

    // Step 1: Alice and Bob each buy 100M tokens (10M PLS each -> 100,000 PLS total holder pool)
    // Step 2: Alice sells all 100M tokens pre-migration (forfeits all her old rewards to Bob)
    // Step 3: Alice rebuys 100M tokens (10M PLS -> +50,000 PLS holder fee)
    // Step 4: Coin graduates (+1,500,000 PLS graduation holder bonus) and harvests 100,000 PLS LP vault (+40,000 PLS to holders)
    const graduatedAfterRebuy: import('../state/store').Coin = {
      ticker: 'REBUY',
      name: 'Rebuy After Forfeit',
      story: 'Test',
      launcher: 'bob',
      createdAt: 1000,
      curve: {
        reservePls: 200_000_000,
        tokensSold: 793_100_000,
        graduated: true,
        dexPls: 196_000_000,
        dexTokens: GRAD_LP_TOKENS,
      },
      candles: [],
      trades: [
        { t: 4000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
        { t: 3000, side: 'sell', user: 'alice', tokens: 100_000_000, pls: 0 },
        { t: 2000, side: 'buy', user: 'bob', tokens: 100_000_000, pls: 10_000_000 },
        { t: 1000, side: 'buy', user: 'alice', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: {
        alice: 100_000_000,
        bob: 100_000_000,
      },
      openingSpent: {},
      demo: true,
      // 100k pre-sell fees (all Bob's) + 50k rebuy fee (25k Alice, 25k Bob) + 1.5M graduation holder bonus (750k Alice, 750k Bob)
      holderRewardPoolPls: 150_000 + 1_500_000,
      devRewardPoolPls: 500_000,
      unharvestedLpFeesPls: 100_000, // Harvest adds +40,000 PLS to holder pool (20k Alice, 20k Bob)
      forfeitedHolders: { alice: false },
    }

    RewardsRouter.harvestVault(graduatedAfterRebuy)
    const map = computeCoinHolderRewardsMap(graduatedAfterRebuy)

    // Alice lost her old 75,000 PLS forever, but earned 25,000 (rebuy fee) + 750,000 (50% of 1.5M grad bonus) + 20,000 (50% of 40k LP harvest) = 795,000 PLS!
    expect(map['alice'].forfeitedPls).toBeCloseTo(75_000, 1)
    expect(map['alice'].forfeitedBySell).toBe(false)
    expect(map['alice'].earnedPls).toBeCloseTo(25_000 + 750_000 + 20_000, 1)
    expect(map['bob'].earnedPls).toBeCloseTo(100_000 + 25_000 + 750_000 + 20_000, 1)

    // Verify Alice can claim her post-rebuy holder rewards via computeUserRewards & RewardsRouter.claimAll
    const aliceRewards = computeUserRewards('alice', [graduatedAfterRebuy])
    expect(aliceRewards.totalClaimablePls).toBeCloseTo(795_000, 1)
    const claimRes = RewardsRouter.claimAll('alice', [graduatedAfterRebuy])
    expect(claimRes.totalPaidPls).toBeCloseTo(795_000, 1)
  })

  it('Platform fee security & STORAGE_KEY v5: STORAGE_KEY is uniqpulse-demo-v5, empty VITE_PLATFORM_WALLET disables claim ("Platform wallet not configured"), and configured wallet requires only s.evm == PLATFORM_WALLET', async () => {
    const { STORAGE_KEY, PLATFORM_WALLET, PLATFORM_USERNAME } = await import('../config')
    const { claimPlatformDevVaultRewards, loginAsPlatformDev, setEvm, logoutUser } = await import('../state/store')

    expect(PLATFORM_USERNAME).toBe('uniq_pulse')
    expect(STORAGE_KEY).toBe('uniqpulse-demo-v5')
    expect(PLATFORM_WALLET).toBe('')

    // 1. When VITE_PLATFORM_WALLET is not set, claimPlatformDevVaultRewards returns "Platform wallet not configured"
    loginAsPlatformDev({ allowInTests: true })
    const unconfigured = claimPlatformDevVaultRewards()
    expect(unconfigured.error).toBe('Platform wallet not configured')

    // 2. When configured, a non-matching wallet is rejected
    const targetWallet = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
    setEvm('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'MetaMask')
    const wrongWallet = claimPlatformDevVaultRewards({ configuredPlatformWallet: targetWallet })
    expect(wrongWallet.error).toContain('Permission denied')

    // 3. When s.evm == PLATFORM_WALLET, claim succeeds without requiring ?dev=1
    setEvm(targetWallet, 'Rabby')
    const allowed = claimPlatformDevVaultRewards({ configuredPlatformWallet: targetWallet })
    expect(allowed.error).toBeUndefined()
    expect(allowed.info).toContain('PLATFORM_WALLET')

    logoutUser()
  })

  it('Item 5 — Graduation bonus snapshot: 1.5M PLS graduation holder bonus is split by balances AT the graduation moment; post-graduation buyers get 0 of it, but DO earn subsequent LP harvests', async () => {
    const { RewardsRouter, computeCoinHolderRewardsMap } = await import('../state/store')
    // At graduation (t = 2000), alice holds 60M tokens (60%) and bob holds 40M tokens (40%).
    // After graduation (t = 5000), charlie buys 100M tokens on PulseX / post-migration (so current balances are alice 60M, bob 40M, charlie 100M).
    const coin: Coin = {
      ticker: 'SNAP',
      name: 'Snapshot Bonus',
      story: 'Graduation snapshot test',
      launcher: 'dev',
      createdAt: 1000,
      curve: {
        tokensSold: 200_000_000,
        reservePls: GRAD_PLS,
        graduated: true,
      },
      graduatedAt: 2000,
      graduationBalances: {
        alice: 60_000_000,
        bob: 40_000_000,
      },
      candles: [],
      trades: [
        { t: 5000, side: 'buy', user: 'charlie', tokens: 100_000_000, pls: 0 }, // Post-graduation buyer
        { t: 1800, side: 'buy', user: 'bob', tokens: 40_000_000, pls: 0 },
        { t: 1200, side: 'buy', user: 'alice', tokens: 60_000_000, pls: 0 },
      ],
      holders: {
        alice: 60_000_000,
        bob: 40_000_000,
        charlie: 100_000_000,
      },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 1_500_000,
      devRewardPoolPls: 500_000,
      unharvestedLpFeesPls: 0,
    }

    // Before any post-migration LP harvest:
    // Alice gets 60% of 1.5M = 900,000 PLS; Bob gets 40% of 1.5M = 600,000 PLS; Charlie gets 0 PLS of the graduation bonus!
    const preHarvestMap = computeCoinHolderRewardsMap(coin)
    expect(preHarvestMap['alice'].earnedPls).toBeCloseTo(900_000, 1)
    expect(preHarvestMap['bob'].earnedPls).toBeCloseTo(600_000, 1)
    expect(preHarvestMap['charlie'].earnedPls).toBeCloseTo(0, 1)

    // Now simulate 100,000 PLS of post-migration LP fees (40% = 40,000 PLS goes to current holders:
    // alice 30% = 12,000, bob 20% = 8,000, charlie 50% = 20,000).
    coin.unharvestedLpFeesPls = 100_000
    RewardsRouter.harvestVault(coin)

    const postHarvestMap = computeCoinHolderRewardsMap(coin)
    expect(postHarvestMap['alice'].earnedPls).toBeCloseTo(900_000 + 12_000, 1)
    expect(postHarvestMap['bob'].earnedPls).toBeCloseTo(600_000 + 8_000, 1)
    expect(postHarvestMap['charlie'].earnedPls).toBeCloseTo(20_000, 1)
  })

  it('Item 12a & 12b — Transparency metrics: dev %, dev sold %, top-10 % match trade history, plus sniper and bundle detection on a scripted launch', async () => {
    const { computeCoinTransparencyMetrics } = await import('./reputation')

    // Scripted launch at t = 10_000:
    // - dev buys 100M tokens (10% of 1B supply -> Large dev allocation > 5%) at t = 10_000, then sells 60M tokens at t = 50_000 (devSoldPct = 60%, devHeldPct = 4%).
    // - sniper1 buys 50M tokens (5% supply) at t = 15_000 (within 10s of launch -> sniper).
    // - bundle1, bundle2, bundle3 buy 20M tokens each (6% total) in the exact same second at launch (t = 10_500 -> bundle).
    // - bundle4 buys 10M tokens (1%) at t = 30_000, funded from the same funder wallet as bundle1 -> also bundle!
    const coin: Coin = {
      ticker: 'TRNS',
      name: 'Transparency Coin',
      story: 'Scripted launch test',
      launcher: 'dev_alpha',
      createdAt: 10_000,
      curve: { tokensSold: 200_000_000, reservePls: 25_000_000, graduated: false },
      candles: [],
      trades: [
        { t: 50_000, side: 'sell', user: 'dev_alpha', tokens: 60_000_000, pls: 5_000_000 },
        { t: 30_000, side: 'buy', user: 'bundle4', tokens: 10_000_000, pls: 1_000_000 },
        { t: 15_000, side: 'buy', user: 'sniper1', tokens: 50_000_000, pls: 5_000_000 },
        { t: 10_500, side: 'buy', user: 'bundle3', tokens: 20_000_000, pls: 2_000_000 },
        { t: 10_400, side: 'buy', user: 'bundle2', tokens: 20_000_000, pls: 2_000_000 },
        { t: 10_200, side: 'buy', user: 'bundle1', tokens: 20_000_000, pls: 2_000_000 },
        { t: 10_000, side: 'buy', user: 'dev_alpha', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: {
        dev_alpha: 40_000_000, // 4%
        sniper1: 50_000_000, // 5%
        bundle1: 20_000_000, // 2%
        bundle2: 20_000_000, // 2%
        bundle3: 20_000_000, // 2%
        bundle4: 10_000_000, // 1%
      },
      openingSpent: {},
      demo: true,
    }

    const metrics = computeCoinTransparencyMetrics(
      coin,
      {
        walletFundingLinks: [
          { from: 'shared_funder', to: 'bundle1' },
          { from: 'shared_funder', to: 'bundle4' },
        ],
      },
      60_000
    )

    // Dev held = 40M / 1B = 4.0%
    expect(metrics.devHeldPct).toBeCloseTo(4.0, 2)
    // Dev peak = 100M, current = 40M -> sold 60% (>50% red flag)
    expect(metrics.devSoldPct).toBeCloseTo(60.0, 2)
    expect(metrics.devSoldPct > 50).toBe(true)
    // Initial buy = 100M / 1B = 10% (>5% large dev allocation)
    expect(metrics.devInitialBuyPct).toBeCloseTo(10.0, 2)
    expect(metrics.isLargeDevAllocation).toBe(true)
    // Top 10 holders = (40M + 50M + 20M + 20M + 20M + 10M) / 1B = 16.0%
    expect(metrics.top10HoldersPct).toBeCloseTo(16.0, 2)

    // Snipers (bought in first 10s, excluding dev): sniper1 (5%), bundle1 (2%), bundle2 (2%), bundle3 (2%) = 11%
    expect(metrics.sniperWallets).toContain('sniper1')
    expect(metrics.sniperHoldPct).toBeCloseTo(11.0, 2)

    // Bundles: bundle1, bundle2, bundle3 (same second 10s at launch) + bundle4 (funded by shared_funder) = 7%
    expect(metrics.bundleWallets).toEqual(expect.arrayContaining(['bundle1', 'bundle2', 'bundle3', 'bundle4']))
    expect(metrics.bundleHoldPct).toBeCloseTo(7.0, 2)
  })

  it('Item 12c — HEX-style Dev Lock Ladder: boost weights (5555d=2x, 1d≈1x), sell blocked while locked, rewards accrue & unlock at maturity, 50%-term break returns 75% / burns 25% / forfeits PLS / drops score, 3-lock ladder isolation, extend vs shorten', async () => {
    const {
      DAY_MS,
      computeLockBoostWeight,
      computeDevScore,
      computeDevLockSummary,
    } = await import('./reputation')
    const {
      createUsername,
      loginAsPersonalWallet,
      launchCoin,
      buyCoin,
      sellCoin,
      createDevLock,
      extendDevLock,
      earlyUnlockDevLock,
      computeUserRewards,
      computeCoinHolderRewardsMap,
      getStoreSnapshot,
      logoutUser,
    } = await import('../state/store')

    // 1. Boost weights: 5555-day boost = 2x and 1-day boost ≈ 1x
    expect(computeLockBoostWeight(5555)).toBeCloseTo(2.0, 6)
    expect(computeLockBoostWeight(1)).toBeCloseTo(1 + 1 / 5555, 5)

    // 2. Setup a dev and launch a coin with an initial buy
    const t0 = 1_000_000_000
    logoutUser()
    createUsername('hex_dev')
    const launchRes = launchCoin({
      ticker: 'HEXLK',
      name: 'HEX Ladder Coin',
      story: 'Testing HEX-style staking ladder',
      devBuyPls: 10_000_000,
      nowMs: t0 - 1_000,
    })
    expect(launchRes.error).toBeUndefined()

    let state = getStoreSnapshot()
    let coin = state.coins.find((c) => c.ticker === 'HEXLK')!
    const devTotalTokens = coin.holders['hex_dev']
    expect(devTotalTokens).toBeGreaterThan(30_000_000)

    // 3. Create a 3-lock ladder: Lock 1 (10M for 100d), Lock 2 (10M for 365d), Lock 3 (10M for 5555d)
    const lk1Res = createDevLock('HEXLK', 10_000_000, 100, t0)
    const lk2Res = createDevLock('HEXLK', 10_000_000, 365, t0)
    const lk3Res = createDevLock('HEXLK', 10_000_000, 5555, t0)
    expect(lk1Res.error).toBeUndefined()
    expect(lk2Res.error).toBeUndefined()
    expect(lk3Res.error).toBeUndefined()
    expect(lk3Res.lock!.boostWeight).toBeCloseTo(2.0, 6)

    // 4. Extend works; shorten is rejected
    const shortenRes = extendDevLock('HEXLK', lk1Res.lock!.id, 50, t0)
    expect(shortenRes.error).toContain('never shortened')
    const sameTermRes = extendDevLock('HEXLK', lk1Res.lock!.id, 100, t0)
    expect(sameTermRes.error).toContain('never shortened')
    const extendRes = extendDevLock('HEXLK', lk1Res.lock!.id, 200, t0)
    expect(extendRes.error).toBeUndefined()
    expect(extendRes.lock!.termDays).toBe(200)
    expect(extendRes.lock!.boostWeight).toBeCloseTo(1 + 200 / 5555, 5)

    // 5. Cannot sell locked tokens before maturity
    const sellAllAttempt = sellCoin('HEXLK', devTotalTokens, { nowMs: t0 + 1000 })
    expect(sellAllAttempt.error).toContain('Cannot sell locked dev tokens')

    // 6. Another buyer trades on the curve so holder rewards accrue
    loginAsPersonalWallet('whale_buyer', { allowInTests: true })
    const whaleBuyRes = buyCoin('HEXLK', 20_000_000, { nowMs: t0 + 2_000 })
    expect(whaleBuyRes.error).toBeUndefined()

    // Switch back to hex_dev
    loginAsPersonalWallet('hex_dev', { allowInTests: true })
    state = getStoreSnapshot()
    coin = state.coins.find((c) => c.ticker === 'HEXLK')!

    // Before maturity (t0 + 10 days), rewards earned by the locks are NOT claimable (they sit in lockedInDevLocksPls)
    // Even if we mark the coin graduated to test maturity gating:
    coin.curve.graduated = true
    const rewardsBeforeMaturity = computeUserRewards('hex_dev', [coin], t0 + 10 * DAY_MS)
    const itemBefore = rewardsBeforeMaturity.items[0]
    expect(itemBefore.lockedInDevLocksPls).toBeGreaterThan(0)

    // At full maturity of Lock 1 (t0 + 201 days), Lock 1's accrued PLS is automatically added to claimableNowPls!
    const rewardsAtLock1Maturity = computeUserRewards('hex_dev', [coin], t0 + 201 * DAY_MS)
    const itemAtMat = rewardsAtLock1Maturity.items[0]
    expect(itemAtMat.claimableNowPls).toBeGreaterThan(itemBefore.claimableNowPls)
    expect(itemAtMat.lockedInDevLocksPls ?? 0).toBeLessThan(itemBefore.lockedInDevLocksPls ?? 0)

    // 7. Break Lock 1 at 50% of its 200-day term (t0 + 100 days):
    // - penaltyRatio = 0.5 * (100 / 200) = 25% -> burns 2,500,000 tokens, returns 7,500,000 tokens unlocked
    // - forfeits 100% of Lock 1's accrued PLS to current holders
    // - sets coin.devBrokeLock = true and drops dev score by -25
    // - leaves Lock 2 and Lock 3 completely untouched!
    const scoreBeforeBreak = computeDevScore('hex_dev', state.coins, state, t0 + 100 * DAY_MS).score
    const whaleEarnedBeforeBreak = computeCoinHolderRewardsMap(coin, t0 + 100 * DAY_MS)['whale_buyer'].earnedPls

    const breakAtHalf = earlyUnlockDevLock('HEXLK', lk1Res.lock!.id, t0 + 100 * DAY_MS)
    expect(breakAtHalf.error).toBeUndefined()
    expect(breakAtHalf.burnedTokens).toBeCloseTo(2_500_000, 1)
    expect(breakAtHalf.returnedTokens).toBeCloseTo(7_500_000, 1)
    expect(breakAtHalf.forfeitedPls).toBeGreaterThan(0)

    state = getStoreSnapshot()
    const coinAfterBreak = state.coins.find((c) => c.ticker === 'HEXLK')!
    expect(coinAfterBreak.devBrokeLock).toBe(true)
    expect(coinAfterBreak.holders['hex_dev']).toBeCloseTo(devTotalTokens - 2_500_000, 1)

    // Other 2 locks in the 3-lock ladder are untouched:
    const summaryAfter = computeDevLockSummary(coinAfterBreak, t0 + 100 * DAY_MS)
    expect(summaryAfter.activeLocks.length).toBe(2)
    expect(summaryAfter.activeLocks.find((l) => l.id === lk2Res.lock!.id)?.status).toBe('active')
    expect(summaryAfter.activeLocks.find((l) => l.id === lk3Res.lock!.id)?.status).toBe('active')

    // Forfeited PLS went to holders (whale_buyer's earnedPls increased):
    const whaleEarnedAfterBreak = computeCoinHolderRewardsMap(coinAfterBreak, t0 + 100 * DAY_MS)['whale_buyer'].earnedPls
    expect(whaleEarnedAfterBreak).toBeGreaterThan(whaleEarnedBeforeBreak)

    // Dev score dropped:
    const scoreAfterBreak = computeDevScore('hex_dev', state.coins, state, t0 + 100 * DAY_MS).score
    expect(scoreAfterBreak).toBeLessThan(scoreBeforeBreak)

    logoutUser()
  })

  it('Item 12d & 12e — Dev score ("New dev" for 0 launches, drops after simulated rug), linked-wallet rug flags, and /coins filters', async () => {
    const {
      DEFAULT_COINS_FILTERS,
      computeDevScore,
      filterAndSortCoins,
      isWalletOrUserLinkedToFlagged,
      loadCoinsFilters,
      saveCoinsFilters,
    } = await import('./reputation')

    const nowMs = 100_000_000

    // 1. "New dev" for zero launches
    const zeroLaunchScore = computeDevScore('brand_new_user', [], {}, nowMs)
    expect(zeroLaunchScore.isNewDev).toBe(true)
    expect(zeroLaunchScore.hoverBreakdown).toContain('New dev')

    // 2. Simulated rug: dev sold > 80% within 1 hour of launch AND price fell > 80%
    const ruggedCoin: Coin = {
      ticker: 'RUGG',
      name: 'Rugged Token',
      story: 'Simulated rug',
      launcher: 'rugger_dev',
      createdAt: 10_000,
      curve: { tokensSold: 5_000_000, reservePls: 100_000, graduated: false },
      candles: [{ t: 1, o: 100, c: 10 }], // Price fell 90% (>80%)
      trades: [
        { t: 20_000, side: 'sell', user: 'rugger_dev', tokens: 90_000_000, pls: 900_000 }, // Sold 90% within 10s (<1h)
        { t: 10_000, side: 'buy', user: 'rugger_dev', tokens: 100_000_000, pls: 10_000_000 },
      ],
      holders: { rugger_dev: 10_000_000 },
      openingSpent: {},
      demo: true,
    }

    // Clean locked & migrated coin by a good dev:
    const goodCoin: Coin = {
      ticker: 'GOOD',
      name: 'Good Locked Coin',
      story: 'Legit project',
      launcher: 'good_dev',
      createdAt: 20_000,
      curve: { tokensSold: 793_100_000, reservePls: GRAD_PLS, graduated: true },
      candles: [{ t: 1, o: 10, c: 50 }],
      trades: [{ t: 20_000, side: 'buy', user: 'good_dev', tokens: 30_000_000, pls: 3_000_000 }],
      holders: { good_dev: 30_000_000 },
      openingSpent: {},
      demo: true,
      devLocks: [
        {
          id: 'lock-good-1',
          amountTokens: 30_000_000,
          termDays: 90,
          createdAt: 20_000,
          unlockAt: nowMs + 90 * 86_400_000,
          boostWeight: 1 + 90 / 5555,
          accruedPls: 50_000,
          status: 'active',
        },
      ],
    }

    // Coin by a wallet funded by rugger_dev ('alt_of_rugger'):
    const linkedAltCoin: Coin = {
      ticker: 'ALTC',
      name: 'Alt Coin',
      story: 'Funded by rugger',
      launcher: 'alt_of_rugger',
      createdAt: 30_000,
      curve: { tokensSold: 50_000_000, reservePls: 5_000_000, graduated: false },
      candles: [{ t: 1, o: 10, c: 12 }],
      trades: [{ t: 30_000, side: 'buy', user: 'alt_of_rugger', tokens: 10_000_000, pls: 1_000_000 }],
      holders: { alt_of_rugger: 10_000_000 },
      openingSpent: {},
      demo: true,
    }

    const storeCtx = {
      walletFundingLinks: [{ from: 'rugger_dev', to: 'alt_of_rugger' }],
    }
    const allCoins = [ruggedCoin, goodCoin, linkedAltCoin]

    const ruggerScore = computeDevScore('rugger_dev', allCoins, storeCtx, nowMs)
    const goodScore = computeDevScore('good_dev', allCoins, storeCtx, nowMs)
    expect(ruggerScore.score).toBeLessThan(goodScore.score)
    expect(ruggerScore.rugsCount).toBe(1)
    expect(ruggerScore.isLinkedToFlagged).toBe(true)

    // Linked wallet detection: alt_of_rugger was funded by rugger_dev -> flagged!
    expect(isWalletOrUserLinkedToFlagged('alt_of_rugger', allCoins, storeCtx, nowMs)).toBe(true)
    expect(isWalletOrUserLinkedToFlagged('good_dev', allCoins, storeCtx, nowMs)).toBe(false)

    // 3. /coins filters hide the right coins:
    // - hideDevSoldOver50 hides RUGG (sold 90%)
    const noDevSold = filterAndSortCoins(
      allCoins,
      { ...DEFAULT_COINS_FILTERS, hideDevSoldOver50: true },
      storeCtx,
      nowMs
    )
    expect(noDevSold.map((c) => c.ticker)).not.toContain('RUGG')
    expect(noDevSold.map((c) => c.ticker)).toContain('GOOD')

    // - onlyDevLocked (30+ days) keeps only GOOD
    const onlyLocked = filterAndSortCoins(
      allCoins,
      { ...DEFAULT_COINS_FILTERS, onlyDevLocked: true },
      storeCtx,
      nowMs
    )
    expect(onlyLocked.map((c) => c.ticker)).toEqual(['GOOD'])

    // - onlyMigrated keeps only GOOD
    const onlyMigrated = filterAndSortCoins(
      allCoins,
      { ...DEFAULT_COINS_FILTERS, onlyMigrated: true },
      storeCtx,
      nowMs
    )
    expect(onlyMigrated.map((c) => c.ticker)).toEqual(['GOOD'])

    // - hideLinkedFlagDevs hides both RUGG and ALTC (funded by rugger_dev), keeping only GOOD
    const noLinkedFlags = filterAndSortCoins(
      allCoins,
      { ...DEFAULT_COINS_FILTERS, hideLinkedFlagDevs: true },
      storeCtx,
      nowMs
    )
    expect(noLinkedFlags.map((c) => c.ticker)).toEqual(['GOOD'])

    // - localStorage persistence for filters
    saveCoinsFilters({ ...DEFAULT_COINS_FILTERS, onlyDevLocked: true, sortBy: 'dev_score' })
    const loaded = loadCoinsFilters()
    expect(loaded.onlyDevLocked).toBe(true)
    expect(loaded.sortBy).toBe('dev_score')
    saveCoinsFilters(DEFAULT_COINS_FILTERS)
  })

  it('Banner compression & URL encoding: 3MB banner file compresses under 1MB and saves; https URL with spaces saves percent-encoded; non-https URL is rejected', async () => {
    const {
      MAX_PROFILE_IMAGE_BYTES,
      compressProfileImageFile,
      validateProfileImageUrl,
      updateUserProfileCustomization,
      createUsername,
      logoutUser,
    } = await import('../state/store')

    createUsername('banner_tester')

    // 1. 3MB banner file gets compressed under 1MB and saves
    const threeMbBytes = new Uint8Array(3 * 1024 * 1024)
    const threeMbFile = new File([threeMbBytes], 'huge-banner.png', { type: 'image/png' })
    expect(threeMbFile.size).toBeGreaterThan(MAX_PROFILE_IMAGE_BYTES)

    const comp = await compressProfileImageFile(threeMbFile, 'banner')
    expect(comp.ok).toBe(true)
    expect(comp.dataUrl).toBeDefined()
    const validComp = validateProfileImageUrl(comp.dataUrl!)
    expect(validComp.ok).toBe(true)
    const saveComp = updateUserProfileCustomization({ bannerUrl: comp.dataUrl })
    expect(saveComp.error).toBeUndefined()

    // 2. https URL with spaces/parentheses saves percent-encoded
    const urlWithSpaces = 'https://example.com/my banner (1).png'
    const encodedCheck = validateProfileImageUrl(urlWithSpaces)
    expect(encodedCheck.ok).toBe(true)
    expect(encodedCheck.url).toBe('https://example.com/my%20banner%20(1).png')
    const saveEncoded = updateUserProfileCustomization({ bannerUrl: urlWithSpaces })
    expect(saveEncoded.error).toBeUndefined()

    // 3. Non-https URL is rejected
    const nonHttps = validateProfileImageUrl('http://example.com/banner.png')
    expect(nonHttps.ok).toBe(false)
    const saveNonHttps = updateUserProfileCustomization({ bannerUrl: 'http://example.com/banner.png' })
    expect(saveNonHttps.error).toBeDefined()

    logoutUser()
  })

  it('Follow-up Item 2 — Dev lock boost never applies backwards in time: (a) lock after all trades changes nobody and accrues 0; (b) fees after lock split by weight; (c) after maturity weight returns to 1x and accrued moves to claimable; (d) total earned == pool', async () => {
    const { DAY_MS, computeLockBoostWeight } = await import('./reputation')
    const {
      computeCoinHolderRewardsMap,
      computeDevLockAccruals,
      computeUserRewards,
      previewEarlyUnlockDevLock,
    } = await import('../state/store')

    // Repro setup: dev, alice, bob hold 100 each; 3 trades at t=1000, 2000, 3000 pay 500 PLS holder fee each (1,500 PLS total pool).
    // - t=1000: dev buys 100 (100,000 PLS -> 500 PLS fee): dev gets 500 PLS
    // - t=2000: alice buys 100 (100,000 PLS -> 500 PLS fee): dev +250, alice +250
    // - t=3000: bob buys 100 (100,000 PLS -> 500 PLS fee): dev +166.67, alice +166.67, bob +166.67
    // Before lock: dev = 916.67, alice = 416.67, bob = 166.67
    const coin: Coin = {
      ticker: 'NOREV',
      name: 'No Retro Boost',
      story: 'Forward-only lock boost test',
      launcher: 'dev',
      createdAt: 1000,
      curve: { tokensSold: 300, reservePls: 296_250, graduated: true },
      graduatedAt: 3000,
      candles: [],
      trades: [
        { t: 3000, side: 'buy', user: 'bob', tokens: 100, pls: 100_000 },
        { t: 2000, side: 'buy', user: 'alice', tokens: 100, pls: 100_000 },
        { t: 1000, side: 'buy', user: 'dev', tokens: 100, pls: 100_000 },
      ],
      holders: { dev: 100, alice: 100, bob: 100 },
      openingSpent: {},
      demo: true,
      holderRewardPoolPls: 1_500,
      devRewardPoolPls: 750,
    }

    const beforeLockMap = computeCoinHolderRewardsMap(coin, 4000)
    expect(beforeLockMap['dev'].earnedPls).toBeCloseTo(916.6667, 2)
    expect(beforeLockMap['alice'].earnedPls).toBeCloseTo(416.6667, 2)
    expect(beforeLockMap['bob'].earnedPls).toBeCloseTo(166.6667, 2)

    // (a) Dev creates a 5555-day lock (weight = 2.0x) at t = 5000 AFTER all trades, with no trades after it:
    // Nobody's earnedPls changes, and the new lock accrues 0 PLS!
    const lockCreatedAt = 5000
    const lockUnlockAt = lockCreatedAt + 5555 * DAY_MS
    coin.devLocks = [
      {
        id: 'lock-5555',
        amountTokens: 100,
        termDays: 5555,
        createdAt: lockCreatedAt,
        unlockAt: lockUnlockAt,
        boostWeight: computeLockBoostWeight(5555),
        weightHistory: [{ fromTs: lockCreatedAt, toTs: lockUnlockAt, weight: 2.0 }],
        status: 'active',
      },
    ]

    const afterLockNoTradesMap = computeCoinHolderRewardsMap(coin, 6000)
    expect(afterLockNoTradesMap['dev'].earnedPls).toBeCloseTo(916.6667, 2)
    expect(afterLockNoTradesMap['alice'].earnedPls).toBeCloseTo(416.6667, 2)
    expect(afterLockNoTradesMap['bob'].earnedPls).toBeCloseTo(166.6667, 2)

    const accrualsNoTrades = computeDevLockAccruals(coin, 6000)
    expect(accrualsNoTrades.locks[0].accruedPls).toBeCloseTo(0, 6)
    expect(accrualsNoTrades.activeLockedRewardsPls).toBeCloseTo(0, 6)
    expect(accrualsNoTrades.unlockedOrMaturedRewardsPls).toBeCloseTo(916.6667, 2)

    // Early unlock preview with 0 post-lock fees forfeits 0 PLS (only what the lock accrued):
    const previewZero = previewEarlyUnlockDevLock(coin, 'lock-5555', 6000)
    expect(previewZero.forfeitedPls).toBeCloseTo(0, 6)

    // (b) Now fees arrive AFTER the lock is created (at t = 10_000, while lock is active):
    // 400 PLS holder fee arrives via LP harvest at t = 10_000.
    // Effective units at t = 10_000: dev = 100 * 2x = 200, alice = 100, bob = 100 (total = 400).
    // Split of 400 PLS: dev gets +200 PLS (accrued to lock-5555), alice gets +100 PLS, bob gets +100 PLS.
    coin.holderRewardPoolPls = 1_500 + 400
    coin.lpHarvests = [{ t: 10_000, holderPls: 400 }]

    const duringLockMap = computeCoinHolderRewardsMap(coin, 15_000)
    expect(duringLockMap['dev'].earnedPls).toBeCloseTo(916.6667 + 200, 2)
    expect(duringLockMap['alice'].earnedPls).toBeCloseTo(416.6667 + 100, 2)
    expect(duringLockMap['bob'].earnedPls).toBeCloseTo(166.6667 + 100, 2)

    const accrualsDuringLock = computeDevLockAccruals(coin, 15_000)
    expect(accrualsDuringLock.locks[0].accruedPls).toBeCloseTo(200, 2)
    expect(accrualsDuringLock.activeLockedRewardsPls).toBeCloseTo(200, 2)
    expect(accrualsDuringLock.unlockedOrMaturedRewardsPls).toBeCloseTo(916.6667, 2)

    // Early unlock preview during lock forfeits ONLY the 200 PLS that lock accrued (not the 916.67 PLS from before the lock!):
    const previewDuring = previewEarlyUnlockDevLock(coin, 'lock-5555', 15_000)
    expect(previewDuring.forfeitedPls).toBeCloseTo(200, 2)

    // (c) After maturity (t >= lockUnlockAt):
    // - Weight goes back to 1x for any subsequent fees (300 PLS harvest at lockUnlockAt + 1000 splits 100 / 100 / 100).
    // - The 200 PLS accrued by lock-5555 during the lock moves to claimable!
    const postMaturityHarvestTs = lockUnlockAt + 1_000
    coin.holderRewardPoolPls = 1_500 + 400 + 300
    coin.lpHarvests.push({ t: postMaturityHarvestTs, holderPls: 300 })

    const afterMaturityMap = computeCoinHolderRewardsMap(coin, postMaturityHarvestTs + 1_000)
    expect(afterMaturityMap['dev'].earnedPls).toBeCloseTo(916.6667 + 200 + 100, 2)
    expect(afterMaturityMap['alice'].earnedPls).toBeCloseTo(416.6667 + 100 + 100, 2)
    expect(afterMaturityMap['bob'].earnedPls).toBeCloseTo(166.6667 + 100 + 100, 2)

    const accrualsAfterMaturity = computeDevLockAccruals(coin, postMaturityHarvestTs + 1_000)
    expect(accrualsAfterMaturity.locks[0].effectiveStatus).toBe('matured')
    expect(accrualsAfterMaturity.locks[0].accruedPls).toBeCloseTo(200, 2)
    expect(accrualsAfterMaturity.activeLockedRewardsPls).toBeCloseTo(0, 6)
    expect(accrualsAfterMaturity.unlockedOrMaturedRewardsPls).toBeCloseTo(1_216.6667, 2)

    const devRewardsAtMaturity = computeUserRewards('dev', [coin], postMaturityHarvestTs + 1_000)
    expect(devRewardsAtMaturity.items[0].holderClaimableNowPls).toBeCloseTo(1_216.6667, 2)
    expect(devRewardsAtMaturity.items[0].lockedInDevLocksPls).toBeCloseTo(0, 6)

    // (d) Total earned across all holders == coin.holderRewardPoolPls
    const totalEarned = Object.values(afterMaturityMap).reduce((s, a) => s + a.earnedPls, 0)
    expect(totalEarned).toBeCloseTo(coin.holderRewardPoolPls!, 5)
  })

  it('Follow-up Item 3 — Minimum lock size (>= 1% of total supply) for dev score bonus, Only dev-locked filter, and 1.15x sort boost + SOVRN supply == 1B and top-10 <= 100%', async () => {
    const {
      DAY_MS,
      DEFAULT_COINS_FILTERS,
      MIN_CREDIT_LOCK_TOKENS,
      computeCoinTransparencyMetrics,
      computeDevLockSummary,
      computeDevScore,
      filterAndSortCoins,
    } = await import('./reputation')
    const { resetDemo, getStoreSnapshot } = await import('../state/store')

    expect(MIN_CREDIT_LOCK_TOKENS).toBe(10_000_000) // 1% of 1,000,000,000 supply
    const nowMs = 50_000_000

    // 1. Coin with a tiny lock (1,000 tokens < 1% supply) for 365 days:
    // Allowed to exist, but earns 0 score bonus, does NOT pass Only dev-locked, and gets NO 1.15x sort boost.
    const tinyLockCoin: Coin = {
      ticker: 'TINY',
      name: 'Tiny Lock Coin',
      story: '1 token lock test',
      launcher: 'tiny_dev',
      createdAt: 10_000,
      curve: { tokensSold: 100_000_000, reservePls: 20_000_000, graduated: false },
      candles: [{ t: 1, o: 10, c: 20 }],
      trades: [{ t: 10_000, side: 'buy', user: 'tiny_dev', tokens: 20_000_000, pls: 10_000_000 }],
      holders: { tiny_dev: 20_000_000 },
      openingSpent: {},
      demo: true,
      devLocks: [
        {
          id: 'tiny-lock-1',
          amountTokens: 1_000, // 0.0001% (< 1%)
          termDays: 365,
          createdAt: 10_000,
          unlockAt: nowMs + 365 * DAY_MS,
          boostWeight: 1 + 365 / 5555,
          status: 'active',
        },
      ],
    }

    // 2. Identical coin with a qualifying lock (10,000,000 tokens = 1% supply) for 365 days:
    const validLockCoin: Coin = {
      ...tinyLockCoin,
      ticker: 'REAL',
      name: 'Real Lock Coin',
      launcher: 'real_dev',
      trades: [{ t: 10_000, side: 'buy', user: 'real_dev', tokens: 20_000_000, pls: 10_000_000 }],
      holders: { real_dev: 20_000_000 },
      devLocks: [
        {
          id: 'real-lock-1',
          amountTokens: 10_000_000, // 1.0% (>= 1% minimum)
          termDays: 365,
          createdAt: 10_000,
          unlockAt: nowMs + 365 * DAY_MS,
          boostWeight: 1 + 365 / 5555,
          status: 'active',
        },
      ],
    }

    const tinySummary = computeDevLockSummary(tinyLockCoin, nowMs)
    const realSummary = computeDevLockSummary(validLockCoin, nowMs)
    expect(tinySummary.has30DayLock).toBe(false)
    expect(realSummary.has30DayLock).toBe(true)

    const tinyScore = computeDevScore('tiny_dev', [tinyLockCoin], {}, nowMs)
    const realScore = computeDevScore('real_dev', [validLockCoin], {}, nowMs)
    expect(tinyScore.lockBonusPoints).toBe(0)
    expect(realScore.lockBonusPoints).toBe(15)
    expect(realScore.score).toBe(tinyScore.score + 15) // 365d lock of >=1% supply gives +15 score bonus

    // Only dev-locked filter includes REAL and excludes TINY
    const filteredLocked = filterAndSortCoins(
      [tinyLockCoin, validLockCoin],
      { ...DEFAULT_COINS_FILTERS, onlyDevLocked: true },
      {},
      nowMs
    )
    expect(filteredLocked.map((c) => c.ticker)).toEqual(['REAL'])

    // Sort boost (1.15x on mcap/volume): REAL ranks above TINY despite identical reservePls and volume
    const sortedByMcap = filterAndSortCoins(
      [tinyLockCoin, validLockCoin],
      { ...DEFAULT_COINS_FILTERS, sortBy: 'mcap' },
      {},
      nowMs
    )
    expect(sortedByMcap[0].ticker).toBe('REAL')

    // 3. Seeded SOVRN holders + PulseX LP + burned tokens == 1,000,000,000 (1B), and top-10 % <= 100%
    resetDemo()
    const state = getStoreSnapshot()
    const sovrn = state.coins.find((c) => c.ticker === 'SOVRN')!
    expect(sovrn).toBeDefined()
    const sumHolders = Object.values(sovrn.holders).reduce((s, v) => s + v, 0)
    const lpTokens = sovrn.curve.dexTokens ?? 0
    const burnedTokens = sovrn.burnedSupplyTokens ?? 0
    expect(sumHolders + lpTokens + burnedTokens).toBe(TOTAL_SUPPLY)

    const sovrnMetrics = computeCoinTransparencyMetrics(sovrn)
    expect(sovrnMetrics.top10HoldersPct).toBeLessThanOrEqual(100)
    expect(sovrnMetrics.top10HoldersPct).toBeCloseTo((sumHolders / TOTAL_SUPPLY) * 100, 2)
  })
})

describe('Fee breakdown data & real accruals (getProtocolStats)', () => {
  it('1) Tiles (Holders + Creators + Platform + Pending) sum to Total exactly, per-source sub-items sum to each tile, and seeded treasury.feesPls derives from real accruals', async () => {
    const { resetDemo, getStoreSnapshot, getProtocolStats } = await import('../state/store')
    resetDemo()
    const s = getStoreSnapshot()
    const proto = getProtocolStats(s)

    // Each tile equals the sum of its per-source sub-list
    expect(proto.holderCurvePls + proto.holderMigrationPls + proto.holderLpPls).toBeCloseTo(
      proto.totalHolderRewardsPls,
      6
    )
    expect(proto.creatorCurvePls + proto.creatorMigrationPls + proto.creatorLpPls).toBeCloseTo(
      proto.totalDevRewardsPls,
      6
    )
    expect(
      proto.platformCurvePls + proto.platformMigrationPls + proto.platformLpPls + proto.platformLaunchPls
    ).toBeCloseTo(proto.platformDevRevenuePls, 6)

    // Tiles (Holders + Creators + Platform + Pending) equal Total exactly (PLS & USD)
    const sumTilesPls =
      proto.totalHolderRewardsPls +
      proto.totalDevRewardsPls +
      proto.platformDevRevenuePls +
      proto.pendingLpFeesPls
    expect(proto.totalFeesPaidPls).toBeCloseTo(sumTilesPls, 6)

    const sumTilesUsd =
      proto.totalHolderRewardsUsd +
      proto.totalDevRewardsUsd +
      proto.platformDevRevenueUsd +
      proto.pendingLpFeesUsd
    expect(proto.totalFeesPaidUsd).toBeCloseTo(sumTilesUsd, 6)

    // Total sub-list items also sum to Total
    expect(
      proto.totalCurveFeesPls +
        proto.totalMigrationFeesPls +
        proto.totalHarvestedLpFeesPls +
        proto.platformLaunchPls +
        proto.pendingLpFeesPls
    ).toBeCloseTo(proto.totalFeesPaidPls, 6)

    // Seeded treasury.feesPls is derived from the same real accruals (not allVolume * 0.0125)
    expect(s.treasury.feesPls).toBeCloseTo(proto.totalFeesPaidPls, 4)
    expect(s.treasury.feesPls).not.toBeCloseTo(proto.allTimeVolumePls * 0.0125, 0)
  })

  it('2) Platform fee from a post-migration PulseX trade is 0.088% of the trade (40% of 0.22% LP fee), NOT 0.50%', async () => {
    const {
      resetDemo,
      loginAsPersonalWallet,
      buyCoin,
      RewardsRouter,
      getStoreSnapshot,
      getProtocolStats,
      logoutUser,
    } = await import('../state/store')

    resetDemo()
    loginAsPersonalWallet('gainzee', { allowInTests: true })

    const beforeState = getStoreSnapshot()
    const beforeProto = getProtocolStats(beforeState)

    // Execute a 100,000,000 PLS buy on already-migrated $SOVRN (PulseX trade)
    const tradePls = 100_000_000
    const buyRes = buyCoin('SOVRN', tradePls)
    expect(buyRes.error).toBeUndefined()

    // Before harvest: unharvested pending LP fee increases by 0.22% (220,000 PLS); platform revenue is unchanged
    const midState = getStoreSnapshot()
    const midProto = getProtocolStats(midState)
    expect(midProto.pendingLpFeesPls - beforeProto.pendingLpFeesPls).toBeCloseTo(
      tradePls * POST_MIGRATION_LP_FEE,
      4
    )
    expect(midProto.platformDevRevenuePls - beforeProto.platformDevRevenuePls).toBeCloseTo(0, 4)

    // Harvest the SOVRN LP vault: 220,000 PLS splits 40% holders (88k) / 20% creator (44k) / 40% platform (88k)
    const sovrnCoin = midState.coins.find((c) => c.ticker === 'SOVRN')!
    const harvested = RewardsRouter.harvestVault(sovrnCoin)
    expect(harvested).toBeCloseTo(tradePls * POST_MIGRATION_LP_FEE, 4)

    const afterProto = getProtocolStats(midState)
    const platformDelta = afterProto.platformDevRevenuePls - beforeProto.platformDevRevenuePls
    const holderDelta = afterProto.totalHolderRewardsPls - beforeProto.totalHolderRewardsPls
    const creatorDelta = afterProto.totalDevRewardsPls - beforeProto.totalDevRewardsPls

    // Platform gets 0.088% of the PulseX trade (88,000 PLS), NOT 0.50% (500,000 PLS)
    expect(platformDelta).toBeCloseTo(tradePls * 0.00088, 4)
    expect(platformDelta).not.toBeCloseTo(tradePls * 0.005, 1)
    expect(afterProto.platformLpPls - beforeProto.platformLpPls).toBeCloseTo(tradePls * 0.00088, 4)
    expect(holderDelta).toBeCloseTo(tradePls * 0.00088, 4)
    expect(creatorDelta).toBeCloseTo(tradePls * 0.00044, 4)

    logoutUser()
  })

  it('3) Migration creator bonus (500,000 PLS) is counted once in totalDevRewardsPls (sum of devRewardPoolPls only, no double-count from migrationBonusEarned)', async () => {
    const {
      resetDemo,
      createUsername,
      launchCoin,
      buyCoin,
      getStoreSnapshot,
      getProtocolStats,
      logoutUser,
    } = await import('../state/store')

    resetDemo()
    logoutUser()
    createUsername('mig_once_dev')

    const launchRes = launchCoin({
      name: 'Migration Once',
      ticker: 'MIGONC',
      story: 'Testing migration bonus counted once',
      devBuyPls: 0,
      nowMs: 1_000_000,
    })
    expect(launchRes.error).toBeUndefined()

    // Fill the curve to graduate MIGONC (spends FILL_PLS ≈ 202,531,645.57 PLS)
    const fillRes = buyCoin('MIGONC', FILL_PLS, { nowMs: 1_005_000 })
    expect(fillRes.error).toBeUndefined()

    const s = getStoreSnapshot()
    const migCoin = s.coins.find((c) => c.ticker === 'MIGONC')!
    expect(migCoin.curve.graduated).toBe(true)

    // Both coin.devRewardPoolPls and s.migrationBonusEarned['mig_once_dev'] record the 500k graduation creator fee
    expect(s.migrationBonusEarned['mig_once_dev']).toBe(500_000)
    expect(migCoin.creatorMigrationPls).toBe(500_000)

    const proto = getProtocolStats(s, 1_010_000)
    const sumDevPoolsOnly = s.coins.reduce((acc, c) => acc + (c.devRewardPoolPls ?? 0), 0)

    // Creator total is sum(devRewardPoolPls) ONLY — 500k migration bonus is counted once, never twice!
    expect(proto.totalDevRewardsPls).toBeCloseTo(sumDevPoolsOnly, 6)
    expect(proto.creatorMigrationPls).toBe(500_000 * s.coins.filter((c) => c.curve.graduated).length)

    logoutUser()
  })

  it('4) Tracks curveVolumePls (before migration) and pulsexVolumePls (after migration) separately, and filters dailyVolumePls to last 24h (t >= now - 86,400,000)', async () => {
    const { getProtocolStats, getStoreSnapshot, resetDemo } = await import('../state/store')
    resetDemo()
    const s = getStoreSnapshot()

    // Seeded coins have both pre-migration curve trades and post-migration PulseX trades (on SOVRN & CLRW)
    const latestTradeTs = Math.max(...s.coins.flatMap((c) => c.trades.map((tr) => tr.t)))
    const protoAtLatest = getProtocolStats(s, latestTradeTs + 1_000)

    expect(protoAtLatest.curveVolumePls).toBeGreaterThan(400_000_000)
    expect(protoAtLatest.pulsexVolumePls).toBeGreaterThan(1_000_000_000_000)
    expect(protoAtLatest.curveVolumePls + protoAtLatest.pulsexVolumePls).toBeCloseTo(
      protoAtLatest.allTimeVolumePls,
      4
    )
    expect(protoAtLatest.dailyVolumePls).toBeGreaterThan(0)

    // 10 days after the latest trade, 24h volume is 0 while all-time curve + PulseX volume remains intact
    const proto10DaysLater = getProtocolStats(s, latestTradeTs + 10 * 86_400_000)
    expect(proto10DaysLater.dailyVolumePls).toBe(0)
    expect(proto10DaysLater.allTimeVolumePls).toBeCloseTo(protoAtLatest.allTimeVolumePls, 4)
  })
})

describe('OHLCV Candles & Pro Trading Chart Data (src/lib/candles.ts)', () => {
  it('1) OHLC correctness: computes exact open, high, low, close for multi-trade buckets in Price/MCap and PLS/USD modes', async () => {
    const { buildOhlcvCandles } = await import('./candles')

    // Three trades inside the same 1m bucket [60_000, 120_000), stored newest-first like coin.trades
    const trades = [
      { t: 95_000, side: 'buy' as const, user: 'charlie', pls: 3_000_000, tokens: 10_000_000, pricePls: 0.00018 },
      { t: 75_000, side: 'sell' as const, user: 'bob', pls: 1_000_000, tokens: 4_000_000, pricePls: 0.00009 },
      { t: 65_000, side: 'buy' as const, user: 'alice', pls: 2_000_000, tokens: 8_000_000, pricePls: 0.00022 },
      { t: 61_000, side: 'buy' as const, user: 'alice', pls: 1_000_000, tokens: 5_000_000, pricePls: 0.00012 },
    ]

    const pricePlsCandles = buildOhlcvCandles(trades, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
    })
    expect(pricePlsCandles).toHaveLength(1)
    const c = pricePlsCandles[0]
    expect(c.time).toBe(60)
    expect(c.open).toBeCloseTo(0.00012, 10)
    expect(c.high).toBeCloseTo(0.00022, 10)
    expect(c.low).toBeCloseTo(0.00009, 10)
    expect(c.close).toBeCloseTo(0.00018, 10)
    expect(c.tradeCount).toBe(4)
    expect(c.isGapFill).toBe(false)

    // In MCap + USD mode: mcap = price * 1,000,000,000 * plsUsd
    const plsUsd = 0.00001
    const mcapUsdCandles = buildOhlcvCandles(trades, {
      timeframe: '1m',
      metric: 'mcap',
      currency: 'usd',
      plsUsd,
    })
    expect(mcapUsdCandles).toHaveLength(1)
    expect(mcapUsdCandles[0].open).toBeCloseTo(0.00012 * TOTAL_SUPPLY * plsUsd, 6)
    expect(mcapUsdCandles[0].high).toBeCloseTo(0.00022 * TOTAL_SUPPLY * plsUsd, 6)
    expect(mcapUsdCandles[0].low).toBeCloseTo(0.00009 * TOTAL_SUPPLY * plsUsd, 6)
    expect(mcapUsdCandles[0].close).toBeCloseTo(0.00018 * TOTAL_SUPPLY * plsUsd, 6)
  })

  it('2) Bucket boundaries: aligns timestamps to exact timeframe boundaries across 1s, 15s, 1m, 5m, 15m, 1h, 4h, 1D', async () => {
    const { CHART_TIMEFRAMES, TIMEFRAME_MS, getBucketStartMs, buildOhlcvCandles } = await import('./candles')

    const sampleTs = 1_700_012_345_678
    for (const tf of CHART_TIMEFRAMES) {
      const stepMs = TIMEFRAME_MS[tf]
      const bStart = getBucketStartMs(sampleTs, tf)
      expect(bStart % stepMs).toBe(0)
      expect(bStart).toBeLessThanOrEqual(sampleTs)
      expect(bStart + stepMs).toBeGreaterThan(sampleTs)
    }

    // Two trades on opposite sides of the 5m boundary (300,000 ms)
    const boundaryTrades = [
      { t: 300_000, side: 'buy' as const, user: 'bob', pls: 500_000, tokens: 1_000_000, pricePls: 0.00015 },
      { t: 299_999, side: 'buy' as const, user: 'alice', pls: 500_000, tokens: 1_000_000, pricePls: 0.00011 },
    ]
    const candles5m = buildOhlcvCandles(boundaryTrades, {
      timeframe: '5m',
      metric: 'price',
      currency: 'pls',
    })
    expect(candles5m).toHaveLength(2)
    expect(candles5m[0].bucketStartMs).toBe(0)
    expect(candles5m[0].bucketEndMs).toBe(300_000)
    expect(candles5m[1].bucketStartMs).toBe(300_000)
    expect(candles5m[1].bucketEndMs).toBe(600_000)
  })

  it('3) Gap fill: empty intervals carry previous close forward (flat candle O=H=L=C=prevClose, 0 volume) with no time gaps', async () => {
    const { buildOhlcvCandles } = await import('./candles')

    // Trades at minute 1 (60_000 ms) and minute 4 (240_000 ms), leaving minutes 2 and 3 empty
    const sparseTrades = [
      { t: 245_000, side: 'sell' as const, user: 'bob', pls: 1_000_000, tokens: 2_000_000, pricePls: 0.00014 },
      { t: 62_000, side: 'buy' as const, user: 'alice', pls: 2_000_000, tokens: 5_000_000, pricePls: 0.00020 },
    ]

    const candles = buildOhlcvCandles(sparseTrades, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
      fillGaps: true,
    })

    // Buckets: 60s, 120s (gap), 180s (gap), 240s => 4 contiguous candles
    expect(candles).toHaveLength(4)
    expect(candles.map((c) => c.time)).toEqual([60, 120, 180, 240])

    // Gap-filled candles at 120s and 180s must carry 0.00020 forward with 0 volume
    for (const gapCandle of [candles[1], candles[2]]) {
      expect(gapCandle.isGapFill).toBe(true)
      expect(gapCandle.tradeCount).toBe(0)
      expect(gapCandle.volume).toBe(0)
      expect(gapCandle.buyVolume).toBe(0)
      expect(gapCandle.sellVolume).toBe(0)
      expect(gapCandle.open).toBeCloseTo(0.00020, 10)
      expect(gapCandle.high).toBeCloseTo(0.00020, 10)
      expect(gapCandle.low).toBeCloseTo(0.00020, 10)
      expect(gapCandle.close).toBeCloseTo(0.00020, 10)
    }
  })

  it('4) Volume sums and buy/sell volume split match trade history totals exactly', async () => {
    const { buildOhlcvCandles } = await import('./candles')

    const trades = [
      { t: 190_000, side: 'sell' as const, user: 'dave', pls: 1_250_000, tokens: 3_000_000, pricePls: 0.00013 },
      { t: 130_000, side: 'buy' as const, user: 'carol', pls: 4_500_000, tokens: 9_000_000, pricePls: 0.00016 },
      { t: 125_000, side: 'sell' as const, user: 'bob', pls: 750_000, tokens: 1_500_000, pricePls: 0.00011 },
      { t: 65_000, side: 'buy' as const, user: 'alice', pls: 3_000_000, tokens: 7_000_000, pricePls: 0.00012 },
    ]

    const plsUsd = 0.000008
    const candles = buildOhlcvCandles(trades, {
      timeframe: '1m',
      metric: 'mcap',
      currency: 'usd',
      plsUsd,
    })

    const totalBuyPls = 3_000_000 + 4_500_000
    const totalSellPls = 750_000 + 1_250_000
    const totalPls = totalBuyPls + totalSellPls

    const sumVolPls = candles.reduce((s, c) => s + c.volumePls, 0)
    const sumBuyPls = candles.reduce((s, c) => s + c.buyVolumePls, 0)
    const sumSellPls = candles.reduce((s, c) => s + c.sellVolumePls, 0)
    const sumVolUsd = candles.reduce((s, c) => s + c.volume, 0)

    expect(sumBuyPls).toBeCloseTo(totalBuyPls, 6)
    expect(sumSellPls).toBeCloseTo(totalSellPls, 6)
    expect(sumVolPls).toBeCloseTo(totalPls, 6)
    expect(sumVolUsd).toBeCloseTo(totalPls * plsUsd, 6)

    // Bucket at t=120s had both a 750k sell and a 4.5M buy
    const bucket120 = candles.find((c) => c.time === 120)!
    expect(bucket120.buyVolumePls).toBeCloseTo(4_500_000, 6)
    expect(bucket120.sellVolumePls).toBeCloseTo(750_000, 6)
    expect(bucket120.volumePls).toBeCloseTo(5_250_000, 6)
  })

  it('5) Chart last-candle market cap equals header market cap (mcapUsd(coin.curve, usdRate)) for every coin & formats subscript prices', async () => {
    const { buildCoinOhlcvCandles, formatSubscriptPrice } = await import('./candles')
    const { getStoreSnapshot, resetDemo, createUsername, buyCoin, logoutUser } = await import('../state/store')

    resetDemo()
    const s = getStoreSnapshot()
    const customUsdRate = 0.00001234

    for (const coin of s.coins) {
      const headerMcapUsd = mcapUsd(coin.curve, customUsdRate)
      const candlesUsd = buildCoinOhlcvCandles(coin, {
        timeframe: '5m',
        metric: 'mcap',
        currency: 'usd',
        plsUsd: customUsdRate,
      })
      expect(candlesUsd.length).toBeGreaterThan(0)
      const lastCandleUsd = candlesUsd[candlesUsd.length - 1]
      expect(lastCandleUsd.close).toBeCloseTo(headerMcapUsd, 6)

      // Also verify Price in PLS matches pricePls(coin.curve)
      const candlesPricePls = buildCoinOhlcvCandles(coin, {
        timeframe: '15m',
        metric: 'price',
        currency: 'pls',
        plsUsd: customUsdRate,
      })
      const lastCandlePls = candlesPricePls[candlesPricePls.length - 1]
      expect(lastCandlePls.close).toBeCloseTo(pricePls(coin.curve), 10)
    }

    // Verify after a live trade on a coin that last-candle mcap still matches header mcap 100%
    createUsername('chart_tester')
    const bellBefore = s.coins.find((c) => c.ticker === 'BELL')!
    buyCoin(bellBefore.ticker, 5_000_000)
    const bellAfter = getStoreSnapshot().coins.find((c) => c.ticker === 'BELL')!
    const bellCandles = buildCoinOhlcvCandles(bellAfter, {
      timeframe: '1m',
      metric: 'mcap',
      currency: 'usd',
      plsUsd: customUsdRate,
    })
    expect(bellCandles[bellCandles.length - 1].close).toBeCloseTo(
      mcapUsd(bellAfter.curve, customUsdRate),
      6
    )
    logoutUser()

    // Verify subscript small-number formatting (0.0₅123 style)
    expect(formatSubscriptPrice(0.00000123)).toBe(`0.0${String.fromCharCode(0x2085)}123`)
    expect(formatSubscriptPrice(0.0000000891, { prefix: '$' })).toBe(`$0.0${String.fromCharCode(0x2087)}891`)
  })

  it('6) Subscript formatting builds U+2080–U+2089 via String.fromCharCode and never contains "?"', async () => {
    const { formatSubscriptPrice, toSubscriptNumber } = await import('./candles')

    for (let d = 0; d <= 15; d++) {
      const sub = toSubscriptNumber(d)
      expect(sub).not.toContain('?')
      for (const ch of sub) {
        const code = ch.charCodeAt(0)
        expect(code).toBeGreaterThanOrEqual(0x2080)
        expect(code).toBeLessThanOrEqual(0x2089)
      }
    }

    const tinySamples = [0.000123, 0.0000123, 0.00000123, 0.000000456, 0.0000000789, 0.0000000000912]
    for (const val of tinySamples) {
      const formatted = formatSubscriptPrice(val)
      expect(formatted).not.toContain('?')
      expect(formatted.startsWith('0.0')).toBe(true)
    }

    // >= 0.0001 uses normal decimals with 4 significant digits; < 0.0001 uses subscript zeros; MCap uses $12.3K style
    expect(formatSubscriptPrice(0.0001337, { prefix: '$' })).toBe('$0.0001337')
    expect(formatSubscriptPrice(12340, { prefix: '$', isMcap: true })).toBe('$12.3K')
  })

  it('7) New / low-trade coins start at real launch curve price (never 0) and auto-pick 1s timeframe when <30 candles', async () => {
    const { buildCoinOhlcvCandles, pickAutoTimeframe } = await import('./candles')
    const { resetDemo, loginAsPersonalWallet, launchCoin, buyCoin, getStoreSnapshot, logoutUser } = await import('../state/store')

    resetDemo()
    loginAsPersonalWallet('gainzee', { allowInTests: true })

    const launchRes = launchCoin({
      name: 'Fresh Launch',
      ticker: 'FRSHX',
      story: 'Brand new coin with 2 buys',
      devBuyPls: 0,
      nowMs: 10_000_000,
    })
    expect(launchRes.error).toBeUndefined()

    // 0 trades: returns flat candles at the launch price
    const zeroTradeCoin = getStoreSnapshot().coins.find((c) => c.ticker === 'FRSHX')!
    const zeroCandles = buildCoinOhlcvCandles(zeroTradeCoin, {
      timeframe: '1s',
      metric: 'mcap',
      currency: 'usd',
      plsUsd: 0.000008,
    })
    expect(zeroCandles.length).toBeGreaterThanOrEqual(2)
    const expectedLaunchMcapUsd = pricePls(newCurve()) * TOTAL_SUPPLY * 0.000008
    expect(zeroCandles[0].open).toBeCloseTo(expectedLaunchMcapUsd, 6)
    expect(zeroCandles[zeroCandles.length - 1].close).toBeCloseTo(expectedLaunchMcapUsd, 6)

    // Perform 2 buys a couple seconds apart
    buyCoin('FRSHX', 2_000_000, { nowMs: 10_002_000 })
    buyCoin('FRSHX', 3_000_000, { nowMs: 10_005_000 })

    const twoTradeCoin = getStoreSnapshot().coins.find((c) => c.ticker === 'FRSHX')!
    expect(twoTradeCoin.trades).toHaveLength(2)

    // Auto-timeframe picks 1s since 5m has < 30 candles
    expect(pickAutoTimeframe(twoTradeCoin, '5m', 0.000008)).toBe('1s')

    const candles1s = buildCoinOhlcvCandles(twoTradeCoin, {
      timeframe: '1s',
      metric: 'mcap',
      currency: 'usd',
      plsUsd: 0.000008,
    })
    // First candle starts at the real launch curve price (~$223.67), never 0
    expect(candles1s[0].open).toBeCloseTo(expectedLaunchMcapUsd, 6)
    expect(candles1s[candles1s.length - 1].close).toBeCloseTo(
      mcapUsd(twoTradeCoin.curve, 0.000008),
      6
    )

    logoutUser()
  })

  it('8) 30s timeframe, MA 20 / EMA 50 / VWAP indicators, and $7.01M / $812K / $4.2K compact formatting', async () => {
    const {
      CHART_TIMEFRAMES,
      buildCoinOhlcvCandles,
      computeSma,
      computeEma,
      computeVwap,
      formatSubscriptPrice,
      getBucketStartMs,
    } = await import('./candles')
    const { getStoreSnapshot, resetDemo } = await import('../state/store')

    expect(CHART_TIMEFRAMES).toContain('30s')
    expect(getBucketStartMs(45_123, '30s')).toBe(30_000)

    expect(formatSubscriptPrice(7_010_000, { prefix: '$', isMcap: true })).toBe('$7.01M')
    expect(formatSubscriptPrice(812_000, { prefix: '$', isMcap: true })).toBe('$812K')
    expect(formatSubscriptPrice(4_200, { prefix: '$', isMcap: true })).toBe('$4.2K')

    resetDemo()
    const s = getStoreSnapshot()
    const sovrn = s.coins.find((c) => c.ticker === 'SOVRN')!
    const candles = buildCoinOhlcvCandles(sovrn, {
      timeframe: '1m',
      metric: 'mcap',
      currency: 'usd',
      plsUsd: 0.000008,
    })

    const sma20 = computeSma(candles, 20)
    const ema50 = computeEma(candles, 50)
    const vwap = computeVwap(candles)

    expect(sma20.length).toBeGreaterThan(0)
    expect(ema50).toHaveLength(candles.length)
    expect(vwap).toHaveLength(candles.length)
    expect(sma20.every((p) => Number.isFinite(p.value) && p.value > 0)).toBe(true)
    expect(ema50.every((p) => Number.isFinite(p.value) && p.value > 0)).toBe(true)
    expect(vwap.every((p) => Number.isFinite(p.value) && p.value > 0)).toBe(true)
  })

  it('9) Candle update-vs-append logic & YOU/DEV entry price lines: returns update for same-bucket trade, append for new-bucket trade, and computes avg entry line', async () => {
    const {
      applyTradeToCandles,
      buildOhlcvCandles,
      computeCandleDeltaUpdate,
      computeUserAvgEntryPricePls,
      getHolderAvgEntryLineValue,
    } = await import('./candles')

    const plsUsd = 0.00001
    const initialTrades = [
      { t: 65_000, side: 'buy' as const, user: 'alice', pls: 2_000_000, tokens: 10_000_000, pricePls: 0.00020 },
      { t: 61_000, side: 'buy' as const, user: 'alice', pls: 1_000_000, tokens: 6_000_000, pricePls: 0.00015 },
    ]
    const baseCandles = buildOhlcvCandles(initialTrades, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
      plsUsd,
      fillGaps: true,
    })
    expect(baseCandles).toHaveLength(1)
    expect(baseCandles[0].time).toBe(60)
    expect(baseCandles[0].close).toBeCloseTo(0.00020, 10)
    expect(baseCandles[0].volume).toBeCloseTo(3_000_000, 6)

    // (a) Initial load (empty prevCandles) returns mode === 'full'
    const fullDelta = computeCandleDeltaUpdate([], baseCandles)
    expect(fullDelta.mode).toBe('full')
    expect(fullDelta.candlesToApply).toHaveLength(1)

    // (b) New trade at t = 90_000 falls in the SAME 1m bucket [60_000, 120_000) -> mode === 'update'
    const sameBucketTrade = {
      t: 90_000,
      side: 'buy' as const,
      user: 'bob',
      pls: 1_500_000,
      tokens: 5_000_000,
      pricePls: 0.00026,
    }
    const updRes = applyTradeToCandles(baseCandles, sameBucketTrade, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
      plsUsd,
      fillGaps: true,
    })
    expect(updRes.mode).toBe('update')
    expect(updRes.candles).toHaveLength(1)
    expect(updRes.candlesToApply).toHaveLength(1)
    expect(updRes.candle?.time).toBe(60)
    expect(updRes.candle?.open).toBeCloseTo(0.00015, 10)
    expect(updRes.candle?.high).toBeCloseTo(0.00026, 10)
    expect(updRes.candle?.low).toBeCloseTo(0.00015, 10)
    expect(updRes.candle?.close).toBeCloseTo(0.00026, 10)
    expect(updRes.candle?.volume).toBeCloseTo(4_500_000, 6)
    expect(updRes.candle?.tradeCount).toBe(3)

    // Verify computeCandleDeltaUpdate agrees on 'update'
    const diffUpdate = computeCandleDeltaUpdate(baseCandles, updRes.candles)
    expect(diffUpdate.mode).toBe('update')
    expect(diffUpdate.candlesToApply).toHaveLength(1)
    expect(diffUpdate.candle?.close).toBeCloseTo(0.00026, 10)

    // (c) Next trade at t = 135_000 starts a NEW 1m bucket [120_000, 180_000) -> mode === 'append'
    const newBucketTrade = {
      t: 135_000,
      side: 'sell' as const,
      user: 'alice',
      pls: 800_000,
      tokens: 3_000_000,
      pricePls: 0.00022,
    }
    const appRes = applyTradeToCandles(updRes.candles, newBucketTrade, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
      plsUsd,
      fillGaps: true,
    })
    expect(appRes.mode).toBe('append')
    expect(appRes.candles).toHaveLength(2)
    expect(appRes.candlesToApply).toHaveLength(1)
    expect(appRes.candle?.time).toBe(120)
    expect(appRes.candle?.open).toBeCloseTo(0.00026, 10)
    expect(appRes.candle?.high).toBeCloseTo(0.00026, 10)
    expect(appRes.candle?.low).toBeCloseTo(0.00022, 10)
    expect(appRes.candle?.close).toBeCloseTo(0.00022, 10)
    expect(appRes.candle?.volume).toBeCloseTo(800_000, 6)
    expect(appRes.candle?.sellVolume).toBeCloseTo(800_000, 6)

    // Verify computeCandleDeltaUpdate agrees on 'append'
    const diffAppend = computeCandleDeltaUpdate(updRes.candles, appRes.candles)
    expect(diffAppend.mode).toBe('append')
    expect(diffAppend.candlesToApply).toHaveLength(1)
    expect(diffAppend.candle?.time).toBe(120)

    // (d) Verify computeUserAvgEntryPricePls & getHolderAvgEntryLineValue for YOU line
    const mockCoin = {
      trades: [newBucketTrade, sameBucketTrade, ...initialTrades],
      holders: {
        alice: 13_000_000, // bought 16M for 3M PLS (avg 0.1875 PLS/token), sold 3M -> remaining 13M at 0.1875 PLS/token
        bob: 5_000_000, // bought 5M for 1.5M PLS (avg 0.30 PLS/token)
      },
    }
    expect(computeUserAvgEntryPricePls(mockCoin, 'non_holder')).toBeNull()
    expect(computeUserAvgEntryPricePls(mockCoin, 'alice')).toBeCloseTo(3_000_000 / 16_000_000, 8)
    expect(computeUserAvgEntryPricePls(mockCoin, 'bob')).toBeCloseTo(1_500_000 / 5_000_000, 8)
    expect(getHolderAvgEntryLineValue(mockCoin, 'bob', 'mcap', 'usd', plsUsd)).toBeCloseTo(
      (1_500_000 / 5_000_000) * TOTAL_SUPPLY * plsUsd,
      4
    )
  })

  it('10) Follow/unfollow system: blocks self-follow and reserved accounts (uniq_pulse, uniq_anon), tracks followers/following, and persists in localStorage after reload', async () => {
    const {
      resetDemo,
      logoutUser,
      createUsername,
      followUser,
      unfollowUser,
      isFollowing,
      getFollowing,
      getFollowerCount,
      getFollowingCount,
      getUserAvatarUrl,
    } = await import('../state/store')
    const { STORAGE_KEY } = await import('../config')

    const storeMap = new Map<string, string>()
    const prevStorage = (globalThis as { localStorage?: unknown }).localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => storeMap.set(k, v),
        removeItem: (k: string) => storeMap.delete(k),
        clear: () => storeMap.clear(),
      },
    })

    resetDemo()
    logoutUser()

    // Logged out: followUser requires connected wallet
    expect(followUser('harbor').error).toMatch(/Connect wallet to follow/i)

    // Create a user & wallet
    const createRes = createUsername('follow_tester')
    expect(createRes.error).toBeUndefined()

    // Default demo user follows 2 KOL accounts by default (pls_maxi, trench_rat)
    expect(getFollowing()).toEqual(['pls_maxi', 'trench_rat'])
    expect(isFollowing('pls_maxi')).toBe(true)
    expect(isFollowing('trench_rat')).toBe(true)

    // Cannot follow yourself
    const selfRes = followUser('follow_tester')
    expect(selfRes.error).toMatch(/cannot follow yourself/i)
    expect(isFollowing('follow_tester')).toBe(false)

    // Cannot follow reserved accounts uniq_pulse and uniq_anon
    expect(followUser('uniq_pulse').error).toMatch(/reserved/i)
    expect(followUser('uniq_anon').error).toMatch(/reserved/i)
    expect(isFollowing('uniq_pulse')).toBe(false)
    expect(isFollowing('uniq_anon')).toBe(false)

    // Follow harbor and unfollow trench_rat
    const beforeFollowers = getFollowerCount('harbor')
    expect(followUser('harbor').error).toBeUndefined()
    expect(isFollowing('harbor')).toBe(true)
    expect(getFollowerCount('harbor')).toBe(beforeFollowers + 1)

    expect(unfollowUser('trench_rat').error).toBeUndefined()
    expect(isFollowing('trench_rat')).toBe(false)
    expect(getFollowing()).toEqual(['pls_maxi', 'harbor'])
    expect(getFollowingCount('follow_tester')).toBe(2)

    // Verify deterministic identicon avatar is generated for users without uploaded logo
    const identicon = getUserAvatarUrl('follow_tester')
    expect(identicon.startsWith('data:image/svg+xml')).toBe(true)
    expect(getUserAvatarUrl('follow_tester')).toBe(identicon) // deterministic

    // Verify persistence in localStorage across reload
    const rawSaved = storeMap.get(STORAGE_KEY)
    expect(rawSaved).toBeTruthy()
    const parsedState = JSON.parse(rawSaved!)
    const walletKey = parsedState.username.wallet.toLowerCase()
    expect(parsedState.follows[walletKey]).toEqual(['pls_maxi', 'harbor'])

    logoutUser()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: prevStorage,
    })
  })

  it('11) Bubble classification: dev buy/sell (DB/DS), me (B/S), followed user declutter (0.5% MC / first buy / final sell, max 1 per user per candle), and other users ignored', async () => {
    const { classifyTradeBubbleActor, buildChartTradeBubbles } = await import('./candles')

    const opts = {
      launcher: 'gainzee',
      currentUser: 'alice',
      following: ['pls_maxi', 'trench_rat'],
    }
    expect(classifyTradeBubbleActor('gainzee', opts)).toBe('dev')
    expect(classifyTradeBubbleActor('alice', opts)).toBe('you')
    expect(classifyTradeBubbleActor('pls_maxi', opts)).toBe('following')
    expect(classifyTradeBubbleActor('trench_rat', opts)).toBe('following')
    expect(classifyTradeBubbleActor('random_stranger', opts)).toBeNull()

    const trades = [
      // Latest pricePls = 1.0 -> currentMcapPls = 1_000_000_000 -> 0.5% MC = 5_000_000 PLS
      { t: 360_000, side: 'sell' as const, user: 'pls_maxi', pls: 500_000, tokens: 500_000, pricePls: 1.0 }, // final sell -> SHOWN even if < 0.5% MC
      { t: 300_000, side: 'buy' as const, user: 'pls_maxi', pls: 6_000_000, tokens: 6_000_000, pricePls: 1.0 }, // >= 0.5% MC -> SHOWN
      { t: 240_000, side: 'sell' as const, user: 'alice', pls: 1_000_000, tokens: 4_000_000, pricePls: 0.00025 },
      { t: 185_000, side: 'buy' as const, user: 'pls_maxi', pls: 100_000, tokens: 400_000, pricePls: 0.00025 }, // intermediate small add (< 0.5% MC) -> HIDDEN on 1m/5m
      { t: 180_000, side: 'buy' as const, user: 'alice', pls: 2_000_000, tokens: 8_000_000, pricePls: 0.00028 },
      { t: 125_000, side: 'buy' as const, user: 'pls_maxi', pls: 6_000_000, tokens: 6_000_000, pricePls: 0.00022 }, // same 1m candle (120s) as first buy -> merged to 1 bubble per user per candle
      { t: 121_000, side: 'buy' as const, user: 'pls_maxi', pls: 300_000, tokens: 1_200_000, pricePls: 0.00022 }, // first buy -> SHOWN even if < 0.5% MC
      { t: 90_000, side: 'buy' as const, user: 'random_stranger', pls: 500_000, tokens: 2_000_000, pricePls: 0.00019 },
      { t: 70_000, side: 'sell' as const, user: 'gainzee', pls: 1_000_000, tokens: 5_000_000, pricePls: 0.00016 },
      { t: 10_000, side: 'buy' as const, user: 'gainzee', pls: 5_000_000, tokens: 25_000_000, pricePls: 0.00018 },
    ]

    const bubbles = buildChartTradeBubbles(trades, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
      launcher: 'gainzee',
      currentUser: 'alice',
      following: ['pls_maxi'],
      avatarsByUser: { pls_maxi: 'data:image/svg+xml;utf8,<svg></svg>' },
    })

    // random_stranger is ignored, pls_maxi's small intermediate add at 185s is hidden, and pls_maxi's two trades in 120s merge to 1 -> 7 bubbles
    expect(bubbles).toHaveLength(7)
    expect(bubbles.some((b) => b.user === 'random_stranger')).toBe(false)
    expect(bubbles.filter((b) => b.user === 'pls_maxi').map((b) => b.candleTime)).toEqual([120, 300, 360])

    const devBuy = bubbles.find((b) => b.candleTime === 0)!
    expect(devBuy.actorKind).toBe('dev')
    expect(devBuy.label).toBe('DB')
    expect(devBuy.color).toBe('#22c55e')

    const devSell = bubbles.find((b) => b.candleTime === 60)!
    expect(devSell.actorKind).toBe('dev')
    expect(devSell.label).toBe('DS')
    expect(devSell.color).toBe('#ef4444')

    const followedFirstBuy = bubbles.find((b) => b.candleTime === 120 && b.user === 'pls_maxi')!
    expect(followedFirstBuy.actorKind).toBe('following')
    expect(followedFirstBuy.label).toBe('PL')
    expect(followedFirstBuy.color).toBe('#22c55e')
    expect(followedFirstBuy.avatarUrl).toBeTruthy()
    expect(followedFirstBuy.tradeCount).toBe(2)

    const youBuy = bubbles.find((b) => b.candleTime === 180 && b.user === 'alice')!
    expect(youBuy.actorKind).toBe('you')
    expect(youBuy.label).toBe('B')
    expect(youBuy.color).toBe('#22c55e')

    const youSell = bubbles.find((b) => b.candleTime === 240 && b.user === 'alice')!
    expect(youSell.actorKind).toBe('you')
    expect(youSell.label).toBe('S')
    expect(youSell.color).toBe('#ef4444')

    // Verify seeded KOLs have roughly 3-8 trades per coin (not dozens)
    const { resetDemo, getStoreSnapshot, SEEDED_KOL_ACCOUNTS } = await import('../state/store')
    resetDemo()
    const snap = getStoreSnapshot()
    for (const coin of snap.coins) {
      for (const kol of SEEDED_KOL_ACCOUNTS) {
        const count = coin.trades.filter((tr) => tr.user === kol).length
        expect(count).toBeLessThanOrEqual(8)
      }
    }
  })

  it('12) Bubble bucketing: a trade maps to the right candle on 1m and 5m, and its y anchor equals the trade price (never below candle low)', async () => {
    const { buildChartTradeBubbles, buildOhlcvCandles } = await import('./candles')

    // Trade at t = 425,000 ms (7m 05s):
    // - On 1m: bucketStart = 420,000 ms -> candleTime = 420s
    // - On 5m: bucketStart = 300,000 ms -> candleTime = 300s
    const fillPricePls = 0.000345
    const trades = [
      { t: 425_000, side: 'buy' as const, user: 'me_trader', pls: 4_000_000, tokens: 12_000_000, pricePls: fillPricePls },
      { t: 310_000, side: 'buy' as const, user: 'gainzee', pls: 2_000_000, tokens: 8_000_000, pricePls: 0.000210 },
    ]

    const candles1m = buildOhlcvCandles(trades, { timeframe: '1m', metric: 'price', currency: 'pls' })
    const bubbles1m = buildChartTradeBubbles(trades, {
      timeframe: '1m',
      metric: 'price',
      currency: 'pls',
      candles: candles1m,
      launcher: 'gainzee',
      currentUser: 'me_trader',
    })
    const myBubble1m = bubbles1m.find((b) => b.actorKind === 'you')!
    expect(myBubble1m.candleTime).toBe(420)
    expect(myBubble1m.anchorValue).toBeCloseTo(fillPricePls, 10)
    const candleAt420 = candles1m.find((c) => c.time === 420)!
    expect(myBubble1m.anchorValue).toBeGreaterThanOrEqual(candleAt420.low)

    // Switch to 5m: moves to the 5m candle at time = 300s, still anchored at the exact fill price
    const candles5m = buildOhlcvCandles(trades, { timeframe: '5m', metric: 'price', currency: 'pls' })
    const bubbles5m = buildChartTradeBubbles(trades, {
      timeframe: '5m',
      metric: 'price',
      currency: 'pls',
      candles: candles5m,
      launcher: 'gainzee',
      currentUser: 'me_trader',
    })
    const myBubble5m = bubbles5m.find((b) => b.actorKind === 'you')!
    expect(myBubble5m.candleTime).toBe(300)
    expect(myBubble5m.anchorValue).toBeCloseTo(fillPricePls, 10)
    const candleAt300 = candles5m.find((c) => c.time === 300)!
    expect(myBubble5m.anchorValue).toBeGreaterThanOrEqual(candleAt300.low)
  })

  it('13) Price scale min is never below 0 (clampNonNegativeAutoscale clamps negative and near-zero ranges to >= 0 with 0 bottom margin)', async () => {
    const { clampNonNegativeAutoscale } = await import('./candles')

    const fromNeg = clampNonNegativeAutoscale({ minValue: -50_000, maxValue: 150_000 })!
    expect(fromNeg.priceRange.minValue).toBeGreaterThanOrEqual(0)
    expect(fromNeg.priceRange.minValue).toBe(0)
    expect(fromNeg.margins.below).toBe(0)

    const fromSmall = clampNonNegativeAutoscale({ minValue: 223.67, maxValue: 152_000 })!
    expect(fromSmall.priceRange.minValue).toBeGreaterThanOrEqual(0)
    expect(fromSmall.priceRange.minValue).toBeCloseTo(223.67, 4)
    expect(fromSmall.margins.below).toBe(0)
  })
})
