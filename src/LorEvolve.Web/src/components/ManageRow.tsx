import type { ReactNode, RefObject } from 'react'
import { FormActions } from './FormActions'
import { FormMessage } from './FormMessage'
import { InlineConfirm } from './InlineConfirm'
import { QuietNote } from './QuietNote'

/** The inline "remove this?" under a row: a note, the remove button and Keep. */
export type ManageRowRemove = {
  title: ReactNode
  note: string
  submitLabel: string
  busyLabel: string
  keepLabel: string
  busy: boolean
  onConfirm: () => void
  onKeep: () => void
  panelRef: RefObject<HTMLDivElement | null>
  className: string
  testId: string
  submitTestId: string
}

/**
 * One row of a settings list of things the account manages: a collaborator, a pending invitation, a connected app
 * (#456 I32). Who it is (a name and the meta lines under it), its controls, the inline remove confirm while it is open,
 * and the row's error. `flush` drops the side padding (a list without a panel of its own); `start` tops the parts
 * instead of centring them. The caller owns the save (`useFormSave`) and the confirm's focus (`useConfirmFocus`).
 */
export function ManageRow({
  name,
  nameClassName,
  meta,
  mark,
  whoClassName,
  controls,
  controlsClassName,
  remove,
  children,
  error,
  errorClassName,
  flush,
  start,
  highlighted,
  rowRef,
  testId,
  data,
}: {
  name: string
  /** Extra class for the name line, such as `collab__email`. */
  nameClassName?: string
  meta: ReactNode
  /** Drawn before who it is, such as a person's monogram. */
  mark?: ReactNode
  whoClassName: string
  controls: ReactNode
  controlsClassName: string
  /** The open remove confirm, or nothing while it is closed. */
  remove?: ManageRowRemove | null
  /** Lines after the confirm, such as a saved note. */
  children?: ReactNode
  error: string | null
  errorClassName: string
  flush?: boolean
  start?: boolean
  highlighted?: boolean
  rowRef?: RefObject<HTMLLIElement | null>
  testId: string
  data?: Record<`data-${string}`, string | number>
}) {
  const classes = [
    'managerow',
    flush && 'managerow--flush',
    start && 'managerow--start',
    highlighted && 'managerow--highlight',
  ]
  return (
    <li ref={rowRef} className={classes.filter(Boolean).join(' ')} data-testid={testId} {...data}>
      {mark}
      <div className={whoClassName}>
        <p className={nameClassName ? `managerow__name ${nameClassName}` : 'managerow__name'}>
          <bdi>{name}</bdi>
        </p>
        {meta}
      </div>
      <div className={controlsClassName}>{controls}</div>
      {remove ? (
        <InlineConfirm
          look="settings"
          className={remove.className}
          title={remove.title}
          panelRef={remove.panelRef}
          onKeep={remove.onKeep}
          busy={remove.busy}
          testId={remove.testId}
        >
          <QuietNote spacing="block">{remove.note}</QuietNote>
          <FormActions
            submitLabel={remove.submitLabel}
            busy={remove.busy}
            busyLabel={remove.busyLabel}
            submitTone="danger"
            onSubmit={remove.onConfirm}
            submitTestId={remove.submitTestId}
            onCancel={remove.onKeep}
            cancelLabel={remove.keepLabel}
            lockCancel
            inline
          />
        </InlineConfirm>
      ) : null}
      {children}
      {error ? <FormMessage className={errorClassName}>{error}</FormMessage> : null}
    </li>
  )
}
