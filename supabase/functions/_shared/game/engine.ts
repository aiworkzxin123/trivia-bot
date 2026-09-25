// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
/**
 * Single-player classic game as pure state transitions. Every function takes
 * the current time, so the rules can be tested without real timers.
 */
import { judge } from './answers/judge.ts'
import type { GameFormat } from './interests.ts'
import { DEFAULT_SCORING, scoreAnswer, type ScoringConfig } from './scoring.ts'
import { planTossup, tossupPoints } from './tossup.ts'

export interface Question {
  id: string
  text: string
  category: string
  answer: string
  answerline: string
  difficulty?: string
  /** Credit for where the question came from, e.g. the quiz bowl set. */
  sourceNote?: string
}

export interface Settings {
  /** Classic questions use timeLimitMs; tossups get their reading time plus a grace period. */
  format?: GameFormat
  timeLimitMs: number
  attempts: number
  scoring?: ScoringConfig
}

export type ResultVerdict = 'correct' | 'wrong' | 'timeout' | 'overridden'

export interface Result {
  questionId: string
  given: string[]
  verdict: ResultVerdict
  /** Time of the last submission, or null if nothing was submitted. */
  elapsedMs: number | null
  points: number
}

export interface GameState {
  phase: 'question' | 'reveal' | 'finished'
  questions: Question[]
  settings: Settings
  index: number
  questionStartedAt: number
  attemptsLeft: number
  given: string[]
  lastElapsedMs: number | null
  feedback: 'wrong' | 'prompt' | null
  promptText?: string
  results: Result[]
  score: number
}

function openQuestion(state: GameState, index: number, now: number): GameState {
  return {
    ...state,
    phase: 'question',
    index,
    questionStartedAt: now,
    attemptsLeft: state.settings.attempts,
    given: [],
    lastElapsedMs: null,
    feedback: null,
    promptText: undefined,
  }
}

export function startGame(questions: Question[], settings: Settings, now: number): GameState {
  const empty: GameState = {
    phase: 'question',
    questions,
    settings,
    index: 0,
    questionStartedAt: now,
    attemptsLeft: settings.attempts,
    given: [],
    lastElapsedMs: null,
    feedback: null,
    results: [],
    score: 0,
  }
  return openQuestion(empty, 0, now)
}

function closeQuestion(state: GameState, verdict: ResultVerdict, points: number, given = state.given): GameState {
  const result: Result = {
    questionId: state.questions[state.index].id,
    given,
    verdict,
    elapsedMs: state.lastElapsedMs,
    points,
  }
  return {
    ...state,
    phase: 'reveal',
    given,
    feedback: null,
    promptText: undefined,
    results: [...state.results, result],
    score: state.score + points,
  }
}

export function questionLimitMs(state: GameState): number {
  const question = state.questions[state.index]
  return state.settings.format === 'tossup' ? planTossup(question.text).limitMs : state.settings.timeLimitMs
}

function points(state: GameState, correct: boolean, elapsedMs: number): number {
  const answer = { correct, elapsedMs, isFirstCorrect: false }
  if (state.settings.format === 'tossup') return tossupPoints(answer, planTossup(state.questions[state.index].text))
  return scoreAnswer({ ...answer, limitMs: questionLimitMs(state) }, state.settings.scoring ?? DEFAULT_SCORING)
}

export function submit(state: GameState, answer: string, now: number): GameState {
  if (state.phase !== 'question' || !answer.trim()) return state
  const timeLimitMs = questionLimitMs(state)
  const elapsedMs = now - state.questionStartedAt
  const given = [...state.given, answer.trim()]
  const withAnswer = { ...state, given, lastElapsedMs: elapsedMs }

  if (elapsedMs > timeLimitMs) return closeQuestion(withAnswer, 'wrong', 0)

  const verdict = judge(state.questions[state.index], answer)
  if (verdict.result === 'correct') {
    return closeQuestion(withAnswer, 'correct', points(state, true, elapsedMs))
  }
  if (verdict.result === 'prompt') {
    return { ...withAnswer, feedback: 'prompt', promptText: verdict.promptText }
  }

  const attemptsLeft = state.attemptsLeft - 1
  const penalty = points(state, false, elapsedMs)
  if (attemptsLeft <= 0) return closeQuestion({ ...withAnswer, attemptsLeft }, 'wrong', penalty)
  return { ...withAnswer, attemptsLeft, feedback: 'wrong', score: state.score + penalty }
}

export function timeout(state: GameState, now: number): GameState {
  if (state.phase !== 'question') return state
  if (now - state.questionStartedAt < questionLimitMs(state)) return state
  return closeQuestion(state, 'timeout', 0)
}

/** Accepts the player's rejected answer, scored at the time it was submitted. */
export function override(state: GameState): GameState {
  if (state.phase !== 'reveal') return state
  const result = state.results[state.results.length - 1]
  if (result.verdict === 'correct' || result.verdict === 'overridden') return state
  if (result.elapsedMs === null || result.elapsedMs > questionLimitMs(state)) return state

  // Replacing the result's points also refunds a tossup penalty.
  const awarded = points(state, true, result.elapsedMs)
  const updated: Result = { ...result, verdict: 'overridden', points: awarded }
  return {
    ...state,
    results: [...state.results.slice(0, -1), updated],
    score: state.score - result.points + awarded,
  }
}

export function next(state: GameState, now: number): GameState {
  if (state.phase !== 'reveal') return state
  const index = state.index + 1
  if (index >= state.questions.length) return { ...state, phase: 'finished' }
  return openQuestion(state, index, now)
}
