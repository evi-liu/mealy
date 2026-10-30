import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'

export function useSwipeReveal({
  actionWidth,
  revealed,
  onReveal,
  disabled = false,
}: {
  actionWidth: number
  revealed: boolean
  onReveal: (open: boolean) => void
  disabled?: boolean
}) {
  const [offset, setOffset] = useState<number | null>(null)
  const gesture = useRef<{
    id: number
    x: number
    y: number
    start: number
    offset: number
    dragging: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  function down(event: PointerEvent<HTMLElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || gesture.current)
      return
    suppressClick.current = false
    if (
      event.target instanceof Element &&
      event.target.closest('button:not([data-swipe-handle])')
    )
      return
    const start = revealed ? -actionWidth : 0
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start,
      offset: start,
      dragging: false,
    }
  }
  function move(event: PointerEvent<HTMLElement>) {
    const grab = gesture.current
    if (grab?.id !== event.pointerId) return
    const dx = event.clientX - grab.x
    const dy = event.clientY - grab.y
    if (!grab.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        gesture.current = null
        return
      }
      grab.dragging = true
      suppressClick.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    grab.offset = Math.max(-actionWidth, Math.min(0, grab.start + dx))
    setOffset(grab.offset)
  }
  function finish(event: PointerEvent<HTMLElement>, cancelled = false) {
    const grab = gesture.current
    if (grab?.id !== event.pointerId) return
    gesture.current = null
    setOffset(null)
    if (grab.dragging && !cancelled)
      onReveal(grab.offset < -Math.min(actionWidth / 2, 40))
  }
  return {
    offset,
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      // Touch can transfer implicit capture from a child to the row.
      if (event.target === event.currentTarget) finish(event, true)
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (suppressClick.current && event.detail !== 0) {
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}
