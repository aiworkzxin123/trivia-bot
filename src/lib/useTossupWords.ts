/**
 * Fetches a tossup's words as the database releases them. Each chunk becomes
 * readable at a fixed offset from the question's start, so this schedules one
 * read per chunk instead of polling.
 */
import { useEffect, useState } from 'react'
import { chunkOffsetMs } from '../server/service.ts'
import { supabase } from './supabase.ts'

/** A little past the release time, to allow for clock differences with the server. */
const FETCH_DELAY_MS = 120
const RETRY_MS = 300

export function useTossupWords(
  questionId: string | null,
  wordCount: number | null,
  startedAt: number,
  serverNow: () => number,
): string[] {
  const [chunks, setChunks] = useState<{ questionId: string; texts: string[] }>({ questionId: '', texts: [] })
  const texts = chunks.questionId === questionId ? chunks.texts : []
  const words = texts.flatMap((t) => t.split(' '))
  const complete = wordCount !== null && words.length >= wordCount

  const have = texts.length
  useEffect(() => {
    if (!supabase || !questionId || complete) return
    const db = supabase
    let cancelled = false
    const wait = Math.max(0, startedAt + chunkOffsetMs(have) + FETCH_DELAY_MS - serverNow())
    const id = setTimeout(async function load() {
      const { data } = await db.from('question_chunks').select('idx, text').eq('question_id', questionId).order('idx')
      if (cancelled) return
      const next = (data ?? []).map((c) => c.text as string)
      if (next.length > have) setChunks({ questionId, texts: next })
      // Not released yet (clocks differ slightly): try again shortly.
      else setTimeout(load, RETRY_MS)
    }, wait)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [questionId, have, complete, startedAt, serverNow])

  return words
}
