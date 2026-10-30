import { useState } from 'react'
import { Button } from '@base-ui/react/button'
import { ArrowUpRight, Sparkles, X } from 'lucide-react'
import { sourceName, type Bookmark, type State } from './domain'
import type { HouseholdStore } from './store'
import { addRecipeFacts, availableRecipeFacts } from './recipeFacts'

/**
 * Paste a recipe link and AI reads the page into a new recipe to check and
 * save. Links saved before importing existed stay listed until imported.
 */
export function Bookmarks({
  state,
  change,
  onManual,
  onImport,
  demo,
}: {
  state: State
  change: HouseholdStore['change']
  onManual: (bookmark: Bookmark) => void
  /** Resolves to an error message, or nothing once the form is open. */
  onImport: (url: string) => Promise<string | void>
  demo: boolean
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState<string | null>(null)
  const available = availableRecipeFacts(state)
  const saved = state.bookmarks.filter(
    (bookmark) =>
      !state.recipes.some((recipe) => recipe.sourceUrl === bookmark.url),
  )
  async function run(link: string) {
    setError('')
    setImporting(link)
    try {
      const failure = await onImport(link.trim())
      if (failure) setError(failure)
      else if (link === url) setUrl('')
    } finally {
      setImporting(null)
    }
  }
  return (
    <section className="bookmarks" aria-labelledby="import-heading">
      <h2 id="import-heading">Import from a link</h2>
      <p className="helper">
        Paste a recipe page. AI reads it, ingredients, amounts and directions
        included, into a new recipe for you to check and save.
        {demo && ' Demo mode shows a canned example instead.'}
      </p>
      <form
        className="renameForm importLink"
        onSubmit={(e) => {
          e.preventDefault()
          void run(url)
        }}
      >
        <input
          type="url"
          inputMode="url"
          aria-label="Recipe link"
          placeholder="https://..."
          required
          maxLength={2048}
          value={url}
          readOnly={importing !== null}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          className="primaryButton"
          type="submit"
          disabled={importing !== null}
          focusableWhenDisabled
        >
          <Sparkles size={17} /> {importing ? 'Reading...' : 'Import'}
        </Button>
      </form>
      {importing && (
        <p role="status" className="helper">
          Reading the page and drafting your recipe...
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {available.length > 0 && (
        <div className="section">
          <Button
            className="secondaryButton"
            onClick={() => void change(addRecipeFacts, { kind: 'recipe' })}
          >
            Add recipe facts for {available.length} Tiffy Cooks links
          </Button>
        </div>
      )}
      {saved.length > 0 && <h3>Saved links</h3>}
      {saved.map((bookmark) => (
        <article className="mealRow" key={bookmark.id}>
          <div className="mealHeading">
            <span className="eyebrow">{sourceName(bookmark.url)}</span>
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
          <div className="buttonRow">
            <Button
              className="secondaryButton"
              disabled={importing !== null}
              onClick={() => void run(bookmark.url)}
            >
              <Sparkles size={16} /> Import with AI
            </Button>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="secondaryButton"
            >
              Open <ArrowUpRight size={16} />
            </a>
          </div>
          <Button className="textButton" onClick={() => onManual(bookmark)}>
            Enter the details myself
          </Button>
        </article>
      ))}
    </section>
  )
}
