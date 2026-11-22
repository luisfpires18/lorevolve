import { useState } from 'react'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { useFormSave } from '../lib/useFormSave'
import { createProjectTypeFromTemplate } from '../projectEntities/api'
import type { TypeTemplate } from '../typeTemplates/types'
import { SectionTitle } from './Section'

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
  const form = useFormSave({
    needChange: t('projects.schema.fromTemplate.detailsCreate'),
    failed: t('projects.schema.fromTemplate.failed'),
  })
  const { fieldErrors, message, isSaving } = form

  async function save() {
    await form.save(async () => {
      await createProjectTypeFromTemplate(projectId, { templateId, name: name.trim() || null })
      onSaved()
    })
  }

  return (
    <Drawer
      testId="type-from-template-dialog"
      titleId="type-from-template-heading"
      eyebrow={t('projects.schema.title')}
      title={t('projects.schema.fromTemplate.title')}
      isDirty={name.trim() !== ''}
      leaveMessage={t('entityTypes.page.dialog.leaveNew')}
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      message={message}
      messageTestId="type-from-template-error"
      actions={{
        submitLabel: t('entityTypes.page.dialog.create'),
        busyLabel: t('entityTypes.page.dialog.creating'),
        disabled: !templateId,
        submitTestId: 'save-type-from-template',
      }}
    >
      <section className="drawer__group" aria-labelledby="type-from-template-source">
        <SectionTitle level={3} tone="rule-accent" id="type-from-template-source">
          {t('projects.schema.fromTemplate.source')}
        </SectionTitle>
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
