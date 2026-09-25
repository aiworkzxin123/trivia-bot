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

  // The checker can't match some answers even when typed exactly, like "Final Fantasy X-2" or "?:".
  const expected = normalize(question.answer)
  const typed = normalize(answer)
  if (answer.toLowerCase() === question.answer.trim().toLowerCase() || (expected && typed === expected)) {
    return { result: 'correct' }
  }

  if (question.answerline) {
    const { directive, directedPrompt } = checkAnswer(question.answerline, answer)
    if (directive === 'accept') return { result: 'correct' }
    if (directive === 'prompt') return { result: 'prompt', promptText: directedPrompt }
  }

  // The checker is strict about typos in short and medium words, so allow a few.
  if (typed && editDistance(typed, expected) <= typoAllowance(expected)) return { result: 'correct' }

  return { result: 'wrong' }
}
