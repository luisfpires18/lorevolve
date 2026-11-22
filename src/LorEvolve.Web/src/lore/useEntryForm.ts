import { useCallback, useMemo } from 'react'
import { useLeaveGuard } from '../lib/leaveGuard'
import type { FieldSection, EntityType } from './typeDefinitions'
import { groupBySection } from './fieldSections'
import { useI18n } from '../i18n'
import { comparable, draftFromDetail } from './entryDraft'
import type { NavigateFunction } from 'react-router-dom'
import type { UniverseCapabilities } from '../universes/access'
import type { Chronology } from '../chronology/types'
import type { EntryView } from '../components/lore/EntryViewPanel'
import type { useEntryLoad } from './useEntryLoad'
import type { useEntryState } from './useEntryState'

/** The form around the draft: its sections, Quick Create, whether it changed, the leave question, and opening it. */
export function useEntryForm({
  sectionOpen,
  types,
  detail,
  selectedType,
  access,
  isSuggesting,
  chronology,
  isNew,
  isFormOpen,
  blankDraft,
  draft,
  pendingImage,
  pendingFieldImages,
  setDraft,
  setPendingImage,
  setPendingFieldImages,
  setIsEditing,
  setIsSuggesting,
  setMessage,
  setFieldErrors,
  setBlocked,
  setConflict,
  setSent,
  view,
  navigate,
  entryPath,
}: ReturnType<typeof useEntryState> &
  ReturnType<typeof useEntryLoad> & {
    types: EntityType[]
    access: UniverseCapabilities
    chronology: Chronology
    isNew: boolean
    view: EntryView
    navigate: NavigateFunction
    entryPath: string
  }) {
  const { t } = useI18n()
  const isSectionOpen = (section: FieldSection) =>
    sectionOpen[section.id] ?? !section.startsCollapsed
  // The form's fields as their type lays them out: ungrouped first, then each section that holds any (Issue #26).
  const formSections = useMemo(
    () =>
      groupBySection(
        selectedType?.fields ?? [],
        (field) => field.sectionId,
        selectedType?.fieldSections ?? [],
      ),
    [selectedType],
  )

  // The entry's facts the same way, by the section of the field each one is for.
  const factSections = useMemo(() => {
    const type = types.find((each) => each.id === detail?.entityTypeId)
    const sectionOf = new Map(type?.fields.map((field) => [field.id, field.sectionId]))
    return groupBySection(
      detail?.fields ?? [],
      (value) => sectionOf.get(value.fieldDefinitionId),
      type?.fieldSections ?? [],
    )
  }, [types, detail])

  // Quick Create on the form's link fields (Issue #25): only for someone who may create Lore, and never while suggesting -
  // a suggestion writes nothing until it is accepted, so it must not make an entry on the side.
  const quickCreate = useMemo(
    () =>
      access.editContent && !isSuggesting
        ? { chronology, keepHint: t('entity.page.keepLinkHint') }
        : null,
    [access.editContent, isSuggesting, chronology, t],
  )

  const offersFamilyTree =
    !!detail &&
    (detail.hasFamilyConnections ||
      !!types.find((type) => type.id === detail.entityTypeId)?.familyTreeOffered)

  // Whether the open form differs from what is stored, or for a new entry from the blank form - said in the
  // form's bar, in words, and asked about before the author leaves it. A change put back is no change. A new
  // entry's framed picture waits in the form, so it counts; an existing entry's picture is written the moment
  // it is framed, so there is nothing of it to lose.
  const isDirty = useMemo(() => {
    const baseline = isNew ? blankDraft : detail ? draftFromDetail(detail) : null
    if (!isFormOpen || draft === null || baseline === null) return false
    if (isNew && (pendingImage !== null || Object.keys(pendingFieldImages).length > 0)) return true
    return comparable(draft, types) !== comparable(baseline, types)
  }, [isFormOpen, isNew, blankDraft, detail, draft, types, pendingImage, pendingFieldImages])

  /** Lets the form's changes go and closes it: Cancel, or the author choosing to leave. */
  const discard = useCallback(() => {
    setDraft(detail ? draftFromDetail(detail) : null)
    setPendingImage(null)
    setPendingFieldImages({})
    setIsEditing(false)
    setIsSuggesting(false)
    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setConflict(false)
  }, [detail])

  useLeaveGuard(
    !isDirty
      ? null
      : isNew
        ? t('entity.page.leave.newEntry')
        : isSuggesting
          ? t('entity.page.leave.suggestion', {
              name: detail?.name ?? t('entity.page.leave.suggestionFallback'),
            })
          : t('entity.page.leave.edit', {
              name: detail?.name ?? t('entity.page.leave.editFallback'),
            }),
    discard,
  )

  /**
   * Starts the entry's own form, from whichever view the author pressed Edit on.
   *
   * The form edits what the Article view shows - the picture, the facts, the summary - so it opens there.
   * A move from Relations or History is an ordinary navigation, so anything unsaved has already been asked
   * about by the time this runs.
   */
  function startEditing() {
    setIsSuggesting(false)
    setSent(false)
    setIsEditing(true)
    if (view !== 'article') void navigate(entryPath)
  }

  /** The same form, to send a suggestion rather than save (task 045). */
  function startSuggesting() {
    setIsSuggesting(true)
    setSent(false)
    setIsEditing(true)
    if (view !== 'article') void navigate(entryPath)
  }
  return {
    isSectionOpen,
    formSections,
    factSections,
    quickCreate,
    offersFamilyTree,
    isDirty,
    discard,
    startEditing,
    startSuggesting,
  }
}
