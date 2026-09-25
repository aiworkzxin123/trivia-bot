import { displayCategory } from '../game/questions/pool.ts'
import type { SavedSettings } from './storage.ts'

interface Props {
  categories: { name: string; count: number }[]
  settings: SavedSettings
  onChange: (settings: SavedSettings) => void
  onStart: () => void
}

const COUNTS = [5, 10, 15, 20]
const TIMERS = [15, 20, 30]

export function Setup({ categories, settings, onChange, onStart }: Props) {
  const selected = new Set(settings.categories)
  const available = settings.categories.length
    ? categories.filter((c) => selected.has(c.name)).reduce((n, c) => n + c.count, 0)
    : categories.reduce((n, c) => n + c.count, 0)

  function toggle(name: string) {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange({ ...settings, categories: [...next] })
  }

  return (
    <form
      className="setup"
      onSubmit={(e) => {
        e.preventDefault()
        onStart()
      }}
    >
      <header className="setup-head">
        <h1>Trivia Bot</h1>
        <p className="lede">Type your answers. The faster you get it right, the more points you score.</p>
      </header>

      <fieldset className="field">
        <legend>
          Categories <span className="hint">{settings.categories.length ? `${settings.categories.length} chosen` : 'All categories'}</span>
        </legend>
        <div className="chips">
          <button
            type="button"
            className="chip"
            aria-pressed={settings.categories.length === 0}
            onClick={() => onChange({ ...settings, categories: [] })}
          >
            All
          </button>
          {categories.map((c) => (
            <button key={c.name} type="button" className="chip" aria-pressed={selected.has(c.name)} onClick={() => toggle(c.name)}>
              {displayCategory(c.name)} <span className="chip-count">{c.count}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field-row">
        <fieldset className="field">
          <legend>Questions</legend>
          <div className="segmented">
            {COUNTS.map((n) => (
              <button key={n} type="button" aria-pressed={settings.count === n} onClick={() => onChange({ ...settings, count: n })}>
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Time per question</legend>
          <div className="segmented">
            {TIMERS.map((s) => (
              <button key={s} type="button" aria-pressed={settings.timeLimitSec === s} onClick={() => onChange({ ...settings, timeLimitSec: s })}>
                {s}s
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="start-row">
        <button type="submit" className="primary" disabled={available === 0}>
          Start game
        </button>
        <span className="hint">{available.toLocaleString()} questions available</span>
      </div>

      <section className="rules" aria-label="Scoring">
        <h2>Scoring</h2>
        <ul>
          <li>A correct answer scores 1000 points, falling to 500 at the time limit.</li>
          <li>You get 2 tries per question. Small typos are fine.</li>
          <li>If an answer is only partly right, you'll be asked to be more specific.</li>
          <li>If you think a rejected answer was right, you can count it yourself.</li>
        </ul>
      </section>
    </form>
  )
}
