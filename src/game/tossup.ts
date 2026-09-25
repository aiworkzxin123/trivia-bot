/**
 * Quiz bowl tossups: the text is revealed word by word, answering before the
 * power mark "(*)" earns a bonus, and a wrong answer costs points.
 */
import { DEFAULT_SCORING, scoreAnswer, type ScoringConfig } from './scoring.ts'

/** Roughly the pace of a quiz bowl moderator reading aloud. */
export const WORDS_PER_SECOND = 3.2
/** Time to answer after the last word appears. */
export const TOSSUP_GRACE_MS = 5000
export const POWER_BONUS = 200

/** Quiz bowl's −5 for a wrong answer, scaled to the 1000-point scale. */
export const TOSSUP_SCORING: ScoringConfig = { ...DEFAULT_SCORING, wrongPenalty: 50 }
export const TOSSUP_ATTEMPTS = 1

export interface TossupPlan {
  words: string[]
  /** Number of words before the power mark, or null if there is none. */
  powerIndex: number | null
  readMs: number
  limitMs: number
}

export function planTossup(text: string): TossupPlan {
  const words: string[] = []
  let powerIndex: number | null = null
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (!token.includes('(*)')) {
      words.push(token)
      continue
    }
    const rest = token.replace('(*)', '')
    if (rest) words.push(rest)
    powerIndex = words.length
  }
  const readMs = Math.round((words.length / WORDS_PER_SECOND) * 1000)
  return { words, powerIndex, readMs, limitMs: readMs + TOSSUP_GRACE_MS }
}

export function wordsRevealed(plan: TossupPlan, elapsedMs: number): number {
  const shown = Math.ceil((Math.max(0, elapsedMs) / 1000) * WORDS_PER_SECOND)
  return Math.min(plan.words.length, shown)
}

export function isPower(plan: TossupPlan, elapsedMs: number): boolean {
  return plan.powerIndex !== null && wordsRevealed(plan, elapsedMs) <= plan.powerIndex
}

export interface TossupAnswer {
  correct: boolean
  elapsedMs: number
  isFirstCorrect: boolean
}

export function tossupPoints(answer: TossupAnswer, plan: TossupPlan, config = TOSSUP_SCORING): number {
  const points = scoreAnswer({ ...answer, limitMs: plan.limitMs }, config)
  if (!answer.correct || points === 0) return points
  return points + (isPower(plan, answer.elapsedMs) ? POWER_BONUS : 0)
}
