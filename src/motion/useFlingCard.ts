import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  Body,
  VelocityTracker,
  releaseChoice,
  rubberBand,
  spring,
  type FlingChoice,
} from './engine'

const settle = spring(380, 0.72)
const toss = spring(60, 0.9)
export type FlingPhase = 'idle' | 'held' | 'flying'

/**
 * Drag, throw and return physics for a single decision card. Attach `stage`
 * to a wrapper holding the card and its `[data-drop]` targets, and the
 * returned handlers to the card itself.
 */
export function useFlingCard(
  onCommit: (choice: FlingChoice) => Promise<boolean>,
) {
  const card = useRef<HTMLElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<FlingPhase>('idle')
  const flying = useRef(false)
  const look = useRef({ tilt: 1, width: 360 })
  const grab = useRef<{
    id: number
    x: number
    y: number
    targets: { choice: FlingChoice; left: number; right: number }[]
  } | null>(null)
  const tracker = useRef(new VelocityTracker())
  const commit = useRef(onCommit)
  commit.current = onCommit
  const body = useRef<Body | null>(null)
  if (!body.current)
    body.current = new Body(({ x, y, vx }) => {
      const { width, tilt } = look.current
      const angle = Math.max(-16, Math.min(16, (x / width) * 18 + vx * 0.002))
      if (card.current)
        card.current.style.transform =
          x || y
            ? `translate3d(${x}px, ${y}px, 0) rotate(${angle * tilt}deg)`
            : ''
      const pull = Math.max(-1, Math.min(1, x / (width * 0.35)))
      stage.current?.style.setProperty('--like', Math.max(pull, 0).toFixed(3))
      stage.current?.style.setProperty('--skip', Math.max(-pull, 0).toFixed(3))
    })
  useEffect(() => () => body.current?.sleep(), [])

  const returnHome = useCallback((velocity = { x: 0, y: 0 }) => {
    body.current!.springTo(0, 0, settle, {
      velocity,
      onRest: () => {
        flying.current = false
        setPhase('idle')
      },
    })
  }, [])

  const fling = useCallback(
    (choice: FlingChoice, velocity = { x: 0, y: 0 }) => {
      const b = body.current!
      flying.current = true
      setPhase('flying')
      const direction = choice === 'like' ? 1 : -1
      const exit = window.innerWidth * 1.15
      b.springTo(direction * exit, b.y, toss, {
        velocity: {
          x: direction * Math.max(direction * velocity.x, 900),
          y: velocity.y,
        },
        until: (body) => Math.abs(body.x) >= window.innerWidth,
        onRest: () => {
          void commit.current(choice).then(
            (saved) => {
              if (!saved) return returnHome()
              // The next card mounts fresh; only the physics state resets.
              b.x = b.y = 0
              flying.current = false
              stage.current?.style.setProperty('--like', '0')
              stage.current?.style.setProperty('--skip', '0')
              setPhase('idle')
            },
            () => returnHome(),
          )
        },
      })
    },
    [returnHome],
  )

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (!e.isPrimary || e.button > 0 || flying.current || grab.current) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-released pointers cannot be captured.
    }
    const b = body.current!
    const rect = e.currentTarget.getBoundingClientRect()
    look.current = {
      tilt: e.clientY > rect.top + rect.height / 2 ? -1 : 1,
      width: stage.current?.offsetWidth || rect.width,
    }
    grab.current = {
      id: e.pointerId,
      x: e.clientX - b.x,
      y: e.clientY - b.y,
      targets: [
        ...(stage.current?.querySelectorAll<HTMLElement>('[data-drop]') ?? []),
      ].map((el) => {
        const r = el.getBoundingClientRect()
        return {
          choice: el.dataset.drop as FlingChoice,
          left: r.left,
          right: r.right,
        }
      }),
    }
    tracker.current.reset()
    tracker.current.add(e.timeStamp, e.clientX, e.clientY)
    b.hold(b.x, b.y)
    setPhase('held')
  }

  function follow(clientX: number, clientY: number) {
    const g = grab.current!
    body.current!.hold(clientX - g.x, rubberBand(clientY - g.y, 140))
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (grab.current?.id !== e.pointerId) return
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const sample of samples.length ? samples : [e.nativeEvent])
      tracker.current.add(sample.timeStamp, sample.clientX, sample.clientY)
    follow(e.clientX, e.clientY)
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const g = grab.current
    if (g?.id !== e.pointerId) return
    tracker.current.add(e.timeStamp, e.clientX, e.clientY)
    follow(e.clientX, e.clientY)
    const velocity = tracker.current.velocity(e.timeStamp)
    const overTarget =
      g.targets.find((t) => e.clientX >= t.left && e.clientX <= t.right)
        ?.choice ?? null
    const choice = releaseChoice({
      x: body.current!.x,
      vx: velocity.x,
      width: look.current.width,
      overTarget,
    })
    grab.current = null
    if (choice) fling(choice, velocity)
    else returnHome(velocity)
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
    if (grab.current?.id !== e.pointerId) return
    grab.current = null
    returnHome()
  }

  return {
    card,
    stage,
    phase,
    fling: (choice: FlingChoice) => {
      if (!flying.current && !grab.current) fling(choice)
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
    },
  }
}
