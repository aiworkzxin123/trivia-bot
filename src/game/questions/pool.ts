import type { QuestionFile } from './pick.ts'

export { pickQuestions, type PickOptions, type QuestionFile } from './pick.ts'

/** "Entertainment: Video Games" → "Video Games" */
export function displayCategory(name: string): string {
  return name.replace(/^(Entertainment|Science):\s*/, '')
}

export async function loadQuestions(): Promise<QuestionFile> {
  const res = await fetch(`${import.meta.env.BASE_URL}questions/opentdb.json`)
  if (!res.ok) throw new Error(`Couldn't load questions (HTTP ${res.status})`)
  // A missing file comes back as the app's own HTML page, not an error status.
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error("The question file hasn't been built yet. Run npm run build:questions")
  }
  return (await res.json()) as QuestionFile
}
