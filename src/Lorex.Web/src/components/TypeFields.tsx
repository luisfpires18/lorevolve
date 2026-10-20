import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { Field } from './Field'
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
 */
export function TypeFields({
  universeId,
  type,
  tree,
  groups,
  canEdit,
  onChanged,
}: TypeFieldsProps) {
  const [editing, setEditing] = useState<FieldDefinition | 'new' | null>(null)
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
      return group ? `any type in ${group.name}` : 'a group'
    }
    const node = field.targetEntityTypeId ? tree.byId.get(field.targetEntityTypeId) : undefined
    return node ? typePathLabel(node) : 'any Lore type'
  }

  /** One line under a field's name: its kind, whether it is required, and what it links to or means. */
  function summary(field: FieldDefinition) {
    const parts = [FIELD_KIND_LABELS[field.kind], field.isRequired ? 'Required' : 'Optional']
    if (field.kind === FieldKind.EntityReference) parts.push(`Links to ${targetLabel(field)}`)
    if (field.semantic !== null && field.semantic !== undefined) {
      parts.push(`Canon: ${FIELD_SEMANTIC_LABELS[field.semantic].toLowerCase()}`)
    }
    return parts.join(' · ')
  }

  async function archive(field: FieldDefinition) {
    clear()
    const lines = [`Archive “${field.name}”?`, `${type.name} entries will stop showing it.`]
    lines.push(
      field.entryCount === 0
        ? 'No entry has a value for it yet. You can restore it at any time.'
        : field.entryCount === 1
          ? '1 entry keeps its value, and restoring the field brings it back.'
          : `${field.entryCount} entries keep their values, and restoring the field brings them back.`,
    )
    if (field.isRequired) lines.push('While it is archived, you can save entries without it.')
    if (field.semantic !== null && field.semantic !== undefined) {
      lines.push(
        `Canon checks stop reading it as the ${FIELD_SEMANTIC_LABELS[field.semantic].toLowerCase()} until you restore it.`,
      )
    } else if (field.kind === FieldKind.EntityReference) {
      lines.push('Canon checks stop reading its links until you restore it.')
    }
    if (!window.confirm(lines.join('\n\n'))) return

    setBusyFieldId(field.id)
    try {
      await archiveField(universeId, type.id, field.id)
      await onChanged()
      setNotice(`Archived “${field.name}”. It is under Archived fields, with all its data.`)
    } catch (error: unknown) {
      report(error, 'That field could not be archived.')
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
          ? `Restored “${field.name}” as optional. Fill it in where it is missing, then make it required again.`
          : `Restored “${field.name}” with its values.`,
      )
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === FIELD_REQUIRED_MISSING_CODE) {
        setRestoreOffer({ fieldId: field.id, text: error.message })
      } else {
        report(error, 'That field could not be restored.')
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
        text: "Older versions of entries still use this field, so it can't be deleted. Archive it to hide it and keep that history.",
      })
      return
    }
    if (
      !window.confirm(
        `Delete the field “${field.name}” for good?\n\nNo entry has a value for it. This can't be undone.`,
      )
    ) {
      return
    }

    setBusyFieldId(field.id)
    try {
      await deleteField(universeId, type.id, field.id)
      await onChanged()
      setNotice(`Deleted the field “${field.name}”.`)
    } catch (error: unknown) {
      // Given a value since the list was read: the API's count is the true one.
      if (error instanceof ApiError && error.status === 409) {
        setBlocked({ fieldId: field.id, text: error.message })
        await onChanged().catch(() => undefined)
      } else {
        report(error, 'That field could not be deleted.')
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
              Archive instead
            </button>
          ) : null}
          {field.entryCount > field.trashedEntryCount ? (
            <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
              Show {type.name} entries
            </Link>
          ) : null}
          {field.trashedEntryCount > 0 ? (
            <Link to={`/app/universes/${universeId}/trash`}>Open the Trash</Link>
          ) : null}
        </p>
      </div>
    )
  }

  const archived = type.archivedFields ?? []

  return (
    <div className="types__fields" data-testid={`type-fields-${type.name}`}>
      {message ? (
        <p className="form__message" role="alert" data-testid="fields-error">
          {message}
        </p>
      ) : null}

      {type.fields.length > 0 ? (
        <ul className="fieldlist" aria-label={`Fields of ${type.name}`}>
          {type.fields.map((field) => (
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
                    aria-label={`Edit ${field.name}`}
                    data-testid={`edit-field-${field.name}`}
                  >
                    <ActionIcon icon={Pencil} />
                    Edit
                  </button>
                  <ActionMenu
                    label={`More actions for ${field.name}`}
                    triggerTestId={`field-actions-${field.name}`}
                  >
                    <button
                      className="actionmenu__item"
                      type="button"
                      onClick={() => void archive(field)}
                      data-testid={`archive-field-${field.name}`}
                    >
                      <ActionIcon icon={Archive} />
                      Archive field
                    </button>
                    <button
                      className="actionmenu__item actionmenu__item--danger"
                      type="button"
                      onClick={() => void remove(field)}
                      data-testid={`delete-field-${field.name}`}
                    >
                      <ActionIcon icon={Trash2} />
                      Delete field
                    </button>
                  </ActionMenu>
                </span>
              ) : null}
              {blockedNote(field)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings__note">No custom fields yet.</p>
      )}

      {canEdit ? (
        <button
          className="button button--secondary button--sm fieldlist__add"
          type="button"
          onClick={() => {
            clear()
            setEditing('new')
          }}
          data-testid={`new-field-${type.name}`}
        >
          <ActionIcon icon={Plus} />
          Add field
        </button>
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
          <summary>Archived fields ({archived.length})</summary>
          <p className="fieldarchive__lede">
            {type.name} entries don&rsquo;t show these. Lorex keeps their values and brings them
            back when you restore a field.
          </p>
          <ul className="fieldlist" aria-label={`Archived fields of ${type.name}`}>
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
                      field.isRequired ? 'Previously required' : null,
                      field.entryCount === 0
                        ? 'No values'
                        : `Values in ${entries(field.entryCount)}`,
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
                      aria-label={`Restore ${field.name}`}
                      data-testid={`restore-field-${field.name}`}
                    >
                      <ActionIcon icon={ArchiveRestore} />
                      Restore
                    </button>
                    {field.entryCount === 0 && !field.usedInHistory ? (
                      <button
                        className="button button--text button--sm fieldlist__delete"
                        type="button"
                        onClick={() => void remove(field)}
                        disabled={busyFieldId === field.id}
                        aria-label={`Delete ${field.name} for good`}
                        data-testid={`delete-archived-field-${field.name}`}
                      >
                        Delete
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
                        Restore as optional
                      </button>
                      <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
                        Show {type.name} entries
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
            setNotice(wasNew ? `Added the field “${name}”.` : `Saved the field “${name}”.`)
          }}
        />
      ) : null}
    </div>
  )
}

function entries(count: number) {
  return count === 1 ? '1 entry' : `${count} entries`
}

/** Why a field holding values cannot be deleted: the sentence the API's refusal carries (`FieldInUseDetail`). */
function fieldInUseDetail(entryCount: number, trashed: number) {
  const where =
    trashed === 0
      ? ''
      : trashed === entryCount
        ? entryCount === 1
          ? ', and it is in the Trash'
          : ', all of them in the Trash'
        : `, ${trashed} of them in the Trash`
  const holds = entryCount === 1 ? 'a value in 1 entry' : `values in ${entryCount} entries`
  return `This field contains ${holds}${where}. Archive it to hide it without losing its data.`
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
 * One field's settings, new or existing, in the drawer every Lorex form uses: focus goes in, Escape and Cancel ask before
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
      ? `Your changes to “${field.name}” have not been saved. Leave without saving them?`
      : 'This field has not been added. Leave without saving it?',
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
    setMessage(
      'Your changes are kept. Saving now replaces what someone else saved with everything this drawer shows.',
    )
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setStale(false)
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Give the field a name.'
    if (hasOptions && splitOptions(options).length === 0)
      errors.options = 'Add at least one option.'
    if (isLink && target === null) errors.target = 'Choose what this field can link to.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const input: FieldInput = {
      name: name.trim(),
      kind,
      isRequired,
      // An edit keeps the field's place; a new one goes last.
      displayOrder: field?.displayOrder ?? null,
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
        setMessage(
          'Someone changed this field after you opened it. Nothing was saved, and your changes are still here.',
        )
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
            : `Some details need a change before this field can be ${field ? 'saved' : 'added'}.`,
        )
        // Changed elsewhere since this opened (archived, say): the list behind should say so too.
        if (error.status === 409) await onChanged().catch(() => undefined)
      } else {
        setMessage(field ? 'That field could not be saved.' : 'That field could not be added.')
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
            <bdi>{type.name}</bdi> fields
          </p>
          <h2 className="drawer__title" id="field-heading">
            {field ? 'Edit field' : 'Add field'}
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
              <p className="callout__title">Saved now</p>
              <p className="fieldconflict__saved">
                <bdi>{latest.name}</bdi>: {describe(latest)}
                {latest.archivedAt !== null ? '. Archived.' : ''}
              </p>
              <p className="types__blockedlinks">
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  onClick={() => takeSaved(latest)}
                  data-testid="field-use-saved"
                >
                  Use the saved settings
                </button>
                {latest.archivedAt === null ? (
                  <button
                    className="button button--text button--sm"
                    type="button"
                    onClick={() => keepMine(latest)}
                    data-testid="field-keep-mine"
                  >
                    Keep my changes
                  </button>
                ) : null}
              </p>
            </div>
          ) : null}

          <Field
            label="Field name"
            name="field-name"
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            data-testid="field-name"
          />

          <div className="field">
            <label className="field__label" htmlFor="field-kind">
              Kind
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
                  ? `${entries(held.entryCount)} already ${held.entryCount === 1 ? 'has a value' : 'have values'}, so the kind can't change.`
                  : "Older versions of entries recorded values here, so the kind can't change."}{' '}
                Add a new field for a different kind.
              </p>
            ) : null}
          </div>

          {hasOptions ? (
            <Field
              label="Options, separated by commas"
              name="field-options"
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              error={fieldErrors.options}
              hint={field ? "You can't remove an option that an entry uses." : undefined}
              data-testid="field-options"
            />
          ) : null}

          {isLink ? (
            <div className="field">
              <label className="field__label" htmlFor="field-target">
                Can link to
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
                    Choose what it can link to…
                  </option>
                ) : null}
                <option value="any">Any Lore type</option>
                {groups.length > 0 ? (
                  <optgroup label="Groups">
                    {groups.map((group) => (
                      <option key={group.id} value={`group:${group.id}`}>
                        {group.name} (group)
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Types">
                  {tree.ordered.map((node) => (
                    <option key={node.type.id} value={`type:${node.type.id}`}>
                      {typePathLabel(node)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="field__hint" id="field-target-hint">
                {target === null
                  ? 'Pick one type, a group, or any Lore type. Lorex never guesses from the field’s name.'
                  : target === 'any'
                    ? 'It can link to any entry in this universe.'
                    : target.startsWith('group:')
                      ? 'It can link to entries whose type is in this group when you make the link.'
                      : 'It can link only to entries of this exact type, not to types nested inside it.'}
              </p>
              {field && field.entryCount > 0 ? (
                <p className="field__hint">
                  Lorex refuses a narrower choice while an entry links somewhere it would not allow,
                  and never clears a link to make it fit.
                </p>
              ) : null}
              {fieldErrors.target ? <p className="field__error">{fieldErrors.target}</p> : null}
            </div>
          ) : null}

          {semanticsFor(kind).length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor="field-semantic">
                Canon meaning
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
                <option value="">None</option>
                {semanticsFor(kind).map((each) => (
                  <option key={each} value={each}>
                    {FIELD_SEMANTIC_LABELS[each]}
                  </option>
                ))}
              </select>
              <p className="field__hint">
                Read by the Canon Integrity rules, never guessed from the field&rsquo;s name. Most
                fields need none.
              </p>
              {fieldErrors.semantic ? <p className="field__error">{fieldErrors.semantic}</p> : null}
            </div>
          ) : null}

          {isText ? (
            <Field
              label="Default text"
              name="field-default"
              dir="auto"
              value={defaultValue}
              onChange={(event) => setDefaultValue(event.target.value)}
              error={fieldErrors.defaultvalue}
              hint="Optional. New entries start with this text, and you can change it there."
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
              <span>Required</span>
            </label>
            {field && isRequired && !field.isRequired ? (
              <p className="field__hint">
                Every {type.name} entry will need a value. If some don&rsquo;t have one yet, Lorex
                says how many and changes nothing.
              </p>
            ) : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-field">
            {field ? (isSaving ? 'Saving…' : 'Save changes') : isSaving ? 'Adding…' : 'Add field'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-field"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
