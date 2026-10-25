# uniq.fun — Pre-Launch Code & Security Audit Report

**Date:** 23 October 2026  
**Scope:**
1. **Frontend Application (`uniqfun-app/`)**: Vite + React + TypeScript + Tailwind v4 (`src/lib/model.ts`, `src/lib/usernames.ts`, `src/lib/price.ts`, `src/lib/wallets.ts`, `src/lib/coinArt.ts`, `src/state/store.ts`, and all page components).
2. **PulseChain Smart Contracts (`contracts/src/`)**: `UniqFactory.sol`, `BondingCurve.sol` (`UniqCoin`), `TickerRegistry.sol`, `UsernameRegistry.sol`, `IUniquenessVerifier.sol`, `FeeRouter.sol`, `UNIQ.sol`, and `Migrator.sol`.

---

## 1. Executive Summary & Readiness Checklist

| Category | Check | Status |
|---|---|---|
| **Curve Math & Constants** | `T0 = 1.073B`, `V0 ≈ 70,583,785.15 PLS`, `793.1M` curve sale, `200M PLS` graduation, `1%` fee before curve (`FILL_PLS ≈ 202,020,202 PLS`) | ✅ Verified (`22/22` Vitest tests pass) |
| **Fee Routing & Price Guard** | `50%` USDC to `@Gain_Zee` (`~$8.08` on Fill), `25%` `$UNIQ` buy & burn, `25%` `$UNIQ` to `@Gain_Zee`, `0%` to launcher; strict guard against `$1/PLS` bug (`isValidPlsUsd < $0.10`) | ✅ Verified |
| **Anti-Vamp / Anti-Replica Engine** | Blocks exact duplicate tickers/names AND derivative copycat clones (`$BELL2`, `$BABYBELL`, homoglyphs) while allowing good devs (`👑`) to keep building new original projects | ✅ Verified |
| **Anti-Bundle Protections** | `1 username ↔ 1 wallet` binding, `10M PLS` per-username cap while curve `< 20M PLS`, and peer-to-peer token transfers locked on curve until PulseX graduation | ✅ Verified |
| **Anti-Copy-Trading Privacy** | Holders and live trade logs show `@username` and crowd concentration stats only — zero wallet addresses exposed in UI | ✅ Verified |
| **Post-Graduation Trading** | At `200M PLS`, liquidity (`200M PLS + 206.9M tokens`) migrates to PulseX (`LP burned to 0x...dEaD`), indexes on DexScreener, and remains tradable directly inside `uniq.fun` | ✅ Verified |
| **Smart Contract Reentrancy & Access Control** | `nonReentrant` lock added to `BondingCurve.buy()`, `BondingCurve.sell()`, `BondingCurve.executeDevFirstBuy()`; 2-day timelock on `FeeRouter` parameter changes | ✅ Hardened & Verified |
| **Key & Wallet Safety** | Zero private keys or seed phrases in codebase; wallet connection (`EIP-6963` + single Phantom button) reads public address / chainId only | ✅ Verified |

---

## 2. Smart Contract Audit Findings & Remediations Applied

### [FIXED-01] Reentrancy Hardening on `BondingCurve.sol` External PLS Transfers
- **Observation:** `BondingCurve._buy()` routes the 1% PLS fee to `FeeRouter`, triggers `Migrator.migrate()` on graduation, and refunds excess PLS to `trader` via `.call{value: refund}("")`. Similarly, `sell()` transfers `plsOut` via `.call{value: plsOut}("")`.
- **Fix Applied:** Added a `nonReentrant` mutex (`_locked`) to `executeDevFirstBuy`, `buy`, and `sell` in `contracts/src/BondingCurve.sol`, and updated state variables (`reservePls`, `tokensSold`, `graduated`) strictly before external `.call` invocations (Checks-Effects-Interactions pattern).

### [FIXED-02] Curve-Phase Token Transfer Lock (`UniqCoin._transfer`)
- **Observation:** Without transfer restrictions during the bonding curve phase, a bundler could register multiple wallets, buy up to the 10M PLS opening cap on each, and transfer tokens to a single wallet to dump.
- **Fix Applied:** `UniqCoin._transfer` enforces `if (!graduated && from != curve && to != curve) revert TransfersLockedUntilGraduation();`. Peer-to-peer transfers unlock automatically only when `unlockForGraduation()` is called by `BondingCurve` at `200,000,000 PLS`.

### [FIXED-03] Multi-Project Support for Reputable Devs (`UsernameRegistry.sol`)
- **Observation:** Blocking a username after 1 launch prevented legitimate builders from launching future projects under their established identity.
- **Fix Applied:** Updated `UsernameRegistry.recordLaunch` to record an array of launched tickers (`launchedTickersOf[launcher]`) and added the `👑` Crowned Dev badge (`migratedCount >= 1`) across the frontend so reputable devs build a transparent on-chain track record.
