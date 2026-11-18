/**
 * The one map from a button's look to its CSS classes (`styles/006-buttons.css`).
 *
 * `components/Button.tsx` and `components/IconButton.tsx` call it, and so do the two parts that
 * cannot render a component: a file input's `<label>` and `ActionMenu`'s trigger. Nothing else
 * writes the class names `button` or `iconbutton` (`uiContract.test.ts` fails on it).
 *
 * To add a tone or a size: add the member to its union, add its entry to the map below (the
 * typecheck fails until it exists), add the `.button--<name>` rule, and add a case to
 * `buttonClass.test.ts`.
 */
export type ButtonTone = 'primary' | 'secondary' | 'text' | 'danger' | 'danger-quiet'
export type ButtonSize = 'md' | 'sm'
export type IconButtonSize = 'sm'

export const TONE: Record<ButtonTone, string> = {
  primary: '',
  secondary: 'button--secondary',
  text: 'button--text',
  danger: 'button--danger',
  'danger-quiet': 'button--secondary button--danger-quiet',
}
export const SIZE: Record<ButtonSize, string> = { md: '', sm: 'button--sm' }
export const ICON_SIZE: Record<IconButtonSize, string> = { sm: '' }

export interface ButtonLook {
  tone?: ButtonTone
  size?: ButtonSize
  /** Layout or hook classes of the screen, after the family's own. */
  className?: string
}

export function buttonClass({ tone = 'primary', size = 'md', className }: ButtonLook = {}) {
  return ['button', TONE[tone], SIZE[size], className].filter(Boolean).join(' ')
}

export function iconButtonClass({
  size = 'sm',
  className,
}: { size?: IconButtonSize; className?: string } = {}) {
  return ['iconbutton', ICON_SIZE[size], className].filter(Boolean).join(' ')
}
