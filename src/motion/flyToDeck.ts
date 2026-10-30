import { Body, spring } from './engine'

const toss = spring(100, 0.8)
const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

function bump(target: Element) {
  if (reducedMotion() || !('animate' in target)) return
  target.animate(
    [{ scale: '1' }, { scale: '1.22' }, { scale: '0.96' }, { scale: '1' }],
    { duration: 420, easing: 'ease-out' },
  )
}

/**
 * Throws a small card from `from` into the `[data-deck-target]` element (the
 * Recipes tab) along a springy arc, then bumps the target as it lands.
 */
export function flyToDeck(from: Element) {
  const target = document.querySelector('[data-deck-target]')
  if (!target) return
  if (reducedMotion()) return bump(target)
  const start = from.getBoundingClientRect()
  const end = target.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.className = 'deckGhost'
  ghost.setAttribute('aria-hidden', 'true')
  ghost.style.left = `${start.left + start.width / 2 - 22}px`
  ghost.style.top = `${start.top + start.height / 2 - 28}px`
  document.body.append(ghost)
  const dx = end.left + end.width / 2 - (start.left + start.width / 2)
  const dy = end.top + end.height / 3 - (start.top + start.height / 2)
  const distance = Math.hypot(dx, dy) || 1
  const body = new Body(({ x, y, vx }) => {
    const progress = Math.min(1, Math.hypot(x, y) / distance)
    const angle = Math.max(-25, Math.min(25, vx * 0.02))
    ghost.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${1 - progress * 0.55})`
    ghost.style.opacity = String(1 - Math.max(0, progress - 0.8) * 4)
  })
  // An upward kick away from the target gives the throw its arc.
  body.springTo(dx, dy, toss, {
    velocity: { x: -dx * 0.6, y: -650 },
    until: (b) => Math.hypot(dx - b.x, dy - b.y) < 10,
    onRest: () => {
      ghost.remove()
      bump(target)
    },
  })
}
