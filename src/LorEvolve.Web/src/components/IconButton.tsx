import type { ComponentPropsWithRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { iconButtonClass, type IconButtonSize } from '../lib/buttonClass'

export type IconButtonProps = Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'className' | 'title' | 'aria-label'
> & {
  icon: LucideIcon
  /** The accessible name, required: an icon alone names nothing. */
  label: string
  /** The hover tip; defaults to the label. */
  title?: string
  size?: IconButtonSize
  className?: string
}

/**
 * A button that is one icon (`.iconbutton` in `styles/006-buttons.css`). The label names it for
 * assistive technology and, unless `title` says otherwise, is the hover tip. `type` defaults to
 * `button`; every other native attribute and `ref` pass through. Catalogue:
 * `docs/design/ui-components.md`.
 */
export function IconButton({
  icon: Icon,
  label,
  title,
  size,
  className,
  type,
  ...native
}: IconButtonProps) {
  return (
    <button
      {...native}
      type={type ?? 'button'}
      className={iconButtonClass({ size, className })}
      aria-label={label}
      title={title ?? label}
    >
      <Icon aria-hidden="true" focusable="false" strokeWidth={1.75} />
    </button>
  )
}
