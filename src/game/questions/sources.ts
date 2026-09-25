/**
 * Question sources shared by the browser (single player) and the server
 * function (multiplayer). Uses only fetch, so it runs in both.
 */

export interface SourcedQuestion {
  category: string
  text: string
  answer: string
  answerline: string
  difficulty?: string
  /** Where the question came from, shown for credit (e.g. the quiz bowl set). */
  sourceNote?: string
}

export interface TossupCategory {
  id: string
  label: string
  param: 'categories' | 'subcategories'
}

/** QBReader categories, with Pop Culture split into its subcategories. */
export const TOSSUP_CATEGORIES: TossupCategory[] = [
  { id: 'Literature', label: 'Literature', param: 'categories' },
  { id: 'History', label: 'History', param: 'categories' },
  { id: 'Science', label: 'Science', param: 'categories' },
  { id: 'Fine Arts', label: 'Fine Arts', param: 'categories' },
  { id: 'Geography', label: 'Geography', param: 'categories' },
  { id: 'Religion', label: 'Religion', param: 'categories' },
  { id: 'Mythology', label: 'Mythology', param: 'categories' },
  { id: 'Philosophy', label: 'Philosophy', param: 'categories' },
  { id: 'Social Science', label: 'Social Science', param: 'categories' },
  { id: 'Current Events', label: 'Current Events', param: 'categories' },
  { id: 'Other Academic', label: 'Other Academic', param: 'categories' },
  { id: 'Sports', label: 'Sports', param: 'subcategories' },
  { id: 'Movies', label: 'Movies', param: 'subcategories' },
  { id: 'Music', label: 'Music', param: 'subcategories' },
  { id: 'Television', label: 'Television', param: 'subcategories' },
  { id: 'Video Games', label: 'Video Games', param: 'subcategories' },
  { id: 'Other Pop Culture', label: 'Other Pop Culture', param: 'subcategories' },
]

export type TossupDifficulty = 'easy' | 'medium' | 'hard'

/** QBReader difficulty levels: 1–2 middle/easy high school, 3–4 high school, 5–7 national/college. */
const DIFFICULTIES: Record<TossupDifficulty, number[]> = { easy: [1, 2], medium: [3, 4], hard: [5, 6, 7] }

const QBREADER = 'https://www.qbreader.org/api/random-tossup'

export function tossupRequestUrls(categoryIds: string[], count: number, difficulty: TossupDifficulty): string[] {
  const chosen = TOSSUP_CATEGORIES.filter((c) => categoryIds.includes(c.id))
  const groups = chosen.length ? chosen : [null]
  return groups.map((category, i) => {
    const share = Math.floor(count / groups.length) + (i < count % groups.length ? 1 : 0)
    const params = new URLSearchParams({
      number: String(share),
      difficulties: DIFFICULTIES[difficulty].join(','),
      standardOnly: 'true',
    })
    if (category) params.set(category.param, category.id)
    return `${QBREADER}?${params}`
  })
}

interface QbTossup {
  question_sanitized: string
  answer: string
  answer_sanitized: string
  category: string
  subcategory: string
  difficulty: number
  set?: { name?: string }
}

export async function fetchTossups(
  categoryIds: string[],
  count: number,
  difficulty: TossupDifficulty,
  fetchImpl: typeof fetch = fetch,
): Promise<SourcedQuestion[]> {
  const urls = tossupRequestUrls(categoryIds, count, difficulty).filter((u) => !u.includes('number=0'))
  const pages = await Promise.all(
    urls.map(async (url) => {
      const res = await fetchImpl(url)
      if (!res.ok) throw new Error(`QBReader didn't respond (HTTP ${res.status}). Try again in a minute.`)
      return ((await res.json()) as { tossups: QbTossup[] }).tossups
    }),
  )
  return pages.flat().map((t) => ({
    category: t.subcategory && TOSSUP_CATEGORIES.some((c) => c.id === t.subcategory) ? t.subcategory : t.category,
    text: t.question_sanitized,
    answer: t.answer_sanitized,
    answerline: t.answer,
    difficulty: String(t.difficulty),
    sourceNote: t.set?.name,
  }))
}
