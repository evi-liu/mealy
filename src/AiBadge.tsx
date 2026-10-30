import { Sparkles } from 'lucide-react'

export function AiBadge() {
  return (
    <span
      className="aiBadge"
      role="img"
      aria-label="AI-assisted recipe"
      title="AI-assisted recipe"
    >
      <Sparkles size={14} aria-hidden="true" />
    </span>
  )
}
