import { describe, expect, it } from 'vitest'
import {
  Body,
  STEP,
  VelocityTracker,
  project,
  releaseChoice,
  rubberBand,
  spring,
} from './engine'

function simulate(body: Body, seconds: number) {
  let steps = 0
  while (steps * STEP < seconds && body.step()) steps++
  return steps * STEP
}

describe('spring body', () => {
  it('returns to rest at its target and stops stepping', () => {
    const body = new Body(() => {})
    body.x = 180
    body.y = -40
    body.tx = body.ty = 0
    Object.assign(body, spring(380, 0.72))
    const time = simulate(body, 3)
    expect(time).toBeLessThan(1.5)
    expect(body.x).toBe(0)
    expect(body.y).toBe(0)
  })

  it('keeps thrown momentum, overshooting an underdamped target', () => {
    const body = new Body(() => {})
    body.vx = 2000
    Object.assign(body, spring(380, 0.5))
    let peak = 0
    for (let i = 0; i < 120 && body.step(); i++) peak = Math.max(peak, body.x)
    expect(peak).toBeGreaterThan(40)
  })

  it('stops as soon as an exit condition is met', () => {
    const body = new Body(() => {})
    body.tx = 1000
    body.vx = 1200
    Object.assign(body, spring(60, 0.9))
    let steps = 0
    const until = (b: Body) => b.x >= 400
    while (body.step() && !until(body)) steps++
    expect(body.x).toBeGreaterThanOrEqual(400)
    expect(steps * STEP).toBeLessThan(0.5)
  })
})

describe('velocity tracker', () => {
  it('measures a steady flick in px/s', () => {
    const tracker = new VelocityTracker()
    for (let t = 0; t <= 64; t += 16) tracker.add(t, 100 + t * 1.5, 200)
    const v = tracker.velocity(64)
    expect(v.x).toBeCloseTo(1500, 0)
    expect(v.y).toBeCloseTo(0, 5)
  })

  it('reports no momentum when the finger pauses before release', () => {
    const tracker = new VelocityTracker()
    for (let t = 0; t <= 64; t += 16) tracker.add(t, 100 + t * 3, 200)
    tracker.add(300, 292, 200)
    expect(tracker.velocity(300)).toEqual({ x: 0, y: 0 })
  })

  it('ignores samples older than the window after a slow drag', () => {
    const tracker = new VelocityTracker()
    for (let t = 0; t <= 400; t += 16) tracker.add(t, t < 300 ? t : 300, 0)
    expect(Math.abs(tracker.velocity(400).x)).toBeLessThan(1)
  })
})

describe('release decisions', () => {
  const width = 380
  it('commits a throw toward a side', () => {
    expect(releaseChoice({ x: 30, vx: 1200, width, overTarget: null })).toBe(
      'like',
    )
    expect(releaseChoice({ x: -30, vx: -1200, width, overTarget: null })).toBe(
      'skip',
    )
  })
  it('returns a card held still far from center', () => {
    expect(releaseChoice({ x: 170, vx: 0, width, overTarget: null })).toBeNull()
  })
  it('returns a card thrown back toward the center', () => {
    expect(
      releaseChoice({ x: 160, vx: -500, width, overTarget: null }),
    ).toBeNull()
  })
  it('commits a still release over a drop target', () => {
    expect(releaseChoice({ x: 160, vx: 0, width, overTarget: 'like' })).toBe(
      'like',
    )
  })
  it('projects friction flight analytically', () => {
    expect(project(10, 800, 4)).toBe(210)
  })
  it('rubber-bands large vertical drags', () => {
    expect(rubberBand(10, 140)).toBeGreaterThan(9)
    expect(rubberBand(1000, 140)).toBeLessThan(140)
    expect(rubberBand(-1000, 140)).toBeGreaterThan(-140)
  })
})
