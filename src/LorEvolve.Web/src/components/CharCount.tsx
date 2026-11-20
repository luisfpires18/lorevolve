import { useI18n } from '../i18n'
import type { TextKey } from '../i18n/core'
import { formatCount } from '../i18n/format'
import type { Dictionary } from '../i18n/en'

type Key = TextKey<Dictionary>

export interface CharCountProps {
  id: string
  used: number
  max: number
  /** `near` above 90% of `max`, `over` only above it, `always`. */
  show: 'near' | 'over' | 'always'
  /** Keys taking `{used}` and `{max}`: `count` while within the limit, `tooLong` above it. */
  words: { count?: Key; tooLong: Key }
  /** Extra classes on the paragraph. */
  className?: string
  testId?: string
}

const NEAR = 0.9

/** Whether a count with these numbers is drawn at all. */
export function countShows({ used, max, show }: Pick<CharCountProps, 'used' | 'max' | 'show'>) {
  if (show === 'always') return true
  if (show === 'over') return used > max
  return used > max * NEAR
}

/** A count against a limit: a hint while within it, an error above it. */
export function CharCount({ id, used, max, show, words, className, testId }: CharCountProps) {
  const { t } = useI18n()
  if (!countShows({ used, max, show })) return null
  const over = used > max
  const key = over ? words.tooLong : (words.count ?? words.tooLong)
  return (
    <p
      className={[over ? 'field__error' : 'field__hint', className].filter(Boolean).join(' ')}
      id={id}
      data-testid={testId}
    >
      {t(key, { used: formatCount(used), max: formatCount(max) })}
    </p>
  )
}
