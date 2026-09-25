import type {
  AnswerRow,
  FeedEvent,
  GameRow,
  GameStatus,
  NewQuestion,
  PlayerRow,
  QuestionRow,
  QuestionSecret,
} from './types.ts'

export class CodeTakenError extends Error {}

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
  insertPlayer(player: Omit<PlayerRow, 'id'>): Promise<PlayerRow>
  updatePlayer(id: string, patch: Partial<Pick<PlayerRow, 'rttMs' | 'nickname'>>): Promise<void>
  /** Adds to a player's score in one step, so concurrent answers can't overwrite each other. */
  addScore(playerId: string, delta: number): Promise<void>

  insertQuestions(questions: NewQuestion[]): Promise<void>
  getQuestion(gameId: string, idx: number): Promise<(QuestionRow & QuestionSecret) | null>
  revealQuestion(questionId: string, answer: string): Promise<void>

  listAnswers(questionId: string): Promise<AnswerRow[]>
  getAnswer(id: string): Promise<AnswerRow | null>
  insertAnswer(answer: Omit<AnswerRow, 'id' | 'createdAt'>): Promise<AnswerRow>
  updateAnswer(id: string, patch: Partial<Pick<AnswerRow, 'verdict' | 'points'>>): Promise<void>
  /** True for exactly one player per question: the first to answer correctly. */
  claimFirstCorrect(questionId: string, playerId: string): Promise<boolean>

  insertFeed(event: FeedEvent): Promise<void>

  setInterests(gameId: string, playerId: string, interests: string[]): Promise<void>
  deleteInterests(gameId: string): Promise<void>
  /** Interests at least two players share, most shared first. Names only. */
  sharedInterests(gameId: string): Promise<string[]>
}
