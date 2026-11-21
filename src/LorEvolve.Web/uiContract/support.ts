// Helpers shared by the UI contract tests (`uiContract.test.ts`, `uiContract/actions.test.ts`,
// `uiContract/wording.test.ts`). They read source as text; nothing here needs a browser.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const webRoot = join(import.meta.dirname, '..')

export const tsxFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

export const read = (file: string) => readFileSync(join(webRoot, file), 'utf8')

export const filesWith = (pattern: RegExp) => tsxFiles.filter((file) => pattern.test(read(file)))

// The text between a `{` at `open` and its matching `}`. Braces inside quotes do not count; the
// braces of a template's `${...}` balance themselves.
export function braceBody(source: string, open: number): string {
  let depth = 0
  let quote = ''
  for (let i = open; i < source.length; i++) {
    const c = source[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  return source.slice(open + 1)
}

// Every string literal in a piece of code. A template literal keeps its own text, with each
// `${...}` replaced by one mark that is not a space, so "button ${x}" still reads as the class
// "button" and "button--${tone}" does not.
export function literals(code: string): string[] {
  const found: string[] = []
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '"' || c === "'") {
      const end = code.indexOf(c, i + 1)
      if (end < 0) break
      found.push(code.slice(i + 1, end))
      i = end
    } else if (c === '`') {
      let text = ''
      let j = i + 1
      for (; j < code.length && code[j] !== '`'; j++) {
        if (code[j] === '$' && code[j + 1] === '{') {
          const inner = braceBody(code, j + 1)
          found.push(...literals(inner))
          text += '\u0001'
          j += inner.length + 2
        } else text += code[j]
      }
      found.push(text)
      i = j
    }
  }
  return found
}

// Every class string in a file, for any prop ending in className or ClassName (triggerClassName
// counts): className="...", and each literal inside className={...}, template literals included.
export function classStrings(source: string): string[] {
  const found: string[] = []
  for (const m of source.matchAll(/[A-Za-z]*[cC]lassName\s*=\s*(["'])((?:(?!\1)[^\n])*)\1/g)) {
    found.push(m[2])
  }
  for (const m of source.matchAll(/[A-Za-z]*[cC]lassName\s*=\s*\{/g)) {
    found.push(...literals(braceBody(source, m.index + m[0].length - 1)))
  }
  return found
}

// Every `<name ...>` element in a file: its opening tag (attributes) and what sits between the tags.
// A `>` inside braces or an arrow `=>` does not end the tag; a self-closing tag has no body.
export function elements(source: string, name: string): { tag: string; body: string }[] {
  const found: { tag: string; body: string }[] = []
  const start = new RegExp(`<${name}(?=[\\s>/])`, 'g')
  for (const m of source.matchAll(start)) {
    let depth = 0
    let i = m.index + m[0].length
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && source[i - 1] !== '=') break
    }
    const tag = source.slice(m.index + name.length + 1, i)
    if (source[i - 1] === '/') {
      found.push({ tag, body: '' })
      continue
    }
    const close = source.indexOf(`</${name}>`, i)
    found.push({ tag, body: source.slice(i + 1, close < 0 ? source.length : close) })
  }
  return found
}

// Source with its comments cut out (a `//` only counts after a space or at a line start, so URLs survive).
export const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

export type Rule = { selector: string; body: string }

// Every rule of a stylesheet, at any @media depth: the selector list and its declaration block.
export const rulesOf = (css: string): Rule[] =>
  [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }))
