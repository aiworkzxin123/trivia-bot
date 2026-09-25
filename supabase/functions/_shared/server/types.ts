// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
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

/** What players can read. The answer stays in QuestionSecret until the reveal. */
export interface QuestionRow {
  id: string
  gameId: string
  idx: number
  category: string
  text: string
  difficulty: string | null
  sourceNote: string | null
  limitMs: number
  revealedAnswer: string | null
}

export interface QuestionSecret {
  answer: string
  answerline: string
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

export type NewQuestion = Omit<QuestionRow, 'id' | 'revealedAnswer'> & QuestionSecret
