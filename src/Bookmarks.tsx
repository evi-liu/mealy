import { useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Sparkles } from 'lucide-react'
import { OfflineNote, useOnline } from './online'

/**
 * Paste a recipe link and AI reads the page into a new recipe to check and
 * save. Importing always creates a recipe; links are not kept on their own.
 */
export function Bookmarks({
  onImport,
  onPendingChange,
}: {
  /** Resolves to an error message, or nothing once the form is open. */
  onImport: (url: string) => Promise<string | void>
  onPendingChange: (pending: boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const online = useOnline()
  async function run() {
    setError('')
    setImporting(true)
    onPendingChange(true)
    try {
      const failure = await onImport(url.trim())
      if (failure) setError(failure)
      else setUrl('')
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
      onPendingChange(false)
    }
  }
  return (
    <section className="bookmarks" aria-label="Recipe website">
      <p className="helper">
        Paste a recipe page. AI reads it, ingredients, amounts and directions
        included, into a new recipe for you to check and save.
      </p>
      <form
        className="renameForm importLink"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <input
          autoFocus
          type="url"
          inputMode="url"
          aria-label="Recipe link"
          placeholder="https://..."
          required
          maxLength={2048}
          value={url}
          readOnly={importing}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          className="primaryButton"
          type="submit"
          disabled={importing || !online}
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
      {!online && <OfflineNote />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
