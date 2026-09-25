import type { Question } from '../engine.ts'

export interface QuestionFile {
  source: string
  license: string
  generatedAt: string
  categories: { name: string; count: number }[]
  questions: Question[]
}

export interface PickOptions {
  /** Open Trivia DB category names; empty means every category. */
  categories: string[]
  count: number
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Random questions from the chosen categories, unseen ones first. */
export function pickQuestions(
  pool: Question[],
  options: PickOptions,
  seen: ReadonlySet<string>,
  random: () => number = Math.random,
): Question[] {
  const chosen = new Set(options.categories)
  const eligible = chosen.size ? pool.filter((q) => chosen.has(q.category)) : pool
  const unseen = shuffle(eligible.filter((q) => !seen.has(q.id)), random)
  const repeats = shuffle(eligible.filter((q) => seen.has(q.id)), random)
  return [...unseen, ...repeats].slice(0, options.count)
}

/** "Entertainment: Video Games" → "Video Games" */
export function displayCategory(name: string): string {
  return name.replace(/^(Entertainment|Science):\s*/, '')
}

export async function loadQuestions(): Promise<QuestionFile> {
  const res = await fetch(`${import.meta.env.BASE_URL}questions/opentdb.json`)
  if (!res.ok) throw new Error(`Couldn't load questions (HTTP ${res.status})`)
  // A missing file comes back as the app's own HTML page, not an error status.
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error("The question file hasn't been built yet. Run npm run build:questions")
  }
  return (await res.json()) as QuestionFile
}
