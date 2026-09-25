// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
/** The fields of an Open Trivia DB question that decide whether it works without choices. */
export interface RawQuestion {
  type: string
  question: string
  correct_answer: string
}

const NEEDS_CHOICES = /\bwhich\s+(one\s+)?of\s+(these|the\s+following)\b/i
const NEGATED = /\bnot\b|\bcannot\b|\b(isn|aren|wasn|weren|doesn|didn)['’]t\b/i
const MAX_ANSWER_WORDS = 4

/** True when a question still makes sense as a typed-answer question. */
export function isFreeTextFriendly(q: RawQuestion, blocklist: ReadonlySet<string> = new Set()): boolean {
  if (q.type !== 'multiple') return false
  if (NEEDS_CHOICES.test(q.question)) return false
  if (NEGATED.test(q.question)) return false
  if (q.correct_answer.trim().split(/\s+/).length > MAX_ANSWER_WORDS) return false
  if (blocklist.has(q.question)) return false
  return true
}
