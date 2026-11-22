import type { Chronology } from '../chronology/types'
import { useI18n } from '../i18n'
import { emptyValue } from '../lore/document'
import type { EntityChoice } from './EntityPicker'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { FieldInput } from './FieldInputs'
import { useQuickCreate } from '../lore/useQuickCreate'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { QuietNote } from './QuietNote'
import { FormMessage } from './FormMessage'
import { Callout } from './Callout'

export interface Props {
  universeId: string
  /** What was typed in the picker: the new entry's name to start from. */
  initialName: string
  /** The picker's own limit, exactly as it searches: one type and its nested types, one semantic group, or neither. */
  entityTypeId: string | null
  entityTypeGroupId: string | null
  chronology: Chronology
  /** The entry exists: the server's answer, never a lookup by name. */
  onCreated: (choice: EntityChoice) => void
  /** An entry that was already there, picked instead of making a second. */
  onChooseExisting: (choice: EntityChoice) => void
  onCancel: () => void
}

/**
 * Quick Create (Issue #25): a missing entry made from the picker that needed it, without leaving the form the picker is
 * in. Create now, enrich later - only the name, the type when there is a choice, and the type's active required fields.
 *
 * It is an ordinary create: the same `createEntity` the full form posts, so the server checks the type, the fields, the
 * links and the access exactly as it does there, and the entry is a normal Idea from the moment it exists. Nothing here
 * saves the form underneath. The types offered are the picker's own limit as it is now: the type and the types nested
 * beneath it, the members of the group, or every type. Its own link fields search existing entries only, so a create
 * never opens another create.
 */
export function QuickCreateDialog({
  universeId,
  initialName,
  entityTypeId,
  entityTypeGroupId,
  chronology,
  onCreated,
  onChooseExisting,
  onCancel,
}: Props) {
  const { t } = useI18n()
  const {
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
  } = useQuickCreate({ universeId, initialName, entityTypeId, entityTypeGroupId, onCreated })

  return (
    <Drawer
      testId="quick-create-dialog"
      titleId={headingId}
      className="quickcreate"
      eyebrow={t('lore.quickCreate.eyebrow')}
      title={t('lore.quickCreate.title')}
      isDirty={isDirty}
      leaveMessage={t('lore.quickCreate.leave')}
      onClose={onCancel}
      // While a create is out there is nothing to close: Cancel is disabled with the rest of the form, and Escape and
      // the backdrop are swallowed before the drawer guard sees them.
      isLocked={() => sending.current}
      busy={isSaving}
      onSubmit={() => void create()}
      actions={(close) => (
        <FormActions
          submitLabel={t('lore.quickCreate.create')}
          busy={isSaving}
          busyLabel={t('lore.quickCreate.creating')}
          disabled={eligible.length === 0}
          submitTestId="quick-create-submit"
          onCancel={close}
          lockCancel
          cancelTestId="quick-create-cancel"
        />
      )}
    >
      {message ? (
        <FormMessage testId="quick-create-error" tabIndex={-1} ref={messageRef}>
          {message}
        </FormMessage>
      ) : null}

      <p className="quickcreate__pending" role="status" data-testid="quick-create-pending">
        {isSaving ? t('lore.quickCreate.pending') : null}
      </p>

      {/* Everything the create was sent with stays as it was sent until the answer comes. */}
      <fieldset className="quickcreate__inputs" disabled={isSaving}>
        <p className="quickcreate__note">{t('lore.quickCreate.note')}</p>

        <Field
          label={t('lore.quickCreate.name')}
          name={nameId}
          dir="auto"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          data-testid="quick-create-name"
        />

        {shownSimilar.length > 0 ? (
          <Callout
            look="callout"
            tone="warning"
            className="quickcreate__similar"
            testId="quick-create-similar"
            title={t('lore.quickCreate.similarTitle')}
          >
            <p>{t('lore.quickCreate.similarBody')}</p>
            <ul className="quickcreate__matches">
              {shownSimilar.map((item) => (
                <li key={item.id}>
                  <span className="quickcreate__match">
                    <bdi>{item.name}</bdi>{' '}
                    <span className="picker__kind">
                      <bdi>{item.entityTypeName}</bdi>
                    </span>
                  </span>
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() =>
                      onChooseExisting({
                        id: item.id,
                        name: item.name,
                        typeName: item.entityTypeName,
                      })
                    }
                    aria-label={t('lore.quickCreate.useLabel', {
                      name: item.name,
                      type: item.entityTypeName,
                    })}
                    data-testid={`quick-create-use-${item.name}`}
                  >
                    {t('lore.quickCreate.useThis')}
                  </Button>
                </li>
              ))}
            </ul>
          </Callout>
        ) : null}

        {types.kind === 'loading' ? (
          <QuietNote spacing="hint" role="status">
            {t('lore.quickCreate.readingTypes')}
          </QuietNote>
        ) : types.kind === 'error' ? (
          <FormMessage>{t('lore.quickCreate.typesFailed')}</FormMessage>
        ) : eligible.length === 0 ? (
          <FormMessage testId="quick-create-no-types">{t('lore.quickCreate.noTypes')}</FormMessage>
        ) : eligible.length === 1 ? (
          <QuietNote className="quickcreate__type" size="ui" wrap testId="quick-create-type">
            {t('lore.quickCreate.typeFixed')} <bdi>{eligible[0].name}</bdi>
          </QuietNote>
        ) : (
          <Field
            as="select"
            label={t('lore.quickCreate.typeLabel')}
            id={typeId}
            error={fieldErrors.entitytypeid}
            value={chosenTypeId}
            onChange={(event) => {
              setChosenTypeId(event.target.value)
              setFieldErrors({})
            }}
            data-testid="quick-create-type-select"
          >
            <option value="">{t('lore.quickCreate.chooseType')}</option>
            {eligible.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Field>
        )}

        {required.length > 0 ? (
          <div className="quickcreate__fields" data-testid="quick-create-fields">
            {required.map((definition) => (
              <div key={definition.id}>
                {/* No quick create in here: a link field picks an existing entry. */}
                <FieldInput
                  definition={definition}
                  value={values[definition.id] ?? emptyValue(definition)}
                  universeId={universeId}
                  chronology={chronology}
                  onChange={(next) =>
                    setValues((current) => ({ ...current, [definition.id]: next }))
                  }
                  error={fieldErrors[definition.id]}
                />
              </div>
            ))}
          </div>
        ) : null}
      </fieldset>
    </Drawer>
  )
}
