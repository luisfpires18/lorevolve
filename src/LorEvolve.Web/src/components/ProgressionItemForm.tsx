import { ScenePicks } from './ScenePicks'
import { useI18n } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { Drawer } from './Drawer'
import { Field } from './Field'
import type { Progression } from '../progression/types'
import {
  LISTS,
  inputOf,
  listOf,
  nameOf,
  partOf,
  wordsOf,
  type Item,
  type Kind,
} from '../progression/itemDraft'
import { useItemFormState } from '../progression/useItemFormState'
import { itemFormActions } from '../progression/itemFormActions'
import { ItemConflict } from './progression/ItemConflict'
import { ItemNameFields } from './progression/ItemNameFields'
import { ItemUnlockField } from './progression/ItemUnlockField'
import { Button } from './Button'
import { FormActions } from './FormActions'

/**
 * One form or one ability of an entry (Issue #42), in the drawer every LorEvolve form uses: what it is; when it was first unlocked
 * - an era of the entry, a scene, a timeline moment, each optional; the eras it is available in, ticked one by one (a shortcut
 * ticks an era and every later one, and what is saved is still the ticks); the scenes it is used in; and, for an ability, the
 * forms it belongs to. Nothing is filled in from anything else. The save is the whole progression over the version read.
 *
 * An appearance (Issue #43) is the same drawer without a first unlock: its label, notes, eras, forms and scenes. Its pictures
 * are added on the appearance itself, once it is saved.
 */
export function ProgressionItemForm({
  universeId,
  entityId,
  entityName,
  progression,
  kind,
  item,
  onClose,
  onSaved,
}: {
  universeId: string
  entityId: string
  entityName: string
  progression: Progression
  kind: Kind
  item: Item | null
  onClose: () => void
  onSaved: (progression: Progression) => void
}) {
  const { t } = useI18n()
  const state = useItemFormState({ progression, item })
  const words = wordsOf(kind)
  const {
    nameInput,
    saveButton,
    base,
    setBase,
    initial,
    setInitial,
    draft,
    setDraft,
    fieldErrors,
    message,
    isSaving,
    conflict,
    setConflict,
  } = state

  const isDirty = payloadKey(inputOf(draft, null)) !== payloadKey(inputOf(initial, null))

  const list = listOf(base, kind)
  const index = item ? list.findIndex((one) => one.id === item.id) : -1
  const key = `${LISTS[kind]}[${index === -1 ? list.length : index}]`
  const errorOf = (part: string) => fieldErrors[`${key}.${partOf(kind, part)}`.toLowerCase()]
  const isLook = kind === 'appearance'

  const { edit, toggle, fromUnlockOn, save } = itemFormActions({
    ...state,
    universeId,
    entityId,
    kind,
    item,
    onSaved,
    words,
    key,
  })

  const heading = item ? nameOf(item) : words.heading
  const unlockAt = base.eras.findIndex((era) => era.id === draft.unlockEraId)

  return (
    <Drawer
      initialFocus={nameInput}
      testId={`${kind}-form`}
      titleId="item-heading"
      eyebrow={item ? words.eyebrow(entityName) : words.eyebrowNew(entityName)}
      title={heading}
      isDirty={isDirty}
      leaveMessage={
        item ? t('progression.item.unsavedExisting', { name: nameOf(item) }) : words.unsaved
      }
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={item ? words.save : words.add}
          busy={isSaving}
          busyLabel={item ? t('progression.item.saving') : t('progression.item.adding')}
          submitTestId={`save-${kind}`}
          submitRef={saveButton}
          onCancel={close}
        />
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid={`${kind}-error`}>
          {message}
        </p>
      ) : null}

      {conflict ? (
        <ItemConflict
          universeId={universeId}
          entityId={entityId}
          kind={kind}
          item={item}
          setBase={setBase}
          setInitial={setInitial}
          setDraft={setDraft}
          setConflict={setConflict}
          nameInput={nameInput}
          saveButton={saveButton}
        />
      ) : null}

      <ItemNameFields
        kind={kind}
        isLook={isLook}
        draft={draft}
        edit={edit}
        errorOf={errorOf}
        nameInput={nameInput}
      />

      {isLook ? null : (
        <ItemUnlockField
          universeId={universeId}
          kind={kind}
          base={base}
          draft={draft}
          edit={edit}
          errorOf={errorOf}
        />
      )}

      {base.eras.length > 0 ? (
        <Field
          label={isLook ? t('progression.item.eras.titleLook') : t('progression.item.eras.title')}
          group="fieldset"
          className="itemeras"
          data-testid={`${kind}-eras`}
          hint={isLook ? t('progression.item.eras.hintLook') : t('progression.item.eras.hint')}
          error={errorOf('eraIds')}
        >
          {base.eras.map((era) => (
            <label className="check" key={era.id}>
              <input
                type="checkbox"
                checked={draft.eraIds.includes(era.id)}
                onChange={(event) =>
                  edit({ eraIds: toggle(draft.eraIds, era.id, event.target.checked) })
                }
                data-testid={`${kind}-era-${era.name}`}
              />
              {era.name}
            </label>
          ))}
          {!isLook && unlockAt !== -1 ? (
            <Button
              tone="secondary"
              size="sm"
              onClick={fromUnlockOn}
              data-testid={`${kind}-eras-from-unlock`}
            >
              {t('progression.item.eras.fromUnlock', { name: base.eras[unlockAt].name })}
            </Button>
          ) : null}
        </Field>
      ) : null}

      <ScenePicks
        universeId={universeId}
        label={isLook ? t('progression.item.scenes.labelLook') : t('progression.item.scenes.label')}
        hint={isLook ? t('progression.item.scenes.hintLook') : t('progression.item.scenes.hint')}
        value={draft.scenes}
        onChange={(scenes) => edit({ scenes })}
        error={errorOf('sceneIds')}
        testId={`${kind}-scenes`}
      />

      {kind !== 'form' && base.forms.length > 0 ? (
        <Field
          label={isLook ? t('progression.item.forms.titleLook') : t('progression.item.forms.title')}
          group="fieldset"
          className="itemeras"
          data-testid={`${kind}-forms`}
          hint={t('progression.item.forms.hint')}
          error={errorOf('formIds')}
        >
          {base.forms.map((form) => (
            <label className="check" key={form.id}>
              <input
                type="checkbox"
                checked={draft.formIds.includes(form.id)}
                onChange={(event) =>
                  edit({ formIds: toggle(draft.formIds, form.id, event.target.checked) })
                }
                data-testid={`${kind}-form-${form.name}`}
              />
              {form.name}
            </label>
          ))}
        </Field>
      ) : null}
    </Drawer>
  )
}
