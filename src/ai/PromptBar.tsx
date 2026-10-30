import { useState } from 'react'
import { Button } from '@base-ui/react/button'
import { LoaderCircle, Sparkles } from 'lucide-react'

export function PromptBar({
  label,
  placeholder,
  submitLabel,
  pending,
  sticky = false,
  quiet = false,
  onSubmit,
}: {
  label: string
  placeholder: string
  submitLabel: string
  pending: boolean
  sticky?: boolean
  /** Secondary styling, for when drafting is not the screen's main action. */
  quiet?: boolean
  onSubmit: (text: string) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  async function send() {
    const text = value.trim()
    if (!text || pending) return
    if (await onSubmit(text)) setValue('')
  }
  return (
    <div
      className={`promptBar${sticky ? ' sticky' : ''}${quiet ? ' quiet' : ''}`}
    >
      <textarea
        aria-label={label}
        placeholder={placeholder}
        value={value}
        maxLength={500}
        rows={sticky ? 1 : quiet ? 2 : 3}
        readOnly={pending}
        aria-busy={pending}
        enterKeyHint="send"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
          }
        }}
      />
      <Button
        className="iconButton promptSend"
        aria-label={submitLabel}
        disabled={pending || !value.trim()}
        focusableWhenDisabled
        onClick={() => void send()}
      >
        {pending ? (
          <LoaderCircle size={19} className="spin" />
        ) : (
          <Sparkles size={19} />
        )}
      </Button>
    </div>
  )
}
