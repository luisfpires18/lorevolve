import { useCallback, useState } from 'react'
import {
  createTypeTemplate,
  deleteTypeTemplate,
  listTypeTemplates,
  saveTypeTemplate,
} from '../typeTemplates/api'
import type { TypeTemplate } from '../typeTemplates/types'
import type { ProjectField } from '../projectEntities/types'
import { buildTypeTree, type TreeType } from '../lore/typeTree'
import { useLoadedList } from '../lib/useLoadedList'
import { confirmAction } from '../lib/confirm'
import { EmptyState } from './EmptyState'
import { TypeDialog } from './TypeDialog'
import { t, useI18n } from '../i18n'
import { TemplateRow } from './typeTemplates/TemplateRow'
import { NewButton } from './NewButton'
import { LoadError } from './LoadError'
import { QuietNote } from './QuietNote'

const NO_TYPES = buildTypeTree<TreeType>([])

/**
 * The universe's reusable types (#282). A template is its own thing: editing or deleting one never touches the types
 * of any game, because a game only ever gets a copy. The rows are the Types screen's own rows and the fields panel is
 * the project fields panel, so a template reads like a type and is managed like one.
 */
export function TypeTemplates({ universeId, canEdit }: { universeId: string; canEdit: boolean }) {
  useI18n()
  const [editing, setEditing] = useState<TypeTemplate | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // A field form is open on a template: new, or an existing field being edited.
  const [fieldForm, setFieldForm] = useState<{
    templateId: string
    field: ProjectField | null
  } | null>(null)
  const read = useCallback(
    (signal?: AbortSignal) => listTypeTemplates(universeId, signal),
    [universeId],
  )
  const {
    data: templates,
    failed,
    busy,
    setBusy,
    refresh,
    failing,
  } = useLoadedList(read, t('entityTypes.page.templates.loadFailed'), {
    emptyOnFail: [],
    actionFailed: t('entityTypes.page.templates.actionFailed'),
  })

  async function remove(template: TypeTemplate) {
    const confirmed = await confirmAction({
      title: t('entityTypes.page.templates.deleteTitle'),
      message: t('entityTypes.page.templates.deleteMessage'),
      confirmLabel: t('entityTypes.page.templates.deleteConfirm'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    deleteTypeTemplate(universeId, template.id).then(refresh).catch(failing)
  }

  if (templates === null) {
    return <QuietNote>{t('projects.common.loading')}</QuietNote>
  }

  return (
    <section className="projects" data-testid="type-templates">
      {canEdit ? (
        <div className="types__context">
          <NewButton data-testid="template-new" onClick={() => setEditing('new')}>
            {t('entityTypes.page.templates.new')}
          </NewButton>
        </div>
      ) : null}

      {editing ? (
        <TypeDialog
          tree={NO_TYPES}
          type={editing === 'new' ? null : { ...editing, parentId: null, displayOrder: 0 }}
          noParent
          eyebrow={t('entityTypes.page.templates.eyebrow')}
          nameHint={t('entityTypes.page.templates.nameHint')}
          write={(values) =>
            editing === 'new'
              ? createTypeTemplate(universeId, {
                  name: values.name,
                  description: null,
                  icon: values.icon,
                  accentColor: null,
                  parentId: null,
                })
              : // The route replaces the whole template: what the drawer does not edit goes back as stored.
                saveTypeTemplate(universeId, editing.id, {
                  name: values.name,
                  description: editing.description,
                  icon: values.icon,
                  accentColor: editing.accentColor,
                  parentId: null,
                })
          }
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            refresh()
          }}
        />
      ) : null}

      {failed ? (
        <LoadError message={failed} onRetry={refresh} testId="type-templates-failed" />
      ) : null}

      {templates.length === 0 && !failed ? (
        <EmptyState
          title={t('entityTypes.page.templates.empty')}
          hint={t(
            canEdit
              ? 'entityTypes.page.templates.emptyHint'
              : 'entityTypes.page.templates.emptyHintViewer',
          )}
          testId="type-templates-empty"
        />
      ) : null}

      <ul className="types__list" data-testid="template-list">
        {templates.map((template) => (
          <TemplateRow
            key={template.id}
            universeId={universeId}
            canEdit={canEdit}
            template={template}
            busy={busy}
            setBusy={setBusy}
            setEditing={setEditing}
            openId={openId}
            setOpenId={setOpenId}
            fieldForm={fieldForm}
            setFieldForm={setFieldForm}
            refresh={refresh}
            failing={failing}
            remove={remove}
          />
        ))}
      </ul>
    </section>
  )
}
