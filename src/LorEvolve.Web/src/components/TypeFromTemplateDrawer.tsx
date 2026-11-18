import { useState } from 'react'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { useReturnFocus } from '../lib/returnFocus'
import { createProjectTypeFromTemplate } from '../projectEntities/api'
import type { TypeTemplate } from '../typeTemplates/types'
import { FormActions } from './FormActions'

/**
 * A game type made from one of the universe's templates (#283). The game gets its own copy: nothing links it back, so
 * editing either side later never reaches the other. The name starts empty and falls back to the template's.
 */
export function TypeFromTemplateDrawer({
  projectId,
  templates,
  onClose,
  onSaved,
}: {
  projectId: string
  templates: TypeTemplate[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  useReturnFocus()

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)
    try {
      await createProjectTypeFromTemplate(projectId, { templateId, name: name.trim() || null })
      onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('projects.schema.fromTemplate.detailsCreate'),
        )
      } else {
        setMessage(t('projects.schema.fromTemplate.failed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      testId="type-from-template-dialog"
      titleId="type-from-template-heading"
      eyebrow={t('projects.schema.title')}
      title={t('projects.schema.fromTemplate.title')}
      isDirty={name.trim() !== ''}
      leaveMessage={t('entityTypes.page.dialog.leaveNew')}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={t('entityTypes.page.dialog.create')}
          busy={isSaving}
          busyLabel={t('entityTypes.page.dialog.creating')}
          disabled={!templateId}
          submitTestId="save-type-from-template"
          onCancel={close}
        />
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="type-from-template-error">
          {message}
        </p>
      ) : null}

      <section className="drawer__group" aria-labelledby="type-from-template-source">
        <h3 className="sectionrule sectionrule--accent" id="type-from-template-source">
          {t('projects.schema.fromTemplate.source')}
        </h3>
        <Field
          label={t('projects.schema.fromTemplate.template')}
          id="type-from-template-select"
          hint={t('projects.schema.fromTemplate.copyHint')}
          error={fieldErrors.templateId}
        >
          {(control) => (
            <select
              {...control}
              className="field__input field__input--select"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              data-testid="type-from-template-select"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {t('projects.schema.fromTemplate.option', {
                    name: template.name,
                    count: String(template.fields.length),
                  })}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('entityTypes.page.dialog.name')}
          name="type-from-template-name"
          placeholder={t('entityTypes.page.dialog.namePlaceholder')}
          dir="auto"
          hint={t('projects.schema.fromTemplate.nameHint')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          data-testid="type-from-template-name"
        />
      </section>
    </Drawer>
  )
}
