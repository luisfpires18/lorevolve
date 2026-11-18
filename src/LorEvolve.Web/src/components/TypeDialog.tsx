import { useEffect, useState } from 'react'
import { TypeGroupsField, type GroupChoice } from './TypeGroupsField'
import { useI18n } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { Drawer } from './Drawer'
import { useReturnFocus } from '../lib/returnFocus'
import type { EntityTypeGroup } from '../lore/typeDefinitions'
import { branchIds, type TreeType, type TypeTree } from '../lore/typeTree'
import { typeDialogSave } from '../lore/typeDialogSave'
import { TypeDialogIdentity } from './TypeDialogIdentity'
import { TypeDialogPlace } from './TypeDialogPlace'
import { TypeDialogBehaviour } from './TypeDialogBehaviour'
import { Button } from './Button'

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
  noParent = false,
  nameHint,
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
  /** A type with no place in a hierarchy (a universe template): the Hierarchy section is left out and no parent is sent. */
  noParent?: boolean
  /** A line under the name. */
  nameHint?: string
  /** The save itself: the caller knows which API holds the type. A rejection is shown in the drawer. */
  write: (values: TypeDialogValues) => Promise<unknown>
  onClose: () => void
  /** With the parent it was saved under, null at the top. */
  onSaved: (name: string, parentId: string | null) => Promise<void>
}) {
  const { t, tx } = useI18n()
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
  useReturnFocus()

  useEffect(() => {
    document.getElementById('type-name')?.focus()
  }, [])

  const { save } = typeDialogSave({
    type,
    write,
    onSaved,
    t,
    name,
    parentId,
    icon,
    familyTreeEligible,
    groupChoices,
    groupsChanged,
    setFieldErrors,
    setMessage,
    setIsSaving,
  })

  return (
    <Drawer
      testId={type ? 'edit-type-dialog' : 'new-type-dialog'}
      titleId="type-heading"
      eyebrow={eyebrow ?? t('entityTypes.page.dialog.eyebrow')}
      title={
        type
          ? t('entityTypes.page.dialog.editTitle')
          : chosenParent
            ? t('entityTypes.page.dialog.newChildTitle')
            : t('entityTypes.page.dialog.newTitle')
      }
      // Where a new type is going, in a line, while it is going inside one. The Parent type select is what decides.
      context={
        !type && chosenParent ? (
          <p className="drawer__context" data-testid="type-dialog-context">
            {tx('entityTypes.page.dialog.inside', { name: <bdi>{chosenParent.name}</bdi> })}
          </p>
        ) : null
      }
      isDirty={isDirty}
      leaveMessage={
        type
          ? t('entityTypes.page.dialog.leaveEdit', { name: type.name })
          : t('entityTypes.page.dialog.leaveNew')
      }
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <Button type="submit" disabled={isSaving} data-testid="save-type">
            {type
              ? isSaving
                ? t('entityTypes.page.dialog.saving')
                : t('entityTypes.page.dialog.saveChanges')
              : isSaving
                ? t('entityTypes.page.dialog.creating')
                : t('entityTypes.page.dialog.create')}
          </Button>
          <Button tone="secondary" onClick={close} data-testid="cancel-type">
            {t('entityTypes.page.dialog.cancel')}
          </Button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="type-dialog-error">
          {message}
        </p>
      ) : null}

      {/* The form in three parts, as an author thinks of a type: what it is, where it sits, what it does. */}
      <TypeDialogIdentity
        type={type}
        nameHint={nameHint}
        iconHint={iconHint}
        name={name}
        setName={setName}
        icon={icon}
        setIcon={setIcon}
        fieldErrors={fieldErrors}
      />

      {noParent ? null : (
        <TypeDialogPlace
          parentHint={parentHint}
          parentId={parentId}
          setParentId={setParentId}
          parents={parents}
          fieldErrors={fieldErrors}
        />
      )}

      {groups ? (
        <>
          <TypeGroupsField groups={groups} value={groupChoices} onChange={setGroupChoices} />
          {fieldErrors.groups ? <p className="field__error">{fieldErrors.groups}</p> : null}
        </>
      ) : null}

      {type || !groups ? null : (
        <TypeDialogBehaviour
          familyTreeEligible={familyTreeEligible}
          setFamilyTreeEligible={setFamilyTreeEligible}
        />
      )}
    </Drawer>
  )
}
