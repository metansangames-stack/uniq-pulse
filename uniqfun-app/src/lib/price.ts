/**
 * Phase 2+: Up-to-the-second Live Native Token Price Feed (PLS, SOL, ETH)
 * powered by DexScreener On-Chain Pair Feeds (same feed architecture as trade.padre.gg)
 * + CoinPaprika fallback.
 * Never allows PLS/USD <= 0 or >= $1 (guards against the 1 PLS = $1 regression).
 */
import { PLS_USD } from '../config'

export const DEFAULT_SOL_USD = 102.45
export const DEFAULT_ETH_USD = 2540.0

export interface PriceQuote {
  price: number
  source: 'live' | 'fallback'
  updatedAt: number
}

export interface MultiChainPrices {
  plsUsd: number
  solUsd: number
  ethUsd: number
  plsChange24h?: number
  solChange24h?: number
  ethChange24h?: number
  source: 'live' | 'fallback'
  updatedAt: number
}

export interface PriceSource {
  getPrice(): Promise<PriceQuote>
  getMultiChainPrices(): Promise<MultiChainPrices>
}

const CACHE_TTL_MS = 8_000
let cachedQuote: PriceQuote | null = null
let cachedMulti: MultiChainPrices | null = null

export function isValidPlsUsd(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0 && price < 0.1
}

async function fetchDexScreenerTokenPrice(
  tokenAddress: string,
  expectedChainId: string
): Promise<{ price: number; change24h: number } | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data?.pairs)) return null
    const matching = data.pairs
      .filter((p: { chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }) =>
        p?.chainId === expectedChainId && Number(p?.priceUsd) > 0
      )
      .sort(
        (a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
          (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0)
      )
    const best = matching[0]
    if (!best) return null
    const price = Number(best.priceUsd)
    const change24h = Number(best?.priceChange?.h24) || 0
    if (Number.isFinite(price) && price > 0) {
      return { price, change24h }
    }
  } catch {
    // Ignore network error and fall through
  }
  return null
}

async function fetchCoinPaprikaPrice(tickerId: string): Promise<{ price: number; change24h: number } | null> {
  try {
    const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${tickerId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const price = Number(data?.quotes?.USD?.price)
    const change24h = Number(data?.quotes?.USD?.percent_change_24h) || 0
    if (Number.isFinite(price) && price > 0) {
      return { price, change24h }
    }
  } catch {
    // Ignore
  }
  return null
}

export class LivePlsPriceSource implements PriceSource {
  private readonly fallbackPrice: number

  constructor(fallbackPrice = PLS_USD) {
    this.fallbackPrice = fallbackPrice
  }

  async getMultiChainPrices(): Promise<MultiChainPrices> {
    const now = Date.now()
    if (cachedMulti && now - cachedMulti.updatedAt < CACHE_TTL_MS) {
      return cachedMulti
    }

    const [plsDex, solDex, ethDex] = await Promise.all([
      fetchDexScreenerTokenPrice('0xA1077a294dDE1B09bB078844df40758a5D0f9a27', 'pulsechain'),
      fetchDexScreenerTokenPrice('So11111111111111111111111111111111111111112', 'solana'),
      fetchDexScreenerTokenPrice('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'ethereum'),
    ])

    let pls = plsDex && isValidPlsUsd(plsDex.price) ? plsDex : null
    let sol = solDex && solDex.price > 5 && solDex.price < 10_000 ? solDex : null
    let eth = ethDex && ethDex.price > 100 && ethDex.price < 100_000 ? ethDex : null

    if (!pls) {
      const cp = await fetchCoinPaprikaPrice('pls-pulsechain')
      if (cp && isValidPlsUsd(cp.price)) pls = cp
    }
    if (!sol) {
      const cp = await fetchCoinPaprikaPrice('sol-solana')
      if (cp && cp.price > 5) sol = cp
    }
    if (!eth) {
      const cp = await fetchCoinPaprikaPrice('eth-ethereum')
      if (cp && cp.price > 100) eth = cp
    }

    const anyLive = Boolean(pls || sol || eth)
    cachedMulti = {
      plsUsd: pls ? pls.price : this.fallbackPrice,
      solUsd: sol ? sol.price : DEFAULT_SOL_USD,
      ethUsd: eth ? eth.price : DEFAULT_ETH_USD,
      plsChange24h: pls?.change24h ?? 0,
      solChange24h: sol?.change24h ?? 0,
      ethChange24h: eth?.change24h ?? 0,
      source: anyLive ? 'live' : 'fallback',
      updatedAt: now,
    }
    cachedQuote = {
      price: cachedMulti.plsUsd,
      source: pls ? 'live' : 'fallback',
      updatedAt: now,
    }
    return cachedMulti
  }

  async getPrice(): Promise<PriceQuote> {
    const now = Date.now()
    if (cachedQuote && now - cachedQuote.updatedAt < CACHE_TTL_MS) {
      return cachedQuote
    }
    const multi = await this.getMultiChainPrices()
    return {
      price: multi.plsUsd,
      source: multi.source,
      updatedAt: multi.updatedAt,
    }
  }
}

export const defaultPriceSource = new LivePlsPriceSource(PLS_USD)
