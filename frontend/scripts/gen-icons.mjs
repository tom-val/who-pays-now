// Generate PWA raster icons from public/favicon.svg.
// Run with `npm run icons` (requires the `sharp` devDependency).
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const svg = readFileSync(join(pub, 'favicon.svg'))

const targets = [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(pub, name))
  console.log(`✓ ${name} (${size}px)`)
}
