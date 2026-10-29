import { useEffect, useId, useMemo, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
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
import { listEntityTypeGroups, listEntityTypes } from '../lore/api'
import { CANON_LABELS, CanonStatus, type EntityType, type EntityTypeGroup } from '../lore/types'
import { listEntityRelationships, listRelationshipTypes } from '../relationships/api'
import {
  FamilySemantic,
  type RelationshipType,
  type RelationshipView,
} from '../relationships/types'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'
import { EmptyState } from '../components/EmptyState'

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
  | { kind: 'error'; entityId: string; message: string }

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
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const headingId = useId()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [kinds, setKinds] = useState<RelationshipType[] | null>(null)
  const [setup, setSetup] = useState<Setup>(null)
  const [setupReads, setSetupReads] = useState(0)
  const [others, setOthers] = useState<{ entityId: string; views: RelationshipView[] } | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [isCreatingKind, setIsCreatingKind] = useState(false)
  const [reads, setReads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      listEntityTypes(universe.id, controller.signal),
      listEntityTypeGroups(universe.id, controller.signal),
    ])
      .then(([types, groups]) => setSetup({ types, groups }))
      .catch(() => {
        if (!controller.signal.aborted) setSetup('failed')
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, setupReads])

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
            : { kind: 'error', entityId, message: 'This family tree could not be read.' },
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
        title="Family Tree"
        titleId={headingId}
        lede="Parents, grandparents, siblings, aunts and uncles, cousins, nieces and nephews, children and grandchildren, worked out from the connections you have recorded. Only a relation kind you have given a family meaning counts."
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
            Browse families
          </Link>
          <div className="family__picker">
            <EntityPicker
              label={focal ? 'Family shown for' : 'Whose family?'}
              universeId={universe.id}
              value={focal ? { id: focal.entityId, name: focal.name } : null}
              onChange={show}
              familyTreeOnly
              placeholder="Search this universe"
            />
          </div>
        </>
      ) : null}

      {hasEligibleType === false ? (
        <p className="notice" data-testid="family-no-types">
          No Lore Type is enabled for Family Tree yet. You can enable a type when you create it,
          under <Link to={typesPath}>Types → Lore Types</Link>, or turn on a group of types under
          Types in Family Tree, below.
        </p>
      ) : null}

      {hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="notice family__nokinds" data-testid="family-no-kinds">
          <p>
            Family Tree needs a family relation kind: “parent of”, “uncle of”, “married to”. A kind
            means nothing to the tree until you give it a family meaning, whatever it is called.
            Create one here, or give a meaning to an existing kind under{' '}
            <Link to={relationKindsPath}>Types → Relation Kinds</Link>.
          </p>
          {access.editContent ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setIsCreatingKind(true)}
              data-testid="family-new-kind"
            >
              <ActionIcon icon={Plus} />
              New family relationship kind
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
            label="Whose family?"
            universeId={universe.id}
            value={null}
            onChange={show}
            familyTreeOnly
            placeholder="Search this universe"
          />
        </div>
      ) : null}

      {view.kind === 'loading' ? (
        <p className="notice" role="status">
          Working out this family…
        </p>
      ) : null}

      {view.kind === 'missing' ? (
        <EmptyState
          testId="family-missing"
          title="That entry is not here."
          hint={
            <>
              It may have been moved to the Trash, deleted, or it belongs to another universe.{' '}
              <Link to={`/app/universes/${universe.id}/lore`}>Back to Lore</Link>
            </>
          }
        />
      ) : null}

      {view.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="family-error">
          <p>{view.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {tree && focal ? (
        <>
          {focal.entityTypeFamilyTreeEligible ? null : (
            <p className="notice" data-testid="family-type-not-enabled">
              This entry&rsquo;s type, <bdi>{focal.entityTypeName}</bdi>, is not currently enabled
              for Family Tree. Its recorded family is still shown here.
            </p>
          )}

          {tree.loops.length > 0 ? (
            <div className="callout callout--warning family__loopnote" data-testid="family-loop">
              <p className="callout__title">These connections go round in a circle</p>
              <p>
                Nobody in it can be placed above the others, so the tree below shows them where it
                can. Nothing has been changed: open the entries and correct or remove one of them.
              </p>
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

          <p className="family__note">
            Relatives are worked out from the parent connections themselves, every time this page is
            opened. Nothing on it is stored as a connection of its own, and a sibling here means one
            shared parent that somebody wrote down, and nothing more. Other family you recorded,
            like a spouse or a guardian, is listed in each person&rsquo;s details and shown while
            you point at or focus them; a spouse stands beside them. It places nobody in a
            generation.
          </p>

          {otherRelations.length > 0 ? (
            <section
              className="family__others"
              aria-labelledby={`${headingId}-others`}
              data-testid="family-other-relationships"
            >
              <h2 className="settings__heading" id={`${headingId}-others`}>
                Other relationships
              </h2>
              <p className="settings__note">
                <bdi>{focal.name}</bdi>&rsquo;s relationships that are not family. They are not part
                of the tree above.{' '}
                <Link to={`/app/universes/${universe.id}/lore/${focal.entityId}/relations`}>
                  All relations
                </Link>
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
                        label={`${CANON_LABELS[relation.canonStatus]} relationship`}
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
                Add family connection
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
            setSetup((current) =>
              typeof current === 'object' && current !== null
                ? {
                    ...current,
                    groups: current.groups.map((group) =>
                      group.id === changed.id ? changed : group,
                    ),
                  }
                : current,
            )
            setSetupReads((current) => current + 1)
            setReads((current) => current + 1)
          }}
        />
      ) : null}
    </section>
  )
}
