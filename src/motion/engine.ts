// A tiny fixed-step physics loop for gesture-driven animation. Bodies are unit
// mass points moved by a damped spring; rendering writes transforms directly so
// React never re-renders per frame, and the loop stops once every body rests.

export const STEP = 1 / 120
const MAX_STEPS = 12
const REST_DISTANCE = 0.5
const REST_SPEED = 8

export type Spring = { stiffness: number; damping: number }
/** Damping from a damping ratio: 1 is critical, below 1 overshoots. */
export const spring = (stiffness: number, ratio: number): Spring => ({
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
})

export class Body {
  x = 0
  y = 0
  vx = 0
  vy = 0
  tx = 0
  ty = 0
  stiffness = 0
  damping = 0
  awake = false
  private until?: (body: Body) => boolean
  private onRest?: () => void

  constructor(private render: (body: Body) => void) {}

  /** Follow a pointer directly; the body is not simulated while held. */
  hold(x: number, y: number) {
    this.sleep()
    this.x = x
    this.y = y
    this.render(this)
  }

  /** Spring toward a target, keeping current momentum. */
  springTo(
    tx: number,
    ty: number,
    config: Spring,
    options: {
      velocity?: { x: number; y: number }
      until?: (body: Body) => boolean
      onRest?: () => void
    } = {},
  ) {
    this.tx = tx
    this.ty = ty
    this.stiffness = config.stiffness
    this.damping = config.damping
    if (options.velocity) {
      this.vx = options.velocity.x
      this.vy = options.velocity.y
    }
    this.until = options.until
    this.onRest = options.onRest
    if (reducedMotion()) {
      this.x = tx
      this.y = ty
      this.finish()
      return
    }
    this.awake = true
    loop.add(this)
  }

  /** Advance one fixed step. Returns false once the body has come to rest. */
  step(dt = STEP): boolean {
    // Semi-implicit Euler: update velocity first, then position. Stable for
    // stiff springs at a fixed step and allocation free.
    this.vx +=
      (-this.stiffness * (this.x - this.tx) - this.damping * this.vx) * dt
    this.vy +=
      (-this.stiffness * (this.y - this.ty) - this.damping * this.vy) * dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    if (this.until?.(this)) return false
    if (
      Math.abs(this.x - this.tx) < REST_DISTANCE &&
      Math.abs(this.y - this.ty) < REST_DISTANCE &&
      Math.abs(this.vx) < REST_SPEED &&
      Math.abs(this.vy) < REST_SPEED
    ) {
      this.x = this.tx
      this.y = this.ty
      return false
    }
    return true
  }

  draw() {
    this.render(this)
  }

  /** Stop simulating without firing the rest callback. */
  sleep() {
    this.awake = false
    this.onRest = undefined
    this.until = undefined
    loop.remove(this)
  }

  finish() {
    const onRest = this.onRest
    this.awake = false
    this.vx = this.vy = 0
    this.onRest = undefined
    this.until = undefined
    loop.remove(this)
    this.render(this)
    onRest?.()
  }
}

function reducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const loop = (() => {
  const bodies = new Set<Body>()
  let frame = 0
  let last = 0
  let carry = 0
  function tick(now: number) {
    frame = 0
    // Clamp long gaps (background tabs, hitches) instead of fast-forwarding.
    carry = Math.min(carry + (now - last) / 1000, STEP * MAX_STEPS)
    last = now
    const resting: Body[] = []
    while (carry >= STEP) {
      carry -= STEP
      for (const body of bodies)
        if (body.awake && !body.step()) {
          body.awake = false
          resting.push(body)
        }
    }
    for (const body of bodies) if (body.awake) body.draw()
    for (const body of resting) body.finish()
    if (bodies.size && !frame) frame = requestAnimationFrame(tick)
  }
  return {
    add(body: Body) {
      bodies.add(body)
      if (!frame && typeof requestAnimationFrame === 'function') {
        last = performance.now()
        carry = 0
        frame = requestAnimationFrame(tick)
      }
    },
    remove(body: Body) {
      bodies.delete(body)
      if (!bodies.size && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    },
  }
})()

/**
 * Estimates release velocity (px/s) from the most recent pointer samples by
 * least squares. Only samples inside the window count, so a finger that stops
 * before lifting releases with no momentum.
 */
export class VelocityTracker {
  private t = new Float64Array(8)
  private xs = new Float64Array(8)
  private ys = new Float64Array(8)
  private count = 0
  private next = 0

  constructor(private window = 80) {}

  reset() {
    this.count = 0
    this.next = 0
  }

  add(time: number, x: number, y: number) {
    this.t[this.next] = time
    this.xs[this.next] = x
    this.ys[this.next] = y
    this.next = (this.next + 1) % this.t.length
    this.count = Math.min(this.count + 1, this.t.length)
  }

  velocity(now: number): { x: number; y: number } {
    let n = 0
    let st = 0
    let sx = 0
    let sy = 0
    let stt = 0
    let stx = 0
    let sty = 0
    for (let i = 0; i < this.count; i++) {
      const age = now - this.t[i]
      if (age < 0 || age > this.window) continue
      const t = -age / 1000
      n++
      st += t
      sx += this.xs[i]
      sy += this.ys[i]
      stt += t * t
      stx += t * this.xs[i]
      sty += t * this.ys[i]
    }
    const denominator = n * stt - st * st
    if (n < 2 || denominator < 1e-9) return { x: 0, y: 0 }
    return {
      x: (n * stx - st * sx) / denominator,
      y: (n * sty - st * sy) / denominator,
    }
  }
}

/** Where free flight with exponential friction would come to rest. */
export const project = (position: number, velocity: number, friction = 4) =>
  position + velocity / friction

export type FlingChoice = 'like' | 'skip'

/**
 * A release commits only when it is thrown toward a side or dropped on a
 * target. Dragging far and letting go after pausing returns the card.
 */
export function releaseChoice({
  x,
  vx,
  width,
  overTarget,
}: {
  x: number
  vx: number
  width: number
  overTarget: FlingChoice | null
}): FlingChoice | null {
  if (overTarget) return overTarget
  if (Math.abs(vx) < 350) return null
  const landing = project(x, vx)
  if (Math.abs(landing) < width * 0.35 || Math.sign(landing) !== Math.sign(vx))
    return null
  return vx > 0 ? 'like' : 'skip'
}

/** Soft limit: follows small movements, resists large ones. */
export const rubberBand = (distance: number, limit: number) =>
  (limit * distance) / (Math.abs(distance) + limit)
