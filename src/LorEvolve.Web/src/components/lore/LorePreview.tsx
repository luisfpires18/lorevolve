import { useCallback, useEffect, useId, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { EntityRow } from '../EntityRow'
import { CanonBadge } from '../CanonBadge'
import type { Chronology } from '../../chronology/types'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { getEntity } from '../../lore/api'
import { EMPTY_FACT, renderFact } from '../../lore/facts'
import { listEntityRelationships } from '../../relationships/api'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'

const MAX_RELATIONS = 8

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
  const nameId = useId()
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    back.current?.focus()
  }, [])

  const read = useCallback(
    async (signal: AbortSignal) => {
      const entity = await getEntity(universeId, entityId, signal)
      // The relations are extra: the preview stands without them.
      const relations = await listEntityRelationships(universeId, entityId, signal).catch(
        () => null,
      )
      return { entity, relations }
    },
    [universeId, entityId],
  )
  const { load: state } = useAsyncRead(read, { missing: true })

  const facts =
    state.kind === 'ready'
      ? state.value.entity.fields
          .map((value) => ({ name: value.name, text: String(renderFact(value, chronology)) }))
          .filter((fact) => fact.text !== EMPTY_FACT)
      : []

  return (
    <article className="lorepreview" aria-labelledby={nameId} data-testid="lore-preview">
      <Button
        tone="text"
        icon={ArrowLeft}
        className="lorepreview__back"
        ref={back}
        onClick={onBack}
        data-testid="lore-preview-back"
      >
        {t('lore.preview.back')}
      </Button>

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
            <EntityRow
              universeId={universeId}
              entityId={state.value.entity.id}
              image={state.value.entity.image}
              typeIcon={state.value.entity.entityTypeIcon}
              typeAccent={state.value.entity.entityTypeAccentColor}
              name={
                <h3 className="lorepreview__name" id={nameId} data-testid="lore-preview-name">
                  <bdi>{state.value.entity.name}</bdi>
                </h3>
              }
              meta={
                <>
                  <bdi>{state.value.entity.entityTypeName}</bdi>
                  <CanonBadge status={state.value.entity.canonStatus} />
                </>
              }
            />
          </header>

          {state.value.entity.summary ? (
            <p className="prose lorepreview__summary" data-testid="lore-preview-summary">
              {state.value.entity.summary}
            </p>
          ) : null}

          {state.value.entity.aliases.length > 0 || facts.length > 0 ? (
            <dl className="facts" data-testid="lore-preview-facts">
              {state.value.entity.aliases.length > 0 ? (
                <div className="facts__row">
                  <dt className="facts__key">{t('lore.preview.aliases')}</dt>
                  <dd className="facts__value prose">{state.value.entity.aliases.join(', ')}</dd>
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

          {state.value.relations && state.value.relations.length > 0 ? (
            <div className="lorepreview__relations">
              <p className="facts__key">{t('lore.preview.connections')}</p>
              <ul className="lorepreview__list" data-testid="lore-preview-relations">
                {state.value.relations.slice(0, MAX_RELATIONS).map((relation) => (
                  <li key={relation.id}>
                    {relation.label} <bdi>{relation.relatedEntityName}</bdi>
                  </li>
                ))}
              </ul>
              {state.value.relations.length > MAX_RELATIONS ? (
                <QuietNote className="lorepreview__more">
                  {t('lore.preview.more', { n: state.value.relations.length - MAX_RELATIONS })}
                </QuietNote>
              ) : null}
            </div>
          ) : null}

          <div className="actions">
            {canLink ? (
              <Button
                tone={isLinked ? 'secondary' : 'primary'}
                aria-disabled={busy}
                onClick={() =>
                  onLink({ id: state.value.entity.id, name: state.value.entity.name }, !isLinked)
                }
                data-testid={isLinked ? 'lore-preview-unlink' : 'lore-preview-link'}
              >
                {isLinked ? t('lore.preview.unlinkScene') : t('lore.preview.linkScene')}
              </Button>
            ) : null}
            <Button
              tone="text"
              to={`/app/universes/${universeId}/lore/${state.value.entity.id}`}
              data-testid="lore-preview-open"
            >
              {t('lore.preview.open')}
            </Button>
          </div>
        </>
      ) : null}
    </article>
  )
}
