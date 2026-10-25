# Paste this into Antigravity

> Open the unzipped `handoff/` folder as the workspace first, so the agent can read the files it references.
> **Never give Antigravity (or any agent) a seed phrase or private key, and never connect it to a real wallet.**

---

You are rebuilding **uniq.fun**, a PulseChain memecoin launch desk, as a clean, editable project, and then wiring it up for real in phases. The name is always written **uniq.fun** (lowercase, with the dot) in the logo wordmark, page titles, meta and og tags, the manifest and all copy. The old Grok build spelled it differently; never use any other spelling. The workspace contains:
- `uniqfun-app/`: **Phase 1 is already done. Start from this project.** It's Vite + React + TypeScript + Tailwind v4 + React Router. Run `npm install && npm run dev`, `npm test` and `npm run build`. Read its README first. Math lives in `src/lib/model.ts` (tested), config in `src/config.ts`, the demo store in `src/state/store.ts`.
- `PRODUCT_BRIEF.md`: **the source of truth.** Follow it exactly. If anything conflicts, the brief wins.
- `README.md`: the page inventory, the rules, real vs mocked, **brief-vs-bundle mismatches to fix**, and **regressions to guard against**.
- `CURVE_MATH.md`: the curve constants and expected numbers (use these as test fixtures).
- `preview/*.png`: screenshots of `uniqfun-app/` (current design). `screenshots/*.png`: the old Grok site, reference only.
- `original-build/`: the compiled HTML/JS/CSS of the current site. **Reference only, not source.** `original-build/assets/shell-*.js` contains the working model logic (curve, fees, caps, username and launch rules, localStorage store); `coin._ticker-*.js` contains the candle chart; `styles-*.css` has the theme tokens. Read them to match behaviour and copy text. Do not copy the minified code.

Work phase by phase. Stop at the end of each phase, summarize what you did, and list open questions.

## Phase 1: editable rebuild (no blockchain). ✅ DONE, see `uniqfun-app/`
Phase 1 is complete. Don't redo it. Keep its stack (Vite, not Next.js), its simple UX (short nav Home · Coins · Launch · Bridge · $UNIQ + username button; one primary action per page) and its tests green. The spec below is kept for reference. Where it differs from `uniqfun-app/`, the app wins: routes are `/coins` and `/uniq` (with redirects from `/board` and `/token`), "Back this coin" was removed, an "Install Phantom" link is allowed on desktop, and `@Gain_Zee` is `PLATFORM_USERNAME` (reserved, not pre-registered). In Phase 2/3, replace `src/state/store.ts` with on-chain reads and writes, and keep `src/lib/model.ts` as the spec your contracts must match.

Stack: **Next.js (App Router) + React + TypeScript + Tailwind CSS**. Vite + React + TanStack Router is fine if you prefer. Use pnpm, ESLint, Prettier, and Vitest for unit tests.

Look and brand:
- Dark navy-black theme with a **PulseChain violet** accent, not gold and not a Pump.fun pill. Tokens: bg `#07060c`, surface `#120c1c`, raised `#1c1230`, line `#3d2770`, fg `#f6f3ff`, muted `#a89bc4`, accent `#8000ff`, candle up `#3ddc97`, candle down `#ff5c7a`, card radius 1.25rem, rounded-full buttons.
- Fonts: **Fraunces** for display and **Outfit** for body, via `next/font`.
- Logo: a shield with a white U and a violet sweep. Copy the SVG paths from `original-build/route_root.html`. Wordmark "uniq" + violet ".fun". Tagline **"Each ticker launches once."**
- Remove all Grok artifacts (`grok.com/grok-app-builder/extensions.js`, `/__grok/*`, the "Grok App" manifest).

Pages (match the screenshots): `/` Home, `/bridge`, `/pass` (Username), `/launch`, `/board`, `/coin/[ticker]`, `/token` ($UNIQ). Also build the shared header (nav: Home · Bridge · Board · Launch · Username · $UNIQ), the stats strip, and the footer disclaimer.

Architecture:
- Put all economics in a pure, tested module `lib/model/` (curve, fees, caps, registries, $UNIQ pool), separate from the UI. Keep a `ModelAdapter` interface so Phase 2 and 3 can swap the localStorage implementation for on-chain reads and writes without touching the pages.
- Constants: `TOTAL_SUPPLY = 1_000_000_000`, `CURVE_TOKENS = 793_100_000`, `GRAD_PLS = 200_000_000`, `T0 = 1_073_000_000`, `V0 = GRAD_PLS * (T0 - CURVE_TOKENS) / CURVE_TOKENS` (≈70,583,785), `FEE = 0.01`, `OPEN_WINDOW_PLS = 20_000_000`, `OPEN_CAP_PLS = 10_000_000`, `DESK_START_PLS = 1_000_000_000`.
- Buy: fee = 1% of spend, taken **before** the curve; net goes into constant-product `(V0+reserve)(T0−sold)=k`. Sell: compute PLS out on the curve, then take the 1% fee. Fill = `GRAD_PLS / 0.99`. Graduate when reserve ≥ 200M.
- Fee split per trade: 50% USDC to @Gain_Zee (converted at the PLS **USD price**), 25% buys $UNIQ from its pool and burns it, 25% buys $UNIQ for @Gain_Zee. **Launchers get nothing.**
- $UNIQ: a separate 1B-capped token with its own PLS pool and chart. Fee buys move the chart; burns don't. Coins are bought with PLS only.
- Market cap = latest price × 1B, **shown in USD**. The PLS price comes from a `PriceSource` interface (Phase 1: constant `0.000008`).
- Chart: SVG or lightweight-charts **candles, one per trade**, green if up and red if down, with a **plain-dollar** axis (`$7,734`): no scientific notation, no K/M. Trade log under the chart: username, tokens, PLS.
- Holders: username count, largest share, top 10 share. **Never addresses.**
- /bridge: exactly **one** Connect Phantom button (`window.phantom.solana`). Discover other wallets via EIP-6963 and filter out Phantom. On desktop, give the toolbar instructions only, with **no phantom.com link**. On mobile, use the Phantom app deep link. The only bridge link is **https://bridge.pulsechain.com**. No swap, no custody, never ask for a seed phrase.
- Seed the same 6 demo coins (BELL, ACRE, LANT, CLRW, KIND, THRD) behind a clearly labelled "demo mode".

Fix these known issues (README "mismatches"): add the tagline; describe ProveX as **not built**, never as live; soften the anti-bundle copy to "harder, not impossible"; remove the `@{PLATFORM.username}` placeholder bug; drop or justify the desktop phantom.com install links (ask me); make "Back this coin" sell $UNIQ into its pool for PLS first (or remove it); add a post-graduation "Migrated to PulseX" state.

Tests (Vitest), required: every item in README "Known-bug regressions", plus the numbers in `CURVE_MATH.md`: launch mcap ≈ $526.25; graduated mcap ≈ $7,734 (966.72M PLS must never be rendered as a balance); Fill ≈ 202,020,202 PLS and it migrates; exactly 200M does not migrate; Fill fee USDC ≈ $8.08, not ≈1,010,101; desk after Fill ≈ 797,979,798 PLS; the 10M cap applies to later buys under 20M but not to the dev's first buy.

Deliverable: `pnpm dev` runs, every page matches its screenshot, tests pass, and there's a README.

## Phase 2: wallets + PulseChain reads
- Add wagmi + viem with the PulseChain chain configs (mainnet **369**, testnet v4 **943**; take the RPC URLs from the official PulseChain docs and put them in env vars, never hardcoded secrets). Add an injected-wallet connector, a network-switch prompt, and the real PLS balance in the stats strip.
- Implement a live `PriceSource` for PLS/USD (e.g. CoinPaprika API or a PulseX pool TWAP) with caching and a fallback. Every USD number uses it.
- Keep the app in demo mode for trading until Phase 3 contracts exist. The UI must clearly say "demo / not on-chain".

## Phase 3: contracts on PulseChain testnet (Solidity, Foundry)
Write these EVM contracts, matching `lib/model` behaviour 1:1:
1. **`UniqFactory`**: creates a coin (ERC-20, 1B supply, 793.1M to the curve, the remainder reserved for migration liquidity), checks the registries, and runs the optional dev first buy (a PLS amount, exempt from the opening cap).
2. **`BondingCurve`** (one per coin or a singleton): virtual-reserve constant product (T0, V0 as above), 1% fee before the curve on buys, fee on output for sells, `minOut`/deadline slippage protection, the per-username 10M PLS cap while reserve < 20M, and trading only for registered usernames. It graduates at 200M real PLS.
3. **`TickerRegistry`**: a ticker and a name each launch once, forever (normalized).
4. **`UsernameRegistry`**: username ↔ exactly one wallet; one launch per username; exposes `isRegistered(address)` for gating.
5. **`IUniquenessVerifier`**: a pluggable hook called at username signup, intended for **ProveX. ProveX is NOT built.** Ship a no-op or allowlist stub, mark it clearly as not built in code and UI, and never claim uniqueness proofs are live.
6. **`FeeRouter`**: splits each fee 50% → swap to USDC (PulseChain USDC) → @Gain_Zee's address; 25% → buy $UNIQ → burn; 25% → buy $UNIQ → @Gain_Zee. Recipient and params live behind a multisig + timelock. Nothing goes to launchers, and there is no migration reward.
7. **`UNIQ`**: a capped 1B ERC-20 + its PulseX PLS pool.
8. **`Migrator`**: at graduation, create the PulseX pair, add the curve's PLS + reserved tokens, **burn the LP tokens** (send to the dead address), and close the curve.

Also: Foundry unit, fuzz and invariant tests (k never decreases, no PLS created, caps enforced, the CURVE_MATH fixtures hold). Deploy to **testnet 943**. Build an event indexer (Ponder or Envio → Postgres) that feeds the board, the candles (one per trade), the trade log and the crowd stats, keeping addresses out of the public API. Then swap the `ModelAdapter` to on-chain. Use only testnet keys from a throwaway wallet, kept in a local `.env` that is never committed.

## Phase 4: audit and mainnet
- Freeze the code, get an independent audit, fix the findings, and publish the report. Launch a bug bounty.
- Deploy to mainnet 369 from a hardware wallet; hand admin to a multisig with a timelock; verify the contracts on the explorer.
- Host the front end on Vercel or Cloudflare Pages on the `uniq.fun` domain; host the indexer and DB on a managed host; add monitoring and alerts.
- Legal sign-off first: terms, privacy, risk disclosures, geo-restrictions, and fee-recipient disclosure. Memecoin launchpads carry real legal risk (Pump.fun is facing a RICO suit). Never market it as "unruggable" or "bundle-proof".

Rules for you, the agent: never request, store or print a seed phrase or private key; never connect to a wallet holding real funds; ask before adding any dependency that touches keys.
