import { createContext, useContext } from 'react'

/**
 * Whether the household can reach the server right now. Everyday cooking
 * works offline; only actions that need a server (AI, fetching recipes)
 * read this to disable themselves.
 */
export const OnlineContext = createContext(true)
export const useOnline = () => useContext(OnlineContext)

export const offlineAiHelp =
  "AI needs an internet connection. Everything else works offline and syncs when you're back online."

export function OfflineNote({
  children = offlineAiHelp,
}: {
  children?: string
}) {
  return (
    <p className="helper offlineNote" role="status">
      {children}
    </p>
  )
}
