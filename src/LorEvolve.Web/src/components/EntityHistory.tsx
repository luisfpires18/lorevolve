import { useId } from 'react'
import { CanonBlockNotice } from './CanonBlockNotice'
import { EmptyState } from './EmptyState'
import { VersionActor } from './VersionActor'
import type { Chronology } from '../chronology/types'
import { describeChanges, imagesNotRestored, RevisionKind } from '../lore/revisions'
import { CANON_LABELS } from '../lore/types'
import { useI18n } from '../i18n'
import { useEntityRevisions } from '../lore/useEntityRevisions'
import { Snapshot } from './lore/RevisionSnapshot'
import { Button } from './Button'
import { DisclosureButton } from './DisclosureButton'
import { LoadError } from './LoadError'
import { QuietNote } from './QuietNote'
import { DateText } from './DateText'

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
  const snapshotId = useId()
  const {
    revisions,
    status,
    setStatus,
    opened,
    busyId,
    message,
    blocked,
    setReads,
    openId,
    open,
    carriesImages,
    restore,
  } = useEntityRevisions({ universeId, entityId, reloadKey, currentVersion, onRestored })

  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="history__head">
        <h2 className="history__title" id="history-heading">
          {t('entity.history.title')}
        </h2>
      </div>

      <QuietNote className="history__quiet" size="ui" testId="history-article-note">
        {t('entity.history.articleNote')}
      </QuietNote>

      {carriesImages ? (
        <QuietNote className="history__quiet" size="ui" testId="history-image-note">
          {imagesNotRestored()}
        </QuietNote>
      ) : null}

      {blocked ? (
        <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="history-error">
          {message}
        </p>
      ) : null}

      {status === 'loading' ? null : status === 'error' ? (
        <LoadError
          message={t('entity.history.readFailed')}
          onRetry={() => {
            setStatus('loading')
            setReads((count) => count + 1)
          }}
          retryLabel={t('entity.history.retry')}
        />
      ) : revisions.length === 0 ? (
        <EmptyState testId="history-empty" title={t('entity.history.empty')} />
      ) : (
        <ol className="history__list" data-testid="history-list">
          {revisions.map((revision, index) => (
            <li className="version" key={revision.id} data-version={revision.number}>
              <p className="version__when">
                <DateText value={revision.createdAt} withTime />
              </p>

              <div className="version__body">
                <p className="version__what" data-testid="version-what">
                  {describeChanges(revision)}
                  {index === 0 ? (
                    <span className="version__now">{t('entity.history.nowShowing')}</span>
                  ) : null}
                </p>
                <p className="version__meta">
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
                          revisions.find(
                            (candidate) => candidate.id === revision.restoredFromRevisionId,
                          )?.number ?? '—',
                      })}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="version__tools">
                <DisclosureButton
                  tone="text"
                  size="sm"
                  expanded={openId === revision.id}
                  controls={`${snapshotId}-${revision.id}`}
                  onToggle={() => void open(revision.id)}
                  data-testid="version-view"
                />
                {index > 0 ? (
                  <Button
                    tone="text"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => void restore(revision)}
                    data-testid="version-restore"
                  >
                    {busyId === revision.id
                      ? t('entity.history.restoring')
                      : t('entity.history.restore')}
                  </Button>
                ) : null}
              </div>

              {openId === revision.id ? (
                <div
                  className="version__snapshot"
                  id={`${snapshotId}-${revision.id}`}
                  data-testid="version-snapshot"
                >
                  {opened === null || opened.id !== openId ? (
                    <QuietNote className="history__quiet" size="ui" role="status">
                      {t('entity.history.opening')}
                    </QuietNote>
                  ) : (
                    <Snapshot revision={opened} chronology={chronology} />
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
