import type { Dispatch, SetStateAction } from 'react'
import type { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { FIELD_REQUIRED_MISSING_CODE, archiveField, deleteField, restoreField } from './fieldsApi'
import { FIELD_SEMANTIC_LABELS, FieldKind } from './fieldKinds'
import { fieldInUseDetail } from './fieldInUse'
import type { EntityType, FieldDefinition } from './typeDefinitions'

/** A type's field list handlers: clear the lines, say a failure, archive, restore and delete a field. */
export function typeFieldActions({
  universeId,
  type,
  onChanged,
  t,
  tn,
  tx,
  setNotice,
  setMessage,
  setBlocked,
  setRestoreOffer,
  setBusyFieldId,
}: {
  universeId: string
  type: EntityType
  onChanged: () => Promise<void>
  setNotice: Dispatch<SetStateAction<string | null>>
  setMessage: Dispatch<SetStateAction<string | null>>
  setBlocked: Dispatch<SetStateAction<{ fieldId: string; text: string } | null>>
  setRestoreOffer: Dispatch<SetStateAction<{ fieldId: string; text: string } | null>>
  setBusyFieldId: Dispatch<SetStateAction<string | null>>
} & Pick<ReturnType<typeof useI18n>, 't' | 'tn' | 'tx'>) {
  function clear() {
    setNotice(null)
    setMessage(null)
    setBlocked(null)
    setRestoreOffer(null)
  }

  function report(error: unknown, fallback: string) {
    setMessage(error instanceof ApiError ? error.message : fallback)
  }

  async function archive(field: FieldDefinition) {
    clear()
    const lines = [t('entityTypes.fields.archiveHides', { name: type.name })]
    lines.push(
      field.entryCount === 0
        ? t('entityTypes.fields.archiveNoValues')
        : tn('entityTypes.fields.archiveKeepsValues', field.entryCount, { n: field.entryCount }),
    )
    if (field.isRequired) lines.push(t('entityTypes.fields.archiveRequired'))
    if (field.semantic !== null && field.semantic !== undefined) {
      lines.push(
        t('entityTypes.fields.archiveCanonMeaning', {
          meaning: FIELD_SEMANTIC_LABELS[field.semantic].toLowerCase(),
        }),
      )
    } else if (field.kind === FieldKind.EntityReference) {
      lines.push(t('entityTypes.fields.archiveCanonLinks'))
    }
    if (
      !(await confirmAction({
        title: <>{tx('entityTypes.fields.archiveTitle', { name: <bdi>{field.name}</bdi> })}</>,
        message: lines.join(' '),
        confirmLabel: t('entityTypes.fields.archiveConfirm'),
        variant: 'warning',
      }))
    ) {
      return
    }

    setBusyFieldId(field.id)
    try {
      await archiveField(universeId, type.id, field.id)
      await onChanged()
      setNotice(t('entityTypes.fields.archived', { name: field.name }))
    } catch (error: unknown) {
      report(error, t('entityTypes.fields.archiveFailed'))
    } finally {
      setBusyFieldId(null)
    }
  }

  async function restore(field: FieldDefinition, asOptional = false) {
    clear()
    setBusyFieldId(field.id)
    try {
      await restoreField(universeId, type.id, field.id, asOptional)
      await onChanged()
      setNotice(
        asOptional
          ? t('entityTypes.fields.restoredOptional', { name: field.name })
          : t('entityTypes.fields.restored', { name: field.name }),
      )
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === FIELD_REQUIRED_MISSING_CODE) {
        setRestoreOffer({ fieldId: field.id, text: error.message })
      } else {
        report(error, t('entityTypes.fields.restoreFailed'))
        if (error instanceof ApiError && error.status === 409)
          await onChanged().catch(() => undefined)
      }
    } finally {
      setBusyFieldId(null)
    }
  }

  /**
   * Permanent deletion. A field holding values anywhere, the Trash included, or recorded by an older version of an entry,
   * is not offered a confirmation it could only fail: the author is told why, and where archiving is. An empty one asks
   * once and is gone.
   */
  async function remove(field: FieldDefinition) {
    clear()
    if (field.entryCount > 0) {
      setBlocked({
        fieldId: field.id,
        text: fieldInUseDetail(field.entryCount, field.trashedEntryCount),
      })
      return
    }
    if (field.usedInHistory) {
      setBlocked({
        fieldId: field.id,
        text: t('entityTypes.fields.usedInHistory'),
      })
      return
    }
    if (
      !(await confirmAction({
        title: <>{tx('entityTypes.fields.deleteTitle', { name: <bdi>{field.name}</bdi> })}</>,
        message: t('entityTypes.fields.deleteMessage'),
        confirmLabel: t('entityTypes.fields.deleteConfirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }

    setBusyFieldId(field.id)
    try {
      await deleteField(universeId, type.id, field.id)
      await onChanged()
      setNotice(t('entityTypes.fields.deleted', { name: field.name }))
    } catch (error: unknown) {
      // Given a value since the list was read: the API's count is the true one.
      if (error instanceof ApiError && error.status === 409) {
        setBlocked({ fieldId: field.id, text: error.message })
        await onChanged().catch(() => undefined)
      } else {
        report(error, t('entityTypes.fields.deleteFailed'))
      }
    } finally {
      setBusyFieldId(null)
    }
  }

  return { clear, report, archive, restore, remove }
}
