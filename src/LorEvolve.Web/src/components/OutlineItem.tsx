import { useId, type ReactNode } from 'react'
import { FoldToggle } from './FoldToggle'
import { useFold } from './fold'
import { QuietNote } from './QuietNote'

type TitleLevel = 3 | 4 | 5 | 6

/**
 * One node of a project's outline in the Stories look (#377): a group reads as a story's arc (`top`) or chapter, a node
 * with nothing under it reads as a scene card. Presentational only: the caller owns the data, the tools and the list
 * around it. It renders the list item itself, so an outline stays `ol > li` with the caller's test id on the `li`.
 */
export function OutlineItem({
  variant,
  top = false,
  number,
  name,
  meta,
  summary,
  tools,
  children,
  titleLevel = 3,
  testId,
  foldLabel,
  startsOpen = true,
}: {
  variant: 'group' | 'card'
  /** A group at the top of the outline, drawn as an arc rather than a chapter. */
  top?: boolean
  number: number
  name: ReactNode
  meta?: ReactNode
  summary?: string | null
  tools?: ReactNode
  children?: ReactNode
  titleLevel?: TitleLevel
  testId: string
  /** What the fold toggle names, in words. */
  foldLabel: string
  startsOpen?: boolean
}) {
  const headingId = useId()
  const Title = `h${titleLevel}` as const
  const { open, setOpen, ref, bodyId } = useFold<HTMLElement>(startsOpen)

  if (variant === 'card') {
    return (
      <li className="scene" data-testid={testId}>
        <span className="scene__number" aria-hidden="true">
          {number}
        </span>
        <div className="scene__body">
          <div className="scene__titlerow">
            <Title className="scene__title" id={headingId}>
              <bdi>{name}</bdi>
            </Title>
          </div>
          {meta ? <QuietNote className="chapter__meta">{meta}</QuietNote> : null}
          {summary ? <p className="scene__summary prose">{summary}</p> : null}
          {children}
        </div>
        {tools ? <div className="scene__tools rowtools">{tools}</div> : null}
      </li>
    )
  }

  const block = top ? 'plotarc' : 'chapter'
  return (
    <li data-testid={testId}>
      <section
        ref={ref}
        className={block}
        aria-labelledby={headingId}
        data-open={open ? 'true' : undefined}
      >
        <header className={`${block}__head`}>
          <div className="chapter__heading">
            <FoldToggle
              open={open}
              onToggle={setOpen}
              controls={bodyId}
              label={foldLabel}
              testId={`${testId}-toggle`}
            />
            <Title className={`${block}__title`} id={headingId}>
              <span className={`${block}__number`}>{number}</span>
              <span className={`${block}__dash`}>: </span>
              <span className={`${block}__name`}>
                <bdi>{name}</bdi>
              </span>
            </Title>
            {meta ? <p className={`${block}__meta`}>{meta}</p> : null}
          </div>
          {tools ? <div className={`${block}__tools rowtools`}>{tools}</div> : null}
          {summary ? (
            <p
              className={top ? 'plotarc__description prose' : 'chapter__summary prose'}
              hidden={!open}
              data-fold={bodyId}
            >
              {summary}
            </p>
          ) : null}
        </header>
        <div id={bodyId} hidden={!open} data-fold={bodyId}>
          {children}
        </div>
      </section>
    </li>
  )
}
