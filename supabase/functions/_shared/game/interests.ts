// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
/** Interests players can tick when joining, and the question categories each one suggests. */

export type GameFormat = 'classic' | 'tossup'

export interface Interest {
  id: string
  label: string
  /** Open Trivia DB category names. */
  classic: string[]
  /** Tossup category ids (see TOSSUP_CATEGORIES). */
  tossup: string[]
}

export const INTERESTS: Interest[] = [
  { id: 'running', label: 'Running', classic: ['Sports'], tossup: ['Sports'] },
  { id: 'cycling', label: 'Cycling', classic: ['Sports'], tossup: ['Sports'] },
  { id: 'swimming', label: 'Swimming', classic: ['Sports'], tossup: ['Sports'] },
  { id: 'team-sports', label: 'Team sports', classic: ['Sports'], tossup: ['Sports'] },
  { id: 'hiking', label: 'Hiking & outdoors', classic: ['Geography', 'Science & Nature', 'Animals'], tossup: ['Geography', 'Science'] },
  { id: 'snow', label: 'Skiing & snow sports', classic: ['Sports', 'Geography'], tossup: ['Sports', 'Geography'] },
  { id: 'travel', label: 'Travel', classic: ['Geography', 'History'], tossup: ['Geography', 'History'] },
  { id: 'cars', label: 'Cars & motorsport', classic: ['Vehicles', 'Sports'], tossup: ['Sports'] },
  { id: 'movies', label: 'Movies & TV', classic: ['Entertainment: Film', 'Entertainment: Television'], tossup: ['Movies', 'Television'] },
  { id: 'music', label: 'Music', classic: ['Entertainment: Music', 'Entertainment: Musicals & Theatres'], tossup: ['Music', 'Fine Arts'] },
  { id: 'reading', label: 'Reading', classic: ['Entertainment: Books'], tossup: ['Literature'] },
  { id: 'science', label: 'Science & tech', classic: ['Science & Nature', 'Science: Computers', 'Science: Mathematics', 'Science: Gadgets'], tossup: ['Science'] },
  { id: 'history', label: 'History & politics', classic: ['History', 'Politics'], tossup: ['History', 'Social Science'] },
  { id: 'gaming', label: 'Gaming', classic: ['Entertainment: Video Games', 'Entertainment: Board Games'], tossup: ['Video Games'] },
  { id: 'art', label: 'Art', classic: ['Art'], tossup: ['Fine Arts'] },
  { id: 'myths', label: 'Myths & religion', classic: ['Mythology'], tossup: ['Mythology', 'Religion'] },
  { id: 'anime', label: 'Anime & comics', classic: ['Entertainment: Japanese Anime & Manga', 'Entertainment: Comics', 'Entertainment: Cartoon & Animations'], tossup: ['Other Pop Culture'] },
]

const BY_ID = new Map(INTERESTS.map((i) => [i.id, i]))

export function isInterest(id: string): boolean {
  return BY_ID.has(id)
}

/** Categories for interests shared by the group. `shared` comes ordered most-shared first. */
export function suggestCategories(shared: string[], format: GameFormat): string[] {
  const out: string[] = []
  for (const id of shared) {
    for (const category of BY_ID.get(id)?.[format] ?? []) {
      if (!out.includes(category)) out.push(category)
    }
  }
  return out
}
