import { useId, useRef, type ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { Pencil, Trash2 } from 'lucide-react'
import type { Recipe } from './domain'
import { RecipeArt } from './RecipeArt'
import { useSwipeReveal } from './useSwipeReveal'

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
  const { offset, ...swipe } = useSwipeReveal({
    actionWidth,
    revealed,
    onReveal,
    disabled,
  })
  function showActions() {
    if (disabled) return
    onReveal(true)
    requestAnimationFrame(() => editButton.current?.focus())
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
        {...swipe}
      >
        <div className="recipeRowContent">
          <Button
            ref={titleButton}
            className="recipeRowOpen"
            data-swipe-handle
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
