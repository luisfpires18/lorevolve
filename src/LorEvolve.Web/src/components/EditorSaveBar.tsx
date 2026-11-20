import type { ReactNode } from 'react'
import { CharCount, type CharCountProps } from './CharCount'
import { SaveAction, type SaveActionProps } from './SaveAction'

/**
 * The foot of an explicit-save editor: the count against the limit, the warning that no recovery copy could be kept,
 * the publication slot, and Save. `record` is the look of a saved record's editor (an idea, a board, a machine): the
 * `editorbar` class and Save in `editorbar__actions`. Catalogue: `docs/design/ui-components.md`.
 */
export function EditorSaveBar({
  save,
  count,
  warning,
  keyShortcuts,
  record,
  children,
}: {
  save: Omit<SaveActionProps, 'keyShortcuts'>
  count?: CharCountProps
  /** Passed only while it shows: a failed recovery copy with unsaved changes. */
  warning?: { text: string; testId: string } | null
  /** Where the editor takes Ctrl+S / Cmd+S. Left out where the editor has no shortcut. */
  keyShortcuts?: boolean
  record?: boolean
  /** The publication control, between the warning and Save. */
  children?: ReactNode
}) {
  const action = (
    <SaveAction {...save} keyShortcuts={keyShortcuts ? 'Control+S Meta+S' : undefined} />
  )
  return (
    <div className={record ? 'manuscript__bar editorbar' : 'manuscript__bar'}>
      {count ? <CharCount {...count} /> : null}
      {warning ? (
        <p className="recovery__warning" role="status" data-testid={warning.testId}>
          {warning.text}
        </p>
      ) : null}
      {children ? <div className="manuscript__publication">{children}</div> : null}
      {record ? <div className="actions editorbar__actions">{action}</div> : action}
    </div>
  )
}
