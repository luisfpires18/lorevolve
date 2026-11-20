import { Field } from '../Field'
import { t, useI18n } from '../../i18n'
import { CanonStatusPicker } from '../CanonStatusPicker'
import type { RefObject } from 'react'
import type { MomentDraft } from '../../timeline/momentDraft'

/** The moment's title, description and status. */
export function MomentBasics({
  title,
  draft,
  edit,
  fieldErrors,
}: {
  title: RefObject<HTMLInputElement | null>
  draft: MomentDraft
  edit: (change: Partial<MomentDraft>) => void
  fieldErrors: Record<string, string>
}) {
  useI18n()
  return (
    <>
      <Field
        label={t('time.momentForm.title')}
        id="moment-title"
        error={fieldErrors.title}
        name={null}
        ref={title}
        type="text"
        dir="auto"
        placeholder={t('time.momentForm.titlePlaceholder')}
        value={draft.title}
        onChange={(event) => edit({ title: event.target.value })}
        data-testid="moment-title"
      />

      <Field
        as="textarea"
        label={t('time.momentForm.description')}
        id="moment-description"
        error={fieldErrors.description}
        rows={3}
        placeholder={t('time.momentForm.descriptionPlaceholder')}
        value={draft.description}
        onChange={(event) => edit({ description: event.target.value })}
        data-testid="moment-description"
      />

      <CanonStatusPicker
        field={{ label: t('time.momentForm.status') }}
        optionTestId="moment-canon-"
        value={draft.canonStatus}
        onChange={(canonStatus) => edit({ canonStatus })}
      />
    </>
  )
}
