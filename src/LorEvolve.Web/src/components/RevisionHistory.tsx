import { useId, type ReactNode } from 'react'
import type { RevisionHistoryState, RevisionRow } from '../lore/useRevisionHistory'
import { Button } from './Button'
import { DisclosureButton } from './DisclosureButton'
import { QuietNote } from './QuietNote'
import { DateText } from './DateText'
import { FormMessage } from './FormMessage'

/** The words on a history's version rows, in its own store's words. */
export interface RevisionListWords {
  nowShowing: string
  restore: string
  restoring: string
  snapshotOpening: string

  /** Said for a version that holds no text, where `renderVersion` can draw none. */
  snapshotBlank?: string

  /** A version's view and restore buttons named with its number, where the history has always named them. */
  viewName?: (number: number, isOpen: boolean) => string
  restoreName?: (number: number) => string
}

interface RevisionHistoryProps<S extends RevisionRow & { createdAt: string }, D> {
  /** The list read, the version opened and the one being put back: `useRevisionHistory`. */
  history: RevisionHistoryState<S, D>
  words: RevisionListWords

  /** The first word of every list test id (`article`, `manuscript`); an entry's history has none. */
  testId?: string
  messageTestId: string

  /** Shown while the list is first read, when it cannot be read, and when it holds no version. */
  reading: ReactNode
  failed: ReactNode
  empty: ReactNode

  /** What a version was, in a few words, and its meta line: the version number, who saved it, and the rest. */
  describe: (revision: S) => ReactNode
  meta: (revision: S) => ReactNode

  /** One version opened in place; null when it holds no text. */
  renderVersion: (detail: D, revision: S) => ReactNode

  restoreDisabled: boolean
  restoreDescribedBy?: string

  /** The id of a version's opened box. Without it, one made for this list. */
  versionId?: (revision: S) => string
}

/**
 * A record's saved versions, newest first, as `version` rows of a `history__list`: when, what and who, a button to read
 * the version in place and, for any but the newest, one to put it back. Each history passes its own words, test ids
 * and how one version reads. Catalogue: docs/design/ui-components.md.
 */
export function RevisionHistory<S extends RevisionRow & { createdAt: string }, D>({
  history,
  words,
  testId,
  messageTestId,
  reading,
  failed,
  empty,
  describe,
  meta,
  renderVersion,
  restoreDisabled,
  restoreDescribedBy,
  versionId,
}: RevisionHistoryProps<S, D>) {
  const listId = useId()
  const { revisions, status, opened, busyId, message, openId, open, restore } = history
  const idOf = (part: string) => (testId ? `${testId}-${part}` : part)
  const boxId = versionId ?? ((revision: S) => `${listId}-${revision.id}`)

  return (
    <>
      {message?.tone === 'status' ? (
        <QuietNote className="history__quiet" tone="saved" role="status" testId={messageTestId}>
          {message.text}
        </QuietNote>
      ) : message ? (
        <FormMessage testId={messageTestId}>{message.text}</FormMessage>
      ) : null}

      {status === 'error' ? (
        failed
      ) : status === 'loading' ? (
        reading
      ) : revisions.length === 0 ? (
        empty
      ) : (
        <ol className="history__list" data-testid={idOf('history-list')}>
          {revisions.map((revision, index) => {
            const isViewing = openId === revision.id
            const text = isViewing && opened !== null ? renderVersion(opened, revision) : null
            return (
              <li className="version" key={revision.id} data-version={revision.number}>
                <p className="version__when">
                  <DateText value={revision.createdAt} withTime />
                </p>

                <div className="version__body">
                  <p className="version__what" data-testid={idOf('version-what')}>
                    {describe(revision)}
                    {index === 0 ? <span className="version__now">{words.nowShowing}</span> : null}
                  </p>
                  <p className="version__meta">{meta(revision)}</p>
                </div>

                <div className="version__tools">
                  <DisclosureButton
                    tone="text"
                    size="sm"
                    expanded={isViewing}
                    controls={boxId(revision)}
                    aria-label={words.viewName?.(revision.number, isViewing)}
                    onToggle={() => void open(revision.id)}
                    data-testid={idOf('version-view')}
                  />
                  {index > 0 ? (
                    <Button
                      tone="text"
                      size="sm"
                      disabled={restoreDisabled}
                      aria-describedby={restoreDescribedBy}
                      aria-label={words.restoreName?.(revision.number)}
                      onClick={() => void restore(revision)}
                      data-testid={idOf('version-restore')}
                    >
                      {busyId === revision.id ? words.restoring : words.restore}
                    </Button>
                  ) : null}
                </div>

                {isViewing ? (
                  <div
                    className="version__snapshot"
                    id={boxId(revision)}
                    data-testid={idOf('version-snapshot')}
                  >
                    {opened === null ? (
                      <QuietNote className="history__quiet" size="ui" role="status">
                        {words.snapshotOpening}
                      </QuietNote>
                    ) : text === null ? (
                      <QuietNote size="body">{words.snapshotBlank}</QuietNote>
                    ) : (
                      text
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}
