import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PLATFORM_USERNAME } from '../config'
import { connectEvm, discoverEvmWallets, short, type EvmWallet } from '../lib/wallets'
import {
  createUsername,
  isDevModeActive,
  loginAsPersonalWallet,
  loginAsPlatformDev,
  setEvm,
  useStore,
} from '../state/store'
import { Notice, PageHead, ProveXSoon } from '../components/ui'

export default function UsernamePage() {
  const s = useStore()
  const nav = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [evms, setEvms] = useState<EvmWallet[]>([])
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const devMode = isDevModeActive(location.search)

  useEffect(() => {
    discoverEvmWallets().then(setEvms)
  }, [])

  async function connect(w: EvmWallet) {
    try {
      const a = await connectEvm(w)
      const r = setEvm(a, w.name)
      setMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.info! })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'That wallet did not connect.' })
    }
  }

  // /pass is ONLY the logged-out "Pick your username" onboarding page; if logged in, redirect to /u/<me>
  if (s.username) {
    return <Navigate to={`/u/${s.username.name}`} replace />
  }

  function handleSignup() {
    const r = createUsername(name)
    if (r.error) {
      setMsg({ kind: 'error', text: r.error })
      return
    }
    const createdName = name.trim().toLowerCase()
    nav(`/u/${createdName}`)
  }

  return (
    <div className="max-w-xl">
      <PageHead
        eyebrow="Onboarding"
        title="Pick your @username."
        sub="Connect your PulseChain wallet and claim your @username. Once signed in, edit your profile, lock your X (Twitter) handle, and manage your portfolio from your @username page."
      />

      {devMode && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-fg">Dev Mode Quick Sign-In (?dev=1)</p>
            <p className="text-[11px] text-muted">
              Switch into a seeded dev profile for local testing (does not top up PLS or grant platform fee claims).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const r = loginAsPersonalWallet('gainzee')
                if (r.error) setMsg({ kind: 'error', text: r.error })
                else nav('/u/gainzee')
              }}
              className="rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/25 transition"
            >
              👑 @gainzee
            </button>
            <button
              type="button"
              onClick={() => {
                const r = loginAsPlatformDev()
                if (r.error) setMsg({ kind: 'error', text: r.error })
                else nav(`/u/${PLATFORM_USERNAME}`)
              }}
              className="rounded-xl border border-cyan-400/50 bg-cyan-400/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-400/25 transition"
            >
              🛡️ @{PLATFORM_USERNAME}
            </button>
          </div>
        </div>
      )}

      <div className="card grid gap-5">
        {/* Step 1: Connect Wallet */}
        <div>
          <p className="label">1. Connect PulseChain Wallet</p>
          {s.evm ? (
            <p className="mt-2 text-sm text-up font-medium">
              ✓ Connected: {s.evmLabel ?? 'Wallet'} ({short(s.evm)}) will be bound to your @username.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {evms.map((w) => (
                <button key={w.name} className="btn-ghost !py-2" onClick={() => connect(w)}>
                  Connect {w.name}
                </button>
              ))}
              <p className="text-xs text-muted w-full">
                {evms.length ? 'Optional in demo mode. ' : ''}Connect a PulseChain wallet or continue to bind a local demo address.
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Pick @username */}
        <div>
          <label className="label" htmlFor="name">
            2. Pick Your @username
          </label>
          <input
            id="name"
            className="input mt-2"
            placeholder="harbor"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            value={name}
            onChange={(e) => {
              setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              setMsg(null)
            }}
          />
          <p className="mt-1.5 text-xs text-muted">
            3–16 letters, numbers, or underscores. Bound to one wallet; lookalikes of existing names are blocked.
          </p>
        </div>

        <button
          className="btn-primary w-full"
          disabled={name.length < 3}
          onClick={handleSignup}
        >
          Pick @username &amp; Open Profile
        </button>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted pt-1 border-t border-line/60">
          <ProveXSoon />
          <span>Private uniqueness check is not live yet.</span>
        </div>
      </div>
    </div>
  )
}
