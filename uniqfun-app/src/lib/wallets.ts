/**
 * Wallet helpers. These ONLY ask a wallet to share its public address or switch chain.
 * No signing, no transactions, no seed phrases, no custody.
 */

import { CHAIN } from '../config'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<any>
  isPhantom?: boolean
  isMetaMask?: boolean
  isRabby?: boolean
}

function phantomSolana(): any | null {
  const w = window as any
  const p = w.phantom?.solana
  if (p?.isPhantom) return p
  if (w.solana?.isPhantom) return w.solana
  return null
}

export const hasPhantom = () => typeof window !== 'undefined' && !!phantomSolana()
export const isPhone = () => typeof navigator !== 'undefined' && /iphone|ipad|android/i.test(navigator.userAgent)

export async function connectPhantom(): Promise<string> {
  const p = phantomSolana()
  if (!p) throw new Error('Phantom is not installed in this browser.')
  const res = await p.connect()
  const addr = res?.publicKey?.toString() ?? p.publicKey?.toString()
  if (!addr) throw new Error('Phantom did not share an address.')
  return addr
}

export interface EvmWallet {
  name: string
  provider: Eip1193
}

const isPhantomName = (name: string, rdns?: string) => /phantom/i.test(name) || /phantom/i.test(rdns ?? '')

/** Discover injected EVM wallets (EIP-6963). Phantom is filtered out so there is only ONE Phantom button. */
export function discoverEvmWallets(): Promise<EvmWallet[]> {
  if (typeof window === 'undefined') return Promise.resolve([])
  return new Promise((resolve) => {
    const found: EvmWallet[] = []
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent).detail
      const name: string | undefined = d?.info?.name
      if (name && d?.provider && !isPhantomName(name, d?.info?.rdns) && !found.some((f) => f.name === name))
        found.push({ name, provider: d.provider })
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      const eth = (window as any).ethereum as Eip1193 | undefined
      if (!found.length && eth && !eth.isPhantom)
        found.push({ name: eth.isRabby ? 'Rabby' : eth.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: eth })
      resolve(found)
    }, 250)
  })
}

const PLACEHOLDER_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001',
  '0x3690000000000000000000000000000000000369',
  '0x7770000000000000000000000000000000000777',
])

const KECCAK_ROTC = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
]
const KECCAK_PILN = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
]
const KECCAK_RNDC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
]
const MASK_64 = 0xffffffffffffffffn

function rotl64(x: bigint, n: number): bigint {
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK_64
}

/** Pure Keccak-256 (original Keccak padding 0x01) for EIP-55 address checksumming. */
export function keccak256Hex(asciiInput: string): string {
  const rate = 136
  const inputBytes = new Uint8Array(asciiInput.length)
  for (let i = 0; i < asciiInput.length; i++) inputBytes[i] = asciiInput.charCodeAt(i) & 0xff

  const paddedLen = Math.ceil((inputBytes.length + 1) / rate) * rate
  const buf = new Uint8Array(paddedLen)
  buf.set(inputBytes)
  buf[inputBytes.length] = 0x01
  buf[paddedLen - 1] |= 0x80

  const state = new Array<bigint>(25).fill(0n)

  for (let offset = 0; offset < paddedLen; offset += rate) {
    for (let i = 0; i < 17; i++) {
      let lane = 0n
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(buf[offset + i * 8 + b]) << BigInt(8 * b)
      }
      state[i] ^= lane
    }

    for (let round = 0; round < 24; round++) {
      const c = new Array<bigint>(5).fill(0n)
      for (let x = 0; x < 5; x++) {
        c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
      }
      for (let x = 0; x < 5; x++) {
        const t = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1)
        for (let y = 0; y < 25; y += 5) {
          state[y + x] = (state[y + x] ^ t) & MASK_64
        }
      }
      let t = state[1]
      for (let i = 0; i < 24; i++) {
        const j = KECCAK_PILN[i]
        const tmp = state[j]
        state[j] = rotl64(t, KECCAK_ROTC[i])
        t = tmp
      }
      for (let y = 0; y < 25; y += 5) {
        const row = [state[y], state[y + 1], state[y + 2], state[y + 3], state[y + 4]]
        for (let x = 0; x < 5; x++) {
          state[y + x] = (row[x] ^ (~row[(x + 1) % 5] & row[(x + 2) % 5])) & MASK_64
        }
      }
      state[0] = (state[0] ^ KECCAK_RNDC[round]) & MASK_64
    }
  }

  let hex = ''
  for (let i = 0; i < 4; i++) {
    const lane = state[i]
    for (let b = 0; b < 8; b++) {
      const byte = Number((lane >> BigInt(8 * b)) & 0xffn)
      hex += byte.toString(16).padStart(2, '0')
    }
  }
  return hex
}

/** Converts a 40-hex 0x address to its EIP-55 checksummed representation. */
export function toChecksumAddress(address: string): string {
  const trimmed = address.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error('Invalid Ethereum/PulseChain address format.')
  }
  const lower = trimmed.slice(2).toLowerCase()
  const hash = keccak256Hex(lower)
  let out = '0x'
  for (let i = 0; i < 40; i++) {
    const ch = lower[i]
    if (ch >= 'a' && ch <= 'f') {
      out += parseInt(hash[i], 16) >= 8 ? ch.toUpperCase() : ch
    } else {
      out += ch
    }
  }
  return out
}

/**
 * Validates that an address is a real, non-placeholder, EIP-55 checksummed 0x address.
 * Rejects null/empty strings, placeholder/demo addresses (0x000...0001, 0x369...0369),
 * and any address whose casing does not match its EIP-55 checksum.
 */
export function isValidChecksumAddress(address: string | null | undefined): address is string {
  if (!address || typeof address !== 'string') return false
  const trimmed = address.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return false
  const lower = trimmed.toLowerCase()
  if (PLACEHOLDER_ADDRESSES.has(lower)) return false
  if (/^0xd{20,}[0-9a-f]*$/i.test(trimmed)) return false
  return trimmed === toChecksumAddress(trimmed)
}

export async function connectEvm(w: EvmWallet): Promise<string> {
  const accounts = await w.provider.request({ method: 'eth_requestAccounts' })
  const a = accounts?.[0]
  if (!a || typeof a !== 'string') throw new Error('That wallet did not share an address.')
  return toChecksumAddress(a)
}

/** Read current chainId from an injected EVM provider. */
export async function readEvmChainId(provider: Eip1193): Promise<number | null> {
  try {
    const hex = await provider.request({ method: 'eth_chainId' })
    const id = typeof hex === 'string' ? parseInt(hex, 16) : Number(hex)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

/** Read real on-chain PLS balance directly from PulseChain RPC (Mainnet 369 or Testnet v4 943). */
export async function fetchPulseChainBalance(address: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<number | null> {
  const cfg = CHAIN[network]
  try {
    const res = await fetch(cfg.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data?.result !== 'string') return null
    const wei = BigInt(data.result)
    return Number(wei) / 1e18
  } catch {
    return null
  }
}

/** Prompt injected EVM wallet to switch/add PulseChain (369 or 943). */
export async function switchToPulseChain(network: 'mainnet' | 'testnet' = 'mainnet'): Promise<number> {
  const wallets = await discoverEvmWallets()
  const provider = wallets[0]?.provider ?? ((window as any).ethereum as Eip1193 | undefined)
  if (!provider) throw new Error('No EVM browser wallet found.')
  const cfg = CHAIN[network]
  const hexChainId = '0x' + cfg.id.toString(16)
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    })
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hexChainId,
            chainName: cfg.name,
            nativeCurrency: { name: cfg.symbol, symbol: cfg.symbol, decimals: 18 },
            rpcUrls: [cfg.rpcUrl],
            blockExplorerUrls: [cfg.explorerUrl],
          },
        ],
      })
    } else {
      throw err
    }
  }
  return cfg.id
}

export const short = (a: string) => (a.length < 12 ? a : a.slice(0, 5) + '…' + a.slice(-4))
