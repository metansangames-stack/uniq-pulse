# uniq.pulse: handoff pack

**For:** Halo's buddy (Antigravity user) · **Prepared:** 23 Oct 2026
**Source of truth:** `PRODUCT_BRIEF.md` (Halo's official brief). If anything here disagrees with it, the brief wins.
**Live preview:** https://timber-mint-harbor-yellow.grok.me (pages: `/`, `/pass`, `/bridge`, `/board`, `/launch`, `/token`, `/coin/<TICKER>`)
**Grok project id:** `01a16a10-af52-7f02-bdb8-861b537c73f1`
**Chain: PulseChain** (EVM; mainnet chain id 369, testnet v4 chain id 943; get current RPCs from the official PulseChain docs). The trade currency is PLS. Graduation goes to PulseX.

> ⚠️ **Never paste a seed phrase or private key anywhere.** That means no chat, no AI agent (Grok, Antigravity, anything), no repo, no `.env` you share. Don't connect either AI agent to a wallet. Deployer and admin keys belong in a hardware wallet or a multisig.

## TL;DR
uniq.pulse is a launch desk meant to fix Pump.fun. Each ticker launches once, one username is bound to one wallet, holders are shown as usernames (no addresses), and trading is in PLS. When the curve fills, the coin migrates to PulseX and the LP is burned.

**What exists today is a front-end model only.** There are no launch contracts, no ProveX verifier, no custody, and no shared board. Every coin, username and trade lives in that one browser's `localStorage` (key `uniqfun-state-v7`). Your copy of the link starts fresh: you won't see Halo's coins, username or trades. The site footer says it too: *"Interactive model of uniq.pulse. Not wired to PulseChain. No real funds move."*

**Phase 1 is done:** `uniqfun-app/` is a clean, editable Vite + React + TypeScript + Tailwind rebuild with all 10 mismatches below fixed, the curve and fee math in one tested module, and a simpler UX. **Start from `uniqfun-app/`** (`npm install && npm run dev`; see its README). `preview/` has screenshots of it. Phases 2–4 below and in `ANTIGRAVITY_PROMPT.md` are unchanged.

Grok and Antigravity don't share a session. The published link is view-only for you. Antigravity can't edit the published copy. You either get the source exported from Grok, or rebuild it (see `ANTIGRAVITY_PROMPT.md`).

## Pack contents
| Path | What |
|---|---|
| `PRODUCT_BRIEF.md` | Halo's official product brief (**source of truth**) |
| `README.md` | This file |
| `uniqfun-app/` | **Start here.** Phase 1 editable source (Vite + React + TS + Tailwind), demo mode, tests |
| `preview/*.png` | Screenshots of `uniqfun-app/` (desktop 1440 + mobile 390, `overview.png`) |
| `ANTIGRAVITY_PROMPT.md` | Ready-to-paste prompt for Antigravity, phases 1–4 |
| `CURVE_MATH.md` | Derived virtual reserves and the checked numbers |
| `screenshots/*.png` | 1440px renders of the **old** Grok site (reference only) |
| `original-build/` | Raw compiled HTML/JS/CSS from the live site. **Reference only, not editable source** (see `original-build/README_FIRST.md`). `assets/shell-*.js` holds all the model logic |

## Brand
- Logo: a shield with a white **U** and a **violet** sweep on a navy-black ground. PulseChain violet, not the Pump.fun pill. Wordmark: **uniq.pulse** (lowercase, with the dot; "uniq" in white, ".pulse" in violet). The old Grok build used a different spelling in the logo, page title and share card; `uniqfun-app/` uses "uniq.pulse" everywhere. Tagline: **"Each ticker launches once."**
- Tokens from the live CSS: `bg #07060c`, `surface #120c1c`, `raised #1c1230`, `line #3d2770`, `fg #f6f3ff`, `muted #a89bc4`, accent `#8000ff` (violet; the CSS variable is misleadingly called `gold`). Candles are up `#3ddc97` and down `#ff5c7a`. Card radius is 1.25rem.
- Fonts: **Fraunces** for display and **Outfit** for body (Google Fonts).
- Current stack (compiled): React + TanStack Router/Start (SSR), Tailwind v4, plus Recharts (bundled in the /token chunk; it doesn't appear to draw the coin candles, which are hand-drawn SVG). The page also loads Grok's `extensions.js` and `/__grok/*`, which should be removed.

## Pages and features (live site)
Nav: Home · Bridge · Board · Launch · Username · $UNIQ. The stats strip under the nav shows Your PLS, the $UNIQ price, @Gain_Zee's UNIQ, fee USDC, and the current username.
1. **`/` Home.** "One ticker. Then PulseX." 4-step flow (Get PLS → One username → Launch once → Trade, then PulseX), the "Three locks" card, the fee-split card, a ProveX explainer, and a board preview.
2. **`/bridge`.** Three steps for Solana users: (1) a single **Connect Phantom** button for the SOL address, plus buttons for other injected EVM wallets (MetaMask/Rabby, found via EIP-6963, with Phantom filtered out so there's only one Phantom button); (2) swap SOL→ETH *on Ethereum* inside Phantom via the toolbar icon on desktop, or a Phantom app deep link on phones; (3) **https://bridge.pulsechain.com** only. It reads addresses and nothing else: no swap, no custody, no seed phrase.
3. **`/pass` Username.** 3–16 chars `[a-z0-9_]`, with an optional 0x wallet (blank means a random demo address). The ProveX step is *pretend*. One username per browser.
4. **`/launch`.** Name 2–28 chars, ticker 3–8 letters, story 8–160 chars. Dev first buy is an amount **in PLS** (presets 0 / 10M / 50M / 200M / Fill). One launch per username; tickers and names are retired forever. Lists retired tickers.
5. **`/board`.** Coin, curve %, mcap (USD), volume (PLS), and window state (Open / Pass only).
6. **`/coin/<TICKER>`.** Mcap in USD, PLS cash in the curve, price per token, the candle chart, the trade log, buy/sell with 1M/10M/50M presets, the fee line, and holders (username count, largest share, top 10 %, no addresses).
7. **`/token` $UNIQ.** Platform-dev holdings (UNIQ, USDC), burned, price, pool, its own chart, buy with PLS, Burn, "Back this coin", "Where a 100 PLS buy goes", "What this desk will not do", and Reset.

Demo coins: BELL Harbor Bell, ACRE North Acre, LANT Lantern Row, CLRW Clearwater, KIND Kindling, THRD Goldthread.

## The rules (from the brief; the rebuild must match these exactly)
**Curve** (matches PumpTires' graduation idea, not their factory; uniq.pulse coins are not listed on PumpTires)
- Supply is 1,000,000,000. The curve sells **793,100,000** (79.31%) and then migrates.
- Graduation needs **200,000,000 PLS of real reserve**. PumpTires publishes 200M, not 216M.
- The curve is constant product with virtual reserves scaled so that selling 793.1M deposits exactly 200M PLS: **T0 = 1,073,000,000 virtual tokens, V0 ≈ 70,583,785 virtual PLS** (see `CURVE_MATH.md`).
- **A 1% fee is taken from the spend before PLS enters the curve.**
- **Fill ≈ 202.02M PLS**, so ≈200M lands in the curve and the coin migrates. A spend of exactly 200M leaves ≈198M in the curve, which is not enough to migrate.
- **Anti-bundle cap:** while the curve holds **< 20M PLS**, each username can add at most **10M PLS total**. The dev's first buy on Launch is **exempt**.
- In the model, the dev account starts with **1.00B PLS** of play money; after a Fill it holds ≈797.98M.

**Market cap:** the latest price × all 1B tokens, **shown in USD** at the real PLS price (≈$0.000008 per CoinPaprika, 23 Oct 2026). A filled curve is ≈ **$7,734** mcap, while the cash in the curve is 200M PLS ≈ $1,600.

**Fees:** 1% of each trade. **50% → USDC to @Gain_Zee · 25% → buy-and-burn $UNIQ · 25% → $UNIQ to @Gain_Zee.** Launchers get **nothing**, and there's no migration reward. The fee on one Fill is ≈ **$8.08 USDC**.

**$UNIQ:** a separate capped token (1B supply) with its own PLS pool and chart. Fee buys move its chart; burns don't. Coins are bought with **PLS, not $UNIQ**; $UNIQ is not the quote asset.

**Chart and trades:** candles, one per buy or sell. Green if price rose, red if it fell. The axis is in plain dollars like `$7,734`: no scientific notation, no K/M. Under the chart is a trade log with username, tokens bought or sold, and PLS spent or received. Trades made before the log existed (e.g. the original Fill) won't appear.

**Holders:** usernames plus crowd stats (count, largest share, top 10). **Never addresses.** Concentration stays visible.

**Honesty:** a username is one human and one public wallet, which makes same-block bundles harder, **not impossible**. Scripted multi-account bundles can still happen. Hiding addresses in the UI doesn't hide them on-chain. **ProveX is not built**, so never claim it's live.

## Real vs mocked
| Thing | Status |
|---|---|
| Design, copy, navigation | ✅ real, but compiled (needs export or rebuild) |
| Phantom / EVM wallet connect on /bridge | ⚠️ real, **address read only**: no signing, no balances, no chain switch |
| Links to bridge.pulsechain.com and the Phantom mobile deep link | ✅ real |
| Curve math, fee split, caps, one-launch and unique-ticker rules | ✅ implemented correctly **as a browser model** (spec for the contracts) |
| Coins, holders, crowd stats, volumes, treasury starting numbers | ❌ hardcoded demo data |
| PLS balance (1B), SOL balance (12.5) | ❌ play money |
| Buy / sell / launch / username / burn / back-this-coin | ❌ localStorage only, per browser |
| PLS price | ❌ hardcoded `$0.000008` constant (no live feed) |
| ProveX | ❌ not built |
| Contracts, contract addresses, RPC URLs, chain id, indexer, API, DB | ❌ **none in the code** (the only server hook is the framework's `/_serverFn`) |

## Brief vs live bundle: mismatches found
Verified as matching: T0/V0 and the 793.1M / 200M constants, the 1%-before-curve fee, Fill = 200M/0.99, exactly-200M not migrating, the 10M cap under 20M with the dev buy exempt, the 1B desk balance, the PLS-denominated dev-buy box with all presets, the fee split with USDC computed at $0.000008 (not $1), $UNIQ as a separate pool (fee buys move its chart, burns don't), green/red per-trade candles with a dollar axis, the trade log, username-only holders, the single Phantom button, no phantom.com *swap* link on desktop, and bridge.pulsechain.com only.

Mismatches and bugs found in the old Grok build (**all fixed in `uniqfun-app/`**: tagline added, "Launch platform" removed, ProveX badged "coming soon, not live", "harder, not impossible" copy, @Gain_Zee from config, Install-Phantom-only link on desktop, "Back this coin" removed, simulated "Migrated to PulseX — LP burned" state, treasury starts at zero with uniq.pulse manifest/title/og, plain full-dollar chart axis; the live PLS price is still a TODO in `src/config.ts`):
1. **The tagline "Each ticker launches once." is not on the site.** The full logo subtitle says "Launch platform".
2. **ProveX is described in the present tense as if it's live** on Home ("ProveX checks the name inside that signup. One wallet is bound. Every other address fails.") and on /pass. The brief says it's not built and must not be claimed as live.
3. **The anti-bundle claims overreach.** "Every other address, even from the same seed, fails the buy" and "Sibling addresses from the same seed are not registered" go too far. The brief says the design makes bundles harder, not impossible, and the chain can't detect sibling addresses.
4. **/token renders the literal text `@{PLATFORM.username} UNIQ`**, an unfilled template placeholder.
5. **/bridge shows "Get Phantom" / "Install Phantom" links to phantom.com/download on desktop.** The brief says not to send desktop users to phantom.com. These are install links, not the swap link. Halo decided: an "Install Phantom" link is OK, no swap link.
6. **The PLS price is a hardcoded constant.** The brief wants the real PLS price, so production needs a live feed.
7. **"Back this coin" with $UNIQ burns UNIQ and injects its PLS value into the coin's curve** without selling UNIQ into the $UNIQ pool. In effect it creates PLS from nothing. It should be: sell UNIQ for PLS in the pool (which moves the chart), then buy the coin with PLS. Or drop the feature, since coins are bought with PLS.
8. **After graduation the model just closes the curve.** No PulseX pair or LP burn happens; there's nothing to trade post-migration.
9. The treasury starts with preloaded fake numbers (186.4 PLS fees, 1,120 UNIQ). The manifest still says "Grok App".
10. The dollar formatter switches to `$x.xxM` at ≥ $1M and 4 decimals under $1. That's fine at today's numbers, but the chart axis must stay plain dollars per the brief.

## Known-bug regressions to guard against (write tests for each)
- **1 PLS treated as $1.** A Fill's fee must show ≈ $8.08 USDC, not ≈ 1,010,101 USDC.
- **Market cap in PLS shown as a balance.** ≈966.72M PLS is the graduated mcap *counted in PLS*. It's not cash and not the wallet. Show the mcap in USD (≈$7,734) and the curve cash as 200M PLS.
- **The dev-buy box as a percent.** It must be a PLS amount. 200M and Fill must work; the old percent box rejected 200M and the launch silently did nothing.
- **Two Phantom buttons.** Phantom injects both an EVM and a Solana provider, so there must be exactly one Connect Phantom button.
- **A phantom.com swap link on desktop**, a fake SOL→PLS swap, or any custody.
- **Scientific notation or K/M on the chart axis**, or a line chart instead of candles.
- **Addresses leaking** into the holders list or the trade log.
- **The launcher receiving $UNIQ or any migration reward.**
- **Exactly 200M migrating** (it must not), and **Fill not migrating** (it must).
- The 10M opening cap applying to the dev's first buy (it must not), or not applying to later buys under 20M (it must).
- Burns moving the $UNIQ chart (they must not).
- Unfilled template text like `@{PLATFORM.username}`.

## How to get the real source code
Halo should open the project in Grok's app builder (id above) and **check whether it offers code export, download, GitHub sync, or a share/collaborate option**. I couldn't confirm which of these exist, so check rather than assume. This is no longer needed: `uniqfun-app/` is the editable source. Any fixes Halo wants in the *published Grok copy* have to be applied in Grok; Antigravity can't touch it.

## Go-live checklist
**1. Front end**
- [x] Editable source (`uniqfun-app/`: Vite + React + TS + Tailwind); mismatches 1–10 fixed; no Grok scripts or manifest
- [x] Unit tests for the curve, fee and username rules (`npm test`, 18 passing)
- [ ] Live PLS/USD price (TODO in `src/config.ts`)

**2. Smart contracts** (PulseChain EVM, Solidity, Foundry)
- [ ] `UniqFactory`: deploys a coin (ERC-20, 1B supply) + curve; checks the ticker and username registries; handles the dev first buy in PLS
- [ ] `BondingCurve`: virtual reserves T0 = 1.073B / V0 ≈ 70.58M PLS, 793.1M for sale, 1% fee before the curve, the 10M-per-username cap while reserve < 20M (dev buy exempt), slippage and deadline params, graduation at 200M real PLS
- [ ] `TickerRegistry`: a name and a ticker are each usable once, ever (normalized: case, whitespace)
- [ ] `UsernameRegistry`: username ↔ exactly one wallet; one launch per username; gates trading
- [ ] `IUniquenessVerifier`: a pluggable interface for **ProveX, which is not built**; ship with it disabled or a stub, and say so in the UI
- [ ] `FeeRouter`: 50% → swap to USDC → @Gain_Zee's wallet; 25% → buy $UNIQ and burn it; 25% → buy $UNIQ → @Gain_Zee. Recipient set via multisig + timelock
- [ ] `UNIQ` token (capped at 1B) + its PulseX PLS pool
- [ ] `Migrator`: at graduation, create a PulseX pair, add the curve's PLS + remaining tokens, and **burn the LP** (send to 0x…dEaD)
- [ ] Unit, fuzz and invariant tests of the curve math against `CURVE_MATH.md`; deploy to **PulseChain testnet v4 (943)** first

**3. Audit and security**
- [ ] Independent audit before mainnet; publish it; bug bounty
- [ ] Admin keys in a multisig with a timelock; no un-timelocked upgrades; a pause policy
- [ ] Front-end CSP, pinned dependencies, API rate limiting; the UI never asks for a seed phrase

**4. Indexer and backend**
- [ ] Index contract events (Ponder / Envio / The Graph / custom) into Postgres: board, candles (one per trade), trade log, holder crowd stats (keep usernames, not addresses, in the API output)
- [ ] Live PLS/USD price feed (e.g. CoinPaprika or a PulseX TWAP) with a cached fallback
- [ ] Metadata and image storage + moderation for names and stories

**5. Wallet integration**
- [ ] wagmi + viem + an injected-wallet connector with the PulseChain chain config (369 / 943), a network-switch prompt, real balances, tx signing, pending/success/fail UI
- [ ] Keep the /bridge page rules exactly as in the brief

**6. Domain and hosting**
- [ ] Secure `uniq.pulse` (check who owns it); host the front end on **Vercel** or **Cloudflare Pages**; host the indexer and DB on Railway/Render/Fly/a VPS; add monitoring
- [x] og.png, favicon and manifest use uniq.pulse branding (in `uniqfun-app/public/`)

**7. Legal** (do this in parallel, not last)
- [ ] Get a crypto lawyer before mainnet. **Memecoin launchpads carry real legal risk:** Pump.fun is facing a RICO class action that a court allowed to proceed in Aug 2026. A platform token ($UNIQ) whose fees flow to the founder raises securities and consumer-protection questions.
- [ ] Terms, privacy, risk disclosures, geo-restrictions, age gate; disclose the fee recipient plainly
- [ ] Don't market it as "unruggable", "bundle-proof" or "safe". State exactly what the code enforces.

## Secrets
No private keys, seed phrases or API keys are in this pack, and none were found in the site.
