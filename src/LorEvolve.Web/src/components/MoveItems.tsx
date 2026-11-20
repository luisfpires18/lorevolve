import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useI18n } from '../i18n'
import { ActionMenuItem } from './ActionMenu'
import { Button } from './Button'
import { IconButton } from './IconButton'

export type MoveDirection = 'up' | 'down'

const WORDS = {
  'up-down': {
    up: { plain: 'shell.actions.moveUp', named: 'shell.actions.moveUpNamed' },
    down: { plain: 'shell.actions.moveDown', named: 'shell.actions.moveDownNamed' },
  },
  'earlier-later': {
    up: {
      plain: 'shell.actions.moveEarlier',
      named: 'shell.actions.moveEarlierNamed',
      word: 'shell.actions.earlier',
    },
    down: {
      plain: 'shell.actions.moveLater',
      named: 'shell.actions.moveLaterNamed',
      word: 'shell.actions.later',
    },
  },
} as const

interface MoveBase {
  /** The item is first: no way up (or earlier). */
  first: boolean
  /** The item is last: no way down (or later). */
  last: boolean
  /** -1 for up or earlier, 1 for down or later. A caller that moves by place passes `index + step`. */
  onMove: (step: -1 | 1) => void
  /** A move is being saved: both are disabled (menu) or ignored (buttons). */
  busy?: boolean
  wording?: 'up-down' | 'earlier-later'
  /** `horizontal` draws left and right arrows, for items in a row. */
  axis?: 'vertical' | 'horizontal'
  testIds?: { up: string; down: string }
}

interface MenuLook extends MoveBase {
  look?: 'menu'
  /** `hide` (the default) leaves out the item at an end; `disable` keeps it, disabled. */
  edge?: 'hide' | 'disable'
  itemClassName?: string
}

interface ButtonLook extends MoveBase {
  /** `icon`: two square arrows; `labelled`: two small secondary buttons with a word. */
  look: 'icon' | 'labelled'
  /** What moves, read in each button's name: "Move {name} up". */
  name: string
  /** Keeps each button, so the focus can come back to it after a move. */
  buttonRef?: (direction: MoveDirection, element: HTMLButtonElement | null) => void
  /** Wraps the pair in a named group. */
  groupLabel?: string
  groupClassName?: string
  /** The hover tip at each end, saying why the arrow does nothing. */
  endTitles?: { first: string; last: string }
  /** The hover tip away from the ends, when the list has its own word for it ("Earlier"). */
  titles?: { up: string; down: string }
}

/**
 * Move one item of an ordered list one place: Move up and Move down (or earlier and later) as
 * menu items, or as a pair of buttons beside the item. Drag handles stay `LoreReorderHandle` and
 * `TypeReorderHandle`. Catalogue: `docs/design/ui-components.md`.
 */
export function MoveItems(props: MenuLook | ButtonLook) {
  const { t } = useI18n()
  const { first, last, onMove, busy, wording = 'up-down', axis = 'vertical', testIds } = props
  const icons =
    axis === 'horizontal' ? { up: ArrowLeft, down: ArrowRight } : { up: ArrowUp, down: ArrowDown }
  const directions = ['up', 'down'] as const
  const atEnd = (direction: MoveDirection) => (direction === 'up' ? first : last)
  const step = (direction: MoveDirection) => (direction === 'up' ? -1 : 1)

  if (props.look === 'icon' || props.look === 'labelled') {
    const { look, name, buttonRef, groupLabel, groupClassName, endTitles, titles } = props
    const buttons = directions.map((direction) => {
      const end = atEnd(direction)
      const words = WORDS[wording][direction]
      const common = {
        ref: (element: HTMLButtonElement | null) => buttonRef?.(direction, element),
        'aria-disabled': end || busy || undefined,
        onClick: () => {
          if (!end && !busy) onMove(step(direction))
        },
        'data-testid': testIds?.[direction],
      }
      const tip =
        end && endTitles ? endTitles[direction === 'up' ? 'first' : 'last'] : titles?.[direction]
      return look === 'icon' ? (
        <IconButton
          key={direction}
          {...common}
          icon={icons[direction]}
          label={t(words.named, { name })}
          title={tip ?? t(words.plain)}
        />
      ) : (
        <Button
          key={direction}
          {...common}
          tone="secondary"
          size="sm"
          icon={icons[direction]}
          aria-label={t(words.named, { name })}
          title={tip}
        >
          {'word' in words ? t(words.word) : t(words.plain)}
        </Button>
      )
    })
    return groupLabel === undefined && groupClassName === undefined ? (
      <>{buttons}</>
    ) : (
      <span className={groupClassName} role="group" aria-label={groupLabel}>
        {buttons}
      </span>
    )
  }

  const { edge = 'hide', itemClassName } = props as MenuLook
  return (
    <>
      {directions.map((direction) =>
        edge === 'hide' && atEnd(direction) ? null : (
          <ActionMenuItem
            key={direction}
            icon={icons[direction]}
            className={itemClassName}
            disabled={busy || (edge === 'disable' && atEnd(direction)) || undefined}
            onClick={() => onMove(step(direction))}
            testId={testIds?.[direction]}
          >
            {t(WORDS[wording][direction].plain)}
          </ActionMenuItem>
        ),
      )}
    </>
  )
}
