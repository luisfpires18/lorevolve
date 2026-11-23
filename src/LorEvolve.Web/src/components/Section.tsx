import type { ComponentProps, ReactNode } from 'react'

type Level = 2 | 3 | 4

/**
 * The heading of a block on a screen. `tone="section"` is the body-size heading of a titled block; `tone="label"` is a
 * small muted label over a list; `tone="rule"` opens a group in tracked capitals with a hairline running on to the end
 * of the row, and `rule-accent` is that rule smaller, in the accent, over something read or filled in place. Every other
 * attribute (`id`, `ref`, `tabIndex`, `dir`, `data-*`) passes through to the heading.
 */
export function SectionTitle({
  level = 2,
  tone = 'section',
  size,
  className,
  children,
  ...rest
}: Omit<ComponentProps<'h2'>, 'children'> & {
  level?: Level
  tone?: 'section' | 'label' | 'rule' | 'rule-accent'
  size?: 'xs'
  children?: ReactNode
}) {
  const Tag = `h${level}` as 'h2'
  const isRule = tone === 'rule' || tone === 'rule-accent'
  const classes = [
    isRule ? 'sectionrule' : 'sectiontitle',
    tone === 'rule-accent' && 'sectionrule--accent',
    tone === 'label' && 'sectiontitle--label',
    size && `sectiontitle--${size}`,
    className,
  ]
  // A rule is a flex row: one span keeps a title built from several pieces (a name in a sentence) one item beside the line.
  return (
    <Tag className={classes.filter(Boolean).join(' ')} {...rest}>
      {isRule ? <span>{children}</span> : children}
    </Tag>
  )
}

/**
 * A titled block of a screen: a `section` with its heading. `rule` (the default) puts a hairline above it and room around
 * it, none above the first (`section--ruled`); `rule={false}` is a block that only keeps a margin above. `narrow` keeps the 34rem measure a
 * settings form reads at; `tone="danger"` is the ruled, bordered panel. `titleId` names the section by its heading
 * (`aria-labelledby`); without one the block is not a region. Catalogue: `docs/design/ui-components.md`.
 */
export function Section({
  title,
  titleId,
  id,
  level = 2,
  tone = 'default',
  rule = true,
  narrow,
  testId,
  className,
  titleProps,
  children,
}: {
  /** Left out when the block opens with a `PageHeader level={2} size="panel"` of its own (pass its `titleId` here too). */
  title?: ReactNode
  titleId?: string
  /** The section's own id, for an anchor. */
  id?: string
  level?: Level
  tone?: 'default' | 'danger'
  rule?: boolean
  narrow?: boolean
  testId?: string
  className?: string
  /** More for the heading: a `ref` and `tabIndex` to move focus to it, `dir`. */
  titleProps?: Omit<ComponentProps<typeof SectionTitle>, 'level' | 'children' | 'id'>
  children?: ReactNode
}) {
  const classes = [
    'section',
    rule ? 'section--ruled' : 'section--bare',
    narrow && 'section--narrow',
    tone === 'danger' && 'section--danger',
    className,
  ]
  return (
    <section
      className={classes.filter(Boolean).join(' ')}
      id={id}
      aria-labelledby={titleId}
      data-testid={testId}
    >
      {title === undefined ? null : (
        <SectionTitle level={level} id={titleId} {...titleProps}>
          {title}
        </SectionTitle>
      )}
      {children}
    </section>
  )
}

/**
 * A drawer's named part: `section.drawer__group` named by its level 3 `rule-accent` heading. Not a `Section` prop, since
 * a drawer part swaps every class and the level. An undefined `testId` writes no attribute.
 */
export function DrawerSection({
  title,
  titleId,
  testId,
  children,
}: {
  title: ReactNode
  titleId: string
  testId?: string
  children?: ReactNode
}) {
  return (
    <section className="drawer__group" aria-labelledby={titleId} data-testid={testId}>
      <SectionTitle level={3} tone="rule-accent" id={titleId}>
        {title}
      </SectionTitle>
      {children}
    </section>
  )
}
