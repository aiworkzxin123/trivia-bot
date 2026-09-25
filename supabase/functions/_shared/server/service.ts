// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
/**
 * Multiplayer rules, enforced on the server. The Supabase function is a thin
 * wrapper around handleAction; tests drive it with a MemoryStore.
 */
import { judge } from '../game/answers/judge.ts'
import { isInterest } from '../game/interests.ts'
import type { SourcedQuestion } from '../game/questions/sources.ts'
import { adjustedElapsed, DEFAULT_SCORING, scoreAnswer } from '../game/scoring.ts'
import { planTossup, TOSSUP_ATTEMPTS, TOSSUP_SCORING, tossupPoints, WORDS_PER_SECOND } from '../game/tossup.ts'
import { CodeTakenError, GameFullError, NicknameTakenError, type GameStore } from './store.ts'
import type { AnswerRow, GameRow, GameSettings, NewQuestion, PlayerRow, QuestionChunk, QuestionSecret } from './types.ts'

export const MAX_PLAYERS = 50
export const GAMES_PER_HOUR = 10
export const SUBMITS_PER_QUESTION = 10
export const CLASSIC_ATTEMPTS = 2
/** "More specific?" hints per question; after that a partial answer counts as wrong. */
export const MAX_PROMPTS = 2
export const MAX_INTERESTS = 5
/** Tossup words are released a few at a time, so the full text can't be read ahead. */
export const CHUNK_WORDS = 3
/** Delay before each question opens, so every player sees it start at the same moment. */
export const QUESTION_LEAD_MS = 2000
export const GAME_TTL_MS = 24 * 60 * 60 * 1000

const COUNTS = [5, 10, 15, 20]
const TIME_LIMITS = [15, 20, 30]
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export interface ServiceDeps {
  store: GameStore
  now: () => number
  loadQuestions: (settings: GameSettings) => Promise<SourcedQuestion[]>
  random?: () => number
}

export class GameError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Action =
  | { type: 'create'; nickname: string; settings: GameSettings; interests?: string[] }
  | { type: 'join'; code: string; nickname: string; interests?: string[] }
  | { type: 'updateSettings'; gameId: string; settings: GameSettings }
  | { type: 'ping'; gameId: string; rttMs?: number }
  | { type: 'suggestions'; gameId: string }
  | { type: 'start'; gameId: string }
  | { type: 'submit'; gameId: string; answer: string }
  | { type: 'reveal'; gameId: string }
  | { type: 'override'; gameId: string; answerId: string }
  | { type: 'next'; gameId: string }
  | { type: 'cleanup' }

export interface SubmitResult {
  result: 'correct' | 'prompt' | 'wrong' | 'late'
  points: number
  attemptsLeft: number
  promptText?: string
}

// ---------- validation ----------

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new GameError(400, `${field} is missing`)
  // Normalize lookalike characters and strip control and invisible formatting
  // characters, so names can't break the layout or impersonate someone.
  const clean = value
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) throw new GameError(400, `${field} can't be empty`)
  if (clean.length > max) throw new GameError(400, `${field} can be at most ${max} characters`)
  return clean
}

export function validateSettings(value: unknown): GameSettings {
  const s = (value ?? {}) as Partial<GameSettings>
  const format = s.format === 'tossup' ? 'tossup' : 'classic'
  const categories = Array.isArray(s.categories)
    ? s.categories.filter((c): c is string => typeof c === 'string' && c.length <= 60).slice(0, 30)
    : []
  return {
    format,
    categories,
    count: COUNTS.includes(Number(s.count)) ? Number(s.count) : 10,
    timeLimitSec: TIME_LIMITS.includes(Number(s.timeLimitSec)) ? Number(s.timeLimitSec) : 20,
    difficulty: s.difficulty === 'easy' || s.difficulty === 'hard' ? s.difficulty : 'medium',
  }
}

function validInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((i): i is string => typeof i === 'string' && isInterest(i)))].slice(0, MAX_INTERESTS)
}

// ---------- helpers ----------

function maxAttempts(game: GameRow) {
  return game.settings.format === 'tossup' ? TOSSUP_ATTEMPTS : CLASSIC_ATTEMPTS
}

function randomCode(random: () => number) {
  return Array.from({ length: 5 }, () => CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)]).join('')
}

/** Speed points without the first-correct bonus, which the store adds for whoever is first. */
function pointsFor(game: GameRow, question: { limitMs: number } & QuestionSecret, correct: boolean, elapsedMs: number) {
  const answer = { correct, elapsedMs, isFirstCorrect: false }
  if (game.settings.format === 'tossup') return tossupPoints(answer, planTossup(question.fullText))
  return scoreAnswer({ ...answer, limitMs: question.limitMs }, DEFAULT_SCORING)
}

function bonusFor(game: GameRow) {
  return (game.settings.format === 'tossup' ? TOSSUP_SCORING : DEFAULT_SCORING).firstCorrectBonus
}

function playerDone(answers: AnswerRow[], playerId: string, attempts: number) {
  const mine = answers.filter((a) => a.playerId === playerId)
  if (mine.some((a) => a.verdict === 'correct' || a.verdict === 'overridden' || a.verdict === 'late')) return true
  return mine.filter((a) => a.verdict === 'wrong').length >= attempts
}

/** When chunk k becomes readable: the moment its first word appears on screen. */
export function chunkOffsetMs(k: number): number {
  return Math.floor(((k * CHUNK_WORDS) / WORDS_PER_SECOND) * 1000)
}

/** Splits a tossup into chunks of a few words, each released when its first word would be read. */
export function chunkTossup(fullText: string): QuestionChunk[] {
  const { words } = planTossup(fullText)
  const chunks: QuestionChunk[] = []
  for (let start = 0; start < words.length; start += CHUNK_WORDS) {
    const idx = chunks.length
    chunks.push({ idx, offsetMs: chunkOffsetMs(idx), text: words.slice(start, start + CHUNK_WORDS).join(' ') })
  }
  return chunks
}

function toNewQuestion(gameId: string, settings: GameSettings, q: SourcedQuestion, idx: number): NewQuestion {
  const secret = { answer: q.answer, answerline: q.answerline, fullText: q.text, sourceNote: q.sourceNote ?? null }
  const base = { gameId, idx, category: q.category, difficulty: q.difficulty ?? null }
  if (settings.format === 'tossup') {
    const plan = planTossup(q.text)
    return { ...base, ...secret, text: '', limitMs: plan.limitMs, wordCount: plan.words.length, powerIndex: plan.powerIndex, chunks: chunkTossup(q.text) }
  }
  return { ...base, ...secret, text: q.text, limitMs: settings.timeLimitSec * 1000, wordCount: null, powerIndex: null, chunks: [] }
}

async function loadGame(deps: ServiceDeps, gameId: unknown): Promise<GameRow> {
  if (typeof gameId !== 'string') throw new GameError(400, 'gameId is missing')
  const game = await deps.store.getGame(gameId)
  if (!game) throw new GameError(404, 'This game has ended or never existed')
  return game
}

async function requirePlayer(deps: ServiceDeps, game: GameRow, userId: string): Promise<PlayerRow> {
  const player = await deps.store.getPlayer(game.id, userId)
  if (!player) throw new GameError(403, "You're not in this game")
  return player
}

function requireHost(game: GameRow, userId: string) {
  if (game.hostId !== userId) throw new GameError(403, 'Only the host can do that')
}

async function addPlayer(deps: ServiceDeps, gameId: string, userId: string, nickname: string) {
  try {
    return await deps.store.insertPlayer({ gameId, userId, nickname, score: 0, rttMs: 0, joinedAt: deps.now() }, MAX_PLAYERS)
  } catch (err) {
    if (err instanceof NicknameTakenError) throw new GameError(409, `Someone in this game is already called ${nickname}. Pick another name.`)
    if (err instanceof GameFullError) throw new GameError(409, `This game is full (${MAX_PLAYERS} players)`)
    throw err
  }
}

async function openQuestion(deps: ServiceDeps, game: GameRow, idx: number, expected: { status: GameRow['status']; currentIndex?: number }) {
  const question = await deps.store.getQuestion(game.id, idx)
  if (!question) throw new GameError(500, 'Question is missing')
  const startedAt = deps.now() + QUESTION_LEAD_MS
  return deps.store.updateGame(
    game.id,
    { status: 'question', currentIndex: idx, questionStartedAt: startedAt, questionEndsAt: startedAt + question.limitMs },
    expected,
  )
}

async function reveal(deps: ServiceDeps, game: GameRow) {
  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  if (!question) return
  // Publish the answer before the status change, so clients that react to it can read the answer.
  await deps.store.revealQuestion(question.id, { answer: question.answer, text: question.fullText, sourceNote: question.sourceNote })
  await deps.store.updateGame(game.id, { status: 'reveal' }, { status: 'question', currentIndex: game.currentIndex })
}

// ---------- actions ----------

async function create(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'create' }>) {
  const nickname = text(a.nickname, 'Name', 20)
  const settings = validateSettings(a.settings)
  const now = deps.now()
  if ((await deps.store.countGamesByHostSince(userId, now - 60 * 60 * 1000)) >= GAMES_PER_HOUR) {
    throw new GameError(429, `You can host up to ${GAMES_PER_HOUR} games an hour. Try again later.`)
  }
  for (let tries = 0; tries < 5; tries++) {
    try {
      const game = await deps.store.insertGame({
        code: randomCode(deps.random ?? Math.random),
        hostId: userId,
        status: 'lobby',
        settings,
        currentIndex: -1,
        questionCount: 0,
        questionStartedAt: null,
        questionEndsAt: null,
        createdAt: now,
      })
      const player = await addPlayer(deps, game.id, userId, nickname)
      await deps.store.setInterests(game.id, player.id, validInterests(a.interests))
      return { gameId: game.id, code: game.code, playerId: player.id }
    } catch (err) {
      if (!(err instanceof CodeTakenError)) throw err
    }
  }
  throw new GameError(503, "Couldn't create a game code. Try again.")
}

async function join(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'join' }>) {
  const code = text(a.code, 'Game code', 10).toUpperCase()
  const nickname = text(a.nickname, 'Name', 20)
  const game = await deps.store.getGameByCode(code)
  if (!game) throw new GameError(404, `No game with the code ${code}. Check the code with the host.`)

  const existing = await deps.store.getPlayer(game.id, userId)
  if (existing) return { gameId: game.id, code: game.code, playerId: existing.id }

  if (game.status !== 'lobby') throw new GameError(409, 'This game has already started')
  const player = await addPlayer(deps, game.id, userId, nickname)
  await deps.store.setInterests(game.id, player.id, validInterests(a.interests))
  return { gameId: game.id, code: game.code, playerId: player.id }
}

async function start(deps: ServiceDeps, userId: string, gameId: string) {
  const game = await loadGame(deps, gameId)
  requireHost(game, userId)
  if (!(await deps.store.updateGame(game.id, { status: 'starting' }, { status: 'lobby' }))) {
    throw new GameError(409, 'This game has already started')
  }
  let questions: SourcedQuestion[]
  try {
    questions = (await deps.loadQuestions(game.settings)).slice(0, game.settings.count)
    if (!questions.length) throw new GameError(422, 'No questions match those categories. Pick more categories.')
  } catch (err) {
    await deps.store.updateGame(game.id, { status: 'lobby' }, { status: 'starting' })
    throw err
  }
  // Interests were only needed to pick categories.
  await deps.store.deleteInterests(game.id)
  await deps.store.insertQuestions(questions.map((q, idx) => toNewQuestion(game.id, game.settings, q, idx)))
  await deps.store.updateGame(game.id, { questionCount: questions.length }, { status: 'starting' })
  await openQuestion(deps, game, 0, { status: 'starting' })
  return { questionCount: questions.length }
}

async function submit(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'submit' }>): Promise<SubmitResult> {
  const game = await loadGame(deps, a.gameId)
  const player = await requirePlayer(deps, game, userId)
  const given = text(a.answer, 'Answer', 200)
  if (game.status !== 'question' || game.questionStartedAt === null || game.questionEndsAt === null) {
    throw new GameError(409, 'There is no question open right now')
  }
  const now = deps.now()
  if (now < game.questionStartedAt) throw new GameError(409, "The question hasn't started yet")

  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  if (!question) throw new GameError(500, 'Question is missing')
  const attempts = maxAttempts(game)
  // A quick early exit; the store repeats these checks atomically when recording.
  if (playerDone(await deps.store.listAnswers(question.id), player.id, attempts)) {
    throw new GameError(409, "You've already answered this question")
  }

  const elapsedMs = Math.round(adjustedElapsed(now - game.questionStartedAt, player.rttMs))
  const late = now > game.questionEndsAt
  const verdict = late ? null : judge(question, given)
  const result: SubmitResult['result'] = late ? 'late' : verdict!.result
  const recorded = await deps.store.recordAnswer({
    gameId: game.id,
    questionId: question.id,
    playerId: player.id,
    given,
    elapsedMs,
    verdict: result,
    points: result === 'correct' || result === 'wrong' ? pointsFor(game, question, result === 'correct', elapsedMs) : 0,
    wrongPoints: pointsFor(game, question, false, elapsedMs),
    firstCorrectBonus: bonusFor(game),
    maxAttempts: attempts,
    maxSubmits: SUBMITS_PER_QUESTION,
    maxPrompts: MAX_PROMPTS,
  })
  if (!recorded.ok) {
    if (recorded.reason === 'too_many') throw new GameError(429, "You've sent too many answers for this question")
    throw new GameError(409, "You've already answered this question")
  }

  if (recorded.verdict === 'correct') {
    await deps.store.insertFeed({ gameId: game.id, playerId: player.id, nickname: player.nickname, kind: 'correct', elapsedMs, points: recorded.points })
  }

  // End the question early once everyone is done.
  const [players, latest] = await Promise.all([deps.store.listPlayers(game.id), deps.store.listAnswers(question.id)])
  if (players.every((p) => playerDone(latest, p.id, attempts))) await reveal(deps, game)

  const attemptsLeft = recorded.verdict === 'wrong' || recorded.verdict === 'prompt' ? attempts - recorded.wrongCount : 0
  return {
    result: recorded.verdict,
    points: recorded.points,
    attemptsLeft,
    promptText: recorded.verdict === 'prompt' ? verdict?.promptText : undefined,
  }
}

async function revealAction(deps: ServiceDeps, userId: string, gameId: string) {
  const game = await loadGame(deps, gameId)
  await requirePlayer(deps, game, userId)
  if (game.status !== 'question') return { status: game.status }
  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  const players = await deps.store.listPlayers(game.id)
  const answers = question ? await deps.store.listAnswers(question.id) : []
  const everyoneDone = players.every((p) => playerDone(answers, p.id, maxAttempts(game)))
  if (deps.now() < (game.questionEndsAt ?? 0) && !everyoneDone) throw new GameError(409, 'Time is not up yet')
  await reveal(deps, game)
  return { status: 'reveal' }
}

async function override(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'override' }>) {
  const game = await loadGame(deps, a.gameId)
  requireHost(game, userId)
  if (game.status !== 'reveal') throw new GameError(409, 'Answers can only be accepted after the reveal')
  const answer = typeof a.answerId === 'string' ? await deps.store.getAnswer(a.answerId) : null
  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  if (!answer || !question || answer.questionId !== question.id) throw new GameError(404, 'That answer is not from this question')
  if (answer.verdict !== 'wrong') throw new GameError(409, 'Only wrong answers can be accepted')

  // Scored at the original submission time; replacing the points also refunds a tossup penalty.
  const points = pointsFor(game, question, true, answer.elapsedMs)
  if (!(await deps.store.overrideAnswer(answer.id, points))) {
    throw new GameError(409, 'This player already got the question right')
  }
  const player = (await deps.store.listPlayers(game.id)).find((p) => p.id === answer.playerId)
  await deps.store.insertFeed({
    gameId: game.id,
    playerId: answer.playerId,
    nickname: player?.nickname ?? 'Player',
    kind: 'override',
    elapsedMs: answer.elapsedMs,
    points,
  })
  return { points }
}

async function nextAction(deps: ServiceDeps, userId: string, gameId: string) {
  const game = await loadGame(deps, gameId)
  requireHost(game, userId)
  if (game.status !== 'reveal') throw new GameError(409, 'Wait for the answer to be revealed')
  const idx = game.currentIndex + 1
  if (idx >= game.questionCount) {
    await deps.store.updateGame(game.id, { status: 'finished' }, { status: 'reveal', currentIndex: game.currentIndex })
    return { status: 'finished' }
  }
  await openQuestion(deps, game, idx, { status: 'reveal', currentIndex: game.currentIndex })
  return { status: 'question', index: idx }
}

export async function handleAction(deps: ServiceDeps, userId: string | null, raw: unknown): Promise<unknown> {
  const action = (raw ?? {}) as Action
  if (action.type === 'cleanup') {
    return { deleted: await deps.store.deleteGamesCreatedBefore(deps.now() - GAME_TTL_MS) }
  }
  if (!userId) throw new GameError(401, 'Sign in first')

  switch (action.type) {
    case 'create':
      return create(deps, userId, action)
    case 'join':
      return join(deps, userId, action)
    case 'updateSettings': {
      const game = await loadGame(deps, action.gameId)
      requireHost(game, userId)
      const settings = validateSettings(action.settings)
      if (!(await deps.store.updateGame(game.id, { settings }, { status: 'lobby' }))) {
        throw new GameError(409, 'Settings can only change before the game starts')
      }
      return { settings }
    }
    case 'ping': {
      const game = await loadGame(deps, action.gameId)
      const player = await requirePlayer(deps, game, userId)
      // Measured once in the lobby. Later pings only read the clock, so they can't
      // change anyone's timing mid-game or flood other players with updates.
      if (game.status === 'lobby' && typeof action.rttMs === 'number' && Number.isFinite(action.rttMs)) {
        const rttMs = Math.max(0, Math.min(2000, Math.round(action.rttMs)))
        if (Math.abs(rttMs - player.rttMs) > 10) await deps.store.updatePlayer(player.id, { rttMs })
      }
      return { serverNow: deps.now() }
    }
    case 'suggestions': {
      const game = await loadGame(deps, action.gameId)
      // Only the host picks categories, so only the host sees what the group shares.
      requireHost(game, userId)
      return { interests: game.status === 'lobby' ? await deps.store.sharedInterests(game.id) : [] }
    }
    case 'start':
      return start(deps, userId, action.gameId)
    case 'submit':
      return submit(deps, userId, action)
    case 'reveal':
      return revealAction(deps, userId, action.gameId)
    case 'override':
      return override(deps, userId, action)
    case 'next':
      return nextAction(deps, userId, action.gameId)
    default:
      throw new GameError(400, 'Unknown action')
  }
}
