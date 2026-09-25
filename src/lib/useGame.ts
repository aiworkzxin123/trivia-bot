/**
 * Live view of one multiplayer game: loads what row level security lets this
 * player see, listens for changes, and estimates the server clock so every
 * player's timer matches.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toAnswer, toGame, toPlayer, toQuestion } from '../server/supabaseStore.ts'
import type { AnswerRow, GameRow, PlayerRow, QuestionRow } from '../server/types.ts'
import { callGame, currentUserId, supabase } from './supabase.ts'

export interface FeedItem {
  id: number
  playerId: string
  nickname: string
  kind: 'correct' | 'override'
  elapsedMs: number
  points: number
  createdAt: number
}

export interface LiveGame {
  loading: boolean
  error: string | null
  userId: string | null
  game: GameRow | null
  players: PlayerRow[]
  me: PlayerRow | null
  question: QuestionRow | null
  /** Your own answers while the question is open; everyone's after the reveal. */
  answers: AnswerRow[]
  feed: FeedItem[]
  /** Interests at least two players share, most shared first. */
  sharedInterests: string[]
  /** Current server time in ms, from the estimated clock offset. */
  serverNow: () => number
  refresh: () => void
}

const POLL_MS = 5000

export function useGame(gameId: string): LiveGame {
  const [state, setState] = useState<Omit<LiveGame, 'serverNow' | 'refresh'>>({
    loading: true,
    error: null,
    userId: null,
    game: null,
    players: [],
    me: null,
    question: null,
    answers: [],
    feed: [],
    sharedInterests: [],
  })
  const offset = useRef(0)
  const loadRef = useRef<() => Promise<void>>(async () => {})

  const load = useCallback(async () => {
    if (!supabase) return
    const userId = await currentUserId()
    const [gameRes, playersRes, feedRes] = await Promise.all([
      supabase.from('games').select().eq('id', gameId).maybeSingle(),
      supabase.from('players').select().eq('game_id', gameId).order('joined_at'),
      supabase.from('feed_events').select().eq('game_id', gameId).order('id', { ascending: false }).limit(30),
    ])
    if (gameRes.error || !gameRes.data) {
      setState((s) => ({
        ...s,
        loading: false,
        userId,
        error: gameRes.error?.message ?? "This game has ended, or you haven't joined it. Ask the host for the code.",
      }))
      return
    }
    const game = toGame(gameRes.data)
    const players = (playersRes.data ?? []).map(toPlayer)
    let question: QuestionRow | null = null
    let answers: AnswerRow[] = []
    if (game.currentIndex >= 0) {
      const q = await supabase.from('questions').select().eq('game_id', gameId).eq('idx', game.currentIndex).maybeSingle()
      question = q.data ? toQuestion(q.data) : null
      if (question) {
        const a = await supabase.from('answers').select().eq('question_id', question.id).order('created_at')
        answers = (a.data ?? []).map(toAnswer)
      }
    }
    const feed: FeedItem[] = (feedRes.data ?? []).map((r) => ({
      id: r.id,
      playerId: r.player_id,
      nickname: r.nickname,
      kind: r.kind,
      elapsedMs: r.elapsed_ms,
      points: r.points,
      createdAt: new Date(r.created_at).getTime(),
    }))
    setState((s) => ({
      ...s,
      loading: false,
      error: null,
      userId,
      game,
      players,
      me: players.find((p) => p.userId === userId) ?? null,
      question,
      answers,
      feed,
    }))
  }, [gameId])

  useEffect(() => {
    loadRef.current = load
  }, [load])

  // Initial load, realtime subscription and a slow poll in case a realtime message is missed.
  useEffect(() => {
    if (!supabase) return
    const db = supabase
    const reload = () => void loadRef.current()
    reload()
    const channel = db
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, reload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events', filter: `game_id=eq.${gameId}` }, reload)
      .subscribe()
    const poll = setInterval(reload, POLL_MS)
    return () => {
      clearInterval(poll)
      void db.removeChannel(channel)
    }
  }, [gameId])

  // Estimate the server clock and this player's round-trip time once they're in the game.
  const meId = state.me?.id
  useEffect(() => {
    if (!meId) return
    let cancelled = false
    ;(async () => {
      const samples: { rtt: number; offset: number }[] = []
      for (let i = 0; i < 3 && !cancelled; i++) {
        const sent = Date.now()
        try {
          const { serverNow } = await callGame<{ serverNow: number }>({ type: 'ping', gameId })
          const received = Date.now()
          samples.push({ rtt: received - sent, offset: serverNow - (sent + received) / 2 })
        } catch {
          return
        }
      }
      if (cancelled || !samples.length) return
      // The fastest sample is the least distorted by network hiccups.
      const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a))
      offset.current = best.offset
      await callGame({ type: 'ping', gameId, rttMs: best.rtt }).catch(() => {})
    })()
    return () => {
      cancelled = true
    }
  }, [gameId, meId])

  // Suggestions change as players join, so refresh them with the player list while in the lobby.
  const status = state.game?.status
  const playerCount = state.players.length
  useEffect(() => {
    if (status !== 'lobby' || !meId) return
    callGame<{ interests: string[] }>({ type: 'suggestions', gameId })
      .then(({ interests }) => setState((s) => ({ ...s, sharedInterests: interests })))
      .catch(() => {})
  }, [gameId, status, playerCount, meId])

  const serverNow = useCallback(() => Date.now() + offset.current, [])
  const refresh = useCallback(() => void loadRef.current(), [])
  return { ...state, serverNow, refresh }
}
