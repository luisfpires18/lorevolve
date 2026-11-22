import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type DataAttributes = { [key: `data-${string}`]: string | undefined }

/**
 * One chosen thing in a picker, as a removable chip: what the caller puts in it (a name in a `<bdi>`), a quiet `note`
 * after it ("in Trash", the scene's story), and the X that removes it, named by `removeLabel`. `as` is the element the
 * list around it needs: `li` in a list, `span` among an input's chips, `p` for a single pick. `removeIcon` replaces the
 * X. Any `data-*` passes through. Catalogue: docs/design/ui-components.md.
 */
export function Token({
  children,
  note,
  removeLabel,
  onRemove,
  removeIcon = <X aria-hidden="true" focusable="false" size={14} strokeWidth={1.75} />,
  testId,
  removeTestId,
  as: Tag = 'span',
  ...data
}: {
  children: ReactNode
  note?: ReactNode
  removeLabel: string
  onRemove: () => void
  removeIcon?: ReactNode
  testId?: string
  removeTestId?: string
  as?: 'li' | 'span' | 'p'
} & DataAttributes) {
  return (
    <Tag className="token" data-testid={testId} {...data}>
      {children}
      {note ? <span className="token__note"> {note}</span> : null}
      <button
        type="button"
        className="token__remove"
        aria-label={removeLabel}
        onClick={onRemove}
        data-testid={removeTestId}
      >
        {removeIcon}
      </button>
    </Tag>
  )
}

/** The row of chosen things around `Token as="li"` children. The caller draws it only when something is chosen. */
export function TokenList({ children }: { children: ReactNode }) {
  return <ul className="storylinks__list">{children}</ul>
}
