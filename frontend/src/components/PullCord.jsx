/* PullCord — fizik tabanlı ip çekme animasyonu (Verlet entegrasyonu).
   Kaynak: https://github.com/mortspace/pullcord (MIT lisansı) — TypeScript → JSX port.
   onPull: ip çekildiğinde (aktüasyon derinliği aşıldığında) bir kez çağrılır.
   pulled: aria-pressed için durum (true = açık/light, false = kapalı/dark). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import '../styles/pullcord.css'

const DEFAULT_CONFIG = {
  gravity: 1250,
  damping: 0.94,
  iterations: 20,
  stretchMax: 26,
  stretchToggle: 20,
  maxVelocity: 22,
  sleepVelocity: 0.15,
}

const W = 64
const ANCHOR_X = W / 2
const REST_Y = 176
const SVG_H = 340
const SEGMENTS = 16
const REST_SEG = REST_Y / SEGMENTS
const KNOB_R = 6.5
const HIT = 46

function buildPath(p) {
  let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`
  for (let i = 1; i < p.length - 1; i++) {
    const xc = (p[i].x + p[i + 1].x) / 2
    const yc = (p[i].y + p[i + 1].y) / 2
    d += ` Q ${p[i].x.toFixed(1)} ${p[i].y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`
  }
  const n = p.length - 1
  d += ` L ${p[n].x.toFixed(1)} ${p[n].y.toFixed(1)}`
  return d
}

function makeNodes() {
  const arr = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const y = REST_SEG * i
    arr.push({ x: ANCHOR_X, y, ox: ANCHOR_X, oy: y, fixed: i === 0 })
  }
  return arr
}

const INITIAL_PATH = buildPath(makeNodes())

export function PullCord({
  onPull,
  pulled = false,
  ariaLabel = 'Pull the cord',
  noEntrance = false,
  config,
  className,
}) {
  const reduce = useReducedMotion()

  const cfgRef = useRef({ ...DEFAULT_CONFIG })
  Object.assign(cfgRef.current, DEFAULT_CONFIG, config)

  const knobRef = useRef(null)
  const cordRef = useRef(null)
  const groupRef = useRef(null)

  const dragging = useRef(false)
  const didDrag = useRef(false)
  const clicked = useRef(false)
  const target = useRef({ x: ANCHOR_X, y: REST_Y })
  const wake = useRef(() => {})
  const onPullRef = useRef(onPull)
  onPullRef.current = onPull

  const nodesRef = useRef(null)
  if (nodesRef.current === null) nodesRef.current = makeNodes()

  const [drop, setDrop] = useState(!noEntrance)
  const dropDone = useRef(noEntrance)

  useEffect(() => {
    const pts = nodesRef.current
    const last = pts.length - 1
    let raf = 0
    let running = false
    let prevT = 0
    let prevDt = 0

    const render = () => {
      cordRef.current?.setAttribute('d', buildPath(pts))
      groupRef.current?.setAttribute(
        'transform',
        `translate(${(pts[last].x - ANCHOR_X).toFixed(2)} ${(pts[last].y - REST_Y).toFixed(2)})`,
      )
    }

    const step = (now) => {
      const { gravity, damping, iterations, sleepVelocity } = cfgRef.current
      const dt = prevT ? Math.min(0.04, Math.max(0.004, (now - prevT) / 1000)) : 1 / 60
      prevT = now
      const tc = prevDt > 0 ? dt / prevDt : 1
      const velCoef = tc * Math.pow(damping, dt * 60)
      const accCoef = dt * dt

      pts[last].fixed = dragging.current

      for (let i = 1; i < pts.length; i++) {
        const p = pts[i]
        if (p.fixed) continue
        const vx = p.x - p.ox
        const vy = p.y - p.oy
        p.ox = p.x
        p.oy = p.y
        p.x += vx * velCoef
        p.y += vy * velCoef + gravity * accCoef
      }
      pts[0].x = ANCHOR_X
      pts[0].y = 0
      if (dragging.current) {
        pts[last].ox = pts[last].x
        pts[last].oy = pts[last].y
        pts[last].x = target.current.x
        pts[last].y = target.current.y
      }
      for (let k = 0; k < iterations; k++) {
        for (let i = 0; i < last; i++) {
          const a = pts[i]
          const b = pts[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 0.0001
          const diff = ((REST_SEG - dist) / dist) * 0.5
          const ox = dx * diff
          const oy = dy * diff
          if (!a.fixed) { a.x -= ox; a.y -= oy }
          if (!b.fixed) { b.x += ox; b.y += oy }
        }
      }
      prevDt = dt
      render()

      let speed = 0
      for (let i = 1; i < pts.length; i++) speed += Math.abs(pts[i].x - pts[i].ox) + Math.abs(pts[i].y - pts[i].oy)
      if (!dragging.current && speed < sleepVelocity * dt * 60) {
        render()
        running = false
        return
      }
      raf = requestAnimationFrame(step)
    }

    wake.current = () => {
      if (running) return
      running = true
      prevT = 0
      prevDt = 0
      raf = requestAnimationFrame(step)
    }

    render()
    return () => cancelAnimationFrame(raf)
  }, [])

  const doToggle = () => onPullRef.current?.()

  const scriptedPull = () => {
    doToggle()
    if (reduce) return
    const pts = nodesRef.current
    pts[pts.length - 1].oy -= 22
    wake.current()
  }

  const onPanStart = () => {
    dragging.current = true
    didDrag.current = true
    clicked.current = false
    wake.current()
  }

  const onPan = (_e, info) => {
    const { stretchMax, stretchToggle } = cfgRef.current
    const rx = info.offset.x
    const ry = REST_Y + info.offset.y
    const dist = Math.hypot(rx, ry) || 0.0001
    const maxD = REST_Y + stretchMax
    const k = dist > maxD ? maxD / dist : 1
    target.current = { x: ANCHOR_X + rx * k, y: ry * k }
    const clickAt = Math.min(stretchToggle, stretchMax - 1)
    if (!clicked.current && dist - REST_Y >= clickAt) {
      clicked.current = true
      doToggle()
    }
  }

  const onPanEnd = () => {
    const { maxVelocity } = cfgRef.current
    dragging.current = false
    const pts = nodesRef.current
    const p = pts[pts.length - 1]
    const vx = p.x - p.ox
    const vy = p.y - p.oy
    const v = Math.hypot(vx, vy)
    if (v > maxVelocity) {
      const k = maxVelocity / v
      p.ox = p.x - vx * k
      p.oy = p.y - vy * k
    }
    wake.current()
    requestAnimationFrame(() => { didDrag.current = false })
  }

  const onClick = (e) => {
    if (didDrag.current) return
    if (e.detail === 0) return
    scriptedPull()
  }

  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault()
      scriptedPull()
    }
  }

  const endDrop = useCallback(() => {
    if (dropDone.current) return
    dropDone.current = true
    setDrop(false)
    if (reduce) return
    const pts = nodesRef.current
    if (!pts) return
    pts[pts.length - 1].oy -= 13
    pts[pts.length - 1].ox -= 6
    wake.current()
  }, [reduce])

  useEffect(() => {
    if (noEntrance) return
    const fb = window.setTimeout(endDrop, 1700)
    return () => window.clearTimeout(fb)
  }, [endDrop, noEntrance])

  const onDropEnd = (e) => {
    if (e.animationName !== 'pullcord-drop') return
    endDrop()
  }

  return (
    <div
      className={className ? `pullcord ${className}` : 'pullcord'}
      style={{
        position: 'fixed',
        top: 'var(--pullcord-top, 0px)',
        // Sol-çapa öncelikli (sidebar solda sabit) — set edilmezse right'a düşer.
        left: 'var(--pullcord-left, auto)',
        right: 'var(--pullcord-right, auto)',
        zIndex: 'var(--pullcord-z, 5)',
        width: W,
        height: SVG_H,
        pointerEvents: 'none',
      }}
    >
      <div
        className={drop ? 'pullcord-inner pullcord-inner--drop' : 'pullcord-inner'}
        onAnimationEnd={onDropEnd}
      >
        <svg viewBox={`0 0 ${W} ${SVG_H}`} width={W} height={SVG_H} aria-hidden="true" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="pc-knob" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--pullcord-knob-top, #c8e8e4)" />
              <stop offset="100%" stopColor="var(--pullcord-knob-bot, #8ecec7)" />
            </linearGradient>
            <filter id="pc-knob-sh" x="-70%" y="-70%" width="240%" height="240%">
              <feDropShadow dx="0" dy="1.4" stdDeviation="1.5" floodColor="rgba(0,0,0,0.45)" />
            </filter>
            <filter id="pc-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <path
            ref={cordRef}
            d={INITIAL_PATH}
            stroke="var(--pullcord-ink, rgba(46,230,201,0.55))"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            filter="url(#pc-glow)"
          />

          <g ref={groupRef}>
            <g filter="url(#pc-knob-sh)">
              <circle
                cx={ANCHOR_X}
                cy={REST_Y}
                r={KNOB_R}
                fill="url(#pc-knob)"
                stroke="rgba(46,230,201,0.6)"
                strokeWidth={1}
              />
            </g>
          </g>
        </svg>

        <motion.button
          ref={knobRef}
          type="button"
          className="pullcord-knob"
          aria-label={ariaLabel}
          aria-pressed={pulled}
          title={ariaLabel}
          onPanStart={reduce ? undefined : onPanStart}
          onPan={reduce ? undefined : onPan}
          onPanEnd={reduce ? undefined : onPanEnd}
          onClick={onClick}
          onKeyDown={onKeyDown}
          style={{
            position: 'absolute',
            left: ANCHOR_X - HIT / 2,
            top: REST_Y - HIT / 2,
            width: HIT,
            height: HIT,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'grab',
            touchAction: 'none',
            pointerEvents: 'auto',
          }}
        />
      </div>
    </div>
  )
}

export default PullCord
