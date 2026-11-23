import { t, useI18n } from '../../i18n'
import { CanonStatusPicker } from '../CanonStatusPicker'
import { NameNoteFields } from '../NameNoteFields'
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
      <NameNoteFields
        idPrefix="moment"
        labels={{ name: t('time.momentForm.title'), note: t('time.momentForm.description') }}
        rows={3}
        value={{ name: draft.title, note: draft.description }}
        onChange={(part, value) =>
          edit(part === 'name' ? { title: value } : { description: value })
        }
        errors={{ name: fieldErrors.title, note: fieldErrors.description }}
        testIds={{ name: 'moment-title', note: 'moment-description' }}
        nameRef={title}
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
