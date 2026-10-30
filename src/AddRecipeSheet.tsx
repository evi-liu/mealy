import { useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { ArrowLeft, ChevronRight, Link, Plus, Sparkles, X } from 'lucide-react'
import { Bookmarks } from './Bookmarks'

export function AddRecipeSheet({
  onAi,
  onImport,
}: {
  onAi: () => void
  onImport: (url: string) => Promise<string | void>
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'choose' | 'link'>('choose')
  const [pending, setPending] = useState(false)
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, event) => {
        if (pending) {
          event.cancel()
          return
        }
        setOpen(next)
        if (next) setMode('choose')
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
        <Dialog.Popup className="dialogPopup addRecipeSheet">
          <div className="sheetHandle" aria-hidden="true" />
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
              <Button className="recipeAddOption" onClick={onAi}>
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
