import { FieldKind, type FieldDefinition, type FieldValueInput } from './types'

/** Schemes an article link may use. The API enforces the same set. */
export const ALLOWED_LINK_SCHEMES = ['http', 'https', 'mailto']

export function isSafeHref(href: string) {
  const trimmed = href.trim()
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true
  const separator = trimmed.indexOf(':')
  if (separator <= 0) return true
  return ALLOWED_LINK_SCHEMES.includes(trimmed.slice(0, separator).toLowerCase())
}

interface DocumentNode {
  type?: unknown
  text?: unknown
  content?: unknown
}

/** Nodes that hold nothing an author can see when they are empty. */
const BLANK_NODE_TYPES = new Set(['doc', 'paragraph', 'hardBreak', 'text'])

/**
 * An empty Tiptap document still serialises - an editor that was typed in and emptied again holds one empty paragraph -
 * so treat a document with no text and nothing else in it as no article.
 */
export function isEmptyDocument(json: string | null): boolean {
  if (!json) return true
  try {
    return isBlankNode(JSON.parse(json) as DocumentNode, 0)
  } catch {
    return true
  }
}

function isBlankNode(node: DocumentNode, depth: number): boolean {
  if (depth > 40 || typeof node !== 'object' || node === null) return true
  if (typeof node.type === 'string' && !BLANK_NODE_TYPES.has(node.type)) return false
  if (typeof node.text === 'string' && node.text.trim() !== '') return false
  if (!Array.isArray(node.content)) return true
  return (node.content as DocumentNode[]).every((child) => isBlankNode(child, depth + 1))
}

interface MarkedNode extends DocumentNode {
  marks?: unknown
}

/** One link in an article: the words it is on and where it points. */
export interface ArticleLink {
  text: string
  href: string
}

/**
 * Every link an article holds, in reading order: neighbouring text with the same address is one link. Empty for no
 * article or one that cannot be read. Shown before an article is copied (Issue #27), so the author sees what travels.
 */
export function articleLinks(json: string | null): ArticleLink[] {
  const links: ArticleLink[] = []
  if (!json) return links

  // The link the previous text node was in, so a link split across bold and plain words stays one.
  let open: ArticleLink | null = null

  function walk(node: MarkedNode, depth: number) {
    if (depth > 40 || typeof node !== 'object' || node === null) return
    if (typeof node.text === 'string') {
      const link = Array.isArray(node.marks)
        ? (node.marks as { type?: unknown; attrs?: { href?: unknown } }[]).find(
            (mark) => mark?.type === 'link' && typeof mark.attrs?.href === 'string',
          )
        : undefined
      const href = link?.attrs?.href as string | undefined
      if (href === undefined) {
        open = null
      } else if (open?.href === href) {
        open.text += node.text
      } else {
        open = { text: node.text, href }
        links.push(open)
      }
      return
    }
    open = null
    if (Array.isArray(node.content)) {
      for (const child of node.content as MarkedNode[]) walk(child, depth + 1)
    }
  }

  try {
    walk(JSON.parse(json) as MarkedNode, 0)
  } catch {
    return []
  }
  return links
}

/** The starting value for a field the entity has never had one for. */
export function emptyValue(definition: FieldDefinition): FieldValueInput {
  const isText = definition.kind === FieldKind.ShortText || definition.kind === FieldKind.LongText

  return {
    fieldDefinitionId: definition.id,
    text: isText ? (definition.defaultValue ?? null) : null,
    number: null,
    boolean: definition.kind === FieldKind.Boolean ? false : null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
    eraId: null,
  }
}
