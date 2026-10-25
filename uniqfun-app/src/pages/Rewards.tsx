import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLS_USD } from '../config'
import { fmtNum, fmtUsd } from '../lib/model'
import {
  HARVEST_THRESHOLD_PLS,
  claimUserMigrationRewards,
  computeUserRewards,
  getProtocolStats,
  useStore,
} from '../state/store'
import { Badge, CoinLogo, HolderTierBadge, Notice, PageHead } from '../components/ui'

export const LOGGED_OUT_REWARDS_PROMPT = 'Connect wallet to see your rewards'

export function resolveRewardsUsername(user: { name: string } | null | undefined): string | null {
  return user?.name ?? null
}

export function FeeBreakdownSection() {
  const s = useStore()
  const proto = getProtocolStats(s)
  const [openParty, setOpenParty] = useState<'holders' | 'creators' | 'platform' | null>(null)
  const [fullOpen, setFullOpen] = useState(false)

  const totalFeesPls = Math.max(1, proto.totalFeesPaidPls)
  const splitBarTotalPls = Math.max(
    1,
    proto.totalHolderRewardsPls + proto.totalDevRewardsPls + proto.platformDevRevenuePls
  )

  const holdersPct = (proto.totalHolderRewardsPls / totalFeesPls) * 100
  const creatorsPct = (proto.totalDevRewardsPls / totalFeesPls) * 100
  const platformPct = (proto.platformDevRevenuePls / totalFeesPls) * 100

  const holdersWidthPct = (proto.totalHolderRewardsPls / splitBarTotalPls) * 100
  const creatorsWidthPct = (proto.totalDevRewardsPls / splitBarTotalPls) * 100
  const platformWidthPct = (proto.platformDevRevenuePls / splitBarTotalPls) * 100

  const rows: Array<{
    key: 'holders' | 'creators' | 'platform'
    name: string
    dotColor: string
    textColor: string
    usd: number
    pls: number
    description: string
    sources: Array<{ label: string; pls: number }>
  }> = [
    {
      key: 'holders',
      name: 'Holders',
      dotColor: '#3ddc97',
      textColor: 'text-up',
      usd: proto.totalHolderRewardsUsd,
      pls: proto.totalHolderRewardsPls,
      description:
        'Holders get 0.50% of every curve trade, 1.5M PLS at each migration, and 40% of PulseX LP fees.',
      sources: [
        { label: 'Curve fees', pls: proto.holderCurvePls },
        { label: 'Migration', pls: proto.holderMigrationPls },
        { label: 'PulseX LP fees', pls: proto.holderLpPls },
      ],
    },
    {
      key: 'creators',
      name: 'Creators',
      dotColor: '#fbbf24',
      textColor: 'text-amber-300',
      usd: proto.totalDevRewardsUsd,
      pls: proto.totalDevRewardsPls,
      description:
        'Creators get 0.25% of every curve trade, 0.5M PLS at each migration, and 20% of PulseX LP fees.',
      sources: [
        { label: 'Curve fees', pls: proto.creatorCurvePls },
        { label: 'Migration', pls: proto.creatorMigrationPls },
        { label: 'PulseX LP fees', pls: proto.creatorLpPls },
      ],
    },
    {
      key: 'platform',
      name: 'Platform',
      dotColor: '#29E8F4',
      textColor: 'text-cyan-300',
      usd: proto.platformDevRevenueUsd,
      pls: proto.platformDevRevenuePls,
      description:
        'Platform gets 0.50% of every curve trade, 2M PLS at each migration, 40% of PulseX LP fees, and launch fees.',
      sources: [
        { label: 'Curve fees', pls: proto.platformCurvePls },
        { label: 'Migration', pls: proto.platformMigrationPls },
        { label: 'PulseX LP fees', pls: proto.platformLpPls },
        { label: 'Launch fees', pls: proto.platformLaunchPls },
      ],
    },
  ]

  return (
    <section className="card grid gap-5" data-testid="fee-breakdown-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl text-fg">Fee breakdown</h2>
      </div>

      {/* Top of card: one big number "Total fees collected" (USD, with PLS below in small muted text) */}
      <div>
        <p className="text-xs text-muted">Total fees collected</p>
        <p
          className="mt-1 font-display text-3xl sm:text-4xl text-fg num-stat whitespace-nowrap"
          data-testid="total-fees-collected-usd"
        >
          {fmtUsd(proto.totalFeesPaidUsd)}
        </p>
        <p className="mt-0.5 text-xs text-muted num-stat whitespace-nowrap" data-testid="total-fees-collected-pls">
          {fmtNum(proto.totalFeesPaidPls)} PLS
        </p>
      </div>

      {/* Horizontal split bar showing Holders / Creators / Platform shares in their colors + % under each segment */}
      <div className="grid gap-1.5" data-testid="fee-split-bar">
        <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-[var(--color-bg-deep)] border border-[var(--color-edge)]">
          <div
            style={{ width: `${holdersWidthPct}%`, backgroundColor: '#3ddc97' }}
            title={`Holders: ${holdersPct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${creatorsWidthPct}%`, backgroundColor: '#fbbf24' }}
            title={`Creators: ${creatorsPct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${platformWidthPct}%`, backgroundColor: '#29E8F4' }}
            title={`Platform: ${platformPct.toFixed(1)}%`}
          />
        </div>
        <div className="flex w-full text-[11px] text-muted num-stat">
          <div style={{ width: `${holdersWidthPct}%` }} className="min-w-[44px] text-left text-up whitespace-nowrap">
            {holdersPct.toFixed(1)}%
          </div>
          <div
            style={{ width: `${creatorsWidthPct}%` }}
            className="min-w-[44px] text-center text-amber-300 whitespace-nowrap"
          >
            {creatorsPct.toFixed(1)}%
          </div>
          <div
            style={{ width: `${platformWidthPct}%` }}
            className="min-w-[44px] text-right text-cyan-300 whitespace-nowrap"
          >
            {platformPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 3 simple click-to-expand rows: Holders, Creators, Platform */}
      <div className="divide-y divide-[var(--color-edge)] border-y border-[var(--color-edge)]">
        {rows.map((row) => {
          const isOpen = openParty === row.key
          return (
            <div key={row.key} data-testid={`fee-row-${row.key}`}>
              <button
                type="button"
                onClick={() => setOpenParty((prev) => (prev === row.key ? null : row.key))}
                aria-expanded={isOpen}
                data-testid={`fee-row-toggle-${row.key}`}
                className="w-full py-3.5 px-1 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: row.dotColor }}
                  />
                  <span className="font-medium text-sm sm:text-base text-fg">{row.name}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-right">
                    <span className="block font-display text-base sm:text-lg text-fg num-stat whitespace-nowrap">
                      {fmtUsd(row.usd)}
                    </span>
                    <span className="block text-xs text-muted num-stat whitespace-nowrap">
                      {fmtNum(row.pls)} PLS
                    </span>
                  </span>
                  <span
                    className={`text-xs text-muted transition-transform duration-150 inline-block ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </span>
              </button>

              {isOpen && (
                <div
                  className="pb-3.5 pt-1 px-1 sm:px-3 grid gap-2.5 text-xs"
                  data-testid={`fee-row-details-${row.key}`}
                >
                  <p className="text-muted leading-relaxed">{row.description}</p>
                  <ul className="inset-panel p-3 grid gap-1.5 text-xs num-stat">
                    {row.sources.map((src) => (
                      <li key={src.label} className="flex items-center justify-between gap-2">
                        <span className="text-muted">{src.label}</span>
                        <span className="text-fg whitespace-nowrap">{fmtNum(src.pls)} PLS</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Small "See full breakdown ▾" link expanding Pending LP fees, volumes, and fee rules */}
      <div className="grid gap-3">
        <div>
          <button
            type="button"
            onClick={() => setFullOpen((v) => !v)}
            aria-expanded={fullOpen}
            data-testid="see-full-breakdown-toggle"
            className="text-xs text-muted hover:text-fg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>See full breakdown</span>
            <span
              className={`inline-block transition-transform duration-150 ${fullOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
        </div>

        {fullOpen && (
          <div className="inset-panel p-3.5 grid gap-3 text-xs" data-testid="full-breakdown-panel">
            <ul className="grid gap-2 divide-y divide-[var(--color-edge)] num-stat">
              <li className="flex items-center justify-between gap-3 pb-2">
                <span className="text-muted">Pending LP fees (not yet split)</span>
                <span className="text-right whitespace-nowrap">
                  <span className="text-fg font-medium">{fmtUsd(proto.pendingLpFeesUsd)}</span>
                  <span className="text-muted ml-1.5">({fmtNum(proto.pendingLpFeesPls)} PLS)</span>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-muted">Curve volume</span>
                <span className="text-right whitespace-nowrap">
                  <span className="text-fg font-medium">{fmtUsd(proto.curveVolumeUsd)}</span>
                  <span className="text-muted ml-1.5">({fmtNum(proto.curveVolumePls)} PLS)</span>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-muted">PulseX volume</span>
                <span className="text-right whitespace-nowrap">
                  <span className="text-fg font-medium">{fmtUsd(proto.pulsexVolumeUsd)}</span>
                  <span className="text-muted ml-1.5">({fmtNum(proto.pulsexVolumePls)} PLS)</span>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-muted">All-time volume</span>
                <span className="text-right whitespace-nowrap">
                  <span className="text-fg font-medium">{fmtUsd(proto.allTimeVolumeUsd)}</span>
                  <span className="text-muted ml-1.5">({fmtNum(proto.allTimeVolumePls)} PLS)</span>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 pt-2">
                <span className="text-muted">24h volume</span>
                <span className="text-right whitespace-nowrap">
                  <span className="text-fg font-medium">{fmtUsd(proto.dailyVolumeUsd)}</span>
                  <span className="text-muted ml-1.5">({fmtNum(proto.dailyVolumePls)} PLS)</span>
                </span>
              </li>
            </ul>

            <p className="border-t border-[var(--color-edge)] pt-2.5 text-xs text-muted leading-relaxed">
              Curve trades: 1.25% fee → 0.50% holders · 0.25% creator · 0.50% platform. At 200M PLS migration: 4M PLS → 1.5M holders · 0.5M creator · 2M platform. After migration: PulseX LP fees (0.22%) → 40% holders · 20% creator · 40% platform.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export default function Rewards() {
  const s = useStore()
  const usdRate = s.plsUsd || PLS_USD
  const username = resolveRewardsUsername(s.username)
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const summary = useMemo(
    () => (username ? computeUserRewards(username, s.coins) : null),
    [username, s.coins]
  )

  const holderRows = useMemo(
    () =>
      summary
        ? summary.items.filter(
            (it) =>
              it.userTokens > 1e-4 ||
              it.userHolderRewardPls > 1e-4 ||
              it.holderAlreadyClaimedPls > 1e-4 ||
              Boolean(it.forfeited)
          )
        : [],
    [summary]
  )

  const creatorRows = useMemo(
    () => (summary ? summary.items.filter((it) => it.isCreator) : []),
    [summary]
  )

  if (!username || !summary) {
    return (
      <div className="max-w-5xl mx-auto grid gap-6">
        <PageHead
          eyebrow="RewardsRouter · One-Tx Harvest & Payout"
          title="Holder & Creator Rewards"
          sub="View and claim your 0.50% Holder Pool and 0.25% Creator Pool rewards in one transaction."
        />
        <div className="card p-8 text-center grid gap-3">
          <p className="font-display text-2xl text-fg">{LOGGED_OUT_REWARDS_PROMPT}</p>
          <p className="text-xs text-muted">
            Connect your PulseChain wallet and claim your @username to view your claimable and locked rewards.
          </p>
          <div className="pt-2">
            <Link to="/pass" className="btn-primary">
              Connect wallet
            </Link>
          </div>
        </div>

        <FeeBreakdownSection />
      </div>
    )
  }

  function handleClaimAll() {
    const r = claimUserMigrationRewards({ role: 'all' })
    setMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Claimed all rewards!' })
  }

  return (
    <div className="max-w-5xl mx-auto grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHead
          eyebrow="RewardsRouter · One-Tx Harvest & Payout"
          title="Holder & Creator Rewards"
          sub={`Aggregated PLS rewards across all coins for @${username}. "Claim all" harvests eligible vaults and pays your holder + creator rewards in one transaction.`}
        />
        <Link to={`/u/${username}`} className="btn-ghost !py-2 !px-4 text-xs">
          ← Back to @{username} Profile
        </Link>
      </div>

      {/* Top Summary Bar: "Total claimable: X PLS ($Y)" + prominent "Claim all" button */}
      <div className="card border-up/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-up">
              RewardsRouter.claimAll(coins[])
            </span>
            <HolderTierBadge username={username} />
          </div>
          <p className="font-display text-2xl sm:text-3xl text-fg mt-1">
            Total claimable:{' '}
            <span className="grad-up-text num-stat">
              {fmtNum(summary.totalClaimablePls)} PLS ({fmtUsd(summary.totalClaimablePls * usdRate)})
            </span>
          </p>
          <p className="text-xs text-muted mt-1 num-stat">
            Locked until migration: <strong className="text-amber-300">{fmtNum(summary.totalPendingLockedPls)} PLS</strong>{' '}
            ({fmtUsd(summary.totalPendingLockedPls * usdRate)}) &nbsp;·&nbsp; Already claimed:{' '}
            <strong className="text-fg">{fmtNum(summary.totalAlreadyClaimedPls)} PLS</strong>
          </p>
        </div>

        <button
          type="button"
          disabled={summary.totalClaimablePls <= 1e-4}
          onClick={handleClaimAll}
          className="claim-all-btn"
        >
          Claim all
        </button>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {/* Section 1: Holder Rewards */}
      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-edge)] pb-3">
          <div>
            <h2 className="font-display text-xl text-fg">💎 Holder Rewards (0.50% Curve + Bond + Post-Migration LP)</h2>
            <p className="text-xs text-muted">
              One row per coin. Sell any amount before migration and you forfeit all your unclaimed rewards on that coin; migrated coins are claimable anytime.
            </p>
          </div>
        </div>

        {holderRows.length === 0 ? (
          <p className="text-sm text-muted py-4">No holder reward positions yet.</p>
        ) : (
          <div className="inset-panel p-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted border-b border-[var(--color-edge)]">
                <tr>
                  <th className="py-2.5 px-2">Coin</th>
                  <th className="py-2.5 px-2 text-right">Your holder rewards</th>
                  <th className="py-2.5 px-2 text-right">Status</th>
                  <th className="py-2.5 px-2 text-right">Vault harvest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-edge)]">
                {holderRows.map((it) => {
                  const coinObj = s.coins.find((c) => c.ticker === it.ticker)
                  const isForfeited = Boolean(it.forfeited)
                  const isClaimable = it.graduated && !isForfeited && it.holderClaimableNowPls > 1e-4
                  const isLocked = !it.graduated && !isForfeited && it.holderLockedPendingPls > 1e-4

                  const displayPls = isForfeited
                    ? it.forfeitedPls ?? 0
                    : it.graduated
                    ? it.holderClaimableNowPls
                    : it.holderLockedPendingPls

                  return (
                    <tr key={it.ticker}>
                      <td className="py-3 px-2">
                        <Link
                          to={`/coin/${it.ticker}`}
                          className="inline-flex items-center gap-2.5 font-semibold text-fg hover:text-violet-soft"
                        >
                          <CoinLogo ticker={it.ticker} logoUrl={coinObj?.logoUrl} className="h-7 w-7 rounded-lg" />
                          <div>
                            <div>
                              ${it.ticker} <span className="text-xs font-normal text-muted">({it.coinName})</span>
                            </div>
                            <div className="text-[11px] font-normal text-muted num-stat">
                              Held: {fmtNum(it.userTokens)} ({it.sharePct.toFixed(2)}% pool share)
                            </div>
                          </div>
                        </Link>
                      </td>

                      <td className="py-3 px-2 text-right text-xs num-stat">
                        <div className={isForfeited ? 'text-muted line-through' : 'font-bold text-fg'}>
                          {fmtNum(displayPls)} PLS
                        </div>
                        <div className="text-[11px] text-muted">{fmtUsd(displayPls * usdRate)}</div>
                      </td>

                      <td className="py-3 px-2 text-right">
                        {isForfeited ? (
                          <Badge tone="down">Forfeited</Badge>
                        ) : isClaimable ? (
                          <Badge tone="up">Claimable</Badge>
                        ) : isLocked ? (
                          <Badge tone="warn">Locked until migration</Badge>
                        ) : (
                          <Badge tone="muted">Claimed</Badge>
                        )}
                      </td>

                      <td className="py-3 px-2 text-right text-xs">
                        <span className="text-[11px] text-muted num-stat">
                          {isClaimable
                            ? 'Included in Claim all'
                            : `Next harvest when fees reach ${fmtNum(it.nextHarvestThresholdPls ?? HARVEST_THRESHOLD_PLS)} PLS`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2: Creator Section (same columns, included in Claim all) */}
      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-edge)] pb-3">
          <div>
            <h2 className="font-display text-xl text-fg">👑 Creator Rewards (Coins Launched by @{username})</h2>
            <p className="text-xs text-muted">
              0.25% Curve + 500,000 PLS Graduation Bonus + Post-Migration Creator LP Fees. Included automatically in &ldquo;Claim all&rdquo;.
            </p>
          </div>
        </div>

        {creatorRows.length === 0 ? (
          <p className="text-sm text-muted py-4">
            You haven&apos;t launched a coin yet.{' '}
            <Link to="/launch" className="text-violet-soft underline">
              Launch a coin
            </Link>{' '}
            to earn 0.25% creator rewards on every trade.
          </p>
        ) : (
          <div className="inset-panel p-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted border-b border-[var(--color-edge)]">
                <tr>
                  <th className="py-2.5 px-2">Coin</th>
                  <th className="py-2.5 px-2 text-right">Your creator rewards</th>
                  <th className="py-2.5 px-2 text-right">Status</th>
                  <th className="py-2.5 px-2 text-right">Vault harvest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-edge)]">
                {creatorRows.map((it) => {
                  const coinObj = s.coins.find((c) => c.ticker === it.ticker)
                  const isClaimable = it.graduated && it.creatorClaimableNowPls > 1e-4
                  const isLocked = !it.graduated && it.creatorLockedPendingPls > 1e-4
                  const displayPls = it.graduated ? it.creatorClaimableNowPls : it.creatorLockedPendingPls

                  return (
                    <tr key={it.ticker}>
                      <td className="py-3 px-2">
                        <Link
                          to={`/coin/${it.ticker}`}
                          className="inline-flex items-center gap-2.5 font-semibold text-fg hover:text-violet-soft"
                        >
                          <CoinLogo ticker={it.ticker} logoUrl={coinObj?.logoUrl} className="h-7 w-7 rounded-lg" />
                          <div>
                            <div>
                              ${it.ticker} <span className="text-xs font-normal text-muted">({it.coinName})</span>
                            </div>
                            <div className="text-[11px] font-normal text-muted num-stat">
                              Creator Pool: {fmtNum(it.creatorRewardPls)} PLS total
                            </div>
                          </div>
                        </Link>
                      </td>

                      <td className="py-3 px-2 text-right text-xs num-stat">
                        <div className="font-bold text-fg">{fmtNum(displayPls)} PLS</div>
                        <div className="text-[11px] text-muted">{fmtUsd(displayPls * usdRate)}</div>
                      </td>

                      <td className="py-3 px-2 text-right">
                        {isClaimable ? (
                          <Badge tone="up">Claimable</Badge>
                        ) : isLocked ? (
                          <Badge tone="warn">Locked until migration</Badge>
                        ) : (
                          <Badge tone="muted">Claimed</Badge>
                        )}
                      </td>

                      <td className="py-3 px-2 text-right text-xs">
                        <span className="text-[11px] text-muted num-stat">
                          {isClaimable
                            ? 'Included in Claim all'
                            : `Next harvest when fees reach ${fmtNum(it.nextHarvestThresholdPls ?? HARVEST_THRESHOLD_PLS)} PLS`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Where the fees go / Fee breakdown (visible to everyone) */}
      <FeeBreakdownSection />
    </div>
  )
}
