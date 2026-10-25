import { Link } from 'react-router-dom'
import { PLATFORM_USERNAME } from '../config'
import { Shield } from '../components/Logo'
import { PageHead } from '../components/ui'

export const HOW_IT_WORKS_SECTIONS = [
  {
    title: '1. Launching',
    body: `Creating a new coin on uniq.pulse costs a flat 500,000 PLS creation fee (paid to @${PLATFORM_USERNAME}). Every ticker and name is unique and launches once. Every token has a fixed 1,000,000,000 supply with 0% token transfer tax, no minting, no pausing, and no blacklist.`,
  },
  {
    title: '2. Bonding curve',
    body: `About 79.3% of the supply (793,100,000 tokens) is sold along the constant-product bonding curve up to 200,000,000 PLS. Bonding-curve trades pay a 1.25% fee split strictly in PLS: 0.50% (40% of the fee) to the coin's Holder Pool, 0.25% (20% of the fee) to the coin's Creator Pool, and 0.50% (40% of the fee) to the @${PLATFORM_USERNAME} platform.`,
  },
  {
    title: '3. Rewards locked until migration at 200M PLS',
    body: `Holder and creator rewards accrued during the bonding curve stay locked until the coin fills its 200,000,000 PLS curve and migrates to PulseX. Sell any amount before migration and you forfeit all your unclaimed rewards on that coin. They go to the holders who stayed.`,
  },
  {
    title: '4. Migration to PulseX',
    body: `When the curve reaches 200,000,000 PLS, a 4,000,000 PLS graduation fee (2,000,000 PLS platform / 1,500,000 PLS Holder Pool / 500,000 PLS Creator Pool) is deducted, 196,000,000 PLS and matching tokens are paired on PulseX V2 at the exact final curve price (with the remaining ~4.15M curve LP tokens burned), and the PulseX LP tokens are locked forever in an immutable vault (UniqLpFeeVault) where nobody can ever withdraw the principal liquidity.`,
  },
  {
    title: '5. After migration',
    body: `Once on PulseX, the 1.25% bonding-curve fee is no longer charged. Instead, the locked LP position earns the PulseX V2 LP fee share inside the immutable vault. When harvested, those LP fees are split 40% to holders, 20% to the creator, and 40% to the platform.`,
  },
  {
    title: '6. One Rewards tab with Claim all',
    body: `All of your holder and creator rewards across every coin are shown in one place on the Rewards page. A single "Claim all" button harvests any eligible vaults (50,000 PLS minimum threshold) and pays out all of your claimable PLS rewards in one transaction.`,
  },
  {
    title: '7. Bridge from Solana via Liberty Swap',
    body: `Coming from Solana? Connect your PulseChain wallet on the Bridge page, copy your verified EIP-55 checksummed 0x address, and bridge SOL or USDC to native PLS via Liberty Swap. Your PLS balance refreshes automatically when you return to the tab.`,
  },
  {
    title: '8. Safety: never share your seed phrase',
    body: `uniq.pulse will never ask for, store, or print your seed phrase or private key. Always verify your destination 0x address inside your own wallet extension before signing or bridging.`,
  },
] as const

export default function Uniq() {
  return (
    <div className="max-w-4xl mx-auto grid gap-6">
      <div className="flex flex-wrap items-center gap-5">
        <Shield withHalo className="h-16 w-16" />
        <div className="flex-1 min-w-[260px]">
          <PageHead
            eyebrow="uniq.pulse · Protocol Guide"
            title="How uniq.pulse works"
            sub="Plain rules for launching, bonding-curve fees, immutable PulseX LP vaults, and claiming holder & creator rewards."
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {HOW_IT_WORKS_SECTIONS.map((sec) => (
          <section key={sec.title} className="card grid gap-2">
            <h2 className="font-display text-lg text-fg">{sec.title}</h2>
            <p className="text-sm text-muted leading-relaxed">{sec.body}</p>
          </section>
        ))}
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Demo environment — no real funds move and no transactions are signed.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/launch" className="btn-primary !py-2 !px-4 text-xs">
            Launch a coin
          </Link>
          <Link to="/rewards" className="btn-ghost !py-2 !px-4 text-xs">
            Open Rewards
          </Link>
          <Link to="/bridge" className="btn-ghost !py-2 !px-4 text-xs">
            Bridge from Solana
          </Link>
        </div>
      </div>
    </div>
  )
}
