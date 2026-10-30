import {
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Button } from '@base-ui/react/button'
import { Pencil, Trash2 } from 'lucide-react'
import type { Recipe } from './domain'
import { RecipeArt } from './RecipeArt'

export function RecipeLibraryRow({
  recipe,
  household,
  subtitle,
  actions,
  revealed,
  onReveal,
  onOpen,
  onEdit,
  onDelete,
  disabled = false,
}: {
  recipe: Recipe
  household?: string | null
  subtitle: ReactNode
  actions?: ReactNode
  revealed: boolean
  onReveal: (open: boolean) => void
  onOpen: () => void
  onEdit: () => void
  onDelete?: () => void
  disabled?: boolean
}) {
  const actionWidth = onDelete ? 152 : 76
  const id = useId()
  const titleButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
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
  function showActions() {
    if (disabled) return
    onReveal(true)
    requestAnimationFrame(() => editButton.current?.focus())
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || gesture.current)
      return
    suppressClick.current = false
    if (
      event.target instanceof Element &&
      event.target.closest('button:not(.recipeRowOpen)')
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
  function move(event: PointerEvent<HTMLDivElement>) {
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
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const grab = gesture.current
    if (grab?.id !== event.pointerId) return
    gesture.current = null
    setOffset(null)
    if (grab.dragging && !cancelled)
      onReveal(grab.offset < -Math.min(actionWidth / 2, 40))
  }
  return (
    <article
      className="recipeEntry libraryRow"
      data-revealed={revealed}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onReveal(false)
      }}
      onKeyDown={(event) => {
        if (
          event.target === titleButton.current &&
          (event.key === 'ArrowLeft' || (event.shiftKey && event.key === 'F10'))
        ) {
          event.preventDefault()
          showActions()
        } else if (
          (event.key === 'Escape' || event.key === 'ArrowRight') &&
          revealed
        ) {
          event.preventDefault()
          onReveal(false)
          titleButton.current?.focus()
        }
      }}
      onContextMenu={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.recipeRowOpen')
        ) {
          event.preventDefault()
          showActions()
        }
      }}
    >
      <span className="visuallyHidden" id={`${id}-help`}>
        Swipe left or press Left Arrow for{' '}
        {onDelete ? 'Edit and Delete' : 'Edit'}.
      </span>
      <div
        className="recipeRowFront"
        data-dragging={offset !== null}
        style={{
          transform: `translateX(${offset ?? (revealed ? -actionWidth : 0)}px)`,
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => {
          // Touch transfers implicit capture from the title button to this row.
          if (event.target === event.currentTarget) finish(event, true)
        }}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail !== 0) {
            suppressClick.current = false
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        <div className="recipeRowContent">
          <Button
            ref={titleButton}
            className="recipeRowOpen"
            aria-label={recipe.title}
            aria-describedby={`${id}-metadata ${id}-help`}
            aria-keyshortcuts="ArrowLeft Shift+F10"
            disabled={disabled}
            onClick={() => (revealed ? onReveal(false) : onOpen())}
          >
            <RecipeArt recipe={recipe} household={household} compact />
            <strong className="recipeRowTitle">{recipe.title}</strong>
          </Button>
          <small className="recipeRowMetadata" id={`${id}-metadata`}>
            {subtitle}
          </small>
        </div>
        {actions}
      </div>
      <div
        className="recipeRowActions"
        id={id}
        aria-hidden={!revealed}
        style={{ width: actionWidth }}
      >
        <Button
          ref={editButton}
          className="recipeRowEdit"
          tabIndex={revealed ? 0 : -1}
          disabled={disabled}
          onClick={onEdit}
        >
          <Pencil size={19} aria-hidden="true" />
          Edit
        </Button>
        {onDelete && (
          <Button
            className="recipeRowEdit recipeRowDelete"
            tabIndex={revealed ? 0 : -1}
            disabled={disabled}
            onClick={onDelete}
          >
            <Trash2 size={19} aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>
    </article>
  )
}
