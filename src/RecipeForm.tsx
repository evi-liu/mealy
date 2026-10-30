import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@base-ui/react/button'
import { ArrowLeft, Plus, Sparkles, X } from 'lucide-react'
import {
  categories,
  recipeSchema,
  sourceName,
  units,
  type Ingredient,
  type Recipe,
  type Bookmark,
} from './domain'
import { PromptBar } from './ai/PromptBar'
import { useConfirm } from './confirm'
import { flyToDeck } from './motion/flyToDeck'
import type { DraftBase, RecipeAi, RecipeDraft } from './ai/recipeAi'

type EditableIngredient = Omit<Ingredient, 'unit'> & {
  unit: Ingredient['unit'] | ''
  review?: { sourceText: string; reason: string }
}

export function RecipeForm({
  recipe,
  onSave,
  onCancel,
  live,
  bookmark,
  ai,
  heading,
  notice,
  celebrate = false,
}: {
  recipe?: Recipe
  onSave: (recipe: Recipe, image?: File) => Promise<boolean>
  onCancel: () => void
  live: boolean
  bookmark?: Bookmark
  /** Offered only for brand-new recipes; drafts stay local until saved. */
  ai?: RecipeAi
  heading?: string
  notice?: string
  /** Throw a card into the Recipes tab once a new recipe is saved. */
  celebrate?: boolean
}) {
  const reference = recipe?.source === 'reference'
  const [ingredients, setIngredients] = useState<EditableIngredient[]>(
    recipe
      ? [
          ...recipe.ingredients,
          ...(recipe.facts?.pendingIngredients ?? []).map<EditableIngredient>(
            (item) => ({
              name: item.name,
              amount: NaN,
              unit: item.unit ?? '',
              category: item.category,
              review: { sourceText: item.sourceText, reason: item.reason },
            }),
          ),
        ]
      : [
          {
            name: '',
            amount: bookmark ? NaN : 1,
            unit: 'g',
            category: 'Produce',
          },
        ],
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState<RecipeDraft>()
  const [draftCount, setDraftCount] = useState(0)
  const [aiDraft, setAiDraft] = useState(recipe?.aiDraft)
  const [notes, setNotes] = useState<string[]>([])
  const [aiError, setAiError] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [touched, setTouched] = useState(false)
  const confirm = useConfirm()
  async function leave() {
    if (
      (touched || draft) &&
      !(await confirm({
        title: 'Leave without saving?',
        body: 'Your changes to this recipe will be lost.',
        confirm: 'Leave',
        cancel: 'Keep editing',
      }))
    )
      return
    onCancel()
  }
  const values = draft ?? recipe
  function currentBase(): DraftBase {
    const form = new FormData(formRef.current!)
    const field = (name: string) => String(form.get(name) ?? '')
    const number = (name: string) => {
      const value = Number(field(name))
      return field(name) && Number.isFinite(value) ? value : null
    }
    return {
      title: field('title'),
      description: field('description'),
      servings: number('servings'),
      maxServings: number('maxServings'),
      minutes: number('minutes'),
      protein: field('protein'),
      leftovers: form.has('leftovers'),
      potluck: form.has('potluck'),
      ingredients: ingredients.map((item) => ({
        name: item.name,
        amount: Number.isNaN(item.amount) ? null : item.amount,
        unit: item.unit,
        category: item.category,
      })),
      instructions: field('instructions')
        .split('\n')
        .map((step) => step.trim())
        .filter(Boolean),
    }
  }
  async function requestDraft(instruction: string) {
    if (!ai) return false
    // Read the form before disabling it: disabled fields are not submitted.
    const base = aiDraft ? currentBase() : undefined
    setDrafting(true)
    setAiError('')
    try {
      const result = await ai.draft({
        instruction,
        base,
        history: aiDraft?.prompts.slice(-10) ?? [],
      })
      if ('declined' in result) {
        setAiError(result.declined)
        return false
      }
      setDraft(result.recipe)
      setIngredients(result.recipe.ingredients)
      setNotes(result.notes.map((note) => note.text))
      setAiDraft((current) => ({
        createdAt: current?.createdAt ?? new Date().toISOString(),
        prompts: [...(current?.prompts ?? []), instruction].slice(-20),
      }))
      setDraftCount((count) => count + 1)
      setError('')
      return true
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setDrafting(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const button = (event.nativeEvent as SubmitEvent).submitter
    const form = new FormData(event.currentTarget)
    const parsed = recipeSchema.safeParse({
      id: recipe?.id ?? crypto.randomUUID(),
      title: form.get('title'),
      description: form.get('description'),
      servings: Number(form.get('servings')),
      maxServings: Number(form.get('maxServings')),
      minutes: Number(form.get('minutes')),
      protein: form.get('protein'),
      leftovers: form.has('leftovers'),
      potluck: form.has('potluck'),
      source: reference ? 'reference' : 'own',
      sourceUrl: String(form.get('sourceUrl') ?? '').trim() || undefined,
      facts: recipe?.facts
        ? {
            ...recipe.facts,
            needsReview: false,
            pendingIngredients: [],
          }
        : undefined,
      ingredients,
      instructions: reference
        ? []
        : String(form.get('instructions'))
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
      imagePath: recipe?.imagePath,
      aiDraft,
    })
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      )
      return
    }
    if (parsed.data.maxServings < parsed.data.servings) {
      setError(
        'Maximum batch size must be at least the original recipe servings.',
      )
      return
    }
    const file = form.get('image')
    const image = file instanceof File && file.size > 0 ? file : undefined
    if (
      image &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type) ||
        image.size > 5 * 1024 * 1024)
    ) {
      setError('Choose a JPEG, PNG or WebP under 5 MB.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (await onSave(parsed.data, image)) {
        // Measure the button before the form closes and unmounts it.
        if (celebrate && button) flyToDeck(button)
        onCancel()
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }
  function editIngredient(index: number, patch: Partial<EditableIngredient>) {
    setIngredients((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
  }
  return (
    <form
      className="recipeForm"
      onSubmit={submit}
      onInput={() => setTouched(true)}
      ref={formRef}
    >
      <Button
        className="iconButton floatingBack"
        aria-label="Back to recipes"
        onClick={leave}
      >
        <ArrowLeft size={20} />
      </Button>
      <h2>
        {heading ??
          (reference
            ? 'Review recipe facts'
            : recipe
              ? 'Edit your recipe'
              : 'A recipe of your own')}
      </h2>
      <p className="helper">
        {reference
          ? 'Review the source quantities and your batch capacity before planning. Directions stay on the original website; no instructions or photos were imported.'
          : 'Use your own recipe or content you have permission to save. All quantities describe the original batch.'}
      </p>
      {bookmark && (
        <p className="notice">
          This is a link bookmark, not an imported recipe. Enter only your own
          recipe details or content you have permission to save. Yield, amounts
          and timing must be reviewed before this can enter a plan.
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}
      {ai && !aiDraft && (
        <section className="aiPrompt" aria-labelledby="ai-prompt-heading">
          <h3 id="ai-prompt-heading">
            <Sparkles size={17} /> Draft it with AI
          </h3>
          <p className="helper">
            Describe a dish and AI fills in the form below. Nothing is saved
            until you review it and tap Save.
            {ai.demo && ' Demo mode shows a canned example.'}
          </p>
          <PromptBar
            label="Describe a recipe to add"
            placeholder="Describe a recipe you'd like to add..."
            submitLabel="Draft recipe"
            pending={drafting}
            onSubmit={requestDraft}
          />
        </section>
      )}
      {aiDraft && (
        <section className="notice aiNotice" aria-live="polite">
          <strong>
            <Sparkles size={15} /> AI-drafted · not kitchen-tested
          </strong>
          {notes.length > 0 && (
            <ul>
              {notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
          <p>Check amounts, servings, batch size and steps before saving.</p>
        </section>
      )}
      {drafting && (
        <p role="status" className="helper">
          Drafting your recipe...
        </p>
      )}
      {aiError && (
        <p role="alert" className="error">
          {aiError}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset
        disabled={saving || drafting}
        key={draftCount}
        className={draftCount ? 'draftReveal' : undefined}
      >
        <label>
          Recipe name
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={values?.title ?? bookmark?.title}
          />
        </label>
        <label>
          {reference
            ? 'Original recipe'
            : 'Source reference (optional HTTPS link)'}
          <input
            name="sourceUrl"
            type="url"
            maxLength={2048}
            required={reference}
            readOnly={reference}
            defaultValue={recipe?.sourceUrl ?? bookmark?.url}
          />
        </label>
        <label>
          A little description
          <textarea
            name="description"
            maxLength={500}
            defaultValue={values?.description}
          />
        </label>
        <div className="formGrid">
          <label>
            Makes (servings)
            <input
              name="servings"
              type="number"
              min={1}
              max={30}
              required
              defaultValue={values?.servings ?? (bookmark ? undefined : 4)}
            />
          </label>
          <label>
            Max batch servings
            <input
              name="maxServings"
              type="number"
              min={2}
              max={60}
              required
              defaultValue={values?.maxServings ?? (bookmark ? undefined : 12)}
            />
          </label>
          <label>
            Total minutes
            <input
              name="minutes"
              type="number"
              min={1}
              max={1440}
              required
              defaultValue={values?.minutes ?? (bookmark ? undefined : 30)}
            />
          </label>
          <label>
            Main protein / variety
            <input
              name="protein"
              required
              maxLength={200}
              placeholder="e.g. lentils"
              defaultValue={
                draft
                  ? draft.protein
                  : recipe?.facts?.needsReview
                    ? undefined
                    : recipe?.protein
              }
            />
          </label>
        </div>
        <p className="helper">
          Maximum batch size is what you can realistically cook with your
          equipment. Scaling changes quantities, not cooking time.
          {reference &&
            ' Imported recipes start conservatively at the original yield. Review leftover and potluck suitability yourself.'}
        </p>
        <label className="checkLabel">
          <input
            name="leftovers"
            type="checkbox"
            defaultChecked={values?.leftovers ?? !bookmark}
          />{' '}
          Good for leftover lunches
        </label>
        <label className="checkLabel">
          <input
            name="potluck"
            type="checkbox"
            defaultChecked={values?.potluck ?? false}
          />{' '}
          Suitable for a potluck
        </label>
        {recipe?.facts && (
          <details>
            <summary>Original ingredient facts</summary>
            <ul>
              {recipe.facts.ingredientLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </details>
        )}
        <h3>Ingredients</h3>
        <p className="helper">
          Use consistent ingredient names to merge groceries. Cups/spoons use US
          kitchen measures (240/15/5 ml). No mass-to-volume guessing.
        </p>
        {ingredients.map((item, index) => (
          <div className="ingredientEditor" key={index}>
            {item.review && (
              <p className="helper">
                Source: {item.review.sourceText}. {item.review.reason}
              </p>
            )}
            <label>
              Ingredient {index + 1}
              <input
                required
                maxLength={200}
                value={item.name}
                onChange={(e) =>
                  editIngredient(index, { name: e.target.value })
                }
              />
            </label>
            <div className="ingredientNumbers">
              <label>
                Amount
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  max="100000"
                  required
                  value={Number.isNaN(item.amount) ? '' : item.amount}
                  onChange={(e) =>
                    editIngredient(index, { amount: e.target.valueAsNumber })
                  }
                />
              </label>
              <label>
                Unit
                <select
                  value={item.unit}
                  required
                  onChange={(e) =>
                    editIngredient(index, {
                      unit: units.find((unit) => unit === e.target.value)!,
                    })
                  }
                >
                  <option value="" disabled>
                    Choose a unit
                  </option>
                  {units.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={item.category}
                  onChange={(e) =>
                    editIngredient(index, {
                      category:
                        categories.find((c) => c === e.target.value) ?? 'Other',
                    })
                  }
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <Button
                className="iconButton"
                aria-label={`Remove ingredient ${index + 1}`}
                disabled={ingredients.length === 1}
                onClick={() =>
                  setIngredients((items) => items.filter((_, i) => i !== index))
                }
              >
                <X size={18} />
              </Button>
            </div>
          </div>
        ))}
        <Button
          className="secondaryButton"
          disabled={ingredients.length >= 60}
          onClick={() =>
            setIngredients((items) => [
              ...items,
              { name: '', amount: 1, unit: 'g', category: 'Produce' },
            ])
          }
        >
          <Plus size={18} /> Add ingredient
        </Button>
        {reference && recipe.sourceUrl ? (
          <a
            className="secondaryButton"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read cooking directions on {sourceName(recipe.sourceUrl)}
          </a>
        ) : (
          <label>
            Instructions (one step per line)
            <textarea
              name="instructions"
              rows={6}
              required
              defaultValue={values?.instructions.join('\n')}
            />
          </label>
        )}
        <label className="checkLabel">
          <input type="checkbox" required />
          {reference
            ? 'I reviewed the ingredient amounts, serving yield and practical batch size. Any photo I upload is mine or permitted.'
            : aiDraft
              ? 'I reviewed this AI-drafted recipe: amounts, servings, batch size and steps.'
              : 'These are my own recipe details, or I have permission to save them.'}
        </label>
        {live && (
          <label>
            Your recipe photo (optional)
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </label>
        )}
        <div className="buttonRow">
          <Button className="secondaryButton" onClick={leave}>
            Cancel
          </Button>
          <Button className="primaryButton" type="submit">
            {saving ? 'Saving...' : 'Save recipe'}
          </Button>
        </div>
      </fieldset>
      {ai && aiDraft && (
        <PromptBar
          sticky
          label="Change this recipe"
          placeholder="Change something..."
          submitLabel="Update recipe"
          pending={drafting}
          onSubmit={requestDraft}
        />
      )}
    </form>
  )
}
