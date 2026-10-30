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
  LogOut,
  Minus,
  PackageOpen,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  ShoppingBasket,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { z } from 'zod'
import {
  buildPlan,
  categories,
  days,
  decide,
  displayAmount,
  groceries,
  groceryQuantity,
  newWeek,
  normalize,
  recipeSchema,
  recipeReady,
  placeRemix,
  shortlist,
  targets,
  toggleGroceryCheck,
  toggleLoved,
  undo,
  weekKey,
  type PantryItem,
  type Recipe,
  type Settings,
  type State,
  type Bookmark,
  sourceName,
} from './domain'
import {
  configIncomplete,
  supabase,
  useHousehold,
  type HouseholdStore,
} from './store'
import { RecipeForm } from './RecipeForm'
import { Bookmarks } from './Bookmarks'
import { useGroceryUnits } from './useGroceryUnits'
import { useFlingCard } from './motion/useFlingCard'
import { flyToDeck } from './motion/flyToDeck'
import { demoRecipeAi, liveRecipeAi, type RecipeAi } from './ai/recipeAi'
import { RecipeArt } from './RecipeArt'
import { LovedButton, RecipeDetails, type RemixSave } from './RecipeDetails'

const tabs = ['plan', 'groceries', 'pantry', 'recipes'] as const
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
}: {
  state: State
  change: HouseholdStore['change']
}) {
  const settings = state.settings
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
            (!state.recipes.some(recipeReady) &&
              (settings.dinners > 0 || settings.kairos)) ||
            (settings.dinners === 0 && target.lunches > 0)
          }
          onClick={() =>
            void change(
              (s) => ({ ...s, phase: 'swipe', queue: shortlist(s) }),
              { kind: 'settings' },
            )
          }
        >
          Start choosing recipes <ArrowRight size={19} />
        </Button>
        {state.recipes.length > 0 && !state.recipes.some(recipeReady) && (
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
  live,
  reportError,
}: {
  state: State
  change: HouseholdStore['change']
  household?: string | null
  details: (recipe: Recipe) => void
  live: boolean
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
  try {
    buildPlan(state)
  } catch {
    canBuild = false
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
                  {recipe.source === 'demo'
                    ? 'DEMO RECIPE'
                    : state.loved.includes(recipe.id)
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
              : 'Like more recipes or add recipes that can cover your servings. Skipped recipes are never silently added.'}
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
      {live && (
        <Button
          className="secondaryButton"
          disabled={ranking || !state.queue.length}
          onClick={() => void rank()}
        >
          <Sparkles size={16} />
          {ranking ? 'Ranking...' : 'Use optional AI ranking'}
        </Button>
      )}
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
        {!canBuild && (
          <p className="helper">
            A plan unlocks when your likes can cover all dinners, lunches and
            any Kairos dish.
          </p>
        )}
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
                    {recipe.source === 'demo' ? 'DEMO · ' : ''}
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
    <main className="screen">
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
                          · {groceryQuantity(item.buy, item.unit, groceryUnits)}
                        </span>
                      </strong>
                      {(item.owned > 0 || item.staple) && (
                        <small>
                          {item.owned > 0
                            ? `Need ${groceryQuantity(item.required, item.unit, groceryUnits)} · pantry ${groceryQuantity(item.owned, item.unit, groceryUnits)}`
                            : ''}
                          {item.staple
                            ? `${item.owned > 0 ? ' · ' : ''}staple on hand: check quantity`
                            : ''}
                          {item.buy === 0 ? ' · covered by measured stock' : ''}
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
        Measured stock is subtracted once per ingredient and compatible unit.
        Staples are reminders, never assumed to cover an unknown quantity.
        Checking off an item adds it to your pantry as on hand; unchecking
        removes it again. US kitchen units use 240 ml cups, 15 ml tablespoons
        and 5 ml teaspoons. Weight is never converted to cups.
      </p>
    </main>
  )
}

const pantryNoteHint = 'Describe how many or how much is left'

function PantryRow({
  item,
  change,
}: {
  item: PantryItem
  change: HouseholdStore['change']
}) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <form
        className="pantryItem pantryEdit"
        onSubmit={async (e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          const name = normalize(String(data.get('name')))
          const note = String(data.get('note')).trim()
          if (
            await change(
              (s) => {
                if (
                  s.pantry.some(
                    (p) => p.id !== item.id && normalize(p.name) === name,
                  )
                )
                  throw new Error('That ingredient is already in your pantry.')
                return {
                  ...s,
                  pantry: s.pantry.map((p) =>
                    p.id === item.id
                      ? { ...p, name, note: note || undefined }
                      : p,
                  ),
                }
              },
              { kind: 'pantry' },
            )
          )
            setEditing(false)
        }}
      >
        <input
          aria-label={`Name for ${item.name}`}
          name="name"
          required
          maxLength={200}
          defaultValue={item.name}
          autoComplete="off"
        />
        <input
          aria-label={`How much ${item.name} is left`}
          name="note"
          maxLength={60}
          defaultValue={item.note}
          placeholder={pantryNoteHint}
          autoComplete="off"
          enterKeyHint="done"
        />
        <div className="buttonRow">
          <Button className="textButton" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button className="textButton" type="submit">
            Save
          </Button>
        </div>
      </form>
    )
  return (
    <div className="pantryItem">
      <span className="pantryDot" aria-hidden="true" />
      <span className="pantryName">
        <strong>{item.name}</strong>
        {(item.kind === 'quantity' || item.note) && (
          <small>
            {item.kind === 'quantity'
              ? `${displayAmount(item.amount)} ${item.unit}`
              : ''}
            {item.kind === 'quantity' && item.note ? ' · ' : ''}
            {item.note}
          </small>
        )}
      </span>
      <Button
        className="iconButton pantryRemove"
        aria-label={`Edit ${item.name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil size={16} />
      </Button>
      <Button
        className="iconButton pantryRemove"
        aria-label={`Remove ${item.name}`}
        onClick={() =>
          void change(
            (s) => ({
              ...s,
              pantry: s.pantry.filter((p) => p.id !== item.id),
              // A bought item only unchecks its own grocery; removing other
              // stock can raise needs, so every check is cleared.
              checked: item.fromGrocery
                ? s.checked.filter((key) => key !== item.fromGrocery)
                : [],
            }),
            { kind: 'pantry' },
          )
        }
      >
        <X size={18} />
      </Button>
    </div>
  )
}

function Pantry({
  state,
  change,
}: {
  state: State
  change: HouseholdStore['change']
}) {
  return (
    <main className="screen">
      <Header
        eyebrow="YOUR KITCHEN"
        title="Pantry"
        action={
          <span className="countBadge">{state.pantry.length} ingredients</span>
        }
      />
      <p className="screenLead">What's already in your kitchen.</p>
      <form
        className="pantryQuickAdd"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget
          const data = new FormData(form)
          if (
            await change(
              (s) => {
                const name = normalize(String(data.get('name')))
                const note = String(data.get('note') ?? '').trim()
                if (s.pantry.some((item) => normalize(item.name) === name))
                  throw new Error('That ingredient is already in your pantry.')
                return {
                  ...s,
                  pantry: [
                    ...s.pantry,
                    {
                      id: crypto.randomUUID(),
                      name,
                      kind: 'staple',
                      amount: 1,
                      unit: 'each',
                      ...(note ? { note } : {}),
                    },
                  ],
                }
              },
              { kind: 'pantry' },
            )
          ) {
            form.reset()
            form.querySelector('input')?.focus()
          }
        }}
      >
        <input
          aria-label="Add pantry ingredient"
          name="name"
          required
          maxLength={200}
          placeholder="Add an ingredient..."
          autoComplete="off"
          enterKeyHint="next"
        />
        <input
          className="pantryNote"
          aria-label="How much is left (optional)"
          name="note"
          maxLength={60}
          placeholder={pantryNoteHint}
          autoComplete="off"
          enterKeyHint="done"
        />
        <Button
          className="iconButton"
          type="submit"
          aria-label="Add pantry ingredient"
        >
          <Plus size={20} />
        </Button>
      </form>
      <section className="pantryList">
        {state.pantry.length === 0 && (
          <p className="helper">Add your first ingredient above.</p>
        )}
        {state.pantry.map((item) => (
          <PantryRow key={item.id} item={item} change={change} />
        ))}
      </section>
    </main>
  )
}

function Recipes({
  store,
  live,
  ai,
  details,
  remix,
  clearRemix,
}: {
  store: HouseholdStore
  live: boolean
  ai: RecipeAi
  details: (recipe: Recipe) => void
  remix: RemixSave | null
  clearRemix: () => void
}) {
  const state = store.state!
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const [fromBookmark, setFromBookmark] = useState<Bookmark | undefined>()
  // The saved version this edit replaces; a changed baseline means another
  // phone edited it meanwhile.
  const [baseline, setBaseline] = useState<Recipe | null>(null)
  const [reviewingRemix, setReviewingRemix] = useState(false)
  const [remixSlot, setRemixSlot] = useState<RemixSave['slot']>()
  useEffect(() => {
    if (!remix) return
    setFromBookmark(undefined)
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
    <main className="screen">
      <Header eyebrow="YOUR RECIPE BOX" title="Kitchen favorites" />
      {editing ? (
        <RecipeForm
          key={
            typeof editing === 'string'
              ? `${editing}-${fromBookmark?.id ?? ''}`
              : editing.id
          }
          recipe={editing === 'new' ? undefined : editing}
          bookmark={fromBookmark}
          live={live}
          ai={editing === 'new' && !fromBookmark ? ai : undefined}
          heading={reviewingRemix ? 'Review your remix' : undefined}
          celebrate={editing === 'new' || reviewingRemix}
          notice={
            remixSlot
              ? `Saving puts this remix in this week's plan in place of “${remixSlot.title}”, pinned, as long as it still covers that recipe's servings. You'll confirm the grocery list again.`
              : undefined
          }
          onCancel={() => {
            setRemixSlot(undefined)
            setEditing(null)
            setFromBookmark(undefined)
            setBaseline(null)
            setReviewingRemix(false)
          }}
          onSave={save}
        />
      ) : (
        <>
          <Button
            className="primaryButton"
            onClick={() => {
              setFromBookmark(undefined)
              setBaseline(null)
              setEditing('new')
            }}
          >
            <Plus size={18} /> Add your recipe
          </Button>
          {state.recipes.map((recipe) => (
            <article className="mealRow recipeEntry" key={recipe.id}>
              <span className="eyebrow">
                {recipe.source === 'demo'
                  ? 'DEMO'
                  : recipe.aiDraft
                    ? 'AI-DRAFTED'
                    : recipe.source === 'reference' && recipe.sourceUrl
                      ? sourceName(recipe.sourceUrl)
                      : 'YOUR RECIPE'}
              </span>
              <Button className="recipeTitle" onClick={() => details(recipe)}>
                {recipe.title}
                <ArrowRight size={17} />
              </Button>
              <p>
                Makes {recipe.servings} · max batch {recipe.maxServings} ·{' '}
                {recipe.minutes} min
              </p>
              {recipe.facts?.needsReview && (
                <p className="helper">
                  Review before planning
                  {recipe.facts.pendingIngredients.length
                    ? ` · ${recipe.facts.pendingIngredients.length} ingredient amounts need attention`
                    : ' · confirm your batch size and leftover suitability'}
                </p>
              )}
              <div className="buttonRow">
                {recipe.source !== 'demo' && (
                  <Button
                    className="textButton"
                    onClick={() => {
                      setBaseline(recipe)
                      setEditing(recipe)
                    }}
                  >
                    {recipe.facts?.needsReview ? 'Review details' : 'Edit'}
                  </Button>
                )}
                {state.blocked.includes(recipe.id) && (
                  <Button
                    className="textButton"
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
                    Recommend again
                  </Button>
                )}
                <LovedButton
                  loved={state.loved.includes(recipe.id)}
                  onToggle={() => {
                    const { event } = toggleLoved(state, recipe.id)
                    return store.change(
                      (s) => toggleLoved(s, recipe.id).state,
                      event,
                    )
                  }}
                />
              </div>
            </article>
          ))}
          <Bookmarks
            state={state}
            change={store.change}
            onManual={(bookmark) => {
              setFromBookmark(bookmark)
              setBaseline(null)
              setEditing('new')
            }}
          />
        </>
      )}
    </main>
  )
}

function Kitchen({ mode, exit }: { mode: 'demo' | 'live'; exit: () => void }) {
  const store = useHousehold(mode)
  const state = store.state
  const [tab, setTab] = useState<Tab>(initialTab)
  const [detail, setDetail] = useState<{
    recipe: Recipe
    servings?: number
    slot?: number
  } | null>(null)
  const [remix, setRemix] = useState<RemixSave | null>(null)
  const clearRemix = useCallback(() => setRemix(null), [])
  const ai = mode === 'live' ? liveRecipeAi : demoRecipeAi
  const headingRef = useRef<HTMLDivElement>(null)
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
  }, [tab, state?.phase])
  const details = (recipe: Recipe, servings?: number, slot?: number) =>
    setDetail({ recipe, servings, slot })
  return (
    <div className="appShell" ref={headingRef}>
      <div className={`modeBar ${mode}`}>
        <span>
          {mode === 'demo'
            ? 'DEMO · this browser only'
            : store.connected
              ? 'Your shared kitchen · sync every 4s'
              : 'Connection unavailable · changes need internet'}
        </span>
        <Button
          aria-label={mode === 'demo' ? 'Leave demo' : 'Sign out'}
          onClick={exit}
        >
          <LogOut size={15} />
        </Button>
      </div>
      {store.error && (
        <div role="alert" className="errorBanner">
          <p>{store.error}</p>
          <Button onClick={store.retry}>Retry connection</Button>
          {mode === 'demo' && (
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    'Reset this browser’s demo? This does not affect a live household.',
                  )
                )
                  store.resetDemo()
              }}
            >
              Reset demo
            </Button>
          )}
        </div>
      )}
      {!state ? (
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
                <Setup state={state} change={store.change} />
              ) : state.phase === 'swipe' ? (
                <Swipe
                  state={state}
                  change={store.change}
                  household={store.household}
                  details={details}
                  live={mode === 'live'}
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
            {tab === 'pantry' && <Pantry state={state} change={store.change} />}
            {tab === 'recipes' && (
              <Recipes
                store={store}
                live={mode === 'live'}
                ai={ai}
                details={details}
                remix={remix}
                clearRemix={clearRemix}
              />
            )}
            <div className="weekAction">
              <Button
                className="textButton"
                onClick={() => {
                  if (
                    window.confirm(
                      'Start a fresh week? This clears weekly choices, plan and shopping checks, but keeps recipes, pantry and explicit preferences.',
                    )
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
          </fieldset>
          <nav className="bottomNav" aria-label="Main navigation">
            {tabs.map((item, index) => {
              const Icon = [Home, ShoppingBasket, PackageOpen, BookOpen][index]
              return (
                <Button
                  key={item}
                  aria-current={tab === item ? 'page' : undefined}
                  data-deck-target={item === 'recipes' ? '' : undefined}
                  onClick={() => navigate(item)}
                >
                  <Icon size={21} />
                  <span>
                    {item === 'plan'
                      ? 'Plan'
                      : item === 'groceries'
                        ? 'Groceries'
                        : item === 'pantry'
                          ? 'Pantry'
                          : 'Recipes'}
                  </span>
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
  const [mode, setMode] = useState<'welcome' | 'demo' | 'live'>('welcome')
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
          mode={mode}
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
        {configIncomplete && (
          <p role="alert" className="error">
            Supabase configuration is incomplete. Set both public environment
            variables.
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
          <p className="helper">
            Live sync is not configured in this build. The demo below stays on
            this browser and never pretends to sync.
          </p>
        )}
        <Button
          className="secondaryButton"
          disabled={loading}
          onClick={() => setMode('demo')}
        >
          Try the demo <ArrowRight size={18} />
        </Button>
        <p className="helper">
          Only the two Google accounts configured by your household
          administrator can access your live kitchen.
        </p>
      </main>
    </div>
  )
}
