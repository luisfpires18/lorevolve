import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Button, type ButtonProps } from './Button'

type NativeButtonProps = Extract<ButtonProps, { to?: never }>

/**
 * A button that shows and hides a region: `aria-expanded` and `aria-controls` always together,
 * and the words swap with the state (View and Hide unless the caller says otherwise). Every other
 * `Button` prop passes through. Not a New that opens a form (`NewButton`) and not a section fold
 * (`FoldToggle`). Catalogue: `docs/design/ui-components.md`.
 */
export function DisclosureButton({
  expanded,
  controls,
  onToggle,
  children,
  expandedLabel,
  ...button
}: Omit<NativeButtonProps, 'aria-expanded' | 'aria-controls' | 'onClick' | 'children' | 'to'> & {
  expanded: boolean
  /** The id of the region it shows and hides. */
  controls: string
  onToggle: () => void
  /** The closed words; View when absent. */
  children?: ReactNode
  /** The open words; Hide when `children` is absent, else the same as `children`. */
  expandedLabel?: ReactNode
}) {
  const { t } = useI18n()
  const closed = children ?? t('shell.actions.view')
  const open = expandedLabel ?? (children === undefined ? t('shell.actions.hide') : children)
  return (
    <Button {...button} aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      {expanded ? open : closed}
    </Button>
  )
}
