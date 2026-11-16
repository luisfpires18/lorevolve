import { useEffect, useRef, useState } from 'react'
import { Field } from './Field'
import { TypeIconPicker } from './TypeIconPicker'
import { TypeGroupsField, type GroupChoice } from './TypeGroupsField'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import type { EntityTypeGroup } from '../lore/types'
import { branchIds, typePathLabel, type TreeType, type TypeTree } from '../lore/typeTree'

/** What the drawer reads of the type it edits: a lore type, or a project's own type (#144). */
export type DialogType = TreeType & { icon: string | null; familyTreeEligible?: boolean }

export type TypeDialogValues = {
  name: string
  icon: string | null
  parentId: string | null
  familyTreeEligible: boolean
  /** Set only when the groups changed (an edit) or some were chosen (a new type). */
  groups: GroupChoice[] | undefined
}

/**
 * One Lore Type, new or existing. A new type is given its name, its icon, and whether its entries take part in the Family
 * Tree - the only things a type needs before its first entry. An existing one edits its name and icon only: the Family
 * Tree choice is the first of a type's constraints, and those get a surface of their own rather than one more checkbox
 * here, so an edit sends the stored choice back untouched. Fields are managed on the type.
 * In the drawer every LorEvolve form uses, so focus goes in, Escape asks before an edit is lost, and focus returns to the
 * button that opened it.
 *
 * An edit changes the type in place, by id: every entry keeps it, and so do Lore's filter and its address. The route
 * replaces the whole type, so what this form does not edit - the description, the colour, the order, the Family Tree
 * choice - is sent back exactly as it is stored.
 *
 * Both choose where the type sits: at the top, or inside another type - structure, so it belongs with the name. Moving a
 * type moves everything inside it, and it goes last among its new siblings. The type itself and anything already inside
 * it are not offered, since a type cannot sit inside itself. A nested type inherits every field of the types above it, and a parent's Family
 * Tree choice says nothing about its children.
 */
export function TypeDialog({
  tree,
  type,
  initialParent = null,
  groups,
  eyebrow,
  iconHint,
  parentHint,
  write,
  onClose,
  onSaved,
}: {
  tree: TypeTree<TreeType>
  /** The type being edited, or null for a new one. */
  type: DialogType | null
  /** For a new type: the type it starts inside (a row's Add child). Still only a starting choice - the select decides. */
  initialParent?: TreeType | null
  /**
   * Every group of the universe, for the Groups control. Left out by a project's own types (#144), which have neither
   * groups nor a Family Tree, so the drawer then asks only for the name, the icon and the place.
   */
  groups?: EntityTypeGroup[]
  /** The words that are about Lore by default, said for the screen the drawer opens on. */
  eyebrow?: string
  iconHint?: string
  parentHint?: string
  /** The save itself: the caller knows which API holds the type. A rejection is shown in the drawer. */
  write: (values: TypeDialogValues) => Promise<unknown>
  onClose: () => void
  /** With the parent it was saved under, null at the top. */
  onSaved: (name: string, parentId: string | null) => Promise<void>
}) {
  const { t, tx } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const initial = {
    name: type?.name ?? '',
    icon: type?.icon ?? null,
    familyTreeEligible: type?.familyTreeEligible ?? false,
    parentId: type ? type.parentId : (initialParent?.id ?? null),
    // The groups the type was in when the drawer opened, by id: only a change to these is sent.
    groupIds: type
      ? (groups ?? []).filter((group) => group.typeIds.includes(type.id)).map((group) => group.id)
      : [],
  }
  const [name, setName] = useState(initial.name)
  const [parentId, setParentId] = useState<string | null>(initial.parentId)
  const ownBranch =
    type && tree.byId.get(type.id) ? branchIds(tree.byId.get(type.id)!) : new Set<string>()
  const parents = tree.ordered.filter((node) => !ownBranch.has(node.type.id))
  const chosenParent = parentId ? (tree.byId.get(parentId)?.type ?? null) : null
  const [icon, setIcon] = useState<string | null>(initial.icon)
  const [familyTreeEligible, setFamilyTreeEligible] = useState(initial.familyTreeEligible)
  const [groupChoices, setGroupChoices] = useState<GroupChoice[]>(() =>
    initial.groupIds.map((id) => ({ id })),
  )
  const groupsChanged =
    payloadKey(
      groupChoices.map((choice) => ('id' in choice ? choice.id : `new:${choice.name}`)),
    ) !== payloadKey(initial.groupIds)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    groupsChanged ||
    payloadKey({ name: name.trim(), icon, familyTreeEligible, parentId }) !==
      payloadKey({
        name: initial.name,
        icon: initial.icon,
        familyTreeEligible: initial.familyTreeEligible,
        parentId: initial.parentId,
      })
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    type
      ? t('entityTypes.page.dialog.leaveEdit', { name: type.name })
      : t('entityTypes.page.dialog.leaveNew'),
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById('type-name')?.focus()
  }, [])

  async function save() {
    setMessage(null)
    setFieldErrors({})
    if (!name.trim()) {
      setFieldErrors({ name: t('entityTypes.page.dialog.nameRequired') })
      return
    }

    setIsSaving(true)
    try {
      await write({
        name: name.trim(),
        icon,
        parentId,
        familyTreeEligible,
        // Only a change is sent: an edit that leaves the groups alone, or a new type in none, says nothing about them.
        groups: (type ? groupsChanged : groupChoices.length > 0) ? groupChoices : undefined,
      })
      await onSaved(name.trim(), parentId)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : type
              ? t('entityTypes.page.dialog.detailsSave')
              : t('entityTypes.page.dialog.detailsCreate'),
        )
      } else {
        setMessage(
          type
            ? t('entityTypes.page.dialog.saveFailed')
            : t('entityTypes.page.dialog.createFailed'),
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="type-heading"
      {...dialogProps}
      data-testid={type ? 'edit-type-dialog' : 'new-type-dialog'}
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">{eyebrow ?? t('entityTypes.page.dialog.eyebrow')}</p>
          <h2 className="drawer__title" id="type-heading">
            {type
              ? t('entityTypes.page.dialog.editTitle')
              : chosenParent
                ? t('entityTypes.page.dialog.newChildTitle')
                : t('entityTypes.page.dialog.newTitle')}
          </h2>
          {/* Where a new type is going, in a line, while it is going inside one. The Parent type select is what decides. */}
          {!type && chosenParent ? (
            <p className="drawer__context" data-testid="type-dialog-context">
              {tx('entityTypes.page.dialog.inside', { name: <bdi>{chosenParent.name}</bdi> })}
            </p>
          ) : null}
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="type-dialog-error">
              {message}
            </p>
          ) : null}

          {/* The form in three parts, as an author thinks of a type: what it is, where it sits, what it does. */}
          <section className="drawer__group" aria-labelledby="type-identity">
            <h3 className="sectionrule sectionrule--accent" id="type-identity">
              {t('entityTypes.page.dialog.identity')}
            </h3>
            <Field
              label={t('entityTypes.page.dialog.name')}
              name="type-name"
              placeholder={type ? undefined : t('entityTypes.page.dialog.namePlaceholder')}
              dir="auto"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              data-testid="type-name"
            />

            <div className="field">
              <TypeIconPicker value={icon} onChange={setIcon} testId="type-icon" />
              <p className="field__hint">{iconHint ?? t('entityTypes.page.dialog.iconHint')}</p>
              {fieldErrors.icon ? <p className="field__error">{fieldErrors.icon}</p> : null}
            </div>
          </section>

          <section className="drawer__group" aria-labelledby="type-hierarchy">
            <h3 className="sectionrule sectionrule--accent" id="type-hierarchy">
              {t('entityTypes.page.dialog.hierarchy')}
            </h3>
            <div className="field">
              <label className="field__label" htmlFor="type-parent">
                {t('entityTypes.page.dialog.parent')}
              </label>
              <select
                id="type-parent"
                className="field__input field__input--select"
                value={parentId ?? ''}
                onChange={(event) => setParentId(event.target.value || null)}
                aria-describedby="type-parent-hint"
                data-testid="type-parent"
              >
                <option value="">{t('entityTypes.page.dialog.parentNone')}</option>
                {parents.map((node) => (
                  <option key={node.type.id} value={node.type.id}>
                    {typePathLabel(node)}
                  </option>
                ))}
              </select>
              <p className="field__hint" id="type-parent-hint">
                {parentHint ?? t('entityTypes.page.dialog.parentHint')}
              </p>
              {fieldErrors.parent ? <p className="field__error">{fieldErrors.parent}</p> : null}
            </div>
          </section>

          {groups ? (
            <>
              <TypeGroupsField groups={groups} value={groupChoices} onChange={setGroupChoices} />
              {fieldErrors.groups ? <p className="field__error">{fieldErrors.groups}</p> : null}
            </>
          ) : null}

          {type || !groups ? null : (
            <section className="drawer__group" aria-labelledby="type-behaviour">
              <h3 className="sectionrule sectionrule--accent" id="type-behaviour">
                {t('entityTypes.page.dialog.behaviour')}
              </h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={familyTreeEligible}
                  onChange={(event) => setFamilyTreeEligible(event.target.checked)}
                  data-testid="type-family"
                />
                <span>
                  <span className="types__familylabel">
                    {t('entityTypes.page.dialog.familyLabel')}
                  </span>
                  {t('entityTypes.page.dialog.familyText')}
                </span>
              </label>
            </section>
          )}
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-type">
            {type
              ? isSaving
                ? t('entityTypes.page.dialog.saving')
                : t('entityTypes.page.dialog.saveChanges')
              : isSaving
                ? t('entityTypes.page.dialog.creating')
                : t('entityTypes.page.dialog.create')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-type"
          >
            {t('entityTypes.page.dialog.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
