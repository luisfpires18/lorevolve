import type { ReactNode } from 'react'
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

/** A chip that chooses what the page lists, rather than a place to go. */
export interface ViewChipButton {
  pressed: boolean
  onSelect: () => void
  label: ReactNode
  icon?: LucideIcon
  /** Drawn after the label and hidden from assistive technology. */
  count?: number
  /** Read after the label and not drawn, for example "group". */
  hiddenSuffix?: string
  testId: string
  /** Extra `data-` attributes the page reads back. */
  data?: Record<`data-${string}`, string>
}

function ChipIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      className="lorecatalog__groupicon"
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.75}
    />
  )
}

/**
 * The views of one object as a row of Lore's group chips (#377). A project's sections and a story-backed project's
 * Structure and Manuscript use the same row, so every kind reads alike. They are links, so the browser owns history.
 * With button items it is a choice of what the page lists (Lore's groups): each `aria-pressed`, with its count.
 */
export function ViewChips({
  label,
  testId,
  items,
}: {
  label: string
  testId: string
  items: readonly ViewChip[] | readonly ViewChipButton[]
}) {
  if (items.some((item) => 'onSelect' in item)) {
    return (
      <div className="lorecatalog__groups" role="group" aria-label={label} data-testid={testId}>
        {(items as readonly ViewChipButton[]).map((item, index) => (
          <button
            key={index}
            className="lorecatalog__group"
            type="button"
            aria-pressed={item.pressed}
            onClick={item.onSelect}
            data-testid={item.testId}
            {...item.data}
          >
            {item.icon ? <ChipIcon icon={item.icon} /> : null}
            {item.label}
            {item.hiddenSuffix ? (
              <span className="visually-hidden"> {item.hiddenSuffix}</span>
            ) : null}
            {item.count === undefined ? null : (
              <span className="lorecatalog__groupcount" aria-hidden="true">
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }
  return (
    <nav className="lorecatalog__groups" aria-label={label} data-testid={testId}>
      {(items as readonly ViewChip[]).map((item) => (
        <NavLink
          key={item.testId}
          className="lorecatalog__group"
          to={item.to}
          end={item.end}
          data-testid={item.testId}
        >
          <ChipIcon icon={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
