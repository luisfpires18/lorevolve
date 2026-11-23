import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useI18n } from '../../i18n'
import { DateText } from '../DateText'

// The frame of an entry screen around its content, Lore's or a project's (#456): the bar under the head, the layout
// that holds the picture beside or above the reading, and the dates in the rail.

/**
 * The bar under an entry's head: its views on the left, its tools on the right. The lenses are always drawn, empty
 * where an entry has no views, so the tools keep to the right; no tools leaves the tools out.
 */
export function EntryBar({ lenses, tools }: { lenses?: ReactNode; tools?: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null)
  const wrapped = useToolsWrapped(bar)
  return (
    <div ref={bar} className="entry__bar" data-wrapped={wrapped ? 'true' : undefined}>
      <div className="entry__lenses">{lenses}</div>
      {tools ? <div className="entry__tools">{tools}</div> : null}
    </div>
  )
}

/** Whether the tools sit on a row of their own under the views. The bar's height changes when they wrap, so watching it
 * is enough. */
function useToolsWrapped(bar: RefObject<HTMLDivElement | null>) {
  const [wrapped, setWrapped] = useState(false)
  useLayoutEffect(() => {
    const element = bar.current
    if (!element) return
    const measure = () => {
      const lenses = element.querySelector('.entry__lenses')
      const tools = element.querySelector('.entry__tools')
      setWrapped(
        !!lenses &&
          !!tools &&
          tools.getBoundingClientRect().top >= lenses.getBoundingClientRect().bottom,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [bar])
  return wrapped
}

/**
 * The picture and the reading beside it. `view` is a view other than the article: the picture keeps its place but
 * not its shape.
 */
export function EntryLayout({
  picture,
  view = false,
  children,
}: {
  picture: { width: number; height: number } | null
  view?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={view ? 'entry__layout entry__layout--view' : 'entry__layout'}
      data-picture={picture ? 'true' : 'false'}
      data-shape={picture && !view ? pictureShape(picture) : undefined}
    >
      {children}
    </div>
  )
}

/** When the entry was created and last changed, at the foot of the rail. */
export function EntryDates({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  const { tx } = useI18n()
  return (
    <p className="rail__meta">
      {tx('entity.page.rail.created', { date: <DateText value={createdAt} /> })}
      <br />
      {tx('entity.page.rail.lastChanged', { date: <DateText value={updatedAt} /> })}
    </p>
  )
}

/**
 * Whether a picture sits beside the article (taller than wide, or near square) or spans the page above
 * it (clearly wider than tall). Read from the original's stored dimensions; nothing is cropped either way.
 */
function pictureShape(image: { width: number; height: number }) {
  const ratio = image.width / image.height
  return ratio > 1.25 ? 'landscape' : ratio < 0.9 ? 'portrait' : 'square'
}
