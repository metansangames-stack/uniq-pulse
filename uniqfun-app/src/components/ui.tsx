import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GRAD_PLS, fmtNum, fmtUsd, mcapUsd, progress } from '../lib/model'
import { getCoinBanner, getCoinLogo } from '../lib/coinArt'
import { useTilt } from '../lib/useTilt'
import { PLATFORM_USERNAME, PLS_USD } from '../config'
import { computeCoinTransparencyMetrics, computeDevScore } from '../lib/reputation'
import { getHolderTierBadge, useStore, type Coin } from '../state/store'

export function HolderTierBadge({ username, compact = false }: { username: string; compact?: boolean }) {
  const { coins } = useStore()
  const tier = getHolderTierBadge(username, coins)
  if (tier.tier === 0) return null
  const toneClass =
    tier.tier >= 4
      ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
      : tier.tier === 3
      ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
      : tier.tier === 2
      ? 'border-violet/70 bg-violet/15 text-violet-soft'
      : 'border-line bg-bg text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
      title={`${tier.emoji} ${tier.label} · ${tier.migratedHeldCount} migrated / ${tier.totalHeldCount} held`}
    >
      <span>{tier.emoji}</span>
      {!compact && <span>{tier.label}</span>}
    </span>
  )
}

/**
 * Exclusive Sovereign Shield Badge ONLY for the official @uniq_pulse platform account.
 * Unforgeable by any regular user or dev; separates platform governance from regular Crowned Builders.
 */
export function PlatformDevBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/70 bg-gradient-to-r from-violet/35 via-fuchsia-500/25 to-cyan-400/25 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-cyan-200 shadow-[0_0_16px_rgba(41,232,244,0.28)]"
      title="Official uniq.pulse Platform Core Account — Exclusive Sovereign Shield Seal"
    >
      <img src="/logo-shield.png?v=pulse" alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
      <span>⚡ {compact ? 'UNIQ.PULSE DEV' : 'UNIQ.PULSE PLATFORM DEV'}</span>
    </span>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const c = kind === 'error' ? 'border-down/50 text-down' : kind === 'ok' ? 'border-up/50 text-up' : 'border-line text-muted'
  return <p className={`mt-3 rounded-xl border ${c} bg-bg px-3 py-2 text-sm`}>{children}</p>
}

export function Badge({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode
  tone?: 'muted' | 'violet' | 'up' | 'warn' | 'down'
  title?: string
}) {
  const c = {
    muted: 'border-line text-muted',
    violet: 'border-violet text-violet-soft',
    up: 'border-up/60 text-up',
    warn: 'border-amber-400/60 text-amber-300',
    down: 'border-down/60 text-down',
  }[tone]
  return (
    <span title={title} className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${c}`}>
      {children}
    </span>
  )
}

export function CoinTransparencyBadges({ coin, compact = false }: { coin: Coin; compact?: boolean }) {
  const s = useStore()
  const metrics = computeCoinTransparencyMetrics(coin, s)
  const top10Tone: 'muted' | 'warn' | 'down' =
    metrics.top10HoldersPct > 50 ? 'down' : metrics.top10HoldersPct > 30 ? 'warn' : 'muted'

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge
        tone="muted"
        title={`Dev @${coin.launcher} currently holds ${metrics.devHeldPct.toFixed(2)}% of total 1B token supply (live).`}
      >
        Dev {metrics.devHeldPct.toFixed(1)}% held
      </Badge>
      <Badge
        tone={metrics.devSoldPct > 50 ? 'down' : 'muted'}
        title={`Share of dev @${coin.launcher}'s peak holdings sold (${metrics.devSoldPct.toFixed(1)}%). Red if >50%.`}
      >
        Dev sold: {metrics.devSoldPct.toFixed(0)}%
      </Badge>
      {metrics.isLargeDevAllocation && (
        <Badge
          tone="warn"
          title={`Dev's initial buy (${metrics.devInitialBuyPct.toFixed(2)}%) exceeded 5% of total 1B supply.`}
        >
          Large dev allocation ({metrics.devInitialBuyPct.toFixed(1)}%)
        </Badge>
      )}
      <Badge
        tone={top10Tone}
        title="Share of total supply held by the top 10 wallets (excluding bonding curve and LP vault). Yellow >30%, red >50%."
      >
        Top 10: {metrics.top10HoldersPct.toFixed(1)}%
      </Badge>
      {(metrics.sniperHoldPct > 0 || !compact) && (
        <Badge
          tone={metrics.sniperHoldPct > 15 ? 'warn' : 'muted'}
          title="Supply currently held by wallets that bought in the first 3 blocks (first 10 seconds) after launch."
        >
          Snipers hold {metrics.sniperHoldPct.toFixed(1)}%
        </Badge>
      )}
      {(metrics.bundleHoldPct > 0 || !compact) && (
        <Badge
          tone={metrics.bundleHoldPct > 15 ? 'warn' : 'muted'}
          title="Supply currently held by 3+ wallets buying in the same second at launch, or funded from the same wallet."
        >
          Bundles hold {metrics.bundleHoldPct.toFixed(1)}%
        </Badge>
      )}
      {metrics.lockSummary.badgeText && (
        <Badge
          tone="up"
          title="HEX-style dev token staking ladder: locked tokens cannot be sold before maturity and earn up to 2x holder pool weight."
        >
          🔒 {metrics.lockSummary.badgeText}
        </Badge>
      )}
      {metrics.lockSummary.devBrokeLock && (
        <Badge
          tone="down"
          title="Permanent flag: the dev early-unlocked a token lock on this coin (forfeiting accrued PLS, burning penalty tokens, and taking a −25 dev score penalty)."
        >
          ⚠️ Dev broke lock
        </Badge>
      )}
    </div>
  )
}

export function ProveXSoon() {
  return <Badge tone="warn">ProveX: coming soon, not live</Badge>
}

export function CoinLogo({ ticker, logoUrl, className = 'h-12 w-12 rounded-2xl' }: { ticker: string; logoUrl?: string; className?: string }) {
  return (
    <img
      src={getCoinLogo(ticker || 'UNIQ', logoUrl)}
      alt={`$${ticker} logo`}
      className={`object-cover select-none shrink-0 bg-[#110B2E] ring-1 ring-violet/60 shadow-[var(--shadow-depth)] ${className}`}
    />
  )
}

export function CoinBanner({ ticker, bannerUrl, className = 'h-24 w-full' }: { ticker: string; bannerUrl?: string; className?: string }) {
  return (
    <img
      src={getCoinBanner(ticker || 'UNIQ', bannerUrl)}
      alt={`$${ticker} banner`}
      className={`object-cover select-none w-full bg-[#110B2E] ${className}`}
    />
  )
}

/** Computes a dev's launch & migration record across all coins. */
export function getDevRecord(launcher: string, coins: Coin[]) {
  const launched = coins.filter((c) => c.launcher === launcher)
  const migrated = launched.filter((c) => c.curve.graduated)
  return {
    totalLaunched: launched.length,
    migratedCount: migrated.length,
    isCrowned: migrated.length > 0,
    launchedCoins: launched,
    migratedCoins: migrated,
  }
}

/** Clean Dev Info Line with a 👑 King Crown if the dev has migrated at least 1 token + optional 𝕏 Verified badge + Dev Score & Wallet Age. Clickable to view @username profile. */
export function DevInfoLine({ launcher, compact = false }: { launcher: string; compact?: boolean }) {
  const s = useStore()
  const { coins, verifiedX } = s
  const navigate = useNavigate()
  const rec = getDevRecord(launcher, coins)
  const devRep = computeDevScore(launcher, coins, s)
  const xHandle = verifiedX?.[launcher]
  const isPlatform = launcher.toLowerCase() === PLATFORM_USERNAME.toLowerCase()
  const scoreTone: 'muted' | 'up' | 'warn' | 'down' = devRep.isNewDev
    ? 'muted'
    : devRep.score >= 70
    ? 'up'
    : devRep.score >= 40
    ? 'warn'
    : 'down'

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          navigate(`/u/${launcher}`)
        }}
        className={
          isPlatform
            ? 'inline-flex items-center gap-1 rounded-full border border-cyan-400/70 bg-cyan-400/10 px-2 py-0.5 font-semibold text-cyan-200 hover:border-cyan-300 transition'
            : rec.isCrowned
            ? 'inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 font-semibold text-amber-300 hover:border-amber-300 transition'
            : 'text-muted hover:text-violet-soft transition'
        }
        title={`View @${launcher}'s profile & stats (${devRep.hoverBreakdown})`}
      >
        {isPlatform ? (
          <>
            <img src="/logo-shield.png?v=pulse" alt="" className="h-3.5 w-3.5 object-contain" />
            <span className="underline decoration-cyan-400/50">@{launcher}</span>
          </>
        ) : rec.isCrowned ? (
          <>
            <span>👑</span>
            <span className="underline decoration-amber-400/50">@{launcher}</span>
          </>
        ) : (
          <span>
            Dev: <strong className="text-fg font-medium underline decoration-line hover:text-violet-soft">@{launcher}</strong>
          </span>
        )}
      </button>
      {isPlatform && <PlatformDevBadge compact={compact} />}
      <Badge tone={scoreTone} title={devRep.hoverBreakdown}>
        {devRep.isNewDev ? 'New dev' : `Dev score: ${devRep.score}/100`}
      </Badge>
      <span className="text-muted" title={`First on-chain / platform activity ${devRep.walletAgeDays} days ago`}>
        Wallet age: {devRep.walletAgeDays} days
      </span>
      {devRep.isLinkedToFlagged && (
        <Badge
          tone="down"
          title="This wallet was funded by or funded a wallet that rugged a launch (>80% dev sell within 1h and >80% price drop)."
        >
          🚩 Linked to a flagged wallet
        </Badge>
      )}
      {xHandle && (
        <span
          className="inline-flex items-center gap-0.5 rounded-full border border-sky-400/50 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-300"
          title={`Permanently Locked X handle: @${xHandle} (wallet address remains private)`}
        >
          𝕏 @{xHandle} 🔒
        </span>
      )}
      <span className="text-muted">
        · {rec.migratedCount} migrated / {rec.totalLaunched} {compact ? 'launched' : rec.totalLaunched === 1 ? 'launch' : 'launches'}
      </span>
    </div>
  )
}

export function Progress({ coin }: { coin: Coin }) {
  const p = progress(coin.curve)
  return (
    <div>
      <div className="progress-track">
        <div
          className={coin.curve.graduated ? 'progress-fill-graduated' : 'progress-fill'}
          style={{ width: `${(p * 100).toFixed(1)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted num-stat">
        {fmtNum(coin.curve.reservePls)} of {fmtNum(GRAD_PLS)} PLS · {(p * 100).toFixed(0)}%
      </p>
    </div>
  )
}

export function StatusBadge({ coin }: { coin: Coin }) {
  return (
    <>
      {coin.devPick && (
        <Badge tone="up">🛡️ @{PLATFORM_USERNAME} Pick</Badge>
      )}
      {coin.adBoosted && (
        <Badge tone="warn">📣 Ad Campaign · 500x Boost</Badge>
      )}
      {coin.curve.graduated ? (
        <Badge tone="up">Migrated · PulseX &amp; DexScreener (LP locked forever)</Badge>
      ) : (
        <Badge>Trading</Badge>
      )}
      {coin.dexPrepaid && (
        <Badge tone={coin.curve.graduated ? 'warn' : 'up'}>
          {coin.curve.graduated ? '⚡ DEX Enhanced + 30x Boost' : '🦅 DEX Pre-Paid ($299)'}
        </Badge>
      )}
    </>
  )
}

export function CoinCard({ coin }: { coin: Coin }) {
  const { plsUsd, lastLiveEvent } = useStore()
  const tilt = useTilt<HTMLAnchorElement>(6)
  const usdRate = plsUsd || PLS_USD
  const currentMcap = mcapUsd(coin.curve, usdRate)
  const firstOpen = coin.candles[0]?.o ?? currentMcap
  const changePct = firstOpen > 0 ? ((currentMcap - firstOpen) / firstOpen) * 100 : 0
  const volumePls = coin.trades.reduce((sum, t) => sum + t.pls, 0)
  const holderCount = Object.values(coin.holders).filter((v) => v > 1e-6).length
  const isFlashing = lastLiveEvent?.ticker === coin.ticker
  const flashClass = isFlashing
    ? lastLiveEvent?.kind === 'sell'
      ? 'border-down shadow-[0_0_24px_rgba(255,92,122,0.25)]'
      : 'border-up shadow-[0_0_24px_rgba(61,220,151,0.25)]'
    : ''

  return (
    <div className="coin-card-wrap h-full">
      <div
        aria-hidden="true"
        className={`coin-card-glow ${coin.curve.graduated ? 'coin-card-glow-graduated' : ''}`}
      />
      <Link
        ref={tilt.ref}
        onPointerMove={tilt.onPointerMove}
        onPointerLeave={tilt.onPointerLeave}
        to={`/coin/${coin.ticker}`}
        className={`card coin-card-surface !p-0 overflow-hidden h-full flex flex-col ${flashClass}`}
      >
        <div className="relative h-24 w-full overflow-hidden border-b border-[var(--color-edge)] shrink-0">
          <CoinBanner ticker={coin.ticker} bannerUrl={coin.bannerUrl} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface/90 via-surface/20 to-transparent" />
        </div>
        <div className="p-5 pt-0 flex-1 flex flex-col">
          <div className="-mt-7 flex items-end justify-between gap-3 relative z-10">
            <div className="flex items-end gap-3 min-w-0">
              <CoinLogo
                ticker={coin.ticker}
                logoUrl={coin.logoUrl}
                className="h-14 w-14 rounded-2xl border-2 border-surface ring-1 ring-violet/60 shadow-[var(--shadow-depth)]"
              />
              <div className="pb-0.5 min-w-0">
                <p className="text-xs font-semibold text-violet-soft truncate">${coin.ticker}</p>
                <h3 className="font-display text-xl leading-tight truncate">{coin.name}</h3>
              </div>
            </div>
            <div className="text-right pb-0.5 shrink-0">
              <p className="text-xs text-muted">Market cap</p>
              <p className="text-lg leading-tight num-stat">{fmtUsd(currentMcap)}</p>
              <p className={`text-xs num-stat ${changePct >= 0 ? 'text-up' : 'text-down'}`}>
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="mt-3">
            <DevInfoLine launcher={coin.launcher} compact />
          </div>
          <p className="mt-2 text-sm text-muted line-clamp-2 min-h-[2.5rem]">{coin.story}</p>
          <div className="mt-auto pt-4">
            <Progress coin={coin} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted border-t border-[var(--color-edge)] pt-2.5">
              <span>
                Vol: <strong className="text-fg num-stat">{fmtNum(volumePls)} PLS</strong>
              </span>
              <span
                className="text-up font-medium"
                title="0.50% of all curve trades accumulate for holders & unlock at 200M PLS migration!"
              >
                🎁 Holder Pool: <strong className="num-stat">{fmtNum(coin.holderRewardPoolPls ?? volumePls * 0.005)} PLS</strong>
              </span>
              <span>
                Holders: <strong className="text-fg num-stat">{holderCount}</strong>
              </span>
            </div>
            <div className="mt-2.5">
              <CoinTransparencyBadges coin={coin} compact />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <StatusBadge coin={coin} />
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}

export function PageHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="font-display mt-1 text-3xl sm:text-4xl">{title}</h1>
      {sub && <p className="mt-3 max-w-2xl text-muted">{sub}</p>}
    </div>
  )
}
