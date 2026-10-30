import { useEffect, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { Check, Plus, X } from 'lucide-react'
import { addPantryItem, removePantryItem, type State } from './domain'
import type { HouseholdStore } from './store'

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
              <li className="pantryItem" key={item.id}>
                <Check className="pantryCheck" size={16} aria-hidden="true" />
                <strong className="pantryName">{item.name}</strong>
                <Button
                  className="iconButton pantryRemove"
                  aria-label={`Remove ${item.name}`}
                  onClick={async () => {
                    if (
                      await change(
                        (current) => removePantryItem(current, item.id),
                        { kind: 'pantry' },
                      )
                    )
                      setFocusRequest({ target: homeHeading.current })
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </Button>
              </li>
            ))}
        </ul>
        <p className="helper">
          {state.pantry.length
            ? 'Remove an ingredient when you run out so it returns to your grocery list.'
            : 'Tap + to add what you have at home.'}
        </p>
      </section>
    </main>
  )
}
