import { useEffect, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { ArrowLeft, ChevronRight, Link, Plus, Sparkles, X } from 'lucide-react'
import { Bookmarks } from './Bookmarks'

export function AddRecipeSheet({
  onAi,
  onImport,
}: {
  onAi: (instruction: string) => Promise<string | void>
  onImport: (url: string) => Promise<string | void>
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'choose' | 'link' | 'ai'>('choose')
  const [pending, setPending] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState('')
  const prompt = useRef<HTMLTextAreaElement>(null)
  const submitting = useRef(false)
  const [viewport, setViewport] = useState<{ top: number; height: number }>()
  useEffect(() => {
    if (!open || mode !== 'ai') return
    prompt.current?.focus()
    const visual = window.visualViewport
    function resize() {
      const height = visual?.height ?? window.innerHeight
      const gap = Math.min(28, height * 0.05)
      setViewport({ top: (visual?.offsetTop ?? 0) + gap, height: height - gap })
    }
    resize()
    visual?.addEventListener('resize', resize)
    visual?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    return () => {
      visual?.removeEventListener('resize', resize)
      visual?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
    }
  }, [open, mode])
  async function submitPrompt() {
    const text = instruction.trim()
    if (!text || submitting.current) return
    submitting.current = true
    setPending(true)
    setError('')
    try {
      const message = await onAi(text)
      if (message) setError(message)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, event) => {
        if (pending) {
          event.cancel()
          return
        }
        setOpen(next)
        if (next) {
          setMode('choose')
          setInstruction('')
          setError('')
        }
      }}
    >
      <Dialog.Trigger
        className="iconButton addRecipeButton"
        aria-label="Add recipe"
      >
        <Plus size={27} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialogBackdrop" />
        <Dialog.Popup
          className={`dialogPopup addRecipeSheet${mode === 'ai' ? ' recipePromptSheet' : ''}`}
          style={mode === 'ai' ? viewport : undefined}
        >
          <div className="sheetHandle" aria-hidden="true" />
          {mode === 'ai' ? (
            <>
              <header className="promptSheetHeader">
                <Dialog.Close className="textButton" disabled={pending}>
                  Cancel
                </Dialog.Close>
                <Dialog.Title>New recipe</Dialog.Title>
              </header>
              <textarea
                ref={prompt}
                className="recipePromptInput"
                aria-label="Describe a recipe to add"
                placeholder="Describe the recipe you have in mind. Ingredients, flavors, how much time you have..."
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={500}
                readOnly={pending}
                aria-busy={pending}
                enterKeyHint="send"
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void submitPrompt()
                  }
                }}
              />
              <footer className="promptSheetFooter">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                {pending && <p role="status">Drafting your recipe...</p>}
                <Dialog.Description>
                  AI helps with the first draft. You'll review it before saving.
                  Don't include sensitive information.
                </Dialog.Description>
                <Button
                  className="primaryButton"
                  disabled={pending || !instruction.trim()}
                  onClick={() => void submitPrompt()}
                >
                  <Sparkles size={18} aria-hidden="true" />
                  {pending ? 'Drafting...' : 'Draft recipe'}
                </Button>
              </footer>
            </>
          ) : (
            <>
              {mode === 'link' && (
                <Button
                  className="iconButton sheetBack"
                  aria-label="Back to add options"
                  disabled={pending}
                  onClick={() => setMode('choose')}
                >
                  <ArrowLeft size={20} />
                </Button>
              )}
              <Dialog.Title>
                {mode === 'choose' ? 'Add a recipe' : 'Import from a link'}
              </Dialog.Title>
              <Dialog.Description className="helper">
                {mode === 'choose'
                  ? 'Start with an idea or a recipe you found.'
                  : 'AI reads the recipe. You review it before saving.'}
              </Dialog.Description>
              <Dialog.Close
                className="dialogClose"
                aria-label="Close add recipe"
                disabled={pending}
              >
                <X size={20} />
              </Dialog.Close>
              {mode === 'choose' ? (
                <div className="recipeAddOptions">
                  <Button
                    className="recipeAddOption"
                    onClick={() => setMode('ai')}
                  >
                    <span className="recipeOptionIcon">
                      <Sparkles size={24} />
                    </span>
                    <span>
                      <strong>Add with AI</strong>
                      <small>Describe a dish. Make it your own.</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Button>
                  <Button
                    className="recipeAddOption"
                    onClick={() => setMode('link')}
                  >
                    <span className="recipeOptionIcon">
                      <Link size={24} />
                    </span>
                    <span>
                      <strong>Link a website</strong>
                      <small>Turn a recipe page into a kitchen favorite.</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Bookmarks onImport={onImport} onPendingChange={setPending} />
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
