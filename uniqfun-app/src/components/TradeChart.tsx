import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  CHART_TIMEFRAMES,
  applyTradeToCandles,
  buildChartTradeBubbles,
  buildCoinOhlcvCandles,
  clampNonNegativeAutoscale,
  computeCandleDeltaUpdate,
  computeEma,
  computeSma,
  computeVwap,
  formatSubscriptPrice,
  getHolderAvgEntryLineValue,
  getMigrationLineValue,
  pickAutoTimeframe,
  type CandleDeltaUpdate,
  type ChartCurrency,
  type ChartMetric,
  type ChartSeriesMode,
  type ChartTimeframe,
  type ChartTradeBubble,
  type OhlcvCandle,
} from '../lib/candles'
import { fmtNum, fmtUsd, pricePls } from '../lib/model'
import { getFollowing, getUserAvatarUrl, useStore, type Coin } from '../state/store'
import { FollowUserButton } from '../pages/UserProfile'

const PREFS_STORAGE_KEY = 'uniqpulse.chart.prefs.v2'

interface ChartPrefs {
  timeframe: ChartTimeframe
  metric: ChartMetric
  currency: ChartCurrency
  seriesMode: ChartSeriesMode
  ma20: boolean
  ema50: boolean
  vwap: boolean
  showVolume: boolean
  showBubbleDev: boolean
  showBubbleMe: boolean
  showBubbleFollowing: boolean
}

const DEFAULT_PREFS: ChartPrefs = {
  timeframe: '1m',
  metric: 'mcap',
  currency: 'usd',
  seriesMode: 'candles',
  ma20: false,
  ema50: false,
  vwap: false,
  showVolume: true,
  showBubbleDev: true,
  showBubbleMe: true,
  showBubbleFollowing: true,
}

function loadChartPrefs(): ChartPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw =
      window.localStorage.getItem(PREFS_STORAGE_KEY) ??
      window.localStorage.getItem('uniqpulse.chart.prefs.v1')
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<ChartPrefs>
    const timeframe =
      parsed.timeframe && CHART_TIMEFRAMES.includes(parsed.timeframe)
        ? parsed.timeframe
        : DEFAULT_PREFS.timeframe
    const metric: ChartMetric = parsed.metric === 'price' || parsed.metric === 'mcap' ? parsed.metric : 'mcap'
    const currency: ChartCurrency = parsed.currency === 'pls' || parsed.currency === 'usd' ? parsed.currency : 'usd'
    const seriesMode: ChartSeriesMode =
      parsed.seriesMode === 'line' || parsed.seriesMode === 'candles' ? parsed.seriesMode : 'candles'
    return {
      timeframe,
      metric,
      currency,
      seriesMode,
      ma20: Boolean(parsed.ma20),
      ema50: Boolean(parsed.ema50),
      vwap: Boolean(parsed.vwap),
      showVolume: parsed.showVolume !== undefined ? Boolean(parsed.showVolume) : true,
      showBubbleDev: parsed.showBubbleDev !== undefined ? Boolean(parsed.showBubbleDev) : true,
      showBubbleMe: parsed.showBubbleMe !== undefined ? Boolean(parsed.showBubbleMe) : true,
      showBubbleFollowing: parsed.showBubbleFollowing !== undefined ? Boolean(parsed.showBubbleFollowing) : true,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function saveChartPrefs(prefs: ChartPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore storage quota errors
  }
}

function measureInnerBox(el: HTMLElement): { width: number; height: number } {
  const cs = typeof window !== 'undefined' ? window.getComputedStyle(el) : null
  const padX = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0
  const padY = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0
  const width = Math.max(0, Math.floor(el.clientWidth - padX))
  const height = Math.max(0, Math.floor(el.clientHeight - padY))
  return { width, height }
}

/**
 * Clamps the main series autoscale range so `minValue` is never below 0 (`Math.max(0, min)`),
 * and sets bottom margin to 0 so the right price axis never displays negative values (-$25K, -$50K).
 */
function mainSeriesAutoscaleProvider(original: () => AutoscaleInfo | null): AutoscaleInfo | null {
  const res = original()
  if (!res || !res.priceRange) return res
  const clamped = clampNonNegativeAutoscale(res.priceRange)
  if (!clamped) return res
  return {
    priceRange: clamped.priceRange,
    margins: clamped.margins,
  }
}

function fmtRelativeTimeAgo(tsMs: number): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - tsMs) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

export interface TradeChartProps {
  coin: Coin
  usdRate: number
  currentUser?: string
}

interface CandleBuildCache {
  viewKey: string
  tradesLen: number
  latestTradeTs: number
  candles: OhlcvCandle[]
  delta: CandleDeltaUpdate
}

interface PositionedBubble extends ChartTradeBubble {
  x: number
  y: number
}

declare global {
  interface Window {
    __lastTradeChart?: IChartApi | null
  }
}

export default function TradeChart({ coin, usdRate, currentUser }: TradeChartProps) {
  const s = useStore()
  const effectiveUser = currentUser ?? s.username?.name
  const [prefs, setPrefs] = useState<ChartPrefs>(() => loadChartPrefs())
  const {
    metric,
    currency,
    seriesMode,
    ma20,
    ema50,
    vwap,
    showVolume,
    showBubbleDev,
    showBubbleMe,
    showBubbleFollowing,
  } = prefs

  // Lock active timeframe per coin.ticker so a buy/sell NEVER re-runs pickAutoTimeframe or snaps interval back
  const [lockedTfByCoin, setLockedTfByCoin] = useState<{ ticker: string; tf: ChartTimeframe }>(() => ({
    ticker: coin.ticker,
    tf: pickAutoTimeframe(coin, loadChartPrefs().timeframe, usdRate),
  }))

  const timeframe: ChartTimeframe = useMemo(() => {
    if (lockedTfByCoin.ticker === coin.ticker) {
      return lockedTfByCoin.tf
    }
    return pickAutoTimeframe(coin, prefs.timeframe, usdRate)
    // Intentionally keyed only on coin.ticker and lockedTfByCoin so trades never change timeframe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin.ticker, lockedTfByCoin])

  useEffect(() => {
    if (lockedTfByCoin.ticker !== coin.ticker) {
      setLockedTfByCoin({
        ticker: coin.ticker,
        tf: pickAutoTimeframe(coin, prefs.timeframe, usdRate),
      })
    }
    // Only run when coin.ticker changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin.ticker])

  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null)
  const [overlayLayoutTick, setOverlayLayoutTick] = useState(0)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)

  // Chart & series refs — created ONCE on mount in useEffect(..., [])
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null)
  const lineSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null)
  const volSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null)
  const ma20SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null)
  const ema50SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null)
  const vwapSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null)

  // Persistent price line refs — updated in-place via priceLine.applyOptions({ price })
  const currentPriceLineRef = useRef<IPriceLine | null>(null)
  const youPriceLineRef = useRef<IPriceLine | null>(null)
  const devPriceLineRef = useRef<IPriceLine | null>(null)
  const migrationPriceLineRef = useRef<IPriceLine | null>(null)

  // Incremental data & toggle tracking refs
  const candleCacheRef = useRef<CandleBuildCache | null>(null)
  const prevAppliedViewKeyRef = useRef<string>('')
  const prevAppliedCandlesRef = useRef<OhlcvCandle[]>([])
  const prevTogglesRef = useRef<{
    ma20: boolean
    ema50: boolean
    vwap: boolean
    showVolume: boolean
  }>({
    ma20: false,
    ema50: false,
    vwap: false,
    showVolume: true,
  })

  const bumpOverlayLayout = useCallback(() => {
    setOverlayLayoutTick((t) => (t + 1) % 1_000_000)
  }, [])

  const syncChartSize = useCallback(
    (explicitWidth?: number, explicitHeight?: number) => {
      const chart = chartRef.current
      const wrap = canvasWrapRef.current
      if (!chart || !wrap) return
      const measured = measureInnerBox(wrap)
      const width = explicitWidth !== undefined ? Math.floor(explicitWidth) : measured.width
      const height = explicitHeight !== undefined ? Math.floor(explicitHeight) : measured.height
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height })
        bumpOverlayLayout()
      }
    },
    [bumpOverlayLayout]
  )

  const updatePref = useCallback(
    <K extends keyof ChartPrefs>(key: K, value: ChartPrefs[K]) => {
      if (key === 'timeframe') {
        setLockedTfByCoin({ ticker: coin.ticker, tf: value as ChartTimeframe })
      }
      setPrefs((prev) => {
        const next = { ...prev, [key]: value }
        saveChartPrefs(next)
        return next
      })
    },
    [coin.ticker]
  )

  const tradesLen = coin.trades.length
  const latestTradeTs = coin.trades[0]?.t ?? 0
  const viewKey = `${coin.ticker}|${timeframe}|${metric}|${currency}|${usdRate}`

  // Memoize candle building on trades length + interval so a buy/sell doesn't rebuild all 2,000 trades into candles
  const { candles, candleDelta } = useMemo(() => {
    const prevCache = candleCacheRef.current
    if (prevCache && prevCache.viewKey === viewKey) {
      if (prevCache.tradesLen === tradesLen && prevCache.latestTradeTs === latestTradeTs) {
        return {
          candles: prevCache.candles,
          candleDelta: prevCache.delta,
        }
      }

      // Single new trade landed on the same coin & interval -> O(1) incremental update/append
      const newestTrade = coin.trades[0]
      if (
        newestTrade &&
        prevCache.candles.length > 0 &&
        prevCache.tradesLen > 0 &&
        (tradesLen === prevCache.tradesLen + 1 ||
          (tradesLen === prevCache.tradesLen && newestTrade.t > prevCache.latestTradeTs))
      ) {
        const inc = applyTradeToCandles(prevCache.candles, newestTrade, {
          timeframe,
          metric,
          currency,
          plsUsd: usdRate,
          curve: coin.curve,
          fillGaps: true,
          postTradePricePls: pricePls(coin.curve),
        })
        const nextCache: CandleBuildCache = {
          viewKey,
          tradesLen,
          latestTradeTs,
          candles: inc.candles,
          delta: {
            mode: inc.mode,
            candle: inc.candle,
            candlesToApply: inc.candlesToApply,
          },
        }
        candleCacheRef.current = nextCache
        return {
          candles: nextCache.candles,
          candleDelta: nextCache.delta,
        }
      }
    }

    const built = buildCoinOhlcvCandles(coin, {
      timeframe,
      metric,
      currency,
      plsUsd: usdRate,
      fillGaps: true,
    })
    const delta: CandleDeltaUpdate =
      prevCache && prevCache.viewKey === viewKey
        ? computeCandleDeltaUpdate(prevCache.candles, built)
        : {
            mode: 'full',
            candle: built[built.length - 1] ?? null,
            candlesToApply: built,
          }

    candleCacheRef.current = {
      viewKey,
      tradesLen,
      latestTradeTs,
      candles: built,
      delta,
    }
    return {
      candles: built,
      candleDelta: delta,
    }
    // Keyed on tradesLen + latestTradeTs + viewKey so unrelated state changes never rebuild candles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, tradesLen, latestTradeTs, timeframe, metric, currency, usdRate])

  const candleByTime = useMemo(() => {
    const map = new Map<number, OhlcvCandle>()
    for (const c of candles) {
      map.set(c.time, c)
    }
    return map
  }, [candles])

  const formatValue = useCallback(
    (val: number) =>
      formatSubscriptPrice(val, {
        prefix: currency === 'usd' ? '$' : '',
        sigDigits: 4,
        isMcap: metric === 'mcap',
      }),
    [currency, metric]
  )

  const formatLegendNumber = useCallback(
    (val: number) =>
      formatSubscriptPrice(val, {
        prefix: '',
        sigDigits: 4,
        isMcap: metric === 'mcap',
      }),
    [metric]
  )

  const followingUsers = useMemo(() => getFollowing(s), [s])

  const avatarsByUser = useMemo(() => {
    const map: Record<string, string> = {}
    const usersToResolve = new Set<string>([coin.launcher.toLowerCase(), ...followingUsers.map((u) => u.toLowerCase())])
    if (effectiveUser) usersToResolve.add(effectiveUser.toLowerCase())
    for (const u of usersToResolve) {
      map[u] = getUserAvatarUrl(u, s)
    }
    return map
  }, [coin.launcher, followingUsers, effectiveUser, s])

  // Build circular Padre/Photon-style trade bubbles grouped by candle interval
  const tradeBubbles = useMemo(() => {
    return buildChartTradeBubbles(coin.trades, {
      timeframe,
      metric,
      currency,
      plsUsd: usdRate,
      curve: coin.curve,
      recordedCandles: coin.candles,
      candles,
      launcher: coin.launcher,
      currentUser: effectiveUser,
      following: followingUsers,
      showDev: showBubbleDev,
      showMe: showBubbleMe,
      showFollowing: showBubbleFollowing,
      avatarsByUser,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    candles,
    tradesLen,
    latestTradeTs,
    timeframe,
    metric,
    currency,
    usdRate,
    coin.launcher,
    effectiveUser,
    followingUsers,
    showBubbleDev,
    showBubbleMe,
    showBubbleFollowing,
    avatarsByUser,
  ])

  // Positioning helper: ONLY called on first load, coin change, interval change, or explicit Reset click — NEVER after a trade!
  const applyTimeScalePositioning = useCallback((chart: IChartApi, totalBars: number) => {
    const lowCount = totalBars < 30
    chart.timeScale().applyOptions({
      barSpacing: lowCount ? 10 : 6,
      rightOffset: lowCount ? 8 : 6,
      minBarSpacing: 1.5,
      fixLeftEdge: false,
      shiftVisibleRangeOnNewBar: false,
    })
    if (lowCount) {
      chart.timeScale().scrollToRealTime()
    } else {
      // Default visible range = the last ~150 candles
      const fromIdx = Math.max(0, totalBars - 150)
      chart.timeScale().setVisibleLogicalRange({
        from: fromIdx,
        to: totalBars + 6,
      })
    }
    chart.priceScale('right').applyOptions({ autoScale: true })
  }, [])

  const handleResetZoom = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    applyTimeScalePositioning(chart, candles.length)
    bumpOverlayLayout()
  }, [applyTimeScalePositioning, candles.length, bumpOverlayLayout])

  const handleScrollToFirstCandle = useCallback(() => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) return
    const windowBars = Math.min(Math.max(candles.length, 20), 80)
    chart.timeScale().setVisibleLogicalRange({
      from: -2,
      to: windowBars,
    })
    chart.priceScale('right').applyOptions({ autoScale: true })
    bumpOverlayLayout()
  }, [candles.length, bumpOverlayLayout])

  const handleScreenshot = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    try {
      const canvas = chart.takeScreenshot(true, false)
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${coin.ticker.toLowerCase()}-${timeframe}-chart.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      // Ignore canvas export errors in restricted environments
    }
  }, [coin.ticker, timeframe])

  const handleToggleFullscreen = useCallback(async () => {
    const el = wrapperRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen()
          setIsFullscreen(true)
          return
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen()
        setIsFullscreen(false)
        return
      }
    } catch {
      // Fallback to CSS fullscreen toggle if Fullscreen API is blocked
    }
    setIsFullscreen((v) => !v)
  }, [])

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
      window.requestAnimationFrame(() => syncChartSize())
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [syncChartSize])

  // Re-measure on fullscreen toggle enter/exit
  useEffect(() => {
    syncChartSize()
    const rafId = window.requestAnimationFrame(() => syncChartSize())
    const timerId = window.setTimeout(() => syncChartSize(), 60)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timerId)
    }
  }, [isFullscreen, syncChartSize])

  // 1) Create the chart + series ONCE in a useEffect with [] deps. Never recreate it when trades, price, holdings or balance change.
  useEffect(() => {
    const wrap = canvasWrapRef.current
    const container = chartContainerRef.current
    if (!wrap || !container) return

    const initialBox = measureInnerBox(wrap)
    const initialPrefs = loadChartPrefs()

    const chart = createChart(container, {
      width: initialBox.width || 320,
      height: initialBox.height || 360,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0820' },
        textColor: '#C9C0E8',
        fontFamily: "'Outfit', ui-sans-serif, system-ui, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,.04)' },
        horzLines: { color: 'rgba(255,255,255,.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: '#B68CFF',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#6738D6',
        },
        horzLine: {
          color: '#B68CFF',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#6738D6',
        },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: 'rgba(103,56,214,.35)',
        minimumWidth: 72,
        entireTextOnly: true,
        autoScale: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.0,
        },
      },
      timeScale: {
        visible: true,
        borderVisible: true,
        borderColor: 'rgba(103,56,214,.35)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 6,
        minBarSpacing: 1.5,
        fixLeftEdge: false,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      visible: initialPrefs.seriesMode === 'candles',
      upColor: '#3ddc97',
      downColor: '#ff5c7a',
      borderVisible: true,
      borderUpColor: '#3ddc97',
      borderDownColor: '#ff5c7a',
      wickUpColor: '#3ddc97',
      wickDownColor: '#ff5c7a',
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: mainSeriesAutoscaleProvider,
    })

    const lineSeries = chart.addSeries(LineSeries, {
      visible: initialPrefs.seriesMode === 'line',
      color: '#3ddc97',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: mainSeriesAutoscaleProvider,
    })

    // Volume series stays on its own overlay scale (priceScaleId 'vol', scaleMargins top 0.85) so it uses only the bottom ~15%
    const volSeries = chart.addSeries(HistogramSeries, {
      visible: initialPrefs.showVolume,
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    chart.priceScale('vol').applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    })

    // Thin 1px indicator overlay series (colors from logo palette: #FB43BB, #29E8F4, #B68CFF)
    const ma20Series = chart.addSeries(LineSeries, {
      visible: initialPrefs.ma20,
      color: '#FB43BB',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    const ema50Series = chart.addSeries(LineSeries, {
      visible: initialPrefs.ema50,
      color: '#29E8F4',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    const vwapSeries = chart.addSeries(LineSeries, {
      visible: initialPrefs.vwap,
      color: '#B68CFF',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time || typeof param.time !== 'number') {
        setHoveredTime(null)
      } else {
        setHoveredTime(param.time)
      }
      bumpOverlayLayout()
    }

    const onVisibleRangeChange = () => {
      bumpOverlayLayout()
    }

    const onDblClick = () => {
      chart.priceScale('right').applyOptions({ autoScale: true })
      chart.timeScale().scrollToRealTime()
      bumpOverlayLayout()
    }

    chart.subscribeCrosshairMove(onCrosshairMove)
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)
    chart.subscribeDblClick(onDblClick)

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    lineSeriesRef.current = lineSeries
    volSeriesRef.current = volSeries
    ma20SeriesRef.current = ma20Series
    ema50SeriesRef.current = ema50Series
    vwapSeriesRef.current = vwapSeries
    currentPriceLineRef.current = null
    youPriceLineRef.current = null
    devPriceLineRef.current = null
    migrationPriceLineRef.current = null
    prevAppliedViewKeyRef.current = ''
    prevAppliedCandlesRef.current = []

    if (typeof window !== 'undefined') {
      window.__lastTradeChart = chart
    }

    // 1) ResizeObserver on the wrapper's contentRect (minus padding)
    let resizeObserver: ResizeObserver | null = null
    let lastObservedWidth = Math.floor(wrap.clientWidth)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          const nextW = Math.floor(width)
          chart.applyOptions({
            width: nextW,
            height: Math.floor(height),
          })
          if (Math.abs(nextW - lastObservedWidth) > 20) {
            lastObservedWidth = nextW
            chart.timeScale().fitContent()
          }
          bumpOverlayLayout()
        }
      })
      resizeObserver.observe(wrap)
    }

    // 2) Re-size once more after fonts load (document.fonts.ready)
    let cancelled = false
    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) syncChartSize()
        })
        .catch(() => {})
    }

    // 3) Re-size after the .page-enter animation ends (both animationend event and fallback timer)
    const pageEnterAncestor = wrap.closest('.page-enter')
    const onAnimEnd = () => {
      if (!cancelled) syncChartSize()
    }
    if (pageEnterAncestor) {
      pageEnterAncestor.addEventListener('animationend', onAnimEnd)
    }
    const animTimerId = window.setTimeout(() => {
      if (!cancelled) syncChartSize()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(animTimerId)
      if (pageEnterAncestor) {
        pageEnterAncestor.removeEventListener('animationend', onAnimEnd)
      }
      if (resizeObserver) resizeObserver.disconnect()
      chart.unsubscribeCrosshairMove(onCrosshairMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      chart.unsubscribeDblClick(onDblClick)
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      lineSeriesRef.current = null
      volSeriesRef.current = null
      ma20SeriesRef.current = null
      ema50SeriesRef.current = null
      vwapSeriesRef.current = null
      currentPriceLineRef.current = null
      youPriceLineRef.current = null
      devPriceLineRef.current = null
      migrationPriceLineRef.current = null
      if (typeof window !== 'undefined' && window.__lastTradeChart === chart) {
        window.__lastTradeChart = null
      }
    }
    // Created ONCE on mount with [] deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toggle series visibility when seriesMode changes without recreating chart or resetting zoom/scroll
  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const lineSeries = lineSeriesRef.current
    if (!candleSeries || !lineSeries) return
    candleSeries.applyOptions({ visible: seriesMode === 'candles' })
    lineSeries.applyOptions({ visible: seriesMode === 'line' })
    bumpOverlayLayout()
  }, [seriesMode, bumpOverlayLayout])

  // Keep price formatter (never negative) and secondsVisible synced WITHOUT passing barSpacing or rightOffset
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const showSeconds = timeframe === '1s' || timeframe === '15s' || timeframe === '30s'
    chart.applyOptions({
      localization: {
        priceFormatter: (price: number) => (price < 0 ? '' : formatValue(Math.max(0, price))),
      },
      timeScale: {
        secondsVisible: showSeconds,
      },
    })
  }, [formatValue, timeframe])

  // Feed OHLCV data & volume: ONLY call setData() + applyTimeScalePositioning() on first load, coin change, or interval/scale change.
  // On new trades, call series.update(updatedLastCandle) or series.update(newCandle) so zoom & scroll position stay 100% untouched.
  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const lineSeries = lineSeriesRef.current
    const volSeries = volSeriesRef.current
    const ma20Series = ma20SeriesRef.current
    const ema50Series = ema50SeriesRef.current
    const vwapSeries = vwapSeriesRef.current
    if (!chart || !candleSeries || !lineSeries || !volSeries || candles.length === 0) return

    const toCandleBar = (c: OhlcvCandle) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })

    const toLineBar = (c: OhlcvCandle) => ({
      time: c.time as UTCTimestamp,
      value: c.close,
    })

    const toVolBar = (c: OhlcvCandle) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(61, 220, 151, 0.35)' : 'rgba(255, 92, 122, 0.35)',
    })

    const isSameView = prevAppliedViewKeyRef.current === viewKey
    const delta = isSameView
      ? computeCandleDeltaUpdate(prevAppliedCandlesRef.current, candles)
      : { mode: 'full' as const, candle: candles[candles.length - 1], candlesToApply: candles }

    if (!isSameView || delta.mode === 'full') {
      candleSeries.setData(candles.map(toCandleBar))
      lineSeries.setData(candles.map(toLineBar))
      volSeries.setData(candles.map(toVolBar))
      applyTimeScalePositioning(chart, candles.length)
    } else {
      // Incremental trade update ('update' or 'append') — NEVER call setData() or fitContent/setVisibleLogicalRange!
      for (const bar of delta.candlesToApply) {
        candleSeries.update(toCandleBar(bar))
        lineSeries.update(toLineBar(bar))
        volSeries.update(toVolBar(bar))
      }
    }

    volSeries.applyOptions({ visible: showVolume })

    // Indicator overlays: only call setData when full reload or indicator toggle changes; on trades use .update()
    const prevToggles = prevTogglesRef.current
    if (ma20Series) {
      ma20Series.applyOptions({ visible: ma20 })
      if (ma20) {
        const smaPts = computeSma(candles, 20)
        if (!isSameView || delta.mode === 'full' || !prevToggles.ma20) {
          ma20Series.setData(smaPts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
        } else if (smaPts.length > 0) {
          const lastPt = smaPts[smaPts.length - 1]
          ma20Series.update({ time: lastPt.time as UTCTimestamp, value: lastPt.value })
        }
      }
    }
    if (ema50Series) {
      ema50Series.applyOptions({ visible: ema50 })
      if (ema50) {
        const emaPts = computeEma(candles, 50)
        if (!isSameView || delta.mode === 'full' || !prevToggles.ema50) {
          ema50Series.setData(emaPts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
        } else if (emaPts.length > 0) {
          const lastPt = emaPts[emaPts.length - 1]
          ema50Series.update({ time: lastPt.time as UTCTimestamp, value: lastPt.value })
        }
      }
    }
    if (vwapSeries) {
      vwapSeries.applyOptions({ visible: vwap })
      if (vwap) {
        const vwapPts = computeVwap(candles)
        if (!isSameView || delta.mode === 'full' || !prevToggles.vwap) {
          vwapSeries.setData(vwapPts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
        } else if (vwapPts.length > 0) {
          const lastPt = vwapPts[vwapPts.length - 1]
          vwapSeries.update({ time: lastPt.time as UTCTimestamp, value: lastPt.value })
        }
      }
    }

    prevTogglesRef.current = { ma20, ema50, vwap, showVolume }
    prevAppliedViewKeyRef.current = viewKey
    prevAppliedCandlesRef.current = candles

    const raf = window.requestAnimationFrame(() => bumpOverlayLayout())
    return () => window.cancelAnimationFrame(raf)
  }, [
    candles,
    candleDelta,
    viewKey,
    ma20,
    ema50,
    vwap,
    showVolume,
    applyTimeScalePositioning,
    bumpOverlayLayout,
  ])

  // Update price lines (Current MC, YOU avg entry, DEV avg entry, Migrate) in-place via applyOptions({ price })
  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    if (!candleSeries || candles.length === 0) return

    // 1. Current MC / Price line: created once, updated with applyOptions({ price })
    const latestCandle = candles[candles.length - 1]
    const isUpLatest = latestCandle.close >= latestCandle.open
    const tagColor = isUpLatest ? '#3ddc97' : '#ff5c7a'
    const currentLineOpts = {
      price: latestCandle.close,
      color: tagColor,
      lineWidth: 1 as const,
      lineStyle: LineStyle.Dotted,
      lineVisible: true,
      axisLabelVisible: true,
      axisLabelColor: tagColor,
      axisLabelTextColor: isUpLatest ? '#07051A' : '#FFFFFF',
      title: '',
    }
    if (currentPriceLineRef.current) {
      currentPriceLineRef.current.applyOptions(currentLineOpts)
    } else {
      currentPriceLineRef.current = candleSeries.createPriceLine(currentLineOpts)
    }

    // 2. YOU avg entry line on right axis only: created ONCE when the user first holds a position, updated via applyOptions({ price })
    const youEntryVal = getHolderAvgEntryLineValue(coin, effectiveUser, metric, currency, usdRate)
    if (youEntryVal !== null && youEntryVal > 0) {
      const youLineOpts = {
        price: youEntryVal,
        color: '#3ddc97',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: true,
        axisLabelColor: '#3ddc97',
        axisLabelTextColor: '#07051A',
        title: '',
      }
      if (youPriceLineRef.current) {
        youPriceLineRef.current.applyOptions(youLineOpts)
      } else {
        youPriceLineRef.current = candleSeries.createPriceLine(youLineOpts)
      }
    } else if (youPriceLineRef.current) {
      youPriceLineRef.current.applyOptions({
        lineVisible: false,
        axisLabelVisible: false,
      })
    }

    // 3. DEV avg entry line: created once if dev holds tokens, updated via applyOptions({ price })
    const devEntryVal = getHolderAvgEntryLineValue(coin, coin.launcher, metric, currency, usdRate)
    const isCurrentUserAlsoDev =
      Boolean(effectiveUser) && effectiveUser!.toLowerCase() === coin.launcher.toLowerCase()
    if (devEntryVal !== null && devEntryVal > 0 && !isCurrentUserAlsoDev) {
      const devLineOpts = {
        price: devEntryVal,
        color: '#FB43BB',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dotted,
        lineVisible: true,
        axisLabelVisible: true,
        axisLabelColor: '#FB43BB',
        axisLabelTextColor: '#FFFFFF',
        title: 'DEV',
      }
      if (devPriceLineRef.current) {
        devPriceLineRef.current.applyOptions(devLineOpts)
      } else {
        devPriceLineRef.current = candleSeries.createPriceLine(devLineOpts)
      }
    } else if (devPriceLineRef.current) {
      devPriceLineRef.current.applyOptions({
        lineVisible: false,
        axisLabelVisible: false,
      })
    }

    // 4. Migrate threshold line: created once, updated via applyOptions({ price })
    const migVal = getMigrationLineValue(metric, currency, usdRate)
    if (!coin.curve.graduated) {
      const migLineOpts = {
        price: migVal,
        color: '#29E8F4',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: true,
        title: 'Migrate',
      }
      if (migrationPriceLineRef.current) {
        migrationPriceLineRef.current.applyOptions(migLineOpts)
      } else {
        migrationPriceLineRef.current = candleSeries.createPriceLine(migLineOpts)
      }
    } else if (migrationPriceLineRef.current) {
      migrationPriceLineRef.current.applyOptions({
        lineVisible: false,
        axisLabelVisible: false,
      })
    }
  }, [candles, coin, effectiveUser, metric, currency, usdRate])

  // Compute screen coordinates for visible trade bubbles inside the plot area (never covering right price axis or time axis)
  const { positionedBubbles, plotWidth, plotHeight } = useMemo(() => {
    const chart = chartRef.current
    const wrap = canvasWrapRef.current
    const activeSeries = seriesMode === 'line' ? lineSeriesRef.current : candleSeriesRef.current
    if (!chart || !wrap || !activeSeries || tradeBubbles.length === 0) {
      return { positionedBubbles: [] as PositionedBubble[], plotWidth: 0, plotHeight: 0 }
    }

    const measured = measureInnerBox(wrap)
    const rightScaleW = Math.max(60, chart.priceScale('right').width() || 72)
    const timeScaleH = Math.max(22, chart.timeScale().height() || 26)
    const pWidth = Math.max(0, measured.width - rightScaleW)
    const pHeight = Math.max(0, measured.height - timeScaleH)
    if (pWidth <= 20 || pHeight <= 20) {
      return { positionedBubbles: [] as PositionedBubble[], plotWidth: pWidth, plotHeight: pHeight }
    }

    const out: PositionedBubble[] = []
    for (const b of tradeBubbles) {
      if (!b.visible) continue
      const xCoord = chart.timeScale().timeToCoordinate(b.candleTime as UTCTimestamp)
      const yCoord = activeSeries.priceToCoordinate(b.anchorValue)
      if (xCoord === null || yCoord === null || !Number.isFinite(xCoord) || !Number.isFinite(yCoord)) {
        continue
      }
      // Clamp horizontally inside the plot area so bubbles never cover the right price axis or bleed off left edge
      if (xCoord < 4 || xCoord > pWidth - 4) continue
      let clampedX = Math.max(9, Math.min(pWidth - 11, xCoord))

      // Stack upward from the exact trade price coordinate with a 2px gap (16px circle + 2px gap = 18px step)
      const stackedY = yCoord - b.stackIndex * 18
      let clampedY = Math.max(9 + b.stackIndex * 18, Math.min(pHeight - 9, stackedY))

      // Keep bubbles out of the bottom-left 40x30px where the TradingView attribution logo sits (nudge them up/right)
      if (clampedX - 8 < 52 && clampedY + 8 > pHeight - 36) {
        clampedY = Math.max(9 + b.stackIndex * 18, Math.min(clampedY, pHeight - 44 - b.stackIndex * 18))
        clampedX = Math.max(54, Math.min(pWidth - 11, clampedX))
      }

      // 2D pixel-space collision avoidance across adjacent candles (16px circles + 2px gap = 18px min center distance)
      for (let pass = 0; pass < 4; pass++) {
        for (const prev of out) {
          const dx = clampedX - prev.x
          if (Math.abs(dx) < 18) {
            const dy = clampedY - prev.y
            const minDy = Math.ceil(Math.sqrt(Math.max(1, 18 * 18 - dx * dx)))
            if (Math.abs(dy) < minDy) {
              clampedY = Math.max(9, prev.y - minDy)
            }
          }
        }
      }

      out.push({
        ...b,
        x: Math.round(clampedX),
        y: Math.round(clampedY),
      })
    }

    return { positionedBubbles: out, plotWidth: pWidth, plotHeight: pHeight }
    // overlayLayoutTick triggers recomputation on pan/zoom/crosshair/resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeBubbles, seriesMode, overlayLayoutTick, candles])

  // Find the visible bubble nearest to the current price so it stays at 1.0 opacity
  const nearestToCurrentBubbleId = useMemo(() => {
    if (positionedBubbles.length === 0 || candles.length === 0) return null
    const latestClose = candles[candles.length - 1].close
    let bestId = positionedBubbles[positionedBubbles.length - 1].id
    let bestDiff = Infinity
    let bestTs = -Infinity
    for (const b of positionedBubbles) {
      const diff = Math.abs(b.anchorValue - latestClose)
      if (diff < bestDiff - 1e-9 || (Math.abs(diff - bestDiff) <= 1e-9 && b.latestTs >= bestTs)) {
        bestDiff = diff
        bestTs = b.latestTs
        bestId = b.id
      }
    }
    return bestId
  }, [positionedBubbles, candles])

  const activeBubble = useMemo(() => {
    if (!activeBubbleId) return null
    return (
      positionedBubbles.find((b) => b.id === activeBubbleId) ??
      tradeBubbles.find((b) => b.id === activeBubbleId) ??
      null
    )
  }, [activeBubbleId, positionedBubbles, tradeBubbles])

  const activeCandle = useMemo(() => {
    if (candles.length === 0) return null
    if (hoveredTime !== null) {
      const found = candleByTime.get(hoveredTime)
      if (found) return found
    }
    return candles[candles.length - 1]
  }, [candles, candleByTime, hoveredTime])

  const activeCandleDelta = useMemo(() => {
    if (!activeCandle) return 0
    return activeCandle.close - activeCandle.open
  }, [activeCandle])

  const activeCandleChangePct = useMemo(() => {
    if (!activeCandle || !(activeCandle.open > 0)) return 0
    return ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
  }, [activeCandle])

  const isActiveUp = (activeCandle?.close ?? 0) >= (activeCandle?.open ?? 0)
  const dirColorClass = isActiveUp ? 'text-[#3ddc97]' : 'text-[#ff5c7a]'
  const activeIndicatorCount = (ma20 ? 1 : 0) + (ema50 ? 1 : 0) + (vwap ? 1 : 0)

  return (
    <div
      ref={wrapperRef}
      className={isFullscreen ? 'trade-chart-fullscreen' : 'trade-chart-root'}
    >
      {/* Compact 32px Top Toolbar: fits cleanly at 390px mobile with overflow items inside "⋯" */}
      <div className="relative z-20 flex h-8 min-h-[32px] w-full min-w-0 max-w-full items-center justify-between gap-1 border-b border-white/10 px-1 text-[11px] text-[#C9C0E8] whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-1 min-w-0 shrink">
          {/* Timeframe Dropdown (1s 15s 30s 1m 5m 15m 1h 4h 1D) */}
          <label className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#140E30] px-1.5 h-6 text-[11px] font-semibold text-fg hover:border-violet/60 shrink-0">
            <span className="text-[10px] text-muted">TF</span>
            <select
              aria-label="Chart timeframe"
              value={timeframe}
              onChange={(e) => updatePref('timeframe', e.target.value as ChartTimeframe)}
              className="bg-transparent font-mono text-[11px] font-bold text-fg outline-none cursor-pointer"
            >
              {CHART_TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf} className="bg-[#110B2E] text-fg">
                  {tf}
                </option>
              ))}
            </select>
          </label>

          <span className="text-white/15 shrink-0">|</span>

          {/* "Price / MCap" inline toggle */}
          <button
            type="button"
            onClick={() => updatePref('metric', metric === 'mcap' ? 'price' : 'mcap')}
            className="inline-flex items-center gap-0.5 rounded px-1 h-6 hover:bg-white/5 transition shrink-0"
            title="Toggle Price / Market Cap"
          >
            <span className={metric === 'price' ? 'font-bold text-[#29E8F4]' : 'text-muted'}>Price</span>
            <span className="text-white/25">/</span>
            <span className={metric === 'mcap' ? 'font-bold text-[#29E8F4]' : 'text-muted'}>MCap</span>
          </button>

          <span className="text-white/15 shrink-0">|</span>

          {/* "USD / PLS" inline toggle */}
          <button
            type="button"
            onClick={() => updatePref('currency', currency === 'usd' ? 'pls' : 'usd')}
            className="inline-flex items-center gap-0.5 rounded px-1 h-6 hover:bg-white/5 transition shrink-0"
            title="Toggle USD / PLS"
          >
            <span className={currency === 'usd' ? 'font-bold text-[#B68CFF]' : 'text-muted'}>USD</span>
            <span className="text-white/25">/</span>
            <span className={currency === 'pls' ? 'font-bold text-[#B68CFF]' : 'text-muted'}>PLS</span>
          </button>

          <span className="hidden sm:inline text-white/15 shrink-0">|</span>

          {/* Candles / Line Toggle (desktop visible, mobile in ⋯ menu) */}
          <button
            type="button"
            onClick={() => updatePref('seriesMode', seriesMode === 'candles' ? 'line' : 'candles')}
            className="hidden sm:inline-flex items-center gap-1 rounded border border-white/10 bg-[#140E30] px-2 h-6 text-[11px] font-medium text-fg hover:border-violet/60 transition shrink-0"
            title="Toggle Candles / Line series"
          >
            <span>{seriesMode === 'candles' ? '🕯️' : '📈'}</span>
            <span>{seriesMode === 'candles' ? 'Candles' : 'Line'}</span>
          </button>

          {/* Indicators Menu Button (desktop visible, mobile in ⋯ menu) */}
          <button
            type="button"
            onClick={() => setShowIndicatorsMenu((v) => !v)}
            className={`hidden sm:inline-flex items-center gap-1 rounded border px-2 h-6 text-[11px] font-medium transition shrink-0 ${
              activeIndicatorCount > 0 || showIndicatorsMenu
                ? 'border-violet bg-violet/20 text-fg'
                : 'border-white/10 bg-[#140E30] text-[#C9C0E8] hover:border-violet/60'
            }`}
          >
            <span>ƒx Indicators</span>
            {activeIndicatorCount > 0 && (
              <span className="rounded-full bg-violet px-1 text-[10px] font-bold text-white">
                {activeIndicatorCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Utility Actions: First candle (desktop), Reset, Snap (desktop), Fullscreen, and "⋯" Menu */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={handleScrollToFirstCandle}
            title="Scroll to first candle (launch)"
            className="hidden md:inline-flex items-center gap-1 rounded px-1.5 h-6 text-[11px] text-[#C9C0E8] hover:text-fg hover:bg-white/5 transition"
          >
            <span>⏮</span>
            <span>First candle</span>
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            title="Reset zoom"
            className="inline-flex items-center gap-1 rounded px-1.5 h-6 text-[11px] text-[#C9C0E8] hover:text-fg hover:bg-white/5 transition"
          >
            <span>↺</span>
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={handleScreenshot}
            title="Download chart screenshot (PNG)"
            className="hidden md:inline-flex items-center gap-1 rounded px-1.5 h-6 text-[11px] text-[#C9C0E8] hover:text-fg hover:bg-white/5 transition"
          >
            <span>📷</span>
            <span>Snap</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="inline-flex items-center gap-1 rounded px-1.5 h-6 text-[11px] text-[#C9C0E8] hover:text-fg hover:bg-white/5 transition"
          >
            <span>{isFullscreen ? '✕' : '⛶'}</span>
          </button>

          <button
            type="button"
            aria-label="Chart options and trade bubbles menu"
            onClick={() => setShowMoreMenu((v) => !v)}
            className={`inline-flex items-center justify-center rounded border px-2 h-6 text-xs font-bold transition ${
              showMoreMenu
                ? 'border-violet bg-violet/25 text-white'
                : 'border-white/10 bg-[#140E30] text-[#C9C0E8] hover:border-violet/60'
            }`}
            title="Trade bubbles & chart options (⋯)"
          >
            ⋯
          </button>
        </div>
      </div>

      {/* "⋯" Toolbar Overflow & Trade Bubbles Menu */}
      {showMoreMenu && (
        <div className="relative z-30 grid gap-2.5 border-b border-white/10 bg-[#120C2E] px-3 py-2.5 text-[11px] text-[#C9C0E8]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-fg">Show trade bubbles:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBubbleDev}
                  onChange={(e) => updatePref('showBubbleDev', e.target.checked)}
                  className="accent-[#22c55e]"
                />
                <span className="font-medium text-fg">Dev</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBubbleMe}
                  onChange={(e) => updatePref('showBubbleMe', e.target.checked)}
                  className="accent-[#22c55e]"
                />
                <span className="font-medium text-fg">Me</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBubbleFollowing}
                  onChange={(e) => updatePref('showBubbleFollowing', e.target.checked)}
                  className="accent-[#22c55e]"
                />
                <span className="font-medium text-fg">Following</span>
              </label>
            </div>
            <button
              type="button"
              onClick={() => setShowMoreMenu(false)}
              className="text-[10px] text-muted hover:text-fg"
            >
              ✕ Close
            </button>
          </div>

          {/* Overflow controls for mobile 390px (Indicators, Series mode, First candle, Snap) */}
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-2">
            <span className="font-semibold text-fg">Indicators &amp; Tools:</span>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={ma20}
                onChange={(e) => updatePref('ma20', e.target.checked)}
                className="accent-[#FB43BB]"
              />
              <span className="text-[#FB43BB] font-semibold">MA 20</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={ema50}
                onChange={(e) => updatePref('ema50', e.target.checked)}
                className="accent-[#29E8F4]"
              />
              <span className="text-[#29E8F4] font-semibold">EMA 50</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={vwap}
                onChange={(e) => updatePref('vwap', e.target.checked)}
                className="accent-[#B68CFF]"
              />
              <span className="text-[#B68CFF] font-semibold">VWAP</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showVolume}
                onChange={(e) => updatePref('showVolume', e.target.checked)}
                className="accent-[#3ddc97]"
              />
              <span className="text-fg font-medium">Volume</span>
            </label>
            <button
              type="button"
              onClick={() => updatePref('seriesMode', seriesMode === 'candles' ? 'line' : 'candles')}
              className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-fg hover:border-violet"
            >
              {seriesMode === 'candles' ? '📈 Switch to Line' : '🕯️ Switch to Candles'}
            </button>
            <button
              type="button"
              onClick={() => {
                handleScrollToFirstCandle()
                setShowMoreMenu(false)
              }}
              className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-fg hover:border-violet"
            >
              ⏮ First candle
            </button>
            <button
              type="button"
              onClick={() => {
                handleScreenshot()
                setShowMoreMenu(false)
              }}
              className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-fg hover:border-violet"
            >
              📷 Snap PNG
            </button>
          </div>
        </div>
      )}

      {/* Indicators Popover Menu (desktop shortcut) */}
      {showIndicatorsMenu && (
        <div className="relative z-30 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#120C2E] px-2.5 py-1.5 text-[11px] text-[#C9C0E8]">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={ma20}
              onChange={(e) => updatePref('ma20', e.target.checked)}
              className="accent-[#FB43BB]"
            />
            <span className="text-[#FB43BB] font-semibold">MA 20</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={ema50}
              onChange={(e) => updatePref('ema50', e.target.checked)}
              className="accent-[#29E8F4]"
            />
            <span className="text-[#29E8F4] font-semibold">EMA 50</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={vwap}
              onChange={(e) => updatePref('vwap', e.target.checked)}
              className="accent-[#B68CFF]"
            />
            <span className="text-[#B68CFF] font-semibold">VWAP</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(e) => updatePref('showVolume', e.target.checked)}
              className="accent-[#3ddc97]"
            />
            <span className="text-fg font-medium">Volume (20%)</span>
          </label>
          <button
            type="button"
            onClick={() => setShowIndicatorsMenu(false)}
            className="ml-auto text-[10px] text-muted hover:text-fg"
          >
            ✕ Done
          </button>
        </div>
      )}

      {/* Top-Left Watermark / Name & OHLCV Legend Line (no YOU B text tags; YOU avg-entry dashed line stays on right axis only) */}
      {activeCandle && (
        <div className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap px-1 py-1.5 text-[11px] font-mono text-[#C9C0E8]">
          <span className="font-sans font-semibold text-fg">
            {coin.ticker}/PLS · uniq.pulse
          </span>

          {/* Desktop full O H L C + delta + % */}
          <span className="hidden sm:inline-flex items-center gap-2">
            <span>
              O <strong className={dirColorClass}>{formatLegendNumber(activeCandle.open)}</strong>
            </span>
            <span>
              H <strong className={dirColorClass}>{formatLegendNumber(activeCandle.high)}</strong>
            </span>
            <span>
              L <strong className={dirColorClass}>{formatLegendNumber(activeCandle.low)}</strong>
            </span>
            <span>
              C <strong className={dirColorClass}>{formatLegendNumber(activeCandle.close)}</strong>
            </span>
            <span className={`font-semibold ${dirColorClass}`}>
              {activeCandleDelta >= 0 ? '+' : '-'}
              {formatLegendNumber(Math.abs(activeCandleDelta))} ({activeCandleChangePct >= 0 ? '+' : ''}
              {activeCandleChangePct.toFixed(2)}%)
            </span>
          </span>

          {/* Mobile 390 shortened legend: "C 7.01M -0.26%" */}
          <span className="inline-flex sm:hidden items-center gap-1.5">
            <span>
              C <strong className={dirColorClass}>{formatLegendNumber(activeCandle.close)}</strong>
            </span>
            <span className={`font-semibold ${dirColorClass}`}>
              {activeCandleChangePct >= 0 ? '+' : ''}
              {activeCandleChangePct.toFixed(2)}%
            </span>
          </span>

          {ma20 && <span className="text-[10px] text-[#FB43BB]">MA20</span>}
          {ema50 && <span className="text-[10px] text-[#29E8F4]">EMA50</span>}
          {vwap && <span className="text-[10px] text-[#B68CFF]">VWAP</span>}
        </div>
      )}

      {/* Chart Canvas Area + HTML Trade Bubble Overlay Layer */}
      <div
        ref={canvasWrapRef}
        onDoubleClick={handleResetZoom}
        onClick={() => setActiveBubbleId(null)}
        className={
          isFullscreen
            ? 'trade-chart-canvas-wrap flex-1 min-h-[360px]'
            : 'trade-chart-canvas-wrap h-[360px] lg:h-[560px]'
        }
      >
        <div ref={chartContainerRef} className="trade-chart-canvas-mount" />

        {/* Padre/Photon-style circular trade bubble overlay clamped strictly to the plot area */}
        {plotWidth > 0 && plotHeight > 0 && (
          <div
            data-testid="trade-bubble-overlay"
            className="pointer-events-none absolute top-0 left-0 z-10 overflow-hidden"
            style={{ width: `${plotWidth}px`, height: `${plotHeight}px` }}
          >
            {positionedBubbles.map((b) => {
              const isFollowedBubble = b.actorKind === 'following'
              const hasAvatar = isFollowedBubble && Boolean(b.avatarUrl)
              const isOpaque = b.id === nearestToCurrentBubbleId || b.id === activeBubbleId
              return (
                <div
                  key={b.id}
                  style={{
                    position: 'absolute',
                    left: `${b.x - 8}px`,
                    top: `${b.y - 8}px`,
                  }}
                  className="pointer-events-auto"
                >
                  {b.overflowCount > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '17px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '8px',
                        fontWeight: 700,
                      }}
                      className="rounded-full bg-[#0b0614] border border-white/25 px-1 py-0 text-white leading-tight whitespace-nowrap"
                    >
                      +{b.overflowCount}
                    </div>
                  )}
                  <button
                    type="button"
                    data-bubble-id={b.id}
                    data-bubble-actor={b.actorKind}
                    data-bubble-side={b.side}
                    data-bubble-label={b.label}
                    data-bubble-user={b.user}
                    data-bubble-time={b.candleTime}
                    data-bubble-nearest={b.id === nearestToCurrentBubbleId ? '1' : '0'}
                    onMouseEnter={() => setActiveBubbleId(b.id)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveBubbleId((prev) => (prev === b.id ? null : b.id))
                    }}
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '9999px',
                      border: '1.5px solid #0b0614',
                      backgroundColor: b.color,
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 700,
                      fontSize: '9px',
                      lineHeight: 1,
                      color: '#0b0614',
                      opacity: isOpaque ? 1 : 0.9,
                      boxShadow: isFollowedBubble ? `0 0 0 1.5px ${b.color}` : '0 1px 3px rgba(0,0,0,0.65)',
                    }}
                    className="relative flex items-center justify-center overflow-hidden select-none transition-all hover:scale-125 hover:!opacity-100 focus:outline-none"
                    title={`@${b.user} ${b.side === 'buy' ? 'Bought' : 'Sold'} ${fmtNum(b.tokens)} $${coin.ticker}`}
                  >
                    {hasAvatar ? (
                      <span
                        style={{
                          width: '13px',
                          height: '13px',
                          borderRadius: '9999px',
                          border: `1.5px solid ${b.color}`,
                        }}
                        className="block overflow-hidden bg-[#0b0614]"
                      >
                        <img
                          src={b.avatarUrl}
                          alt={b.user}
                          className="h-full w-full object-cover"
                        />
                      </span>
                    ) : (
                      <span>{b.label}</span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Trade Bubble Tooltip on Hover/Tap */}
        {activeBubble && (
          <div
            data-testid="trade-bubble-tooltip"
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${(() => {
                const bx = typeof (activeBubble as PositionedBubble).x === 'number' ? (activeBubble as PositionedBubble).x : 120
                // Place tooltip to the left of the bubble if near the right half, otherwise to the right, so it never covers the bubble
                const preferredLeft = bx > plotWidth * 0.5 ? bx - 220 : bx + 16
                return Math.min(Math.max(8, preferredLeft), Math.max(8, plotWidth - 216))
              })()}px`,
              top: `${(() => {
                const by = typeof (activeBubble as PositionedBubble).y === 'number' ? (activeBubble as PositionedBubble).y : 80
                const preferredTop = by < 130 ? by + 14 : by - 112
                return Math.min(Math.max(8, preferredTop), Math.max(8, plotHeight - 115))
              })()}px`,
            }}
            className=" absolute z-30 w-52 rounded-xl border border-violet/60 bg-[#0b0614]/95 p-2.5 text-[11px] text-[#C9C0E8] shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <img
                  src={avatarsByUser[activeBubble.user.toLowerCase()] ?? getUserAvatarUrl(activeBubble.user, s)}
                  alt={activeBubble.user}
                  className="h-4 w-4 rounded-full object-cover border border-white/20 shrink-0"
                />
                <Link
                  to={`/u/${activeBubble.user}`}
                  className="font-display font-bold text-fg hover:text-[#29E8F4] truncate"
                >
                  @{activeBubble.user}
                </Link>
              </div>
              <FollowUserButton targetUsername={activeBubble.user} compact />
            </div>

            <div className="mt-1.5 grid gap-0.5 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span
                  className={`font-sans font-bold ${
                    activeBubble.side === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]'
                  }`}
                >
                  {activeBubble.side === 'buy' ? 'Bought' : 'Sold'}
                  {activeBubble.tradeCount > 1 ? ` (${activeBubble.tradeCount} trades)` : ''}
                </span>
                <span className="font-sans text-muted">{fmtRelativeTimeAgo(activeBubble.latestTs)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Tokens</span>
                <span className="text-fg font-semibold">
                  {fmtNum(activeBubble.tokens)} ${coin.ticker}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">PLS</span>
                <span className="text-fg font-semibold">{fmtNum(activeBubble.pls)} PLS</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">USD Value</span>
                <span className="text-[#29E8F4] font-semibold">{fmtUsd(activeBubble.usd)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">MC at trade</span>
                <span className="text-[#B68CFF] font-semibold">{fmtUsd(activeBubble.mcapUsdAtTrade)}</span>
              </div>
            </div>
          </div>
        )}

        {coin.trades.length <= 1 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full border border-line/80 bg-[#110B2E]/90 px-3.5 py-1.5 text-xs font-medium text-[#C9C0E8] shadow-lg backdrop-blur">
              Waiting for trades…
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
