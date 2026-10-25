import { useEffect, useState } from 'react'
import { LIBERTY_BRIDGE_URL, LINKS } from '../config'
import {
  connectEvm,
  discoverEvmWallets,
  isValidChecksumAddress,
  keccak256Hex,
  toChecksumAddress,
  type EvmWallet,
} from '../lib/wallets'
import { fmtNum, fmtUsd } from '../lib/model'
import { refreshEvmState, refreshPlsPrice, setEvm, useStore } from '../state/store'
import { Notice, PageHead } from '../components/ui'

export { isValidChecksumAddress, keccak256Hex, toChecksumAddress }
export const LIBERTY_COPY_TOAST = 'Address copied, paste it as the recipient on Liberty Swap.'

export async function copyPulseChainAddress(
  address: string | null | undefined,
  writeText: (text: string) => Promise<void> = (t) => navigator.clipboard.writeText(t)
): Promise<boolean> {
  if (!isValidChecksumAddress(address)) return false
  try {
    await writeText(address)
    return true
  } catch {
    return false
  }
}

export async function triggerLibertyBridge(
  address: string | null | undefined,
  deps: {
    writeText?: (text: string) => Promise<void>
    openUrl?: (url: string, target?: string, features?: string) => unknown
    onToast?: (toast: string) => void
  } = {}
): Promise<{ ok: boolean; toast?: string }> {
  if (!isValidChecksumAddress(address)) return { ok: false }
  const write = deps.writeText ?? ((t: string) => navigator.clipboard.writeText(t))
  const open = deps.openUrl ?? ((u: string, target?: string, feat?: string) => window.open(u, target, feat))
  try {
    await write(address)
  } catch {
    // Continue opening bridge even if clipboard permission was denied
  }
  deps.onToast?.(LIBERTY_COPY_TOAST)
  open(LIBERTY_BRIDGE_URL, '_blank', 'noopener,noreferrer')
  return { ok: true, toast: LIBERTY_COPY_TOAST }
}

export function attachBridgeFocusRefresh(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  getAddress: () => string | null,
  onRefresh: (address: string) => void | Promise<void>
): () => void {
  const handler = () => {
    const addr = getAddress()
    if (isValidChecksumAddress(addr)) {
      void onRefresh(addr)
    }
  }
  target.addEventListener('focus', handler)
  return () => target.removeEventListener('focus', handler)
}

export default function Bridge() {
  const s = useStore()
  const [evms, setEvms] = useState<EvmWallet[]>([])
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const plsAddress = isValidChecksumAddress(s.evm) ? s.evm : null

  useEffect(() => {
    discoverEvmWallets().then(setEvms)
  }, [])

  // Auto-refresh PLS balance when the user returns to the uniq.pulse tab (on window focus)
  useEffect(() => {
    return attachBridgeFocusRefresh(
      window,
      () => (isValidChecksumAddress(s.evm) ? s.evm : null),
      async (addr) => {
        await refreshEvmState(addr)
        await refreshPlsPrice()
      }
    )
  }, [s.evm])

  async function handleConnectPulseChain() {
    setErr(null)
    if (evms.length > 0) {
      try {
        const rawAddr = await connectEvm(evms[0])
        const checksummed = toChecksumAddress(rawAddr)
        if (!isValidChecksumAddress(checksummed)) {
          setErr('Connected wallet returned an invalid address.')
          return
        }
        const r = setEvm(checksummed, evms[0].name)
        if (r.error) setErr(r.error)
        return
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not connect wallet.')
        return
      }
    }
    setErr('No PulseChain wallet detected. Install Rabby, MetaMask, or Internet Money to connect.')
  }

  async function handleCopy() {
    if (!plsAddress) return
    const ok = await copyPulseChainAddress(plsAddress)
    if (!ok) {
      setErr('Invalid or non-checksummed PulseChain address.')
      return
    }
    setCopied(true)
    setToast('PulseChain address copied to clipboard.')
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleBridgeFromSolana() {
    if (!plsAddress) return
    const res = await triggerLibertyBridge(plsAddress, {
      onToast: (t) => {
        setCopied(true)
        setToast(t)
        setTimeout(() => setCopied(false), 3500)
      },
    })
    if (!res.ok) {
      setErr('Connect a valid checksummed PulseChain wallet first.')
    }
  }

  return (
    <div className="max-w-xl mx-auto grid gap-5">
      <PageHead
        eyebrow="Liberty Swap · Cross-Chain Bridge"
        title="Bridge to PulseChain."
        sub="One-click copy your PulseChain address and bridge from Solana via Liberty Swap."
      />

      {/* Seed Phrase Security Warning */}
      <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
        <strong className="font-semibold text-amber-100">Never share your seed phrase or private key.</strong>{' '}
        uniq.pulse and Liberty Swap will never ask for your seed phrase. Only paste your public 0x recipient address.
      </div>

      {/* Single Clean Bridge Card */}
      <div className="card border-violet/50 bg-gradient-to-br from-surface via-surface to-violet/15 p-6 grid gap-5">
        {/* Liberty Swap Header */}
        <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/libertyswap-logo.png"
              alt="Liberty Swap"
              className="h-14 w-14 rounded-2xl border border-violet/40 object-cover shadow-[0_0_24px_rgba(236,72,153,0.3)]"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl text-fg">Liberty Swap</h2>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Solana (SOL) → PulseChain (PLS)
                {plsAddress && s.realPlsBalance !== null && (
                  <>
                    {' '}
                    · Balance: <strong className="text-fg">{fmtNum(s.realPlsBalance, 2)} PLS</strong> (
                    {fmtUsd(s.realPlsBalance * s.plsUsd)})
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Connected PulseChain Wallet Address OR Connect Wallet Prompt */}
        {plsAddress ? (
          <div className="inset-panel border border-cyan-400/40 p-4 grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-cyan-200">Your PulseChain address</span>
              <span className="text-[11px] text-muted">Only visible to you</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5">
              <code className="font-mono text-xs sm:text-sm text-fg break-all select-all">{plsAddress}</code>
              <button
                type="button"
                disabled={!plsAddress}
                onClick={handleCopy}
                className={`shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  copied ? 'bg-up text-bg' : 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25'
                }`}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-amber-300">
              Double-check this is your PulseChain address. Bridges can&apos;t be reversed.
            </p>
          </div>
        ) : (
          <div className="inset-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">No PulseChain wallet connected</p>
              <p className="text-xs text-muted">Connect your PulseChain wallet first so you can copy your recipient address.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-bold text-muted opacity-40 cursor-not-allowed"
              >
                Copy
              </button>
              <button type="button" onClick={handleConnectPulseChain} className="btn-primary !py-2.5 !px-4 text-xs">
                Connect PulseChain wallet
              </button>
            </div>
          </div>
        )}

        {/* Big "Bridge from Solana" Button (disabled until PulseChain wallet is connected) */}
        <button
          type="button"
          disabled={!plsAddress}
          onClick={handleBridgeFromSolana}
          className="btn-primary w-full !py-4 text-base font-bold shadow-[var(--shadow-glow)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Bridge from Solana
        </button>

        {toast && <Notice kind="ok">{toast}</Notice>}
        {err && <Notice kind="error">{err}</Notice>}

        {/* Short 3-Step Guide */}
        <ol className="inset-panel p-4 grid gap-2 text-xs text-fg">
          <li className="flex items-center gap-2.5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/25 text-[11px] font-bold text-violet-soft">
              1
            </span>
            <span>Connect Phantom on Liberty Swap</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/25 text-[11px] font-bold text-violet-soft">
              2
            </span>
            <span>Paste your PulseChain address as the recipient</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/25 text-[11px] font-bold text-violet-soft">
              3
            </span>
            <span>Come back here to trade</span>
          </li>
        </ol>

        {/* Small Official PulseChain Bridge Fallback Link */}
        <div className="flex items-center justify-between pt-1 border-t border-line/60 text-xs text-muted">
          <span>Bridging from Ethereum Mainnet instead?</span>
          <a
            href={LINKS.pulsechainBridge}
            target="_blank"
            rel="noreferrer"
            className="text-violet-soft underline hover:text-fg"
          >
            Official PulseChain bridge ↗
          </a>
        </div>
      </div>
    </div>
  )
}
