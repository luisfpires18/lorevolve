import type { ReactNode } from 'react'
import { Pencil, Trash, type LucideIcon } from 'lucide-react'
import { ActionMenu, ActionMenuItem } from './ActionMenu'

interface RowMenuProps {
  /** The trigger's accessible name. Say whose: "More actions for The door that should be shut". */
  label: string
  triggerTestId?: string
  /** Extra classes on the menu root and its panel, for where the panel hangs from. */
  className?: string
  panelClassName?: string

  /** The Edit item, first. Left out where the row has no edit verb. */
  onEdit?: () => void
  editLabel?: string
  editTestId?: string

  /** The danger item, last. Left out where the person may not remove the row. */
  onRemove?: () => void
  removeLabel?: string
  removeTestId?: string
  /** `Trash` unless the place has always drawn the other bin. */
  removeIcon?: LucideIcon
  /** Draws the `.actionmenu__divider` above the remove item, where the place always had one. */
  divided?: boolean

  /** Disables Edit and Remove together, while the row saves or a move is under way. */
  busy?: boolean

  /** The items between the two: `MoveItems`, a "move to" list, a verb of the row's own. */
  children?: ReactNode
}

/**
 * The `...` menu of a row: an `ActionMenu` with Edit first, the row's own items, then the danger
 * Remove. Pass only the verbs the row has; each missing handler leaves that item out.
 */
export function RowMenu({
  label,
  triggerTestId,
  className,
  panelClassName,
  onEdit,
  editLabel,
  editTestId,
  onRemove,
  removeLabel,
  removeTestId,
  removeIcon = Trash,
  divided,
  busy,
  children,
}: RowMenuProps) {
  return (
    <ActionMenu
      label={label}
      triggerTestId={triggerTestId}
      className={className}
      panelClassName={panelClassName}
    >
      {onEdit ? (
        <ActionMenuItem icon={Pencil} disabled={busy} onClick={onEdit} testId={editTestId}>
          {editLabel}
        </ActionMenuItem>
      ) : null}
      {children}
      {onRemove ? (
        <>
          {divided ? <hr className="actionmenu__divider" /> : null}
          <ActionMenuItem
            icon={removeIcon}
            tone="danger"
            disabled={busy}
            onClick={onRemove}
            testId={removeTestId}
          >
            {removeLabel}
          </ActionMenuItem>
        </>
      ) : null}
    </ActionMenu>
  )
}
