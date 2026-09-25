/** Rows the multiplayer game service reads and writes. Times are epoch milliseconds. */
import type { GameFormat } from '../game/interests.ts'
import type { TossupDifficulty } from '../game/questions/sources.ts'

/** "starting" covers the moment between the host pressing Start and the questions being ready. */
export type GameStatus = 'lobby' | 'starting' | 'question' | 'reveal' | 'finished'

export interface GameSettings {
  format: GameFormat
  /** Open Trivia DB category names (classic) or tossup category ids; empty means any. */
  categories: string[]
  count: number
  /** Classic mode only; tossups are timed by their length. */
  timeLimitSec: number
  /** Tossup mode only. */
  difficulty: TossupDifficulty
}

export interface GameRow {
  id: string
  code: string
  hostId: string
  status: GameStatus
  settings: GameSettings
  /** -1 until the first question opens. */
  currentIndex: number
  questionCount: number
  questionStartedAt: number | null
  questionEndsAt: number | null
  createdAt: number
}

export interface PlayerRow {
  id: string
  gameId: string
  userId: string
  nickname: string
  score: number
  rttMs: number
  joinedAt: number
}

/**
 * What players can read. For tossups, text stays empty until the reveal and the
 * words arrive through timed chunks instead. The answer and the tournament name
 * (which would make the question easy to look up) are copied in at the reveal.
 */
export interface QuestionRow {
  id: string
  gameId: string
  idx: number
  category: string
  text: string
  difficulty: string | null
  sourceNote: string | null
  limitMs: number
  /** Tossups only: number of words, and words before the power mark. */
  wordCount: number | null
  powerIndex: number | null
  revealedAnswer: string | null
}

/** Readable only by the server until the reveal. */
export interface QuestionSecret {
  answer: string
  answerline: string
  fullText: string
  sourceNote: string | null
}

/** A few words of a tossup, readable once offsetMs has passed since the question started. */
export interface QuestionChunk {
  idx: number
  offsetMs: number
  text: string
}

export type AnswerVerdict = 'correct' | 'prompt' | 'wrong' | 'late' | 'overridden'

export interface AnswerRow {
  id: string
  gameId: string
  questionId: string
  playerId: string
  given: string
  verdict: AnswerVerdict
  points: number
  elapsedMs: number
  createdAt: number
}

/** Live feed entry: who got it and how fast, never what they typed. */
export interface FeedEvent {
  gameId: string
  playerId: string
  nickname: string
  kind: 'correct' | 'override'
  elapsedMs: number
  points: number
}

export type NewQuestion = Omit<QuestionRow, 'id' | 'revealedAnswer' | 'sourceNote'> & QuestionSecret & { chunks: QuestionChunk[] }

export interface RecordAnswerInput {
  gameId: string
  questionId: string
  playerId: string
  given: string
  elapsedMs: number
  verdict: 'correct' | 'wrong' | 'prompt' | 'late'
  /** Points for this verdict, not counting the first-correct bonus. */
  points: number
  /** Points if a prompt is turned into a wrong answer. */
  wrongPoints: number
  /** Added when this is the first correct answer to the question. */
  firstCorrectBonus: number
  maxAttempts: number
  maxSubmits: number
  maxPrompts: number
}

export type RecordAnswerResult =
  | { ok: true; verdict: RecordAnswerInput['verdict']; points: number; wrongCount: number }
  | { ok: false; reason: 'done' | 'too_many' }
