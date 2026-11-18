import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, LayoutList, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { FieldSectionsDialog } from './FieldSectionsDialog'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import {
  FIELD_REQUIRED_MISSING_CODE,
  archiveField,
  deleteField,
  restoreField,
} from '../lore/fieldsApi'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FIELD_KIND_LABELS,
  FieldImageShape,
  FIELD_SEMANTIC_LABELS,
  FieldKind,
} from '../lore/fieldKinds'
import type { EntityType, EntityTypeGroup, FieldDefinition } from '../lore/typeDefinitions'
import { typePathLabel, type TypeTree } from '../lore/typeTree'
import { groupBySection } from '../lore/fieldSections'
import { confirmAction } from '../lib/confirm'
import { entries, fieldInUseDetail } from '../lore/fieldInUse'
import { FieldDialog } from './lore/FieldDialog'

interface TypeFieldsProps {
  universeId: string
  type: EntityType
  tree: TypeTree
  groups: EntityTypeGroup[]
  canEdit: boolean
  /** Reads the types again; the panel shows what comes back. */
  onChanged: () => Promise<void>
}

/**
 * A type's fields (Issue #39): the active ones first, each with Edit and a menu holding Archive and Delete, then Add field,
 * which opens the editor only when asked. Archived fields sit apart, folded under "Archived fields (N)", with Restore.
 *
 * Archiving hides a field and keeps everything it holds; deleting is for a field no entry has a value for, and a populated
 * one is told so here, without a confirmation it could only fail. Feedback is said under the list, in a status line.
 *
 * A type with sections (Issue #26) lists its ungrouped fields first, then each section under its name; Sections opens the
 * drawer that arranges them. A type without any reads exactly as before.
 */
export function TypeFields({
  universeId,
  type,
  tree,
  groups,
  canEdit,
  onChanged,
}: TypeFieldsProps) {
  const { t, tn, tx } = useI18n()
  const [editing, setEditing] = useState<FieldDefinition | 'new' | null>(null)
  const [arranging, setArranging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Why one field cannot be deleted, under it, with the way out.
  const [blocked, setBlocked] = useState<{ fieldId: string; text: string } | null>(null)
  // A required field that cannot come back required: the reason, and the explicit way to bring it back optional.
  const [restoreOffer, setRestoreOffer] = useState<{ fieldId: string; text: string } | null>(null)
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null)

  function clear() {
    setNotice(null)
    setMessage(null)
    setBlocked(null)
    setRestoreOffer(null)
  }

  function report(error: unknown, fallback: string) {
    setMessage(error instanceof ApiError ? error.message : fallback)
  }

  /** A link field's allowed target in words, from the types and groups as they are now. */
  function targetLabel(field: Pick<FieldDefinition, 'targetEntityTypeId' | 'targetGroupId'>) {
    if (field.targetGroupId) {
      const group = groups.find((each) => each.id === field.targetGroupId)
      return group
        ? t('entityTypes.fields.targetAnyIn', { name: group.name })
        : t('entityTypes.fields.targetGroup')
    }
    const node = field.targetEntityTypeId ? tree.byId.get(field.targetEntityTypeId) : undefined
    return node ? typePathLabel(node) : t('entityTypes.fields.targetAny')
  }

  /** One line under a field's name: its kind, whether it is required, and what it links to or means. */
  function summary(field: FieldDefinition) {
    const parts = [
      FIELD_KIND_LABELS[field.kind],
      field.kind === FieldKind.Image
        ? FIELD_IMAGE_SHAPE_LABELS[field.imageShape ?? FieldImageShape.Free]
        : field.isRequired
          ? t('entityTypes.fields.required')
          : t('entityTypes.fields.optional'),
    ]
    if (field.kind === FieldKind.EntityReference) {
      parts.push(t('entityTypes.fields.linksTo', { target: targetLabel(field) }))
    }
    if (field.semantic !== null && field.semantic !== undefined) {
      parts.push(
        t('entityTypes.fields.canonMeaning', {
          meaning: FIELD_SEMANTIC_LABELS[field.semantic].toLowerCase(),
        }),
      )
    }
    return parts.join(' · ')
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

  /** Under a field that cannot be deleted: why, where its entries are, and archiving as the way out. */
  function blockedNote(field: FieldDefinition) {
    if (blocked?.fieldId !== field.id) return null
    return (
      <div
        className="callout callout--warning fieldlist__note"
        role="alert"
        data-testid={`field-blocked-${field.name}`}
      >
        <p className="types__blockedtext">{blocked.text}</p>
        <p className="types__blockedlinks">
          {field.archivedAt === null ? (
            <button
              className="button button--secondary button--sm"
              type="button"
              onClick={() => void archive(field)}
              data-testid={`archive-instead-${field.name}`}
            >
              <ActionIcon icon={Archive} />
              {t('entityTypes.fields.archiveInstead')}
            </button>
          ) : null}
          {field.entryCount > field.trashedEntryCount ? (
            <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
              {t('entityTypes.fields.showEntries', { name: type.name })}
            </Link>
          ) : null}
          {field.trashedEntryCount > 0 ? (
            <Link to={`/app/universes/${universeId}/trash`}>
              {t('entityTypes.fields.openTrash')}
            </Link>
          ) : null}
        </p>
      </div>
    )
  }

  const archived = type.archivedFields ?? []
  const sections = type.fieldSections ?? []
  // What it inherits: each type above it, root first, with its active fields (ADR 0007 amendment, 2026-11-12). Read-only here.
  const inherited = (tree.byId.get(type.id)?.path.slice(0, -1) ?? [])
    .map((owner) => ({
      owner,
      fields: [...owner.fields].sort((a, b) => a.displayOrder - b.displayOrder),
    }))
    .filter((each) => each.fields.length > 0)

  /** "In Combat", for an archived field that keeps a section to return to. */
  function sectionName(sectionId: string | null) {
    const section = sections.find((each) => each.id === sectionId)
    return section ? `In ${section.name}` : null
  }
  const layout = groupBySection(type.fields, (field) => field.sectionId, sections, true)

  function fieldRow(field: FieldDefinition) {
    return (
      <li
        className="fieldlist__row"
        key={field.id}
        data-field-name={field.name}
        data-testid={`field-row-${field.name}`}
      >
        <div className="fieldlist__text">
          <span className="fieldlist__name">
            <bdi>{field.name}</bdi>
          </span>
          <span className="fieldlist__meta" data-testid={`field-summary-${field.name}`}>
            {summary(field)}
          </span>
        </div>
        {canEdit ? (
          <span className="fieldlist__actions">
            <button
              className="button button--secondary button--sm"
              type="button"
              onClick={() => {
                clear()
                setEditing(field)
              }}
              disabled={busyFieldId === field.id}
              aria-label={t('entityTypes.fields.editField', { name: field.name })}
              data-testid={`edit-field-${field.name}`}
            >
              <ActionIcon icon={Pencil} />
              {t('entityTypes.fields.edit')}
            </button>
            <ActionMenu
              label={t('entityTypes.fields.moreActions', { name: field.name })}
              triggerTestId={`field-actions-${field.name}`}
            >
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => void archive(field)}
                data-testid={`archive-field-${field.name}`}
              >
                <ActionIcon icon={Archive} />
                {t('entityTypes.fields.archiveField')}
              </button>
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                onClick={() => void remove(field)}
                data-testid={`delete-field-${field.name}`}
              >
                <ActionIcon icon={Trash2} />
                {t('entityTypes.fields.deleteField')}
              </button>
            </ActionMenu>
          </span>
        ) : null}
        {blockedNote(field)}
      </li>
    )
  }

  return (
    <div className="types__fields" data-testid={`type-fields-${type.name}`}>
      {message ? (
        <p className="form__message" role="alert" data-testid="fields-error">
          {message}
        </p>
      ) : null}

      {inherited.map(({ owner, fields }) => (
        <div
          className="fieldlist__inherited"
          key={owner.id}
          data-testid={`inherited-fields-${owner.name}`}
        >
          <p className="settings__note">
            {tx('entityTypes.fields.inheritedNote', {
              owner: <bdi>{owner.name}</bdi>,
              type: type.name,
              again: <bdi>{owner.name}</bdi>,
            })}
          </p>
          <ul
            className="fieldlist"
            aria-label={t('entityTypes.fields.inheritedLabel', {
              type: type.name,
              owner: owner.name,
            })}
          >
            {fields.map((field) => (
              <li
                className="fieldlist__row"
                key={field.id}
                data-testid={`inherited-field-${field.name}`}
              >
                <div className="fieldlist__text">
                  <span className="fieldlist__name">
                    <bdi>{field.name}</bdi>
                  </span>
                  <span className="fieldlist__meta">{summary(field)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {type.fields.length === 0 ? (
        <p className="settings__note">
          {inherited.length > 0
            ? t('entityTypes.fields.emptyInherited')
            : t('entityTypes.fields.empty')}
        </p>
      ) : sections.length === 0 ? (
        <ul
          className="fieldlist"
          aria-label={t('entityTypes.fields.listLabel', { name: type.name })}
        >
          {type.fields.map(fieldRow)}
        </ul>
      ) : layout.ungrouped.length > 0 ? (
        <ul
          className="fieldlist"
          aria-label={t('entityTypes.fields.listNoSectionLabel', { name: type.name })}
        >
          {layout.ungrouped.map(fieldRow)}
        </ul>
      ) : null}

      {layout.groups.map(({ section, items }) => (
        <div className="fieldgroup" key={section.id} data-testid={`type-section-${section.name}`}>
          <p className="fieldgroup__head">
            <bdi>{section.name}</bdi>
            {section.startsCollapsed ? (
              <span className="fieldgroup__meta">{t('entityTypes.fields.startsCollapsed')}</span>
            ) : null}
          </p>
          {items.length > 0 ? (
            <ul
              className="fieldlist"
              aria-label={t('entityTypes.fields.sectionListLabel', {
                section: section.name,
                type: type.name,
              })}
            >
              {items.map(fieldRow)}
            </ul>
          ) : (
            <p className="settings__note">{t('entityTypes.fields.sectionEmpty')}</p>
          )}
        </div>
      ))}

      {canEdit ? (
        <p className="fieldlist__tools">
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => {
              clear()
              setEditing('new')
            }}
            data-testid={`new-field-${type.name}`}
          >
            <ActionIcon icon={Plus} />
            {t('entityTypes.fields.add')}
          </button>
          {type.fields.length > 0 || sections.length > 0 ? (
            <button
              className="button button--text button--sm"
              type="button"
              onClick={() => {
                clear()
                setArranging(true)
              }}
              data-testid={`arrange-sections-${type.name}`}
            >
              <ActionIcon icon={LayoutList} />
              {t('entityTypes.fields.sections')}
            </button>
          ) : null}
        </p>
      ) : null}

      <p className="types__notice" role="status" data-testid={`fields-notice-${type.name}`}>
        {notice}
      </p>

      {archived.length > 0 ? (
        <details
          className="fieldarchive"
          open={restoreOffer !== null || archived.some((field) => field.id === blocked?.fieldId)}
          data-testid={`archived-fields-${type.name}`}
        >
          <summary>{t('entityTypes.fields.archivedSummary', { n: archived.length })}</summary>
          <p className="fieldarchive__lede">
            {t('entityTypes.fields.archivedLede', { name: type.name })}
          </p>
          <ul
            className="fieldlist"
            aria-label={t('entityTypes.fields.archivedLabel', { name: type.name })}
          >
            {archived.map((field) => (
              <li
                className="fieldlist__row"
                key={field.id}
                data-field-name={field.name}
                data-testid={`archived-field-${field.name}`}
              >
                <div className="fieldlist__text">
                  <span className="fieldlist__name">
                    <bdi>{field.name}</bdi>
                  </span>
                  <span className="fieldlist__meta">
                    {[
                      FIELD_KIND_LABELS[field.kind],
                      field.isRequired ? t('entityTypes.fields.previouslyRequired') : null,
                      sectionName(field.sectionId),
                      field.entryCount === 0
                        ? t('entityTypes.fields.noValues')
                        : t('entityTypes.fields.valuesIn', { entries: entries(field.entryCount) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {canEdit ? (
                  <span className="fieldlist__actions">
                    <button
                      className="button button--secondary button--sm"
                      type="button"
                      onClick={() => void restore(field)}
                      disabled={busyFieldId === field.id}
                      aria-label={t('entityTypes.fields.restoreField', { name: field.name })}
                      data-testid={`restore-field-${field.name}`}
                    >
                      <ActionIcon icon={ArchiveRestore} />
                      {t('entityTypes.fields.restore')}
                    </button>
                    {field.entryCount === 0 && !field.usedInHistory ? (
                      <button
                        className="button button--text button--sm fieldlist__delete"
                        type="button"
                        onClick={() => void remove(field)}
                        disabled={busyFieldId === field.id}
                        aria-label={t('entityTypes.fields.deleteForGood', { name: field.name })}
                        data-testid={`delete-archived-field-${field.name}`}
                      >
                        {t('entityTypes.fields.delete')}
                      </button>
                    ) : null}
                  </span>
                ) : null}
                {restoreOffer?.fieldId === field.id ? (
                  <div
                    className="callout callout--warning fieldlist__note"
                    role="alert"
                    data-testid={`restore-offer-${field.name}`}
                  >
                    <p className="types__blockedtext">{restoreOffer.text}</p>
                    <p className="types__blockedlinks">
                      <button
                        className="button button--secondary button--sm"
                        type="button"
                        onClick={() => void restore(field, true)}
                        disabled={busyFieldId === field.id}
                        data-testid={`restore-optional-${field.name}`}
                      >
                        {t('entityTypes.fields.restoreOptional')}
                      </button>
                      <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
                        {t('entityTypes.fields.restoreShowEntries', { name: type.name })}
                      </Link>
                    </p>
                  </div>
                ) : null}
                {blockedNote(field)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {arranging ? (
        <FieldSectionsDialog
          universeId={universeId}
          type={type}
          onClose={() => setArranging(false)}
          onChanged={onChanged}
          onSaved={async () => {
            setArranging(false)
            await onChanged()
            setNotice(t('entityTypes.fields.sectionsSaved', { name: type.name }))
          }}
        />
      ) : null}

      {editing ? (
        <FieldDialog
          universeId={universeId}
          type={type}
          field={editing === 'new' ? null : editing}
          latest={
            editing === 'new'
              ? undefined
              : [...type.fields, ...archived].find((each) => each.id === editing.id)
          }
          describe={summary}
          tree={tree}
          groups={groups}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
          onSaved={async (name, wasNew) => {
            setEditing(null)
            await onChanged()
            setNotice(
              wasNew
                ? t('entityTypes.fields.addedNotice', { name })
                : t('entityTypes.fields.savedNotice', { name }),
            )
          }}
        />
      ) : null}
    </div>
  )
}
