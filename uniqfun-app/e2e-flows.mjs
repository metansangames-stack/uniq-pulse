import { chromium } from 'playwright-core'
// Usage: npm run build && npm run preview, then: npm i -D playwright-core && CHROME=/path/to/chrome node e2e-flows.mjs
const B = process.env.BASE || 'http://localhost:4173'
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const results = []
const errors = []
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`) }

async function ctx(fakeWallets = false, addr = '0x1111111111111111111111111111111111111111') {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  if (fakeWallets) await c.addInitScript((addr) => {
    window.__addr = addr
    const sol = { isPhantom: true, connect: async () => ({ publicKey: { toString: () => 'So1anaFakeAddr1111111111111111111111111111' } }) }
    window.phantom = { solana: sol, ethereum: { isPhantom: true, request: async () => [addr] } }
    const mm = { isMetaMask: true, request: async () => [window.__addr] }
    window.ethereum = mm
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { name: 'Phantom', rdns: 'app.phantom' }, provider: window.phantom.ethereum } }))
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { name: 'MetaMask', rdns: 'io.metamask' }, provider: mm } }))
    })
  }, addr)
  const p = await c.newPage()
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push('console ' + m.text()) })
  p.on('dialog', (d) => d.accept())
  return p
}
const text = (p) => p.locator('main').innerText()
const num = (s) => Number(s.replace(/[^\d.]/g, ''))

// --- A: username rules, launch 200M (no migrate), buy/sell, window cap, $UNIQ
let p = await ctx()
for (const r of ['/', '/coins', '/coin/BELL', '/launch', '/bridge', '/uniq', '/pass', '/board', '/token', '/nope']) {
  await p.goto(B + r); await p.waitForTimeout(150)
  ok('route renders ' + r, (await p.locator('main').innerText()).length > 20)
}
await p.goto(B + '/')
ok('home tagline', (await text(p)).includes('launches once.'))
ok('home buttons', await p.getByRole('link', { name: 'Coming from Solana? Start here' }).isVisible() && await p.getByRole('link', { name: 'Browse coins' }).isVisible())
ok('no "Launch platform" subtitle', !(await p.content()).includes('Launch platform'))
ok('only the uniq.pulse spelling', !new RegExp(['Uniq'+'Fun','Re'+'al\\.Fun'].join('|'),'i').test(await p.locator('body').innerText()))
ok('fee panel starts at $0', (await text(p)).includes('$0.00'))
ok('title', (await p.title()).startsWith('uniq.pulse'))

await p.goto(B + '/pass')
const tryName = async (n) => { await p.fill('#name', n); await p.getByRole('button', { name: 'Create username' }).click(); await p.waitForTimeout(100); return text(p) }
ok('reserved Gain_Zee blocked', (await tryName('gain_zee')).includes('reserved'))
ok('lookalike ga1nzee blocked', (await tryName('ga1nzee')).includes('reserved'))
ok('lookalike harb0r blocked', (await tryName('harb0r')).includes('Too close'))
ok('ProveX coming soon shown', (await text(p)).includes('ProveX: coming soon, not live'))
await tryName('halo_test')
ok('logged in indicator', (await p.locator('header').innerText()).includes('Logged in as @halo_test'))
await p.goto(B + '/pass')
ok('pass page shows logged in', (await text(p)).includes('Logged in as @halo_test'))

await p.goto(B + '/launch')
await p.fill('#n', 'Halo Coin'); await p.fill('#t', 'bell'); await p.fill('#st', 'testing the desk')
ok('duplicate ticker warned', (await text(p)).includes('already launched'))
await p.getByRole('button', { name: 'Launch coin' }).click(); await p.waitForTimeout(100)
ok('duplicate ticker refused', p.url().endsWith('/launch'))
await p.fill('#t', 'HALO')
await p.getByRole('button', { name: '200,000,000' }).click()
await p.getByRole('button', { name: 'Launch coin' }).click(); await p.waitForURL('**/coin/HALO')
let t = await text(p)
ok('200M dev buy does not migrate', !t.includes('Migrated to PulseX') && t.includes('198,000,000 of 200,000,000 PLS'))
ok('launcher is logged-in user', t.includes('Launched by @halo_test') && t.includes('@halo_test'))
ok('trade log shows dev buy', /@halo_test \(you\)\s+Bought/.test(t))
ok('balance 800,000,000', (await p.locator('header').innerText()).includes('800,000,000 PLS'))
await p.goto(B + '/launch')
ok('second launch blocked', (await text(p)).includes('One launch per username'))

// buy & sell BELL (24M, past window)
await p.goto(B + '/coin/BELL')
const before = await p.locator('main').innerText()
await p.fill('#amt', '1000000'); await p.getByRole('button', { name: 'Buy $BELL' }).click(); await p.waitForTimeout(150)
t = await text(p)
ok('buy works', t.includes('Bought (demo).') && /@halo_test \(you\)\s+Bought/.test(t))
await p.fill('#amt', '1000000'); ok('fee line in dollars', /Fee 1%: 10,000 PLS \(\$0\.08\)/.test(await text(p)))
await p.getByRole('button', { name: 'Sell', exact: true }).click()
const heldTxt = await p.locator('#amt').inputValue()
await p.getByRole('button', { name: 'Sell $BELL' }).click(); await p.waitForTimeout(150)
t = await text(p)
ok('sell works', t.includes('Sold (demo).') && /@halo_test \(you\)\s+Sold/.test(t), 'sold ' + heldTxt)
ok('holders have no 0x addresses', !/0x[0-9a-f]{6,}/i.test(t))
const axis = await p.locator('svg text').allTextContents()
ok('chart axis plain dollars', axis.length > 0 && axis.every((a) => /^\$[\d,]+(\.\d+)?$/.test(a)), axis.join(' '))
ok('candles green+red present', (await p.locator('svg rect[fill="#3ddc97"]').count()) > 0 && (await p.locator('svg rect[fill="#ff5c7a"]').count()) > 0)

// opening window cap on KIND (8M)
await p.goto(B + '/coin/KIND')
await p.fill('#amt', '10000001')
ok('cap blocks >10M in window', (await text(p)).includes('Opening cap'))
await p.fill('#amt', '10000000'); await p.getByRole('button', { name: 'Buy $KIND' }).click(); await p.waitForTimeout(150)
ok('10M allowed in window', (await text(p)).includes('Bought (demo).'))
await p.fill('#amt', '1000000')
ok('cap used after 10M', (await text(p)).includes('Opening cap used'))

// fill and graduate THRD by buying
await p.goto(B + '/coin/THRD')
await p.fill('#amt', '300000000'); await p.getByRole('button', { name: 'Buy $THRD' }).click(); await p.waitForTimeout(150)
t = await text(p)
ok('buy fills curve and migrates', t.includes('Migrated to PulseX — LP burned (simulated)') && t.includes('$7,734'), (t.match(/\$[\d,]+/g) || []).slice(0, 3).join(' '))
ok('overspend refunded (curve not overfilled)', t.includes('200,000,000 of 200,000,000 PLS'))
ok('graduated curve closed', (await p.getByRole('button', { name: 'Buy $THRD' }).isDisabled()))

// $UNIQ
await p.goto(B + '/uniq')
const c0 = await p.locator('svg rect[rx="1.5"]').count()
await p.fill('#u', '1000000'); await p.getByRole('button', { name: 'Buy $UNIQ' }).click(); await p.waitForTimeout(150)
t = await text(p)
ok('$UNIQ buy works', t.includes('$UNIQ (demo)'))
ok('$UNIQ chart has candles', (await p.locator('svg rect[rx="1.5"]').count()) > c0, `${c0}→${await p.locator('svg rect[rx="1.5"]').count()}`)
ok('no @{PLATFORM placeholder', !t.includes('{PLATFORM'))
ok('$UNIQ page shows @Gain_Zee', t.includes('@Gain_Zee'))
await p.goto(B + '/')
t = await text(p)
const usdc = t.match(/USDC earned\s*\n?\s*(\$[\d.,]+)/)
ok('fee panel updated, sane USDC (<$100)', usdc && num(usdc[1]) > 0 && num(usdc[1]) < 100, usdc?.[1])

// reload persists
await p.reload(); ok('state persists after reload', (await p.locator('header').innerText()).includes('@halo_test'))

await p.goto(B + '/bridge'); await p.waitForTimeout(400)
ok('no Phantom: Install Phantom link only', await p.getByRole('link', { name: 'Install Phantom' }).isVisible() && (await p.getByRole('button', { name: /Phantom/ }).count()) === 0)

// --- B: Fill launch in a fresh browser
p = await ctx()
await p.goto(B + '/pass'); await p.fill('#name', 'filler'); await p.getByRole('button', { name: 'Create username' }).click()
await p.goto(B + '/launch'); await p.fill('#n', 'Fill Test'); await p.fill('#t', 'FILL'); await p.fill('#st', 'fills the curve')
await p.getByRole('button', { name: 'Fill', exact: true }).click()
await p.getByRole('button', { name: 'Launch coin' }).click(); await p.waitForURL('**/coin/FILL')
t = await text(p)
ok('Fill launch migrates', t.includes('Migrated to PulseX — LP burned (simulated)') && t.includes('$7,734'))
ok('balance after Fill 797,979,798', (await p.locator('header').innerText()).includes('797,979,798 PLS'))
await p.goto(B + '/')
const u2 = (await text(p)).match(/USDC earned\s*\n?\s*(\$[\d.,]+)/)
ok('Fill fee USDC = $8.08', u2?.[1] === '$8.08', u2?.[1])

// --- C: bridge + wallet binding with fake injected wallets
p = await ctx(true)
await p.goto(B + '/bridge'); await p.waitForTimeout(500)
const phBtns = await p.getByRole('button', { name: /Phantom/ }).count()
ok('exactly one Phantom button', phBtns === 1, String(phBtns))
ok('MetaMask button present', await p.getByRole('button', { name: 'Connect MetaMask' }).isVisible())
const hrefs = await p.locator('a[href^="http"]').evaluateAll((as) => as.map((a) => a.href))
ok('desktop: no phantom.com swap link', !hrefs.some((h) => /phantom\.com\/ul/.test(h)), hrefs.join(' '))
ok('only bridge is bridge.pulsechain.com', hrefs.filter((h) => /bridge/.test(h)).every((h) => h.startsWith('https://bridge.pulsechain.com')))
await p.getByRole('button', { name: 'Connect Phantom' }).click(); await p.waitForTimeout(150)
ok('Phantom connect reads address', (await text(p)).includes('Phantom shared your SOL address'))
await p.getByRole('button', { name: 'Connect MetaMask' }).click(); await p.waitForTimeout(150)
ok('MetaMask connect reads address', (await text(p)).includes('MetaMask shared its address'))
await p.goto(B + '/pass'); await p.waitForTimeout(400)
ok('pass shows connected wallet to bind', (await text(p)).includes('will be bound'))
await p.fill('#name', 'walletguy'); await p.getByRole('button', { name: 'Create username' }).click(); await p.waitForTimeout(100)
ok('username bound to connected wallet', (await text(p)).includes('0x1111111111111111111111111111111111111111'))
// switch wallet address -> must not trade
await p.evaluate(() => { window.__addr = '0x2222222222222222222222222222222222222222' })
await p.goto(B + '/bridge'); await p.waitForTimeout(400)
await p.evaluate(() => { window.__addr = '0x2222222222222222222222222222222222222222' })
await p.getByRole('button', { name: /MetaMask/ }).click(); await p.waitForTimeout(150)
ok('different wallet flagged', (await text(p)).includes("isn't bound to @walletguy"))
await p.goto(B + '/coin/BELL'); await p.fill('#amt', '1000000'); await p.getByRole('button', { name: 'Buy $BELL' }).click(); await p.waitForTimeout(150)
ok('different wallet cannot trade', (await text(p)).includes("isn't the one bound"))

// --- D: mobile bridge uses app deep link
const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', isMobile: true, hasTouch: true })
p = await mc.newPage(); p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto(B + '/bridge'); await p.waitForTimeout(300)
ok('phone: Phantom app link shown', await p.getByRole('link', { name: 'Open swap in Phantom app' }).isVisible())
await p.goto(B + '/'); await p.getByRole('button', { name: 'Menu' }).click()
ok('mobile menu opens', await p.getByRole('link', { name: '$UNIQ' }).first().isVisible())
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
ok('mobile: no horizontal overflow on home', !overflow)

await browser.close()
console.log(results.join('\n'))
console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none')
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`)
