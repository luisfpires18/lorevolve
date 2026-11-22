import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ActionIcon } from './ActionIcon'

type Look = 'idea' | 'rule' | 'story'

/** Each list's own excerpt: the idea and project text is prose, a rule's follows its own direction. */
const EXCERPT: Record<Look, { className: string; dir?: 'auto' }> = {
  idea: { className: 'idearow__excerpt prose' },
  rule: { className: 'rulerow__excerpt', dir: 'auto' },
  story: { className: 'storyrow__premise prose' },
}

/**
 * A list row that opens as a whole: the title is the one link, stretched over the row by `.rowlink`,
 * so the link's name stays the title. Without `to` the title is text (a deleted idea, a definition)
 * and `aside` may hold the row's one control, such as Restore. `look` keeps each list's own layout:
 * an idea row has a side column, a rule row stacks, a project row puts its facts beside the title.
 *
 * Button mode (rule rows): `onOpen` makes the title a button that opens a drawer, named by `openLabel`;
 * `onToggle` makes it a chevron button that folds the panel `controls` in `children`, open while `expanded`.
 * `children` sit below the meta, `aside` after them.
 */
export function LinkRow({
  look,
  to,
  title,
  titleTestId,
  excerpt,
  excerptTestId,
  meta,
  aside,
  testId,
  onOpen,
  openLabel,
  expanded,
  controls,
  onToggle,
  isolate = true,
  excerptDirAuto = EXCERPT[look].dir === 'auto',
  metaDirAuto = false,
  children,
  ...data
}: {
  look: Look
  to?: string
  title: string
  titleTestId?: string
  excerpt?: ReactNode
  excerptTestId?: string
  meta: ReactNode
  aside?: ReactNode
  testId: string
  onOpen?: () => void
  openLabel?: string
  expanded?: boolean
  controls?: string
  onToggle?: () => void
  /** False leaves a fixed label out of `<bdi>` (the machine binding row). */
  isolate?: boolean
  excerptDirAuto?: boolean
  metaDirAuto?: boolean
  children?: ReactNode
  [dataAttribute: `data-${string}`]: string | number | undefined
}) {
  const titleText = isolate ? <bdi>{title}</bdi> : title
  const titleNode = onOpen ? (
    <button
      className="rulerow__title rulerow__toggle"
      type="button"
      aria-label={openLabel}
      onClick={onOpen}
      data-testid={titleTestId}
    >
      {titleText}
    </button>
  ) : onToggle ? (
    <button
      className="rulerow__title rulerow__toggle"
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      data-testid={titleTestId}
    >
      <ActionIcon icon={expanded ? ChevronDown : ChevronRight} />
      {titleText}
    </button>
  ) : to ? (
    <Link className={`${look}row__title rowlink__target`} to={to} data-testid={titleTestId}>
      <bdi>{title}</bdi>
    </Link>
  ) : (
    <p className={`${look}row__title`}>
      <bdi>{title}</bdi>
    </p>
  )
  const excerptNode = excerpt ? (
    <p
      className={EXCERPT[look].className}
      dir={excerptDirAuto ? 'auto' : undefined}
      data-testid={excerptTestId}
    >
      {excerpt}
    </p>
  ) : null
  const metaNode = (
    <p className={`${look}row__meta`} dir={metaDirAuto ? 'auto' : undefined}>
      {meta}
    </p>
  )

  return (
    <li className={to ? `${look}row rowlink` : `${look}row`} data-testid={testId} {...data}>
      {look === 'idea' ? (
        <div className="idearow__main">
          {titleNode}
          {excerptNode}
          {metaNode}
        </div>
      ) : look === 'story' ? (
        <>
          {titleNode}
          {metaNode}
          {excerptNode}
        </>
      ) : (
        <>
          {titleNode}
          {excerptNode}
          {metaNode}
        </>
      )}
      {children}
      {aside}
    </li>
  )
}
