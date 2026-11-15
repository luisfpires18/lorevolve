import { useEffect, useId, useMemo, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EntityPicker, type EntityChoice } from '../components/EntityPicker'
import { FamilyDiscovery, type FamiliesReturn } from '../components/FamilyDiscovery'
import { FamilyKindDialog } from '../components/FamilyKindDialog'
import { FamilyLinkForm } from '../components/FamilyLinkForm'
import { FamilyTreeTypes } from '../components/FamilyTreeTypes'
import { FamilyTreeView } from '../components/FamilyTreeView'
import { StatusBadge } from '../components/StatusBadge'
import { getFamilyTree } from '../familyTree/api'
import { confirmLeaving } from '../lib/leaveGuard'
import { linkSentence } from '../familyTree/reading'
import type { FamilyTree } from '../familyTree/types'
import { CANON_LABELS, CanonStatus, type EntityType, type EntityTypeGroup } from '../lore/types'
import { listEntityRelationships, listRelationshipTypes } from '../relationships/api'
import {
  FamilySemantic,
  type RelationshipType,
  type RelationshipView,
} from '../relationships/types'
import { PageHeader } from '../components/PageHeader'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { EmptyState } from '../components/EmptyState'
import { useI18n } from '../i18n'

/** The types and groups the page reads to say where the tree is offered: none yet, read, or not readable. */
type Setup = { types: EntityType[]; groups: EntityTypeGroup[] } | 'failed' | null

/**
 * Every answered state carries the entry it is about, so a tree, a refusal or a failure that belongs to the
 * entry before this one is never shown for this one - it reads as still on its way instead.
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; entityId: string; tree: FamilyTree }
  | { kind: 'missing'; entityId: string }
  | { kind: 'error'; entityId: string }

/**
 * The Family Tree: one entry's family, worked out from the parent connections recorded on entries (ADR 0035).
 *
 * The entry in focus is in the address, so a reload, the browser's Back and a link from elsewhere all land on
 * the same family. Nothing here is stored: every relative on screen is derived from explicit links whose kind
 * an author gave a parent meaning, and this page reads them rather than being a second place to keep them.
 *
 * Since ADR 0040 the picker offers only entries of a type the author enabled for the Family Tree - itself, or
 * through a group enabled for it (Issue #37, "Types in Family Tree" at the foot of the page). An entry of a type
 * not enabled still opens here by its address, with a note that says so: nothing recorded is hidden.
 *
 * Each member's other family - "uncle of", "married to" - is in that member's details, as the authored links they
 * are. The focal entry's ordinary relationships, which are not family, are listed apart below the tree and touch
 * nothing in it.
 *
 * Without an entry in the address the page opens on the families already recorded (`FamilyDiscovery`, 035): a few
 * names and a size each, opening the tree on one of them. "Browse families" on a tree goes back to that list.
 */
export default function FamilyTreePage() {
  const { t, tx } = useI18n()
  const access = useUniverseAccess()
  const { universe, types, groups, setGroups, refreshTypes } = useWorkspaceTypes()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const headingId = useId()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [kinds, setKinds] = useState<RelationshipType[] | null>(null)
  // The types and groups, read with the universe: where the tree is offered.
  const setup: Setup =
    types === 'failed' || groups === 'failed'
      ? 'failed'
      : types && groups
        ? { types, groups }
        : null
  const [setupReads, setSetupReads] = useState(0)
  const [others, setOthers] = useState<{ entityId: string; views: RelationshipView[] } | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [isCreatingKind, setIsCreatingKind] = useState(false)
  const [reads, setReads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listRelationshipTypes(universe.id, controller.signal)
      .then(setKinds)
      .catch(() => {
        if (!controller.signal.aborted) setKinds([])
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, reads])

  useEffect(() => {
    if (!entityId) return

    const controller = new AbortController()

    getFamilyTree(universe.id, entityId, controller.signal)
      .then((tree) => setState({ kind: 'ready', entityId, tree }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // The API answers 404 for an entry that is not here, belongs to another universe, or is in the Trash.
        setState(
          (error as { status?: number }).status === 404
            ? { kind: 'missing', entityId }
            : { kind: 'error', entityId },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, reads])

  // The focal entry's relationships, for the ones that are not family. Read beside the tree, never into it.
  useEffect(() => {
    if (!entityId) return

    const controller = new AbortController()

    listEntityRelationships(universe.id, entityId, controller.signal)
      .then((views) => setOthers({ entityId, views }))
      .catch(() => {
        // Not readable is left unsaid: the tree above is complete without it.
        if (!controller.signal.aborted) setOthers({ entityId, views: [] })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, reads])

  // Worked out while rendering rather than stored: no entry in the address is the empty state, and an answer
  // about another entry is a tree still on its way.
  const view: LoadState | { kind: 'idle' } = !entityId
    ? { kind: 'idle' }
    : state.kind !== 'loading' && state.entityId === entityId
      ? state
      : { kind: 'loading' }

  const familyKinds = useMemo(
    () => (kinds ?? []).filter((kind) => kind.familySemantic !== FamilySemantic.None),
    [kinds],
  )

  // Unknown is not "none": when the types cannot be read, say nothing rather than send the author to Types for no reason.
  const hasEligibleType =
    setup === null ? null : setup === 'failed' || setup.types.some((type) => type.familyTreeOffered)

  // Only a kind with no family meaning; one whose kind is not known yet waits rather than being guessed at.
  const plainKinds = useMemo(
    () =>
      new Set(
        (kinds ?? [])
          .filter((kind) => kind.familySemantic === FamilySemantic.None)
          .map((kind) => kind.id),
      ),
    [kinds],
  )
  const otherRelations =
    others && others.entityId === entityId
      ? others.views.filter((view) => plainKinds.has(view.relationshipTypeId))
      : []

  const tree = view.kind === 'ready' ? view.tree : null
  const focal = tree?.nodes.find((node) => node.entityId === tree.focalEntityId) ?? null
  const nodes = useMemo(
    () => new Map((tree?.nodes ?? []).map((node) => [node.entityId, node])),
    [tree],
  )
  const isAdding = !!entityId && addingFor === entityId
  // Only ever a query string this app put there; anything else is ignored rather than followed.
  const carried = (location.state as Partial<FamiliesReturn> | null)?.familiesFrom
  const familiesFrom = typeof carried === 'string' && carried.startsWith('?') ? carried : ''
  const typesPath = `/app/universes/${universe.id}/types`
  const relationKindsPath = `${typesPath}?tab=relations`

  /** A kind made here joins the list at once: no reload, and the form that asked for it chooses it. */
  function addKind(created: RelationshipType) {
    setKinds((current) => [...(current ?? []), created])
  }

  /** Another entry's family. A button rather than a link, so it asks the leave question itself: an unsaved connection
   *  being added here goes with the family it belonged to. */
  async function show(choice: EntityChoice | null) {
    if (!choice || !(await confirmLeaving())) return
    navigate(`/app/universes/${universe.id}/family-tree/${choice.id}`)
  }

  return (
    <section className="family" aria-labelledby={headingId} data-testid="family-tree-page">
      <PageHeader
        title={t('places.familyPage.title')}
        titleId={headingId}
        lede={t('places.familyPage.lede')}
      />

      {entityId ? (
        <>
          {/* Back to the families: the search and page this tree was opened from, if it was. */}
          <Link
            className="family__browse"
            to={`/app/universes/${universe.id}/family-tree${familiesFrom}`}
            data-testid="family-browse"
          >
            <ArrowLeft
              className="family__browseicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            {t('places.familyPage.browse')}
          </Link>
          <div className="family__picker">
            <EntityPicker
              label={focal ? t('places.familyPage.shownFor') : t('places.familyPage.whose')}
              universeId={universe.id}
              value={focal ? { id: focal.entityId, name: focal.name } : null}
              onChange={show}
              familyTreeOnly
              placeholder={t('places.familyPage.pickerPlaceholder')}
            />
          </div>
        </>
      ) : null}

      {hasEligibleType === false ? (
        <p className="notice" data-testid="family-no-types">
          {tx('places.familyPage.noTypes', {
            link: <Link to={typesPath}>{t('places.familyPage.noTypesLink')}</Link>,
          })}
        </p>
      ) : null}

      {hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="notice family__nokinds" data-testid="family-no-kinds">
          <p>
            {tx('places.familyPage.noKinds', {
              link: <Link to={relationKindsPath}>{t('places.familyPage.noKindsLink')}</Link>,
            })}
          </p>
          {access.editContent ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setIsCreatingKind(true)}
              data-testid="family-new-kind"
            >
              <ActionIcon icon={Plus} />
              {t('places.familyPage.newKind')}
            </button>
          ) : null}
        </div>
      ) : null}

      {isCreatingKind ? (
        <FamilyKindDialog
          universeId={universe.id}
          onClose={() => setIsCreatingKind(false)}
          onCreated={(created) => {
            addKind(created)
            setIsCreatingKind(false)
          }}
        />
      ) : null}

      {/* No entry in the address: the families already recorded, once there can be any - a type enabled for the tree
          and a kind with a family meaning. Asked for alongside those checks rather than after them. */}
      {view.kind === 'idle' &&
      hasEligibleType !== false &&
      !(kinds !== null && familyKinds.length === 0) ? (
        <FamilyDiscovery
          key={setupReads}
          universeId={universe.id}
          canEdit={access.editContent}
          onChoose={show}
        />
      ) : null}

      {/* No family kind yet means no family to discover: someone can still be opened, as before, while one is made. */}
      {view.kind === 'idle' && hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="family__picker">
          <EntityPicker
            label={t('places.familyPage.whose')}
            universeId={universe.id}
            value={null}
            onChange={show}
            familyTreeOnly
            placeholder={t('places.familyPage.pickerPlaceholder')}
          />
        </div>
      ) : null}

      {view.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('places.familyPage.loading')}
        </p>
      ) : null}

      {view.kind === 'missing' ? (
        <EmptyState
          testId="family-missing"
          title={t('places.familyPage.missingTitle')}
          hint={tx('places.familyPage.missingHint', {
            link: (
              <Link to={`/app/universes/${universe.id}/lore`}>
                {t('places.familyPage.missingLink')}
              </Link>
            ),
          })}
        />
      ) : null}

      {view.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="family-error">
          <p>{t('places.familyPage.error')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            {t('places.familyPage.retry')}
          </button>
        </div>
      ) : null}

      {tree && focal ? (
        <>
          {focal.entityTypeFamilyTreeEligible ? null : (
            <p className="notice" data-testid="family-type-not-enabled">
              {tx('places.familyPage.typeNotEnabled', {
                type: <bdi>{focal.entityTypeName}</bdi>,
              })}
            </p>
          )}

          {tree.loops.length > 0 ? (
            <div className="callout callout--warning family__loopnote" data-testid="family-loop">
              <p className="callout__title">{t('places.familyPage.loopTitle')}</p>
              <p>{t('places.familyPage.loopBody')}</p>
              <ul className="family__loop">
                {tree.loops.flatMap((loop) =>
                  loop.relationshipIds.map((id) => {
                    const link = tree.links.find((candidate) => candidate.relationshipId === id)
                    return link ? (
                      <li key={id} dir="auto">
                        {linkSentence(link, nodes)}
                      </li>
                    ) : null
                  }),
                )}
              </ul>
            </div>
          ) : null}

          <FamilyTreeView
            universeId={universe.id}
            tree={tree}
            onFocus={(next) => show({ id: next, name: '' })}
          />

          <p className="family__note">{t('places.familyPage.note')}</p>

          {otherRelations.length > 0 ? (
            <section
              className="family__others"
              aria-labelledby={`${headingId}-others`}
              data-testid="family-other-relationships"
            >
              <h2 className="settings__heading" id={`${headingId}-others`}>
                {t('places.familyPage.othersHeading')}
              </h2>
              <p className="settings__note">
                {tx('places.familyPage.othersNote', {
                  name: <bdi>{focal.name}</bdi>,
                  link: (
                    <Link to={`/app/universes/${universe.id}/lore/${focal.entityId}/relations`}>
                      {t('places.familyPage.othersLink')}
                    </Link>
                  ),
                })}
              </p>
              <ul className="family__otherlist">
                {otherRelations.map((relation) => (
                  <li key={relation.id} data-testid="family-other-relationship">
                    <bdi className="family__othername">{focal.name}</bdi>{' '}
                    <bdi className="family__otherlabel">{relation.label}</bdi>{' '}
                    <Link
                      className="family__otherlink"
                      to={`/app/universes/${universe.id}/lore/${relation.relatedEntityId}`}
                    >
                      <bdi>{relation.relatedEntityName}</bdi>
                    </Link>
                    {relation.canonStatus === CanonStatus.Canon ? null : (
                      <StatusBadge
                        step={relation.canonStatus}
                        label={t('places.familyPage.relationshipStatus', {
                          status: CANON_LABELS[relation.canonStatus],
                        })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {access.editContent && familyKinds.length > 0 ? (
            isAdding ? (
              <FamilyLinkForm
                universeId={universe.id}
                focal={{ id: focal.entityId, name: focal.name }}
                kinds={familyKinds}
                onKindCreated={addKind}
                onSaved={() => {
                  setAddingFor(null)
                  setReads((current) => current + 1)
                }}
                onCancel={() => setAddingFor(null)}
              />
            ) : (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setAddingFor(entityId ?? null)}
                data-testid="add-family-link"
              >
                <ActionIcon icon={Plus} />
                {t('places.familyPage.add')}
              </button>
            )
          ) : null}
        </>
      ) : null}

      {typeof setup === 'object' && setup !== null ? (
        <FamilyTreeTypes
          universeId={universe.id}
          types={setup.types}
          groups={setup.groups}
          canEdit={access.editContent}
          defaultOpen={hasEligibleType === false}
          onChanged={(changed) => {
            // Shown at once as the API answered; what it changes - the types offered, the families listing and the open
            // tree's notes - is read again.
            setGroups(setup.groups.map((group) => (group.id === changed.id ? changed : group)))
            refreshTypes().catch(() => undefined)
            setSetupReads((current) => current + 1)
            setReads((current) => current + 1)
          }}
        />
      ) : null}
    </section>
  )
}
