# original-build/ — reference only, NOT editable source

These files were downloaded from the live site https://timber-mint-harbor-yellow.grok.me on 2026-10-23.
They are the **compiled/minified production output** of Grok's app builder (React + TanStack Router/Start SSR,
Tailwind CSS v4, Recharts). You cannot meaningfully edit them. Use them only to:
- read exact copy/text, numbers and logic (e.g. `assets/shell-*.js` holds the whole demo "engine": bonding curve math, fee split, username/one-launch rules, localStorage state),
- copy design tokens (`assets/styles-*.css`: colors, fonts, radius),
- check behaviour while rebuilding.

Files
- route_*.html — server-rendered HTML for each page (/, /pass, /bridge, /board, /launch, /token, /coin/<TICKER> x6)
- assets/index-*.js — React + router runtime (framework code)
- assets/shell-*.js — layout, nav, demo state store, curve math, all trade/launch/username logic  ← most useful
- assets/routes-*.js (home), pass-*.js, bridge-*.js, board-*.js, launch-*.js, token-*.js (+Recharts), coin._ticker-*.js
- assets/styles-*.css — Tailwind build with theme variables
- favicon.svg, og.jpg (social card), icon-180.png, manifest.webmanifest (still says "Grok App")
