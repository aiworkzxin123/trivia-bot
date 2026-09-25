// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.
const LEADING_ARTICLE = /^(the|a|an)\s+(?=\S)/

/** Lowercase, strip accents and punctuation, and drop a leading article. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '')
}

/** Edit distance where swapping two neighbouring letters counts as one edit. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/** How many typos a normalized answer tolerates. Short answers and numbers must be exact. */
export function typoAllowance(normalizedAnswer: string): number {
  if (/\d/.test(normalizedAnswer)) return 0
  const letters = normalizedAnswer.replace(/\s/g, '').length
  if (letters < 5) return 0
  if (letters < 9) return 1
  return 2
}
