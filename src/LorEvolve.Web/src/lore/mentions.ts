/**
 * A Lore mention inside a scene's plain-text manuscript (issue 31, ADR 0058): `@[Akron Wright](lore:<entry id>)`.
 *
 * Mirrors `Features/Stories/ManuscriptMentions.cs`. The manuscript stays plain text: a mention is ordinary characters, and
 * it is a mention only while it matches this exact pattern. The editor shows it as stored; every place prose is read
 * shows the name instead (`plainMentions`). The id is the identity; the bracketed name is what the prose said when the
 * mention was chosen, and the fallback whenever the id names nothing.
 */

const TOKEN =
  /@\[([^[\]\r\n]{1,200})\]\(lore:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g

/** A mention cut by the start of an excerpt: the tail of its name, then its markup. */
const CUT_HEAD = /^([^[\]\r\n]*)\]\(lore:[0-9a-fA-F-]{0,36}\)?/

/** A mention cut by the end of an excerpt: its opening, the start of its name, and maybe some of its markup. */
const CUT_TAIL = /@\[([^[\]\r\n]*)(?:\]\(lore:[0-9a-fA-F-]{0,36})?$/

export interface Mention {
  start: number
  length: number
  /** The name the prose carries. */
  name: string
  entityId: string
}

/** Every mention in `text`, in order. */
export function findMentions(text: string): Mention[] {
  return Array.from(text.matchAll(TOKEN), (match) => ({
    start: match.index,
    length: match[0].length,
    name: match[1],
    entityId: match[2].toLowerCase(),
  }))
}

/**
 * The text in pieces for the Write view's backdrop (ADR 0058 amendment): each mention's name apart from its markup, the
 * rest as it is. Joined, the pieces are exactly `text`, character for character - the backdrop lines up with the text box
 * only while that holds.
 */
export function markedPieces(text: string): { text: string; part?: 'markup' | 'name' }[] {
  const pieces: { text: string; part?: 'markup' | 'name' }[] = []
  let at = 0
  for (const mention of findMentions(text)) {
    if (mention.start > at) pieces.push({ text: text.slice(at, mention.start) })
    const nameEnd = mention.start + 2 + mention.name.length
    pieces.push(
      { text: '@[', part: 'markup' },
      { text: mention.name, part: 'name' },
      { text: text.slice(nameEnd, mention.start + mention.length), part: 'markup' },
    )
    at = mention.start + mention.length
  }
  if (at < text.length) pieces.push({ text: text.slice(at) })
  return pieces
}

/** The prose as a reader reads it: each mention as its name, in plain text. */
export function plainMentions(text: string) {
  return text.includes('](lore:') ? text.replace(TOKEN, (_whole, name: string) => name) : text
}

/** `plainMentions` for a window that may cut a mention in two: what is left of its markup at either edge goes too. */
export function plainExcerpt(text: string) {
  return plainMentions(text).replace(CUT_HEAD, '$1').replace(CUT_TAIL, '$1')
}

/** The stored form of a mention. A `[`, `]` or line break in a name would end it early, so those become spaces. */
export function mentionToken(name: string, entityId: string) {
  const safe =
    name
      .replace(/[[\]\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 200) || 'Lore'
  return `@[${safe}](lore:${entityId})`
}

/**
 * The `@query` the caret is in, if the author is starting a mention: an `@` at the start of the text or after a space,
 * bracket or quote, then up to 40 characters of a name with no line break or bracket, ending at the caret. Null otherwise -
 * an email address, `@` mid-word and a finished mention open nothing.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(Math.max(0, caret - 41), caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const query = before.slice(at + 1)
  if (/[\r\n[\]()@]/.test(query) || query.length > 40) return null
  if (/^\s/.test(query) || /\s{2}/.test(query)) return null
  const start = caret - before.length + at
  const previous = start === 0 ? '' : text[start - 1]
  if (previous !== '' && !/[\s([{"'“‘«—–-]/.test(previous)) return null
  return { start, query }
}
