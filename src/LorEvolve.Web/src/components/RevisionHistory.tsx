import { Fragment, useId, type ReactNode } from 'react'
import type { RevisionHistoryState, RevisionRow } from '../lore/useRevisionHistory'
import { Button } from './Button'
import { DisclosureButton } from './DisclosureButton'
import { QuietNote } from './QuietNote'
import { DateText } from './DateText'
import { FormMessage } from './FormMessage'

type Listed = RevisionRow & { createdAt: string }

/** The words on a history's version rows, in its own store's words. */
export interface RevisionListWords {
  nowShowing: string
  restore: string
  restoring: string
  snapshotOpening: string

  /** Said for a version that holds no text, where `renderDetail` can draw none. */
  snapshotBlank?: string

  /** A version's view and restore buttons named with its number, where the history has always named them. */
  viewName?: (number: number, isOpen: boolean) => string
  restoreName?: (number: number) => string
}

/** One version's state and buttons, as a row of its own look draws them. */
export interface RevisionRowControls<D> {
  isOpen: boolean
  opened: D | null
  view: () => void
  restore: () => void
}

/** The `version` row: when, what and who, a view button, a restore button, and the version opened in place. */
interface VersionRows<S, D> {
  row?: undefined
  words: RevisionListWords

  /** What a version was, in a few words, and its meta line: the version number, who saved it, and the rest. */
  describe: (revision: S) => ReactNode
  meta: (revision: S) => ReactNode

  /** One version opened in place; null when it holds no text. */
  renderDetail: (detail: D, revision: S) => ReactNode

  restoreDisabled: boolean
  restoreDescribedBy?: string

  /** The id of a version's opened box. Without it, one made for this list. */
  versionId?: (revision: S) => string
}

/** A row of the history's own look (a progression's); it names its own test ids. */
interface OwnRows<S, D> {
  row: (revision: S, index: number, controls: RevisionRowControls<D>) => ReactNode
}

type RevisionHistoryProps<S, D> = {
  /** The list read, the version opened and the one being put back: `useRevisionHistory`. */
  history: RevisionHistoryState<S, D>

  /** The first word of every `version` row test id (`article`, `manuscript`); an entry's history has none. */
  testId?: string
  messageTestId?: string

  /** Shown while the list is first read and when it holds no version. */
  reading: ReactNode
  empty: ReactNode

  /** Shown when the list cannot be read. Without it, a failed read keeps what was read, or shows `empty`. */
  failed?: ReactNode
} & (VersionRows<S, D> | OwnRows<S, D>)

/**
 * A record's saved versions, newest first, in a `history__list`: the history's message, its read's states, and a row
 * per version with a button to read it in place and, for any but the newest, one to put it back. The `version` row is
 * the default; a history with a look of its own passes `row`. Catalogue: docs/design/ui-components.md.
 */
export function RevisionHistory<S extends Listed, D>(props: RevisionHistoryProps<S, D>) {
  const { history, testId, messageTestId, reading, empty, failed } = props
  const listId = useId()
  const { revisions, status, opened, openId, message, open, restore } = history
  const idOf = (part: string) => (testId ? `${testId}-${part}` : part)

  return (
    <>
      {message?.tone === 'status' ? (
        <QuietNote className="history__quiet" tone="saved" role="status" testId={messageTestId}>
          {message.text}
        </QuietNote>
      ) : message ? (
        <FormMessage testId={messageTestId}>{message.text}</FormMessage>
      ) : null}

      {status === 'error' && failed !== undefined ? (
        failed
      ) : status === 'loading' ? (
        reading
      ) : revisions.length === 0 ? (
        empty
      ) : props.row ? (
        <ol className="history__list">
          {revisions.map((revision, index) => {
            const isOpen = openId === revision.id
            return (
              <Fragment key={revision.id}>
                {props.row(revision, index, {
                  isOpen,
                  opened: isOpen ? opened : null,
                  view: () => void open(revision.id),
                  restore: () => void restore(revision),
                })}
              </Fragment>
            )
          })}
        </ol>
      ) : (
        <ol className="history__list" data-testid={idOf('history-list')}>
          {revisions.map((revision, index) => (
            <VersionRow
              key={revision.id}
              rows={props}
              history={history}
              revision={revision}
              index={index}
              idOf={idOf}
              boxId={props.versionId?.(revision) ?? `${listId}-${revision.id}`}
            />
          ))}
        </ol>
      )}
    </>
  )
}

function VersionRow<S extends Listed, D>({
  rows,
  history,
  revision,
  index,
  idOf,
  boxId,
}: {
  rows: VersionRows<S, D>
  history: RevisionHistoryState<S, D>
  revision: S
  index: number
  idOf: (part: string) => string
  boxId: string
}) {
  const { words } = rows
  const { opened, busyId, openId, open, restore } = history
  const isViewing = openId === revision.id
  const text = isViewing && opened !== null ? rows.renderDetail(opened, revision) : null
  return (
    <li className="version" data-version={revision.number}>
      <p className="version__when">
        <DateText value={revision.createdAt} withTime />
      </p>

      <div className="version__body">
        <p className="version__what" data-testid={idOf('version-what')}>
          {rows.describe(revision)}
          {index === 0 ? <span className="version__now">{words.nowShowing}</span> : null}
        </p>
        <p className="version__meta">{rows.meta(revision)}</p>
      </div>

      <div className="version__tools">
        <DisclosureButton
          tone="text"
          size="sm"
          expanded={isViewing}
          controls={boxId}
          aria-label={words.viewName?.(revision.number, isViewing)}
          onToggle={() => void open(revision.id)}
          data-testid={idOf('version-view')}
        />
        {index > 0 ? (
          <Button
            tone="text"
            size="sm"
            disabled={rows.restoreDisabled}
            aria-describedby={rows.restoreDescribedBy}
            aria-label={words.restoreName?.(revision.number)}
            onClick={() => void restore(revision)}
            data-testid={idOf('version-restore')}
          >
            {busyId === revision.id ? words.restoring : words.restore}
          </Button>
        ) : null}
      </div>

      {isViewing ? (
        <div className="version__snapshot" id={boxId} data-testid={idOf('version-snapshot')}>
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
}
