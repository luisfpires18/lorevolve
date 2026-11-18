import { Plus, type LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from './Button'

type NewButtonProps = Omit<ButtonProps, 'tone' | 'icon'> & {
  /** Head and empty state: primary (the default). A repeated Add in a row or list: secondary. */
  tone?: 'primary' | 'secondary'
  /** Only for a different glyph than the Plus. */
  icon?: LucideIcon
}

/**
 * The button that makes something: "New map", "Add section". Always the Plus, never a text button.
 * Every other `Button` prop passes through. Catalogue: `docs/design/ui-components.md`.
 */
export function NewButton({ tone = 'primary', icon = Plus, ...props }: NewButtonProps) {
  return <Button {...(props as ButtonProps)} tone={tone} icon={icon} />
}
