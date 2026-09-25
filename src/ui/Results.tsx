import type { GameState } from '../game/engine.ts'

interface Props {
  game: GameState
  onPlayAgain: () => void
  onChangeSettings: () => void
}

const VERDICT_LABEL = {
  correct: 'Correct',
  overridden: 'Counted',
  wrong: 'Wrong',
  timeout: "Time's up",
} as const

export function Results({ game, onPlayAgain, onChangeSettings }: Props) {
  const correct = game.results.filter((r) => r.verdict === 'correct' || r.verdict === 'overridden')
  const times = correct.map((r) => r.elapsedMs ?? 0)
  const average = times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : null
  const best = game.questions.length * (game.settings.scoring?.maxPoints ?? 1000)

  return (
    <div className="results">
      <header className="results-head">
        <p className="eyebrow">Final score</p>
        <p className="final">{game.score.toLocaleString()}</p>
        <p className="lede">
          {correct.length} of {game.questions.length} correct
          {average !== null && ` · ${average.toFixed(1)}s average`} · best possible {best.toLocaleString()}
        </p>
      </header>

      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Question</th>
              <th scope="col">Answer</th>
              <th scope="col" className="num">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {game.results.map((r, i) => {
              const q = game.questions[i]
              return (
                <tr key={r.questionId}>
                  <td className="num">{i + 1}</td>
                  <td>
                    {q.text}
                    <span className={`pill ${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                  </td>
                  <td>{q.answer}</td>
                  <td className="num">{r.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="start-row">
        <button type="button" className="primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="ghost" onClick={onChangeSettings}>
          Change categories
        </button>
      </div>
    </div>
  )
}
