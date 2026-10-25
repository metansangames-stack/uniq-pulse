# Curve math sanity check

Inputs from `PRODUCT_BRIEF.md`: supply S = 1,000,000,000; the curve sells 793,100,000 tokens; graduation happens at 200,000,000 PLS of real reserve; the fee is 1% before the curve; PLS is about $0.000008.
The brief doesn't state a virtual token reserve. The live bundle uses the Pump.fun value **T0 = 1,073,000,000** (`f=1073e6` in `assets/shell-*.js`).

Constant product: `(V0 + realPLS) × (T0 − tokensSold) = k`

- Tokens left at graduation: T1 = T0 − 793.1M = **279,900,000**
- Require (V0 + 200M) × T1 = V0 × T0, which gives **V0 = 200M × T1 / 793.1M = 70,583,785.15 PLS** (virtual PLS). The bundle has the same value: `m = 2e8*2799e5/7931e5`.
- k = V0 × T0 ≈ 7.5736 × 10^16

| | Price (PLS/token) | Mcap in PLS (×1B) | Mcap in USD @ $0.000008 |
|---|---|---|---|
| Launch (empty curve) | V0/T0 = 0.0657817 | 65.78M | **$526.25** |
| Graduation (200M real PLS) | (V0+200M)/T1 = 0.9667159 | 966.72M | **$7,733.73 ≈ $7,734 ✅** |

So the brief's $7,734 is correct. Note that **966.72M is market cap counted in PLS**. That is the "PLS shown as a balance" bug from the brief, and it must never be shown as cash or as a wallet balance. Actual cash in a full curve is 200M PLS ≈ **$1,600**.

Fill and fees:
- Fill = 200M / 0.99 = **202,020,202 PLS**. The fee is 2,020,202 PLS ≈ $16.16. **The USDC half to @Gain_Zee is ≈ $8.08** ✅. The buggy "1 PLS = $1" version gives ≈ 1,010,101 USDC ❌.
- The desk wallet after Fill: 1B − 202.02M = **797.98M PLS** ✅
- A dev buy of exactly 200M puts 198M net into the curve (≈791.0M tokens). That is below 200M, so it **does not migrate** ✅

Caveat: the graduation mcap depends on T0. If you pick a different virtual token reserve, V0 is re-derived and the end mcap changes. Keep T0 = 1.073B so the numbers match the brief.
