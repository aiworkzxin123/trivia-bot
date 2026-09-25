import type {
  AnswerRow,
  FeedEvent,
  GameRow,
  GameStatus,
  NewQuestion,
  PlayerRow,
  QuestionRow,
  QuestionSecret,
  RecordAnswerInput,
  RecordAnswerResult,
} from './types.ts'

export class CodeTakenError extends Error {}
export class NicknameTakenError extends Error {}
export class GameFullError extends Error {}

/** Storage behind the game service: Supabase in production, memory in tests. */
export interface GameStore {
  /** Throws CodeTakenError when the code is already used. */
  insertGame(game: Omit<GameRow, 'id'>): Promise<GameRow>
  getGame(id: string): Promise<GameRow | null>
  getGameByCode(code: string): Promise<GameRow | null>
  /**
   * Updates only if the game still has the expected status (and index, if given).
   * Returns false when another request changed it first.
   */
  updateGame(id: string, patch: Partial<GameRow>, expected: { status: GameStatus; currentIndex?: number }): Promise<boolean>
  countGamesByHostSince(hostId: string, since: number): Promise<number>
  deleteGamesCreatedBefore(time: number): Promise<number>

  listPlayers(gameId: string): Promise<PlayerRow[]>
  getPlayer(gameId: string, userId: string): Promise<PlayerRow | null>
  /** Throws NicknameTakenError or GameFullError; both are enforced by the database. */
  insertPlayer(player: Omit<PlayerRow, 'id'>, maxPlayers: number): Promise<PlayerRow>
  updatePlayer(id: string, patch: Partial<Pick<PlayerRow, 'rttMs' | 'nickname'>>): Promise<void>

  insertQuestions(questions: NewQuestion[]): Promise<void>
  /** The full question including its secrets. Server only. */
  getQuestion(gameId: string, idx: number): Promise<(QuestionRow & QuestionSecret) | null>
  /** Makes the answer, full text and source readable to players. */
  revealQuestion(questionId: string, reveal: { answer: string; text: string; sourceNote: string | null }): Promise<void>

  listAnswers(questionId: string): Promise<AnswerRow[]>
  getAnswer(id: string): Promise<AnswerRow | null>
  /**
   * Checks the attempt limits, records the answer, claims the first-correct
   * bonus and updates the score as one step, so answers sent at the same
   * moment can't get past the limits or score twice.
   */
  recordAnswer(input: RecordAnswerInput): Promise<RecordAnswerResult>
  /** Accepts a wrong answer in one step. False if it was already accepted or the player already got it right. */
  overrideAnswer(answerId: string, points: number): Promise<boolean>

  insertFeed(event: FeedEvent): Promise<void>

  setInterests(gameId: string, playerId: string, interests: string[]): Promise<void>
  deleteInterests(gameId: string): Promise<void>
  /** Interests at least two players share, most shared first. Names only. */
  sharedInterests(gameId: string): Promise<string[]>
}
