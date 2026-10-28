import { useState } from 'react'
import { Button } from '@base-ui/react/button'
import { ArrowUpRight, Link, X } from 'lucide-react'
import {
  makeBookmark,
  sourceName,
  trustedSources,
  type Bookmark,
  type State,
} from './domain'
import type { HouseholdStore } from './store'
import { addRecipeFacts, availableRecipeFacts } from './recipeFacts'

export function Bookmarks({
  state,
  change,
  onManual,
}: {
  state: State
  change: HouseholdStore['change']
  onManual: (bookmark: Bookmark) => void
}) {
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const available = availableRecipeFacts(state)
  return (
    <section className="bookmarks">
      <h2>From trusted kitchens</h2>
      <p className="helper">
        Your starting sources are The Woks of Life and Tiffy Cooks. Open the
        original site to explore, then save a recipe link here.
      </p>
      <div className="buttonRow">
        {trustedSources.map((source) => (
          <a
            className="secondaryButton"
            key={source.domain}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.name}
            <ArrowUpRight size={16} />
          </a>
        ))}
      </div>
      {available.length > 0 && (
        <div className="section">
          <Button
            className="secondaryButton"
            onClick={() => void change(addRecipeFacts, { kind: 'recipe' })}
          >
            Add recipe facts for {available.length} Tiffy Cooks links
          </Button>
          <p className="helper">
            Ingredients, yields and times only, from checked source snapshots.
            Review the quantities and your batch capacity before planning.
            Cooking directions stay on Tiffy Cooks.
          </p>
        </div>
      )}
      <form
        className="pantryForm section"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget
          const data = new FormData(form)
          setError('')
          setSaved(false)
          try {
            const bookmark = makeBookmark(
              String(data.get('title')),
              String(data.get('url')),
            )
            if (
              await change(
                (s) => {
                  if (s.bookmarks.some((item) => item.url === bookmark.url))
                    throw new Error('That link is already in your bookmarks.')
                  return { ...s, bookmarks: [...s.bookmarks, bookmark] }
                },
                { kind: 'bookmark', recipeId: bookmark.id },
              )
            ) {
              form.reset()
              setSaved(true)
            }
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error))
          }
        }}
      >
        <h3>Save a recipe link</h3>
        <label>
          Your label
          <input
            name="title"
            required
            maxLength={200}
            placeholder="A recipe I'd like to try"
          />
        </label>
        <label>
          Recipe link
          <input
            name="url"
            type="url"
            inputMode="url"
            required
            maxLength={2048}
            placeholder="https://..."
          />
        </label>
        <p className="helper">
          Saves a link only. Checked factual snapshots are available separately
          for selected Tiffy Cooks recipes. Full instructions and photos are not
          copied.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="secondaryButton">
          <Link size={17} />
          Save link bookmark
        </Button>
        {saved && (
          <p role="status" className="helper">
            Bookmark saved. No recipe details were imported.
          </p>
        )}
      </form>
      {state.bookmarks
        .filter(
          (bookmark) =>
            !state.recipes.some(
              (recipe) =>
                recipe.source === 'reference' &&
                recipe.sourceUrl === bookmark.url,
            ),
        )
        .map((bookmark) => (
          <article className="mealRow" key={bookmark.id}>
            <div className="mealHeading">
              <span className="eyebrow">
                LINK ONLY · {sourceName(bookmark.url)}
              </span>
              <Button
                className="iconButton"
                aria-label={`Remove bookmark ${bookmark.title}`}
                onClick={() =>
                  void change(
                    (s) => ({
                      ...s,
                      bookmarks: s.bookmarks.filter(
                        (item) => item.id !== bookmark.id,
                      ),
                    }),
                    { kind: 'bookmark', recipeId: bookmark.id },
                  )
                }
              >
                <X size={17} />
              </Button>
            </div>
            <h3>{bookmark.title}</h3>
            <p>
              Yield and ingredients not entered. Not yet eligible for a plan or
              grocery list.
            </p>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="secondaryButton"
            >
              Read on {sourceName(bookmark.url)}
              <ArrowUpRight size={16} />
            </a>
            <Button className="textButton" onClick={() => onManual(bookmark)}>
              Enter my own recipe details
            </Button>
          </article>
        ))}
    </section>
  )
}
