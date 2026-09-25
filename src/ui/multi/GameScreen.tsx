/** A multiplayer game, from lobby to final leaderboard. */
import { useEffect, useRef, useState } from 'react'
import { suggestCategories } from '../../game/interests.ts'
import { OPENTDB_CATEGORIES } from '../../game/questions/categories.ts'
import { displayCategory } from '../../game/questions/pool.ts'
import { TOSSUP_CATEGORIES } from '../../game/questions/sources.ts'
import { TOSSUP_ATTEMPTS } from '../../game/tossup.ts'
import { absoluteUrl } from '../../lib/router.ts'
import { callGame } from '../../lib/supabase.ts'
import { useGame, type LiveGame } from '../../lib/useGame.ts'
import { CLASSIC_ATTEMPTS, type SubmitResult } from '../../server/service.ts'
import type { AnswerRow, GameSettings } from '../../server/types.ts'
import { capitalize, seconds } from '../../lib/format.ts'
import { CategoryPicker, Leaderboard, SharePanel, TossupText } from '../parts.tsx'

const COUNTS = [5, 10, 15, 20]
const TIMERS = [15, 20, 30]

function useTicker(active: boolean, ms = 100) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [active, ms])
}

function categoryOptions(format: GameSettings['format']) {
  return format === 'tossup'
    ? TOSSUP_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))
    : OPENTDB_CATEGORIES.map((c) => ({ id: c, label: displayCategory(c) }))
}

function categoryLabel(format: GameSettings['format'], id: string) {
  return format === 'tossup' ? id : displayCategory(id)
}

export function GameScreen({ gameId }: { gameId: string }) {
  const live = useGame(gameId)

  if (live.loading) return <p className="notice">Loading game…</p>
  if (live.error || !live.game) {
    return (
      <div className="notice">
        <p>{live.error ?? 'This game could not be loaded.'}</p>
        <a href="#/">Back to home</a>
      </div>
    )
  }
  if (!live.me) {
    return (
      <div className="notice">
        <p>You're not in this game.</p>
        <a href={`#/join/${live.game.code}`}>Join with code {live.game.code}</a>
      </div>
    )
  }

  switch (live.game.status) {
    case 'lobby':
    case 'starting':
      return <Lobby live={live} />
    case 'question':
      return <LiveQuestion key={live.game.currentIndex} live={live} />
    case 'reveal':
      return <Reveal live={live} />
    case 'finished':
      return <Finished live={live} />
  }
}

function Lobby({ live }: { live: LiveGame }) {
  const game = live.game!
  const isHost = game.hostId === live.userId
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const settings = game.settings
  const suggested = suggestCategories(live.sharedInterests, settings.format)

  async function update(patch: Partial<GameSettings>) {
    setError(null)
    try {
      await callGame({ type: 'updateSettings', gameId: game.id, settings: { ...settings, ...patch } })
      live.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function start() {
    setStarting(true)
    setError(null)
    try {
      await callGame({ type: 'start', gameId: game.id })
      live.refresh()
    } catch (err) {
      setError((err as Error).message)
      setStarting(false)
    }
  }

  return (
    <div className="lobby">
      <SharePanel code={game.code} url={absoluteUrl({ name: 'join', code: game.code })} />

      <section className="panel" aria-labelledby="players-title">
        <h2 id="players-title">
          Players <span className="hint">{live.players.length}</span>
        </h2>
        <ul className="player-list">
          {live.players.map((p) => (
            <li key={p.id}>
              {p.nickname}
              {p.userId === game.hostId && <span className="badge">host</span>}
              {p.id === live.me?.id && <span className="you">you</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="settings-title">
        <h2 id="settings-title">Game settings</h2>
        {!isHost && <p className="hint">The host picks these. The game starts when they're ready.</p>}
        <div className="field">
          <span className="field-label">Format</span>
          <div className="segmented">
            <button type="button" aria-pressed={settings.format === 'classic'} disabled={!isHost} onClick={() => update({ format: 'classic', categories: [] })}>
              Classic
            </button>
            <button type="button" aria-pressed={settings.format === 'tossup'} disabled={!isHost} onClick={() => update({ format: 'tossup', categories: [] })}>
              Quiz bowl tossups
            </button>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Categories</span>
          <CategoryPicker
            options={categoryOptions(settings.format)}
            selected={settings.categories}
            suggested={suggested}
            onChange={(categories) => update({ categories })}
            disabled={!isHost}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <span className="field-label">Questions</span>
            <div className="segmented">
              {COUNTS.map((n) => (
                <button key={n} type="button" aria-pressed={settings.count === n} disabled={!isHost} onClick={() => update({ count: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {settings.format === 'classic' ? (
            <div className="field">
              <span className="field-label">Time per question</span>
              <div className="segmented">
                {TIMERS.map((s) => (
                  <button key={s} type="button" aria-pressed={settings.timeLimitSec === s} disabled={!isHost} onClick={() => update({ timeLimitSec: s })}>
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field">
              <span className="field-label">Difficulty</span>
              <div className="segmented">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button key={d} type="button" aria-pressed={settings.difficulty === d} disabled={!isHost} onClick={() => update({ difficulty: d })}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {isHost ? (
        <div className="start-row">
          <button type="button" className="primary" onClick={start} disabled={starting || game.status === 'starting'}>
            {starting || game.status === 'starting' ? 'Getting questions…' : 'Start game'}
          </button>
          <span className="hint">Everyone in the lobby plays. People can't join after the start.</span>
        </div>
      ) : (
        <p className="waiting">{game.status === 'starting' ? 'Getting questions…' : 'Waiting for the host to start…'}</p>
      )}
    </div>
  )
}

function attemptsFor(live: LiveGame) {
  return live.game!.settings.format === 'tossup' ? TOSSUP_ATTEMPTS : CLASSIC_ATTEMPTS
}

function isDone(mine: AnswerRow[], attempts: number) {
  return mine.some((a) => ['correct', 'overridden', 'late'].includes(a.verdict)) || mine.filter((a) => a.verdict === 'wrong').length >= attempts
}

function LiveQuestion({ live }: { live: LiveGame }) {
  const game = live.game!
  const question = live.question
  const isHost = game.hostId === live.userId
  const [feedback, setFeedback] = useState<(SubmitResult & { given: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const revealRequested = useRef(false)
  const { serverNow, refresh } = live
  useTicker(true)

  const now = live.serverNow()
  const startedAt = game.questionStartedAt ?? now
  const endsAt = game.questionEndsAt ?? now
  const elapsed = now - startedAt
  const attempts = attemptsFor(live)
  const mine = live.answers.filter((a) => a.playerId === live.me?.id)
  const done = isDone(mine, attempts)
  const wrongSoFar = mine.filter((a) => a.verdict === 'wrong').length

  // Close the question when time is up. The host asks first; others follow in case the host has left.
  useEffect(() => {
    const delay = endsAt - serverNow() + (isHost ? 150 : 2500)
    const id = setTimeout(() => {
      if (revealRequested.current) return
      revealRequested.current = true
      callGame({ type: 'reveal', gameId: game.id }).then(refresh, () => {
        revealRequested.current = false
      })
    }, Math.max(0, delay))
    return () => clearTimeout(id)
  }, [endsAt, game.id, isHost, serverNow, refresh])

  async function submit(answer: string) {
    setSending(true)
    setError(null)
    try {
      const result = await callGame<SubmitResult>({ type: 'submit', gameId: game.id, answer })
      setFeedback({ ...result, given: answer })
      live.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const header = (
    <div className="play-bar">
      <span className="progress">
        Question <b>{game.currentIndex + 1}</b> of {game.questionCount}
      </span>
      <span className="score" aria-label="Your score">
        {(live.me?.score ?? 0).toLocaleString()} <small>pts</small>
      </span>
    </div>
  )

  if (elapsed < 0 || !question) {
    return (
      <div className="play">
        {header}
        <div className="card get-ready">
          <p className="eyebrow">Get ready</p>
          <p className="countdown">{Math.max(1, Math.ceil(-elapsed / 1000))}</p>
        </div>
      </div>
    )
  }

  const remaining = Math.max(0, endsAt - now)
  const isTossup = game.settings.format === 'tossup'
  const feed = live.feed.filter((f) => f.createdAt >= startedAt - 5000).reverse()

  return (
    <div className="play">
      {header}
      <div className="timer" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={question.limitMs / 1000} aria-valuenow={Math.ceil(remaining / 1000)}>
        <div className="timer-fill" style={{ transform: `scaleX(${remaining / question.limitMs})` }} />
      </div>
      <article className="card">
        <div className="card-meta">
          <span className="tag">{categoryLabel(game.settings.format, question.category)}</span>
          {question.difficulty && !isTossup && <span className={`tag diff-${question.difficulty}`}>{question.difficulty}</span>}
          <span className="clock">{Math.ceil(remaining / 1000)}s</span>
        </div>
        {isTossup ? <TossupText text={question.text} elapsedMs={elapsed} complete={done} /> : <h2 className="question">{question.text}</h2>}

        {done ? (
          <p className="waiting">
            {mine.some((a) => a.verdict === 'correct') ? `Correct! +${mine.find((a) => a.verdict === 'correct')!.points}. ` : ''}
            {mine.some((a) => a.verdict === 'late') ? "Too late for that one. " : ''}
            Waiting for the others…
          </p>
        ) : (
          <>
            <AnswerBox key={`${mine.length}`} onSubmit={submit} disabled={sending} />
            <p className={`feedback ${feedback?.result === 'prompt' ? 'prompt' : feedback?.result === 'wrong' ? 'wrong' : ''}`} role="status" aria-live="polite">
              {feedback?.result === 'wrong' && `“${feedback.given}” isn't right. ${attempts - wrongSoFar} ${attempts - wrongSoFar === 1 ? 'try' : 'tries'} left.`}
              {feedback?.result === 'prompt' && `“${feedback.given}” is close. ${feedback.promptText ? capitalize(feedback.promptText) : 'Can you be more specific?'}`}
              {(!feedback || feedback.result === 'correct' || feedback.result === 'late') &&
                `${attempts - wrongSoFar} ${attempts - wrongSoFar === 1 ? 'try' : 'tries'}${isTossup ? ', −50 if wrong' : ''}`}
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </article>

      <section className="feed" aria-label="Live feed" aria-live="polite">
        {feed.length === 0 ? (
          <p className="hint">Nobody has it yet.</p>
        ) : (
          <ul>
            {feed.map((f) => (
              <li key={f.id}>
                ⚡ <b>{f.nickname}</b> got it <span className="hint">({seconds(f.elapsedMs)}s)</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AnswerBox({ onSubmit, disabled }: { onSubmit: (answer: string) => void; disabled: boolean }) {
  const [answer, setAnswer] = useState('')
  return (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (answer.trim()) onSubmit(answer)
      }}
    >
      <label htmlFor="answer" className="visually-hidden">
        Your answer
      </label>
      <input
        id="answer"
        autoFocus
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
        maxLength={200}
      />
      <button type="submit" className="primary" disabled={disabled || !answer.trim()}>
        Answer
      </button>
    </form>
  )
}

const VERDICT_LABEL: Record<AnswerRow['verdict'], string> = {
  correct: 'Correct',
  overridden: 'Accepted by host',
  wrong: 'Wrong',
  prompt: 'Asked for more',
  late: 'Too late',
}

function Reveal({ live }: { live: LiveGame }) {
  const game = live.game!
  const question = live.question
  const isHost = game.hostId === live.userId
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nextRef = useRef<HTMLButtonElement>(null)
  const last = game.currentIndex + 1 >= game.questionCount

  useEffect(() => {
    nextRef.current?.focus()
  }, [])

  async function act(action: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await callGame({ ...action, gameId: game.id })
      live.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const gains = new Map<string, number>()
  for (const a of live.answers) gains.set(a.playerId, (gains.get(a.playerId) ?? 0) + a.points)
  const byPlayer = live.players.map((p) => ({ player: p, answers: live.answers.filter((a) => a.playerId === p.id && a.verdict !== 'prompt') }))

  return (
    <div className="play">
      <div className="play-bar">
        <span className="progress">
          Question <b>{game.currentIndex + 1}</b> of {game.questionCount}
        </span>
      </div>
      <article className="card">
        {question && (
          <>
            <div className="card-meta">
              <span className="tag">{categoryLabel(game.settings.format, question.category)}</span>
            </div>
            {game.settings.format === 'tossup' ? <TossupText text={question.text} elapsedMs={0} complete /> : <h2 className="question">{question.text}</h2>}
            <p className="answer-line big">
              <span className="label">Answer</span> {question.revealedAnswer}
            </p>
            {question.sourceNote && <p className="hint">From {question.sourceNote}, via QBReader.</p>}
          </>
        )}
        <div className="answers-list">
          {byPlayer.map(({ player, answers }) => {
            const gotIt = answers.some((a) => a.verdict === 'correct' || a.verdict === 'overridden')
            return (
              <div key={player.id} className="answer-row">
                <span className="name">{player.nickname}</span>
                <span className="given">
                  {answers.length === 0 && <span className="hint">No answer</span>}
                  {answers.map((a) => (
                    <span key={a.id} className="given-item">
                      “{a.given}” <span className={`pill ${a.verdict}`}>{VERDICT_LABEL[a.verdict]}</span>
                      {a.points !== 0 && <span className="hint"> {a.points > 0 ? `+${a.points}` : a.points}</span>}
                      {isHost && a.verdict === 'wrong' && !gotIt && (
                        <button type="button" className="chip-link" disabled={busy} onClick={() => act({ type: 'override', answerId: a.id })}>
                          Accept
                        </button>
                      )}
                    </span>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="reveal-actions">
          {isHost ? (
            <button ref={nextRef} type="button" className="primary" disabled={busy} onClick={() => act({ type: 'next' })}>
              {last ? 'See final results' : 'Next question'}
            </button>
          ) : (
            <p className="waiting">Waiting for the host…</p>
          )}
        </div>
      </article>
      <section className="panel">
        <h2>Leaderboard</h2>
        <Leaderboard players={live.players} meId={live.me?.id} highlight={gains} />
      </section>
    </div>
  )
}

function Finished({ live }: { live: LiveGame }) {
  const ranked = [...live.players].sort((a, b) => b.score - a.score)
  const winner = ranked[0]
  return (
    <div className="results">
      <header className="results-head">
        <p className="eyebrow">Game over</p>
        <h1 className="winner">{winner ? `${winner.nickname} wins` : 'Game over'}</h1>
        {winner && <p className="final">{winner.score.toLocaleString()}</p>}
      </header>
      <Leaderboard players={live.players} meId={live.me?.id} />
      <div className="start-row">
        <a className="primary button-link" href="#/host">
          Host another game
        </a>
        <a className="ghost button-link" href="#/">
          Home
        </a>
      </div>
    </div>
  )
}

