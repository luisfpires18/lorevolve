import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Ellipsis, type LucideIcon } from 'lucide-react'
import { iconButtonClass } from '../lib/buttonClass'
import { ActionIcon } from './ActionIcon'

interface ActionMenuProps {
  /** The trigger's accessible name. Say whose: "More actions for The door that should be shut". */
  label: string

  /**
   * What the trigger shows. An ellipsis by default, in an `.iconbutton`; the account menu passes
   * its avatar. The `label` is the name either way, and is also the default tooltip.
   */
  trigger?: ReactNode
  triggerClassName?: string

  /** Extra classes on the root and the panel, for where the panel hangs from. */
  className?: string
  panelClassName?: string

  testId?: string
  triggerTestId?: string
  panelTestId?: string

  /**
   * The items: `ActionMenuItem`s (a `<button>`, or a `<Link>` with a `to`), plus anything else the
   * menu needs (an `.actionmenu__context` block, an `.actionmenu__divider`). Pressing an item closes
   * the menu and hands the focus back to the trigger first, so an item that opens a drawer returns
   * focus to something that still exists. An item marked `data-keep-open` leaves it open - for one
   * that reports its own progress, such as "Signing out".
   */
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not(:disabled)'

/** The items a keyboard can reach: an item a layout hides at this width (`display: none`) is not one of them. */
function reachable(panel: HTMLElement | null) {
  return Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
    (item) => item.getClientRects().length > 0,
  )
}

/**
 * A button that opens a short list of actions - an item's secondary and destructive verbs, or the
 * account - and the one implementation of that behaviour in LorEvolve.
 *
 * A disclosure rather than an ARIA menu, deliberately: what drops down is links and buttons, and
 * native roles are what a screen reader, a browser's own shortcuts and a test already understand -
 * `role="menu"` would take a link's role away and buy nothing. So the trigger says whether it is
 * open and what it controls, and the panel is a list of ordinary controls.
 *
 * Opening moves the focus to the first item. Arrow keys, Home and End move between items; Tab walks
 * them in order and leaving the menu closes it. Escape closes and returns the focus to the trigger;
 * a press outside closes. Click or tap opens - never hover, which a phone does not have.
 */
export function ActionMenu({
  label,
  trigger,
  triggerClassName = iconButtonClass(),
  className,
  panelClassName,
  testId,
  triggerTestId,
  panelTestId,
  children,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [fromStart, setFromStart] = useState(false)

  // A row's tools wrap on a phone, so a menu may sit far from the row's end. When the panel pinned to the trigger's end
  // would leave the screen, it opens from the trigger's start instead (`--start`), before it is painted. Only the
  // trigger opens the menu, and it puts the side back first.
  useLayoutEffect(() => {
    const left = open ? panel.current?.getBoundingClientRect().left : undefined
    if (left !== undefined && left < 0) setFromStart(true)
  }, [open])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      // Stops the key reaching a drawer or the page behind: closing this is what Escape meant.
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }

    // Pointer-down rather than click, so a press that starts outside closes at once - and a press
    // on the trigger itself is left to the trigger.
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    // Tab past the last item, or a click somewhere focusable, leaves the menu: it closes behind.
    function onFocusIn(event: FocusEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)

    // Into the panel on opening, so the first thing Tab or a screen reader meets is its contents.
    // Onto the current item where the menu marks one (a place chosen from a list), else the first.
    const items = reachable(panel.current)
    ;(items.find((item) => item.getAttribute('aria-current') === 'page') ?? items[0])?.focus()

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open])

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const items = reachable(panel.current)
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    let next: number
    switch (event.key) {
      case 'ArrowDown':
        next = at < 0 ? 0 : (at + 1) % items.length
        break
      case 'ArrowUp':
        next = at <= 0 ? items.length - 1 : at - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    items[next]?.focus()
  }

  return (
    <div
      className={['actionmenu', className].filter(Boolean).join(' ')}
      ref={root}
      data-testid={testId}
    >
      <button
        className={triggerClassName}
        type="button"
        ref={button}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setFromStart(false)
          setOpen((wasOpen) => !wasOpen)
        }}
        data-testid={triggerTestId}
      >
        {trigger ?? <Ellipsis aria-hidden="true" focusable="false" strokeWidth={1.75} />}
      </button>

      {open ? (
        <div
          className={['actionmenu__panel', fromStart && 'actionmenu__panel--start', panelClassName]
            .filter(Boolean)
            .join(' ')}
          id={panelId}
          ref={panel}
          onKeyDown={moveFocus}
          onClick={(event) => {
            const item = (event.target as Element).closest('a[href], button')
            if (!item || item.hasAttribute('data-keep-open')) return
            button.current?.focus()
            setOpen(false)
          }}
          data-testid={panelTestId}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

interface ItemLook {
  /** Drawn first, through ActionIcon: decorative, the label names the action. Left out by a plain list of choices. */
  icon?: LucideIcon
  /** `danger` is the red of a delete or a remove. */
  tone?: 'default' | 'danger'
  /** Leaves the menu open when pressed, for an item that reports its own progress ("Signing out"). */
  keepOpen?: boolean
  testId?: string
  /** Extra classes after the item's own, for the one place that adds a hook. */
  className?: string
  children: ReactNode
}

type ItemProps = ItemLook &
  (
    | ({ to: string } & Omit<LinkProps, 'className' | 'children' | 'to'>)
    | ({ to?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>)
  )

/**
 * One row of an `ActionMenu`: a `<button>`, or a `<Link>` when it has a `to`. The one place that
 * writes `.actionmenu__item`, so every item draws its icon, colours and danger tone alike.
 * Native props (`onClick`, `disabled`, `aria-*`) go straight to the element.
 */
export function ActionMenuItem({
  icon,
  tone = 'default',
  keepOpen,
  testId,
  className,
  children,
  ...rest
}: ItemProps) {
  const classes = ['actionmenu__item', tone === 'danger' && 'actionmenu__item--danger', className]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {icon ? <ActionIcon icon={icon} /> : null}
      {children}
    </>
  )
  const marks = { 'data-keep-open': keepOpen ? true : undefined, 'data-testid': testId }
  if (rest.to !== undefined) {
    return (
      <Link className={classes} {...marks} {...rest}>
        {content}
      </Link>
    )
  }
  return (
    <button className={classes} type="button" {...marks} {...rest}>
      {content}
    </button>
  )
}
