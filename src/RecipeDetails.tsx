import { useEffect, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { Heart, Pin, RotateCcw, Sparkles, X } from 'lucide-react'
import {
  placeRemix,
  recipeQuantity,
  recipeSchema,
  sourceName,
  toggleLoved,
  type Ingredient,
  type Recipe,
  type State,
} from './domain'
import type { HouseholdStore } from './store'
import { RecipeArt } from './RecipeArt'
import { useConfirm } from './confirm'
import { useGroceryUnits } from './useGroceryUnits'
import { flyToDeck } from './motion/flyToDeck'
import { Body, spring } from './motion/engine'
import { PromptBar } from './ai/PromptBar'
import { diffRecipe, type FieldChange } from './ai/diff'
import type { DraftNote, RecipeAi, RecipeDraft } from './ai/recipeAi'

export type RemixSave = {
  recipe: Recipe
  original?: Recipe
  /** Set when remixing a planned recipe: the remix may take its slot. */
  slot?: { index: number; recipeId: string; title: string }
}
type Remix = { recipe: RecipeDraft; notes: DraftNote[]; prompt: string }

const fieldLabels: Record<FieldChange['field'], string> = {
  title: 'Name',
  description: 'Description',
  servings: 'Makes',
  maxServings: 'Max batch',
  minutes: 'Minutes',
  protein: 'Main protein',
  leftovers: 'Leftover lunches',
  potluck: 'Potluck',
}
const fieldValue = (value: string | number | boolean) =>
  typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value)
const changeLabel = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
} as const

/** A pressed toggle: tapping Loved again takes it back. */
export function LovedButton({
  loved,
  onToggle,
}: {
  loved: boolean
  /** Resolves true once the change is saved. */
  onToggle: () => Promise<boolean>
}) {
  const heart = useRef<HTMLSpanElement>(null)
  async function toggle() {
    const loving = !loved
    if (!(await onToggle()) || !loving || !heart.current) return
    heartbeat(heart.current)
  }
  return (
    <Button
      className="textButton"
      aria-pressed={loved}
      onClick={() => void toggle()}
    >
      <span className="loveHeart" ref={heart}>
        <Heart size={15} fill={loved ? 'currentColor' : 'none'} />
      </span>
      {loved ? 'Loved' : 'We loved this'}
    </Button>
  )
}

const beat = spring(520, 0.32)
/** An elastic pop on the heart with a soft ring rippling out. */
function heartbeat(el: HTMLElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // x is the scale change in percent, matching the engine's rest thresholds.
  const pop = new Body(({ x }) => {
    el.style.scale = x ? String(1 + x / 100) : ''
  })
  pop.springTo(0, 0, beat, { velocity: { x: 900, y: 0 } })
  const ring = document.createElement('span')
  ring.className = 'loveRing'
  ring.setAttribute('aria-hidden', 'true')
  el.append(ring)
  ring
    .animate(
      [
        { scale: '0.5', opacity: 0.5 },
        { scale: '2.6', opacity: 0 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    )
    .finished.finally(() => ring.remove())
}

function AiNote({ note }: { note?: string }) {
  return note ? (
    <small className="aiNote">
      <Sparkles size={12} aria-hidden="true" /> {note}
    </small>
  ) : null
}

export function RecipeDetails({
  recipe,
  household,
  servings,
  slot,
  state,
  change,
  ai,
  saveRemix,
  storeError,
  close,
}: {
  recipe: Recipe
  household?: string | null
  servings?: number
  /** Plan position when opened from the week's plan, enabling Pin. */
  slot?: number
  state: State
  change: HouseholdStore['change']
  ai: RecipeAi
  saveRemix: (save: RemixSave) => void
  /** The household store's last error; the app banner sits behind this card. */
  storeError?: string
  close: () => void
}) {
  const [remixes, setRemixes] = useState<Remix[]>([])
  // Shares the Groceries preference so both screens read the same way.
  const { system: units, setSystem: setUnits } = useGroceryUnits()
  const banner = useRef<HTMLElement>(null)
  // The prompt sits at the bottom; bring each new remix's summary into view.
  useEffect(() => {
    if (remixes.length)
      banner.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
  }, [remixes.length])
  const [pending, setPending] = useState(false)
  const [aiError, setAiError] = useState('')
  const current = remixes.at(-1)
  const shown: RecipeDraft = current?.recipe ?? recipe
  const diff = current
    ? diffRecipe(recipe, current.recipe, current.notes)
    : null
  const portions = current ? shown.servings : (servings ?? recipe.servings)
  const scale = portions / shown.servings
  const planned = slot === undefined ? undefined : state.plan[slot]
  const pinned = planned?.recipeId === recipe.id && planned.pinned
  const loved = state.loved.includes(recipe.id)

  const confirm = useConfirm()
  async function requestClose() {
    if (
      remixes.length &&
      !(await confirm({
        title: 'Discard this remix?',
        body: 'It has not been saved.',
        confirm: 'Discard',
        cancel: 'Keep editing',
      }))
    )
      return
    close()
  }
  async function remix(instruction: string) {
    setPending(true)
    setAiError('')
    try {
      const result = await ai.draft({
        instruction,
        base: current?.recipe,
        history: remixes.map((r) => r.prompt).slice(-10),
        original: recipe,
      })
      if ('declined' in result) {
        setAiError(result.declined)
        return false
      }
      setRemixes((list) => [
        ...list,
        { recipe: result.recipe, notes: result.notes, prompt: instruction },
      ])
      return true
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setPending(false)
    }
  }
  async function save(replace: boolean, button: HTMLElement) {
    if (!current) return
    const planSlot =
      slot !== undefined && planned?.recipeId === recipe.id
        ? { index: slot, recipeId: recipe.id, title: recipe.title }
        : undefined
    const aiDraft = {
      createdAt: new Date().toISOString(),
      prompts: remixes.map((r) => r.prompt).slice(-20),
      derivedFrom: recipe.id,
    }
    if (!replace) {
      // A new remix saves straight to Recipes; the original is untouched.
      const added: Recipe = {
        ...current.recipe,
        title:
          current.recipe.title === recipe.title
            ? `${recipe.title.slice(0, 193)} remix`
            : current.recipe.title,
        id: crypto.randomUUID(),
        source: 'own',
        sourceUrl: recipe.sourceUrl,
        aiDraft,
      }
      const saved = await change(
        (s) => {
          // Validation errors surface through the shared error banner.
          const next = {
            ...s,
            recipes: [...s.recipes, recipeSchema.parse(added)],
          }
          return (
            (planSlot &&
              placeRemix(next, planSlot.index, planSlot.recipeId, added)) ||
            next
          )
        },
        { kind: 'recipe', recipeId: added.id },
      )
      if (saved) {
        flyToDeck(button)
        close()
      }
      return
    }
    if (
      !(await confirm({
        title: 'Replace the original with this remix?',
        body:
          recipe.source === 'reference'
            ? 'It becomes your own recipe: the imported source facts are dropped, and the source link is kept.'
            : undefined,
        confirm: 'Replace original',
      }))
    )
      return
    // Reference facts belong to the imported recipe, not the remix.
    const { facts, ...rest } = recipe
    saveRemix({
      recipe: { ...rest, ...current.recipe, source: 'own', aiDraft },
      original: recipe,
      slot: planSlot,
    })
  }
  const quantity = (item: Ingredient) =>
    recipeQuantity(item.amount * scale, item.unit, units)
  const amount = (item: Ingredient) => `${quantity(item)} ${item.name}`

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) void requestClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialogBackdrop" />
        <Dialog.Popup className="dialogPopup">
          <Dialog.Title>{shown.title}</Dialog.Title>
          <Dialog.Description>
            {current
              ? 'Unsaved AI remix. Not kitchen-tested.'
              : recipe.source === 'demo'
                ? 'Illustrative demo, not a tested cooking recipe.'
                : recipe.aiDraft
                  ? 'Your household recipe, drafted with AI and reviewed by you. Not kitchen-tested.'
                  : recipe.source === 'reference'
                    ? 'Imported from a recipe source, with its ingredients and directions.'
                    : 'Your household recipe.'}
          </Dialog.Description>
          <Dialog.Close className="dialogClose" aria-label="Close recipe">
            <X size={20} />
          </Dialog.Close>
          <RecipeArt recipe={recipe} household={household} />
          {/* An untried remix is pinned by saving it and loved after cooking. */}
          {!current && (
            <div className="buttonRow detailActions">
              {planned?.recipeId === recipe.id && (
                <Button
                  className={`textButton pinRecipe ${pinned ? 'pinned' : ''}`}
                  aria-label={`${pinned ? 'Unpin' : 'Pin'} ${recipe.title}`}
                  aria-pressed={pinned}
                  onClick={async (e) => {
                    const button = e.currentTarget
                    if (
                      (await change(
                        (s) => ({
                          ...s,
                          plan: s.plan.map((p, i) =>
                            i === slot ? { ...p, pinned: !p.pinned } : p,
                          ),
                        }),
                        { kind: 'pin', recipeId: recipe.id },
                      )) &&
                      !pinned
                    )
                      flyToDeck(button)
                  }}
                >
                  <Pin size={14} fill={pinned ? 'currentColor' : 'none'} />
                  {pinned ? 'Unpin' : 'Pin'}
                </Button>
              )}
              <LovedButton
                loved={loved}
                onToggle={() => {
                  const { event } = toggleLoved(state, recipe.id)
                  return change((s) => toggleLoved(s, recipe.id).state, event)
                }}
              />
            </div>
          )}
          {current && diff && (
            <section
              ref={banner}
              className="notice aiNotice remixBanner"
              aria-live="polite"
            >
              <strong>
                <Sparkles size={15} /> Unsaved remix · AI-drafted
              </strong>
              <p>
                {diff.counts.added} added · {diff.counts.removed} removed ·{' '}
                {diff.counts.changed} changed
              </p>
              {diff.general.length > 0 && (
                <ul>
                  {diff.general.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              )}
              <div className="buttonRow">
                <Button
                  className="textButton"
                  onClick={() => setRemixes((list) => list.slice(0, -1))}
                >
                  <RotateCcw size={14} /> Undo last change
                </Button>
                <Button className="textButton" onClick={() => setRemixes([])}>
                  Discard remix
                </Button>
              </div>
              {storeError && (
                <p role="alert" className="error">
                  {storeError}
                </p>
              )}
              <div className="buttonRow">
                <Button
                  className="primaryButton"
                  onClick={(e) => void save(false, e.currentTarget)}
                >
                  Save as new recipe
                </Button>
                {recipe.source !== 'demo' && (
                  <Button
                    className="secondaryButton"
                    onClick={(e) => void save(true, e.currentTarget)}
                  >
                    Replace original
                  </Button>
                )}
              </div>
            </section>
          )}
          <div
            key={remixes.length}
            className={remixes.length ? 'draftReveal' : undefined}
          >
            <p>{shown.description}</p>
            {recipe.sourceUrl && !current && (
              <p className="helper">
                Source reference:{' '}
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {sourceName(recipe.sourceUrl)}
                </a>
                {recipe.source === 'reference'
                  ? '. Ingredients, yield, time and directions were imported; photos were not.'
                  : '. Recipe details below were entered by your household, not imported.'}
              </p>
            )}
            <p>
              <strong>{portions} servings</strong> · {shown.minutes} min for
              original batch · {scale.toFixed(2)}x quantities
            </p>
            {diff && diff.fields.length > 0 && (
              <ul className="changeList">
                {diff.fields.map((field) => (
                  <li key={field.field} className="chg-changed">
                    <span className="changeTag">Changed</span>
                    {fieldLabels[field.field]}:{' '}
                    {field.field === 'description' ? (
                      'updated'
                    ) : (
                      <>
                        <del>{fieldValue(field.before)}</del> →{' '}
                        {fieldValue(field.after)}
                      </>
                    )}
                    <AiNote note={field.note} />
                  </li>
                ))}
              </ul>
            )}
            <p className="helper">
              Cooking time and equipment may change with batch size. Refrigerate
              leftovers promptly; freeze portions that will not be eaten within
              3-4 days.
            </p>
            <div className="ingredientsHeading">
              <h3>Ingredients</h3>
              <div
                className="unitToggle"
                role="group"
                aria-label="Recipe unit system"
              >
                {(['us', 'metric'] as const).map((system) => (
                  <Button
                    key={system}
                    aria-pressed={units === system}
                    onClick={() => setUnits(system)}
                  >
                    {system === 'metric' ? 'Metric' : 'US kitchen'}
                  </Button>
                ))}
              </div>
            </div>
            {diff ? (
              <ul className="changeList">
                {diff.ingredients.map((item, index) => (
                  <li key={index} className={`chg-${item.change}`}>
                    {item.change !== 'same' && (
                      <span className="changeTag">
                        {changeLabel[item.change]}
                      </span>
                    )}
                    {item.change === 'removed' ? (
                      <del>{amount(item.ingredient)}</del>
                    ) : (
                      amount(item.ingredient)
                    )}
                    {item.before && (
                      <small className="wasValue">
                        was {quantity(item.before)}
                      </small>
                    )}
                    <AiNote note={item.note} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {recipe.ingredients.map((item, index) => (
                  <li key={index}>{amount(item)}</li>
                ))}
              </ul>
            )}
            {!current && recipe.facts?.needsReview && (
              <>
                <h3>Review before planning</h3>
                <p>
                  Confirm the ingredients, your practical batch size and
                  leftover suitability.
                </p>
                <ul>
                  {recipe.facts.pendingIngredients.map((item, index) => (
                    <li key={index}>
                      {item.sourceText} — {item.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!current && recipe.facts && (
              <details>
                <summary>Original ingredient facts</summary>
                <p className="helper">
                  Source snapshot:{' '}
                  {new Date(recipe.facts.retrievedAt).toLocaleDateString()}
                </p>
                <ul>
                  {recipe.facts.ingredientLines.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
            {diff ? (
              <>
                <h3>Method</h3>
                <ol className="changeList">
                  {diff.steps.map((step, index) => (
                    <li
                      key={index}
                      className={`chg-${step.change}`}
                      value={step.number}
                    >
                      {step.change !== 'same' && (
                        <span className="changeTag">
                          {changeLabel[step.change]}
                        </span>
                      )}
                      {step.change === 'removed' ? (
                        <del>{step.text}</del>
                      ) : (
                        step.text
                      )}
                      {step.before && (
                        <small className="wasValue">was: {step.before}</small>
                      )}
                      <AiNote note={step.note} />
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              recipe.instructions.length > 0 && (
                <>
                  <h3>Method</h3>
                  <ol>
                    {recipe.instructions.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </>
              )
            )}
            {recipe.sourceUrl && (
              <a
                className="secondaryButton"
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View the original on {sourceName(recipe.sourceUrl)}
              </a>
            )}
          </div>
          {pending && (
            <p role="status" className="helper">
              Remixing...
            </p>
          )}
          {aiError && (
            <p role="alert" className="error">
              {aiError}
            </p>
          )}
          {ai.demo && (
            <p className="helper">
              Demo mode makes example changes instead of reading your request.
            </p>
          )}
          <PromptBar
            quiet
            label="Remix this recipe"
            placeholder="I want to remix this recipe..."
            submitLabel="Remix recipe"
            pending={pending}
            onSubmit={remix}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
