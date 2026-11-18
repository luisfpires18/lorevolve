import type { ComponentPropsWithRef, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonClass, type ButtonSize, type ButtonTone } from '../lib/buttonClass'
import { ActionIcon } from './ActionIcon'

interface ButtonOwnProps {
  /** How loud: primary (the default), secondary, text, danger, danger-quiet. */
  tone?: ButtonTone
  /** md (the default) or sm, a row's own tools. */
  size?: ButtonSize
  /** Drawn first, through ActionIcon: decorative, the label names the action. */
  icon?: LucideIcon
  /** Layout or hook classes kept from the screen. */
  className?: string
  children?: ReactNode
}

type NativeButton = Omit<ComponentPropsWithRef<'button'>, keyof ButtonOwnProps>
type RouterLink = Omit<ComponentPropsWithRef<typeof Link>, keyof ButtonOwnProps>

export type ButtonProps =
  | (ButtonOwnProps &
      NativeButton & {
        to?: never
        /** While true: aria-busy="true", disabled, and busyLabel in place of the children. */
        busy?: boolean
        busyLabel?: ReactNode
      })
  | (ButtonOwnProps & RouterLink & { busy?: never; busyLabel?: never })

/**
 * The one button of LorEvolve (`.button` in `styles/006-buttons.css`): a `<button>`, or a router
 * `Link` when `to` is given. Tone, size, leading icon and busy state are props; every native
 * attribute and `ref` pass through. `type` defaults to `button`: write `type="submit"` for a form's
 * submit. Catalogue: `docs/design/ui-components.md`.
 */
export function Button(props: ButtonProps) {
  if (props.to !== undefined) {
    const { tone, size, icon, className, children, ...link } = props
    return (
      <Link {...link} className={buttonClass({ tone, size, className })}>
        {icon ? <ActionIcon icon={icon} /> : null}
        {children}
      </Link>
    )
  }
  const { tone, size, icon, className, children, busy, busyLabel, type, disabled, ...native } =
    props
  return (
    <button
      {...native}
      {...(busy === undefined ? null : { 'aria-busy': busy })}
      disabled={busy === undefined ? disabled : busy || disabled}
      type={type ?? 'button'}
      className={buttonClass({ tone, size, className })}
    >
      {icon ? <ActionIcon icon={icon} /> : null}
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  )
}
