import { Fragment, type ReactNode } from 'react'
import { isSafeHref } from '../lore/document'

/**
 * A stored article drawn as React elements, straight from its JSON: the reading view of what the editor writes, without
 * the editor. The editor (`LoreEditor`, Tiptap and ProseMirror, about 125 KB on the wire) is fetched only when an author
 * presses Edit, so an entry page or a public page shows its article for the cost of the JSON alone.
 *
 * Nothing here parses HTML: every node becomes an element by its type, every text run a string, and the one attribute an
 * author controls - a link's address - passes `isSafeHref` or is dropped, as the editor and the API both insist. A node
 * type this file does not know (written by a newer editor) draws its children and nothing else, so a document is never
 * lost to a surprise. The output matches the editor's own DOM closely enough that `.article__body` styles both.
 */

interface Mark {
  type?: unknown
  attrs?: Record<string, unknown>
}

interface Node {
  type?: unknown
  text?: unknown
  attrs?: Record<string, unknown>
  marks?: unknown
  content?: unknown
}

function parse(json: string | null): Node | null {
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Node) : null
  } catch {
    return null
  }
}

function children(node: Node): ReactNode[] {
  if (!Array.isArray(node.content)) return []
  return (node.content as Node[]).map((child, index) => (
    <Fragment key={index}>{render(child)}</Fragment>
  ))
}

function marked(text: string, marks: unknown): ReactNode {
  if (!Array.isArray(marks)) return text
  // Innermost first, as the editor nests them: the last mark listed wraps the text, the first wraps everything.
  return (marks as Mark[]).reduceRight<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{inner}</strong>
      case 'italic':
        return <em>{inner}</em>
      case 'underline':
        return <u>{inner}</u>
      case 'strike':
        return <s>{inner}</s>
      case 'code':
        return <code>{inner}</code>
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href.trim() : ''
        if (!href || !isSafeHref(href)) return inner
        return (
          <a href={href} rel="noopener noreferrer nofollow" target="_blank">
            {inner}
          </a>
        )
      }
      default:
        return inner
    }
  }, text)
}

function render(node: Node): ReactNode {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? marked(node.text, node.marks) : null
    case 'paragraph': {
      const inner = children(node)
      // An empty paragraph keeps its line, as the editor's trailing break does.
      return <p>{inner.length > 0 ? inner : <br />}</p>
    }
    case 'heading': {
      const level = Number(node.attrs?.level)
      const inner = children(node)
      switch (level) {
        case 1:
          return <h1>{inner}</h1>
        case 3:
          return <h3>{inner}</h3>
        case 4:
          return <h4>{inner}</h4>
        case 5:
          return <h5>{inner}</h5>
        case 6:
          return <h6>{inner}</h6>
        default:
          return <h2>{inner}</h2>
      }
    }
    case 'bulletList':
      return <ul>{children(node)}</ul>
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      return (
        <ol start={Number.isInteger(start) && start !== 1 ? start : undefined}>{children(node)}</ol>
      )
    }
    case 'listItem':
      return <li>{children(node)}</li>
    case 'blockquote':
      return <blockquote>{children(node)}</blockquote>
    case 'codeBlock':
      return (
        <pre>
          <code>{children(node)}</code>
        </pre>
      )
    case 'horizontalRule':
      return <hr />
    case 'hardBreak':
      return <br />
    default:
      return <>{children(node)}</>
  }
}

/** Read-only rendering of a stored article. The same name the editor module once exported, so the call sites read the same. */
export function LoreArticle({ content }: { content: string | null }) {
  const document = parse(content)
  return (
    <div className="article__body" data-testid="lore-article">
      {document ? children(document) : null}
    </div>
  )
}
