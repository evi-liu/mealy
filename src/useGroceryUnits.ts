import { useEffect, useState } from 'react'
import type { UnitSystem } from './domain'

export const GROCERY_UNITS_KEY = 'mealy-grocery-units'
type Preference = { system: UnitSystem; error: string }

function loadPreference(): Preference {
  try {
    const saved = localStorage.getItem(GROCERY_UNITS_KEY)
    if (saved !== null && saved !== 'us' && saved !== 'metric') {
      return {
        system: 'us',
        error:
          'Your saved unit preference could not be read. Choose a unit system to save it again.',
      }
    }
    return { system: saved ?? 'us', error: '' }
  } catch {
    return {
      system: 'us',
      error:
        'Local storage is unavailable. US kitchen units are shown by default; unit changes may not survive a reload.',
    }
  }
}

export function useGroceryUnits() {
  const [preference, setPreference] = useState(loadPreference)
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === GROCERY_UNITS_KEY || event.key === null)
        setPreference(loadPreference())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function setSystem(system: UnitSystem) {
    try {
      localStorage.setItem(GROCERY_UNITS_KEY, system)
      setPreference({ system, error: '' })
    } catch {
      setPreference({
        system,
        error:
          'Could not save your unit preference on this device. This selection applies only until you reload.',
      })
    }
  }
  return { ...preference, setSystem }
}
