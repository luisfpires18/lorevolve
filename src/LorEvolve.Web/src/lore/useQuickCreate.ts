import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { errorText } from '../lib/errorText'
import type { Load } from '../lib/useAsyncRead'
import { payloadKey } from '../lib/drawerGuard'
import { emptyValue, valuedFields } from './document'
import { createEntity, listEntities } from './api'
import { listEntityTypeGroups, listEntityTypes } from './typesApi'
import { withInheritedFields } from './fieldInheritance'
import { branchIds, buildTypeTree } from './typeTree'
import { CanonStatus, type EntitySummary, type FieldValueInput } from './types'
import type { EntityType } from './typeDefinitions'
import type { Props } from '../components/QuickCreateDialog'
import { useDebouncedValue } from '../lib/useDebouncedValue'

const SIMILAR_LIMIT = 5

/** Two names that a person would take for the same one: the same letters, or one the start of the other. */
function looksLike(a: string, b: string) {
  const x = a.trim().toLocaleLowerCase()
  const y = b.trim().toLocaleLowerCase()
  return x !== '' && y !== '' && (x === y || x.startsWith(y) || y.startsWith(x))
}

/** Quick Create's form: the types it offers, entries already here under a name like this one, and the create. */
export function useQuickCreate({
  universeId,
  initialName,
  entityTypeId,
  entityTypeGroupId,
  onCreated,
}: Pick<Props, 'universeId' | 'initialName' | 'entityTypeId' | 'entityTypeGroupId' | 'onCreated'>) {
  const { t } = useI18n()
  const nameId = useId()
  const headingId = useId()
  const typeId = useId()
  const [types, setTypes] = useState<Load<EntityType[]>>({ kind: 'loading' })
  const [name, setName] = useState(initialName.trim())
  const [chosenTypeId, setChosenTypeId] = useState<string>('')
  const [values, setValues] = useState<Record<string, FieldValueInput>>({})
  const [similar, setSimilar] = useState<EntitySummary[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // A create on its way. Read synchronously, so a second press, Escape or a press on the backdrop in the same instant as
  // Create is still refused: the request is out and its answer decides what happens next, not the author.
  const sending = useRef(false)
  // Gone - closed by leaving the page while a create was out. Its late answer then chooses nothing.
  const gone = useRef(false)
  const messageRef = useRef<HTMLParagraphElement>(null)

  // A type taken because it was the only one is not a change the author made.
  const takenTypeId = types.kind === 'ready' && types.value.length === 1 ? types.value[0].id : ''
  const isDirty =
    payloadKey({ name: name.trim(), chosenTypeId, values }) !==
    payloadKey({ name: initialName.trim(), chosenTypeId: takenTypeId, values: {} })
  useEffect(() => {
    document.getElementById(nameId)?.focus()
  }, [nameId])

  // Set again on every mount: development's double mount runs the cleanup once in between.
  useEffect(() => {
    gone.current = false
    return () => {
      gone.current = true
    }
  }, [])

  // A refusal or a failure takes the focus to what it says, since the button that was pressed was disabled under it.
  useEffect(() => {
    if (message) messageRef.current?.focus()
  }, [message])

  // The types as they are now, read when the form opens: a group's members today, never its name.
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listEntityTypes(universeId, controller.signal),
      entityTypeGroupId ? listEntityTypeGroups(universeId, controller.signal) : null,
    ])
      .then(([all, groups]) => {
        const tree = buildTypeTree(all)
        const target = entityTypeId ? tree.byId.get(entityTypeId) : undefined
        // A type limit takes its nested types too (Issue #61): the type and its branch, in the hierarchy's order.
        const members = entityTypeId
          ? target
            ? branchIds(target)
            : new Set<string>()
          : entityTypeGroupId
            ? new Set(groups?.find((group) => group.id === entityTypeGroupId)?.typeIds ?? [])
            : null
        const eligible = (entityTypeId ? tree.ordered.map((node) => node.type) : all).filter(
          (type) => !members || members.has(type.id),
        )
        // Each with the fields it inherits, so a required one above it is asked for too.
        setTypes({
          kind: 'ready',
          value: eligible.map((type) => withInheritedFields(type, all)),
        })
        // One type to choose from is no choice: it is taken, never asked again.
        if (eligible.length === 1) setChosenTypeId(eligible[0].id)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setTypes({ kind: 'error', message: errorText(error, '') })
      })
    return () => controller.abort()
  }, [universeId, entityTypeId, entityTypeGroupId])

  // Entries already here under a name like this one, among those the picker would offer. Advice only: a second entry of
  // the same name is allowed, and what this shows can change before Create is pressed.
  const settledName = useDebouncedValue(name)
  useEffect(() => {
    const search = settledName.trim()
    if (!search) return
    const controller = new AbortController()
    listEntities(
      universeId,
      {
        search,
        entityTypeId,
        includeDescendants: true,
        entityTypeGroupId,
        canonStatus: null,
        tag: null,
        page: 1,
      },
      controller.signal,
    )
      .then((page) =>
        setSimilar(
          page.items.filter((item) => looksLike(item.name, search)).slice(0, SIMILAR_LIMIT),
        ),
      )
      .catch(() => {
        /* Advice that could not be read is simply not given. */
      })
    return () => {
      controller.abort()
    }
  }, [universeId, settledName, entityTypeId, entityTypeGroupId])

  // Cleared name, no advice: what was found for an earlier name is not shown for none.
  const shownSimilar = name.trim() ? similar : []
  const eligible = types.kind === 'ready' ? types.value : []
  const chosenType = eligible.find((type) => type.id === chosenTypeId) ?? null
  // Only what the type requires, from its active fields: an archived field is in no form.
  const required = chosenType?.fields.filter((definition) => definition.isRequired) ?? []

  async function create() {
    if (sending.current) return
    if (!chosenType) {
      setFieldErrors({ entitytypeid: t('lore.quickCreate.chooseKind') })
      setMessage(null)
      return
    }

    sending.current = true
    setIsSaving(true)
    setMessage(null)
    setFieldErrors({})

    try {
      const created = await createEntity(universeId, {
        entityTypeId: chosenType.id,
        name: name.trim(),
        summary: null,
        canonStatus: CanonStatus.Idea,
        aliases: [],
        tags: [],
        // Every active field, as the full form sends them: what was filled in here, the rest at its default.
        fields: valuedFields(chosenType.fields).map(
          (definition) => values[definition.id] ?? emptyValue(definition),
        ),
      })
      // Exactly the entry the server made, from its answer. Nothing is chosen for a form that has already gone.
      if (!gone.current)
        onCreated({ id: created.id, name: created.name, typeName: created.entityTypeName })
    } catch (error: unknown) {
      sending.current = false
      if (gone.current) return
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('lore.quickCreate.detailsNeedChange'),
        )
      } else {
        setMessage(t('lore.quickCreate.failed'))
      }
    } finally {
      if (!gone.current) setIsSaving(false)
    }
  }

  return {
    nameId,
    headingId,
    typeId,
    types,
    name,
    setName,
    chosenTypeId,
    setChosenTypeId,
    values,
    setValues,
    fieldErrors,
    setFieldErrors,
    message,
    isSaving,
    sending,
    messageRef,
    isDirty,
    shownSimilar,
    eligible,
    required,
    create,
  }
}
