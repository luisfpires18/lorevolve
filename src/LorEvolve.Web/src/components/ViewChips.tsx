import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export interface ViewChip {
  to: string
  label: string
  icon: LucideIcon
  testId: string
  /** Active only on this exact address, not on the addresses below it. */
  end?: boolean
}

/**
 * The views of one object as a row of Lore's group chips (#377). A project's sections and a story-backed project's
 * Structure and Manuscript use the same row, so every kind reads alike. They are links, so the browser owns history.
 */
export function ViewChips({
  label,
  testId,
  items,
}: {
  label: string
  testId: string
  items: readonly ViewChip[]
}) {
  return (
    <nav className="lorecatalog__groups" aria-label={label} data-testid={testId}>
      {items.map((item) => (
        <NavLink
          key={item.testId}
          className="lorecatalog__group"
          to={item.to}
          end={item.end}
          data-testid={item.testId}
        >
          <item.icon
            className="lorecatalog__groupicon"
            aria-hidden="true"
            focusable="false"
            strokeWidth={1.75}
          />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
