import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLATFORM_USERNAME, PLS_USD } from '../config'
import { GRAD_PLS, fmtNum, fmtUsd, mcapUsd, progress } from '../lib/model'
import { computeUserRewards, getProtocolStats, useStore } from '../state/store'
import { Shield } from '../components/Logo'
import { CoinCard, CoinLogo, DevInfoLine, HolderTierBadge, PlatformDevBadge, getDevRecord } from '../components/ui'

type BoardTab = 'trending' | 'newest' | 'graduating' | 'graduated' | 'dexpaid' | 'leaderboard'

const TAB_LABELS: Record<BoardTab, string> = {
  trending: 'Trending',
  newest: 'Newest',
  graduating: 'Graduating',
  graduated: 'Migrated to PulseX',
  dexpaid: 'DEX Paid',
  leaderboard: 'Top Rewards',
}

export default function Home() {
  const storeState = useStore()
  const { coins, plsUsd, registry, verifiedX, username } = storeState
  const usdRate = plsUsd || PLS_USD
  const proto = getProtocolStats(storeState)
  const [tab, setTab] = useState<BoardTab>('trending')
  const [search, setSearch] = useState('')

  // King of the Hill: highest curve.reservePls among non-migrated coins
  // (tie: higher mcap; if all migrated, highest mcap)
  const kingCoin = useMemo(() => {
    if (coins.length === 0) return undefined
    const nonMigrated = coins.filter((c) => !c.curve.graduated)
    if (nonMigrated.length > 0) {
      return [...nonMigrated].sort((a, b) => {
        if (b.curve.reservePls !== a.curve.reservePls) {
          return b.curve.reservePls - a.curve.reservePls
        }
        return mcapUsd(b.curve, usdRate) - mcapUsd(a.curve, usdRate)
      })[0]
    }
    return [...coins].sort((a, b) => mcapUsd(b.curve, usdRate) - mcapUsd(a.curve, usdRate))[0]
  }, [coins, usdRate])

  const migratedCount = useMemo(() => coins.filter((c) => c.curve.graduated).length, [coins])

  const filteredCoins = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = coins.filter(
      (c) =>
        !q ||
        c.ticker.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.launcher.toLowerCase().includes(q)
    )
    if (tab === 'newest') return [...list].sort((a, b) => b.createdAt - a.createdAt)
    if (tab === 'graduating') {
      return [...list]
        .filter((c) => !c.curve.graduated)
        .sort((a, b) => b.curve.reservePls - a.curve.reservePls)
    }
    if (tab === 'graduated') return list.filter((c) => c.curve.graduated)
    if (tab === 'dexpaid') return list.filter((c) => c.dexPrepaid)
    return [...list].sort((a, b) => {
      if (Boolean(a.devPick) !== Boolean(b.devPick)) return a.devPick ? -1 : 1
      const va = a.trades.reduce((s, t) => s + t.pls, 0) + a.curve.reservePls
      const vb = b.trades.reduce((s, t) => s + t.pls, 0) + b.curve.reservePls
      return vb - va
    })
  }, [coins, search, tab])

  // Top Rewards Leaderboard (Holders + Creators ranked by total PLS/USD rewards earned)
  const leaderboard = useMemo(() => {
    const set = new Set<string>()
    if (username?.name) set.add(username.name)
    for (const r of registry) set.add(r.name)
    for (const c of coins) {
      set.add(c.launcher)
      for (const u of Object.keys(c.holders)) set.add(u)
    }
    return Array.from(set)
      .filter((u) => u.toLowerCase() !== PLATFORM_USERNAME.toLowerCase())
      .map((u) => {
        const devRec = getDevRecord(u, coins)
        const rewards = computeUserRewards(u, coins)
        const holderRewardsPls = rewards.items.reduce((s, it) => s + it.userHolderRewardPls, 0)
        const creatorRewardsPls = rewards.items.reduce((s, it) => s + it.creatorRewardPls, 0)
        const totalRewardPls = holderRewardsPls + creatorRewardsPls
        const volPls = coins.reduce(
          (sum, c) =>
            sum +
            c.trades.filter((t) => t.user.toLowerCase() === u.toLowerCase()).reduce((s, t) => s + t.pls, 0),
          0
        )
        return {
          username: u,
          isPlatform: false,
          xHandle: verifiedX?.[u],
          launched: devRec.totalLaunched,
          migrated: devRec.migratedCount,
          isCrowned: devRec.isCrowned,
          tier: rewards.tier,
          holderRewardsPls,
          creatorRewardsPls,
          totalRewardPls,
          totalRewardUsd: totalRewardPls * usdRate,
          volPls,
        }
      })
      .sort((a, b) => b.totalRewardPls - a.totalRewardPls)
  }, [coins, registry, verifiedX, username?.name, usdRate])

  return (
    <div className="grid gap-6 sm:gap-8">
      {/* 1. Hero (full width) */}
      <section className="hero-conic-card">
        <div className="hero-conic-inner p-6 sm:p-8 lg:p-10 flex items-center justify-between gap-8">
          <div className="max-w-2xl">
            <span className="eyebrow">uniq.pulse · PulseChain Launchpad</span>
            <h1 className="font-display mt-3 text-4xl sm:text-5xl leading-[1.08] tracking-tight">
              Launch in seconds.{' '}
              <span className="grad-text">Holders &amp; Devs earn forever.</span>
            </h1>
            <p className="mt-4 text-sm sm:text-base text-muted leading-relaxed">
              Fresh start on PulseChain. Holders earn 0.50% of every curve trade in PLS. At 200M PLS the coin migrates to PulseX with LP locked forever.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/launch" className="btn-primary !px-6 !py-3 text-sm">
                + Start a New Coin
              </Link>
              <Link to="/uniq" className="btn-ghost !px-5 !py-3 text-sm">
                How it works
              </Link>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center shrink-0 pr-2">
            <div className="hero-float-shield">
              <Shield withHalo className="h-[176px] w-[176px]" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Stats strip (4 tiles, 2 cols mobile) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card stat-tile-edge !p-4 sm:!p-5">
          <p className="text-xs text-muted">Coins launched</p>
          <p className="mt-1 font-display text-2xl sm:text-3xl text-fg num-stat">{fmtNum(coins.length)}</p>
          <p className="mt-0.5 text-[11px] text-muted">Unique retired tickers</p>
        </div>

        <div className="card stat-tile-edge !p-4 sm:!p-5">
          <p className="text-xs text-muted">Migrated to PulseX</p>
          <p className="mt-1 font-display text-2xl sm:text-3xl text-up num-stat">{fmtNum(migratedCount)}</p>
          <p className="mt-0.5 text-[11px] text-muted">LP locked forever at 200M PLS</p>
        </div>

        <div className="card stat-tile-edge !p-4 sm:!p-5">
          <p className="text-xs text-muted">All-time volume</p>
          <p className="mt-1 font-display text-2xl sm:text-3xl text-fg num-stat">{fmtUsd(proto.allTimeVolumeUsd)}</p>
          <p className="mt-0.5 text-[11px] text-muted num-stat">{fmtNum(proto.allTimeVolumePls)} PLS</p>
        </div>

        <div className="card stat-tile-edge !p-4 sm:!p-5">
          <p className="text-xs text-muted">Paid to holders</p>
          <p className="mt-1 font-display text-2xl sm:text-3xl text-up num-stat">{fmtUsd(proto.totalHolderRewardsUsd)}</p>
          <p className="mt-0.5 text-[11px] text-muted num-stat">{fmtNum(proto.totalHolderRewardsPls)} PLS</p>
        </div>
      </section>

      {/* 3. King of the Hill (full width) */}
      {kingCoin && (() => {
        const kingPct = (progress(kingCoin.curve) * 100).toFixed(1)
        const kingVolPls = kingCoin.trades.reduce((s, tr) => s + tr.pls, 0)
        const kingHolders = Object.values(kingCoin.holders).filter((v) => v > 1e-6).length
        const kingHolderPoolPls = kingCoin.holderRewardPoolPls ?? kingVolPls * 0.005
        const kingMcapUsd = mcapUsd(kingCoin.curve, usdRate)

        return (
          <section className="grid gap-3">
            <div>
              <span className="eyebrow">King of the Hill</span>
              <h2 className="font-display mt-1 text-2xl sm:text-3xl">Closest to migration</h2>
            </div>

            <div className="card border-[#FB43BB]/60 shadow-[var(--shadow-glow)]">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                  <CoinLogo
                    ticker={kingCoin.ticker}
                    logoUrl={kingCoin.logoUrl}
                    className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-2 border-[#FB43BB]/60 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold text-white shadow-[var(--shadow-glow)]"
                        style={{ background: 'var(--grad-brand)' }}
                      >
                        👑 King of the Hill
                      </span>
                      <span className="text-xs font-bold text-violet-soft">${kingCoin.ticker}</span>
                    </div>
                    <h3 className="font-display text-2xl sm:text-3xl mt-1 truncate">{kingCoin.name}</h3>
                    <p className="text-sm text-muted line-clamp-2 mt-1">{kingCoin.story}</p>
                    <div className="mt-2">
                      <DevInfoLine launcher={kingCoin.launcher} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 shrink-0 border-t lg:border-t-0 border-[var(--color-edge)] pt-3 lg:pt-0">
                  <div className="lg:text-right">
                    <p className="text-xs uppercase tracking-wider text-muted">Market cap</p>
                    <p className="font-display text-3xl sm:text-4xl grad-text num-stat">
                      {fmtUsd(kingMcapUsd)}
                    </p>
                  </div>
                  <Link to={`/coin/${kingCoin.ticker}`} className="btn-primary !px-5 !py-2.5 text-sm">
                    Trade ${kingCoin.ticker} →
                  </Link>
                </div>
              </div>

              <div className="mt-5">
                <div className="progress-track !h-3.5">
                  <div
                    className={kingCoin.curve.graduated ? 'progress-fill-graduated' : 'progress-fill'}
                    style={{ width: `${kingPct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted num-stat">
                  <span className="font-semibold text-fg">
                    {kingPct}% to PulseX · {fmtNum(kingCoin.curve.reservePls)} of {fmtNum(GRAD_PLS)} PLS
                  </span>
                  <span>
                    {kingCoin.curve.graduated ? 'Migrated to PulseX (LP locked forever)' : 'Auto-migrates at 200,000,000 PLS'}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
                <div className="inset-panel p-3">
                  <p className="text-[11px] text-muted">Volume</p>
                  <p className="mt-0.5 text-sm sm:text-base text-fg num-stat">{fmtNum(kingVolPls)} PLS</p>
                  <p className="text-[11px] text-muted num-stat">{fmtUsd(kingVolPls * usdRate)}</p>
                </div>
                <div className="inset-panel p-3">
                  <p className="text-[11px] text-muted">Holders</p>
                  <p className="mt-0.5 text-sm sm:text-base text-fg num-stat">{fmtNum(kingHolders)}</p>
                  <p className="text-[11px] text-muted">Active wallets</p>
                </div>
                <div className="inset-panel p-3">
                  <p className="text-[11px] text-muted">Holder pool</p>
                  <p className="mt-0.5 text-sm sm:text-base text-up num-stat">{fmtNum(kingHolderPoolPls)} PLS</p>
                  <p className="text-[11px] text-muted num-stat">{fmtUsd(kingHolderPoolPls * usdRate)}</p>
                </div>
              </div>
            </div>
          </section>
        )
      })()}

      {/* 4. Explore */}
      <section className="grid gap-4">
        <div>
          <span className="eyebrow">Explore coins</span>
          <h2 className="font-display mt-1 text-2xl sm:text-3xl">{TAB_LABELS[tab]}</h2>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-edge)] pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['trending', 'Trending'],
                ['newest', 'Newest'],
                ['graduating', 'Graduating'],
                ['graduated', 'Migrated to PulseX'],
                ['dexpaid', 'DEX Paid'],
                ['leaderboard', 'Top Rewards'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition ${
                  tab === id
                    ? 'tab-pill-active'
                    : 'bg-surface/70 text-muted hover:text-fg border border-[var(--color-edge)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            className="input !py-2 !px-3.5 text-xs sm:w-64"
            placeholder="Search ticker, name, or @dev..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab !== 'leaderboard' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {filteredCoins.map((c) => (
              <CoinCard key={c.ticker} coin={c} />
            ))}
          </div>
        )}
      </section>

      {/* 5. Leaderboard (stays at the bottom; Platform Dev Profile link removed from header) */}
      <section className="card overflow-hidden !p-0">
        <div className="p-4 sm:p-5 border-b border-[var(--color-edge)]">
          <h2 className="font-display text-lg sm:text-xl">🏆 Top Holder &amp; Creator Rewards Leaderboard</h2>
          <p className="text-xs text-muted mt-0.5">
            Live 0.50% Holder Pool + 0.25% Creator Pool rewards earned across curve &amp; migrated PulseX volume.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg/60 text-left text-xs text-muted border-b border-[var(--color-edge)]">
              <tr>
                <th className="py-2.5 px-4">#</th>
                <th className="py-2.5 px-4">@Username</th>
                <th className="py-2.5 px-4">Tier Badge</th>
                <th className="py-2.5 px-4 text-right">💎 Holder Rewards (0.50%)</th>
                <th className="py-2.5 px-4 text-right">👑 Dev Rewards (0.25%)</th>
                <th className="py-2.5 px-4 text-right">Total Rewards (USD / PLS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-edge)]">
              {leaderboard.slice(0, 12).map((u, idx) => (
                <tr key={u.username} className="hover:bg-raised/40 transition">
                  <td className="py-2.5 px-4 text-xs text-muted num-stat">{idx + 1}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link to={`/u/${u.username}`} className="font-semibold text-fg hover:text-violet-soft underline">
                        {u.isCrowned ? `👑 @${u.username}` : `@${u.username}`}
                      </Link>
                      {u.isPlatform && <PlatformDevBadge compact />}
                      {u.xHandle && (
                        <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-300">
                          𝕏 @{u.xHandle}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <HolderTierBadge username={u.username} compact />
                  </td>
                  <td className="py-2.5 px-4 text-right text-xs text-up num-stat">
                    {fmtUsd(u.holderRewardsPls * usdRate)} ({fmtNum(u.holderRewardsPls)} PLS)
                  </td>
                  <td className="py-2.5 px-4 text-right text-xs text-amber-300 num-stat">
                    {u.creatorRewardsPls > 0
                      ? `${fmtUsd(u.creatorRewardsPls * usdRate)} (${fmtNum(u.creatorRewardsPls)} PLS)`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right num-stat">
                    <span className="font-bold text-up">{fmtUsd(u.totalRewardUsd)}</span>
                    <span className="ml-1.5 text-xs text-muted">({fmtNum(u.totalRewardPls)} PLS)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
