import { useI18n } from '../../i18n'
import { worldPath } from '../../portal/api'
import { REQUIREMENTS, requirementLabel, type PublicationState } from '../../publishing/types'
import type { usePublishState } from '../../publishing/usePublishState'
import { PublishConfirm } from './PublishConfirm'
import { UnpublishConfirm } from './UnpublishConfirm'

/** Status: public or private, the address, the checklist, a refusal, what was done, the two confirms and the ready hint. */
export function PublishStatus({
  state,
  isPublic,
  slug,
  missing,
  detailsDirty,
  confirming,
  setConfirming,
  busy,
  problem,
  announcement,
  panel,
  problemRef,
  publish,
  unpublish,
}: Pick<
  ReturnType<typeof usePublishState>,
  | 'detailsDirty'
  | 'confirming'
  | 'setConfirming'
  | 'busy'
  | 'problem'
  | 'announcement'
  | 'panel'
  | 'problemRef'
> & {
  state: PublicationState
  isPublic: boolean
  slug: string | null
  missing: (typeof REQUIREMENTS)[number][]
  publish: () => Promise<void>
  unpublish: () => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <section className="publish__section publish__status" aria-labelledby="publish-status-heading">
      <h2 className="publish__heading" id="publish-status-heading">
        {t('universe.publish.status')}
      </h2>
      <p className="publication__state" data-testid="publication-status">
        <span className="publication__badge" data-state={isPublic ? 'public' : 'private'}>
          {isPublic ? t('universe.publish.badgePublic') : t('universe.publish.badgePrivate')}
        </span>{' '}
        {isPublic ? t('universe.publish.visiblePublic') : t('universe.publish.visiblePrivate')}
      </p>

      {isPublic && slug ? (
        <p className="publication__address" data-testid="publication-address">
          <span className="publication__label">{t('universe.publish.address')}</span>{' '}
          <span className="publication__path">{worldPath(slug)}</span>
        </p>
      ) : null}

      {!isPublic ? (
        <ul
          className="publication__checklist"
          aria-label={t('universe.publish.checklist')}
          data-testid="publication-checklist"
        >
          {REQUIREMENTS.map((requirement) => {
            const needed = requirement.key in state.missing
            return (
              <li key={requirement.key} data-state={needed ? 'needed' : 'done'}>
                <span className="publication__mark" aria-hidden="true">
                  {needed ? '○' : '✓'}
                </span>
                {requirementLabel(requirement.key)}
                <span className="publication__word">
                  {needed ? t('universe.publish.needed') : t('universe.publish.done')}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {problem ? (
        <div
          className="callout callout--warning publication__problem"
          role="alert"
          tabIndex={-1}
          ref={problemRef}
          data-testid="publication-problem"
        >
          <p className="callout__title">{t('universe.publish.notYet')}</p>
          <ul className="publication__missing">
            {problem.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {announcement ? (
        <p className="settings__saved" role="status" data-testid="publication-announcement">
          {announcement}
        </p>
      ) : null}

      {confirming?.kind === 'publish' ? (
        <PublishConfirm
          confirming={confirming}
          panel={panel}
          busy={busy}
          publish={publish}
          setConfirming={setConfirming}
        />
      ) : null}

      {confirming?.kind === 'unpublish' ? (
        <UnpublishConfirm
          state={state}
          panel={panel}
          busy={busy}
          unpublish={unpublish}
          setConfirming={setConfirming}
        />
      ) : null}

      {!isPublic && missing.length === 0 && !detailsDirty && !confirming ? (
        <p className="field__hint" data-testid="publication-ready">
          {t('universe.publish.ready')}
        </p>
      ) : null}
    </section>
  )
}
