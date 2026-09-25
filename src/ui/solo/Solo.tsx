import { useEffect, useState } from 'react'
import { next, override, questionLimitMs, startGame, submit, timeout, type GameState, type Question } from '../../game/engine.ts'
import { loadQuestions, pickQuestions, type QuestionFile } from '../../game/questions/pool.ts'
import { fetchTossups } from '../../game/questions/sources.ts'
import { TOSSUP_ATTEMPTS } from '../../game/tossup.ts'
import { Play } from './Play.tsx'
import { Results } from './Results.tsx'
import { Setup } from './Setup.tsx'
import { loadSeen, loadSettings, markSeen, saveSettings, type SavedSettings } from './storage.ts'

const CLASSIC_ATTEMPTS = 2

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

export function Solo() {
  const [data, setData] = useState<QuestionFile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<SavedSettings>(loadSettings)
  const [game, setGame] = useState<GameState | null>(null)
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const now = useClock(game?.phase === 'question')

  useEffect(() => {
    loadQuestions().then(setData, (e: Error) => setLoadError(e.message))
  }, [])

  // Close the question when time runs out (20ms late, so the engine always sees the limit passed).
  const deadline = game?.phase === 'question' ? game.questionStartedAt + questionLimitMs(game) : null
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

  async function start() {
    if (!data) return
    setStartError(null)
    if (settings.format === 'classic') {
      const questions = pickQuestions(data.questions, settings, loadSeen())
      markSeen(questions.map((q) => q.id))
      setGame(startGame(questions, { timeLimitMs: settings.timeLimitSec * 1000, attempts: CLASSIC_ATTEMPTS }, performance.now()))
      return
    }
    setBusy(true)
    try {
      const sourced = await fetchTossups(settings.tossupCategories, settings.count, settings.difficulty)
      if (!sourced.length) throw new Error('No tossups match those categories. Pick more categories.')
      const questions: Question[] = sourced.map((q, i) => ({ ...q, id: `t${i}` }))
      setGame(startGame(questions, { format: 'tossup', timeLimitMs: 0, attempts: TOSSUP_ATTEMPTS }, performance.now()))
    } catch (err) {
      setStartError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <p className="notice" role="alert">
        {loadError}, then reload the page.
      </p>
    )
  }
  if (!data) return <p className="notice">Loading questions…</p>
  if (!game) {
    return <Setup categories={data.categories} settings={settings} onChange={changeSettings} onStart={start} busy={busy} error={startError} />
  }
  if (game.phase === 'finished') return <Results game={game} onPlayAgain={start} onChangeSettings={() => setGame(null)} />
  return (
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
