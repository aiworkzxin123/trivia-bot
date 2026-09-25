/** Small pieces shared by the solo and multiplayer screens. */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { INTERESTS } from '../game/interests.ts'
import { planTossup, wordsRevealed } from '../game/tossup.ts'
import type { PlayerRow } from '../server/types.ts'

export interface CategoryOption {
  id: string
  label: string
  count?: number
}

export function CategoryPicker({
  options,
  selected,
  suggested = [],
  onChange,
  disabled = false,
}: {
  options: CategoryOption[]
  selected: string[]
  suggested?: string[]
  onChange?: (selected: string[]) => void
  disabled?: boolean
}) {
  const chosen = new Set(selected)
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange?.([...next])
  }
  const shownSuggestions = suggested.filter((s) => options.some((o) => o.id === s))
  return (
    <div className="picker">
      {shownSuggestions.length > 0 && (
        <div className="suggestions">
          <span className="suggest-label">Suggested for this group</span>
          <div className="chips">
            {shownSuggestions.map((id) => (
              <button key={id} type="button" className="chip suggested" aria-pressed={chosen.has(id)} onClick={() => toggle(id)} disabled={disabled}>
                ★ {options.find((o) => o.id === id)!.label}
              </button>
            ))}
            {!disabled && shownSuggestions.some((s) => !chosen.has(s)) && (
              <button type="button" className="chip-link" onClick={() => onChange?.([...new Set([...selected, ...shownSuggestions])])}>
                Add all suggestions
              </button>
            )}
          </div>
        </div>
      )}
      <div className="chips">
        <button type="button" className="chip" aria-pressed={selected.length === 0} onClick={() => onChange?.([])} disabled={disabled}>
          All
        </button>
        {options.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={chosen.has(o.id)} onClick={() => toggle(o.id)} disabled={disabled}>
            {o.label}
            {o.count !== undefined && <span className="chip-count">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export function InterestPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const chosen = new Set(selected)
  return (
    <fieldset className="field">
      <legend>
        Your interests <span className="hint">Optional. Used to suggest categories. Deleted when the game ends.</span>
      </legend>
      <div className="chips">
        {INTERESTS.map((i) => (
          <button
            key={i.id}
            type="button"
            className="chip"
            aria-pressed={chosen.has(i.id)}
            onClick={() => onChange(chosen.has(i.id) ? selected.filter((x) => x !== i.id) : [...selected, i.id])}
          >
            {i.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Invite link, QR code and share button for a game code. */
export function SharePanel({ code, url }: { code: string; url: string }) {
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#121a23', light: '#ffffff' } }).then(setQr, () => setQr(null))
  }, [url])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Join my Trivia Bot game', text: `Join my trivia game with code ${code}`, url })
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }

  return (
    <section className="share" aria-label="Invite players">
      <div className="share-code">
        <span className="eyebrow">Game code</span>
        <span className="code" aria-label={`Game code ${code.split('').join(' ')}`}>
          {code}
        </span>
        <span className="hint">Players can scan the QR code, open the link, or enter the code on the home screen.</span>
        <div className="share-actions">
          {'share' in navigator && (
            <button type="button" className="primary" onClick={share}>
              Share invite
            </button>
          )}
          <button type="button" className="ghost" onClick={copy}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
        <p className="hint share-tip">For Instagram or Strava, share the link to a Story, DM or post, or show this QR code.</p>
      </div>
      {qr && <img className="qr" src={qr} alt={`QR code that opens the invite link for game ${code}`} width={180} height={180} />}
    </section>
  )
}

/** Tossup text revealed word by word as time passes. */
export function TossupText({ text, elapsedMs, complete }: { text: string; elapsedMs: number; complete: boolean }) {
  const plan = planTossup(text)
  const shown = complete ? plan.words.length : wordsRevealed(plan, elapsedMs)
  const inPower = plan.powerIndex !== null && shown <= plan.powerIndex
  return (
    <div className="tossup">
      <p className="question tossup-text" aria-live="off">
        {plan.words.slice(0, shown).join(' ')}
        {!complete && shown < plan.words.length && <span className="cursor" aria-hidden="true" />}
      </p>
      {!complete && (
        <p className={`power-state ${inPower ? 'on' : ''}`}>{inPower ? 'Power: answer now for a +200 bonus' : 'Past the power mark'}</p>
      )}
    </div>
  )
}

export function Leaderboard({ players, meId, highlight }: { players: PlayerRow[]; meId?: string; highlight?: Map<string, number> }) {
  const ranked = [...players].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
  return (
    <ol className="leaderboard">
      {ranked.map((p, i) => {
        const gained = highlight?.get(p.id)
        return (
          <li key={p.id} className={p.id === meId ? 'me' : undefined}>
            <span className="rank">{i + 1}</span>
            <span className="name">
              {p.nickname}
              {p.id === meId && <span className="you">you</span>}
            </span>
            {gained !== undefined && gained !== 0 && <span className={`gain ${gained < 0 ? 'neg' : ''}`}>{gained > 0 ? `+${gained}` : gained}</span>}
            <span className="pts">{p.score.toLocaleString()}</span>
          </li>
        )
      })}
    </ol>
  )
}
