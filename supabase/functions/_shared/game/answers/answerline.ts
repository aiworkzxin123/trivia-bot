// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
/**
 * Turns a plain Open Trivia DB answer into a quiz bowl answerline, so the same
 * checker (qb-answer-checker) judges both question sources.
 */

const PEOPLE_CATEGORIES = new Set(['Celebrities', 'History', 'Politics', 'Art', 'Entertainment: Books'])

/** Words that end place names, so "United Kingdom" never counts as a surname. */
const PLACE_WORDS = new Set([
  'africa', 'america', 'arabia', 'city', 'coast', 'east', 'emirates', 'empire', 'guinea', 'ireland',
  'island', 'islands', 'jersey', 'kingdom', 'korea', 'north', 'ocean', 'republic', 'sea', 'south',
  'states', 'union', 'wales', 'west', 'york', 'zealand',
])

const ARTICLE = /^(the|a|an)\s+(.+)$/i
const GEO_PREFIX = /^(mount|mt\.?|lake|river|cape)\s+(.+)$/i

/** Brackets, semicolons and angle brackets have meaning in answerlines. */
function clean(answer: string): string {
  return answer.replace(/[[\];<>]/g, '').replace(/\s+/g, ' ').trim()
}

function looksLikePersonName(words: string[]): boolean {
  return (
    words.length >= 2 &&
    words.length <= 3 &&
    words.every((w) => /^\p{Lu}/u.test(w) && !/\d/.test(w)) &&
    !PLACE_WORDS.has(words[words.length - 1].toLowerCase())
  )
}

/**
 * Returns '' when the answer contains the word "or": answerlines use it to
 * separate alternatives and it can't be escaped, so "rock" would pass for
 * "Rock or Bust". The judge then compares the whole answer instead.
 */
export function buildAnswerline(answer: string, category: string): string {
  const main = clean(answer)
  if (/\bor\b/i.test(main)) return ''
  const accepts: string[] = []
  let core = main

  const article = core.match(ARTICLE)
  if (article) {
    core = article[2]
    accepts.push(core)
  }
  const geo = core.match(GEO_PREFIX)
  if (geo) {
    core = geo[2]
    accepts.push(core)
  }

  const words = core.split(' ')
  const surnameAccepted = PEOPLE_CATEGORIES.has(category) && looksLikePersonName(words)
  if (surnameAccepted) accepts.push(words[words.length - 1])

  const directives: string[] = []
  if (accepts.length) directives.push(`accept ${accepts.join(' or ')}`)
  if (!surnameAccepted && words.length > 1) directives.push('prompt on partial')

  const line = `<b><u>${main}</u></b>`
  return directives.length ? `${line} [${directives.join('; ')}]` : line
}
