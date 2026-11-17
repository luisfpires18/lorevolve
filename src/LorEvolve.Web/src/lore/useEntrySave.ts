import { useCallback } from 'react'
import { saveEntityArticle } from './article'
import { emptyValue, valuedFields } from './document'
import { setEntityImage, setFieldImage } from './images'
import { blockingFindingsOf } from '../canon/blocked'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { createEntity, ENTRY_CHANGED, updateEntity } from './api'
import { type EntityDetail } from './types'
import { suggestEntryChanges } from '../suggestions/api'
import { useI18n } from '../i18n'
import { draftFromDetail } from './entryDraft'
import type { NavigateFunction } from 'react-router-dom'
import type { useEntryForm } from './useEntryForm'
import type { useEntryLoad } from './useEntryLoad'
import type { useEntryState } from './useEntryState'

/** Saves the form or sends it as a suggestion, and the two ways out of a conflict. */
export function useEntrySave({
  draft,
  setMessage,
  setFieldErrors,
  setBlocked,
  setConflict,
  setIsSaving,
  selectedType,
  detail,
  isSuggesting,
  universe,
  entityId,
  setDraft,
  setIsEditing,
  setIsSuggesting,
  setSent,
  pendingImage,
  setPendingImage,
  pendingFieldImages,
  setPendingFieldImages,
  copyArticle,
  source,
  setDetail,
  setHistoryKey,
  navigate,
  formSections,
  setSectionOpen,
  focusField,
  setAnnouncement,
  saveButton,
}: ReturnType<typeof useEntryState> &
  ReturnType<typeof useEntryLoad> &
  ReturnType<typeof useEntryForm> & {
    universe: { id: string }
    entityId: string | undefined
    navigate: NavigateFunction
  }) {
  const { t } = useI18n()
  const isNew = entityId === undefined

  const save = useCallback(async () => {
    if (!draft) return

    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setConflict(false)
    setIsSaving(true)

    const definitions = selectedType?.fields ?? []
    const input = {
      entityTypeId: draft.entityTypeId,
      name: draft.name.trim(),
      summary: draft.summary.trim() ? draft.summary.trim() : null,
      canonStatus: draft.canonStatus,
      aliases: draft.aliases,
      tags: draft.tags,
      fields: valuedFields(definitions).map(
        (definition) => draft.fields[definition.id] ?? emptyValue(definition),
      ),
      // The version the form was opened on - or the latest the author reviewed after a refusal.
      expectedVersion: detail?.version,
    }

    try {
      if (isSuggesting && !isNew) {
        // Sent for review, not saved: the entry on screen is still the stored one, so the form simply closes on it.
        await suggestEntryChanges(universe.id, entityId, input)
        setDraft(detail ? draftFromDetail(detail) : null)
        setIsEditing(false)
        setIsSuggesting(false)
        setSent(true)
        return
      }

      const saved = isNew
        ? await createEntity(universe.id, input)
        : await updateEntity(universe.id, entityId, input)

      // The entry exists now, so the picture that was waiting has somewhere to go. It is a
      // separate write and it is allowed to fail on its own: the lore is already stored, so a
      // refused image says so and leaves everything else alone.
      let image = saved.image
      if (isNew && pendingImage) {
        try {
          image = await setEntityImage(universe.id, saved.id, pendingImage.file, pendingImage.crop)
          setPendingImage(null)
        } catch (failure: unknown) {
          setMessage(
            failure instanceof ApiError
              ? (failure.fieldErrors.file ?? failure.message)
              : t('entity.page.save.imageFailed'),
          )
        }
      }

      // Each Image field's held picture is a write of its own, for the same reason: the entry is stored either way.
      let fieldImages = saved.fieldImages
      if (isNew) {
        for (const [fieldId, held] of Object.entries(pendingFieldImages)) {
          try {
            const uploaded = await setFieldImage(
              universe.id,
              saved.id,
              fieldId,
              held.file,
              held.crop,
            )
            fieldImages = [...fieldImages.filter((one) => one.fieldId !== fieldId), uploaded]
          } catch (failure: unknown) {
            setMessage(
              failure instanceof ApiError
                ? (failure.fieldErrors.file ?? failure.message)
                : t('entity.fieldImage.uploadFailed', {
                    name: selectedType?.fields.find((one) => one.id === fieldId)?.name ?? '',
                  }),
            )
          }
        }
        setPendingFieldImages({})
      }

      // A copied article is the same kind of second write: the copy exists either way, and a refused article says so.
      // Its text is the one the copy panel showed, links and all, saved as the new entry's first version.
      if (isNew && copyArticle && source?.article) {
        try {
          await saveEntityArticle(universe.id, saved.id, {
            content: source.article.content,
            expectedVersion: 0,
          })
        } catch {
          setMessage(t('entity.page.save.articleFailed'))
        }
      }

      const stored = { ...saved, image, fieldImages }

      setDetail(stored)
      setDraft(draftFromDetail(stored))
      setIsEditing(false)
      setHistoryKey((key) => key + 1)

      if (isNew) {
        await navigate(`/app/universes/${universe.id}/lore/${saved.id}`, { replace: true })
      }
    } catch (error: unknown) {
      // A refusal from the promotion gate is not a save failure to report in one line:
      // the draft is still on screen and still editable, and the findings say why.
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (isChangedElsewhere(error, ENTRY_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        // The first field it names, in the order the form shows them, gets the focus - its section opened first, and any
        // other section holding a refused field with it, so nothing that needs the author stays folded away.
        const refused = [
          ...formSections.ungrouped,
          ...formSections.groups.flatMap((group) => group.items),
        ].filter((definition) => error.fieldErrors[definition.id])
        if (refused.length > 0) {
          setSectionOpen((current) => ({
            ...current,
            ...Object.fromEntries(
              refused.flatMap((definition) =>
                definition.sectionId ? [[definition.sectionId, true]] : [],
              ),
            ),
          }))
          focusField.current = refused[0].id
        }
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : isSuggesting
              ? t('entity.page.save.fieldsSuggest')
              : t('entity.page.save.fieldsSave'),
        )
      } else {
        setMessage(
          isSuggesting ? t('entity.page.save.suggestFailed') : t('entity.page.save.failed'),
        )
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    draft,
    selectedType,
    formSections,
    isNew,
    universe.id,
    entityId,
    navigate,
    pendingImage,
    pendingFieldImages,
    detail,
    isSuggesting,
    copyArticle,
    source,
    t,
  ])

  /**
   * The author has seen the latest entry and keeps their own changes: the form stays exactly as it is, now measured against
   * the latest - and the next save names the version they reviewed, so it is refused again if that moved on too.
   */
  function keepMine(latest: EntityDetail) {
    setDetail(latest)
    setConflict(false)
    setHistoryKey((key) => key + 1)
    setAnnouncement(t('entity.page.announce.keptMine'))
    requestAnimationFrame(() => saveButton.current?.focus())
  }

  /** Lets the form's unsaved changes go for the latest entry, and keeps the form open on it. The notice has already asked. */
  function takeLatest(latest: EntityDetail) {
    setDetail(latest)
    setDraft(draftFromDetail(latest))
    setConflict(false)
    setHistoryKey((key) => key + 1)
    requestAnimationFrame(() => saveButton.current?.focus())
  }
  return { save, keepMine, takeLatest }
}
