# uniq.anon — product brief (from Halo, 23 Oct 2026)
Site idea: uniq.anon. Native token: $UNIQ. Platform dev: @Gain_Zee (Twitter Gain_Zee). Chain: PulseChain, not Solana.

## What it is
A launch desk meant to fix Pump.fun. One ticker can launch once. One username is bound to one wallet. People trade in PLS. When the curve fills, the coin is supposed to migrate to PulseX and the LP is burned. It does not get listed on PumpTires. PumpTires only lists coins its own factory creates. uniq.anon uses the same graduation idea, not their factory.

## What is wrong with Pump.fun, and the intended fix
- No bundled multi-wallet launches. A username is one human, one public wallet. Other wallets from that person do not count as new buyers. Without a username you cannot trade. This makes a same-block bundle harder because each extra wallet needs its own username. It does not make scripted multi-account bundles impossible.
- No wallet addresses on the holders list, so people cannot copy-trade an address. The page shows usernames plus crowd stats: how many usernames, the largest share, and the top 10 share. Concentration stays visible. Addresses do not.
- No duplicate name or ticker.

## ProveX
The design is an anonymous uniqueness check, in the same signup as the username, so the user never buys ProveX or leaves the site. It is not built. The demo only pretends a pass was issued. Do not claim ProveX is live.

## Curve (match PumpTires, not a guess)
- Total supply 1,000,000,000.
- The curve sells 793,100,000 tokens, then it migrates. That is 79.31% of supply.
- Graduation is 200,000,000 PLS of real bids in the curve. PumpTires publishes 200 million, not ~216 million.
- Virtual reserves are scaled so filling that 793.1 million deposits exactly 200 million PLS. Shape follows the usual Pump.fun constant-product curve, quoted in PLS.
- A 1% fee is taken out of the spend before PLS enters the curve.
- Fill on the launch form spends about 202.02 million PLS. About 200 million lands in the curve and the coin migrates in the model. Spending exactly 200 million leaves about 198 million in the curve, so it does not migrate yet.
- After launch, while the curve holds under 20 million PLS, that username can only add 10 million PLS total. That cap is the anti-bundle rule for later chunk buys. It does not apply to the dev's first buy on the Launch page.

## Dev wallet
@Gain_Zee can set a PLS amount on the first buy at launch. The box is PLS, not a percent. Presets include 0, 10M, 50M, 200M, and Fill. An earlier percent box rejected 200M and the launch did nothing. That was fixed.
The desk account starts with 1.00 billion PLS. Buys spend it. After Fill, the wallet is about 797.98 million PLS. This PLS is play money in the browser. It is not on-chain.

## Market cap
Market cap is the latest price times all 1 billion tokens, shown in USD, not PLS. PLS is priced at about $0.000008 (CoinPaprika, 23 Oct 2026). A filled curve holds 200 million PLS of cash, about $1,600. The market cap is about $7,734. An earlier screen showed 966.72 million PLS. That was the same market cap counted in PLS, not cash and not the user's wallet. Do not show that number as if it were a balance.

## Fees
1% of each trade.
- 50% becomes USDC for @Gain_Zee.
- 25% buys and burns $UNIQ.
- 25% sends $UNIQ to @Gain_Zee.
Coin launchers do not receive $UNIQ. Paying them caused instant dumps, so that reward was removed. There is also no $UNIQ reward for migrating. The USDC figure must use the real PLS price. An early bug treated 1 PLS as $1, so one Fill looked like about 1.01 million USDC. The honest fee is about $8.08. @Gain_Zee can later buy a coin he believes in, help it migrate, or burn $UNIQ himself. He does not dump it.

## $UNIQ
Separate capped token, 1 billion supply, its own PLS pool and chart. Fee buys move that chart. Burns do not. People buy coins with PLS, not with $UNIQ. $UNIQ is the platform token, not the quote asset.

## Chart and trades
Candles, not a trend line. One candle per buy or sell. Green if price rose, red if it fell. Axis is plain dollars, like $7,734. No scientific notation and no K or M on the chart.
Under the chart, a trade log: username, tokens bought or sold, and PLS spent or received. The Fill made before this log existed will not appear. Later trades will.

## Bridge (Solana people)
The official PulseChain bridge does not take Solana. Do not build a fake SOL-to-PLS swap or take custody.
One page, three steps:
1. Connect Phantom for the SOL address. MetaMask, Rabby, or another injected browser wallet can connect for Ethereum. Connecting only shares the address. Never ask for a seed phrase. Phantom injects two wallets, so there must be only one Connect Phantom button.
2. On a computer, do not send them to phantom.com. That link opens another browser. The site cannot pop the extension. They use the Phantom toolbar icon: Swap, sell SOL, receive ETH on Ethereum. Not ETH on Solana. On a phone, a Phantom app link is ok.
3. When that ETH is on Ethereum, open only https://bridge.pulsechain.com and bridge it. Then come back and create a username.

## What is not real
This is a frontend model. Publishing it does not move real PLS or SOL. There are no launch contracts, no ProveX verifier, no custody, and no shared board between two browsers. His copy of a published link starts fresh. He will not see the other person's coins, username, or trades.
Grok Bot and Google Antigravity do not share a session. A published link lets someone look. It does not let Antigravity edit the published copy. Cleanup has to be sent back and applied here.
Do not connect either agent to a wallet. Do not paste a seed phrase anywhere.

## Brand
Logo is a shield with a white U and a violet sweep, navy-black ground. PulseChain violet, not the Pump.fun pill. Wordmark: uniq.anon. Line: "Each ticker launches once."
