import type { CSSProperties } from 'react'
import { useUniverseAccess } from '../../universes/access'
import { Link } from 'react-router-dom'
import { t, useI18n } from '../../i18n'
import type { TimelineEntry } from '../../timeline/types'
import { TypeIcon } from '../TypeIcon'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'
import { QuietNote } from '../QuietNote'

/** A moment's title, which opens its drawer, with its account, cast, stories and validation details. */
export function MomentBody({
  entry,
  access,
  setForm,
  universe,
  storyPath,
}: {
  entry: TimelineEntry
  access: ReturnType<typeof useUniverseAccess>
  setForm: Dispatch<SetStateAction<FormState>>
  universe: WorkspaceContext['universe']
  storyPath: (id: string) => string
}) {
  const { tx } = useI18n()
  return (
    <>
      {/* The title is the way in: it opens the moment's drawer. */}
      <h3 className="moment__title">
        {access.editContent ? (
          <button
            className="moment__open"
            type="button"
            onClick={() => setForm({ mode: 'edit', entry })}
            data-testid={`edit-moment-${entry.title}`}
          >
            <bdi>{entry.title}</bdi>
          </button>
        ) : (
          <bdi data-testid={`moment-title-${entry.title}`}>{entry.title}</bdi>
        )}
      </h3>

      {entry.description ? <p className="moment__account prose">{entry.description}</p> : null}

      {entry.entities.length > 0 ? (
        <ul className="moment__cast">
          {entry.entities.map((link) => {
            const accent = link.entityTypeAccentColor
              ? ({ '--type-accent': link.entityTypeAccentColor } as CSSProperties)
              : undefined
            const icon = <TypeIcon iconKey={link.entityTypeIcon} className="lorechip__icon" />

            // A participant in the Trash is still stored on this moment and comes back
            // with it, so it is named rather than dropped - but it has no page to open
            // while it is in the Trash, so it is not a link.
            return (
              <li key={link.entityId}>
                {link.isTrashed ? (
                  <span className="lorechip lorechip--trashed moment__player" style={accent}>
                    {icon}
                    <span className="lorechip__name">
                      <bdi>{link.name}</bdi>
                    </span>{' '}
                    <span className="lorechip__note">{t('time.timeline.participantInTrash')}</span>
                  </span>
                ) : (
                  <Link
                    className="lorechip moment__player"
                    style={accent}
                    to={`/app/universes/${universe.id}/lore/${link.entityId}`}
                    title={link.entityTypeName}
                  >
                    {icon}
                    <span className="lorechip__name">
                      <bdi>{link.name}</bdi>
                    </span>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      {entry.stories.length > 0 ? (
        <p className="moment__context" data-testid={`moment-stories-${entry.title}`}>
          {entry.stories.length === 1 ? t('time.timeline.story') : t('time.timeline.stories')}
          {entry.stories.map((linked, index) => (
            <span key={linked.storyId}>
              {index > 0 ? ', ' : null}
              {linked.isTrashed ? (
                <>
                  <bdi>{linked.title}</bdi> {t('time.timeline.storyInTrash')}
                </>
              ) : (
                <Link to={storyPath(linked.storyId)}>
                  <bdi>{linked.title}</bdi>
                </Link>
              )}
            </span>
          ))}
        </p>
      ) : null}

      {entry.validation ? (
        <QuietNote className="moment__validation" wrap testId={`moment-validation-${entry.title}`}>
          <span className="moment__validationlabel">{t('time.timeline.validation')}</span>
          <span>
            {entry.validation.eventKind ? <bdi>{entry.validation.eventKind.name}</bdi> : null}
            {entry.validation.method ? (
              <>
                {entry.validation.eventKind ? ' · ' : null}
                {tx('time.timeline.by', { name: <bdi>{entry.validation.method.name}</bdi> })}
              </>
            ) : null}
            {entry.validation.participant ? (
              <>
                {entry.validation.eventKind || entry.validation.method ? ' · ' : null}
                {tx('time.timeline.for', {
                  name: <bdi>{entry.validation.participant.name}</bdi>,
                })}
                {entry.validation.participant.isTrashed ? (
                  <> {t('time.timeline.participantTrashed')}</>
                ) : null}
              </>
            ) : null}
          </span>
        </QuietNote>
      ) : null}
    </>
  )
}
