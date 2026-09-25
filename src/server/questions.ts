/** Loads a multiplayer game's questions on the server. */
import { pickQuestions, type QuestionFile } from '../game/questions/pick.ts'
import { fetchTossups, type SourcedQuestion } from '../game/questions/sources.ts'
import type { GameSettings } from './types.ts'

export async function loadQuestionsForSettings(
  settings: GameSettings,
  questionsUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourcedQuestion[]> {
  if (settings.format === 'tossup') {
    return fetchTossups(settings.categories, settings.count, settings.difficulty, fetchImpl)
  }
  const res = await fetchImpl(questionsUrl)
  if (!res.ok) throw new Error(`Couldn't load the question file (HTTP ${res.status})`)
  const file = (await res.json()) as QuestionFile
  return pickQuestions(file.questions, { categories: settings.categories, count: settings.count }, new Set()).map((q) => ({
    category: q.category,
    text: q.text,
    answer: q.answer,
    answerline: q.answerline,
    difficulty: q.difficulty,
  }))
}
