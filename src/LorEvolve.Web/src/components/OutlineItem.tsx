import { useId, type ReactNode, type RefObject } from 'react'
import { FoldToggle } from './FoldToggle'
import { useFold } from './fold'
import { QuietNote } from './QuietNote'

type TitleLevel = 3 | 4 | 5 | 6
type Fold = ReturnType<typeof useFold<HTMLElement>>

/**
 * One node of an outline in the Stories look (#377): a group reads as a story's arc (`top`) or chapter, a node with
 * nothing under it reads as a scene card. Presentational only: the caller owns the data, the tools and the list
 * around it. It renders the list item itself, so an outline stays `ol > li` with the caller's test id on the `li`;
 * Stories place their arcs and chapters as bare sections (`item={false}`), the test id then on the section (#413).
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
  fold: callerFold,
  foldable = false,
  lead,
  item = true,
  anchorId,
  dataTitle,
  titleId,
  titleLabel,
  titleTestId,
  metaTestId,
  summaryTestId,
  empty,
}: {
  variant: 'group' | 'card'
  /** A group at the top of the outline, drawn as an arc rather than a chapter. */
  top?: boolean
  number: ReactNode
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
  /** The caller's `useFold`, so its own tools can open the fold. A card folds only when this is given. */
  fold?: Fold
  /** A card with something under its title: it shows the fold toggle. */
  foldable?: boolean
  /** A card's line over its title (a scene's stamp). */
  lead?: ReactNode
  /** False: a group drawn as a bare `section`, not inside a list item. */
  item?: boolean
  /** The root's `id`, which also lets a link land the focus on it. */
  anchorId?: string
  dataTitle?: string
  /** The heading's id, when the caller's tools name themselves by it. */
  titleId?: string
  /** The heading's accessible name, when it is not its text. */
  titleLabel?: string
  titleTestId?: string
  metaTestId?: string
  summaryTestId?: string
  /** A group's line when it holds nothing yet; drawn instead of the children. */
  empty?: string
}) {
  const ownHeadingId = useId()
  const headingId = titleId ?? ownHeadingId
  const Title = `h${titleLevel}` as const
  const ownFold = useFold<HTMLElement>(startsOpen)
  const { open, setOpen, ref, bodyId } = callerFold ?? ownFold
  const anchor = anchorId ? { id: anchorId, tabIndex: -1 } : {}

  if (variant === 'card') {
    const toggle =
      callerFold && foldable ? (
        <FoldToggle
          open={open}
          onToggle={setOpen}
          controls={bodyId}
          label={foldLabel}
          testId={`${testId}-toggle`}
        />
      ) : null
    const body = (
      <>
        {meta ? <QuietNote className="chapter__meta">{meta}</QuietNote> : null}
        {summary ? (
          <p className="scene__summary prose" data-testid={summaryTestId}>
            {summary}
          </p>
        ) : null}
        {children}
      </>
    )
    return (
      <li
        ref={callerFold ? (ref as RefObject<HTMLLIElement>) : undefined}
        className="scene"
        {...anchor}
        data-testid={testId}
        data-title={dataTitle}
      >
        <span className="scene__number" aria-hidden="true">
          {number}
        </span>
        <div className="scene__body">
          {lead}
          <div className="scene__titlerow">
            {toggle}
            <Title
              className="scene__title"
              id={headingId}
              aria-label={titleLabel}
              data-testid={titleTestId}
            >
              <bdi>{name}</bdi>
            </Title>
          </div>
          {callerFold ? (
            <div id={bodyId} hidden={foldable && !open} data-fold={bodyId}>
              {body}
            </div>
          ) : (
            body
          )}
        </div>
        {tools ? <div className="scene__tools rowtools">{tools}</div> : null}
      </li>
    )
  }

  const block = top ? 'plotarc' : 'chapter'
  const section = (
    <section
      ref={ref}
      className={block}
      {...anchor}
      aria-labelledby={headingId}
      data-testid={item ? undefined : testId}
      data-title={dataTitle}
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
          <Title className={`${block}__title`} id={headingId} data-testid={titleTestId}>
            <span className={`${block}__number`}>{number}</span>
            <span className={`${block}__dash`}>: </span>
            <span className={`${block}__name`}>
              <bdi>{name}</bdi>
            </span>
          </Title>
          {meta ? (
            <QuietNote className={`${block}__meta`} testId={metaTestId}>
              {meta}
            </QuietNote>
          ) : null}
        </div>
        {tools ? <div className={`${block}__tools rowtools`}>{tools}</div> : null}
        {summary ? (
          <p
            className={top ? 'plotarc__description prose' : 'chapter__summary prose'}
            hidden={!open}
            data-fold={bodyId}
            data-testid={summaryTestId}
          >
            {summary}
          </p>
        ) : null}
      </header>
      <div id={bodyId} hidden={!open} data-fold={bodyId}>
        {empty ? (
          <p className={`${block}__empty`} data-testid={`${testId}-empty`}>
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
  return item ? <li data-testid={testId}>{section}</li> : section
}
