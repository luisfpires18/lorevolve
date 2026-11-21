import { useMemo } from 'react'
import { EMPTY_FACT } from '../lore/facts'
import { CanonBlockNotice } from './CanonBlockNotice'
import { EmptyState } from './EmptyState'
import { VersionActor } from './VersionActor'
import type { Chronology } from '../chronology/types'
import {
  describeChanges,
  getRevision,
  imagesNotRestored,
  listRevisions,
  mentionsImage,
  restoreRevision,
  RevisionKind,
} from '../lore/revisions'
import { ENTRY_CHANGED } from '../lore/api'
import { CANON_LABELS } from '../lore/types'
import { useI18n } from '../i18n'
import { useRevisionHistory } from '../lore/useRevisionHistory'
import { Snapshot } from './lore/RevisionSnapshot'
import { LoadError } from './LoadError'
import { QuietNote } from './QuietNote'
import { PanelHead } from './PanelHead'
import { RevisionHistory } from './RevisionHistory'

export interface EntityHistoryProps {
  universeId: string
  entityId: string

  /** How the universe writes years now, for a version whose year is in an era that still exists. */
  chronology: Chronology

  /**
   * Bumped by the dossier whenever it saves. History is derived from writes made
   * elsewhere on the page, so it reloads on a signal rather than by holding shared state.
   */
  reloadKey: number

  /** The entry's version as the page last read it: what a restore names as the version it was chosen over (ADR 0043). */
  currentVersion: number

  /** Called after a restore lands - or is refused because the entry moved on - so the dossier reads the entry again. */
  onRestored: () => void
}

/**
 * What an entry has been, presented as a document history rather than an audit table.
 *
 * Each row says when, and in one sentence what moved - never a per-field diff, and never a
 * prose diff of the article, neither of which this phase claims to produce. A version can
 * be opened in place to read the whole of it, and any version but the current one can be
 * put back.
 *
 * Restoring is an ordinary gated save on the API, so a refusal reads exactly as it does in
 * the edit form: the same notice, and nothing changed.
 */
export function EntityHistory({
  universeId,
  entityId,
  chronology,
  reloadKey,
  currentVersion,
  onRestored,
}: EntityHistoryProps) {
  const { t } = useI18n()
  const store = useMemo(
    () => ({
      list: (signal: AbortSignal) => listRevisions(universeId, entityId, signal),
      get: (revisionId: string) => getRevision(universeId, entityId, revisionId),
      restore: (revisionId: string, version: number) =>
        restoreRevision(universeId, entityId, revisionId, version),
      changedCode: ENTRY_CHANGED,
    }),
    [universeId, entityId],
  )
  const history = useRevisionHistory({
    store,
    reloadKey,
    currentVersion,
    onRestored,
    onStale: onRestored,
    gated: true,
    words: {
      openFailed: t('entity.history.openFailed'),
      // Said once, where a version is about to be put back and where the list is read - not on every row, and not at
      // all for an entry that has never had a picture.
      confirm: (revision, all) => ({
        title: t('entity.history.restoreConfirm.title', { number: revision.number }),
        message: t('entity.history.restoreConfirm.message'),
        details: mentionsImage(all) ? [imagesNotRestored()] : undefined,
        confirmLabel: t('entity.history.restoreConfirm.confirm'),
      }),
      changedElsewhere: t('entity.history.changedElsewhere'),
      failed: t('entity.history.restoreFailed'),
    },
  })
  const carriesImages = mentionsImage(history.revisions)

  return (
    <section className="history" aria-labelledby="history-heading">
      <PanelHead
        look="display"
        className="history__head"
        titleId="history-heading"
        title={t('entity.history.title')}
      />

      <QuietNote className="history__quiet" size="ui" testId="history-article-note">
        {t('entity.history.articleNote')}
      </QuietNote>

      {carriesImages ? (
        <QuietNote className="history__quiet" size="ui" testId="history-image-note">
          {imagesNotRestored()}
        </QuietNote>
      ) : null}

      {history.blocked ? (
        <CanonBlockNotice universeId={universeId} findings={history.blocked} linkSubjects />
      ) : null}

      <RevisionHistory
        history={history}
        words={{
          nowShowing: t('entity.history.nowShowing'),
          restore: t('entity.history.restore'),
          restoring: t('entity.history.restoring'),
          snapshotOpening: t('entity.history.opening'),
        }}
        messageTestId="history-error"
        reading={null}
        failed={
          <LoadError
            message={t('entity.history.readFailed')}
            onRetry={history.retry}
            retryLabel={t('entity.history.retry')}
          />
        }
        empty={<EmptyState testId="history-empty" title={t('entity.history.empty')} />}
        describe={describeChanges}
        meta={(revision) => (
          <>
            <span>{t('entity.history.version', { number: revision.number })}</span>
            <span>
              <bdi>{revision.name}</bdi>
            </span>
            <span>{CANON_LABELS[revision.canonStatus]}</span>
            <VersionActor name={revision.actorName} />
            {revision.kind === RevisionKind.Restored ? (
              <span>
                {t('entity.history.restoredVersion', {
                  number:
                    history.revisions.find(
                      (candidate) => candidate.id === revision.restoredFromRevisionId,
                    )?.number ?? EMPTY_FACT,
                })}
              </span>
            ) : null}
          </>
        )}
        renderDetail={(opened) => <Snapshot revision={opened} chronology={chronology} />}
        restoreDisabled={history.busyId !== null}
      />
    </section>
  )
}
