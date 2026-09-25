/**
 * Single-player classic game as pure state transitions. Every function takes
 * the current time, so the rules can be tested without real timers.
 */
import { judge } from './answers/judge.ts'
import { DEFAULT_SCORING, scoreAnswer, type ScoringConfig } from './scoring.ts'

export interface Question {
  id: string
  text: string
  category: string
  answer: string
  answerline: string
  difficulty?: string
}

export interface Settings {
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

export function submit(state: GameState, answer: string, now: number): GameState {
  if (state.phase !== 'question' || !answer.trim()) return state
  const { timeLimitMs, scoring = DEFAULT_SCORING } = state.settings
  const elapsedMs = now - state.questionStartedAt
  const given = [...state.given, answer.trim()]
  const withAnswer = { ...state, given, lastElapsedMs: elapsedMs }

  if (elapsedMs > timeLimitMs) return closeQuestion(withAnswer, 'wrong', 0)

  const verdict = judge(state.questions[state.index], answer)
  if (verdict.result === 'correct') {
    const points = scoreAnswer({ correct: true, elapsedMs, limitMs: timeLimitMs, isFirstCorrect: false }, scoring)
    return closeQuestion(withAnswer, 'correct', points)
  }
  if (verdict.result === 'prompt') {
    return { ...withAnswer, feedback: 'prompt', promptText: verdict.promptText }
  }

  const attemptsLeft = state.attemptsLeft - 1
  const penalty = scoreAnswer({ correct: false, elapsedMs, limitMs: timeLimitMs, isFirstCorrect: false }, scoring)
  if (attemptsLeft <= 0) return closeQuestion({ ...withAnswer, attemptsLeft }, 'wrong', penalty)
  return { ...withAnswer, attemptsLeft, feedback: 'wrong', score: state.score + penalty }
}

export function timeout(state: GameState, now: number): GameState {
  if (state.phase !== 'question') return state
  if (now - state.questionStartedAt < state.settings.timeLimitMs) return state
  return closeQuestion(state, 'timeout', 0)
}

/** Accepts the player's rejected answer, scored at the time it was submitted. */
export function override(state: GameState): GameState {
  if (state.phase !== 'reveal') return state
  const result = state.results[state.results.length - 1]
  const { timeLimitMs, scoring = DEFAULT_SCORING } = state.settings
  if (result.verdict === 'correct' || result.verdict === 'overridden') return state
  if (result.elapsedMs === null || result.elapsedMs > timeLimitMs) return state

  const points = scoreAnswer({ correct: true, elapsedMs: result.elapsedMs, limitMs: timeLimitMs, isFirstCorrect: false }, scoring)
  const updated: Result = { ...result, verdict: 'overridden', points }
  return {
    ...state,
    results: [...state.results.slice(0, -1), updated],
    score: state.score - result.points + points,
  }
}

export function next(state: GameState, now: number): GameState {
  if (state.phase !== 'reveal') return state
  const index = state.index + 1
  if (index >= state.questions.length) return { ...state, phase: 'finished' }
  return openQuestion(state, index, now)
}
