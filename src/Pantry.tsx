import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { Check, Plus, X } from 'lucide-react'
import {
  addPantryItem,
  removePantryItem,
  type PantryItem,
  type State,
} from './domain'
import type { HouseholdStore } from './store'
import { useSwipeReveal } from './useSwipeReveal'

function PantryRow({
  item,
  revealed,
  onReveal,
  onRemove,
  busy,
}: {
  item: PantryItem
  revealed: boolean
  onReveal: (open: boolean) => void
  onRemove: () => Promise<void>
  busy: boolean
}) {
  const actionWidth = 56
  const id = useId()
  const front = useRef<HTMLDivElement>(null)
  const remove = useRef<HTMLButtonElement>(null)
  const { offset, ...swipe } = useSwipeReveal({
    actionWidth,
    revealed,
    onReveal,
    disabled: busy,
  })
  function showRemove() {
    if (busy) return
    onReveal(true)
    requestAnimationFrame(() => remove.current?.focus())
  }
  return (
    <li
      className="pantryItem"
      data-revealed={revealed}
      onBlur={(event) => {
        if (!busy && !event.currentTarget.contains(event.relatedTarget))
          onReveal(false)
      }}
      onKeyDown={(event) => {
        if (
          event.target === front.current &&
          (event.key === 'ArrowLeft' || (event.shiftKey && event.key === 'F10'))
        ) {
          event.preventDefault()
          showRemove()
        } else if (
          revealed &&
          (event.key === 'Escape' || event.key === 'ArrowRight')
        ) {
          event.preventDefault()
          onReveal(false)
          front.current?.focus()
        }
      }}
    >
      <span className="visuallyHidden" id={`${id}-help`}>
        Swipe left or press Left Arrow to reveal Remove.
      </span>
      <div
        className="pantryRowFront"
        ref={front}
        role="group"
        tabIndex={busy ? -1 : 0}
        aria-label={item.name}
        aria-describedby={`${id}-help`}
        aria-keyshortcuts="ArrowLeft Shift+F10"
        data-dragging={offset !== null}
        style={{
          transform: `translateX(${offset ?? (revealed ? -actionWidth : 0)}px)`,
        }}
        {...swipe}
        onContextMenu={(event) => {
          event.preventDefault()
          showRemove()
        }}
        onClick={() => {
          if (revealed) onReveal(false)
        }}
      >
        <Check className="pantryCheck" size={16} aria-hidden="true" />
        <strong className="pantryName">{item.name}</strong>
      </div>
      <div className="pantryRowActions" aria-hidden={!revealed}>
        <Button
          ref={remove}
          className="iconButton pantryRemove"
          aria-label={`Remove ${item.name}`}
          tabIndex={revealed ? 0 : -1}
          disabled={busy || !revealed}
          onClick={() => void onRemove()}
        >
          <X size={18} aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}

export function Pantry({
  state,
  change,
  busy,
  error,
}: { state: State } & Pick<HouseholdStore, 'change' | 'busy' | 'error'>) {
  const [open, setOpen] = useState(false)
  const [ingredient, setIngredient] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [added, setAdded] = useState('')
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{
    target: HTMLElement | null
  }>()
  const input = useRef<HTMLInputElement>(null)
  const homeHeading = useRef<HTMLHeadingElement>(null)
  const submitting = useRef(false)
  useEffect(() => {
    if (focusRequest?.target?.isConnected) focusRequest.target.focus()
  }, [focusRequest])

  async function add() {
    if (submitting.current) return
    submitting.current = true
    setAttempted(true)
    setAdded('')
    try {
      if (
        await change((current) => addPantryItem(current, ingredient), {
          kind: 'pantry',
        })
      ) {
        setAdded(ingredient.trim())
        setIngredient('')
        setFocusRequest({ target: input.current })
      }
    } finally {
      submitting.current = false
    }
  }

  return (
    <main className="screen pantryScreen">
      <Dialog.Root
        open={open}
        onOpenChange={(next, event) => {
          if (submitting.current) {
            event.cancel()
            return
          }
          setOpen(next)
          if (next) {
            setRevealedId(null)
            setIngredient('')
            setAttempted(false)
            setAdded('')
          }
        }}
      >
        <header className="screenHeader">
          <div>
            <span className="eyebrow">YOUR KITCHEN</span>
            <h1 tabIndex={-1}>Pantry</h1>
            <span className="helper">
              {state.pantry.length}{' '}
              {state.pantry.length === 1 ? 'ingredient' : 'ingredients'}
            </span>
          </div>
          <Dialog.Trigger
            className="iconButton addRecipeButton"
            aria-label="Add pantry ingredient"
          >
            <Plus size={27} aria-hidden="true" />
          </Dialog.Trigger>
        </header>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialogBackdrop" />
          <Dialog.Popup className="dialogPopup pantryAddSheet">
            <div className="sheetHandle" aria-hidden="true" />
            <Dialog.Title>Add to pantry</Dialog.Title>
            <Dialog.Description className="helper">
              Type an ingredient you already have at home.
            </Dialog.Description>
            <form
              className="pantryQuickAdd"
              onSubmit={(event) => {
                event.preventDefault()
                void add()
              }}
            >
              <input
                ref={input}
                aria-label="Ingredient name"
                placeholder="Add an ingredient..."
                value={ingredient}
                onChange={(event) => setIngredient(event.target.value)}
                maxLength={200}
                required
                disabled={busy}
                autoComplete="off"
                enterKeyHint="done"
              />
              <Button
                className="iconButton"
                type="submit"
                aria-label="Add ingredient"
                disabled={busy || !ingredient.trim()}
              >
                <Plus size={20} aria-hidden="true" />
              </Button>
            </form>
            {attempted && error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p className="helper" role="status">
              {added
                ? `${added} added. Add another or tap outside to finish.`
                : ''}
            </p>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <p className="screenLead">
        What you have at home. Automatically crossed off your grocery list.
      </p>
      <section className="pantryHome" aria-labelledby="pantry-home-heading">
        <h2 id="pantry-home-heading" ref={homeHeading} tabIndex={-1}>
          At home
        </h2>
        <ul className="pantryList">
          {[...state.pantry]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <PantryRow
                key={item.id}
                item={item}
                busy={busy}
                revealed={revealedId === item.id}
                onReveal={(revealed) =>
                  setRevealedId((current) =>
                    revealed ? item.id : current === item.id ? null : current,
                  )
                }
                onRemove={async () => {
                  if (
                    await change(
                      (current) => removePantryItem(current, item.id),
                      { kind: 'pantry' },
                    )
                  ) {
                    setRevealedId(null)
                    setFocusRequest({ target: homeHeading.current })
                  }
                }}
              />
            ))}
        </ul>
        {state.pantry.length === 0 && (
          <p className="helper">Tap + to add what you have at home.</p>
        )}
      </section>
    </main>
  )
}
