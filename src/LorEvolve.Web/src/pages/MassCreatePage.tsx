import { useId, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { useI18n } from '../i18n'
import { typeChoices } from '../lore/typeTree'
import { hasRequiredFields } from '../lore/massCreate'
import { CanonStatus, type CanonStatusValue } from '../lore/types'
import { NO_TYPES, type EntityType } from '../lore/typeDefinitions'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { useMassRows } from '../lore/useMassRows'
import { useMassCreate } from '../lore/useMassCreate'
import { MassCreateDefaults } from '../components/lore/MassCreateDefaults'
import { MassCreatePaste } from '../components/lore/MassCreatePaste'
import { MassCreateReview } from '../components/lore/MassCreateReview'
import { MassCreateBar } from '../components/lore/MassCreateBar'

type Load = { kind: 'loading' } | { kind: 'ready'; types: EntityType[] } | { kind: 'error' }

/** What Lore is told after a mass create, so it can say how many entries arrived. */
export interface MassCreatedState {
  massCreated: number
}

/**
 * Mass create: "I have 40 names. Put them in LorEvolve."
 *
 * One page, top to bottom, no steps: the defaults, a paste target, the rows to review, and one Create. What arrives is
 * only each entry's basic shell - type, name, Canon status - and everything else is added later on the entry itself.
 * The rows are the author's until they are created: a failed create keeps every one of them, and leaving asks first.
 *
 * Creation is one request and all or nothing (`POST .../entities/bulk`). The page checks every row before it lets the
 * request go, and the API checks it all again; either way a problem is shown on the row it belongs to.
 */
export default function MassCreatePage() {
  const { t } = useI18n()
  const { universe, entryTypes: typesRead, refreshTypes } = useWorkspaceTypes()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = useId()
  const lorePath = `/app/universes/${universe.id}/lore`

  // The universe's types, read with it.
  const load: Load =
    typesRead === 'failed'
      ? { kind: 'error' }
      : typesRead
        ? { kind: 'ready', types: typesRead }
        : { kind: 'loading' }
  const types = load.kind === 'ready' ? load.types : NO_TYPES
  const typesById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types])
  // One exact type a row: every type in the hierarchy's order, named by its path.
  const choices = useMemo(() => typeChoices(types), [types])
  const eligible = types.filter((type) => !hasRequiredFields(type))

  // Opened from a Lore type, that type starts as the default, as a new entry opened there does; otherwise the first. Read
  // by id only. A type a name alone cannot create is passed over for the first one it can.
  const startingType = types.find((type) => type.id === params.get('type')) ?? null
  const startingBlocked = startingType !== null && hasRequiredFields(startingType)
  const [chosenTypeId, setChosenTypeId] = useState<string | null>(null)
  const defaultTypeId =
    chosenTypeId ?? (startingType && !startingBlocked ? startingType : eligible[0])?.id ?? ''
  const [defaultStatus, setDefaultStatus] = useState<CanonStatusValue>(CanonStatus.Idea)
  const backTo = startingType ? `${lorePath}?type=${startingType.id}` : lorePath

  const massRows = useMassRows({ types, typesById, defaultTypeId, defaultStatus, id })
  const { announcement } = massRows
  const { create, unavailable, status } = useMassCreate({
    ...massRows,
    universe,
    navigate,
    lorePath,
  })

  return (
    <article className="masscreate">
      <PageHeader
        crumb={
          <Link to={backTo} data-testid="mass-create-back">
            {t('lore.massCreate.crumb')}
          </Link>
        }
        title={t('lore.massCreate.title')}
        titleTestId="mass-create-title"
        lede={t('lore.massCreate.lede')}
      />

      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('lore.massCreate.readingTypes')}
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{t('lore.massCreate.typesFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              refreshTypes().catch(() => undefined)
            }}
          >
            {t('lore.massCreate.retry')}
          </button>
        </div>
      ) : null}

      {load.kind === 'ready' && eligible.length === 0 ? (
        <p className="callout callout--warning" data-testid="mass-create-no-types">
          {types.length === 0 ? t('lore.massCreate.noTypes') : t('lore.massCreate.allRequired')}
        </p>
      ) : null}

      {load.kind === 'ready' ? (
        <>
          <MassCreateDefaults
            {...massRows}
            id={id}
            choices={choices}
            eligible={eligible}
            startingType={startingType}
            startingBlocked={startingBlocked}
            setChosenTypeId={setChosenTypeId}
            defaultTypeId={defaultTypeId}
            defaultStatus={defaultStatus}
            setDefaultStatus={setDefaultStatus}
          />

          <MassCreatePaste {...massRows} id={id} />

          <MassCreateReview {...massRows} id={id} choices={choices} />

          <MassCreateBar
            {...massRows}
            universe={universe}
            backTo={backTo}
            create={create}
            unavailable={unavailable}
            status={status}
          />
        </>
      ) : null}

      <p className="visually-hidden" role="status" data-testid="mass-announcement">
        {announcement}
      </p>
    </article>
  )
}
