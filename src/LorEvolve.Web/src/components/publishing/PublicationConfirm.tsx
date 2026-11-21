import type { ComponentProps, ReactNode, RefObject } from 'react'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'

/**
 * The publication screen's one inline question (Publish, Make private, Publish everything): its heading, what it means,
 * then the action and Keep, which stays usable while the action runs. `after` sits below the buttons.
 */
export function PublicationConfirm({
  title,
  testId,
  panel,
  busy,
  onKeep,
  actions,
  after,
  children,
}: {
  title: ReactNode
  testId: string
  panel: RefObject<HTMLDivElement | null>
  busy: boolean
  onKeep: () => void
  actions: Pick<
    ComponentProps<typeof FormActions>,
    'submitLabel' | 'busyLabel' | 'onSubmit' | 'submitTestId' | 'cancelLabel' | 'dismiss'
  >
  after?: ReactNode
  children?: ReactNode
}) {
  return (
    <InlineConfirm
      look="publication"
      titleAs="h3"
      title={title}
      panelRef={panel}
      onKeep={onKeep}
      busy={busy}
      testId={testId}
    >
      {children}
      <FormActions {...actions} busy={busy} onCancel={onKeep} lockCancel inline />
      {after}
    </InlineConfirm>
  )
}
