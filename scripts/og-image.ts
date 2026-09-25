/**
 * Draws public/og.png, the preview image shown when an invite link is shared.
 * Run with: npm run build:og
 */
import { writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d131a"/>
  <rect x="60" y="60" width="1080" height="510" rx="36" fill="#151e28" stroke="#5cc2e0" stroke-width="4"/>
  <text x="120" y="210" font-family="Arial, Helvetica, sans-serif" font-size="110" font-weight="700" fill="#e7ecf1">Trivia Bot</text>
  <text x="120" y="290" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#9ba7b4">Type your answers. Faster right answers score more.</text>
  <rect x="120" y="360" width="560" height="14" rx="7" fill="#283441"/>
  <rect x="120" y="360" width="380" height="14" rx="7" fill="#5cc2e0"/>
  <text x="120" y="470" font-family="Consolas, 'Courier New', monospace" font-size="64" font-weight="700" fill="#f0b64f">+ 1000 pts</text>
  <text x="1080" y="470" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#9ba7b4">Join with a code</text>
</svg>`

const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng()
await writeFile(new URL('../public/og.png', import.meta.url), png)
console.log(`Wrote public/og.png (${png.length} bytes)`)
