import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { lorePath, type PublicStoryDetail } from './api'

/**
 * Plain prose as its author wrote it: a blank line starts a paragraph, a single line break stays a line break. A mention
 * whose entry is published is a link to it (ADR 0058 amendment); a name never holds a line break, so none is split.
 */
export function paragraphs(
  world: string,
  { text, links }: PublicStoryDetail['manuscript'][number],
) {
  const out: ReactNode[][] = [[]]
  const add = (chunk: string) =>
    chunk
      .replace(/\r\n?/g, '\n')
      .split(/\n[ \t]*\n+/)
      .forEach((piece, at) => {
        if (at > 0) out.push([])
        if (piece !== '') out[out.length - 1].push(piece)
      })
  let at = 0
  for (const link of links) {
    add(text.slice(at, link.start))
    out[out.length - 1].push(
      <Link
        key={link.start}
        className="mention"
        to={lorePath(world, link.loreSlug)}
        data-testid="public-story-mention"
      >
        {text.slice(link.start, link.start + link.length)}
      </Link>,
    )
    at = link.start + link.length
  }
  add(text.slice(at))
  return out.filter((paragraph) =>
    paragraph.some((node) => typeof node !== 'string' || node.trim().length > 0),
  )
}
