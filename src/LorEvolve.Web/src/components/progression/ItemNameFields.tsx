import type { RefObject } from 'react'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { DESCRIPTION_MAX, type ItemDraft, type Kind } from '../../progression/itemDraft'

/** The item's name or label, and what it is or its notes. */
export function ItemNameFields({
  kind,
  isLook,
  draft,
  edit,
  errorOf,
  nameInput,
}: {
  kind: Kind
  isLook: boolean
  draft: ItemDraft
  edit: (change: Partial<ItemDraft>) => void
  errorOf: (part: string) => string | undefined
  nameInput: RefObject<HTMLInputElement | null>
}) {
  const { t } = useI18n()
  return (
    <>
      <Field
        label={isLook ? t('progression.item.label') : t('progression.item.name')}
        id="item-name"
        error={errorOf('name')}
        name={null}
        ref={nameInput}
        dir="auto"
        placeholder={
          isLook ? t('progression.item.labelPlaceholder') : t('progression.item.namePlaceholder')
        }
        value={draft.name}
        onChange={(event) => edit({ name: event.target.value })}
        data-testid={`${kind}-name-input`}
      />

      <Field
        as="textarea"
        label={isLook ? t('progression.item.notes') : t('progression.item.whatItIs')}
        id="item-description"
        hint={
          kind === 'form'
            ? t('progression.item.hint.form')
            : kind === 'ability'
              ? t('progression.item.hint.ability')
              : t('progression.item.hint.appearance')
        }
        error={errorOf('description')}
        rows={4}
        dir="auto"
        maxLength={DESCRIPTION_MAX}
        value={draft.description}
        onChange={(event) => edit({ description: event.target.value })}
        data-testid={`${kind}-description-input`}
      />
    </>
  )
}
