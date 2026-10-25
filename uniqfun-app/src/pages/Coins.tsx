import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../state/store'
import { CoinCard, PageHead } from '../components/ui'
import {
  DEFAULT_COINS_FILTERS,
  filterAndSortCoins,
  loadCoinsFilters,
  saveCoinsFilters,
  type CoinsFilterState,
} from '../lib/reputation'

const SORT_OPTIONS: Array<{ id: CoinsFilterState['sortBy']; label: string }> = [
  { id: 'newest', label: 'Newest' },
  { id: 'mcap', label: 'Market cap' },
  { id: 'volume', label: 'Volume' },
  { id: 'progress', label: 'Bonding progress' },
  { id: 'dev_score', label: 'Dev score' },
]

export default function Coins() {
  const s = useStore()
  const [filters, setFilters] = useState<CoinsFilterState>(() => loadCoinsFilters())

  useEffect(() => {
    saveCoinsFilters(filters)
  }, [filters])

  const list = useMemo(() => filterAndSortCoins(s.coins, filters, s), [s.coins, filters, s])

  function updateFilter<K extends keyof CoinsFilterState>(key: K, value: CoinsFilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <PageHead
        eyebrow="Coins · Live Transparency & Dev Reputation"
        title="Every coin has one ticker."
        sub="Filter out snipers, bundles, early sellers, and flagged wallets. Locked dev coins earn a sort boost."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <input
            className="input sm:max-w-xs"
            placeholder="Search ticker or name"
            value={filters.query}
            onChange={(e) => updateFilter('query', e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted font-medium">Sort:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateFilter('sortBy', opt.id)}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${
                  filters.sortBy === opt.id
                    ? 'tab-pill-active'
                    : 'border border-line bg-surface text-muted hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Link to="/launch" className="btn-ghost shrink-0">
          Launch a coin
        </Link>
      </div>

      {/* Transparency & Dev Reputation Filter Bar (saved in localStorage) */}
      <div className="mb-6 card !p-3.5 text-xs grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-fg">🛡️ Safety &amp; Reputation Filters</span>
          <div className="flex items-center gap-3">
            <span className="text-muted">
              Showing <strong className="text-fg">{list.length}</strong> of {s.coins.length} coins
            </span>
            <button
              type="button"
              onClick={() => setFilters({ ...DEFAULT_COINS_FILTERS })}
              className="text-violet-soft underline hover:opacity-80"
            >
              Reset filters
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateFilter('hideNewDevs', !filters.hideNewDevs)}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              filters.hideNewDevs ? 'border-violet bg-violet/20 text-fg' : 'border-line bg-bg text-muted hover:text-fg'
            }`}
          >
            {filters.hideNewDevs ? '✓ ' : ''}Hide new devs
          </button>

          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition ${
              filters.hideSnipers ? 'border-amber-400/70 bg-amber-400/15 text-amber-200' : 'border-line bg-bg text-muted'
            }`}
          >
            <button
              type="button"
              onClick={() => updateFilter('hideSnipers', !filters.hideSnipers)}
              className="hover:text-fg"
            >
              {filters.hideSnipers ? '✓ ' : ''}Hide snipers &gt;
            </button>
            <input
              type="number"
              min={1}
              max={100}
              value={filters.maxSniperPct}
              onChange={(e) => updateFilter('maxSniperPct', Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
              className="w-11 rounded border border-line bg-surface px-1 py-0.5 text-center font-mono text-[11px] text-fg"
            />
            <span>%</span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition ${
              filters.hideBundles ? 'border-amber-400/70 bg-amber-400/15 text-amber-200' : 'border-line bg-bg text-muted'
            }`}
          >
            <button
              type="button"
              onClick={() => updateFilter('hideBundles', !filters.hideBundles)}
              className="hover:text-fg"
            >
              {filters.hideBundles ? '✓ ' : ''}Hide bundles &gt;
            </button>
            <input
              type="number"
              min={1}
              max={100}
              value={filters.maxBundlePct}
              onChange={(e) => updateFilter('maxBundlePct', Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
              className="w-11 rounded border border-line bg-surface px-1 py-0.5 text-center font-mono text-[11px] text-fg"
            />
            <span>%</span>
          </div>

          <button
            type="button"
            onClick={() => updateFilter('hideDevSoldOver50', !filters.hideDevSoldOver50)}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              filters.hideDevSoldOver50 ? 'border-down/70 bg-down/15 text-down' : 'border-line bg-bg text-muted hover:text-fg'
            }`}
          >
            {filters.hideDevSoldOver50 ? '✓ ' : ''}Hide dev sold &gt;50%
          </button>

          <button
            type="button"
            onClick={() => updateFilter('onlyDevLocked', !filters.onlyDevLocked)}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              filters.onlyDevLocked ? 'border-up/70 bg-up/15 text-up' : 'border-line bg-bg text-muted hover:text-fg'
            }`}
            title="Requires an active dev token lock with a term of 30+ days"
          >
            {filters.onlyDevLocked ? '✓ ' : ''}🔒 Only dev-locked (30d+)
          </button>

          <button
            type="button"
            onClick={() => updateFilter('onlyMigrated', !filters.onlyMigrated)}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              filters.onlyMigrated ? 'border-up/70 bg-up/15 text-up' : 'border-line bg-bg text-muted hover:text-fg'
            }`}
          >
            {filters.onlyMigrated ? '✓ ' : ''}👑 Only migrated
          </button>

          <button
            type="button"
            onClick={() => updateFilter('hideLinkedFlagDevs', !filters.hideLinkedFlagDevs)}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              filters.hideLinkedFlagDevs ? 'border-down/70 bg-down/15 text-down' : 'border-line bg-bg text-muted hover:text-fg'
            }`}
          >
            {filters.hideLinkedFlagDevs ? '✓ ' : ''}🚩 Hide linked-flag devs
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-muted">No coins match your active filters.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <CoinCard key={c.ticker} coin={c} />
          ))}
        </div>
      )}
    </div>
  )
}
