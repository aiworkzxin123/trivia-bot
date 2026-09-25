/** Home, host and join screens. */
import { useEffect, useRef, useState } from 'react'
import type { GameFormat } from '../../game/interests.ts'
import { navigate } from '../../lib/router.ts'
import { callGame, ensureSignedIn, multiplayerEnabled, turnstileSiteKey } from '../../lib/supabase.ts'
import { InterestPicker } from '../parts.tsx'

const NAME_KEY = 'triviabot.nickname'

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Not saved; the player types it again next time.
  }
}

export function Home() {
  const [code, setCode] = useState('')
  return (
    <div className="home">
      <header className="setup-head">
        <h1>Trivia Bot</h1>
        <p className="lede">Type-your-answer trivia with competition questions. The faster you get it right, the more points you score.</p>
      </header>

      <div className="modes">
        <a className="mode" href="#/solo">
          <span className="mode-title">Play solo</span>
          <span className="hint">Practice on your own. Classic questions or quiz bowl tossups.</span>
        </a>
        <a className={`mode ${multiplayerEnabled ? '' : 'off'}`} href={multiplayerEnabled ? '#/host' : undefined} aria-disabled={!multiplayerEnabled}>
          <span className="mode-title">Host a game</span>
          <span className="hint">Get a code and invite your Instagram or Strava followers with a link.</span>
        </a>
        <form
          className={`mode ${multiplayerEnabled ? '' : 'off'}`}
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) navigate({ name: 'join', code: code.trim().toUpperCase() })
          }}
        >
          <label className="mode-title" htmlFor="home-code">
            Join a game
          </label>
          <div className="code-row">
            <input
              id="home-code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={!multiplayerEnabled}
            />
            <button type="submit" className="primary" disabled={!multiplayerEnabled || code.trim().length < 5}>
              Join
            </button>
          </div>
        </form>
      </div>
      {!multiplayerEnabled && <p className="notice-inline">Multiplayer isn't switched on for this site yet. Solo play works.</p>}
      <p className="hint">
        <a href="#/about">About the questions and scoring</a>
      </p>
    </div>
  )
}

/** Cloudflare Turnstile check, shown only when a site key is configured and the player isn't signed in yet. */
function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!turnstileSiteKey || !ref.current) return
    const el = ref.current
    type TurnstileApi = { render: (el: HTMLElement, opts: Record<string, unknown>) => void }
    const render = () => (window as unknown as { turnstile: TurnstileApi }).turnstile.render(el, { sitekey: turnstileSiteKey, callback: onToken })
    if ('turnstile' in window) return render()
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [onToken])
  return <div ref={ref} className="turnstile" />
}

function useSignInGate() {
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [needsCaptcha, setNeedsCaptcha] = useState(Boolean(turnstileSiteKey))
  useEffect(() => {
    if (!turnstileSiteKey) return
    ensureSignedIn()
      .then(() => setNeedsCaptcha(false))
      .catch(() => setNeedsCaptcha(true))
  }, [])
  return {
    ready: !needsCaptcha || captcha !== null,
    gate: needsCaptcha ? <Turnstile onToken={setCaptcha} /> : null,
    signIn: () => ensureSignedIn(captcha ?? undefined),
  }
}

export function HostForm() {
  const [nickname, setNickname] = useState(savedName)
  const [format, setFormat] = useState<GameFormat>('classic')
  const [interests, setInterests] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { ready, gate, signIn } = useSignInGate()

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn()
      saveName(nickname.trim())
      const settings = { format, categories: [], count: 10, timeLimitSec: 20, difficulty: 'medium' }
      const { gameId } = await callGame<{ gameId: string }>({ type: 'create', nickname, settings, interests })
      navigate({ name: 'game', gameId })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="setup" onSubmit={create}>
      <header className="setup-head">
        <a className="back" href="#/">
          ← Home
        </a>
        <h1>Host a game</h1>
        <p className="lede">You'll get a code to share. You pick categories in the lobby, once you see who's joined.</p>
      </header>
      <div className="field">
        <label htmlFor="host-name">Your name</label>
        <input id="host-name" className="text-input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required autoComplete="nickname" />
      </div>
      <fieldset className="field">
        <legend>Format</legend>
        <div className="segmented">
          <button type="button" aria-pressed={format === 'classic'} onClick={() => setFormat('classic')}>
            Classic
          </button>
          <button type="button" aria-pressed={format === 'tossup'} onClick={() => setFormat('tossup')}>
            Quiz bowl tossups
          </button>
        </div>
        <span className="hint">
          {format === 'classic'
            ? 'Short questions, 2 tries each, timed.'
            : 'Competition questions revealed word by word. 1 try, +200 before the power mark, −50 for a wrong answer.'}
        </span>
      </fieldset>
      <InterestPicker selected={interests} onChange={setInterests} />
      {gate}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="start-row">
        <button type="submit" className="primary" disabled={busy || !nickname.trim() || !ready}>
          {busy ? 'Creating…' : 'Create game'}
        </button>
      </div>
    </form>
  )
}

export function JoinForm({ code: initialCode }: { code: string }) {
  const [code, setCode] = useState(initialCode)
  const [nickname, setNickname] = useState(savedName)
  const [interests, setInterests] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { ready, gate, signIn } = useSignInGate()

  if (!multiplayerEnabled) {
    return <p className="notice">Multiplayer isn't switched on for this site yet.</p>
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn()
      saveName(nickname.trim())
      const { gameId } = await callGame<{ gameId: string }>({ type: 'join', code, nickname, interests })
      navigate({ name: 'game', gameId })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="setup" onSubmit={join}>
      <header className="setup-head">
        <a className="back" href="#/">
          ← Home
        </a>
        <h1>Join a game</h1>
      </header>
      <div className="field-row">
        <div className="field">
          <label htmlFor="join-code">Game code</label>
          <input
            id="join-code"
            className="text-input code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="join-name">Your name</label>
          <input id="join-name" className="text-input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required autoComplete="nickname" />
        </div>
      </div>
      <InterestPicker selected={interests} onChange={setInterests} />
      {gate}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="start-row">
        <button type="submit" className="primary" disabled={busy || code.length < 5 || !nickname.trim() || !ready}>
          {busy ? 'Joining…' : 'Join game'}
        </button>
      </div>
    </form>
  )
}
