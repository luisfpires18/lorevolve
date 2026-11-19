import { useId, useMemo } from 'react'
import { useUniverseAccess } from '../universes/access'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { EntityChoice } from '../components/EntityPicker'
import type { FamiliesReturn } from '../components/FamilyDiscovery'
import { FamilyTreeTypes } from '../components/FamilyTreeTypes'
import { FamilyTreeView } from '../components/FamilyTreeView'
import { confirmLeaving } from '../lib/leaveGuard'
import { FamilySemantic, type RelationshipType } from '../relationships/types'
import { PageHeader } from '../components/PageHeader'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { useI18n } from '../i18n'
import type { LoadState, Setup } from '../familyTree/useFamilyTreeState'
import { useFamilyTreeReads } from '../familyTree/useFamilyTreeReads'
import { useFamilyTreeState } from '../familyTree/useFamilyTreeState'
import { FamilyAddLink } from '../components/familyTree/FamilyAddLink'
import { FamilyEntityBar } from '../components/familyTree/FamilyEntityBar'
import { FamilyLoadStates } from '../components/familyTree/FamilyLoadStates'
import { FamilyOtherRelations } from '../components/familyTree/FamilyOtherRelations'
import { FamilySetupNotices } from '../components/familyTree/FamilySetupNotices'
import { FamilyStart } from '../components/familyTree/FamilyStart'
import { FamilyTreeNotes } from '../components/familyTree/FamilyTreeNotes'
import { QuietNote } from '../components/QuietNote'

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
  const { t } = useI18n()
  const access = useUniverseAccess()
  const { universe, types, groups, setGroups, refreshTypes } = useWorkspaceTypes()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const headingId = useId()

  const pageState = useFamilyTreeState()
  const {
    state,
    setState,
    kinds,
    setKinds,
    setupReads,
    setSetupReads,
    others,
    addingFor,
    setAddingFor,
    isCreatingKind,
    setIsCreatingKind,
    setReads,
  } = pageState

  // The types and groups, read with the universe: where the tree is offered.
  const setup: Setup =
    types === 'failed' || groups === 'failed'
      ? 'failed'
      : types && groups
        ? { types, groups }
        : null

  useFamilyTreeReads({ ...pageState, universe, entityId })

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
        <FamilyEntityBar
          universe={universe}
          familiesFrom={familiesFrom}
          focal={focal}
          show={show}
        />
      ) : null}

      <FamilySetupNotices
        universe={universe}
        access={access}
        hasEligibleType={hasEligibleType}
        kinds={kinds}
        familyKinds={familyKinds}
        typesPath={typesPath}
        relationKindsPath={relationKindsPath}
        isCreatingKind={isCreatingKind}
        setIsCreatingKind={setIsCreatingKind}
        addKind={addKind}
      />

      <FamilyStart
        universe={universe}
        access={access}
        view={view}
        hasEligibleType={hasEligibleType}
        kinds={kinds}
        familyKinds={familyKinds}
        setupReads={setupReads}
        show={show}
      />

      <FamilyLoadStates universe={universe} view={view} setState={setState} setReads={setReads} />

      {tree && focal ? (
        <>
          <FamilyTreeNotes tree={tree} focal={focal} nodes={nodes} />

          <FamilyTreeView
            universeId={universe.id}
            tree={tree}
            onFocus={(next) => show({ id: next, name: '' })}
          />

          <QuietNote className="family__note">{t('places.familyPage.note')}</QuietNote>

          {otherRelations.length > 0 ? (
            <FamilyOtherRelations
              universe={universe}
              headingId={headingId}
              focal={focal}
              otherRelations={otherRelations}
            />
          ) : null}

          {access.editContent && familyKinds.length > 0 ? (
            <FamilyAddLink
              universe={universe}
              entityId={entityId}
              focal={focal}
              familyKinds={familyKinds}
              isAdding={isAdding}
              addKind={addKind}
              setAddingFor={setAddingFor}
              setReads={setReads}
            />
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
