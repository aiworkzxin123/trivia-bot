import { displayCategory } from '../../game/questions/pool.ts'
import { TOSSUP_CATEGORIES } from '../../game/questions/sources.ts'
import { CategoryPicker } from '../parts.tsx'
import type { SavedSettings } from './storage.ts'

interface Props {
  categories: { name: string; count: number }[]
  settings: SavedSettings
  onChange: (settings: SavedSettings) => void
  onStart: () => void
  busy: boolean
  error: string | null
}

const COUNTS = [5, 10, 15, 20]
const TIMERS = [15, 20, 30]

export function Setup({ categories, settings, onChange, onStart, busy, error }: Props) {
  const tossup = settings.format === 'tossup'
  const chosen = new Set(settings.categories)
  const available = (settings.categories.length ? categories.filter((c) => chosen.has(c.name)) : categories).reduce((n, c) => n + c.count, 0)

  return (
    <form
      className="setup"
      onSubmit={(e) => {
        e.preventDefault()
        onStart()
      }}
    >
      <header className="setup-head">
        <a className="back" href="#/">
          ← Home
        </a>
        <h1>Play solo</h1>
        <p className="lede">Type your answers. The faster you get it right, the more points you score.</p>
      </header>

      <fieldset className="field">
        <legend>Format</legend>
        <div className="segmented">
          <button type="button" aria-pressed={!tossup} onClick={() => onChange({ ...settings, format: 'classic' })}>
            Classic
          </button>
          <button type="button" aria-pressed={tossup} onClick={() => onChange({ ...settings, format: 'tossup' })}>
            Quiz bowl tossups
          </button>
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>
          Categories{' '}
          <span className="hint">
            {(tossup ? settings.tossupCategories : settings.categories).length
              ? `${(tossup ? settings.tossupCategories : settings.categories).length} chosen`
              : 'All categories'}
          </span>
        </legend>
        {tossup ? (
          <CategoryPicker
            options={TOSSUP_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
            selected={settings.tossupCategories}
            onChange={(tossupCategories) => onChange({ ...settings, tossupCategories })}
          />
        ) : (
          <CategoryPicker
            options={categories.map((c) => ({ id: c.name, label: displayCategory(c.name), count: c.count }))}
            selected={settings.categories}
            onChange={(selected) => onChange({ ...settings, categories: selected })}
          />
        )}
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
        {tossup ? (
          <fieldset className="field">
            <legend>Difficulty</legend>
            <div className="segmented">
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={settings.difficulty === d} onClick={() => onChange({ ...settings, difficulty: d })}>
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
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
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="start-row">
        <button type="submit" className="primary" disabled={busy || (!tossup && available === 0)}>
          {busy ? 'Getting questions…' : 'Start game'}
        </button>
        {!tossup && <span className="hint">{available.toLocaleString()} questions available</span>}
      </div>

      <section className="rules" aria-label="Scoring">
        <h2>Scoring</h2>
        {tossup ? (
          <ul>
            <li>Real quiz bowl questions appear word by word. Answer as soon as you know it.</li>
            <li>A correct answer scores up to 1000, falling as more of the question is shown.</li>
            <li>Answer before the power mark for +200. A wrong answer costs 50, and you get 1 try.</li>
            <li>If you think a rejected answer was right, you can count it yourself.</li>
          </ul>
        ) : (
          <ul>
            <li>A correct answer scores 1000 points, falling to 500 at the time limit.</li>
            <li>You get 2 tries per question. Small typos are fine.</li>
            <li>If an answer is only partly right, you'll be asked to be more specific.</li>
            <li>If you think a rejected answer was right, you can count it yourself.</li>
          </ul>
        )}
      </section>
    </form>
  )
}
