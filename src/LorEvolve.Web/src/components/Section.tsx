import type { ComponentProps, ReactNode } from 'react'

type Level = 2 | 3 | 4

/**
 * The heading of a block on a screen. `tone="section"` is the body-size heading of a titled block; `tone="label"` is a
 * small muted label over a list. Every other attribute (`id`, `ref`, `tabIndex`, `dir`) passes through to the heading.
 */
export function SectionTitle({
  level = 2,
  tone = 'section',
  size,
  className,
  ...rest
}: Omit<ComponentProps<'h2'>, 'children'> & {
  level?: Level
  tone?: 'section' | 'label'
  size?: 'xs'
  children?: ReactNode
}) {
  const Tag = `h${level}` as 'h2'
  const classes = [
    'sectiontitle',
    tone === 'label' && 'sectiontitle--label',
    size && `sectiontitle--${size}`,
    className,
  ]
  return <Tag className={classes.filter(Boolean).join(' ')} {...rest} />
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
  title: ReactNode
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
      <SectionTitle level={level} id={titleId} {...titleProps}>
        {title}
      </SectionTitle>
      {children}
    </section>
  )
}
