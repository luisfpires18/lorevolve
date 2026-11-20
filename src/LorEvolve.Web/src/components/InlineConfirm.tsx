import { useId, type ReactNode, type RefObject } from 'react'

const TITLE_TAGS = { p: 'p', h2: 'h2', h3: 'h3' } as const

/**
 * The one inline confirm (#255): a question in place of the button that asked it, with what it
 * does and the way back. `look` names one of the three panel classes (`settings__confirm`,
 * `publication__confirm`, `trash__confirm`). Escape keeps, as Keep does, unless the action runs; it never
 * reaches an ActionMenu or Drawer around the panel, busy or not.
 * The owner keeps its focus effect: open moves the focus to `panelRef`, close returns it to the
 * button. Catalogue: `docs/design/ui-components.md`.
 */
export function InlineConfirm({
  look,
  title,
  titleAs = 'p',
  titleId,
  describedBy,
  panelRef,
  onKeep,
  busy,
  error,
  errorTestId,
  actions,
  className,
  testId,
  data,
  children,
}: {
  look: 'settings' | 'publication' | 'trash'
  title: ReactNode
  titleAs?: keyof typeof TITLE_TAGS
  /** Pass it when another element refers to the title; a generated id otherwise. */
  titleId?: string
  describedBy?: string
  panelRef: RefObject<HTMLDivElement | null>
  /** Called on Escape: the same as the Keep button. */
  onKeep: () => void
  /** The action runs: Escape is stopped but does not keep. */
  busy?: boolean
  /** Shown in place, after the children, as an alert. */
  error?: ReactNode
  errorTestId?: string
  /** Drawn after the error, for a panel whose action row sits below it (Trash). */
  actions?: ReactNode
  className?: string
  testId?: string
  /** Extra `data-` attributes on the panel, read by its tests. */
  data?: Record<`data-${string}`, string>
  children?: ReactNode
}) {
  const generated = useId()
  const headingId = titleId ?? generated
  const Title = TITLE_TAGS[titleAs]
  return (
    <div
      className={[`${look}__confirm`, className].filter(Boolean).join(' ')}
      role="group"
      aria-labelledby={headingId}
      aria-describedby={describedBy}
      tabIndex={-1}
      ref={panelRef}
      data-testid={testId}
      {...data}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // Stop it even while busy, so an ActionMenu or Drawer around the panel never closes.
        event.stopPropagation()
        if (!busy) onKeep()
      }}
    >
      <Title className={`${look}__confirmtitle`} id={headingId}>
        {title}
      </Title>
      {children}
      {error ? (
        <p
          className={look === 'trash' ? 'trash__confirmerror' : 'form__message'}
          role="alert"
          data-testid={errorTestId}
        >
          {error}
        </p>
      ) : null}
      {actions}
    </div>
  )
}
