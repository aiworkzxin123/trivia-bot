// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
export interface ScoringConfig {
  /** Points for an instant correct answer. */
  maxPoints: number
  /** Share of maxPoints left for a correct answer at the time limit. */
  minFraction: number
  firstCorrectBonus: number
  /** Points taken away for a wrong answer (tossup mode). */
  wrongPenalty: number
  /** Most latency compensation a player can get, in ms. */
  latencyCapMs: number
}

export const DEFAULT_SCORING: ScoringConfig = {
  maxPoints: 1000,
  minFraction: 0.5,
  firstCorrectBonus: 100,
  wrongPenalty: 0,
  latencyCapMs: 150,
}

/** points = round(max × (1 − (1 − minFraction) × elapsed / limit)), and 0 after the limit. */
export function speedPoints(elapsedMs: number, limitMs: number, config = DEFAULT_SCORING): number {
  if (elapsedMs > limitMs) return 0
  const t = Math.max(0, elapsedMs)
  return Math.round(config.maxPoints * (1 - (1 - config.minFraction) * (t / limitMs)))
}

/** Subtracts half the player's round-trip time, capped, so distant players aren't penalized. */
export function adjustedElapsed(rawMs: number, rttMs: number, capMs = DEFAULT_SCORING.latencyCapMs): number {
  return Math.max(0, rawMs - Math.min(rttMs / 2, capMs))
}

export interface ScoredAnswer {
  correct: boolean
  elapsedMs: number
  limitMs: number
  isFirstCorrect: boolean
}

export function scoreAnswer(answer: ScoredAnswer, config = DEFAULT_SCORING): number {
  if (!answer.correct) return config.wrongPenalty ? -config.wrongPenalty : 0
  const points = speedPoints(answer.elapsedMs, answer.limitMs, config)
  if (points === 0) return 0
  return points + (answer.isFirstCorrect ? config.firstCorrectBonus : 0)
}
