import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PLATFORM_USERNAME, PLS_USD } from '../config'
import {
  computePriceChangesByWindow,
  extractTradeTicks,
  formatSubscriptPrice,
} from '../lib/candles'
import {
  DEX_PREPAY_USD,
  TOTAL_SUPPLY,
  fmtNum,
  fmtUsd,
  mcapUsd,
  pricePls,
  quoteBuy,
  quoteSell,
  splitCurveTradeFee,
} from '../lib/model'
import { computeCoinTradesWithPnl, computeUserPnlAndHoldProfile, fmtHoldDuration } from '../lib/pnl'
import { DEFAULT_SOL_USD } from '../lib/price'
import { connectEvm, connectPhantom, discoverEvmWallets, short } from '../lib/wallets'
import {
  DAY_MS,
  MAX_DEV_LOCKS_PER_COIN,
  MAX_DEV_LOCK_DAYS,
  computeDevLockSummary,
  computeLockBoostWeight,
  getEffectiveLockStatus,
  getLockedDevTokens,
  isWalletOrUserLinkedToFlagged,
} from '../lib/reputation'
import {
  buyCoin,
  computeCoinHolderRewardsMap,
  computeDevLockAccruals,
  computeUserRewards,
  createDevLock,
  earlyUnlockDevLock,
  extendDevLock,
  postCoinComment,
  prepayDexScreener,
  previewEarlyUnlockDevLock,
  sellCoin,
  setEvm,
  setPhantom,
  updateCoinMedia,
  updateCoinSocials,
  useStore,
  type DexPayMethod,
} from '../state/store'
import TradeChart from '../components/TradeChart'
import {
  Badge,
  CoinBanner,
  CoinLogo,
  CoinTransparencyBadges,
  DevInfoLine,
  HolderTierBadge,
  Notice,
  Progress,
  StatusBadge,
} from '../components/ui'

const SELL_PCTS = [10, 25, 50, 100] as const
const SLIPPAGE_PRESETS = [0.5, 1, 3] as const

export default function CoinPage() {
  const { ticker = '' } = useParams()
  const s = useStore()
  const usdRate = s.plsUsd || PLS_USD
  const solUsd = s.solUsd || DEFAULT_SOL_USD
  const coin = s.coins.find((c) => c.ticker === ticker.toUpperCase())
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amt, setAmt] = useState('1000000')
  const [slippageMode, setSlippageMode] = useState<'0.5' | '1' | '3' | 'custom'>('1')
  const [customSlippage, setCustomSlippage] = useState('1')
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false)
  const [forfeitSellConfirmed, setForfeitSellConfirmed] = useState(false)
  const [feedTab, setFeedTab] = useState<'trades' | 'holders' | 'comments'>('trades')
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [tradePulse, setTradePulse] = useState(false)
  const prevTradeHeadRef = useRef<{ ticker: string; latestTs: number; count: number } | null>(null)
  const [editingSocials, setEditingSocials] = useState(false)
  const [xInput, setXInput] = useState('')
  const [webInput, setWebInput] = useState('')
  const [commentText, setCommentText] = useState('')
  const [holdersOnlyThread, setHoldersOnlyThread] = useState(false)
  const [commentMsg, setCommentMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [showDexModal, setShowDexModal] = useState(false)
  const [dexMethod, setDexMethod] = useState<DexPayMethod>('pls')
  const [nowMs, setNowMs] = useState(() => Date.now())

  // HEX-style Dev Lock (Staking Ladder) UI state
  const [lockAmtInput, setLockAmtInput] = useState('')
  const [lockDaysInput, setLockDaysInput] = useState('90')
  const [confirmingCreateLock, setConfirmingCreateLock] = useState(false)
  const [extendingLockId, setExtendingLockId] = useState<string | null>(null)
  const [extendDaysInput, setExtendDaysInput] = useState('365')
  const [breakingLockId, setBreakingLockId] = useState<string | null>(null)
  const [lockMsg, setLockMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Pulse dot when a new trade lands on the current coin (respecting prefers-reduced-motion)
  useEffect(() => {
    if (!coin) return
    const latestTs = coin.trades[0]?.t ?? 0
    const count = coin.trades.length
    const prev = prevTradeHeadRef.current
    if (prev && prev.ticker === coin.ticker && (count > prev.count || latestTs > prev.latestTs)) {
      const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reduced) {
        setTradePulse(true)
        const timer = window.setTimeout(() => setTradePulse(false), 1800)
        prevTradeHeadRef.current = { ticker: coin.ticker, latestTs, count }
        return () => window.clearTimeout(timer)
      }
    }
    prevTradeHeadRef.current = { ticker: coin.ticker, latestTs, count }
  }, [coin, coin?.ticker, coin?.trades])

  const me = s.username?.name
  const held = coin && me ? coin.holders[me] ?? 0 : 0
  const isDevViewer = Boolean(coin && me && me.toLowerCase() === coin.launcher.toLowerCase())
  const lockedDevTokens = coin && isDevViewer ? getLockedDevTokens(coin, nowMs) : 0
  const unlockedHeld = Math.max(0, held - lockedDevTokens)
  const n = Number(amt.replace(/,/g, '')) || 0
  const slippagePct =
    slippageMode === 'custom'
      ? Math.max(0.01, Math.min(99, Number(customSlippage) || 1))
      : Number(slippageMode)

  const enrichedTrades = useMemo(() => {
    if (!coin) return []
    return computeCoinTradesWithPnl(coin, usdRate, nowMs)
  }, [coin, usdRate, nowMs])

  const tradePriceMapPls = useMemo(() => {
    if (!coin) return new Map<string, number>()
    const ticks = extractTradeTicks(coin.trades, {
      curve: coin.curve,
      recordedCandles: coin.candles,
    })
    const map = new Map<string, number>()
    for (const tk of ticks) {
      map.set(`${tk.t}-${tk.user}-${tk.side}-${tk.pls}`, tk.pricePls)
    }
    return map
  }, [coin])

  const windowChanges = useMemo(() => {
    if (!coin) return { change5mPct: 0, change1hPct: 0, change6hPct: 0, change24hPct: 0 }
    return computePriceChangesByWindow(coin, nowMs)
  }, [coin, nowMs])

  const holderRewardsMap = useMemo(() => {
    if (!coin) return {}
    return computeCoinHolderRewardsMap(coin)
  }, [coin])

  const myCoinPosition = useMemo(() => {
    if (!coin || !me) return null
    const prof = computeUserPnlAndHoldProfile(me, [coin], usdRate, nowMs)
    return prof.positions[0] ?? null
  }, [coin, me, usdRate, nowMs])

  const crowd = useMemo(() => {
    if (!coin) return { count: 0, largest: 0, top10: 0, topList: [] as Array<[string, number]>, totalCirc: 0 }
    const entries = Object.entries(coin.holders)
      .filter(([, v]) => v > 1e-6)
      .sort((a, b) => b[1] - a[1])
    const vals = entries.map(([, v]) => v)
    const totalCirc = vals.reduce((a, b) => a + b, 0)
    return {
      count: vals.length,
      largest: (vals[0] ?? 0) / TOTAL_SUPPLY,
      top10: Math.min(1, vals.slice(0, 10).reduce((a, b) => a + b, 0) / TOTAL_SUPPLY),
      topList: entries.slice(0, 10),
      totalCirc,
    }
  }, [coin])

  const liveStats = useMemo(() => {
    if (!coin) return { volPls: 0, buys: 0, sells: 0, changePct: 0, holderPoolPls: 0, devPoolPls: 0, lpFeesPls: 0 }
    const volPls = coin.trades.reduce((acc, t) => acc + t.pls, 0)
    const buys = coin.trades.filter((t) => t.side === 'buy').length
    const sells = coin.trades.filter((t) => t.side === 'sell').length
    const curMcap = mcapUsd(coin.curve, usdRate)
    const openMcap = coin.candles[0]?.o ?? curMcap
    const changePct = openMcap > 0 ? ((curMcap - openMcap) / openMcap) * 100 : 0
    return {
      volPls,
      buys,
      sells,
      changePct,
      holderPoolPls: coin.holderRewardPoolPls ?? volPls * 0.005,
      devPoolPls: coin.devRewardPoolPls ?? volPls * 0.0025,
      lpFeesPls: coin.postMigrationLpFeesPls ?? 0,
    }
  }, [coin, usdRate])

  const myCoinReward = useMemo(() => {
    if (!coin || !me) return null
    const summary = computeUserRewards(me, [coin])
    return summary.items[0] ?? null
  }, [coin, me])

  if (!coin) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">No coin with that ticker.</p>
        <Link to="/" className="btn-ghost mt-4">
          Back to board
        </Link>
      </div>
    )
  }

  const quote =
    side === 'buy'
      ? quoteBuy(coin.curve, n, { slippagePct })
      : quoteSell(coin.curve, n, held, { slippagePct })
  const tradePlsVal =
    side === 'buy' ? (quote as ReturnType<typeof quoteBuy>).spend : (quote as ReturnType<typeof quoteSell>).gross
  const feeBreakdown = tradePlsVal > 0 ? splitCurveTradeFee(tradePlsVal, usdRate) : null
  const pendingUnclaimedPls =
    (myCoinReward?.claimableNowPls ?? 0) + (myCoinReward?.lockedPendingPls ?? 0)
  const needsForfeitConfirm =
    side === 'sell' && !coin.curve.graduated && pendingUnclaimedPls > 0 && !forfeitSellConfirmed
  const needsHighImpactConfirm = quote.ok && quote.priceImpactPct > 15 && !highImpactConfirmed

  const dexCostPls = Math.round(DEX_PREPAY_USD / usdRate)
  const dexCostSol = (DEX_PREPAY_USD / solUsd).toFixed(2)

  function handleUpload(file: File | undefined, field: 'logoUrl' | 'bannerUrl') {
    if (!file || !coin) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateCoinMedia(coin.ticker, { [field]: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  function applySellPct(pct: number) {
    setHighImpactConfirmed(false)
    setForfeitSellConfirmed(false)
    if (unlockedHeld <= 0) {
      setAmt('0')
      return
    }
    const val = pct === 100 ? unlockedHeld : Math.floor((unlockedHeld * pct) / 100)
    setAmt(String(val))
  }

  function submit() {
    if (needsForfeitConfirm) {
      setForfeitSellConfirmed(true)
      return
    }
    if (needsHighImpactConfirm) {
      setHighImpactConfirmed(true)
      return
    }
    const minReceived =
      side === 'buy'
        ? (quote as ReturnType<typeof quoteBuy>).minReceivedTokens
        : (quote as ReturnType<typeof quoteSell>).minReceivedPls
    const r =
      side === 'buy'
        ? buyCoin(coin!.ticker, n, { slippagePct, minReceived })
        : sellCoin(coin!.ticker, n, { slippagePct, minReceived })
    setHighImpactConfirmed(false)
    setForfeitSellConfirmed(false)
    setMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Done.' })
  }

  async function quickConnectPhantom() {
    try {
      const addr = await connectPhantom()
      setPhantom(addr)
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No Phantom wallet detected.' })
    }
  }

  async function quickConnectPulseChain() {
    try {
      const list = await discoverEvmWallets()
      if (list[0]) {
        const addr = await connectEvm(list[0])
        setEvm(addr, list[0].name)
        return
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not connect PulseChain wallet.' })
      return
    }
    setMsg({ kind: 'error', text: 'No PulseChain wallet detected. Install Rabby, MetaMask, or Internet Money.' })
  }

  function confirmDexPayment(method: DexPayMethod) {
    const r = prepayDexScreener(coin!.ticker, method)
    setMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'DEX Paid!' })
    if (!r.error) setShowDexModal(false)
  }

  return (
    <div className="grid gap-4 min-w-0">
      {/* Compact Pump.tires-Style Token Header Bar */}
      <div className="card !p-0 overflow-hidden min-w-0">
        <div className="relative h-24 sm:h-32 w-full overflow-hidden border-b border-line">
          <CoinBanner ticker={coin.ticker} bannerUrl={coin.bannerUrl} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
          <div className="absolute top-2.5 right-3 flex flex-wrap gap-1.5 z-20">
            <label className="rounded-full bg-bg/85 backdrop-blur border border-line px-2.5 py-1 text-[11px] font-medium text-fg cursor-pointer hover:border-violet">
              + Logo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], 'logoUrl')} />
            </label>
            <label className="rounded-full bg-bg/85 backdrop-blur border border-line px-2.5 py-1 text-[11px] font-medium text-fg cursor-pointer hover:border-violet">
              + Banner
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], 'bannerUrl')} />
            </label>
          </div>
        </div>

        <div className="p-4 sm:p-5 pt-0">
          <div className="-mt-8 sm:-mt-10 flex flex-wrap items-end justify-between gap-3 relative z-10">
            <div className="flex flex-wrap items-end gap-3.5">
              <CoinLogo
                ticker={coin.ticker}
                logoUrl={coin.logoUrl}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-4 border-surface shadow-xl"
              />
              <div className="pb-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl sm:text-3xl">{coin.name}</h1>
                  <span className="text-sm font-bold text-violet-soft">${coin.ticker}</span>
                  <StatusBadge coin={coin} />
                </div>
                <p className="mt-0.5 text-xs text-muted max-w-xl">{coin.story}</p>
              </div>
            </div>

            {/* Clean Right-Side Action & Market Cap Strip (1-Click Pay DEX + Market Cap!) */}
            <div className="flex flex-wrap items-center gap-2.5 ml-auto">
              {!coin.dexPrepaid ? (
                <button
                  type="button"
                  onClick={() => setShowDexModal((v) => !v)}
                  className="rounded-xl border border-up/70 bg-up/15 px-3.5 py-2 text-xs font-semibold text-up hover:bg-up/25 transition shadow-[0_0_16px_rgba(61,220,151,0.2)]"
                >
                  🦅 Pay DEX (${DEX_PREPAY_USD})
                </button>
              ) : (
                <span className="rounded-xl border border-up/60 bg-up/15 px-3 py-1.5 text-xs font-semibold text-up">
                  🦅 DEX Paid ✓ ({coin.dexPaymentMethod === 'sol' || coin.dexPaymentMethod === 'usdc_sol' ? 'Phantom SOL' : 'PulseChain'})
                </span>
              )}

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className={`live-dot ${tradePulse ? 'scale-125' : ''}`}
                    title={tradePulse ? 'New trade just landed!' : 'Live market feed'}
                  />
                  <p className="text-[11px] uppercase tracking-wider text-muted">Market Cap &amp; Live Price</p>
                </div>
                <div className="flex items-baseline justify-end gap-1.5">
                  <p className="font-display text-2xl sm:text-3xl num-stat">{fmtUsd(mcapUsd(coin.curve, usdRate))}</p>
                  <span className={`text-xs font-semibold num-stat ${liveStats.changePct >= 0 ? 'text-up' : 'text-down'}`}>
                    {liveStats.changePct >= 0 ? '+' : ''}
                    {liveStats.changePct.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[11px] text-muted num-stat">
                  Price: <strong className="text-fg">{formatSubscriptPrice(pricePls(coin.curve))} PLS</strong> (
                  {formatSubscriptPrice(pricePls(coin.curve) * usdRate, { prefix: '$' })}) · Vol {fmtNum(liveStats.volPls)} PLS
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-mono">
                  {(
                    [
                      ['5m', windowChanges.change5mPct],
                      ['1h', windowChanges.change1hPct],
                      ['6h', windowChanges.change6hPct],
                      ['24h', windowChanges.change24hPct],
                    ] as const
                  ).map(([lbl, pct]) => (
                    <span
                      key={lbl}
                      className={`rounded-md border px-1.5 py-0.5 ${
                        pct >= 0
                          ? 'border-up/35 bg-up/10 text-up'
                          : 'border-down/35 bg-down/10 text-down'
                      }`}
                    >
                      {lbl} {pct >= 0 ? '+' : ''}
                      {pct.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dual-Wallet Autonomous DEX Payment Modal (trade.padre.gg style: PulseChain + Solana Phantom on the same page!) */}
          {showDexModal && !coin.dexPrepaid && (
            <div className="mt-4 inset-panel modal-enter border border-up/60 p-4 grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base text-up">🦅 Autonomous DexScreener Enhanced Info (${DEX_PREPAY_USD})</span>
                  <Badge tone="up">Auto-Relay at Bond</Badge>
                </div>
                <button type="button" onClick={() => setShowDexModal(false)} className="text-xs text-muted hover:text-fg">
                  ✕ Close
                </button>
              </div>

              {/* Dual Active Wallets Bar (PulseChain + Solana Phantom simultaneously active) */}
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-line bg-surface/60 p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted">Active Wallet 1 · PulseChain</p>
                    <p className="font-semibold text-fg">
                      🟣 {s.evm ? `${s.evmLabel ?? 'PulseChain'} (${short(s.evm)})` : `@${me ?? 'demo'} (Bound Wallet)`}
                    </p>
                  </div>
                  {!s.evm && (
                    <button type="button" onClick={quickConnectPulseChain} className="btn-ghost !py-1 !px-2.5 text-[11px]">
                      Connect EVM
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-violet/40 bg-violet/5 p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-violet-soft">Active Wallet 2 · Solana (Phantom)</p>
                    <p className="font-semibold text-fg">
                      👻 {s.phantom ? `Phantom (${short(s.phantom)})` : 'Not Connected'}
                    </p>
                  </div>
                  <button type="button" onClick={quickConnectPhantom} className="btn-ghost !py-1 !px-2.5 text-[11px] border-violet/50 text-violet-soft">
                    {s.phantom ? 'Connected ✓' : 'Connect Phantom'}
                  </button>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="grid gap-2 sm:grid-cols-4 text-xs">
                <button
                  type="button"
                  onClick={() => setDexMethod('pls')}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    dexMethod === 'pls' ? 'border-up bg-up/15 text-fg' : 'border-line bg-surface/40 text-muted hover:text-fg'
                  }`}
                >
                  <p className="font-semibold text-fg">🟣 PulseChain PLS</p>
                  <p className="mt-0.5 font-mono text-[11px] text-up">{fmtNum(dexCostPls)} PLS</p>
                </button>

                <button
                  type="button"
                  onClick={() => setDexMethod('sol')}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    dexMethod === 'sol' ? 'border-violet bg-violet/20 text-fg' : 'border-line bg-surface/40 text-muted hover:text-fg'
                  }`}
                >
                  <p className="font-semibold text-fg">👻 Phantom SOL</p>
                  <p className="mt-0.5 font-mono text-[11px] text-violet-soft">{dexCostSol} SOL ($299)</p>
                </button>

                <button
                  type="button"
                  onClick={() => setDexMethod('usdc_sol')}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    dexMethod === 'usdc_sol' ? 'border-violet bg-violet/20 text-fg' : 'border-line bg-surface/40 text-muted hover:text-fg'
                  }`}
                >
                  <p className="font-semibold text-fg">👻 Phantom USDC</p>
                  <p className="mt-0.5 font-mono text-[11px] text-violet-soft">299 USDC (Solana)</p>
                </button>

                <button
                  type="button"
                  onClick={() => setDexMethod('usdc_pls')}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    dexMethod === 'usdc_pls' ? 'border-up bg-up/15 text-fg' : 'border-line bg-surface/40 text-muted hover:text-fg'
                  }`}
                >
                  <p className="font-semibold text-fg">💵 PulseChain USDC</p>
                  <p className="mt-0.5 font-mono text-[11px] text-up">299 USDC (PRC-20)</p>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span>1. Pay $299</span>
                  <span>→</span>
                  <span>2. Auto-Stage Logo/Banner/Links</span>
                  <span>→</span>
                  <span>3. Instant DexScreener on Migration</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => confirmDexPayment(dexMethod)}
                    className="rounded-xl bg-up px-4 py-2 text-xs font-bold text-bg hover:opacity-90"
                  >
                    Pay ${DEX_PREPAY_USD} &amp; Activate DEX
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compact Socials + Security Bar */}
          <div className="mt-3 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <DevInfoLine launcher={coin.launcher} />
              {coin.xUrl && (
                <a
                  href={coin.xUrl.startsWith('http') ? coin.xUrl : `https://x.com/${coin.xUrl.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-xs text-fg hover:border-violet"
                >
                  𝕏 ↗
                </a>
              )}
              {coin.websiteUrl && (
                <a
                  href={coin.websiteUrl.startsWith('http') ? coin.websiteUrl : `https://${coin.websiteUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-xs text-fg hover:border-violet"
                >
                  🌐 Web ↗
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setXInput(coin.xUrl ?? '')
                  setWebInput(coin.websiteUrl ?? '')
                  setEditingSocials(!editingSocials)
                }}
                className="text-[11px] text-muted underline hover:text-fg"
              >
                {editingSocials ? 'Close' : '+ Links'}
              </button>
            </div>

            <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] text-cyan-200">
              🛡️ uniq.pulse Verified · 0% Token Tax · LP Locked Forever
            </span>
          </div>

          <div className="mt-2.5 pt-2.5 border-t border-line/50">
            <CoinTransparencyBadges coin={coin} />
          </div>

          {editingSocials && (
            <div className="mt-3 rounded-xl border border-line bg-bg p-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
              <input
                className="input !py-1.5 text-xs"
                value={xInput}
                onChange={(e) => setXInput(e.target.value)}
                placeholder="https://x.com/yourproject"
              />
              <input
                className="input !py-1.5 text-xs"
                value={webInput}
                onChange={(e) => setWebInput(e.target.value)}
                placeholder="https://yourproject.com"
              />
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                onClick={() => {
                  updateCoinSocials(coin.ticker, { xUrl: xInput, websiteUrl: webInput })
                  setEditingSocials(false)
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Ultra-Clean Visual Fee & Diamond-Hands Holder Yield Bar */}
      <div className="card !py-2.5 !px-4 border-violet/40 bg-gradient-to-r from-surface via-surface to-violet/10 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            💎 <strong className="text-up">Holders Pool: {fmtNum(liveStats.holderPoolPls)} PLS</strong>{' '}
            <span className="text-[11px] text-muted">(0.50% Curve + 1.5M Bond + 40% of Post-Migration LP Fees)</span>
          </span>
          <span>
            🛠️ <strong className="text-violet-soft">Creator: {fmtNum(liveStats.devPoolPls)} PLS</strong>
          </span>
          <span className="text-[11px] text-cyan-200">
            ⚡ Diamond-Hands Rule: Sell any amount before migration and you forfeit all your unclaimed rewards on that coin.
          </span>
        </div>

        <div className="flex items-center gap-3">
          {myCoinReward && (myCoinReward.claimableNowPls > 0 || myCoinReward.lockedPendingPls > 0) ? (
            <span className="text-[11px] font-medium text-fg">
              {coin.curve.graduated
                ? `🎁 Claimable: ${fmtNum(myCoinReward.claimableNowPls)} PLS`
                : `🔒 Locked until migration: ${fmtNum(myCoinReward.lockedPendingPls)} PLS`}
            </span>
          ) : (
            <span className="text-[11px] text-muted">
              {coin.curve.graduated
                ? '✅ After migration: PulseX LP fees (0.22%) from the locked LP, split 40% holders / 20% creator / 40% platform.'
                : '🔒 Accruing 0.50% Curve Holder Fees'}
            </span>
          )}
          <Link to="/rewards" className="text-xs font-semibold text-up underline hover:opacity-80">
            View rewards ↗
          </Link>
        </div>
      </div>

      {/* Main 2-Column Pump.tires Trading Terminal */}
      <div className="coin-terminal-grid">
        {/* Left Column: Chart + Tabbed Trades / Holders / Thread */}
        <div className="grid gap-4 min-w-0">
          <div className="card chart-card min-w-0">
            <TradeChart coin={coin} usdRate={usdRate} currentUser={me} />
          </div>

          <div className="card min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-edge)] pb-3 mb-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFeedTab('trades')}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    feedTab === 'trades' ? 'tab-pill-active' : 'bg-bg text-muted hover:text-fg border border-[var(--color-edge)]'
                  }`}
                >
                  Trades ({coin.trades.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFeedTab('holders')}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    feedTab === 'holders' ? 'tab-pill-active' : 'bg-bg text-muted hover:text-fg border border-[var(--color-edge)]'
                  }`}
                >
                  Holders ({crowd.count})
                </button>
                <button
                  type="button"
                  onClick={() => setFeedTab('comments')}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    feedTab === 'comments' ? 'tab-pill-active' : 'bg-bg text-muted hover:text-fg border border-[var(--color-edge)]'
                  }`}
                >
                  Thread ({(coin.comments ?? []).length})
                </button>
              </div>

              {feedTab === 'holders' && (
                <span className="text-[11px] text-up font-medium">💎 Diamond Pool Share</span>
              )}

              {feedTab === 'comments' && (
                <button
                  type="button"
                  onClick={() => setHoldersOnlyThread((v) => !v)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    holdersOnlyThread ? 'border-up/60 bg-up/10 text-up' : 'border-line text-muted'
                  }`}
                >
                  {holdersOnlyThread ? '💎 Holders Only' : 'All'}
                </button>
              )}
            </div>

            {feedTab === 'trades' ? (
              enrichedTrades.length === 0 ? (
                <p className="text-sm text-muted">No trades yet.</p>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted border-b border-line/60">
                      <tr>
                        <th className="py-2 pr-2">Time</th>
                        <th className="pr-2">Type</th>
                        <th className="text-right pr-2">PLS</th>
                        <th className="text-right pr-2">${coin.ticker}</th>
                        <th className="text-right pr-2">Price (PLS)</th>
                        <th className="pr-2">Wallet / Trader</th>
                        <th className="text-right">Realized PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {enrichedTrades.slice(0, 50).map((t, i) => {
                        const isProfit = (t.pnlUsd ?? 0) >= 0
                        const isDevTrade = t.user.toLowerCase() === coin.launcher.toLowerCase()
                        const spotPls =
                          tradePriceMapPls.get(`${t.t}-${t.user}-${t.side}-${t.pls}`) ??
                          (t.tokens > 0 ? t.pls / t.tokens : pricePls(coin.curve))
                        const ageMs = Math.max(1000, nowMs - t.t)
                        return (
                          <tr key={t.t + '-' + i}>
                            <td className="py-2 pr-2 font-mono text-[11px] text-muted whitespace-nowrap">
                              {fmtHoldDuration(ageMs, false)} ago
                            </td>
                            <td
                              className={`pr-2 font-semibold text-xs whitespace-nowrap ${
                                t.side === 'buy' ? 'text-up' : 'text-down'
                              }`}
                            >
                              {t.side.toUpperCase()}
                            </td>
                            <td className="text-right pr-2 font-mono text-xs whitespace-nowrap">
                              <div className={t.side === 'buy' ? 'text-up' : 'text-down'}>{fmtNum(t.pls)}</div>
                              <div className="text-[10px] text-muted">{fmtUsd(t.usd)}</div>
                            </td>
                            <td className="text-right pr-2 font-mono text-xs text-muted whitespace-nowrap">
                              {fmtNum(t.tokens)}
                            </td>
                            <td className="text-right pr-2 font-mono text-xs text-fg whitespace-nowrap">
                              {formatSubscriptPrice(spotPls)}
                            </td>
                            <td className="py-2 pr-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Link to={`/u/${t.user}`} className="font-medium hover:text-violet-soft underline">
                                  @{t.user}
                                </Link>
                                <HolderTierBadge username={t.user} compact />
                                {isDevTrade && <Badge tone="violet">DEV</Badge>}
                              </div>
                            </td>
                            <td className="text-right text-xs whitespace-nowrap">
                              {t.side === 'sell' && t.pnlUsd !== undefined ? (
                                <div className="inline-flex flex-col items-end">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                                      isProfit
                                        ? 'border-up/40 bg-up/10 text-up'
                                        : 'border-down/40 bg-down/10 text-down'
                                    }`}
                                  >
                                    {isProfit ? '+' : '-'}
                                    {fmtUsd(Math.abs(t.pnlUsd))} ({isProfit ? '+' : ''}
                                    {(t.pnlPct ?? 0).toFixed(1)}%)
                                  </span>
                                  {t.heldMs && (
                                    <span className="mt-0.5 text-[10px] text-muted">
                                      ⏱️ Held {fmtHoldDuration(t.heldMs, false)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted">Accumulate</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : feedTab === 'holders' ? (
              crowd.topList.length === 0 ? (
                <p className="text-xs text-muted">No holders yet.</p>
              ) : (
                <ul className="divide-y divide-line/60 text-xs max-h-96 overflow-y-auto">
                  {crowd.topList.map(([user, tokens], idx) => {
                    const supplyPct = (tokens / TOTAL_SUPPLY) * 100
                    const rAcct = holderRewardsMap[user.toLowerCase()]
                    const poolSharePls = rAcct?.earnedPls ?? 0
                    const isForfeited = Boolean(rAcct?.forfeitedBySell && poolSharePls < 1)
                    const isFlaggedHolder = isWalletOrUserLinkedToFlagged(user, s.coins, s)
                    return (
                      <li key={user} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-muted font-mono w-4">{idx + 1}.</span>
                          <Link to={`/u/${user}`} className="font-medium text-fg hover:text-violet-soft underline truncate">
                            @{user}
                          </Link>
                          <HolderTierBadge username={user} compact />
                          {user === coin.launcher && <Badge tone="violet">Dev</Badge>}
                          {isFlaggedHolder && (
                            <Badge
                              tone="down"
                              title="This wallet was funded by or funded a rugger's wallet (>80% sell within 1h and >80% price drop)."
                            >
                              🚩 Linked to a flagged wallet
                            </Badge>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-fg">{supplyPct.toFixed(1)}%</span>
                          {isForfeited ? (
                            <span className="ml-2 text-[10px] text-down">Sold (0 PLS)</span>
                          ) : (
                            <span className="ml-2 text-[11px] text-up">+{fmtNum(poolSharePls)} PLS</span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : (
              <div>
                {me ? (
                  <div className="mb-3 flex gap-2">
                    <input
                      className="input flex-1 !py-2 text-xs"
                      maxLength={240}
                      placeholder={`Post as @${me}...`}
                      value={commentText}
                      onChange={(e) => {
                        setCommentText(e.target.value)
                        setCommentMsg(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const r = postCoinComment(coin.ticker, commentText, holdersOnlyThread)
                          if (r.error) setCommentMsg({ kind: 'error', text: r.error })
                          else {
                            setCommentText('')
                            setCommentMsg(null)
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary !py-2 !px-4 text-xs"
                      onClick={() => {
                        const r = postCoinComment(coin.ticker, commentText, holdersOnlyThread)
                        if (r.error) setCommentMsg({ kind: 'error', text: r.error })
                        else {
                          setCommentText('')
                          setCommentMsg(null)
                        }
                      }}
                    >
                      Post
                    </button>
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-muted">
                    <Link to="/pass" className="text-violet-soft underline">
                      Get @username
                    </Link>{' '}
                    to post.
                  </p>
                )}
                {commentMsg && <Notice kind={commentMsg.kind}>{commentMsg.text}</Notice>}
                <div className="grid gap-2 max-h-80 overflow-y-auto">
                  {(coin.comments ?? [])
                    .filter((c) => !holdersOnlyThread || (coin.holders[c.user] ?? 0) > 0 || c.user === coin.launcher)
                    .map((c) => {
                      const cHeldPct = ((coin.holders[c.user] ?? 0) / TOTAL_SUPPLY) * 100
                      return (
                        <div key={c.id} className="rounded-xl border border-line/70 bg-bg/70 p-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Link to={`/u/${c.user}`} className="font-semibold text-fg hover:text-violet-soft underline">
                                @{c.user}
                              </Link>
                              <HolderTierBadge username={c.user} compact />
                              {c.user === coin.launcher && <Badge tone="violet">Dev</Badge>}
                              {cHeldPct > 0.01 && <Badge tone="up">{cHeldPct.toFixed(1)}%</Badge>}
                            </div>
                            <span className="text-[11px] text-muted">{new Date(c.t).toLocaleTimeString()}</span>
                          </div>
                          <p className="mt-1 text-fg">{c.text}</p>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Swap Box + Bonding Curve Progress + Dev Lock Ladder */}
        <div className="grid gap-4 min-w-0">
          <div className="card min-w-0">
            <div className="inset-panel grid grid-cols-2 gap-1.5 p-1.5">
              {(['buy', 'sell'] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => {
                    setSide(x)
                    setMsg(null)
                    setHighImpactConfirmed(false)
                    setForfeitSellConfirmed(false)
                    setAmt(x === 'buy' ? '1000000' : String(Math.floor(held)))
                  }}
                  className={`min-h-[40px] rounded-xl py-2 text-sm font-bold transition ${
                    side === x
                      ? x === 'buy'
                        ? 'text-[#07051A] shadow-[0_0_20px_rgba(61,220,151,0.45)]'
                        : 'text-white shadow-[0_0_20px_rgba(255,92,122,0.45)]'
                      : 'text-muted hover:text-fg'
                  }`}
                  style={
                    side === x
                      ? { background: x === 'buy' ? 'var(--grad-up)' : 'var(--grad-down)' }
                      : undefined
                  }
                >
                  {x === 'buy' ? 'Buy' : 'Sell'}
                </button>
              ))}
            </div>

            <label className="label mt-3" htmlFor="amt">
              {side === 'buy' ? 'Amount (PLS)' : `Amount ($${coin.ticker})`}
            </label>
            <input
              id="amt"
              inputMode="decimal"
              className="input mt-1"
              value={amt}
              onChange={(e) => {
                setHighImpactConfirmed(false)
                setForfeitSellConfirmed(false)
                setAmt(e.target.value.replace(/[^\d.,]/g, ''))
              }}
            />

            {side === 'buy' ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[1_000_000, 5_000_000, 20_000_000, 50_000_000].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs hover:border-violet"
                    onClick={() => {
                      setHighImpactConfirmed(false)
                      setAmt(String(p))
                    }}
                  >
                    {fmtNum(p / 1_000_000)}M
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex gap-1.5">
                  {SELL_PCTS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => applySellPct(pct)}
                      className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs font-semibold hover:border-violet"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-muted">
                  Bal: {fmtNum(unlockedHeld)}
                  {lockedDevTokens > 0 && ` (+${fmtNum(lockedDevTokens)} locked)`}
                </span>
              </div>
            )}

            {/* Slippage Setting (0.5% / 1% / 3% / custom, default 1%) */}
            <div className="mt-3 inset-panel p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] text-muted">Slippage tolerance</span>
                <div className="flex flex-wrap items-center gap-1">
                  {SLIPPAGE_PRESETS.map((preset) => {
                    const key = String(preset) as '0.5' | '1' | '3'
                    const active = slippageMode === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSlippageMode(key)}
                        className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition ${
                          active ? 'tab-pill-active' : 'border-line bg-bg text-muted hover:text-fg'
                        }`}
                      >
                        {preset}%
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setSlippageMode('custom')}
                    className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition ${
                      slippageMode === 'custom'
                        ? 'tab-pill-active'
                        : 'border-line bg-bg text-muted hover:text-fg'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>
              {slippageMode === 'custom' && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customSlippage}
                    onChange={(e) => setCustomSlippage(e.target.value.replace(/[^\d.]/g, ''))}
                    className="input !py-1 !px-2 text-xs w-20"
                    placeholder="1.0"
                  />
                  <span className="text-[11px] text-muted">%</span>
                </div>
              )}
            </div>

            {myCoinPosition && myCoinPosition.isHolding && (
              <div className="mt-3 inset-panel p-2.5 text-xs grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted">Your Position (@{me})</span>
                  <span className="font-mono text-[11px] text-cyan-200">
                    ⏱️ Held {fmtHoldDuration(myCoinPosition.heldMs)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-line/60">
                  <div>
                    <p className="text-[10px] text-muted">Bought</p>
                    <p className="font-semibold text-fg">{fmtUsd(myCoinPosition.remainingCostUsd)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted">Value</p>
                    <p className="font-semibold text-fg">{fmtUsd(myCoinPosition.currentValueUsd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted">Unrealized PnL</p>
                    <p
                      className={`font-mono font-bold ${
                        myCoinPosition.unrealizedPnlUsd >= 0 ? 'text-up' : 'text-down'
                      }`}
                    >
                      {myCoinPosition.unrealizedPnlUsd >= 0 ? '+' : '-'}
                      {fmtUsd(Math.abs(myCoinPosition.unrealizedPnlUsd))} ({myCoinPosition.unrealizedRoiPct >= 0 ? '+' : ''}
                      {myCoinPosition.unrealizedRoiPct.toFixed(1)}%)
                    </p>
                  </div>
                </div>
                {myCoinReward && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-line/60 text-[11px]">
                    <span className="text-muted">
                      {coin.curve.graduated ? '🎁 Accrued Rewards:' : '🔒 Accrued (Hold to Migration):'}{' '}
                      <strong className={`${coin.curve.graduated ? 'text-up' : 'text-amber-300'} font-mono`}>
                        +{fmtNum(myCoinReward.claimableNowPls + myCoinReward.lockedPendingPls)} PLS
                      </strong>
                    </span>
                    <span className="font-mono text-cyan-200">
                      Running Rate: {crowd.totalCirc > 0 ? ((held / crowd.totalCirc) * 100).toFixed(2) : '0.00'}% of Pool
                    </span>
                  </div>
                )}
              </div>
            )}

            {quote.ok && (
              <div className="mt-3 inset-panel p-2.5 text-xs grid gap-1">
                <div className="flex justify-between">
                  <span className="text-muted">Receive:</span>
                  <strong className="text-fg">
                    {side === 'buy'
                      ? `${fmtNum((quote as ReturnType<typeof quoteBuy>).tokens)} $${coin.ticker}`
                      : `${fmtNum((quote as ReturnType<typeof quoteSell>).plsOut)} PLS (${fmtUsd(
                          (quote as ReturnType<typeof quoteSell>).plsOut * usdRate
                        )})`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Minimum received ({slippagePct}% slippage):</span>
                  <strong className="text-fg font-mono">
                    {side === 'buy'
                      ? `${fmtNum((quote as ReturnType<typeof quoteBuy>).minReceivedTokens)} $${coin.ticker}`
                      : `${fmtNum((quote as ReturnType<typeof quoteSell>).minReceivedPls)} PLS`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Price impact:</span>
                  <strong
                    className={`font-mono ${
                      quote.priceImpactPct > 15
                        ? 'text-down'
                        : quote.priceImpactPct > 5
                        ? 'text-amber-300'
                        : 'text-fg'
                    }`}
                  >
                    {quote.priceImpactPct.toFixed(2)}%
                  </strong>
                </div>
                {quote.priceImpactPct > 5 && (
                  <div className="mt-1 rounded-lg border border-amber-400/60 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200">
                    ⚠️ High price impact ({quote.priceImpactPct.toFixed(2)}%).
                    {quote.priceImpactPct > 15 && ' Click a second time to confirm this trade.'}
                  </div>
                )}
                {side === 'sell' && myCoinPosition && myCoinPosition.heldTokens > 0 && (
                  (() => {
                    const sellTokens = (quote as ReturnType<typeof quoteSell>).tokens
                    const plsOut = (quote as ReturnType<typeof quoteSell>).plsOut
                    const lotCostPls =
                      (myCoinPosition.remainingCostPls / Math.max(myCoinPosition.heldTokens, 1)) * sellTokens
                    const estPnlPls = plsOut - lotCostPls
                    const estPnlUsd = estPnlPls * usdRate
                    const estRoiPct = lotCostPls > 0 ? (estPnlPls / lotCostPls) * 100 : 0
                    const isPos = estPnlUsd >= 0
                    const pendingAutoClaimPls =
                      (myCoinReward?.claimableNowPls ?? 0) + (myCoinReward?.lockedPendingPls ?? 0)
                    // ANY sell before migration forfeits ALL of that wallet's unclaimed rewards on this coin
                    const forfeitOnSellPls = pendingAutoClaimPls
                    const remainingAfterSell = Math.max(0, held - sellTokens)
                    const newRatePct =
                      crowd.totalCirc - sellTokens > 0
                        ? (remainingAfterSell / (crowd.totalCirc - sellTokens)) * 100
                        : 0
                    return (
                      <div className="grid gap-1 pt-1 border-t border-line/50">
                        <div className="flex justify-between items-center">
                          <span className="text-muted">Est. Realized PnL:</span>
                          <span className={`font-mono font-bold ${isPos ? 'text-up' : 'text-down'}`}>
                            {isPos ? '+' : '-'}
                            {fmtUsd(Math.abs(estPnlUsd))} ({isPos ? '+' : ''}
                            {estRoiPct.toFixed(1)}%)
                          </span>
                        </div>
                        {pendingAutoClaimPls > 0 && (
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-muted">
                              {coin.curve.graduated ? '🎁 Holder Rewards:' : '⚠️ Early Sell Penalty:'}
                            </span>
                            <span
                              className={`font-mono font-semibold ${
                                coin.curve.graduated ? 'text-up' : 'text-amber-300'
                              }`}
                            >
                              {coin.curve.graduated
                                ? `Auto-claim: +${fmtNum(pendingAutoClaimPls)} PLS (${fmtUsd(pendingAutoClaimPls * usdRate)})`
                                : `Forfeit ALL to holders: -${fmtNum(forfeitOnSellPls)} PLS (${fmtUsd(forfeitOnSellPls * usdRate)})`}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-muted">New Running Pool Rate After Sell:</span>
                          <span className="font-mono text-cyan-200">
                            {newRatePct.toFixed(2)}% of future fees
                          </span>
                        </div>
                      </div>
                    )
                  })()
                )}
                {feeBreakdown && (
                  <div className="flex justify-between text-[11px] text-muted">
                    {coin.curve.graduated ? (
                      <span>After migration: PulseX LP fees (0.22%) from the locked LP, split 40% holders / 20% creator / 40% platform.</span>
                    ) : (
                      <>
                        <span>1.25% Curve Fee:</span>
                        <span>0.50% Holders · 0.25% Dev · 0.50% @{PLATFORM_USERNAME}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!quote.ok && n > 0 && <Notice kind="error">{quote.error}</Notice>}

            {side === 'sell' && !coin.curve.graduated && pendingUnclaimedPls > 0 && forfeitSellConfirmed && (
              <div className="mt-3 rounded-xl border border-amber-400/70 bg-amber-400/15 p-2.5 text-xs font-semibold text-amber-200">
                Selling before migration forfeits all {fmtNum(pendingUnclaimedPls)} PLS of your unclaimed rewards on this coin.
              </div>
            )}

            {me ? (
              <button
                type="button"
                className={`${side === 'buy' ? 'btn-buy' : 'btn-sell'} mt-3 w-full`}
                disabled={!quote.ok}
                onClick={submit}
              >
                {needsForfeitConfirm
                  ? `Confirm sell (forfeit ${fmtNum(pendingUnclaimedPls)} PLS rewards)`
                  : needsHighImpactConfirm
                  ? `Confirm high impact (${quote.priceImpactPct.toFixed(1)}%) ${side === 'buy' ? 'Buy' : 'Sell'}`
                  : side === 'buy'
                  ? `Buy $${coin.ticker}`
                  : `Sell $${coin.ticker}`}
              </button>
            ) : (
              <Link to="/pass" className="btn-primary mt-3 w-full">
                Connect wallet
              </Link>
            )}
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          </div>

          {/* Bonding Curve & Migration Fee Card */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-sm">Bonding Curve</h2>
              <span className="text-xs font-semibold text-violet-soft">
                {coin.curve.graduated ? '👑 Migrated to PulseX' : 'about 79.3% Supply on Curve'}
              </span>
            </div>
            <Progress coin={coin} />
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center text-[11px]">
              <div className="inset-panel p-2">
                <p className="text-muted">Curve Fee</p>
                <p className="font-semibold text-fg num-stat">1.25%</p>
              </div>
              <div className="inset-panel p-2">
                <p className="text-muted">Bond Fee</p>
                <p className="font-semibold text-violet-soft num-stat">4M PLS (2%)</p>
              </div>
              <div className="inset-panel p-2">
                <p className="text-muted">Post-LP Fee</p>
                <p className="font-semibold text-up num-stat">0.22% LP (40/20/40)</p>
              </div>
            </div>
          </div>

          {/* HEX-Style Dev Lock (Staking Ladder) Card */}
          {(() => {
            const lockSummary = computeDevLockSummary(coin, nowMs)
            const lockAccruals = computeDevLockAccruals(coin, nowMs)
            const allLocks = coin.devLocks ?? []
            const parsedLockAmt = Number(lockAmtInput.replace(/,/g, '')) || 0
            const parsedLockDays = Math.min(MAX_DEV_LOCK_DAYS, Math.max(1, Math.floor(Number(lockDaysInput) || 1)))
            const previewBoost = computeLockBoostWeight(parsedLockDays)
            const breakPreview = breakingLockId ? previewEarlyUnlockDevLock(coin, breakingLockId, nowMs) : null

            return (
              <div className="card grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm">🔒 Dev Lock Ladder (HEX-Style)</h2>
                    <p className="text-[11px] text-muted">
                      Up to {MAX_DEV_LOCKS_PER_COIN} locks · 1–{MAX_DEV_LOCK_DAYS} days · up to 2.00× holder pool weight
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lockSummary.badgeText ? (
                      <Badge tone="up">🔒 {lockSummary.badgeText}</Badge>
                    ) : (
                      <Badge tone="muted">No active dev locks</Badge>
                    )}
                    {lockSummary.devBrokeLock && <Badge tone="down">⚠️ Dev broke lock (−25 score)</Badge>}
                  </div>
                </div>

                {allLocks.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-[11px] text-muted border-b border-line/60">
                        <tr>
                          <th className="py-1.5">Lock</th>
                          <th>Tokens (% Supply)</th>
                          <th>Term / Boost</th>
                          <th>Status / Maturity</th>
                          <th className="text-right">Accrued PLS</th>
                          {isDevViewer && <th className="text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {allLocks.map((lk, idx) => {
                          const effStatus = getEffectiveLockStatus(lk, nowMs)
                          const supplyPct = (lk.amountTokens / TOTAL_SUPPLY) * 100
                          const daysRem = Math.max(0, (lk.unlockAt - nowMs) / DAY_MS)
                          const acc = lockAccruals.locks.find((x) => x.lock.id === lk.id)
                          const accruedPls = acc?.accruedPls ?? lk.accruedPls ?? 0

                          return (
                            <tr key={lk.id}>
                              <td className="py-2 font-mono font-semibold">#{idx + 1}</td>
                              <td className="py-2 font-mono">
                                {fmtNum(lk.amountTokens)} <span className="text-muted">({supplyPct.toFixed(2)}%)</span>
                              </td>
                              <td className="py-2">
                                <div>{lk.termDays}d</div>
                                <div className="text-[11px] text-up font-semibold">
                                  Lock boost: {lk.boostWeight.toFixed(2)}×
                                </div>
                              </td>
                              <td className="py-2">
                                {effStatus === 'active' ? (
                                  <div>
                                    <span className="text-amber-300 font-semibold">
                                      Unlocks in {Math.ceil(daysRem)}d
                                    </span>
                                    <div className="text-[10px] text-muted">Accruing, paid at maturity</div>
                                  </div>
                                ) : effStatus === 'matured' ? (
                                  <div>
                                    <span className="text-up font-semibold">Matured ✓</span>
                                    <div className="text-[10px] text-muted">Added to claimable rewards</div>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="text-down font-semibold">Broken ✕</span>
                                    <div className="text-[10px] text-down">
                                      Burned {fmtNum(lk.burnedTokens ?? 0)} · Forfeited {fmtNum(lk.forfeitedPls ?? 0)} PLS
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 text-right font-mono">
                                {effStatus === 'broken' ? (
                                  <span className="text-down line-through">{fmtNum(lk.forfeitedPls ?? 0)} PLS</span>
                                ) : (
                                  <span className="text-up font-semibold">+{fmtNum(accruedPls)} PLS</span>
                                )}
                              </td>
                              {isDevViewer && (
                                <td className="py-2 text-right">
                                  {effStatus === 'active' ? (
                                    <div className="inline-flex flex-wrap justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setExtendingLockId(lk.id)
                                          setExtendDaysInput(String(Math.min(MAX_DEV_LOCK_DAYS, lk.termDays + 30)))
                                          setBreakingLockId(null)
                                          setLockMsg(null)
                                        }}
                                        className="rounded border border-violet/60 bg-violet/10 px-2 py-0.5 text-[11px] text-violet-soft hover:border-violet"
                                      >
                                        Extend
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBreakingLockId(lk.id)
                                          setExtendingLockId(null)
                                          setLockMsg(null)
                                        }}
                                        className="rounded border border-down/60 bg-down/10 px-2 py-0.5 text-[11px] text-down hover:border-down"
                                      >
                                        Early Unlock
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-muted">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Extend Lock inline confirm */}
                {isDevViewer && extendingLockId && (
                  <div className="inset-panel modal-enter border border-violet/60 p-3 text-xs grid gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-fg">Extend Lock (1–{MAX_DEV_LOCK_DAYS} days, never shortened)</span>
                      <button
                        type="button"
                        onClick={() => setExtendingLockId(null)}
                        className="text-muted hover:text-fg"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={MAX_DEV_LOCK_DAYS}
                        value={extendDaysInput}
                        onChange={(e) => setExtendDaysInput(e.target.value)}
                        className="input !py-1 !px-2.5 text-xs w-28"
                      />
                      <span className="text-muted">
                        New boost:{' '}
                        <strong className="text-up">
                          {computeLockBoostWeight(Number(extendDaysInput) || 1).toFixed(2)}×
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const r = extendDevLock(coin.ticker, extendingLockId, Number(extendDaysInput) || 0, nowMs)
                          setLockMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Lock extended!' })
                          if (!r.error) setExtendingLockId(null)
                        }}
                        className="btn-primary !py-1 !px-3 text-xs ml-auto"
                      >
                        Confirm Extend
                      </button>
                    </div>
                  </div>
                )}

                {/* Early Unlock HEX-style Confirm Screen */}
                {isDevViewer && breakingLockId && breakPreview && (
                  <div className="inset-panel modal-enter border border-down/70 p-3 text-xs grid gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-down">⚠️ Confirm Early Unlock (HEX-Style Penalty)</span>
                      <button
                        type="button"
                        onClick={() => setBreakingLockId(null)}
                        className="text-muted hover:text-fg"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                    {!breakPreview.ok ? (
                      <p className="text-down">{breakPreview.error}</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-down/40 bg-bg/80 p-2.5">
                          <div>
                            <p className="text-[10px] text-muted">Tokens Returned Unlocked</p>
                            <p className="font-mono font-bold text-fg">
                              {fmtNum(breakPreview.returnedTokens)} ${coin.ticker}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">
                              Penalty Burned ({breakPreview.penaltyPct.toFixed(1)}%)
                            </p>
                            <p className="font-mono font-bold text-down">
                              🔥 {fmtNum(breakPreview.burnedTokens)} ${coin.ticker} (100% burned)
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">Accrued PLS Forfeited to Holders</p>
                            <p className="font-mono font-bold text-down">
                              −{fmtNum(breakPreview.forfeitedPls)} PLS (100% to holders)
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">Reputation Hit</p>
                            <p className="font-mono font-bold text-down">
                              {breakPreview.scoreHit} dev score + permanent &ldquo;Dev broke lock&rdquo; badge
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setBreakingLockId(null)}
                            className="btn-ghost !py-1 !px-3 text-xs"
                          >
                            Keep Lock
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const r = earlyUnlockDevLock(coin.ticker, breakingLockId, nowMs)
                              setLockMsg(
                                r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Lock broken.' }
                              )
                              setBreakingLockId(null)
                            }}
                            className="rounded-xl bg-down px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90"
                          >
                            Confirm Break Lock &amp; Burn Penalty
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Create Lock Controls (Dev only, up to 10 locks, 0 PLS fee) */}
                {isDevViewer && allLocks.length < MAX_DEV_LOCKS_PER_COIN && (
                  <div className="inset-panel p-3 text-xs grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-fg">
                        + Create Dev Token Lock ({allLocks.length}/{MAX_DEV_LOCKS_PER_COIN} used · 0 PLS fee)
                      </span>
                      <span className="text-[11px] text-up font-semibold">
                        Lock boost: {previewBoost.toFixed(2)}×
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto] items-end">
                      <div>
                        <label className="text-[10px] text-muted">
                          Tokens to lock (Unlocked: {fmtNum(unlockedHeld)})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={`e.g. ${Math.floor(unlockedHeld * 0.5) || 10000000}`}
                          value={lockAmtInput}
                          onChange={(e) => {
                            setLockAmtInput(e.target.value.replace(/[^\d.,]/g, ''))
                            setConfirmingCreateLock(false)
                          }}
                          className="input !py-1.5 !px-2.5 text-xs mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted">Term (1–5555 days)</label>
                        <input
                          type="number"
                          min={1}
                          max={MAX_DEV_LOCK_DAYS}
                          value={lockDaysInput}
                          onChange={(e) => {
                            setLockDaysInput(e.target.value)
                            setConfirmingCreateLock(false)
                          }}
                          className="input !py-1.5 !px-2.5 text-xs mt-0.5"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (parsedLockAmt <= 0) {
                            setLockMsg({ kind: 'error', text: 'Enter a positive token amount to lock.' })
                            return
                          }
                          if (!confirmingCreateLock) {
                            setConfirmingCreateLock(true)
                            setLockMsg(null)
                            return
                          }
                          const r = createDevLock(coin.ticker, parsedLockAmt, parsedLockDays, nowMs)
                          setLockMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Locked!' })
                          if (!r.error) {
                            setLockAmtInput('')
                            setConfirmingCreateLock(false)
                          }
                        }}
                        className="btn-primary !py-1.5 !px-3 text-xs"
                      >
                        {confirmingCreateLock ? `Confirm Lock (${previewBoost.toFixed(2)}×)` : 'Lock Tokens (0 PLS)'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[7, 30, 90, 365, 1555, 5555].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setLockDaysInput(String(d))
                            setConfirmingCreateLock(false)
                          }}
                          className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] text-muted hover:text-fg hover:border-violet"
                        >
                          {d}d ({computeLockBoostWeight(d).toFixed(2)}×)
                        </button>
                      ))}
                    </div>
                    {confirmingCreateLock && (
                      <div className="rounded-lg border border-up/50 bg-up/10 px-2.5 py-2 text-[11px] text-fg">
                        Confirm locking <strong>{fmtNum(parsedLockAmt)} ${coin.ticker}</strong> (
                        {((parsedLockAmt / TOTAL_SUPPLY) * 100).toFixed(2)}% of supply) for{' '}
                        <strong>{parsedLockDays} days</strong> ·{' '}
                        <strong className="text-up">Lock boost: {previewBoost.toFixed(2)}×</strong> · Cost: <strong>0 PLS</strong>.
                        Rewards accrue and are paid at maturity.
                      </div>
                    )}
                  </div>
                )}

                {lockMsg && <Notice kind={lockMsg.kind}>{lockMsg.text}</Notice>}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
