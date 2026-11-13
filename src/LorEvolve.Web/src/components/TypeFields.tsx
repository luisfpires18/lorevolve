import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, LayoutList, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { Field } from './Field'
import { FieldSectionsDialog } from './FieldSectionsDialog'
import { tn as translateN, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import {
  FIELD_CHANGED_CODE,
  FIELD_REQUIRED_MISSING_CODE,
  addField,
  archiveField,
  deleteField,
  restoreField,
  updateField,
  type FieldInput,
} from '../lore/api'
import {
  FIELD_KIND_LABELS,
  FIELD_SEMANTIC_LABELS,
  FieldKind,
  semanticsFor,
  type EntityType,
  type EntityTypeGroup,
  type FieldDefinition,
  type FieldKindValue,
  type FieldSemanticValue,
} from '../lore/types'
import { typePathLabel, type TypeTree } from '../lore/typeTree'
import { groupBySection } from '../lore/fieldSections'
import { confirmAction } from '../lib/confirm'

const KIND_ORDER: FieldKindValue[] = [
  FieldKind.ShortText,
  FieldKind.LongText,
  FieldKind.Number,
  FieldKind.Boolean,
  FieldKind.Date,
  FieldKind.Select,
  FieldKind.MultiSelect,
  FieldKind.EntityReference,
]

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
      field.isRequired ? t('entityTypes.fields.required') : t('entityTypes.fields.optional'),
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

function entries(count: number) {
  return translateN('entityTypes.fields.entries', count, { n: count })
}

/** Why a field holding values cannot be deleted: the sentence the API's refusal carries (`FieldInUseDetail`). */
function fieldInUseDetail(entryCount: number, trashed: number) {
  if (trashed === 0) return translateN('entityTypes.fields.inUse', entryCount, { n: entryCount })
  if (trashed === entryCount)
    return translateN('entityTypes.fields.inUseAllTrashed', entryCount, { n: entryCount })
  return translateN('entityTypes.fields.inUseSomeTrashed', entryCount, { n: entryCount, trashed })
}

/** A link field's allowed target as one select value. `null` is a new field's "not chosen yet". */
type TargetChoice = 'any' | `type:${string}` | `group:${string}` | null

function targetChoice(field: FieldDefinition): TargetChoice {
  if (field.targetGroupId) return `group:${field.targetGroupId}`
  return field.targetEntityTypeId ? `type:${field.targetEntityTypeId}` : 'any'
}

function parseTarget(
  value: TargetChoice,
): Pick<FieldInput, 'targetEntityTypeId' | 'targetGroupId'> {
  if (value?.startsWith('group:'))
    return { targetEntityTypeId: null, targetGroupId: value.slice(6) }
  if (value?.startsWith('type:')) return { targetEntityTypeId: value.slice(5), targetGroupId: null }
  return { targetEntityTypeId: null, targetGroupId: null }
}

function splitOptions(text: string) {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

/**
 * One field's settings, new or existing, in the drawer every LorEvolve form uses: focus goes in, Escape and Cancel ask before
 * an edit is lost, a failed save keeps the draft and says why, and focus returns to the button that opened it.
 *
 * Everything the API takes is here - name, kind, options, what a link may point at, a Canon meaning, default text and
 * whether it is required - and an edit sends the field's own order back, so its place is kept. A new link field has no
 * target until the author picks one, "Any Lore type" included: nothing is chosen for them, and nothing from the name.
 * The kind of a field that holds values is shown but cannot change, because the API refuses it.
 */
/** What the drawer edits, as it reads for a field (or a new one). */
function draftOf(field: FieldDefinition | null) {
  return {
    name: field?.name ?? '',
    kind: field?.kind ?? FieldKind.ShortText,
    isRequired: field?.isRequired ?? false,
    options: field ? field.options.map((option) => option.value).join(', ') : '',
    semantic: field?.semantic ?? null,
    defaultValue: field?.defaultValue ?? '',
    target: (field ? targetChoice(field) : null) as TargetChoice,
  }
}

function FieldDialog({
  universeId,
  type,
  field,
  latest,
  describe,
  tree,
  groups,
  onClose,
  onChanged,
  onSaved,
}: {
  universeId: string
  type: EntityType
  /** The field being edited, as it read when the drawer opened, or null for a new one. */
  field: FieldDefinition | null
  /** The same field as the list reads it now, after any reload; undefined once it is gone. */
  latest: FieldDefinition | undefined
  /** A field's one-line summary, as the list says it. */
  describe: (field: FieldDefinition) => string
  tree: TypeTree
  groups: EntityTypeGroup[]
  onClose: () => void
  onChanged: () => Promise<void>
  onSaved: (name: string, wasNew: boolean) => Promise<void>
}) {
  const { t, tn, tx } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  // What this drawer was opened over: the settings an unsaved change is measured against, and the version an edit names.
  // A refused stale save moves it on only when the author chooses (ADR 0043).
  const [base, setBase] = useState(() => ({ draft: draftOf(field), version: field?.version ?? 0 }))
  const initial = base.draft
  // Someone else saved this field after the drawer opened; the draft is kept until the author decides.
  const [stale, setStale] = useState(false)
  const [name, setName] = useState(initial.name)
  const [kind, setKind] = useState<FieldKindValue>(initial.kind)
  const [isRequired, setIsRequired] = useState(initial.isRequired)
  const [options, setOptions] = useState(initial.options)
  const [semantic, setSemantic] = useState<FieldSemanticValue | null>(initial.semantic)
  const [defaultValue, setDefaultValue] = useState(initial.defaultValue)
  const [target, setTarget] = useState<TargetChoice>(initial.target)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // The kind is frozen while any entry holds a value, or any older version recorded one (Issue #39).
  const held = field === null ? null : (latest ?? field)
  const kindLocked = held !== null && (held.entryCount > 0 || held.usedInHistory)
  const hasOptions = kind === FieldKind.Select || kind === FieldKind.MultiSelect
  const isLink = kind === FieldKind.EntityReference
  const isText = kind === FieldKind.ShortText || kind === FieldKind.LongText

  const draft = { name: name.trim(), kind, isRequired, options, semantic, defaultValue, target }
  const isDirty = payloadKey(draft) !== payloadKey({ ...initial, name: initial.name.trim() })
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    field
      ? t('entityTypes.fields.leaveEdit', { name: field.name })
      : t('entityTypes.fields.leaveNew'),
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById('field-name')?.focus()
  }, [])

  function chooseKind(next: FieldKindValue) {
    setKind(next)
    // A meaning belongs to a shape: switching away from one that can carry it drops it rather than sending a pair the
    // API refuses. A link target belongs to a link field alone.
    setSemantic((current) =>
      current !== null && semanticsFor(next).includes(current) ? current : null,
    )
    if (next !== FieldKind.EntityReference) setTarget(field ? targetChoice(field) : null)
  }

  /** Puts the saved settings in the drawer, the version with them, and drops the draft. */
  function takeSaved(saved: FieldDefinition) {
    const next = draftOf(saved)
    setBase({ draft: next, version: saved.version })
    setName(next.name)
    setKind(next.kind)
    setIsRequired(next.isRequired)
    setOptions(next.options)
    setSemantic(next.semantic)
    setDefaultValue(next.defaultValue)
    setTarget(next.target)
    setStale(false)
    setMessage(null)
    setFieldErrors({})
  }

  /** Keeps the draft and takes the saved version, so the next Save deliberately replaces what is saved now. */
  function keepMine(saved: FieldDefinition) {
    setBase((current) => ({ ...current, version: saved.version }))
    setStale(false)
    setMessage(t('entityTypes.fields.keptMine'))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setStale(false)
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = t('entityTypes.fields.nameRequired')
    if (hasOptions && splitOptions(options).length === 0)
      errors.options = t('entityTypes.fields.optionsRequired')
    if (isLink && target === null) errors.target = t('entityTypes.fields.targetRequired')
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const input: FieldInput = {
      name: name.trim(),
      kind,
      isRequired,
      // A new field goes last, and an edit keeps its place: the order is the Sections drawer's (Issue #26).
      displayOrder: null,
      defaultValue: isText ? defaultValue.trim() || null : null,
      options: hasOptions ? splitOptions(options) : null,
      semantic,
      ...parseTarget(isLink ? target : null),
      ...(field ? { expectedVersion: base.version } : {}),
    }

    setIsSaving(true)
    try {
      if (field) await updateField(universeId, type.id, field.id, input)
      else await addField(universeId, type.id, input)
      await onSaved(input.name, field === null)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === FIELD_CHANGED_CODE) {
        // Saved by someone else since this opened: nothing was written, the draft stays, and the latest is read so the
        // author can compare and choose.
        setMessage(t('entityTypes.fields.changedMeanwhile'))
        setStale(true)
        await onChanged().catch(() => undefined)
      } else if (error instanceof ApiError) {
        const mapped: Record<string, string> = {}
        for (const [key, text] of Object.entries(error.fieldErrors)) {
          mapped[key === 'targetentitytypeid' || key === 'targetgroupid' ? 'target' : key] = text
        }
        setFieldErrors(mapped)
        setMessage(
          Object.keys(mapped).length === 0
            ? error.message
            : field
              ? t('entityTypes.fields.detailsSave')
              : t('entityTypes.fields.detailsAdd'),
        )
        // Changed elsewhere since this opened (archived, say): the list behind should say so too.
        if (error.status === 409) await onChanged().catch(() => undefined)
      } else {
        setMessage(field ? t('entityTypes.fields.saveFailed') : t('entityTypes.fields.addFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="field-heading"
      {...dialogProps}
      data-testid="field-dialog"
    >
      <form
        className="drawer__panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">
            {tx('entityTypes.fields.dialogEyebrow', { name: <bdi>{type.name}</bdi> })}
          </p>
          <h2 className="drawer__title" id="field-heading">
            {field ? t('entityTypes.fields.editTitle') : t('entityTypes.fields.addTitle')}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="field-dialog-error">
              {message}
            </p>
          ) : null}

          {stale && latest ? (
            <div className="callout callout--warning" data-testid="field-dialog-stale">
              <p className="callout__title">{t('entityTypes.fields.savedNow')}</p>
              <p className="fieldconflict__saved">
                {tx(
                  latest.archivedAt !== null
                    ? 'entityTypes.fields.savedNowArchived'
                    : 'entityTypes.fields.savedNowSummary',
                  {
                    name: <bdi>{latest.name}</bdi>,
                    summary: describe(latest),
                  },
                )}
              </p>
              <p className="types__blockedlinks">
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  onClick={() => takeSaved(latest)}
                  data-testid="field-use-saved"
                >
                  {t('entityTypes.fields.useSaved')}
                </button>
                {latest.archivedAt === null ? (
                  <button
                    className="button button--text button--sm"
                    type="button"
                    onClick={() => keepMine(latest)}
                    data-testid="field-keep-mine"
                  >
                    {t('entityTypes.fields.keepMine')}
                  </button>
                ) : null}
              </p>
            </div>
          ) : null}

          <Field
            label={t('entityTypes.fields.fieldName')}
            name="field-name"
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            data-testid="field-name"
          />

          <div className="field">
            <label className="field__label" htmlFor="field-kind">
              {t('entityTypes.fields.kind')}
            </label>
            <select
              id="field-kind"
              className="field__input field__input--select"
              value={kind}
              disabled={kindLocked}
              aria-describedby={kindLocked ? 'field-kind-hint' : undefined}
              onChange={(event) => chooseKind(Number(event.target.value) as FieldKindValue)}
              data-testid="field-kind"
            >
              {KIND_ORDER.map((each) => (
                <option key={each} value={each}>
                  {FIELD_KIND_LABELS[each]}
                </option>
              ))}
            </select>
            {kindLocked ? (
              <p className="field__hint" id="field-kind-hint" data-testid="field-kind-hint">
                {held.entryCount > 0
                  ? tn('entityTypes.fields.kindLockedHeld', held.entryCount, { n: held.entryCount })
                  : t('entityTypes.fields.kindLockedHistory')}
              </p>
            ) : null}
          </div>

          {hasOptions ? (
            <Field
              label={t('entityTypes.fields.options')}
              name="field-options"
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              error={fieldErrors.options}
              hint={field ? t('entityTypes.fields.optionsHint') : undefined}
              data-testid="field-options"
            />
          ) : null}

          {isLink ? (
            <div className="field">
              <label className="field__label" htmlFor="field-target">
                {t('entityTypes.fields.canLinkTo')}
              </label>
              <select
                id="field-target"
                className="field__input field__input--select"
                value={target ?? ''}
                onChange={(event) => setTarget((event.target.value || null) as TargetChoice)}
                aria-describedby="field-target-hint"
                aria-invalid={fieldErrors.target ? true : undefined}
                data-testid="field-target"
              >
                {target === null ? (
                  <option value="" disabled>
                    {t('entityTypes.fields.chooseTarget')}
                  </option>
                ) : null}
                <option value="any">{t('entityTypes.fields.anyLoreType')}</option>
                {groups.length > 0 ? (
                  <optgroup label={t('entityTypes.fields.optgroupGroups')}>
                    {groups.map((group) => (
                      <option key={group.id} value={`group:${group.id}`}>
                        {t('entityTypes.fields.groupOption', { name: group.name })}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label={t('entityTypes.fields.optgroupTypes')}>
                  {tree.ordered.map((node) => (
                    <option key={node.type.id} value={`type:${node.type.id}`}>
                      {typePathLabel(node)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="field__hint" id="field-target-hint">
                {target === null
                  ? t('entityTypes.fields.targetHintNone')
                  : target === 'any'
                    ? t('entityTypes.fields.targetHintAny')
                    : target.startsWith('group:')
                      ? t('entityTypes.fields.targetHintGroup')
                      : t('entityTypes.fields.targetHintType')}
              </p>
              {field && field.entryCount > 0 ? (
                <p className="field__hint">{t('entityTypes.fields.targetNarrowHint')}</p>
              ) : null}
              {fieldErrors.target ? <p className="field__error">{fieldErrors.target}</p> : null}
            </div>
          ) : null}

          {semanticsFor(kind).length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor="field-semantic">
                {t('entityTypes.fields.canonMeaningLabel')}
              </label>
              <select
                id="field-semantic"
                className="field__input field__input--select"
                value={semantic ?? ''}
                onChange={(event) =>
                  setSemantic(
                    event.target.value === ''
                      ? null
                      : (Number(event.target.value) as FieldSemanticValue),
                  )
                }
                data-testid="field-semantic"
              >
                <option value="">{t('entityTypes.fields.none')}</option>
                {semanticsFor(kind).map((each) => (
                  <option key={each} value={each}>
                    {FIELD_SEMANTIC_LABELS[each]}
                  </option>
                ))}
              </select>
              <p className="field__hint">{t('entityTypes.fields.semanticHint')}</p>
              {fieldErrors.semantic ? <p className="field__error">{fieldErrors.semantic}</p> : null}
            </div>
          ) : null}

          {isText ? (
            <Field
              label={t('entityTypes.fields.defaultText')}
              name="field-default"
              dir="auto"
              value={defaultValue}
              onChange={(event) => setDefaultValue(event.target.value)}
              error={fieldErrors.defaultvalue}
              hint={t('entityTypes.fields.defaultHint')}
              data-testid="field-default"
            />
          ) : null}

          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(event) => setIsRequired(event.target.checked)}
                data-testid="field-required"
              />
              <span>{t('entityTypes.fields.requiredLabel')}</span>
            </label>
            {field && isRequired && !field.isRequired ? (
              <p className="field__hint">
                {t('entityTypes.fields.requiredHint', { name: type.name })}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-field">
            {field
              ? isSaving
                ? t('entityTypes.fields.saving')
                : t('entityTypes.fields.saveChanges')
              : isSaving
                ? t('entityTypes.fields.adding')
                : t('entityTypes.fields.addTitle')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-field"
          >
            {t('entityTypes.fields.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
