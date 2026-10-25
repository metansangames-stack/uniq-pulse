# uniq.pulse app (Phase 1: editable front end, demo only)

> **Demo.** Everything runs in your browser's `localStorage` (key `uniqpulse-demo-v5`). No real PLS or SOL moves and nothing is on-chain yet. Connecting a wallet only reads its address. Nothing is signed or sent. Never paste a seed phrase or private key anywhere.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: curve, fee and username rules (18 tests)
npm run build    # type-check + production build into dist/
npm run preview  # serve dist/ on :4173
```
Node 18+ required. Stack: Vite 6, React 18, TypeScript, Tailwind CSS v4, React Router 6. No other runtime dependencies.

## Where things live
| Path | What |
|---|---|
| `src/config.ts` | **The one config file.** `PLS_USD` (constant for now, with a TODO to fetch the live price), PulseChain chain config (369 / 943), `PLATFORM_USERNAME = 'Gain_Zee'`, links, storage key |
| `src/lib/model.ts` | **All curve and fee math.** Pure, no React. Constants, buy/sell quotes, Fill, graduation, opening-window cap, fee split, $UNIQ pool, dollar formatters |
| `src/lib/model.test.ts` | Vitest tests for the numbers in `../CURVE_MATH.md` and the username rules |
| `src/lib/usernames.ts` | Username validation: case-insensitive, lookalikes and homoglyphs blocked (0/o, 1/l/I, 5/s, rn/m, Cyrillic…), one username per wallet, reserved names |
| `src/lib/wallets.ts` | Phantom (Solana) and EIP-6963 EVM wallet discovery. Reads the address only |
| `src/state/store.ts` | The demo store (localStorage) and every action: create username, launch, buy, sell, buy $UNIQ, fee routing, reset. **Swap this for on-chain reads and writes in Phase 2/3** |
| `src/pages/*` | Home, Coins, CoinPage, Launch, Bridge, Uniq.tsx ($UNIQ), Username (`/pass`) |
| `src/components/*` | Layout (header/nav/footer), Logo, Candles (SVG chart), small UI pieces |
| `e2e-flows.mjs` | Optional click-through script (Playwright) used to test every flow against `npm run preview` |

## Routes
`/` Home · `/coins` · `/coin/:ticker` · `/launch` · `/bridge` · `/uniq` · `/pass` (username). Old paths redirect: `/board → /coins`, `/token → /uniq`, `/username → /pass`.

## Rules the code enforces (demo)
- Each ticker and each name launches once. One launch per username.
- A username is bound to exactly one wallet. A different connected wallet can't trade as it, and a bound wallet can't register a second username.
- `@Gain_Zee` (`PLATFORM_USERNAME`) is **reserved**, not pre-registered. Halo registers it himself at launch. It labels the "Platform fees earned by @Gain_Zee" panel. Everywhere else shows the logged-in user's own username.
- 1% fee taken before the curve: 50% USDC to @Gain_Zee, 25% buys and burns $UNIQ, 25% buys $UNIQ for @Gain_Zee. Launchers get nothing. The treasury starts at zero.
- Fill = 202,020,202 PLS. Exactly 200,000,000 doesn't migrate. At 200M in the curve the coin shows "Migrated to PulseX — LP burned (simulated)".
- While the curve holds under 20M PLS, each username can add 10M PLS total. The dev's first buy is exempt.
- ProveX is shown as "coming soon, not live". It is not built.

## Not done yet (Phase 2+)
Live PLS price, real wallet balances and signing, contracts, indexer, real PulseX migration, ProveX. See `../ANTIGRAVITY_PROMPT.md`.
