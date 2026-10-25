/**
 * uniq.pulse — single place for price + chain + platform config.
 * No secrets live here (or anywhere in this app). Wallet connect only reads an address.
 */

/**
 * Fallback PLS price in USD. ≈ $0.000008 (CoinPaprika, 23 Oct 2026) per PRODUCT_BRIEF.md.
 * Phase 2 live PriceSource in src/lib/price.ts fetches the live PLS/USD price,
 * caches it, and falls back to this constant. Never price 1 PLS at $1.
 */
export const PLS_USD = 0.000008

/* eslint-disable @typescript-eslint/no-explicit-any */
const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {}

/** PulseChain (EVM) chain configs (369 Mainnet / 943 Testnet v4) with env var overrides. */
export const CHAIN = {
  mainnet: {
    id: 369,
    name: 'PulseChain',
    symbol: 'PLS',
    rpcUrl: (env.VITE_PULSECHAIN_RPC_URL as string) || 'https://rpc.pulsechain.com',
    explorerUrl: 'https://scan.pulsechain.com',
  },
  testnet: {
    id: 943,
    name: 'PulseChain Testnet v4',
    symbol: 'tPLS',
    rpcUrl: (env.VITE_PULSECHAIN_TESTNET_RPC_URL as string) || 'https://rpc.v4.testnet.pulsechain.com',
    explorerUrl: 'https://scan.v4.testnet.pulsechain.com',
  },
  dex: 'PulseX',
} as const

/**
 * The official platform account (`@uniq_pulse` -> `x.com/uniq_pulse`).
 * Keeps personal founder handles completely separate & undoxxed.
 * Reserved so nobody else can claim it (or a lookalike), and carries the exclusive
 * Sovereign Shield Platform Dev Badge across the site.
 */
export const PLATFORM_USERNAME = 'uniq_pulse'

/**
 * Configured EIP-55 checksummed Platform Treasury wallet address, read from VITE_PLATFORM_WALLET.
 * If missing, platform fee vault claims are disabled ("Platform wallet not configured").
 */
export const PLATFORM_WALLET = ((env.VITE_PLATFORM_WALLET as string) || '').trim()

export const SITE_URL = (
  (env.VITE_SITE_URL as string) ||
  (typeof window !== 'undefined' && window.location?.origin?.startsWith('https:')
    ? window.location.origin
    : 'https://uniq.pulse')
).replace(/\/$/, '')

export const OG_IMAGE_URL = `${SITE_URL}/og.png?v=3`

export const PLATFORM = {
  site: 'uniq.pulse',
  tagline: 'Each ticker launches once.',
  dev: PLATFORM_USERNAME,
  devTwitter: 'https://x.com/uniq_pulse',
  platformX: (env.VITE_UNIQ_X_URL as string) || 'https://x.com/uniq_pulse',
} as const

/** Liberty Swap cross-chain bridge URL (no URL prefill params). */
export const LIBERTY_BRIDGE_URL =
  (env.VITE_LIBERTY_BRIDGE_URL as string) || 'https://libertyswap.finance'

export const LINKS = {
  /** Primary cross-chain bridge (Liberty Swap). */
  libertyBridge: LIBERTY_BRIDGE_URL,
  /** Official PulseChain bridge fallback link. */
  pulsechainBridge: 'https://bridge.pulsechain.com',
  /** Install link only (allowed on desktop). Never a phantom.com swap link on desktop. */
  phantomInstall: 'https://phantom.com/download',
  /** Phantom app deep link — used on phones only. Sell SOL, receive ETH on Ethereum. */
  phantomMobileSwap: 'https://phantom.com/ul/v1/swap?sell=solana%3A101%2Fslip44%3A501&buy=eip155%3A1%2Fslip44%3A60',
} as const

export const STORAGE_KEY = 'uniqpulse-demo-v5'
