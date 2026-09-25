/**
 * Downloads every verified Open Trivia DB question, keeps the ones that work
 * as typed-answer questions, and writes public/questions/opentdb.json.
 *
 * Run with: npm run build:questions   (takes ~12 minutes: the API allows one request per 5 seconds)
 *
 * Question data: Open Trivia DB (https://opentdb.com), CC BY-SA 4.0.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildAnswerline } from '../src/game/answers/answerline.ts'
import { isFreeTextFriendly, type RawQuestion } from '../src/game/questions/filter.ts'

const API = 'https://opentdb.com'
const DELAY_MS = 5200
const OUT = new URL('../public/questions/opentdb.json', import.meta.url)
const BLOCKLIST = new URL('./opentdb-blocklist.txt', import.meta.url)

interface ApiQuestion extends RawQuestion {
  category: string
  difficulty: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

function decode(q: ApiQuestion): ApiQuestion {
  return {
    ...q,
    category: decodeURIComponent(q.category),
    type: decodeURIComponent(q.type),
    difficulty: decodeURIComponent(q.difficulty),
    question: decodeURIComponent(q.question),
    correct_answer: decodeURIComponent(q.correct_answer),
  }
}

async function loadBlocklist(): Promise<Set<string>> {
  try {
    const text = await readFile(BLOCKLIST, 'utf8')
    return new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))
  } catch {
    return new Set()
  }
}

async function main() {
  const blocklist = await loadBlocklist()
  const { trivia_categories } = await getJson<{ trivia_categories: { id: number; name: string }[] }>('/api_category.php')
  await sleep(DELAY_MS)
  const { token } = await getJson<{ token: string }>('/api_token.php?command=request')

  const all: ApiQuestion[] = []
  for (const category of trivia_categories) {
    await sleep(DELAY_MS)
    const { category_question_count } = await getJson<{
      category_question_count: { total_question_count: number }
    }>(`/api_count.php?category=${category.id}`)
    let remaining = category_question_count.total_question_count

    while (remaining > 0) {
      await sleep(DELAY_MS)
      const amount = Math.min(50, remaining)
      const page = await getJson<{ response_code: number; results: ApiQuestion[] }>(
        `/api.php?amount=${amount}&category=${category.id}&token=${token}&encode=url3986`,
      )
      if (page.response_code === 5) continue // rate limited: wait and retry
      if (page.response_code !== 0) break // no questions left for this category
      all.push(...page.results.map(decode))
      remaining -= page.results.length
    }
    console.log(`${category.name}: ${category_question_count.total_question_count} downloaded`)
  }

  const kept = all.filter((q) => isFreeTextFriendly(q, blocklist))
  const questions = kept
    .map((q) => ({
      id: createHash('sha1').update(q.question).digest('hex').slice(0, 12),
      text: q.question,
      category: q.category,
      difficulty: q.difficulty,
      answer: q.correct_answer,
      answerline: buildAnswerline(q.correct_answer, q.category),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const counts = new Map<string, number>()
  for (const q of questions) counts.set(q.category, (counts.get(q.category) ?? 0) + 1)

  await mkdir(new URL('.', OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({
      source: 'Open Trivia DB (https://opentdb.com)',
      license: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)',
      generatedAt: new Date().toISOString(),
      categories: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
      questions,
    }),
  )
  console.log(`Kept ${questions.length} of ${all.length} questions`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
