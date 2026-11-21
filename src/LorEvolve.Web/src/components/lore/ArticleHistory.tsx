import { useId, useState, type ReactNode } from 'react'
import { History } from 'lucide-react'
import { VersionActor } from '../VersionActor'
import { RevisionKind } from '../../lore/revisions'
import {
  useRevisionHistory,
  type RevisionStore,
  type RevisionWords,
} from '../../lore/useRevisionHistory'
import { useI18n } from '../../i18n'
import { articleHistoryWords } from '../../lore/articleHistory'
import { DisclosureButton } from '../DisclosureButton'
import { QuietNote } from '../QuietNote'
import { RevisionHistory, type RevisionListWords } from '../RevisionHistory'

/** A row of an article's or a manuscript's history. */
export interface HistoryRevision {
  id: string
  number: number
  kind: number
  restoredFromRevisionId: string | null
  createdAt: string
  isEmpty: boolean
  actorName: string | null
}

/** Everything a history says, in its own store's words. The article's are the default. */
export interface HistoryWords<S> extends RevisionWords<S>, RevisionListWords {
  restored: (number: number) => string
  restoredEarlier: string
  cleared: string
  first: string
  saved: string
  /** The words on an article's own toggle; a panel has none. */
  toggle?: string
  readFailed: string
  opening: string
  none: string
  version: (number: number) => string
  snapshotBlank: string
}

/** A history opened from a toggle elsewhere on the page: the panel the toggle controls, with its title and lede. */
interface HistoryPanel {
  id: string
  title: string
  lede: string

  /** Why no version can be put back right now, if none can: every restore waits, and says why. */
  blocked: string | null
}

interface ArticleHistoryProps<S, D, R> {
  /** Where the versions are read and put back. Memoised on the record's ids. */
  store: RevisionStore<S, D, R>
  words?: HistoryWords<S>

  /** One version's text, opened in place; null when the version holds none. */
  renderVersion: (detail: D, revision: S) => ReactNode

  /** Bumped whenever the record is saved or put back, so an open history reads itself again. */
  reloadKey: number

  /** The record as it stands - what a restore names as the version it is written over. */
  current: { version: number }

  onRestored: (restored: R) => void

  /** A restore found the record had moved on since it was read: read it again. */
  onStale: () => void

  /** Without it the history is closed behind its own toggle until it is asked for. */
  panel?: HistoryPanel

  /** The first word of every test id: `article` or `manuscript`. */
  testId?: string
  messageTestId?: string
}

/**
 * A record's own history - a Lore article's, or a scene manuscript's - newest first. Any version can be read in place,
 * and any but the newest put back, which is recorded as a version of its own. An article's is closed until it is asked
 * for, so reading an entry costs no history read; a manuscript's is a `panel` its own toggle opens.
 */
export function ArticleHistory<S extends HistoryRevision, D, R>({
  store,
  words = articleHistoryWords<S>(),
  renderVersion,
  reloadKey,
  current,
  onRestored,
  onStale,
  panel,
  testId = 'article',
  messageTestId = 'article-history-error',
}: ArticleHistoryProps<S, D, R>) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const bodyId = useId()
  const titleId = useId()
  const blockedId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const blocked = panel ? panel.blocked : null
  const history = useRevisionHistory({
    store,
    words,
    reloadKey,
    currentVersion: current.version,
    onRestored,
    onStale,
    enabled: panel !== undefined || isOpen,
    keepOpenOnReload: true,
    blocked,
  })

  /** What a version was, in a few words. */
  function describeVersion(revision: S) {
    if (revision.kind === RevisionKind.Restored) {
      const from = history.revisions.find(
        (candidate) => candidate.id === revision.restoredFromRevisionId,
      )
      return from ? words.restored(from.number) : words.restoredEarlier
    }
    if (revision.isEmpty) return words.cleared
    return revision.kind === RevisionKind.Created ? words.first : words.saved
  }

  const body = (
    <RevisionHistory
      history={history}
      words={words}
      testId={testId}
      messageTestId={messageTestId}
      reading={
        <QuietNote className="history__quiet" size="ui" role="status">
          {words.opening}
        </QuietNote>
      }
      failed={
        <QuietNote className="history__quiet" size="ui" role="status">
          {words.readFailed}
        </QuietNote>
      }
      empty={
        <QuietNote className="history__quiet" size="ui">
          {words.none}
        </QuietNote>
      }
      describe={describeVersion}
      meta={(revision) => (
        <>
          <span>{words.version(revision.number)}</span>
          <VersionActor name={revision.actorName} />
        </>
      )}
      renderVersion={renderVersion}
      restoreDisabled={panel ? blocked !== null : history.busyId !== null}
      restoreDescribedBy={blocked ? blockedId : undefined}
      versionId={panel ? (revision) => `${panel.id}-version-${revision.number}` : undefined}
    />
  )

  if (panel) {
    return (
      <section
        className="article__history"
        id={panel.id}
        aria-labelledby={titleId}
        data-testid={`${testId}-history`}
      >
        <QuietNote className="history__quiet" size="ui" id={titleId}>
          {panel.title}
        </QuietNote>
        <QuietNote className="history__quiet" size="ui">
          {panel.lede}
        </QuietNote>
        {blocked ? (
          <QuietNote
            className="history__quiet"
            size="ui"
            id={blockedId}
            testId={`${testId}-history-blocked`}
          >
            {blocked}
          </QuietNote>
        ) : null}
        {body}
      </section>
    )
  }

  return (
    <div className="article__history">
      <DisclosureButton
        tone="secondary"
        icon={History}
        className="article__historytoggle"
        expanded={isOpen}
        controls={bodyId}
        onToggle={() => setIsOpen((now) => !now)}
        data-testid={`${testId}-history-toggle`}
      >
        {words.toggle}
      </DisclosureButton>

      {isOpen ? <div id={bodyId}>{body}</div> : null}
    </div>
  )
}
