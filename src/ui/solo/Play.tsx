import { useEffect, useRef, useState } from 'react'
import { questionLimitMs, type GameState } from '../../game/engine.ts'
import { displayCategory } from '../../game/questions/pool.ts'
import { capitalize, seconds } from '../../lib/format.ts'
import { planTossup } from '../../game/tossup.ts'
import { TossupText } from '../parts.tsx'

interface Props {
  game: GameState
  now: number
  onSubmit: (answer: string) => void
  onOverride: () => void
  onNext: () => void
  onQuit: () => void
}

export function Play({ game, now, onSubmit, onOverride, onNext, onQuit }: Props) {
  const nextRef = useRef<HTMLButtonElement>(null)
  const question = game.questions[game.index]
  const limit = questionLimitMs(game)
  const tossup = game.settings.format === 'tossup'
  const remaining = Math.max(0, limit - (now - game.questionStartedAt))
  const result = game.phase === 'reveal' ? game.results[game.results.length - 1] : null

  useEffect(() => {
    if (game.phase === 'reveal') nextRef.current?.focus()
  }, [game.phase])

  return (
    <div className="play">
      <div className="play-bar">
        <span className="progress">
          Question <b>{game.index + 1}</b> of {game.questions.length}
        </span>
        <span className="score" aria-label="Score">
          {game.score.toLocaleString()} <small>pts</small>
        </span>
      </div>

      <div
        className="timer"
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={limit / 1000}
        aria-valuenow={Math.ceil(remaining / 1000)}
      >
        <div className="timer-fill" style={{ transform: `scaleX(${game.phase === 'question' ? remaining / limit : 0})` }} />
      </div>

      <article className="card">
        <div className="card-meta">
          <span className="tag">{displayCategory(question.category)}</span>
          {question.difficulty && !tossup && <span className={`tag diff-${question.difficulty}`}>{question.difficulty}</span>}
          {game.phase === 'question' && <span className="clock">{Math.ceil(remaining / 1000)}s</span>}
        </div>
        {tossup ? (
          <TossupText {...planTossup(question.text)} elapsedMs={now - game.questionStartedAt} complete={game.phase !== 'question'} />
        ) : (
          <h2 className="question">{question.text}</h2>
        )}

        {game.phase === 'question' && (
          // A new key per question and attempt gives a fresh, focused, empty box.
          <AnswerForm key={`${game.index}-${game.given.length}`} onSubmit={onSubmit} />
        )}

        {game.phase === 'question' && (
          <p className={`feedback ${game.feedback ?? ''}`} role="status" aria-live="polite">
            {game.feedback === 'wrong' && `“${game.given[game.given.length - 1]}” isn't right. ${tries(game.attemptsLeft)} left.`}
            {game.feedback === 'prompt' &&
              `“${game.given[game.given.length - 1]}” is close. ${game.promptText ? capitalize(game.promptText) : 'Can you be more specific?'}`}
            {!game.feedback && `${tries(game.attemptsLeft)}${tossup ? ', −50 if wrong' : ''}`}
          </p>
        )}

        {result && (
          <div className={`reveal ${result.verdict}`}>
            <p className="verdict">
              {result.verdict === 'correct' && 'Correct'}
              {result.verdict === 'overridden' && 'Counted as correct'}
              {result.verdict === 'wrong' && 'Not this time'}
              {result.verdict === 'timeout' && "Time's up"}
            </p>
            <p className="answer-line">
              <span className="label">Answer</span> {question.answer}
            </p>
            {question.sourceNote && <p className="hint">From {question.sourceNote}, via QBReader.</p>}
            {result.given.length > 0 && (
              <p className="answer-line">
                <span className="label">You said</span> {result.given.join(' · ')}
              </p>
            )}
            <p className="points">
              {result.points > 0 ? `+${result.points}` : result.points}
              {result.elapsedMs !== null && result.points > 0 && <small> in {seconds(result.elapsedMs)}s</small>}
            </p>
            <div className="reveal-actions">
              <button ref={nextRef} type="button" className="primary" onClick={onNext}>
                {game.index + 1 < game.questions.length ? 'Next question' : 'See results'}
              </button>
              {(result.verdict === 'wrong' || result.verdict === 'timeout') &&
                result.elapsedMs !== null &&
                result.elapsedMs <= limit && (
                  <button type="button" className="ghost" onClick={onOverride}>
                    I was right, count it
                  </button>
                )}
            </div>
          </div>
        )}
      </article>

      <button type="button" className="quit" onClick={onQuit}>
        Quit game
      </button>
    </div>
  )
}


function tries(n: number) {
  return `${n} ${n === 1 ? 'try' : 'tries'}`
}

function AnswerForm({ onSubmit }: { onSubmit: (answer: string) => void }) {
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
      />
      <button type="submit" className="primary" disabled={!answer.trim()}>
        Answer
      </button>
    </form>
  )
}
