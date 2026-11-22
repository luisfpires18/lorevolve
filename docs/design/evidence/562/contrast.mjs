// Measures the WCAG contrast of every text and control pair in mock/tokens.css, for both themes.
// Run: node docs/design/evidence/562/contrast.mjs
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./mock/tokens.css', import.meta.url), 'utf8')
const [lightBlock, darkBlock] = css.split(":root[data-theme='dark']")
const read = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]))
const themes = { light: read(lightBlock), dark: { ...read(lightBlock), ...read(darkBlock) } }

const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, minimum]
const PAIRS = [
  ['text', 'bg', 4.5],
  ['text', 'bg-subtle', 4.5],
  ['text', 'bg-raised', 4.5],
  ['text', 'bg-hover', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'bg-subtle', 4.5],
  ['text-muted', 'bg-raised', 4.5],
  ['text-muted', 'bg-hover', 4.5],
  ['text-faint', 'bg', 4.5],
  ['text-faint', 'bg-subtle', 4.5],
  ['accent-text', 'bg', 4.5],
  ['accent-text', 'bg-selected', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-hover', 4.5],
  ['danger', 'bg', 4.5],
  ['warning', 'bg', 4.5],
  ['success', 'bg', 4.5],
  ['line-control', 'bg', 3],
  ['line-control', 'bg-raised', 3],
]

let failed = 0
for (const [name, tokens] of Object.entries(themes)) {
  console.log(`\n${name}`)
  for (const [fg, bg, min] of PAIRS) {
    const value = ratio(tokens[fg], tokens[bg])
    const pass = value >= min
    if (!pass) failed += 1
    console.log(`${pass ? 'pass' : 'FAIL'}  ${value.toFixed(2).padStart(5)}  (min ${min})  ${fg} on ${bg}`)
  }
}
process.exitCode = failed ? 1 : 0
