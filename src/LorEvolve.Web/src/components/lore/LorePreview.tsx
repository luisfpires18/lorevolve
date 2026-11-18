import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { EntityTile } from '../EntityTile'
import { StatusBadge } from '../StatusBadge'
import type { Chronology } from '../../chronology/types'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import { getEntity } from '../../lore/api'
import { EMPTY_FACT, renderFact } from '../../lore/facts'
import { CANON_LABELS, type EntityDetail } from '../../lore/types'
import { listEntityRelationships } from '../../relationships/api'
import type { RelationshipView } from '../../relationships/types'

const MAX_RELATIONS = 8

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ready'; entity: EntityDetail; relations: RelationshipView[] | null }

/** An entry in short: what it is, what it says about itself, what it records and who it is tied to. Read only. */
export function LorePreview({
  universeId,
  entityId,
  chronology,
  isLinked,
  canLink,
  busy,
  onLink,
  onBack,
}: {
  universeId: string
  entityId: string
  chronology: Chronology
  isLinked: boolean
  canLink: boolean
  busy: boolean
  onLink: (row: { id: string; name: string }, link: boolean) => void
  onBack: () => void
}) {
  const { t } = useI18n()
  const [state, setState] = useState<PreviewState>({ kind: 'loading' })
  const nameId = useId()
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    back.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getEntity(universeId, entityId, controller.signal)
      .then(async (entity) => {
        // The relations are extra: the preview stands without them.
        const relations = await listEntityRelationships(
          universeId,
          entityId,
          controller.signal,
        ).catch(() => null)
        if (!controller.signal.aborted) setState({ kind: 'ready', entity, relations })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })
    return () => controller.abort()
  }, [universeId, entityId])

  const facts =
    state.kind === 'ready'
      ? state.entity.fields
          .map((value) => ({ name: value.name, text: String(renderFact(value, chronology)) }))
          .filter((fact) => fact.text !== EMPTY_FACT)
      : []

  return (
    <article className="lorepreview" aria-labelledby={nameId} data-testid="lore-preview">
      <button
        ref={back}
        className="button button--text lorepreview__back"
        type="button"
        onClick={onBack}
        data-testid="lore-preview-back"
      >
        <ActionIcon icon={ArrowLeft} />
        {t('lore.preview.back')}
      </button>

      {state.kind === 'loading' ? (
        <p className="entry__blank" role="status" id={nameId}>
          {t('lore.preview.opening')}
        </p>
      ) : null}
      {state.kind === 'missing' ? (
        <p className="entry__blank" id={nameId} data-testid="lore-preview-missing">
          {t('lore.preview.missing')}
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="form__message" role="alert" id={nameId} data-testid="lore-preview-error">
          {t('lore.preview.error')}
        </p>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <header className="lorepreview__head">
            <EntityTile
              className="lorepreview__tile"
              universeId={universeId}
              entityId={state.entity.id}
              image={state.entity.image}
              typeIcon={state.entity.entityTypeIcon}
              typeAccent={state.entity.entityTypeAccentColor}
            />
            <div className="relation__body">
              <h3 className="lorepreview__name" id={nameId} data-testid="lore-preview-name">
                <bdi>{state.entity.name}</bdi>
              </h3>
              <p className="relation__meta">
                <bdi>{state.entity.entityTypeName}</bdi>
                <StatusBadge
                  step={state.entity.canonStatus}
                  label={CANON_LABELS[state.entity.canonStatus]}
                />
              </p>
            </div>
          </header>

          {state.entity.summary ? (
            <p className="prose lorepreview__summary" data-testid="lore-preview-summary">
              {state.entity.summary}
            </p>
          ) : null}

          {state.entity.aliases.length > 0 || facts.length > 0 ? (
            <dl className="facts" data-testid="lore-preview-facts">
              {state.entity.aliases.length > 0 ? (
                <div className="facts__row">
                  <dt className="facts__key">{t('lore.preview.aliases')}</dt>
                  <dd className="facts__value prose">{state.entity.aliases.join(', ')}</dd>
                </div>
              ) : null}
              {facts.map((fact) => (
                <div className="facts__row" key={fact.name}>
                  <dt className="facts__key">{fact.name}</dt>
                  <dd className="facts__value prose">{fact.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {state.relations && state.relations.length > 0 ? (
            <div className="lorepreview__relations">
              <p className="facts__key">{t('lore.preview.connections')}</p>
              <ul className="lorepreview__list" data-testid="lore-preview-relations">
                {state.relations.slice(0, MAX_RELATIONS).map((relation) => (
                  <li key={relation.id}>
                    {relation.label} <bdi>{relation.relatedEntityName}</bdi>
                  </li>
                ))}
              </ul>
              {state.relations.length > MAX_RELATIONS ? (
                <p className="relation__meta">
                  {t('lore.preview.more', { n: state.relations.length - MAX_RELATIONS })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="lorepreview__actions">
            {canLink ? (
              <button
                className={isLinked ? 'button button--secondary' : 'button'}
                type="button"
                aria-disabled={busy}
                onClick={() => onLink({ id: state.entity.id, name: state.entity.name }, !isLinked)}
                data-testid={isLinked ? 'lore-preview-unlink' : 'lore-preview-link'}
              >
                {isLinked ? t('lore.preview.unlinkScene') : t('lore.preview.linkScene')}
              </button>
            ) : null}
            <Link
              className="button button--text"
              to={`/app/universes/${universeId}/lore/${state.entity.id}`}
              data-testid="lore-preview-open"
            >
              {t('lore.preview.open')}
            </Link>
          </div>
        </>
      ) : null}
    </article>
  )
}
