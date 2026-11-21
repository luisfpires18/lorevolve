import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useUniverseAccess } from '../../universes/access'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { PanelHead } from '../PanelHead'

/**
 * The forms, abilities or appearances on the main profile: the label head with its add button for an editor, the empty
 * line, or the rows. Hidden from a reader when there is nothing. Ids `${kind}-list`, `${kind}-list-heading`, `add-${kind}`.
 */
export function ProgressionSection({
  kind,
  title,
  addLabel,
  addIcon,
  empty,
  count,
  busy,
  onAdd,
  children,
}: {
  kind: 'form' | 'ability' | 'appearance'
  title: string
  addLabel: string
  addIcon?: LucideIcon
  empty: string
  count: number
  busy: boolean
  onAdd: () => void
  /** The `ItemRow`s. */
  children: ReactNode
}) {
  const access = useUniverseAccess()
  const headingId = `${kind}-list-heading`

  if (count === 0 && !access.editContent) return null

  return (
    <section className="stack stack--3" aria-labelledby={headingId} data-testid={`${kind}-list`}>
      <PanelHead
        look="label"
        level={3}
        align="start"
        titleId={headingId}
        title={title}
        action={
          access.editContent ? (
            <NewButton
              tone="secondary"
              size="sm"
              icon={addIcon}
              onClick={onAdd}
              disabled={busy}
              data-testid={`add-${kind}`}
            >
              {addLabel}
            </NewButton>
          ) : null
        }
      />
      {count === 0 ? (
        <QuietNote>{empty}</QuietNote>
      ) : (
        <ul className="plainlist stack">{children}</ul>
      )}
    </section>
  )
}
