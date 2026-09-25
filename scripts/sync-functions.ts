/**
 * Copies the shared game rules from src/ into supabase/functions/_shared, so
 * the server function runs exactly the code the tests cover.
 *
 * Run with: npm run sync:functions   (also runs before every deploy of the function)
 * Pass --check to fail instead of copying when the copies are out of date.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = join(root, 'supabase/functions/_shared')
const SOURCES = ['src/game', 'src/server']
/** Browser-only or test-only files the server never needs. */
const SKIP = [/\.test\.ts$/, /questions[\\/]pool\.ts$/, /memoryStore\.ts$/]

async function list(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? list(join(dir, e.name)) : [join(dir, e.name)])))
  return files.flat().filter((f) => f.endsWith('.ts') && !SKIP.some((s) => s.test(f)))
}

const HEADER = '// Copied from src/ by scripts/sync-functions.ts. Edit the original, not this file.\n'

async function main() {
  const check = process.argv.includes('--check')
  const wanted = new Map<string, string>()
  for (const source of SOURCES) {
    for (const file of await list(join(root, source))) {
      const dest = join(target, relative(join(root, 'src'), file))
      wanted.set(dest, HEADER + (await readFile(file, 'utf8')))
    }
  }

  if (check) {
    const stale: string[] = []
    for (const [dest, content] of wanted) {
      const current = await readFile(dest, 'utf8').catch(() => null)
      if (current !== content) stale.push(relative(root, dest))
    }
    if (stale.length) {
      console.error(`Out of date, run npm run sync:functions:\n  ${stale.join('\n  ')}`)
      process.exit(1)
    }
    console.log('Function copies are up to date')
    return
  }

  await rm(target, { recursive: true, force: true })
  for (const [dest, content] of wanted) {
    await mkdir(join(dest, '..'), { recursive: true })
    await writeFile(dest, content)
  }
  console.log(`Copied ${wanted.size} files to ${relative(root, target)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
