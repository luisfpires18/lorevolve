import { formatCount } from '../i18n/format'

/**
 * A count set beside a heading's words: muted figures (`quiet`) or the scene's raised pill (`pill`). The figure
 * follows the app's language; `more` adds a plus while there is more to read than is listed. Use it where the
 * count sits inside a sentence or a heading that `SectionTitle` cannot carry.
 */
export function HeadingCount({
  n,
  more,
  look = 'quiet',
  testId,
}: {
  n: number
  /** There is more than `n` still to be loaded. */
  more?: boolean
  look?: 'quiet' | 'pill'
  testId?: string
}) {
  return (
    <span className="headingcount" data-look={look} data-testid={testId}>
      {formatCount(n)}
      {more ? '+' : ''}
    </span>
  )
}
