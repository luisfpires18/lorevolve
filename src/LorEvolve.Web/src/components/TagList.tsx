export type Tag = string | { text: string; tone: 'danger' }

/** Tags as small chips that wrap: an entry's tags, a user's role, a template's mark. Text only, nothing to press. */
export function TagList({
  tags,
  look = 'square',
  className,
  testId,
}: {
  tags: readonly Tag[]
  /** `round` for a status-like pill (a role), `square` for a tag. */
  look?: 'square' | 'round'
  /** Extra classes a screen places this by (margin). */
  className?: string
  testId?: string
}) {
  return (
    <span className={['taglist', className].filter(Boolean).join(' ')} data-testid={testId}>
      {tags.map((tag) => {
        const { text, tone } = typeof tag === 'string' ? { text: tag, tone: undefined } : tag
        const classes = [
          'chip',
          look === 'round' ? 'chip--round' : null,
          tone ? 'chip--danger' : null,
        ]
        return (
          <span className={classes.filter(Boolean).join(' ')} key={text}>
            {text}
          </span>
        )
      })}
    </span>
  )
}
