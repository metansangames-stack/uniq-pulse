# uniq.pulse — Antigravity Agent Handoff & Workspace Rules

Welcome to the **uniq.pulse** repository! This file (`AGENTS.md`) is automatically loaded by Google Antigravity whenever this workspace is opened, giving your agent full context on the project architecture, immutable math invariants, test suite, and live deployment.

---

## 1. Live Production & Deployment Info
- **Live Production URL**: `https://uniq-pulse-demo.netlify.app`
- **Netlify Project Name / ID**: `uniq-pulse-demo` (`083443a7-6a61-42b7-bd67-bb787aafbb88`)
- **App Directory**: `uniqfun-app/` (Vite + React 19 + TypeScript + Tailwind v4 + Lightweight-Charts v5)
- **Smart Contracts Directory**: `contracts/` (Foundry / Solidity `^0.8.24`)

### Common Commands (run inside `uniqfun-app/`)
- **Install dependencies**: `npm install`
- **Start local dev server (`127.0.0.1:5173`)**: `npm run dev`
- **Run all 59 unit & integration tests**: `npm test -- --run`
- **Build production bundle (`dist/`)**: `npm run build`
- **Deploy to Netlify**: `netlify deploy --prod --dir=dist --site=083443a7-6a61-42b7-bd67-bb787aafbb88`

---

## 2. Core Protocol & Math Invariants (DO NOT BREAK)
All bonding curve, fee, migration, and reward calculations live in `uniqfun-app/src/lib/model.ts` and `uniqfun-app/src/state/store.ts` and are verified by `59/59` tests in `uniqfun-app/src/lib/model.test.ts`:

1. **Token Supply (`1,000,000,000` = `1B`)**:
   - `TOTAL_SUPPLY = 1_000_000_000`
   - `CURVE_TOKENS = 800_000_000` (`80%` sold on bonding curve)
   - `LP_RESERVED_TOKENS = 200_000_000` (`20%` reserved for PulseX LP at migration)
   - Virtual reserves: `T0 = 1_073_000_000`, `T1 = 273_000_000`, `GRAD_PLS = 200_000_000`, `V0 = (GRAD_PLS * T1) / CURVE_TOKENS = 68_250_000 PLS`.

2. **Curve Trade Fee (`1.25%` = `125 bps`)**:
   - Every bonding-curve buy/sell charges `1.25%` (`FEE_RATE = 0.0125`), split:
     - **`0.50%`** → Holders Reward Pool (`CURVE_HOLDER_FEE_RATE = 0.005`)
     - **`0.25%`** → Creator / Dev Pool (`CURVE_DEV_FEE_RATE = 0.0025`)
     - **`0.50%`** → Platform Treasury (`CURVE_PLATFORM_FEE_RATE = 0.005`)
   - **Diamond-Hands Rule**: Selling any amount of a coin *before* migration forfeits the seller's unclaimed holder reward share on that coin (`coin.forfeitedHolders[user] = true`).

3. **Graduation / Migration at `200,000,000 PLS`**:
   - **`4,000,000 PLS`** total migration fee (`GRADUATION_FEE_PLS`), split:
     - **`1,500,000 PLS`** → Holders Pool (`GRADUATION_HOLDER_PLS`)
     - **`500,000 PLS`** → Creator Pool (`GRADUATION_DEV_PLS`)
     - **`2,000,000 PLS`** → Platform (`GRADUATION_PLATFORM_PLS`)
   - Remaining **`196,000,000 PLS`** (`GRAD_LP_PLS`) + **`200,000,000` tokens** (`GRAD_LP_TOKENS`) are paired into PulseX LP and burned (`0x...dEaD`).

4. **Post-Migration PulseX LP Fee (`0.22%`) & `RewardsRouter`**:
   - Post-migration trades accrue a `0.22%` LP fee (`POST_MIGRATION_LP_FEE = 0.0022`) into `unharvestedLpFeesPls`.
   - When harvested via `RewardsRouter.harvestVault(coin)` (or `RewardsRouter.claimAll`), LP fees split **`40%` Holders (`0.088%`) / `20%` Creator (`0.044%`) / `40%` Platform (`0.088%`)**.

5. **Launch Fee**:
   - Launching a new coin costs **`50,000 PLS`** (`LAUNCH_FEE_PLS`), routed to Platform launch fees (`platformLaunchPls`).

---

## 3. Key UI Components & Recent Features
- **Pro Trading Chart & Trade Bubbles (`src/components/TradeChart.tsx`, `src/lib/candles.ts`)**:
  - Uses Lightweight-Charts v5 with non-negative price scale clamping (`minValue >= 0`), volume pane (`scaleMargins.top = 0.85`, bar opacity `0.35`), and responsive `ResizeObserver` sizing.
  - **Trade Bubbles (`16px` circles, `0.9` opacity, `1.0` on hover & nearest to current price)**:
    - Your trades: **`B`** (green `#22c55e`) for buy, **`S`** (red `#ef4444`) for sell.
    - Dev trades: **`DB`** (green) for buy, **`DS`** (red) for sell.
    - Followed users: user avatar with `2px` green/red ring (`max 1 bubble per user per candle`; on `1m`/`5m`, filters followed-user trades to `>= 0.5%` of current MC, first buy, or final sell).
    - Bubbles stay clear of the bottom-left `40×30px` TradingView attribution box and never overlap the right-axis price labels.
- **Follow System (`src/state/store.ts`, `src/pages/Users.tsx`, `src/pages/UserProfile.tsx`)**:
  - `followUser(username)`, `unfollowUser(username)`, `isFollowing(username)` persisted in `localStorage` under `uniqpulse:following:<wallet>`.
  - Seeds 2 default followed KOLs (`pls_maxi`, `trench_rat`) when a user's follow list is empty.
- **Rewards & Simpler Fee Breakdown (`src/pages/Rewards.tsx`)**:
  - Publicly viewable without connecting a wallet.
  - Single `"Fee breakdown"` card with `"Total fees collected"` USD/PLS headline, horizontal green/gold/cyan split bar with `%` underneath, 3 click-to-expand accordion rows (`Holders`, `Creators`, `Platform` — one open at a time), and a `"See full breakdown ▾"` toggle for pending LP fees, volumes, and fee rules.
- **Liberty Swap Bridge (`src/pages/Bridge.tsx`, `src/lib/wallets.ts`)**:
  - Enforces strict EIP-55 checksum validation (`isValidChecksumAddress`) before allowing address copy.

---

## 4. Verification Checklist Before Pushing Changes
Always run inside `uniqfun-app/`:
```bash
npm test -- --run
npm run build
```
Both must pass with zero errors before deploying or pushing commits.
