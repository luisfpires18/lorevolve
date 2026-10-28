import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { FieldSection } from '../lore/types'

interface FieldSectionFoldProps {
  section: FieldSection
  open: boolean
  onToggle: (open: boolean) => void
  /** A short line after the name - how many fields, how many required - so a folded section still says what it holds. */
  meta?: ReactNode
  /** Something inside needs the author: the fold is marked, and says so in `meta`. */
  attention?: boolean
  children: ReactNode
}

/**
 * One section of a type's fields (Issue #26) as a native disclosure: its summary is the name and what it holds, and the
 * browser's own `<details>` gives the keyboard and screen reader behaviour. Open or folded is the reader's, for now only:
 * `open` comes from the page, which starts it from the section's `startsCollapsed` and never stores a toggle.
 */
export function FieldSectionFold({
  section,
  open,
  onToggle,
  meta,
  attention = false,
  children,
}: FieldSectionFoldProps) {
  return (
    <details
      className="fieldsection"
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) onToggle(event.currentTarget.open)
      }}
      data-attention={attention ? 'true' : undefined}
      data-testid={`field-section-${section.name}`}
    >
      <summary className="fieldsection__summary">
        <ChevronRight
          className="fieldsection__chevron"
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
        />
        <span className="fieldsection__name">
          <bdi>{section.name}</bdi>
        </span>
        {meta ? <span className="fieldsection__meta">{meta}</span> : null}
      </summary>
      <div className="fieldsection__body">{children}</div>
    </details>
  )
}
