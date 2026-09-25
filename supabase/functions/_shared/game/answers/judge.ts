// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
import checkAnswer from 'qb-answer-checker'
import { editDistance, normalize, typoAllowance } from './normalize.ts'

export interface Judgeable {
  /** The plain answer, used for the typo fallback. */
  answer: string
  /** Quiz bowl answerline with accept/prompt/reject directives, or '' to compare the whole answer only. */
  answerline: string
}

export interface Verdict {
  result: 'correct' | 'prompt' | 'wrong'
  /** Directed prompt from the answerline, e.g. "what specific fluid?" */
  promptText?: string
}

export function judge(question: Judgeable, given: string): Verdict {
  const answer = given.trim()
  if (!answer) return { result: 'wrong' }

  // QBReader answers carry their directives in brackets: "Leonardo da Vinci [accept Leonardo]".
  const mainAnswer = question.answer.replace(/\s*\[.*$/, '').trim() || question.answer.trim()
  const expected = normalize(mainAnswer)
  const typed = normalize(answer)

  // The checker can't match some answers even when typed exactly, like "Final Fantasy X-2" or "?:".
  if (answer.toLowerCase() === mainAnswer.toLowerCase() || (expected && typed === expected)) return { result: 'correct' }

  const checked = question.answerline ? checkAnswer(question.answerline, answer) : null
  if (checked?.directive === 'accept') return { result: 'correct' }

  // The checker is strict about typos, so allow a few in the full answer before asking for more.
  if (typed && editDistance(typed, expected) <= typoAllowance(expected)) return { result: 'correct' }

  if (checked?.directive === 'prompt') return { result: 'prompt', promptText: checked.directedPrompt }
  return { result: 'wrong' }
}
