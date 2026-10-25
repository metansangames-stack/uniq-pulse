import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { PLATFORM_USERNAME, PLATFORM_WALLET, PLS_USD } from '../config'
import { TOTAL_SUPPLY, fmtNum, fmtPrice, fmtUsd, mcapUsd, pricePls } from '../lib/model'
import { isValidChecksumAddress, short } from '../lib/wallets'
import { computeUserPnlAndHoldProfile, fmtHoldDuration } from '../lib/pnl'
import { computeDevScore } from '../lib/reputation'
import {
  RESERVED_FOLLOW_ACCOUNTS,
  claimPlatformDevVaultRewards,
  compressProfileImageFile,
  computeUserRewards,
  followUser,
  getFollowerCount,
  getFollowing,
  getFollowingCount,
  getPlatformDevVaultStatus,
  getProtocolStats,
  getUserAvatarUrl,
  getXVerificationCode,
  isDevModeActive,
  isFollowing,
  loginAsPersonalWallet,
  loginAsPlatformDev,
  logoutUser,
  resetDemo,
  unfollowUser,
  updateUserProfileCustomization,
  useStore,
  validateProfileImageUrl,
  verifyUserXHandleWithTweet,
  type Coin,
} from '../state/store'
import { Badge, CoinCard, CoinLogo, HolderTierBadge, Notice, PageHead, PlatformDevBadge, getDevRecord } from '../components/ui'

export interface ComputedUserStats {
  username: string
  isMe: boolean
  isPlatform: boolean
  isCrowned: boolean
  launchedCount: number
  migratedCount: number
  gradRatePct: number
  creatorEcosystemMcapUsd: number
  launchedCoins: Coin[]
  holdings: Array<{
    coin: Coin
    tokens: number
    supplyPct: number
    valuePls: number
    valueUsd: number
    curveSpentPls: number
  }>
  totalPortfolioPls: number
  totalPortfolioUsd: number
  trades: Array<{
    ticker: string
    coinName: string
    t: number
    side: 'buy' | 'sell'
    tokens: number
    pls: number
    usd: number
  }>
  totalVolumePls: number
  totalVolumeUsd: number
  buyCount: number
  sellCount: number
}

export function computeUserStats(
  targetUser: string,
  coins: Coin[],
  usdRate: number,
  currentUsername?: string | null
): ComputedUserStats {
  const clean = targetUser.replace(/^@/, '')
  const devRec = getDevRecord(clean, coins)
  const launchedCount = devRec.totalLaunched
  const migratedCount = devRec.migratedCount
  const gradRatePct = launchedCount > 0 ? (migratedCount / launchedCount) * 100 : 0
  const creatorEcosystemMcapUsd = devRec.launchedCoins.reduce((sum, c) => sum + mcapUsd(c.curve, usdRate), 0)

  const holdings: ComputedUserStats['holdings'] = []
  const trades: ComputedUserStats['trades'] = []

  for (const c of coins) {
    const held = c.holders[clean] ?? 0
    const spent = c.openingSpent[clean] ?? 0
    if (held > 1e-4) {
      const valPls = held * pricePls(c.curve)
      holdings.push({
        coin: c,
        tokens: held,
        supplyPct: (held / TOTAL_SUPPLY) * 100,
        valuePls: valPls,
        valueUsd: valPls * usdRate,
        curveSpentPls: spent,
      })
    }
    for (const tr of c.trades) {
      if (tr.user.toLowerCase() === clean.toLowerCase()) {
        trades.push({
          ticker: c.ticker,
          coinName: c.name,
          t: tr.t,
          side: tr.side,
          tokens: tr.tokens,
          pls: tr.pls,
          usd: tr.pls * usdRate,
        })
      }
    }
  }

  holdings.sort((a, b) => b.valuePls - a.valuePls)
  trades.sort((a, b) => b.t - a.t)

  const totalPortfolioPls = holdings.reduce((s, h) => s + h.valuePls, 0)
  const totalPortfolioUsd = totalPortfolioPls * usdRate
  const totalVolumePls = trades.reduce((s, t) => s + t.pls, 0)
  const totalVolumeUsd = totalVolumePls * usdRate
  const buyCount = trades.filter((t) => t.side === 'buy').length
  const sellCount = trades.filter((t) => t.side === 'sell').length

  return {
    username: clean,
    isMe: Boolean(currentUsername && currentUsername.toLowerCase() === clean.toLowerCase()),
    isPlatform: clean.toLowerCase() === PLATFORM_USERNAME.toLowerCase(),
    isCrowned: devRec.isCrowned,
    launchedCount,
    migratedCount,
    gradRatePct,
    creatorEcosystemMcapUsd,
    launchedCoins: devRec.launchedCoins,
    holdings,
    totalPortfolioPls,
    totalPortfolioUsd,
    trades,
    totalVolumePls,
    totalVolumeUsd,
    buyCount,
    sellCount,
  }
}

export function FollowUserButton({
  targetUsername,
  compact = false,
}: {
  targetUsername: string
  compact?: boolean
}) {
  const s = useStore()
  const clean = targetUsername.replace(/^@/, '').trim().toLowerCase()
  const isMe = Boolean(s.username && s.username.name.toLowerCase() === clean)
  if (!clean || isMe || RESERVED_FOLLOW_ACCOUNTS.has(clean)) return null

  const hasWallet = Boolean(s.username?.wallet || s.evm)
  const following = isFollowing(clean, s)

  if (!hasWallet) {
    return (
      <Link
        to="/pass"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center rounded-full border border-violet/60 bg-violet/15 font-semibold text-violet-soft hover:bg-violet/25 transition ${
          compact ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
        }`}
      >
        Connect wallet to follow
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (following) {
          unfollowUser(clean)
        } else {
          followUser(clean)
        }
      }}
      className={`inline-flex items-center gap-1 rounded-full border font-bold transition ${
        compact ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      } ${
        following
          ? 'border-up/60 bg-up/15 text-up hover:bg-down/15 hover:border-down/60 hover:text-down'
          : 'border-violet bg-violet/20 text-fg hover:bg-violet hover:text-white'
      }`}
    >
      {following ? 'Following ✓' : 'Follow'}
    </button>
  )
}

export function UsersDirectoryPage() {
  const s = useStore()
  const usdRate = s.plsUsd || PLS_USD
  const [userSearch, setUserSearch] = useState('')
  const [userFilter, setUserFilter] = useState<'all' | 'following' | 'conviction' | 'flippers' | 'crowned' | 'holders' | 'xverified'>('all')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const followingSet = useMemo(() => new Set(getFollowing(s).map((u) => u.toLowerCase())), [s])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const allUsernames = useMemo(() => {
    const set = new Set<string>([PLATFORM_USERNAME])
    if (s.username?.name) set.add(s.username.name)
    for (const r of s.registry) set.add(r.name)
    for (const c of s.coins) {
      set.add(c.launcher)
      for (const u of Object.keys(c.holders)) set.add(u)
    }
    return Array.from(set)
      .map((u) => {
        const st = computeUserStats(u, s.coins, usdRate, s.username?.name)
        const rw = computeUserRewards(u, s.coins)
        const pnl = computeUserPnlAndHoldProfile(u, s.coins, usdRate, nowMs)
        const totalRewardsPls = rw.totalClaimablePls + rw.totalPendingLockedPls + rw.totalAlreadyClaimedPls
        return {
          ...st,
          tier: rw.tier,
          totalRewardsPls,
          totalRewardsUsd: totalRewardsPls * usdRate,
          xHandle: s.verifiedX?.[u],
          pnl,
        }
      })
      .sort((a, b) => {
        if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
        if (a.isPlatform !== b.isPlatform) return a.isPlatform ? -1 : 1
        if (b.pnl.totalPnlUsd !== a.pnl.totalPnlUsd) return b.pnl.totalPnlUsd - a.pnl.totalPnlUsd
        if (b.totalRewardsPls !== a.totalRewardsPls) return b.totalRewardsPls - a.totalRewardsPls
        return b.totalVolumePls - a.totalVolumePls
      })
  }, [s.coins, s.registry, s.username?.name, s.verifiedX, usdRate, nowMs])

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase().replace(/^@/, '')
    return allUsernames.filter((u) => {
      if (q) {
        const matchName = u.username.toLowerCase().includes(q)
        const matchX = (u.xHandle ?? '').toLowerCase().includes(q)
        const matchStyle = u.pnl.archetype.label.toLowerCase().includes(q)
        const matchCoin = u.launchedCoins.some((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
        if (!matchName && !matchX && !matchStyle && !matchCoin) return false
      }
      if (userFilter === 'following') return followingSet.has(u.username.toLowerCase())
      if (userFilter === 'conviction') return u.pnl.archetype.id === 'conviction' || u.pnl.archetype.id === 'swing'
      if (userFilter === 'flippers') return u.pnl.archetype.id === 'flipper' || u.pnl.archetype.id === 'momentum'
      if (userFilter === 'crowned') return u.isCrowned || u.isPlatform
      if (userFilter === 'holders') return u.holdings.length > 0 && u.totalRewardsPls > 0
      if (userFilter === 'xverified') return Boolean(u.xHandle)
      return true
    })
  }, [allUsernames, userSearch, userFilter, followingSet])

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHead
          eyebrow="Unique Profiles · 1 Username = 1 Wallet"
          title="Traders, Holders & Crowned Devs"
          sub="Search any @username, 𝕏 handle, or launched ticker. Inspect holdings, rewards earned, and migrations."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/u/${PLATFORM_USERNAME}`}
            className="rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-3.5 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/20 transition"
          >
            🛡️ View @{PLATFORM_USERNAME}
          </Link>
          {s.username?.name && (
            <Link
              to={`/u/${s.username.name}`}
              className="rounded-xl border border-amber-400/60 bg-amber-400/15 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/25 transition"
            >
              👑 My Profile (@{s.username.name})
            </Link>
          )}
        </div>
      </div>

      {/* Username Search Bar + Filter Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', `All Users (${allUsernames.length})`],
              ['following', `Following (${followingSet.size})`],
              ['conviction', '💎 Conviction Holders'],
              ['flippers', '🏃 Flippers / Momentum'],
              ['crowned', '👑 Crowned Devs'],
              ['holders', '🎁 Top Reward Holders'],
              ['xverified', '𝕏 Verified'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setUserFilter(id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                userFilter === id ? 'tab-pill-active' : 'bg-surface text-muted hover:text-fg border border-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          className="input !py-2 !px-3.5 text-xs sm:w-72"
          placeholder="🔍 Search @username, 𝕏 handle, or $ticker..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div className="card text-center py-10 text-sm text-muted">
          No users matching &ldquo;{userSearch}&rdquo;.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((u) => (
            <Link
              key={u.username}
              to={`/u/${u.username}`}
              className={`card block hover:border-violet transition ${
                u.isPlatform
                  ? 'border-cyan-400/60 bg-gradient-to-br from-surface to-cyan-500/10'
                  : u.isCrowned
                  ? 'border-amber-400/50 bg-gradient-to-br from-surface to-amber-500/5'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-lg font-bold overflow-hidden ${
                      u.isPlatform
                        ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.28)]'
                        : u.isCrowned
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.2)]'
                        : 'border-violet/60 bg-violet/15 text-violet-soft'
                    }`}
                  >
                    <img
                      src={getUserAvatarUrl(u.username, s)}
                      alt={u.username}
                      className={u.isPlatform ? 'h-9 w-9 object-contain' : 'h-full w-full object-cover'}
                    />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-display text-lg text-fg">@{u.username}</span>
                      <FollowUserButton targetUsername={u.username} compact />
                      {u.isMe && <Badge tone="violet">You</Badge>}
                      {u.isPlatform && <PlatformDevBadge compact />}
                      <HolderTierBadge username={u.username} compact />
                      {u.xHandle && (
                        <span className="rounded-full border border-sky-400/50 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                          𝕏 @{u.xHandle} 🔒
                        </span>
                      )}
                      <Badge tone={u.pnl.archetype.tone}>
                        {u.pnl.archetype.emoji} {u.pnl.archetype.shortLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {u.isPlatform
                        ? 'Platform Dev · Protocol Fee Vault'
                        : u.isCrowned
                        ? `👑 Crowned Dev · ${u.migratedCount} migrated / ${u.launchedCount} launched · ${getFollowerCount(u.username, s)} followers`
                        : u.launchedCount > 0
                        ? `Dev · ${u.migratedCount} migrated / ${u.launchedCount} launched · ${getFollowerCount(u.username, s)} followers`
                        : `Trader · ${u.holdings.length} coins held · ${getFollowerCount(u.username, s)} followers`}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line/60 pt-3 text-xs">
                <div>
                  <dt className="text-muted">Total PnL</dt>
                  <dd
                    className={`mt-0.5 font-mono font-bold ${
                      u.pnl.totalPnlUsd >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {u.pnl.totalPnlUsd >= 0 ? '+' : '-'}
                    {fmtUsd(Math.abs(u.pnl.totalPnlUsd))}
                  </dd>
                  <dd
                    className={`text-[10px] font-mono ${
                      u.pnl.totalRoiPct >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {u.pnl.totalRoiPct >= 0 ? '+' : ''}
                    {u.pnl.totalRoiPct.toFixed(0)}% ROI
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Avg Hold</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-cyan-200">
                    ⏱️ {fmtHoldDuration(u.pnl.avgHoldTimeMs, true)}
                  </dd>
                  <dd className="text-[10px] text-muted">{u.pnl.archetype.shortLabel}</dd>
                </div>
                <div>
                  <dt className="text-muted">Portfolio</dt>
                  <dd className="mt-0.5 font-semibold text-fg">{fmtUsd(u.totalPortfolioUsd)}</dd>
                  <dd className="text-[10px] text-muted">{u.buyCount}B / {u.sellCount}S</dd>
                </div>
                <div>
                  <dt className="text-muted">Rewards</dt>
                  <dd className="mt-0.5 font-semibold text-up">
                    {u.isPlatform ? '🔒 Vault' : fmtUsd(u.totalRewardsUsd)}
                  </dd>
                  <dd className="text-[10px] text-muted">
                    {u.isPlatform ? '0.50% Fee' : `${fmtNum(u.totalRewardsPls)} PLS`}
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const TRADES_PAGE_SIZE = 20

export default function UserProfilePage() {
  const { username = '' } = useParams()
  const location = useLocation()
  const s = useStore()
  const usdRate = s.plsUsd || PLS_USD
  const devMode = isDevModeActive(location.search)

  // Separate inline feedback states for PFP, Banner, X verification, and Platform vault
  const [avatarMsg, setAvatarMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [bannerMsg, setBannerMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [xMsg, setXMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [platformMsg, setPlatformMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showPlatformPanel, setShowPlatformPanel] = useState(false)
  const [copiedWallet, setCopiedWallet] = useState(false)
  const [avatarInput, setAvatarInput] = useState('')
  const [bannerInput, setBannerInput] = useState('')
  const [xHandleInput, setXHandleInput] = useState('')
  const [tweetUrlInput, setTweetUrlInput] = useState('')
  const [verifyingX, setVerifyingX] = useState(false)

  // Holdings table sorting & expansion
  const [holdingsSortBy, setHoldingsSortBy] = useState<'value' | 'pnl'>('value')
  const [showAllHoldings, setShowAllHoldings] = useState(false)

  // Trade History pagination (20 rows per page)
  const [tradesPage, setTradesPage] = useState(0)

  const [nowMs, setNowMs] = useState(() => Date.now())
  const proto = useMemo(() => getProtocolStats(s), [s])
  const devVault = useMemo(() => getPlatformDevVaultStatus(s), [s])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const cleanUsername = useMemo(() => {
    const raw = username.replace(/^@/, '').trim()
    const match = s.registry.find((r) => r.name.toLowerCase() === raw.toLowerCase())
    if (match) return match.name
    if (s.username && s.username.name.toLowerCase() === raw.toLowerCase()) return s.username.name
    const coinMatch = s.coins.find((c) => c.launcher.toLowerCase() === raw.toLowerCase())
    if (coinMatch) return coinMatch.launcher
    return raw
  }, [username, s.registry, s.username, s.coins])

  useEffect(() => {
    setTradesPage(0)
    setShowAllHoldings(false)
  }, [cleanUsername])

  const stats = useMemo(
    () => computeUserStats(cleanUsername, s.coins, usdRate, s.username?.name),
    [cleanUsername, s.coins, usdRate, s.username?.name]
  )

  const rewards = useMemo(() => computeUserRewards(cleanUsername, s.coins), [cleanUsername, s.coins])
  const pnl = useMemo(
    () => computeUserPnlAndHoldProfile(cleanUsername, s.coins, usdRate, nowMs),
    [cleanUsername, s.coins, usdRate, nowMs]
  )

  const devRep = useMemo(
    () => computeDevScore(stats.username, s.coins, s, nowMs),
    [stats.username, s.coins, s, nowMs]
  )

  const customProfile = s.userProfiles?.[stats.username.toLowerCase()] ?? {}
  const hasDexSponsored = s.coins.some(
    (c) => c.dexPrepaid && (c.dexPrepaidBy ?? c.launcher).toLowerCase() === stats.username.toLowerCase()
  )

  const bannerPresets = [
    {
      id: 'default',
      label: '🛡️ Cypherpunk Violet Grid',
      requirement: 'Default Banner',
      unlocked: true,
      className: 'bg-gradient-to-r from-violet/40 via-surface to-violet/25',
    },
    {
      id: 'crowned_dev',
      label: '👑 Crowned Sovereign Gold',
      requirement: 'Graduate 1+ coin at 200M PLS to PulseX',
      unlocked: stats.isCrowned || stats.isPlatform,
      className: 'bg-gradient-to-r from-amber-500/45 via-violet/45 to-amber-300/35',
    },
    {
      id: 'diamond_vault',
      label: '💎 Diamond-Hands Emerald Matrix',
      requirement: 'Hold tokens & accrue Holder Pool rewards',
      unlocked: rewards.totalClaimablePls + rewards.totalPendingLockedPls > 0 || pnl.avgHoldTimeMs >= 1_800_000,
      className: 'bg-gradient-to-r from-emerald-500/40 via-cyan-500/30 to-violet/35',
    },
    {
      id: 'whale_titan',
      label: '🐋 PulseChain Titan Aurora',
      requirement: 'Reach 100M+ PLS trading volume',
      unlocked: stats.totalVolumePls >= 100_000_000,
      className: 'bg-gradient-to-r from-cyan-500/45 via-blue-600/35 to-fuchsia-500/40',
    },
    {
      id: 'dex_eagle',
      label: '🦅 DexScreener Enhanced Sponsor',
      requirement: 'Prepay $299 DexScreener Enhanced Info on a coin',
      unlocked: hasDexSponsored || stats.isPlatform,
      className: 'bg-gradient-to-r from-up/40 via-amber-400/30 to-cyan-500/35',
    },
    {
      id: 'immortal_5x',
      label: '🔥 5x Bonded Legend (Immortal Flame)',
      requirement: `Graduate 5 coins to PulseX (${stats.migratedCount}/5)`,
      unlocked: stats.migratedCount >= 5 || stats.isPlatform,
      className: 'bg-gradient-to-r from-rose-500/50 via-amber-500/40 to-violet/50',
    },
  ]

  const activePreset =
    bannerPresets.find((b) => b.id === customProfile.bannerPreset && b.unlocked) ??
    (stats.isCrowned ? bannerPresets[1] : bannerPresets[0])

  const safeAvatarUrl = useMemo(() => {
    if (!customProfile.avatarUrl) return undefined
    const v = validateProfileImageUrl(customProfile.avatarUrl)
    return v.ok && v.url ? v.url : undefined
  }, [customProfile.avatarUrl])

  const safeBannerUrl = useMemo(() => {
    if (!customProfile.bannerUrl) return undefined
    const v = validateProfileImageUrl(customProfile.bannerUrl)
    return v.ok && v.url ? v.url : undefined
  }, [customProfile.bannerUrl])

  async function handleFileUpload(kind: 'avatar' | 'banner', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const setFeedback = kind === 'avatar' ? setAvatarMsg : setBannerMsg
    setFeedback(null)

    const compressed = await compressProfileImageFile(file, kind)
    if (!compressed.ok || !compressed.dataUrl) {
      setFeedback({ kind: 'error', text: compressed.error ?? 'Could not process image upload.' })
      return
    }
    const r =
      kind === 'avatar'
        ? updateUserProfileCustomization({ avatarUrl: compressed.dataUrl })
        : updateUserProfileCustomization({ bannerUrl: compressed.dataUrl })
    setFeedback(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Saved!' })
  }

  const activeHoldings = useMemo(() => {
    const list = pnl.positions.filter((p) => p.isHolding)
    return [...list].sort((a, b) =>
      holdingsSortBy === 'pnl'
        ? b.unrealizedPnlUsd - a.unrealizedPnlUsd
        : b.currentValueUsd - a.currentValueUsd
    )
  }, [pnl.positions, holdingsSortBy])

  const visibleHoldings = showAllHoldings ? activeHoldings : activeHoldings.slice(0, 5)
  const totalTradePages = Math.max(1, Math.ceil(pnl.enrichedTrades.length / TRADES_PAGE_SIZE))
  const pagedTrades = pnl.enrichedTrades.slice(
    tradesPage * TRADES_PAGE_SIZE,
    (tradesPage + 1) * TRADES_PAGE_SIZE
  )

  const isPlatformWalletConfigured = Boolean(PLATFORM_WALLET && PLATFORM_WALLET.trim().length > 0)
  const isViewerPlatformWallet = Boolean(
    isPlatformWalletConfigured && s.evm && s.evm.toLowerCase() === PLATFORM_WALLET.trim().toLowerCase()
  )
  const canClaimPlatformVault = isViewerPlatformWallet

  return (
    <div className="grid gap-4 min-w-0">
      {/* a) Compact Header: Banner (h-28 sm:h-36), PFP, @name, max 3 badges + "Edit profile" (own) and "Rewards ↗" */}
      <div className="card !p-0 overflow-hidden min-w-0">
        <div className={`h-28 sm:h-36 w-full border-b border-line relative overflow-hidden ${activePreset.className}`}>
          {safeBannerUrl && (
            <img src={safeBannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute top-2.5 right-3 flex flex-wrap items-center gap-2 z-10">
            {stats.isMe && (
              <button
                type="button"
                onClick={() => setShowEditProfile((v) => !v)}
                className="rounded-full bg-surface/90 backdrop-blur border border-line px-3 py-1 text-xs font-semibold text-fg hover:border-violet transition"
              >
                {showEditProfile ? '✕ Close' : 'Edit profile'}
              </button>
            )}
            <Link
              to="/rewards"
              className="rounded-full bg-up/20 backdrop-blur border border-up/70 px-3 py-1 text-xs font-bold text-up hover:bg-up/30"
            >
              Rewards ↗
            </Link>
            {stats.isMe && (
              <button
                type="button"
                onClick={() => logoutUser()}
                className="rounded-full bg-bg/85 backdrop-blur border border-line px-3 py-1 text-xs font-medium text-muted hover:text-down hover:border-down/60"
              >
                Log out
              </button>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-5 pb-4 pt-0">
          <div className="-mt-8 flex flex-wrap items-end justify-between gap-3 relative z-10">
            <div className="flex flex-wrap items-end gap-3">
              <div
                className={`relative group flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border-4 border-surface text-2xl font-bold shadow-lg overflow-hidden ${
                  stats.isPlatform
                    ? 'bg-gradient-to-br from-cyan-400/30 via-violet/40 to-fuchsia-500/30 text-cyan-200 ring-2 ring-cyan-400/70'
                    : stats.isCrowned
                    ? 'bg-gradient-to-br from-amber-400/30 to-violet/40 text-amber-300 ring-2 ring-amber-400/60'
                    : 'bg-raised text-violet-soft ring-1 ring-line'
                }`}
              >
                {safeAvatarUrl ? (
                  <img src={safeAvatarUrl} alt={stats.username} className="h-full w-full object-cover" />
                ) : stats.isPlatform ? (
                  <img src="/logo-shield.png?v=pulse" alt="" className="h-12 w-12 object-contain" />
                ) : (
                  <img
                    src={getUserAvatarUrl(stats.username, s)}
                    alt={stats.username}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="pb-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl sm:text-3xl">@{stats.username}</h1>
                  <FollowUserButton targetUsername={stats.username} />
                  {/* Dev score + Wallet age + Linked-wallet rug flag / Crowned */}
                  <Badge
                    tone={
                      devRep.isNewDev
                        ? 'muted'
                        : devRep.score >= 70
                        ? 'up'
                        : devRep.score >= 40
                        ? 'warn'
                        : 'down'
                    }
                    title={devRep.hoverBreakdown}
                  >
                    {devRep.isNewDev ? 'New dev' : `Dev score: ${devRep.score}/100`}
                  </Badge>
                  <Badge title={`First activity ${devRep.walletAgeDays} days ago`}>
                    Wallet age: {devRep.walletAgeDays} days
                  </Badge>
                  {devRep.isLinkedToFlagged ? (
                    <Badge
                      tone="down"
                      title="This wallet was funded by or funded a wallet that rugged a launch (>80% sell within 1h and >80% price drop)."
                    >
                      🚩 Linked to a flagged wallet
                    </Badge>
                  ) : stats.isCrowned ? (
                    <Badge tone="warn" title={devRep.hoverBreakdown}>
                      👑 Crowned ({stats.migratedCount} Migrated)
                    </Badge>
                  ) : s.verifiedX?.[stats.username] ? (
                    <Badge tone="violet">𝕏 @{s.verifiedX[stats.username]} 🔒</Badge>
                  ) : (
                    <Badge tone={pnl.archetype.tone}>
                      {pnl.archetype.emoji} {pnl.archetype.shortLabel}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>
                    <strong className="font-mono text-fg">{getFollowerCount(stats.username, s)}</strong> Followers
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="font-mono text-fg">{getFollowingCount(stats.username, s)}</strong> Following
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible "Edit profile" panel (own profile only) */}
          {stats.isMe && showEditProfile && (
            <div className="mt-4 inset-panel modal-enter border border-violet/60 p-4 grid gap-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <p className="font-display text-sm text-fg">Edit profile (@{stats.username})</p>
                <button
                  type="button"
                  onClick={() => setShowEditProfile(false)}
                  className="btn-ghost !py-1 !px-2.5 text-xs"
                >
                  Done
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* 1. PFP Upload & URL */}
                <div className="rounded-xl border border-line bg-surface/60 p-3 grid gap-2">
                  <p className="font-semibold text-fg">Profile Picture (PFP · max 400×400)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-primary !py-1.5 !px-3 text-xs cursor-pointer">
                      📷 Upload PFP
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleFileUpload('avatar', e)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const r = updateUserProfileCustomization({ avatarUrl: '/logo-shield.png?v=pulse' })
                        setAvatarMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Updated!' })
                      }}
                      className="btn-ghost !py-1.5 !px-2.5 text-xs"
                    >
                      🛡️ Pulse Shield
                    </button>
                    {customProfile.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const r = updateUserProfileCustomization({ avatarUrl: '' })
                          setAvatarMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Reset!' })
                        }}
                        className="btn-ghost !py-1.5 !px-2.5 text-xs text-muted"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      className="input !py-1.5 text-xs flex-1"
                      placeholder="https://example.com/avatar.png"
                      value={avatarInput}
                      onChange={(e) => {
                        setAvatarInput(e.target.value)
                        setAvatarMsg(null)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const r = updateUserProfileCustomization({ avatarUrl: avatarInput.trim() })
                        setAvatarMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Saved!' })
                        if (!r.error) setAvatarInput('')
                      }}
                      className="btn-ghost !py-1.5 !px-3 text-xs"
                    >
                      Save URL
                    </button>
                  </div>
                  {avatarMsg && <Notice kind={avatarMsg.kind}>{avatarMsg.text}</Notice>}
                </div>

                {/* 2. Banner Upload & URL */}
                <div className="rounded-xl border border-line bg-surface/60 p-3 grid gap-2">
                  <p className="font-semibold text-fg">Banner Image (max 1500×500)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-primary !py-1.5 !px-3 text-xs cursor-pointer">
                      🖼️ Upload Banner
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleFileUpload('banner', e)}
                      />
                    </label>
                    {safeBannerUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const r = updateUserProfileCustomization({ bannerUrl: '' })
                          setBannerMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Reset!' })
                        }}
                        className="btn-ghost !py-1.5 !px-2.5 text-xs text-muted"
                      >
                        Use Preset
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      className="input !py-1.5 text-xs flex-1"
                      placeholder="https://example.com/banner.png"
                      value={bannerInput}
                      onChange={(e) => {
                        setBannerInput(e.target.value)
                        setBannerMsg(null)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const r = updateUserProfileCustomization({ bannerUrl: bannerInput.trim() })
                        setBannerMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Saved!' })
                        if (!r.error) setBannerInput('')
                      }}
                      className="btn-ghost !py-1.5 !px-3 text-xs"
                    >
                      Save URL
                    </button>
                  </div>
                  {bannerMsg && <Notice kind={bannerMsg.kind}>{bannerMsg.text}</Notice>}
                </div>
              </div>

              {/* 3. Unlockable Achievement Banner Presets */}
              <div>
                <p className="font-semibold text-fg mb-2">
                  🏆 Achievement Banner Presets ({bannerPresets.filter((b) => b.unlocked).length}/{bannerPresets.length} Unlocked)
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {bannerPresets.map((b) => {
                    const isEquipped = !customProfile.bannerUrl && activePreset.id === b.id
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={!b.unlocked}
                        onClick={() => {
                          const r = updateUserProfileCustomization({ bannerPreset: b.id, bannerUrl: '' })
                          setBannerMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Equipped!' })
                        }}
                        className={`rounded-xl border p-2 text-left transition ${
                          isEquipped
                            ? 'border-up bg-up/10'
                            : b.unlocked
                            ? 'border-line bg-surface hover:border-violet'
                            : 'border-line/50 bg-bg/50 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className={`h-7 w-full rounded border border-line/60 mb-1.5 ${b.className}`} />
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-fg text-[11px]">{b.label}</span>
                          {isEquipped ? (
                            <Badge tone="up">Equipped</Badge>
                          ) : b.unlocked ? (
                            <Badge tone="violet">Use</Badge>
                          ) : (
                            <Badge tone="muted">Locked</Badge>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 4. X Verification Block (own profile only) */}
              <div className="rounded-xl border border-line bg-surface/50 p-3 grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-fg">Immutable 𝕏 (Twitter) Ownership Lock</span>
                  {s.verifiedX?.[stats.username] ? (
                    <Badge tone="up">Locked to @{s.verifiedX[stats.username]} 🔒</Badge>
                  ) : (
                    <span className="text-[11px] text-muted">1-Time Permanent Lock</span>
                  )}
                </div>
                {!s.verifiedX?.[stats.username] && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      className="input !py-1.5 text-xs"
                      placeholder="@your_x_handle"
                      value={xHandleInput}
                      onChange={(e) => {
                        setXHandleInput(e.target.value)
                        setXMsg(null)
                      }}
                    />
                    <div className="rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-mono text-violet-soft select-all flex items-center">
                      {xHandleInput.trim()
                        ? getXVerificationCode(stats.username, xHandleInput)
                        : `UNIQ-VERIFY:@${stats.username}:......`}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        className="input !py-1.5 text-xs flex-1"
                        placeholder="Paste tweet URL..."
                        value={tweetUrlInput}
                        onChange={(e) => setTweetUrlInput(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={verifyingX}
                        onClick={async () => {
                          setVerifyingX(true)
                          const r = await verifyUserXHandleWithTweet(xHandleInput, tweetUrlInput)
                          setVerifyingX(false)
                          setXMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Verified!' })
                          if (!r.error) {
                            setXHandleInput('')
                            setTweetUrlInput('')
                          }
                        }}
                        className="btn-primary !py-1.5 !px-3 text-xs shrink-0"
                      >
                        {verifyingX ? '…' : 'Lock 𝕏'}
                      </button>
                    </div>
                  </div>
                )}
                {xMsg && <Notice kind={xMsg.kind}>{xMsg.text}</Notice>}
              </div>

              {/* 5. Dev Mode Controls (?dev=1 + import.meta.env.DEV only) */}
              {devMode && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted">Dev Mode (?dev=1):</span>
                    <button
                      type="button"
                      onClick={() => loginAsPersonalWallet('gainzee')}
                      className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200"
                    >
                      Switch @gainzee
                    </button>
                    <button
                      type="button"
                      onClick={() => loginAsPlatformDev()}
                      className="rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200"
                    >
                      Switch @{PLATFORM_USERNAME}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Reset the whole demo in this browser?')) resetDemo()
                    }}
                    className="text-xs text-down underline hover:opacity-80"
                  >
                    Reset demo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* b) One-line wallet strip (own profile only), ~44px tall: short address + Copy, PLS balance, total holdings value, Bridge ↗ */}
      {stats.isMe && (() => {
        const validWallet = isValidChecksumAddress(s.evm) ? s.evm : isValidChecksumAddress(s.username?.wallet) ? s.username!.wallet : null
        const plsBal = s.realPlsBalance ?? s.pls
        return (
          <div className="min-h-[44px] rounded-xl border border-line bg-surface px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Wallet:</span>
              <code className="font-mono text-fg">{validWallet ? short(validWallet) : 'Not connected'}</code>
              <button
                type="button"
                disabled={!validWallet}
                onClick={async () => {
                  if (!validWallet) return
                  try {
                    await navigator.clipboard.writeText(validWallet)
                  } catch {
                    // ignore
                  }
                  setCopiedWallet(true)
                  setTimeout(() => setCopiedWallet(false), 2000)
                }}
                className="rounded border border-line bg-bg px-2 py-0.5 text-[11px] font-semibold text-fg hover:border-violet disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiedWallet ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <span>
                <span className="text-muted">PLS:</span>{' '}
                <strong className="font-mono text-fg">{fmtNum(plsBal)} PLS</strong>{' '}
                <span className="text-muted">({fmtUsd(plsBal * usdRate)})</span>
              </span>
              <span>
                <span className="text-muted">Holdings:</span>{' '}
                <strong className="font-mono text-up">{fmtUsd(stats.totalPortfolioUsd)}</strong>{' '}
                <span className="text-muted">({fmtNum(stats.totalPortfolioPls)} PLS)</span>
              </span>
              <Link to="/bridge" className="font-semibold text-violet-soft hover:underline">
                Bridge ↗
              </Link>
            </div>
          </div>
        )
      })()}

      {/* c) Compact stats row: Total PnL, realized/unrealized, avg hold time, launched/migrated + one-line Rewards link */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="inset-panel px-3.5 py-2.5">
          <p className="text-[11px] text-muted">Total PnL</p>
          <p className={`text-base num-stat ${pnl.totalPnlUsd >= 0 ? 'text-up' : 'text-down'}`}>
            {pnl.totalPnlUsd >= 0 ? '+' : '-'}
            {fmtUsd(Math.abs(pnl.totalPnlUsd))} ({pnl.totalRoiPct >= 0 ? '+' : ''}
            {pnl.totalRoiPct.toFixed(1)}%)
          </p>
        </div>

        <div className="inset-panel px-3.5 py-2.5">
          <p className="text-[11px] text-muted">Realized / Unrealized</p>
          <p className="text-xs num-stat mt-0.5">
            <span className={pnl.realizedPnlUsd >= 0 ? 'text-up' : 'text-down'}>
              {pnl.realizedPnlUsd >= 0 ? '+' : '-'}
              {fmtUsd(Math.abs(pnl.realizedPnlUsd))}
            </span>{' '}
            <span className="text-muted">/</span>{' '}
            <span className={pnl.unrealizedPnlUsd >= 0 ? 'text-up' : 'text-down'}>
              {pnl.unrealizedPnlUsd >= 0 ? '+' : '-'}
              {fmtUsd(Math.abs(pnl.unrealizedPnlUsd))}
            </span>
          </p>
        </div>

        <div className="inset-panel px-3.5 py-2.5">
          <p className="text-[11px] text-muted">Avg Hold Time</p>
          <p className="text-base num-stat text-cyan-200">
            ⏱️ {fmtHoldDuration(pnl.avgHoldTimeMs, true)}
          </p>
        </div>

        <div className="inset-panel px-3.5 py-2.5">
          <p className="text-[11px] text-muted">Launched / Migrated</p>
          <p className="text-base num-stat text-fg">
            {stats.launchedCount} <span className="text-muted font-normal">/</span>{' '}
            <span className="text-amber-300">{stats.migratedCount}</span>
          </p>
        </div>
      </div>

      {/* Rewards one-liner (no claim button here) */}
      <div className="inset-panel px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div>
          <span className="font-medium text-fg">
            Claimable <strong className="font-mono text-up">{fmtNum(rewards.totalClaimablePls)} PLS</strong> · Locked{' '}
            <strong className="font-mono text-amber-300">{fmtNum(rewards.totalPendingLockedPls)} PLS</strong>
          </span>{' '}
          <Link to="/rewards" className="ml-1.5 font-semibold text-up hover:underline">
            → Open Rewards
          </Link>
        </div>
        <span className="text-[11px] text-muted">
          After migration: PulseX LP fees (0.22%) from the locked LP, split 40% holders / 20% creator / 40% platform.
        </span>
      </div>

      {/* d) ONE Holdings table: columns Coin, Amount, Value, Avg entry, Unrealized PnL, Held for */}
      <section className="card !p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <h2 className="font-display text-lg">Holdings ({activeHoldings.length})</h2>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted">Sort:</span>
            <button
              type="button"
              onClick={() => setHoldingsSortBy('value')}
              className={`rounded-lg px-2.5 py-1 font-semibold ${
                holdingsSortBy === 'value' ? 'bg-violet text-white' : 'bg-bg text-muted hover:text-fg'
              }`}
            >
              Value
            </button>
            <button
              type="button"
              onClick={() => setHoldingsSortBy('pnl')}
              className={`rounded-lg px-2.5 py-1 font-semibold ${
                holdingsSortBy === 'pnl' ? 'bg-violet text-white' : 'bg-bg text-muted hover:text-fg'
              }`}
            >
              PnL
            </button>
          </div>
        </div>

        {activeHoldings.length === 0 ? (
          <p className="text-sm text-muted py-2">No tokens currently held.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted border-b border-line">
                  <tr>
                    <th className="py-2">Coin</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Value</th>
                    <th className="py-2 text-right">Avg entry</th>
                    <th className="py-2 text-right">Unrealized PnL</th>
                    <th className="py-2 text-right">Held for</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {visibleHoldings.map((p) => {
                    const isPos = p.unrealizedPnlUsd >= 0
                    const avgEntryPls = p.heldTokens > 0 ? p.remainingCostPls / p.heldTokens : 0
                    return (
                      <tr key={p.coin.ticker} className="text-sm">
                        <td className="py-2">
                          <Link
                            to={`/coin/${p.coin.ticker}`}
                            className="inline-flex items-center gap-2 font-semibold text-fg hover:text-violet-soft"
                          >
                            <CoinLogo ticker={p.coin.ticker} logoUrl={p.coin.logoUrl} className="h-6 w-6 rounded-lg" />
                            <span>${p.coin.ticker}</span>
                            <span className="text-xs text-muted font-normal">({p.supplyPct.toFixed(2)}%)</span>
                          </Link>
                        </td>
                        <td className="py-2 text-right font-mono">{fmtNum(p.heldTokens)}</td>
                        <td className="py-2 text-right font-mono font-medium">
                          {fmtUsd(p.currentValueUsd)}{' '}
                          <span className="text-xs text-muted">({fmtNum(p.currentValuePls)} PLS)</span>
                        </td>
                        <td className="py-2 text-right font-mono text-muted">{fmtPrice(avgEntryPls)} PLS</td>
                        <td className={`py-2 text-right font-mono font-semibold ${isPos ? 'text-up' : 'text-down'}`}>
                          {isPos ? '+' : '-'}
                          {fmtUsd(Math.abs(p.unrealizedPnlUsd))} ({isPos ? '+' : ''}
                          {p.unrealizedRoiPct.toFixed(1)}%)
                        </td>
                        <td className="py-2 text-right font-mono text-cyan-200">
                          {fmtHoldDuration(p.heldMs, true)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {activeHoldings.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllHoldings((v) => !v)}
                className="mt-2 text-xs font-semibold text-violet-soft hover:underline"
              >
                {showAllHoldings ? 'Show fewer' : `Show all (${activeHoldings.length})`}
              </button>
            )}
          </>
        )}
      </section>

      {/* e) Coins Launched (compact list) */}
      <section className="card !p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display text-lg">Coins Launched ({stats.launchedCount})</h2>
          {stats.isMe && (
            <Link to="/launch" className="btn-primary !py-1.5 !px-3 text-xs">
              + Launch Coin
            </Link>
          )}
        </div>
        {stats.launchedCoins.length === 0 ? (
          <p className="text-sm text-muted">@{stats.username} hasn&apos;t launched a coin yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.launchedCoins.map((c) => (
              <CoinCard key={c.ticker} coin={c} />
            ))}
          </div>
        )}
      </section>

      {/* f) Trade History & PnL at the bottom, full width, paginated 20 rows */}
      <section className="card !p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <h2 className="font-display text-lg">Trade History &amp; PnL ({pnl.enrichedTrades.length})</h2>
          {totalTradePages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={tradesPage === 0}
                onClick={() => setTradesPage((p) => Math.max(0, p - 1))}
                className="btn-ghost !py-1 !px-2.5 text-xs disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-mono text-muted">
                Page {tradesPage + 1} / {totalTradePages}
              </span>
              <button
                type="button"
                disabled={tradesPage + 1 >= totalTradePages}
                onClick={() => setTradesPage((p) => Math.min(totalTradePages - 1, p + 1))}
                className="btn-ghost !py-1 !px-2.5 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {pnl.enrichedTrades.length === 0 ? (
          <p className="text-sm text-muted py-2">No trades recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted border-b border-line">
                <tr>
                  <th className="py-2">Side</th>
                  <th className="py-2">Coin</th>
                  <th className="py-2 text-right">Tokens</th>
                  <th className="py-2 text-right">PLS / USD</th>
                  <th className="py-2 text-right">Realized PnL</th>
                  <th className="py-2 text-right">Held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {pagedTrades.map((t, i) => {
                  const isProfit = (t.pnlUsd ?? 0) >= 0
                  return (
                    <tr key={`${t.ticker}-${t.t}-${i}`} className="text-sm">
                      <td className={`py-2 font-semibold text-xs ${t.side === 'buy' ? 'text-up' : 'text-down'}`}>
                        {t.side.toUpperCase()}
                      </td>
                      <td className="py-2">
                        <Link to={`/coin/${t.ticker}`} className="font-semibold text-violet-soft hover:underline">
                          ${t.ticker}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-muted">{fmtNum(t.tokens)}</td>
                      <td className="py-2 text-right font-mono text-xs">
                        {fmtNum(t.pls)} PLS <span className="text-muted">({fmtUsd(t.usd)})</span>
                      </td>
                      <td className="py-2 text-right font-mono text-xs">
                        {t.side === 'sell' && t.pnlUsd !== undefined ? (
                          <span className={isProfit ? 'text-up font-semibold' : 'text-down font-semibold'}>
                            {isProfit ? '+' : '-'}
                            {fmtUsd(Math.abs(t.pnlUsd))} ({isProfit ? '+' : ''}
                            {(t.pnlPct ?? 0).toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-muted">
                        {t.side === 'sell' && t.heldMs ? fmtHoldDuration(t.heldMs, false) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Platform revenue panel: shown ONLY when viewer's connected wallet equals PLATFORM_WALLET (or disabled notice if VITE_PLATFORM_WALLET is not configured when logged in as @uniq_pulse) */}
      {(isViewerPlatformWallet || (!isPlatformWalletConfigured && stats.isPlatform && stats.isMe)) && (
        <section className="card !p-4 border-cyan-400/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PlatformDevBadge />
              <span className="font-display text-base">@{PLATFORM_USERNAME} Protocol Fee Vault</span>
            </div>
            {isPlatformWalletConfigured ? (
              <button
                type="button"
                onClick={() => setShowPlatformPanel((v) => !v)}
                className="btn-ghost !py-1 !px-3 text-xs"
              >
                {showPlatformPanel ? 'Hide Platform Vault' : 'Show Platform Vault'}
              </button>
            ) : (
              <Badge tone="warn">Platform wallet not configured</Badge>
            )}
          </div>

          {!isPlatformWalletConfigured ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>Platform wallet not configured (set VITE_PLATFORM_WALLET to enable protocol fee claims).</span>
              <button
                type="button"
                disabled
                className="rounded-xl border border-line bg-bg px-4 py-2 text-xs font-semibold text-muted opacity-50 cursor-not-allowed"
              >
                Platform wallet not configured
              </button>
            </div>
          ) : (
            showPlatformPanel && (
              <div className="mt-3 grid gap-3 text-xs">
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-bg/80 p-3">
                    <p className="text-muted">24h Ecosystem Volume</p>
                    <p className="font-display text-lg text-fg">{fmtUsd(proto.dailyVolumeUsd)}</p>
                    <p className="text-[11px] text-muted">{fmtNum(proto.dailyVolumePls)} PLS</p>
                  </div>
                  <div className="rounded-xl border border-line bg-bg/80 p-3">
                    <p className="text-muted">Holders Rewarded</p>
                    <p className="font-display text-lg text-up">{fmtUsd(proto.totalHolderRewardsUsd)}</p>
                    <p className="text-[11px] text-muted">{fmtNum(proto.totalHolderRewardsPls)} PLS</p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/50 bg-cyan-400/10 p-3">
                    <p className="text-cyan-200">Unclaimed Protocol Fees</p>
                    <p className="font-display text-lg text-cyan-200">{fmtUsd(devVault.unclaimedUsd)}</p>
                    <p className="text-[11px] text-cyan-100">{fmtNum(devVault.unclaimedPls)} PLS</p>
                  </div>
                </div>

                {canClaimPlatformVault && (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const r = claimPlatformDevVaultRewards()
                        setPlatformMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info ?? 'Claimed!' })
                      }}
                      className="rounded-xl bg-up px-4 py-2 text-xs font-bold text-bg hover:opacity-90"
                    >
                      Claim {fmtNum(devVault.unclaimedPls)} PLS to PLATFORM_WALLET
                    </button>
                  </div>
                )}
                {platformMsg && <Notice kind={platformMsg.kind}>{platformMsg.text}</Notice>}
              </div>
            )
          )}
        </section>
      )}
    </div>
  )
}
