import { useState } from 'react'
import { FieldSectionsDialog } from './FieldSectionsDialog'
import { useI18n } from '../i18n'
import type { EntityType, EntityTypeGroup, FieldDefinition } from '../lore/typeDefinitions'
import type { TypeTree } from '../lore/typeTree'
import { groupBySection } from '../lore/fieldSections'
import { typeFieldLabels } from '../lore/typeFieldLabels'
import { typeFieldActions } from '../lore/typeFieldActions'
import { FieldDialog } from './lore/FieldDialog'
import { TypeFieldRow } from './lore/TypeFieldRow'
import { InheritedFields } from './lore/InheritedFields'
import { TypeFieldTools } from './lore/TypeFieldTools'
import { ArchivedFields } from './lore/ArchivedFields'
import { Callout } from './Callout'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

interface TypeFieldsProps {
  universeId: string
  type: EntityType
  tree: TypeTree
  groups: EntityTypeGroup[]
  canEdit: boolean
  /** Reads the types again; the panel shows what comes back. */
  onChanged: () => Promise<void>
  /** The panel's id, which the row's Fields button names in `aria-controls`. */
  id?: string
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
  id,
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

  const { clear, archive, restore, remove } = typeFieldActions({
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
  })
  const { summary } = typeFieldLabels({ t, tree, groups })

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

  // What every active field's row reads from the list.
  const row = {
    universeId,
    type,
    canEdit,
    busyFieldId,
    blocked,
    summary,
    clear,
    setEditing,
    archive,
    remove,
  }

  return (
    <div id={id} className="types__fields" data-testid={`type-fields-${type.name}`}>
      {message ? <FormMessage testId="fields-error">{message}</FormMessage> : null}

      <InheritedFields type={type} inherited={inherited} summary={summary} />

      {type.fields.length === 0 ? (
        <QuietNote spacing="block">
          {inherited.length > 0
            ? t('entityTypes.fields.emptyInherited')
            : t('entityTypes.fields.empty')}
        </QuietNote>
      ) : sections.length === 0 ? (
        <ul
          className="plainlist stack"
          aria-label={t('entityTypes.fields.listLabel', { name: type.name })}
        >
          {type.fields.map((field) => (
            <TypeFieldRow key={field.id} field={field} {...row} />
          ))}
        </ul>
      ) : layout.ungrouped.length > 0 ? (
        <ul
          className="plainlist stack"
          aria-label={t('entityTypes.fields.listNoSectionLabel', { name: type.name })}
        >
          {layout.ungrouped.map((field) => (
            <TypeFieldRow key={field.id} field={field} {...row} />
          ))}
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
              className="plainlist stack"
              aria-label={t('entityTypes.fields.sectionListLabel', {
                section: section.name,
                type: type.name,
              })}
            >
              {items.map((field) => (
                <TypeFieldRow key={field.id} field={field} {...row} />
              ))}
            </ul>
          ) : (
            <QuietNote spacing="block">{t('entityTypes.fields.sectionEmpty')}</QuietNote>
          )}
        </div>
      ))}

      {canEdit ? (
        <TypeFieldTools
          type={type}
          sections={sections}
          clear={clear}
          setEditing={setEditing}
          setArranging={setArranging}
        />
      ) : null}

      <Callout look="notice" className="types__notice" testId={`fields-notice-${type.name}`}>
        <p role="status">{notice}</p>
      </Callout>

      {archived.length > 0 ? (
        <ArchivedFields
          universeId={universeId}
          type={type}
          canEdit={canEdit}
          archived={archived}
          busyFieldId={busyFieldId}
          blocked={blocked}
          restoreOffer={restoreOffer}
          sectionName={sectionName}
          archive={archive}
          restore={restore}
          remove={remove}
        />
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
