import { CANON_LABELS, type CanonStatusValue } from '../lore/types'
import { StatusBadge } from './StatusBadge'

/** A lore status (Idea, Draft, Canon) as the quiet step badge, worded the way lore words it everywhere. */
export function CanonBadge({
  status,
  label,
  className,
  testId,
}: {
  status: CanonStatusValue
  /** A sentence around the status instead of its bare word, such as "{status} relationship". */
  label?: string
  className?: string
  testId?: string
}) {
  return (
    <StatusBadge
      step={status}
      label={label ?? CANON_LABELS[status]}
      className={className}
      testId={testId}
    />
  )
}
