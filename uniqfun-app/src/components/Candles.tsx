import { useMemo, useRef, useState } from 'react'
import { fmtUsd } from '../lib/model'
import type { Candle } from '../state/store'

export type Timeframe = '1s' | '5s' | '1m' | '5m' | 'all'

interface OhlcBar {
  t: number
  o: number
  h: number
  l: number
  c: number
  count: number
  idxStart: number
}

function buildTimeframeBars(candles: Candle[], tf: Timeframe): OhlcBar[] {
  if (candles.length === 0) return []

  // Ensure Block-0 launch candle is always anchored at index 0
  const raw = candles

  if (tf === '1s' || tf === 'all') {
    return raw.map((d, i) => {
      const hi = Math.max(d.o, d.c) * 1.008
      const lo = Math.min(d.o, d.c) * 0.994
      return { t: d.t, o: d.o, h: hi, l: lo, c: d.c, count: 1, idxStart: i }
    })
  }

  // Group into timeframe buckets (or sequential trade buckets when simulated timestamps are spaced out)
  const groupSize = tf === '5s' ? 2 : tf === '1m' ? 4 : 8
  const bars: OhlcBar[] = []
  for (let i = 0; i < raw.length; i += groupSize) {
    const slice = raw.slice(i, i + groupSize)
    const o = slice[0].o
    const c = slice[slice.length - 1].c
    const h = Math.max(...slice.map((s) => Math.max(s.o, s.c))) * 1.01
    const l = Math.min(...slice.map((s) => Math.min(s.o, s.c))) * 0.992
    bars.push({
      t: slice[slice.length - 1].t,
      o,
      h,
      l,
      c,
      count: slice.length,
      idxStart: i,
    })
  }
  return bars
}

function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

export default function Candles({
  candles,
  label = 'Market cap in USD · Full token history since Block 0 launch',
}: {
  candles: Candle[]
  label?: string
}) {
  const [tf, setTf] = useState<Timeframe>('1s')
  const [showEma, setShowEma] = useState(true)
  const [showLevels, setShowLevels] = useState(true)
  const [hover, setHover] = useState<number | null>(null)

  const allBars = useMemo(() => buildTimeframeBars(candles, tf), [candles, tf])

  // Viewport window [startIdx, startIdx + windowSize] for scrolling/zooming through token history
  const [windowSize, setWindowSize] = useState<number>(60)
  const [offsetFromEnd, setOffsetFromEnd] = useState<number>(0)
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null)

  if (allBars.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        No trades yet. The first trade draws the first candle.
      </div>
    )
  }

  const effectiveWindow = tf === 'all' ? allBars.length : Math.min(allBars.length, Math.max(10, windowSize))
  const maxOffset = Math.max(0, allBars.length - effectiveWindow)
  const clampedOffset = tf === 'all' ? 0 : Math.min(maxOffset, Math.max(0, offsetFromEnd))
  const startIdx = Math.max(0, allBars.length - effectiveWindow - clampedOffset)
  const endIdx = Math.min(allBars.length, startIdx + effectiveWindow)
  const data = allBars.slice(startIdx, endIdx)

  const allCloses = allBars.map((b) => b.c)
  const ema9All = computeEMA(allCloses, 9).slice(startIdx, endIdx)
  const ema21All = computeEMA(allCloses, 21).slice(startIdx, endIdx)

  const ath = Math.max(...allBars.map((b) => b.h))
  const launchFloor = allBars[0]?.o ?? data[0].o

  const W = 720
  const H = 310
  const padL = 10
  const padR = 92
  const padT = 16
  const padB = 42
  const chartH = H - padT - padB

  const lo = Math.min(...data.map((d) => d.l))
  const hi = Math.max(...data.map((d) => d.h))
  const span = hi - lo || hi * 0.05 || 1
  const min = Math.max(0, lo - span * 0.1)
  const max = hi + span * 0.1
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * chartH

  const plotW = W - padL - padR
  const slot = plotW / Math.max(data.length, 8)
  const bw = Math.max(3, Math.min(16, slot * 0.64))
  const ticks = [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4)

  const shownIdx = hover != null && data[hover] ? hover : data.length - 1
  const shown = data[shownIdx]
  const shownGlobalNum = startIdx + shownIdx + 1
  const barPct = shown.o > 0 ? ((shown.c - shown.o) / shown.o) * 100 : 0
  const lifePct = launchFloor > 0 ? ((shown.c - launchFloor) / launchFloor) * 100 : 0

  function zoomIn() {
    if (tf === 'all') setTf('1s')
    setWindowSize((w) => Math.max(12, Math.floor(w * 0.7)))
  }

  function zoomOut() {
    setWindowSize((w) => Math.min(Math.max(allBars.length, 20), Math.ceil(w * 1.4)))
  }

  function showFullHistory() {
    setTf('all')
    setOffsetFromEnd(0)
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (tf === 'all') return
    dragRef.current = { startX: e.clientX, startOffset: clampedOffset }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const barsDelta = Math.round((dx / plotW) * effectiveWindow)
    setOffsetFromEnd(Math.min(maxOffset, Math.max(0, dragRef.current.startOffset + barsDelta)))
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  const ema9Points = ema9All
    .map((val, i) => `${(padL + i * slot + slot / 2).toFixed(1)},${y(val).toFixed(1)}`)
    .join(' ')
  const ema21Points = ema21All
    .map((val, i) => `${(padL + i * slot + slot / 2).toFixed(1)},${y(val).toFixed(1)}`)
    .join(' ')

  return (
    <div className="relative select-none">
      {/* Top Toolbar: Timeframes (1s, 5s, 1m, 5m, All History) + TA Overlays + Pan/Zoom */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted mr-1">Timeframe:</span>
          {(
            [
              ['1s', '1s'],
              ['5s', '5s'],
              ['1m', '1m'],
              ['5m', '5m'],
              ['all', 'All (Since Launch)'],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTf(id)
                if (id === 'all') setOffsetFromEnd(0)
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                tf === id
                  ? 'tab-pill-active'
                  : 'bg-raised text-muted hover:text-fg border border-line/60'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setShowEma((v) => !v)}
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              showEma ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-line text-muted'
            }`}
          >
            TA: EMA 9/21
          </button>
          <button
            type="button"
            onClick={() => setShowLevels((v) => !v)}
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              showLevels ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-line text-muted'
            }`}
          >
            ATH / Launch Lines
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-lg border border-line bg-raised px-2 py-1 text-[11px] text-muted hover:text-fg"
            title="Zoom in"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-lg border border-line bg-raised px-2 py-1 text-[11px] text-muted hover:text-fg"
            title="Zoom out"
          >
            －
          </button>
          <button
            type="button"
            onClick={showFullHistory}
            className="rounded-lg border border-violet/50 bg-violet/10 px-2.5 py-1 text-[11px] font-medium text-violet-soft hover:border-violet"
            title="View entire life of coin since Block 0 launch"
          >
            ⏮ Block 0 to Now
          </button>
        </div>
      </div>

      {/* Live OHLC + Since-Launch Inspector */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-muted">
          <span className="font-medium text-fg">
            Candle #{shownGlobalNum}/{allBars.length}
          </span>
          <span>
            O <strong className="text-fg">{fmtUsd(shown.o)}</strong>
          </span>
          <span>
            H <strong className="text-up">{fmtUsd(shown.h)}</strong>
          </span>
          <span>
            L <strong className="text-down">{fmtUsd(shown.l)}</strong>
          </span>
          <span>
            C <strong className="text-fg">{fmtUsd(shown.c)}</strong>
          </span>
          <span className={barPct >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
            ({barPct >= 0 ? '+' : ''}
            {barPct.toFixed(2)}%)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted">
            Since Launch ({fmtUsd(launchFloor)}):{' '}
            <strong className={lifePct >= 0 ? 'text-up' : 'text-down'}>
              {lifePct >= 0 ? '+' : ''}
              {lifePct.toFixed(1)}%
            </strong>
          </span>
          <span className="font-display text-base text-fg">{fmtUsd(shown.c)}</span>
        </div>
      </div>

      {/* Interactive SVG Chart Canvas */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-grab active:cursor-grabbing rounded-xl bg-bg/60 border border-line/50"
        role="img"
        aria-label={label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          handlePointerUp()
          setHover(null)
        }}
      >
        {/* Horizontal Price Grid */}
        {ticks.map((t, idx) => (
          <g key={idx}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#3D237F" strokeDasharray="3 4" strokeOpacity="0.6" />
            <text x={W - padR + 8} y={y(t) + 4} fill="#A79BC9" fontSize="11">
              {fmtUsd(t)}
            </text>
          </g>
        ))}

        {/* ATH & Launch Price Reference Lines */}
        {showLevels && ath >= min && ath <= max && (
          <g>
            <line x1={padL} x2={W - padR} y1={y(ath)} y2={y(ath)} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity="0.55" />
            <text x={padL + 6} y={Math.max(12, y(ath) - 4)} fill="#fbbf24" fontSize="10">
              ATH {fmtUsd(ath)}
            </text>
          </g>
        )}
        {showLevels && launchFloor >= min && launchFloor <= max && (
          <g>
            <line x1={padL} x2={W - padR} y1={y(launchFloor)} y2={y(launchFloor)} stroke="#6738D6" strokeDasharray="2 3" strokeOpacity="0.7" />
            <text x={padL + 6} y={Math.min(H - padB - 4, y(launchFloor) - 4)} fill="#B68CFF" fontSize="10">
              Block 0 Launch ({fmtUsd(launchFloor)})
            </text>
          </g>
        )}

        {/* TA Moving Averages (EMA 9 & EMA 21) */}
        {showEma && data.length > 1 && (
          <>
            <polyline fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.75" points={ema21Points} />
            <polyline fill="none" stroke="#29E8F4" strokeWidth="1.8" strokeOpacity="0.9" points={ema9Points} />
          </>
        )}

        {/* Candlesticks + Wicks + Bottom Momentum Bars */}
        {data.map((d, i) => {
          const up = d.c >= d.o
          const col = up ? '#3ddc97' : '#ff5c7a'
          const cx = padL + i * slot + slot / 2
          const highY = y(d.h)
          const lowY = y(d.l)
          const top = y(Math.max(d.o, d.c))
          const bot = y(Math.min(d.o, d.c))
          const isHovered = hover === i
          const volBarH = Math.min(20, Math.max(3, (Math.abs(d.c - d.o) / (span || 1)) * 45 + 4))

          return (
            <g key={d.t + '-' + i} onMouseEnter={() => setHover(i)}>
              {isHovered && (
                <line x1={cx} x2={cx} y1={padT} y2={H - padB} stroke="#6738D6" strokeDasharray="2 2" strokeOpacity="0.7" />
              )}
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {/* High-Low Wick */}
              <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={col} strokeWidth={Math.max(1, bw * 0.16)} strokeOpacity="0.85" />
              {/* Open-Close Body */}
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={Math.max(2.5, bot - top)}
                fill={col}
                rx="1.5"
                stroke={isHovered ? '#ffffff' : 'none'}
                strokeWidth={isHovered ? 1 : 0}
              />
              {/* Bottom Volume/Activity Strip */}
              <rect
                x={cx - bw / 2}
                y={H - padB + 22 - volBarH}
                width={bw}
                height={volBarH}
                fill={col}
                fillOpacity="0.32"
                rx="1"
              />
            </g>
          )
        })}

        {/* X-Axis Labels (Start of View -> End of View) */}
        <text x={padL + 4} y={H - 4} fill="#8b949e" fontSize="10">
          {startIdx === 0 ? '◀ Block 0 Launch' : `◀ Candle #${startIdx + 1}`}
        </text>
        <text x={W - padR - 95} y={H - 4} fill="#8b949e" fontSize="10">
          {endIdx >= allBars.length ? 'Latest Live ▶' : `Candle #${endIdx} ▶`}
        </text>
      </svg>

      {/* History Scrubber Slider (Scroll back to Block 0 or forward to Live) */}
      {maxOffset > 0 && tf !== 'all' && (
        <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-line/60 bg-bg/80 px-3 py-1.5 text-xs">
          <span className="text-[11px] text-muted shrink-0">Scroll Token Life:</span>
          <span className="text-[11px] text-violet-soft shrink-0">Block 0</span>
          <input
            type="range"
            min={0}
            max={maxOffset}
            value={maxOffset - clampedOffset}
            onChange={(e) => setOffsetFromEnd(maxOffset - Number(e.target.value))}
            className="w-full accent-violet cursor-pointer"
          />
          <span className="text-[11px] text-up shrink-0">Live Now</span>
        </div>
      )}

      {showEma && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" /> EMA-9: {fmtUsd(ema9All[shownIdx] ?? shown.c)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> EMA-21: {fmtUsd(ema21All[shownIdx] ?? shown.c)}
            </span>
            <span>ATH: {fmtUsd(ath)}</span>
          </div>
          <span>Drag chart or slider to inspect since Block 0</span>
        </div>
      )}
    </div>
  )
}
