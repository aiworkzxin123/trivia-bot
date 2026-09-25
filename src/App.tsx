import { useEffect, useState } from 'react'
import { next, override, startGame, submit, timeout, type GameState } from './game/engine.ts'
import { loadQuestions, pickQuestions, type QuestionFile } from './game/questions/pool.ts'
import { Play } from './ui/Play.tsx'
import { Results } from './ui/Results.tsx'
import { Setup } from './ui/Setup.tsx'
import { loadSeen, loadSettings, markSeen, saveSettings, type SavedSettings } from './ui/storage.ts'

const ATTEMPTS = 2

/** Re-renders every 100ms while active, returning a monotonic clock in ms. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [active])
  return now
}

export default function App() {
  const [data, setData] = useState<QuestionFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<SavedSettings>(loadSettings)
  const [game, setGame] = useState<GameState | null>(null)
  const now = useClock(game?.phase === 'question')

  useEffect(() => {
    loadQuestions().then(setData, (e: Error) => setError(e.message))
  }, [])

  // Close the question when time runs out (20ms late, so the engine always sees the limit passed).
  const deadline = game?.phase === 'question' ? game.questionStartedAt + game.settings.timeLimitMs : null
  useEffect(() => {
    if (deadline === null) return
    const id = setTimeout(() => setGame((g) => g && timeout(g, performance.now())), deadline - performance.now() + 20)
    return () => clearTimeout(id)
  }, [deadline])

  // Let Enter move on from the reveal, even when focus has left the Next button.
  useEffect(() => {
    if (game?.phase !== 'reveal') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) setGame((g) => g && next(g, performance.now()))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game?.phase])

  function changeSettings(s: SavedSettings) {
    setSettings(s)
    saveSettings(s)
  }

  function start() {
    if (!data) return
    const questions = pickQuestions(data.questions, settings, loadSeen())
    markSeen(questions.map((q) => q.id))
    setGame(startGame(questions, { timeLimitMs: settings.timeLimitSec * 1000, attempts: ATTEMPTS }, performance.now()))
  }

  let screen
  if (error) {
    screen = (
      <p className="notice" role="alert">
        {error}, then reload the page.
      </p>
    )
  } else if (!data) {
    screen = <p className="notice">Loading questions…</p>
  } else if (!game) {
    screen = <Setup categories={data.categories} settings={settings} onChange={changeSettings} onStart={start} />
  } else if (game.phase === 'finished') {
    screen = <Results game={game} onPlayAgain={start} onChangeSettings={() => setGame(null)} />
  } else {
    screen = (
      <Play
        game={game}
        now={now}
        onSubmit={(answer) => setGame(submit(game, answer, performance.now()))}
        onOverride={() => setGame(override(game))}
        onNext={() => setGame(next(game, performance.now()))}
        onQuit={() => setGame(null)}
      />
    )
  }

  return (
    <div className="app">
      <main>{screen}</main>
      <footer className="credits">
        Questions from <a href="https://opentdb.com">Open Trivia DB</a>, licensed{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Answer checking by{' '}
        <a href="https://github.com/qbreader/qb-answer-checker">qb-answer-checker</a>.
      </footer>
    </div>
  )
}
