/** Per-browser conveniences. Storage can be unavailable (private mode), so every call is guarded. */

const SEEN_KEY = 'triviabot.seen'
const SETTINGS_KEY = 'triviabot.settings'
const MAX_SEEN = 2000

export interface SavedSettings {
  categories: string[]
  count: number
  timeLimitSec: number
}

export const DEFAULT_SETTINGS: SavedSettings = { categories: [], count: 10, timeLimitSec: 20 }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is full or blocked; the game works without it.
  }
}

export function loadSeen(): Set<string> {
  return new Set(read<string[]>(SEEN_KEY, []))
}

export function markSeen(ids: string[]) {
  const seen = [...loadSeen(), ...ids]
  write(SEEN_KEY, [...new Set(seen)].slice(-MAX_SEEN))
}

export function loadSettings(): SavedSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<SavedSettings>>(SETTINGS_KEY, {}) }
}

export function saveSettings(settings: SavedSettings) {
  write(SETTINGS_KEY, settings)
}
