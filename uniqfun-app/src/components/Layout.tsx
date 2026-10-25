import { useState, useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import Logo from './Logo'
import Backdrop from './Backdrop'
import { logoutUser, refreshEvmState, refreshPlsPrice, useStore } from '../state/store'
import { fmtNum, fmtPrice, fmtUsd } from '../lib/model'
import { CHAIN, PLATFORM } from '../config'
import { short, switchToPulseChain } from '../lib/wallets'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/coins', label: 'Coins' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/users', label: 'Users' },
  { to: '/launch', label: 'Launch' },
  { to: '/bridge', label: 'Bridge' },
  { to: '/uniq', label: 'How it works' },
]

export function AccountButton() {
  const s = useStore()
  const { username, evm } = s

  return (
    <div className="inline-flex flex-nowrap items-center gap-2 shrink-0 whitespace-nowrap">
      {username ? (
        <Link
          to={`/u/${username.name}`}
          className="inline-flex items-center justify-center min-h-[40px] rounded-full border border-violet/60 bg-violet/15 px-3.5 py-2 text-xs font-semibold text-fg hover:border-violet-soft whitespace-nowrap transition"
          title="Open your profile, private wallet address & balances"
        >
          👑 @{username.name}
        </Link>
      ) : (
        <Link
          to="/pass"
          className="btn-primary !px-4 !py-2 text-xs font-semibold whitespace-nowrap"
        >
          Connect wallet
        </Link>
      )}
      {(username || evm) && (
        <button
          type="button"
          onClick={() => logoutUser()}
          className="inline-flex items-center justify-center min-h-[40px] rounded-full border border-line bg-raised px-3 py-2 text-xs text-muted hover:border-down/60 hover:text-down whitespace-nowrap transition"
          title="Log out"
        >
          Log out
        </button>
      )}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const storeState = useStore()
  const {
    pls,
    plsUsd,
    solUsd = 102.45,
    ethUsd = 2540.0,
    plsChange24h = 0,
    solChange24h = 0,
    ethChange24h = 0,
    plsPriceSource,
    evm,
    evmChainId,
    realPlsBalance,
  } = storeState

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  useEffect(() => {
    void refreshPlsPrice()
    const id = setInterval(() => void refreshPlsPrice(), 8_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (evm) void refreshEvmState(evm)
  }, [evm])

  const onPulseChain = evmChainId === CHAIN.mainnet.id || evmChainId === CHAIN.testnet.id

  async function handleSwitch(net: 'mainnet' | 'testnet') {
    try {
      await switchToPulseChain(net)
      if (evm) await refreshEvmState(evm)
    } catch {
      // User rejected or wallet error
    }
  }

  return (
    <div className="relative isolate z-0 min-h-screen text-fg">
      <Backdrop />

      {/* Top Demo Banner */}
      <div className="relative z-10 border-b border-amber-400/40 bg-amber-400/10 px-4 py-1 text-center text-xs font-semibold text-amber-200">
        DEMO: test data, not real money.
      </div>

      <header
        className="sticky top-0 z-20 border-b border-[var(--color-edge)]"
        style={{
          background: 'rgba(7, 5, 26, 0.65)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 xl:gap-5 px-4 py-3 md:py-3.5">
          <Link to="/" className="logo-brand-link mr-auto shrink-0" aria-label="uniq.pulse home">
            <Logo />
          </Link>

          <nav className="hidden lg:flex items-center gap-1 shrink-0">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `inline-flex items-center justify-center min-h-[40px] rounded-full whitespace-nowrap px-2.5 xl:px-3.5 py-2 text-[15px] font-medium transition ${
                    isActive ? 'nav-pill-active text-fg' : 'text-muted hover:text-fg'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:block shrink-0">
            <AccountButton />
          </div>

          <button
            type="button"
            className="lg:hidden btn-ghost !px-3.5 !py-2 shrink-0"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>

        {open && (
          <nav className="lg:hidden border-t border-[var(--color-edge)] bg-[#0D0826]/95 px-4 py-3 grid gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `rounded-xl px-3.5 py-2.5 text-[15px] font-medium ${
                    isActive ? 'nav-pill-active text-fg' : 'text-muted hover:text-fg'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <div className="pt-2">
              <AccountButton />
            </div>
          </nav>
        )}

        {/* Live Multi-Chain Ticker & Stats Strip */}
        <div className="border-t border-[var(--color-edge)] bg-surface/80">
          <div className="mx-auto max-w-6xl px-4 py-1.5 text-xs text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Balance <span className="text-fg num-stat">{fmtNum(pls)} PLS</span>{' '}
              <span className="text-[11px] text-muted num-stat">({fmtUsd(pls * plsUsd)})</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-0.5 num-stat">
              <span className="text-violet-soft font-semibold">PLS</span>
              <span className="text-fg">${fmtPrice(plsUsd)}</span>
              {plsChange24h !== 0 && (
                <span className={plsChange24h >= 0 ? 'text-up' : 'text-down'}>
                  {plsChange24h >= 0 ? '+' : ''}
                  {plsChange24h.toFixed(1)}%
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-0.5 num-stat">
              <span className="text-up font-semibold">SOL</span>
              <span className="text-fg">${solUsd.toFixed(2)}</span>
              {solChange24h !== 0 && (
                <span className={solChange24h >= 0 ? 'text-up' : 'text-down'}>
                  {solChange24h >= 0 ? '+' : ''}
                  {solChange24h.toFixed(1)}%
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-0.5 num-stat">
              <span className="text-sky-300 font-semibold">ETH</span>
              <span className="text-fg">${ethUsd.toFixed(2)}</span>
              {ethChange24h !== 0 && (
                <span className={ethChange24h >= 0 ? 'text-up' : 'text-down'}>
                  {ethChange24h >= 0 ? '+' : ''}
                  {ethChange24h.toFixed(1)}%
                </span>
              )}
            </span>
            <span className="text-[11px] opacity-75">
              ({plsPriceSource === 'live' ? '● DexScreener Live' : 'PulseChain'})
            </span>
            {evm && (
              <>
                <span>
                  Wallet ({short(evm)}) on-chain:{' '}
                  <span className="text-fg num-stat">
                    {realPlsBalance !== null ? `${fmtNum(realPlsBalance, 2)} PLS` : 'reading…'}
                  </span>
                </span>
                {!onPulseChain ? (
                  <span className="flex items-center gap-2">
                    <span className="text-amber-300">Wrong network</span>
                    <button
                      onClick={() => handleSwitch('mainnet')}
                      className="underline text-violet-soft hover:text-fg"
                    >
                      Switch to PulseChain (369)
                    </button>
                    <button
                      onClick={() => handleSwitch('testnet')}
                      className="underline text-muted hover:text-fg"
                    >
                      Testnet v4 (943)
                    </button>
                  </span>
                ) : (
                  <span className="text-up">
                    {evmChainId === 943 ? 'PulseChain Testnet v4 (943)' : 'PulseChain (369)'}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div key={loc.pathname} className="page-enter">
          {children}
        </div>
      </main>

      <footer className="relative z-10 border-t border-[var(--color-edge)]">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {PLATFORM.site} · {PLATFORM.tagline} · PulseChain
            </span>
            <a
              href={PLATFORM.devTwitter}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line bg-surface px-3 py-1 text-fg hover:border-violet transition"
            >
              𝕏 @{PLATFORM.dev}
            </a>
          </div>
          <span>Demo model. Not wired to PulseChain. No real funds move. Never share a seed phrase.</span>
        </div>
      </footer>
    </div>
  )
}
