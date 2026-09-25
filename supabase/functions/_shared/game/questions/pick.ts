// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
/** Picking a game's questions. No browser APIs, so the server function can use it too. */
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
