import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { Switch } from '@base-ui/react/switch'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CookingPot,
  Heart,
  Home,
  Minus,
  PackageOpen,
  Pin,
  Plus,
  RotateCcw,
  Search,
  ShoppingBasket,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { z } from 'zod'
import {
  buildPlan,
  categories,
  days,
  decide,
  groceries,
  groceryQuantity,
  newWeek,
  normalize,
  recipeSchema,
  recipeReady,
  removeRecipe,
  placeRemix,
  shortlist,
  targets,
  toggleGroceryCheck,
  toggleLoved,
  sourceUrlSchema,
  undo,
  weekKey,
  adoptQueued,
  type Recipe,
  type Settings,
  type State,
  sourceName,
} from './domain'
import { supabase, useHousehold, type HouseholdStore } from './store'
import { RecipeForm, type InitialRecipeDraft } from './RecipeForm'
import { AiBadge } from './AiBadge'
import { AddRecipeSheet } from './AddRecipeSheet'
import { Pantry } from './Pantry'
import { RecipeLibraryRow } from './RecipeLibraryRow'
import { useGroceryUnits } from './useGroceryUnits'
import { useFlingCard } from './motion/useFlingCard'
import { flyToDeck } from './motion/flyToDeck'
import { liveRecipeAi, type RecipeAi } from './ai/recipeAi'
import { RecipeArt } from './RecipeArt'
import { unsaved, useCatalog, type Catalog } from './catalog'
import { Onboarding, ProfileScreen } from './Profile'
import { householdApi } from './household'
import { useConfirm } from './confirm'
import { LovedButton, RecipeDetails, type RemixSave } from './RecipeDetails'

const tabs = ['plan', 'groceries', 'pantry', 'recipes', 'profile'] as const
const tabLabels: Record<(typeof tabs)[number], string> = {
  plan: 'Plan',
  groceries: 'Groceries',
  pantry: 'Pantry',
  recipes: 'Recipes',
  profile: 'Profile',
}
type Tab = (typeof tabs)[number]
function initialTab(): Tab {
  return tabs.find((tab) => `#${tab}` === window.location.hash) ?? 'plan'
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

function Header({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
}) {
  return (
    <header className="screenHeader">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  )
}
function Toggle({
  title,
  detail,
  checked,
  onChange,
  icon,
}: {
  title: string
  detail: string
  checked: boolean
  onChange: (value: boolean) => void
  icon: ReactNode
}) {
  return (
    <label className="toggleRow">
      <span className="rowIcon">{icon}</span>
      <span className="rowCopy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <Switch.Root
        className="switch"
        checked={checked}
        onCheckedChange={onChange}
      >
        <Switch.Thumb className="switchThumb" />
      </Switch.Root>
    </label>
  )
}

function Setup({
  state,
  change,
  catalog,
}: {
  state: State
  change: HouseholdStore['change']
  catalog: Catalog
}) {
  const settings = state.settings
  const anyReady =
    state.recipes.some(recipeReady) || unsaved(catalog.ready, state).length > 0
  const target = targets(settings)
  function update(patch: Partial<Settings>) {
    void change(
      (s) => ({
        ...s,
        settings: { ...s.settings, ...patch },
        plan: [],
        confirmed: false,
        checked: [],
      }),
      { kind: 'settings' },
    )
  }
  return (
    <main className="screen setupScreen">
      <Header
        eyebrow="SUNDAY RESET"
        title="Plan your week"
        action={
          <span className="dateBubble">
            {new Date(`${state.week}T12:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        }
      />
      <section className="section">
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">AT HOME</span>
            <h2>How many dinners?</h2>
          </div>
          <div className="counter">
            <Button
              className="iconButton"
              aria-label="Fewer dinners"
              disabled={settings.dinners === 0}
              onClick={() => update({ dinners: settings.dinners - 1 })}
            >
              <Minus size={18} />
            </Button>
            <strong aria-live="polite">{settings.dinners}</strong>
            <Button
              className="iconButton"
              aria-label="More dinners"
              disabled={settings.dinners === 7}
              onClick={() => update({ dinners: settings.dinners + 1 })}
            >
              <Plus size={18} />
            </Button>
          </div>
        </div>
        <div className="portionPreview">
          <div>
            <CookingPot size={20} />
            <span>
              <b>{target.dinnerServings}</b> dinner servings
            </span>
          </div>
          <div>
            <Users size={20} />
            <span>
              <b>{target.lunches}</b> lunch servings
            </span>
          </div>
        </div>
        <p className="helper">
          Dinner leftovers become lunches for both of you.
        </p>
      </section>
      <section className="section flush">
        <Toggle
          title="Cooking for Kairos"
          detail="A separate potluck dish · 8 servings"
          checked={settings.kairos}
          onChange={(kairos) => update({ kairos })}
          icon={<Users size={20} />}
        />
        <div className="divider" />
        <Toggle
          title="Traveling this week"
          detail="Choose the days you will both be away"
          checked={settings.traveling}
          onChange={(traveling) =>
            update({ traveling, away: traveling ? settings.away : [] })
          }
          icon={<PackageOpen size={20} />}
        />
        {settings.traveling && (
          <div className="travelDays">
            <span className="eyebrow">DAYS AWAY</span>
            <div className="dayPicker">
              {days.map((day) => (
                <Button
                  key={day}
                  aria-label={`Away ${day}`}
                  aria-pressed={settings.away.includes(day)}
                  onClick={() =>
                    update({
                      away: settings.away.includes(day)
                        ? settings.away.filter((d) => d !== day)
                        : [...settings.away, day],
                    })
                  }
                >
                  {day}
                </Button>
              ))}
            </div>
            <p className="helper">
              Assumption: Monday-Friday are lunch days. Each weekday away
              removes two lunches; weekends do not change lunch needs. Dinner
              count stays yours to choose.
            </p>
          </div>
        )}
      </section>
      <footer className="setupFooter">
        <div className="planMath">
          <span>This week's target</span>
          <strong>{settings.dinners + Number(settings.kairos)} recipes</strong>
          <small>
            {target.home} home servings{target.kairos ? ' + 8 for Kairos' : ''}
            <br />
            {target.dinnerServings} dinner + {target.lunches} lunch servings
          </small>
        </div>
        {settings.dinners === 0 && target.lunches > 0 && (
          <p className="error">
            Lunches need dinner leftovers. Add a dinner or mark your weekdays
            away.
          </p>
        )}
        <Button
          className="primaryButton"
          disabled={
            (!anyReady && (settings.dinners > 0 || settings.kairos)) ||
            (settings.dinners === 0 && target.lunches > 0)
          }
          onClick={() =>
            void change(
              (s) =>
                adoptQueued(
                  { ...s, phase: 'swipe', queue: shortlist(s, catalog.ready) },
                  catalog.ready,
                ),
              { kind: 'settings' },
            )
          }
        >
          Start choosing recipes <ArrowRight size={19} />
        </Button>
        {state.recipes.length > 0 && !anyReady && (
          <p className="helper">
            Review recipe facts in Recipes before choosing meals.
          </p>
        )}
      </footer>
    </main>
  )
}

function Swipe({
  state,
  change,
  household,
  details,
  reportError,
}: {
  state: State
  change: HouseholdStore['change']
  household?: string | null
  details: (recipe: Recipe) => void
  reportError: (message: string) => void
}) {
  const [ranking, setRanking] = useState(false)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const pending = state.queue.filter(
    (id) =>
      !state.decisions[id] &&
      !state.blocked.includes(id) &&
      state.recipes.some((recipe) => recipe.id === id && recipeReady(recipe)),
  )
  const recipe = state.recipes.find((r) => r.id === pending[0])
  const liked = Object.values(state.decisions).filter(
    (value) => value === 'like',
  ).length
  let canBuild = true
  let buildReason = ''
  try {
    buildPlan(state)
  } catch (error) {
    canBuild = false
    buildReason = message(error)
  }
  const recipeId = recipe?.id
  const card = useFlingCard(async (choice) =>
    recipeId
      ? change((s) => decide(s, recipeId, choice), {
          kind: choice,
          recipeId,
        })
      : false,
  )
  async function rank() {
    if (!supabase) return
    setRanking(true)
    try {
      const { data, error } = await supabase.functions.invoke('rank-recipes')
      if (error)
        throw new Error(
          'AI ranking is unavailable. Check the Edge Function configuration; your shortlist has not changed.',
        )
      const result = z
        .object({
          ranked: z
            .array(z.object({ id: z.string(), reason: z.string() }))
            .max(12),
        })
        .parse(data)
      const ids = result.ranked.map((r) => r.id)
      const eligible = state.queue.filter((id) => !state.blocked.includes(id))
      if (
        ids.length !== eligible.length ||
        new Set(ids).size !== ids.length ||
        eligible.some((id) => !ids.includes(id))
      )
        throw new Error('The shortlist changed. Try ranking again.')
      const saved = await change(
        (s) => {
          if (s !== state)
            throw new Error('The shortlist changed. Try ranking again.')
          return { ...s, queue: ids }
        },
        { kind: 'settings' },
      )
      if (saved)
        setReasons(
          Object.fromEntries(result.ranked.map((r) => [r.id, r.reason])),
        )
    } catch (error) {
      reportError(message(error))
    } finally {
      setRanking(false)
    }
  }
  return (
    <main className="screen swipeScreen">
      <div className="buttonRow">
        <Button
          className="textButton"
          onClick={() =>
            void change((s) => ({ ...s, phase: 'setup' }), { kind: 'settings' })
          }
        >
          <ArrowLeft size={18} /> Setup
        </Button>
        <span className="countBadge">
          {liked} liked · {pending.length} to explore
        </span>
      </div>
      <Header eyebrow="YOUR SHARED SHORTLIST" title="What sounds good?" />
      <p className="screenLead">
        Right means appealing this week. Left means not this week, not never.
        Keep exploring even when you can build a plan.
      </p>
      {recipe ? (
        <>
          <div className="cardStage" ref={card.stage} data-phase={card.phase}>
            <div
              className="dropTarget skip"
              data-drop="skip"
              aria-hidden="true"
            >
              <X size={30} />
              <span>Not this week</span>
            </div>
            <div
              className="dropTarget like"
              data-drop="like"
              aria-hidden="true"
            >
              <Heart size={28} />
              <span>Sounds good</span>
            </div>
            <article
              key={recipe.id}
              ref={card.card}
              className="recipeCard"
              aria-label={`Recipe: ${recipe.title}`}
              onDragStart={(e) => e.preventDefault()}
              {...card.handlers}
            >
              <RecipeArt recipe={recipe} household={household} />
              <div className="cardCopy">
                <span className="eyebrow">
                  {state.loved.includes(recipe.id)
                    ? 'A LOVED FAVORITE'
                    : recipe.source === 'reference' && recipe.sourceUrl
                      ? sourceName(recipe.sourceUrl)
                      : 'FROM YOUR KITCHEN'}
                </span>
                <h2>{recipe.title}</h2>
                <p>{recipe.description}</p>
                <div className="tagRow">
                  <span>{recipe.minutes} min</span>
                  <span>Makes {recipe.servings}</span>
                  {recipe.leftovers && <span>Lunch-friendly</span>}
                </div>
                {reasons[recipe.id] && (
                  <p className="helper">AI suggestion: {reasons[recipe.id]}</p>
                )}
              </div>
            </article>
          </div>
          <div className="swipeActions">
            <Button
              className="roundAction"
              aria-label="Undo last choice"
              disabled={!state.history.length}
              onClick={() =>
                void change(undo, {
                  kind: 'undo',
                  recipeId: state.history.at(-1),
                })
              }
            >
              <RotateCcw size={20} />
            </Button>
            <Button
              className="roundAction pass"
              aria-label="Not this week"
              disabled={card.phase === 'flying'}
              focusableWhenDisabled
              onClick={() => card.fling('skip')}
            >
              <X size={30} />
            </Button>
            <Button
              className="roundAction like"
              aria-label="Appealing this week"
              disabled={card.phase === 'flying'}
              focusableWhenDisabled
              onClick={() => card.fling('like')}
            >
              <Heart size={28} />
            </Button>
            <Button
              className="roundAction"
              aria-label="Recipe details"
              onClick={() => details(recipe)}
            >
              <BookOpen size={20} />
            </Button>
          </div>
          <Button
            className="textButton blockButton"
            onClick={() =>
              void change(
                (s) => ({
                  ...s,
                  blocked: [...new Set([...s.blocked, recipe.id])],
                  plan: [],
                  confirmed: false,
                  checked: [],
                }),
                { kind: 'block', recipeId: recipe.id },
              )
            }
          >
            Don't recommend this recipe again
          </Button>
        </>
      ) : (
        <section className="empty">
          <CookingPot size={36} />
          <h2>That's this batch.</h2>
          <p>
            {canBuild
              ? 'Your shortlist is ready to turn into a week.'
              : 'Review your liked options or adjust setup. Skipped recipes are never silently added.'}
          </p>
          <Button
            className="secondaryButton"
            disabled={!state.history.length}
            onClick={() =>
              void change(undo, {
                kind: 'undo',
                recipeId: state.history.at(-1),
              })
            }
          >
            Undo last choice
          </Button>
        </section>
      )}
      <Button
        className="secondaryButton"
        disabled={ranking || !state.queue.length}
        onClick={() => void rank()}
      >
        <Sparkles size={16} />
        {ranking ? 'Ranking...' : 'Use optional AI ranking'}
      </Button>
      <div className="setupFooter">
        <Button
          className="primaryButton"
          disabled={!canBuild || card.phase === 'flying'}
          onClick={() =>
            void change(
              (s) => ({
                ...s,
                plan: buildPlan(s),
                phase: 'plan',
                confirmed: false,
                checked: [],
              }),
              { kind: 'plan' },
            )
          }
        >
          Build my week <Sparkles size={18} />
        </Button>
        {!canBuild && <p className="helper">{buildReason}</p>}
      </div>
    </main>
  )
}

function Plan({
  state,
  change,
  details,
  openGroceries,
  household,
}: {
  state: State
  change: HouseholdStore['change']
  details: (recipe: Recipe, servings?: number, slot?: number) => void
  openGroceries: () => void
  household?: string | null
}) {
  const target = targets(state.settings)
  return (
    <main className="screen planScreen">
      <Header
        eyebrow={`WEEK OF ${new Date(`${state.week}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`}
        title="Your week"
        action={
          <Button
            className="textButton"
            onClick={() =>
              void change((s) => ({ ...s, phase: 'setup' }), {
                kind: 'settings',
              })
            }
          >
            Edit
          </Button>
        }
      />
      <section className="summaryBanner">
        <span className="summaryIcon">
          <Check size={22} />
        </span>
        <div>
          <strong>
            {state.confirmed ? 'Week sorted.' : 'Your week, coming together.'}
          </strong>
          <p>
            {state.settings.dinners} dinners · {target.lunches} lunch servings
            {state.settings.kairos ? ' · Kairos for 8' : ''}
          </p>
        </div>
      </section>
      <div className="recipeListHeading">
        <span className="eyebrow">RECIPES YOU'RE COOKING</span>
        <span>{state.plan.length}</span>
      </div>
      <div className="mealList">
        {state.plan.map((slot, index) => {
          const recipe = state.recipes.find((r) => r.id === slot.recipeId)!
          return (
            <article className="plannedRecipe" key={`${slot.role}-${index}`}>
              <Button
                className="plannedRecipeOpen"
                aria-label={`View ${recipe.title}`}
                onClick={() => details(recipe, slot.servings, index)}
              >
                <RecipeArt recipe={recipe} household={household} compact />
                <span className="plannedRecipeCopy">
                  <span className="recipeNumber">
                    {slot.role === 'kairos' ? 'KAIROS' : `RECIPE ${index + 1}`}
                  </span>
                  <strong>{recipe.title}</strong>
                  <small>
                    {slot.role === 'kairos'
                      ? `Potluck · ${slot.servings} servings`
                      : `2 dinner + ${slot.servings - 2} lunch servings`}
                  </small>
                </span>
                <ChevronRight size={18} />
              </Button>
              <div className="planRecipeActions">
                <Button
                  className={`textButton pinRecipe ${slot.pinned ? 'pinned' : ''}`}
                  aria-label={`${slot.pinned ? 'Unpin' : 'Pin'} ${recipe.title}`}
                  aria-pressed={slot.pinned}
                  onClick={async (e) => {
                    const button = e.currentTarget
                    if (
                      (await change(
                        (s) => ({
                          ...s,
                          plan: s.plan.map((p, i) =>
                            i === index ? { ...p, pinned: !p.pinned } : p,
                          ),
                        }),
                        { kind: 'pin', recipeId: recipe.id },
                      )) &&
                      !slot.pinned
                    )
                      flyToDeck(button)
                  }}
                >
                  <Pin size={14} fill={slot.pinned ? 'currentColor' : 'none'} />
                  {slot.pinned ? 'Unpin' : 'Pin'}
                </Button>
                <LovedButton
                  loved={state.loved.includes(recipe.id)}
                  onToggle={() => {
                    const { event } = toggleLoved(state, recipe.id)
                    return change((s) => toggleLoved(s, recipe.id).state, event)
                  }}
                />
              </div>
            </article>
          )
        })}
      </div>
      <div className="buttonRow">
        <Button
          className="secondaryButton"
          onClick={() =>
            void change((s) => ({ ...s, phase: 'swipe' }), { kind: 'settings' })
          }
        >
          Keep swiping
        </Button>
        <Button
          className="secondaryButton"
          onClick={() =>
            void change(
              (s) => ({
                ...s,
                plan: buildPlan(s),
                confirmed: false,
                checked: [],
              }),
              { kind: 'plan' },
            )
          }
        >
          Rebuild with pins
        </Button>
      </div>
      <Button
        className="primaryButton"
        onClick={async () => {
          if (
            state.confirmed ||
            (await change((s) => ({ ...s, confirmed: true }), {
              kind: 'confirm',
            }))
          )
            openGroceries()
        }}
      >
        {state.confirmed ? 'Open groceries' : 'Confirm & make grocery list'}
        <ArrowRight size={18} />
      </Button>
    </main>
  )
}

function Groceries({
  state,
  change,
}: {
  state: State
  change: HouseholdStore['change']
}) {
  const {
    system: groceryUnits,
    setSystem,
    error: unitError,
  } = useGroceryUnits()
  if (!state.confirmed)
    return (
      <main className="screen">
        <Header eyebrow="YOUR SHOPPING LIST" title="Groceries" />
        <section className="empty">
          <ShoppingBasket size={36} />
          <h2>First, a plan you love.</h2>
          <p>Confirm your proposed plan to create its grocery list.</p>
        </section>
      </main>
    )
  const items = groceries(state.plan, state.recipes, state.pantry)
  const left = items.filter(
    (i) => i.buy > 0 && !state.checked.includes(i.key),
  ).length
  return (
    <main className="screen groceryScreen">
      <Header
        eyebrow={`WEEK OF ${state.week}`}
        title="Groceries"
        action={<span className="countBadge">{left} left</span>}
      />
      <div className="groceryUnits">
        <span className="eyebrow">UNITS</span>
        <div
          className="unitToggle"
          role="group"
          aria-label="Grocery unit system"
        >
          {(['us', 'metric'] as const).map((system) => (
            <Button
              key={system}
              aria-pressed={groceryUnits === system}
              onClick={() => setSystem(system)}
            >
              {system === 'metric' ? 'Metric' : 'US kitchen'}
            </Button>
          ))}
        </div>
      </div>
      {unitError && (
        <p className="error" role="alert">
          {unitError}
        </p>
      )}
      {items.length === 0 && (
        <p className="empty">No meals this week, so nothing to shop for.</p>
      )}
      {categories.map((category) => {
        const group = items.filter((item) => item.category === category)
        return (
          group.length > 0 && (
            <section className="groceryGroup" key={category}>
              <h2>{category}</h2>
              {group.map((item) => {
                const done = state.checked.includes(item.key) || item.buy === 0
                return (
                  <label
                    className={`groceryItem ${done ? 'done' : ''}`}
                    key={item.key}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={item.buy === 0}
                      onChange={() =>
                        void change(
                          (s) => toggleGroceryCheck(s, item.key, item.name),
                          { kind: 'grocery' },
                        )
                      }
                    />
                    <span>
                      <strong>
                        {item.name}{' '}
                        <span className="groceryAmount">
                          ·{' '}
                          {groceryQuantity(
                            item.required,
                            item.unit,
                            groceryUnits,
                          )}
                        </span>
                      </strong>
                      {item.atHome && (
                        <small>
                          At home · remove from Pantry if you've run out
                        </small>
                      )}
                    </span>
                  </label>
                )
              })}
            </section>
          )
        )
      })}
      <p className="helper">
        Ingredients in your pantry are automatically crossed off. Remove them
        from Pantry when you run out. Checking off a purchase adds it to your
        pantry; unchecking removes what that check added. US kitchen units use
        240 ml cups, 15 ml tablespoons and 5 ml teaspoons. Weight is never
        converted to cups.
      </p>
    </main>
  )
}

const sourcesLabel = 'YOUR RECIPE SOURCES'

/**
 * Kitchen favorites: what the household added, reviewed or remixed, plus
 * anything loved. Catalog copies and unreviewed imports live in the stack.
 */
const isFavorite = (recipe: Recipe, state: State) =>
  state.loved.includes(recipe.id) ||
  (!recipe.catalogId && !recipe.facts?.needsReview)

/** The shared catalog: counts, plus imports waiting for a quick review. */
function CatalogSection({
  state,
  catalog,
  onReview,
  household,
  revealedRow,
  revealRow,
  onDelete,
  deleting,
}: {
  state: State
  catalog: Catalog
  onReview: (recipe: Recipe) => void
  household?: string | null
  revealedRow: string | null
  revealRow: (id: string, open: boolean) => void
  onDelete: (recipe: Recipe) => void
  deleting: string | null
}) {
  const [shown, setShown] = useState(6)
  // Older source-fact imports the household never reviewed wait here too.
  const unreviewed = state.recipes.filter(
    (r) => r.facts?.needsReview && !isFavorite(r, state),
  )
  if (
    !unreviewed.length &&
    (!catalog.loaded || (!catalog.ready.length && !catalog.review.length))
  )
    return catalog.error ? <p className="error">{catalog.error}</p> : null
  const ready = unsaved(catalog.ready, state).length
  const review = [...unreviewed, ...unsaved(catalog.review, state)]
  return (
    <section className="catalogSection" aria-labelledby="catalog-heading">
      <span className="eyebrow">FROM {sourcesLabel}</span>
      <h2 id="catalog-heading">Recipe catalog</h2>
      <p className="helper">
        {ready} ready for your swipe stack · {review.length} need a quick
        review.
      </p>
      {review.slice(0, shown).map((recipe) => (
        <RecipeLibraryRow
          key={recipe.id}
          recipe={recipe}
          household={household}
          subtitle={`${recipe.sourceUrl ? sourceName(recipe.sourceUrl) : 'Catalog'} · ${
            recipe.facts?.pendingIngredients.length
              ? 'Review amounts'
              : 'Review yield & time'
          }`}
          revealed={revealedRow === recipe.id}
          onReveal={(open) => revealRow(recipe.id, open)}
          onOpen={() => onReview(recipe)}
          onEdit={() => onReview(recipe)}
          onDelete={
            state.recipes.some((saved) => saved.id === recipe.id)
              ? () => onDelete(recipe)
              : undefined
          }
          disabled={deleting === recipe.id}
        />
      ))}
      {review.length > shown && (
        <Button
          className="secondaryButton"
          onClick={() => setShown((count) => count + 12)}
        >
          Show more to review
        </Button>
      )}
    </section>
  )
}

function Recipes({
  store,
  ai,
  details,
  remix,
  clearRemix,
  catalog,
}: {
  store: HouseholdStore
  ai: RecipeAi
  details: (recipe: Recipe) => void
  remix: RemixSave | null
  clearRemix: () => void
  catalog: Catalog
}) {
  const state = store.state!
  const confirm = useConfirm()
  const library = useRef<HTMLElement>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const deleteLock = useRef(false)
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const libraryScroll = useRef(0)
  useEffect(() => {
    if (searching && !editing) searchInput.current?.focus()
  }, [searching, editing])
  function closeSearch() {
    setSearching(false)
    setQuery('')
    setRevealedRow(null)
    requestAnimationFrame(() => {
      searchButton.current?.focus({ preventScroll: true })
      window.scrollTo({ top: libraryScroll.current, behavior: 'instant' })
    })
  }
  const [revealedRow, setRevealedRow] = useState<string | null>(null)
  function revealRow(id: string, open: boolean) {
    setRevealedRow((current) => (open ? id : current === id ? null : current))
  }
  const favorites = state.recipes.filter((recipe) => isFavorite(recipe, state))
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const visibleRecipes = searching
    ? state.recipes.filter((recipe) => {
        const searchable = normalize(
          [
            recipe.title,
            recipe.sourceUrl ? sourceName(recipe.sourceUrl) : '',
            ...recipe.ingredients.map((ingredient) => ingredient.name),
            ...(recipe.facts?.pendingIngredients.map(
              (ingredient) => ingredient.name,
            ) ?? []),
          ].join(' '),
        )
        return terms.every((term) => searchable.includes(term))
      })
    : favorites
  // The saved version this edit replaces; a changed baseline means another
  // phone edited it meanwhile.
  const [baseline, setBaseline] = useState<Recipe | null>(null)
  const [reviewingRemix, setReviewingRemix] = useState(false)
  const [initialDraft, setInitialDraft] = useState<InitialRecipeDraft>()
  function focusLibrary() {
    ;(
      searchInput.current ??
      library.current?.querySelector<HTMLButtonElement>('.addRecipeButton')
    )?.focus()
  }
  async function deleteSavedRecipe(recipe: Recipe) {
    if (deleteLock.current) return
    deleteLock.current = true
    setDeleting(recipe.id)
    try {
      if (
        !(await confirm({
          title: `Delete “${recipe.title}”?`,
          body: "This removes it from your shared household. If it's in this week's plan, the plan and grocery list will need to be rebuilt. Pantry items are kept. Deleting doesn't block future recommendations.",
          confirm: 'Delete recipe',
          cancel: 'Keep recipe',
        }))
      )
        return
      let unusedImage: string | undefined
      const saved = await store.change(
        (s) => {
          if (
            JSON.stringify(s.recipes.find((r) => r.id === recipe.id)) !==
            JSON.stringify(recipe)
          )
            throw new Error(
              'This recipe changed on the other phone. Reopen it before deleting.',
            )
          const next = removeRecipe(s, recipe.id)
          if (
            recipe.imagePath &&
            !next.recipes.some((r) => r.imagePath === recipe.imagePath)
          )
            unusedImage = recipe.imagePath
          return next
        },
        { kind: 'recipe', recipeId: recipe.id },
      )
      if (!saved) return
      setRevealedRow(null)
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) focusLibrary()
      })
      if (unusedImage && supabase) {
        try {
          const result = await supabase.storage
            .from('recipe-images')
            .remove([unusedImage])
          if (result.error) throw result.error
        } catch {
          store.reportError(
            'Recipe deleted, but its unused photo could not be removed. Ask the administrator to clean up Storage.',
          )
        }
      }
    } finally {
      deleteLock.current = false
      setDeleting(null)
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) focusLibrary()
      })
    }
  }
  async function importLink(url: string): Promise<string | void> {
    const link = sourceUrlSchema.safeParse(url)
    if (!link.success) return 'Paste a full https:// link to a recipe page.'
    return createDraft('Import the recipe from this page.', link.data)
  }
  async function createDraft(
    instruction: string,
    url?: string,
  ): Promise<string | void> {
    try {
      const result = await ai.draft({
        instruction,
        url,
        history: [],
      })
      if ('declined' in result) return result.declined
      setBaseline(null)
      setInitialDraft({
        recipe: result.recipe,
        notes: result.notes.map((note) => note.text),
        prompts: [url ? `Imported from ${url}` : instruction],
        sourceUrl: url,
      })
      setRevealedRow(null)
      setEditing('new')
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (error) {
      return message(error)
    }
  }
  const [remixSlot, setRemixSlot] = useState<RemixSave['slot']>()
  useEffect(() => {
    if (!remix) return
    setEditing(remix.recipe)
    setBaseline(remix.original ?? null)
    setReviewingRemix(true)
    setRemixSlot(remix.slot)
    clearRemix()
  }, [remix, clearRemix])
  async function save(recipe: Recipe, image?: File) {
    let uploaded: string | undefined
    if (image && supabase && store.household) {
      const extension =
        image.type === 'image/png'
          ? 'png'
          : image.type === 'image/webp'
            ? 'webp'
            : 'jpg'
      uploaded = `${store.household}/${crypto.randomUUID()}.${extension}`
      const result = await supabase.storage
        .from('recipe-images')
        .upload(uploaded, image, { contentType: image.type })
      if (result.error) throw result.error
      recipe = { ...recipe, imagePath: uploaded }
    }
    const oldImage = state.recipes.find((r) => r.id === recipe.id)?.imagePath
    const saved = await store.change(
      (s) => {
        if (
          baseline &&
          JSON.stringify(s.recipes.find((r) => r.id === baseline.id)) !==
            JSON.stringify(baseline)
        ) {
          throw new Error(
            'This recipe changed on the other phone while you were editing. Cancel and reopen it to see the latest version; your draft has not been saved.',
          )
        }
        const inPlan = s.plan.some((slot) => slot.recipeId === recipe.id)
        const next = {
          ...s,
          recipes: [
            ...s.recipes.filter((r) => r.id !== recipe.id),
            recipeSchema.parse(recipe),
          ],
        }
        const placed =
          remixSlot &&
          placeRemix(next, remixSlot.index, remixSlot.recipeId, recipe)
        if (placed) return placed
        return {
          ...next,
          ...(inPlan
            ? {
                plan: [],
                phase: 'swipe' as const,
                confirmed: false,
                checked: [],
              }
            : {}),
        }
      },
      { kind: 'recipe', recipeId: recipe.id },
    )
    const remove = saved
      ? oldImage && oldImage !== recipe.imagePath
        ? oldImage
        : undefined
      : uploaded
    if (remove && supabase) {
      const cleanup = await supabase.storage
        .from('recipe-images')
        .remove([remove])
      if (cleanup.error)
        store.reportError(
          'Recipe save finished, but an unused photo could not be removed. Ask the administrator to clean up Storage.',
        )
    }
    return saved
  }
  return (
    <main
      ref={library}
      className={`screen recipeLibrary${editing ? '' : ' browsing'}`}
    >
      {searching && !editing ? (
        <form
          role="search"
          className="recipeSearchBar"
          onSubmit={(event) => {
            event.preventDefault()
            searchInput.current?.blur()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              closeSearch()
            }
          }}
        >
          <h1 className="visuallyHidden">Search recipes</h1>
          <div className="recipeSearchField">
            <Search size={20} aria-hidden="true" />
            <input
              ref={searchInput}
              type="search"
              aria-label="Search recipes"
              placeholder="Search your recipes"
              value={query}
              maxLength={200}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(event) => {
                setQuery(event.target.value)
                setRevealedRow(null)
              }}
            />
            {query && (
              <Button
                className="iconButton"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  searchInput.current?.focus()
                }}
              >
                <X size={18} aria-hidden="true" />
              </Button>
            )}
          </div>
          <Button className="searchCancel" onClick={closeSearch}>
            Cancel
          </Button>
        </form>
      ) : (
        <Header
          eyebrow="YOUR RECIPE BOX"
          title="Kitchen favorites"
          action={
            !editing && (
              <div className="libraryHeaderActions">
                <Button
                  ref={searchButton}
                  className="iconButton searchRecipeButton"
                  aria-label="Search recipes"
                  onClick={() => {
                    libraryScroll.current = window.scrollY
                    setSearching(true)
                    setRevealedRow(null)
                    window.scrollTo({ top: 0, behavior: 'instant' })
                  }}
                >
                  <Search size={24} aria-hidden="true" />
                </Button>
                <AddRecipeSheet
                  onAi={(instruction) => createDraft(instruction)}
                  onImport={importLink}
                />
              </div>
            )
          }
        />
      )}
      {editing ? (
        <RecipeForm
          key={
            typeof editing === 'string'
              ? `${editing}-${initialDraft?.sourceUrl ?? ''}`
              : editing.id
          }
          recipe={editing === 'new' ? undefined : editing}
          ai={ai}
          initialDraft={editing === 'new' ? initialDraft : undefined}
          heading={reviewingRemix ? 'Review your remix' : undefined}
          celebrate={
            editing === 'new' ||
            reviewingRemix ||
            // A catalog recipe being reviewed joins the household's recipes.
            !state.recipes.some((r) => r.id === editing.id)
          }
          notice={
            remixSlot
              ? `Saving puts this remix in this week's plan in place of “${remixSlot.title}”, pinned, as long as it still covers that recipe's servings. You'll confirm the grocery list again.`
              : undefined
          }
          onCancel={() => {
            setRemixSlot(undefined)
            setInitialDraft(undefined)
            setEditing(null)
            setRevealedRow(null)
            setBaseline(null)
            setReviewingRemix(false)
          }}
          onSave={save}
        />
      ) : (
        <>
          <div className="libraryCaption">
            <span role={searching ? 'status' : undefined}>
              {visibleRecipes.length}{' '}
              {visibleRecipes.length === 1 ? 'recipe' : 'recipes'}
            </span>
            {!searching && <span>Swipe left to edit or delete</span>}
          </div>
          {!visibleRecipes.length && (
            <p className="libraryEmpty helper">
              {searching
                ? query.trim()
                  ? `No recipes found for “${query.trim()}”. Try a name, ingredient or source.`
                  : 'No saved recipes yet. Cancel to add your first one.'
                : 'A little inspiration goes a long way. Use the plus button to describe a dish or bring in a recipe from the web.'}
            </p>
          )}
          {visibleRecipes.map((recipe) => (
            <RecipeLibraryRow
              key={recipe.id}
              recipe={recipe}
              household={store.household}
              subtitle={
                <>
                  {recipe.aiDraft && (
                    <>
                      <AiBadge />{' '}
                    </>
                  )}
                  {recipe.sourceUrl
                    ? `${sourceName(recipe.sourceUrl)} · `
                    : recipe.aiDraft
                      ? ''
                      : 'Your recipe · '}
                  {recipe.minutes} min ·{' '}
                  {recipe.facts?.needsReview
                    ? 'Needs review'
                    : `${recipe.servings} servings`}
                </>
              }
              revealed={revealedRow === recipe.id}
              onReveal={(open) => revealRow(recipe.id, open)}
              onOpen={() => {
                if (recipe.facts?.needsReview) {
                  setBaseline(recipe)
                  setEditing(recipe)
                } else details(recipe)
              }}
              onEdit={() => {
                setBaseline(recipe)
                setEditing(recipe)
              }}
              onDelete={() => void deleteSavedRecipe(recipe)}
              disabled={deleting === recipe.id}
              actions={
                <>
                  {state.blocked.includes(recipe.id) && (
                    <Button
                      className="iconButton"
                      aria-label="Recommend again"
                      onClick={() =>
                        void store.change(
                          (s) => ({
                            ...s,
                            blocked: s.blocked.filter((id) => id !== recipe.id),
                          }),
                          { kind: 'unblock', recipeId: recipe.id },
                        )
                      }
                    >
                      <RotateCcw size={17} aria-hidden="true" />
                    </Button>
                  )}
                  <LovedButton
                    compact
                    loved={state.loved.includes(recipe.id)}
                    onToggle={() => {
                      const { event } = toggleLoved(state, recipe.id)
                      return store.change(
                        (s) => toggleLoved(s, recipe.id).state,
                        event,
                      )
                    }}
                  />
                </>
              }
            />
          ))}
          {!searching && (
            <CatalogSection
              state={state}
              catalog={catalog}
              household={store.household}
              revealedRow={revealedRow}
              revealRow={revealRow}
              onDelete={(recipe) => void deleteSavedRecipe(recipe)}
              deleting={deleting}
              onReview={(recipe) => {
                // A saved import is edited in place; a catalog one is added.
                setBaseline(
                  state.recipes.find((r) => r.id === recipe.id) ?? null,
                )
                setEditing(recipe)
              }}
            />
          )}
        </>
      )}
    </main>
  )
}

function Kitchen({ exit }: { exit: () => void }) {
  const store = useHousehold()
  const state = store.state
  const [tab, setTab] = useState<Tab>(initialTab)
  const [detail, setDetail] = useState<{
    recipe: Recipe
    servings?: number
    slot?: number
  } | null>(null)
  const [remix, setRemix] = useState<RemixSave | null>(null)
  const clearRemix = useCallback(() => setRemix(null), [])
  const ai = liveRecipeAi
  const catalog = useCatalog()
  const confirm = useConfirm()
  useEffect(() => {
    // Keeps name and photo current so household members can find this person.
    void householdApi
      .syncProfile()
      .catch((error) =>
        store.reportError(`Could not sync your profile: ${message(error)}`),
      )
  }, [store.reportError])
  const headingRef = useRef<HTMLDivElement>(null)
  const screenPhase = tab === 'plan' ? state?.phase : undefined
  const loaded = Boolean(state)
  function navigate(tab: Tab) {
    window.location.hash = tab
    setTab(tab)
  }
  useEffect(() => {
    const listener = () => setTab(initialTab())
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
    const heading = headingRef.current?.querySelector('h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }, [tab, screenPhase, loaded])
  const details = (recipe: Recipe, servings?: number, slot?: number) =>
    setDetail({ recipe, servings, slot })
  return (
    <div className="appShell" ref={headingRef}>
      {!store.connected && (
        <div className="modeBar">
          <span>Connection unavailable · changes need internet</span>
        </div>
      )}
      {store.error && (
        <div role="alert" className="errorBanner">
          <p>{store.error}</p>
          <Button onClick={store.retry}>Retry connection</Button>
        </div>
      )}
      {store.noHousehold ? (
        <Onboarding onJoined={store.reload} exit={exit} />
      ) : !state ? (
        <div className="screen">
          <h1>
            {store.error ? 'Kitchen unavailable' : 'Opening your kitchen...'}
          </h1>
        </div>
      ) : (
        <>
          {state.week !== weekKey() && (
            <div className="notice">
              You're viewing the saved week of {state.week}. Start a new week
              when you're ready.
            </div>
          )}
          <fieldset
            className="appFieldset"
            disabled={store.busy}
            aria-busy={store.busy}
          >
            {tab === 'plan' &&
              (state.phase === 'setup' ? (
                <Setup state={state} change={store.change} catalog={catalog} />
              ) : state.phase === 'swipe' ? (
                <Swipe
                  state={state}
                  change={store.change}
                  household={store.household}
                  details={details}
                  reportError={store.reportError}
                />
              ) : (
                <Plan
                  state={state}
                  change={store.change}
                  details={details}
                  openGroceries={() => navigate('groceries')}
                  household={store.household}
                />
              ))}
            {tab === 'groceries' && (
              <Groceries state={state} change={store.change} />
            )}
            {tab === 'pantry' && (
              <Pantry
                state={state}
                change={store.change}
                busy={store.busy}
                error={store.error}
              />
            )}
            {tab === 'profile' && (
              <ProfileScreen
                onHouseholdChanged={store.reload}
                onCatalogChanged={catalog.reload}
                exit={exit}
              />
            )}
            {tab === 'recipes' && (
              <Recipes
                store={store}
                ai={ai}
                details={details}
                remix={remix}
                clearRemix={clearRemix}
                catalog={catalog}
              />
            )}
            {tab === 'plan' && (
              <div className="weekAction">
                <Button
                  className="textButton"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Start a fresh week?',
                        body: 'This clears weekly choices, the plan and shopping checks, but keeps recipes, pantry and loved recipes.',
                        confirm: 'Start fresh',
                      })
                    ) {
                      void store
                        .change(newWeek, { kind: 'new_week' })
                        .then((saved) => {
                          if (saved) navigate('plan')
                        })
                    }
                  }}
                >
                  Start a fresh week
                </Button>
              </div>
            )}
          </fieldset>
          <nav className="bottomNav" aria-label="Main navigation">
            {tabs.map((item, index) => {
              const Icon = [
                Home,
                ShoppingBasket,
                PackageOpen,
                BookOpen,
                UserRound,
              ][index]
              return (
                <Button
                  key={item}
                  aria-current={tab === item ? 'page' : undefined}
                  data-deck-target={item === 'recipes' ? '' : undefined}
                  onClick={() => navigate(item)}
                >
                  <Icon size={21} />
                  <span>{tabLabels[item]}</span>
                </Button>
              )
            })}
          </nav>
        </>
      )}
      {detail && state && (
        <RecipeDetails
          recipe={detail.recipe}
          servings={detail.servings}
          slot={detail.slot}
          state={state}
          change={store.change}
          ai={ai}
          household={store.household}
          storeError={store.error}
          saveRemix={(save) => {
            setDetail(null)
            setRemix(save)
            navigate('recipes')
          }}
          close={() => setDetail(null)}
        />
      )}
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<'welcome' | 'live'>('welcome')
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState(
    () => new URLSearchParams(location.search).get('error_description') ?? '',
  )
  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else if (data.session) setMode('live')
        setLoading(false)
      })
      .catch((error) => {
        if (active) {
          setError(message(error))
          setLoading(false)
        }
      })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setMode('live')
      else setMode((current) => (current === 'live' ? 'welcome' : current))
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])
  async function signIn() {
    if (!supabase) return
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) setError(error.message)
  }
  async function exit() {
    if (mode === 'live' && supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        setError(error.message)
        return
      }
    }
    setMode('welcome')
  }
  if (mode !== 'welcome')
    return (
      <>
        {error && (
          <p className="errorBanner" role="alert">
            {error}
          </p>
        )}
        <Kitchen
          key={mode}
          exit={() => void exit().catch((error) => setError(message(error)))}
        />
      </>
    )
  return (
    <div className="appShell">
      <main className="screen welcome">
        <span className="wordmark">
          mealy<span>.</span>
        </span>
        <div className="welcomeArt">
          <CookingPot size={85} strokeWidth={1} />
        </div>
        <span className="eyebrow">YOUR LITTLE SUNDAY RITUAL</span>
        <h1>
          A little planning.
          <br />A week of good food.
        </h1>
        <p>
          Dinners you look forward to. Lunches already taken care of. One shared
          kitchen.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {supabase && (
          <Button
            className="primaryButton"
            disabled={loading}
            onClick={() =>
              void signIn().catch((error) => setError(message(error)))
            }
          >
            {loading ? 'Checking your session...' : 'Continue with Google'}
          </Button>
        )}
        {!supabase && (
          <p role="alert" className="error">
            Mealy needs a Supabase connection. Configure VITE_SUPABASE_URL and
            VITE_SUPABASE_PUBLISHABLE_KEY to open your shared kitchen.
          </p>
        )}
        <p className="helper">
          Only Google accounts approved by your household administrator can
          access your shared kitchen.
        </p>
      </main>
    </div>
  )
}
