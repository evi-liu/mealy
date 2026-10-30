import { useEffect, useState } from 'react'
import { CookingPot } from 'lucide-react'
import type { Recipe } from './domain'
import { supabase } from './store'

export function RecipeArt({
  recipe,
  household,
  compact = false,
}: {
  recipe: Recipe
  household?: string | null
  compact?: boolean
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setUrl('')
    setError('')
    if (recipe.imagePath && supabase && household) {
      void supabase.storage
        .from('recipe-images')
        .createSignedUrl(recipe.imagePath, 3600)
        .then(({ data, error }) => {
          if (active) {
            if (error) setError('Photo unavailable')
            else setUrl(data.signedUrl)
          }
        })
        .catch(() => {
          if (active) setError('Photo unavailable')
        })
    }
    return () => {
      active = false
    }
  }, [recipe.imagePath, household])
  return (
    <div
      className={`recipeArt tone${recipe.title.length % 4}${compact ? ' recipeThumb' : ''}`}
    >
      {url ? (
        <img
          src={url}
          alt={recipe.title}
          onError={() => {
            setUrl('')
            setError('Photo unavailable')
          }}
        />
      ) : (
        <>
          <div className="illustratedPlate">
            <CookingPot size={compact ? 24 : 65} strokeWidth={1} />
          </div>
          {(!compact || error) && (
            <small>{error || 'A little kitchen illustration'}</small>
          )}
        </>
      )}
    </div>
  )
}
