import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PLATFORM_USERNAME, PLS_USD } from '../config'
import { DEX_PREPAY_USD, LAUNCH_FEE_PLS, MIGRATION_DEV_BONUS_PLS, TOTAL_SUPPLY, fmtNum, fmtUsd, newCurve, quoteBuy } from '../lib/model'
import { validateAntiReplica } from '../lib/usernames'
import { launchCoin, useStore } from '../state/store'
import { Badge, CoinBanner, CoinLogo, DevInfoLine, Notice, PageHead } from '../components/ui'

const PRESETS: [string, number][] = [['0', 0], ['5,000,000', 5_000_000], ['10,000,000', 10_000_000], ['50,000,000', 50_000_000]]

export default function Launch() {
  const s = useStore()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [story, setStory] = useState('')
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [bannerUrl, setBannerUrl] = useState<string>('')
  const [xUrl, setXUrl] = useState<string>('')
  const [websiteUrl, setWebsiteUrl] = useState<string>('')
  const [dev, setDev] = useState(0)
  const [largeAllocConfirmed, setLargeAllocConfirmed] = useState(false)
  const [prepayDex, setPrepayDex] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const me = s.username
  const q = dev > 0 ? quoteBuy(newCurve(), dev) : null
  const devSupplyPct = q && q.ok ? (q.tokens / TOTAL_SUPPLY) * 100 : 0
  const needsLargeAllocConfirm = devSupplyPct > 5 && !largeAllocConfirmed

  const replicaWarning =
    ticker.length >= 3 || name.trim().length >= 2
      ? validateAntiReplica(name, ticker, s.coins)
      : null

  const myLaunched = me ? s.coins.filter((c) => c.launcher === me.name) : []

  function readFileAsDataUrl(file: File | undefined, cb: (dataUrl: string) => void) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') cb(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function submit() {
    if (needsLargeAllocConfirm) {
      setLargeAllocConfirmed(true)
      return
    }
    const r = launchCoin({
      name,
      ticker,
      story,
      devBuyPls: dev,
      logoUrl: logoUrl || undefined,
      bannerUrl: bannerUrl || undefined,
      xUrl: xUrl.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      prepayDex,
    })
    if (r.error) return setErr(r.error)
    nav(`/coin/${r.ticker}`)
  }

  return (
    <div className="max-w-2xl">
      <PageHead
        eyebrow="Launch on PulseChain"
        title="Start a New Coin"
        sub="About 79.3% of supply (793.1M tokens) is placed in the bonding curve. At 200M PLS, it migrates automatically to PulseX with LP locked forever in an immutable vault."
      />
      {!me ? (
        <div className="card">
          <p>You need to connect your wallet before you can launch.</p>
          <Link to="/pass" className="btn-primary mt-4">Connect wallet</Link>
        </div>
      ) : (
        <div className="card grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DevInfoLine launcher={me.name} />
            {myLaunched.length > 0 && (
              <p className="text-xs text-muted">
                Your coins:{' '}
                {myLaunched.map((c, idx) => (
                  <span key={c.ticker}>
                    {idx > 0 ? ' · ' : ''}
                    <Link className="text-violet-soft underline" to={`/coin/${c.ticker}`}>
                      {c.curve.graduated ? '👑 ' : ''}${c.ticker}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>

          {/* Live Visual Preview of Token Banner + Logo */}
          <div className="inset-panel overflow-hidden">
            <div className="relative h-28 w-full overflow-hidden border-b border-line/60">
              <CoinBanner ticker={ticker || 'UNIQ'} bannerUrl={bannerUrl || undefined} className="h-full w-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
            </div>
            <div className="px-4 pb-4 pt-0 flex items-end gap-3 -mt-8 relative z-10">
              <CoinLogo
                ticker={ticker || 'UNIQ'}
                logoUrl={logoUrl || undefined}
                className="h-16 w-16 rounded-2xl border-2 border-bg shadow-lg"
              />
              <div className="pb-0.5">
                <p className="text-xs font-semibold text-violet-soft">${ticker || 'TICKER'}</p>
                <p className="font-display text-lg leading-tight">{name || 'Your Token Name'}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Token Logo (Square Image)</label>
              <div className="mt-2 flex items-center gap-2">
                <label className="btn-ghost !py-2 !px-3 text-xs cursor-pointer">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => readFileAsDataUrl(e.target.files?.[0], setLogoUrl)}
                  />
                </label>
                {logoUrl && (
                  <button type="button" onClick={() => setLogoUrl('')} className="text-xs text-muted underline">
                    Reset
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted">Upload PNG/JPG or leave blank for auto-emblem.</p>
            </div>
            <div>
              <label className="label">Token Banner (Wide Header)</label>
              <div className="mt-2 flex items-center gap-2">
                <label className="btn-ghost !py-2 !px-3 text-xs cursor-pointer">
                  Upload Banner
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => readFileAsDataUrl(e.target.files?.[0], setBannerUrl)}
                  />
                </label>
                {bannerUrl && (
                  <button type="button" onClick={() => setBannerUrl('')} className="text-xs text-muted underline">
                    Reset
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted">Shown at the top of your coin card &amp; page.</p>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="n">Name</label>
            <input id="n" className="input mt-2" maxLength={28} value={name} onChange={(e) => { setName(e.target.value); setErr(null) }} placeholder="Solar Forge" />
          </div>
          <div>
            <label className="label" htmlFor="t">Ticker (3–8 letters)</label>
            <input id="t" className="input mt-2 uppercase" maxLength={8} value={ticker} onChange={(e) => { setTicker(e.target.value.replace(/[^a-z]/gi, '').toUpperCase()); setErr(null) }} placeholder="FORGE" />
            {replicaWarning && <Notice kind="error">{replicaWarning}</Notice>}
          </div>
          <div>
            <label className="label" htmlFor="st">One-line story</label>
            <input id="st" className="input mt-2" maxLength={160} value={story} onChange={(e) => setStory(e.target.value)} placeholder="What is this coin about?" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="xurl">Official X (Twitter) Link (optional)</label>
              <input
                id="xurl"
                className="input mt-2"
                value={xUrl}
                onChange={(e) => setXUrl(e.target.value)}
                placeholder="https://x.com/yourproject"
              />
            </div>
            <div>
              <label className="label" htmlFor="weburl">Website Link (optional)</label>
              <input
                id="weburl"
                className="input mt-2"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourproject.com"
              />
            </div>
            <p className="sm:col-span-2 text-[11px] text-muted -mt-2">
              X + Website only — no Telegram spam groups required.
            </p>
          </div>
          <div>
            <p className="label">Initial Buy (optional, in PLS — about 79.3% of supply in curve)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map(([l, v]) => (
                <button
                  key={l}
                  onClick={() => {
                    setLargeAllocConfirmed(false)
                    setDev(v)
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm ${dev === v ? 'border-violet bg-violet text-white' : 'border-line'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <input
              className="input mt-2"
              inputMode="numeric"
              value={dev ? String(Math.round(dev)) : ''}
              placeholder="0"
              onChange={(e) => {
                setLargeAllocConfirmed(false)
                setDev(Number(e.target.value.replace(/\D/g, '')) || 0)
              }}
            />
            {q?.ok && (
              <p className="mt-2 text-sm">
                You receive <strong>{fmtNum(q.tokens)}</strong> tokens ({devSupplyPct.toFixed(2)}% of supply) · fee {fmtNum(q.fee)} PLS ({fmtUsd(q.fee * (s.plsUsd || PLS_USD))}){q.graduates ? ' · bonds & migrates to PulseX immediately' : ''}
              </p>
            )}
            {devSupplyPct > 5 && (
              <div className="mt-2 rounded-xl border border-amber-400/70 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-200">
                You're buying {devSupplyPct.toFixed(2)}% of supply. This will be shown publicly as a large dev allocation.
              </div>
            )}
          </div>

          {/* Optional In-Curve $299 DexScreener Pre-Pay Toggle */}
          <label className="inset-panel border border-up/50 p-3.5 flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-center gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={prepayDex}
                onChange={(e) => setPrepayDex(e.target.checked)}
                className="h-4 w-4 accent-emerald-400"
              />
              <span className="font-semibold text-up">
                🦅 Pay DEX (${DEX_PREPAY_USD} USD ≈ {fmtNum(Math.round(DEX_PREPAY_USD / (s.plsUsd || PLS_USD)))} PLS)
              </span>
            </div>
            <Badge tone="up">Auto-Relay to DexScreener</Badge>
          </label>

          {/* Clean Fee & Rewards Summary */}
          <div className="inset-panel p-3.5 grid gap-1.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-fg">
                Creation Fee: {(s.freeLaunchPasses?.[me.name] ?? 0) > 0 ? '0 PLS (Free Pass)' : `${fmtNum(LAUNCH_FEE_PLS)} PLS (${fmtUsd(LAUNCH_FEE_PLS * (s.plsUsd || PLS_USD))})`}
              </span>
              {(s.freeLaunchPasses?.[me.name] ?? 0) > 0 ? (
                <Badge tone="up">🎉 {s.freeLaunchPasses[me.name]} Free Launch Pass</Badge>
              ) : (
                <Badge tone="violet">100% to @{PLATFORM_USERNAME}</Badge>
              )}
            </div>
            <p className="text-muted">
              <strong>Curve (1.25%):</strong> 0.50% Holders · 0.25% Creator · 0.50% @{PLATFORM_USERNAME} &nbsp;|&nbsp; <strong>Bond (2%):</strong> +{fmtNum(MIGRATION_DEV_BONUS_PLS)} PLS Creator &amp; 👑 Crown &nbsp;|&nbsp; After migration: PulseX LP fees (0.22%) from the locked LP, split 40% holders / 20% creator / 40% platform.
            </p>
          </div>

          <button className="btn-primary" disabled={!!replicaWarning} onClick={submit}>
            {needsLargeAllocConfirm
              ? `Confirm large dev allocation (${devSupplyPct.toFixed(1)}% of supply)`
              : (s.freeLaunchPasses?.[me.name] ?? 0) > 0
              ? 'Create Coin (Free Pass · 0 PLS Fee)'
              : `Create Coin (${fmtNum(LAUNCH_FEE_PLS)} PLS)`}
          </button>
          {err && <Notice kind="error">{err}</Notice>}
        </div>
      )}
      <div className="mt-8">
        <p className="label">Already launched (retired tickers &amp; protected against replicas)</p>
        <p className="mt-2 text-sm text-muted">{s.coins.map((c) => '$' + c.ticker).join(' · ')}</p>
      </div>
    </div>
  )
}
