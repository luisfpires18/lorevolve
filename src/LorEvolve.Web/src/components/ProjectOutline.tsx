import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { addableLevels, childrenOf } from '../projectEntities/structure'
import { t, useI18n } from '../i18n'
import { levelWord } from '../projectEntities/levelWords'
import { useProjectOutline } from '../projectEntities/useProjectOutline'
import { OutlineBranch } from './projectEntities/OutlineBranch'
import { NodeEditor } from './projectEntities/NodeEditor'
import { NewButton } from './NewButton'
import { PageHeader } from './PageHeader'
import { Section } from './Section'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

/**
 * A project's outline, shaped by the rules its format has (#290): nested types lists, an Add button per level the
 * rules allow, order moved one place at a time like the seasons list, and one node edited at a time in a drawer. Each
 * node is a TypeRow (#456), as a story's arcs, chapters and scenes are; a node that holds others folds them.
 *
 * A project whose format has no rules gets a 404 from the tree read, and `legacy` is drawn instead, unchanged. A
 * formatted project that still has legacy rows shows them below, under "Earlier structure".
 */
export function ProjectOutline({ projectId, legacy }: { projectId: string; legacy: ReactNode }) {
  useI18n()
  const {
    tree,
    hasLegacy,
    failed,
    busy,
    editing,
    setEditing,
    closeEditor,
    refresh,
    failing,
    run,
    add,
    remove,
  } = useProjectOutline({ projectId })

  if (tree === 'none') return <>{legacy}</>

  if (tree === null) {
    return failed ? (
      <FormMessage testId="project-outline-failed">{failed}</FormMessage>
    ) : (
      <QuietNote spacing="flush">{t('projects.common.loading')}</QuietNote>
    )
  }
  const topLevels = addableLevels(tree, null)
  return (
    <>
      <Section testId="project-outline">
        <PageHeader
          level={2}
          size="panel"
          title={t('projects.structure.title')}
          lede={t('projects.structure.lede')}
          actions={
            topLevels.length === 0
              ? null
              : topLevels.map((level) => (
                  <NewButton
                    key={level}
                    disabled={busy}
                    data-testid={`project-node-add-${level}`}
                    onClick={() => add(level, null)}
                  >
                    {t('projects.structure.add', { level: levelWord(level) })}
                  </NewButton>
                ))
          }
        />

        {failed ? <FormMessage testId="project-outline-failed">{failed}</FormMessage> : null}

        {tree.nodes.length === 0 ? (
          <EmptyState
            title={t('projects.structure.empty')}
            hint={t('projects.structure.emptyHint')}
            testId="project-outline-empty"
          />
        ) : null}

        <OutlineBranch
          parentId={null}
          projectId={projectId}
          tree={tree}
          busy={busy}
          setEditing={setEditing}
          run={run}
          add={add}
          remove={remove}
        />
      </Section>

      {editing ? (
        <NodeEditor
          key={editing}
          projectId={projectId}
          nodeId={editing}
          panels={childrenOf(tree, editing).filter((child) => child.level === 'panel')}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor()
            void refresh().catch(failing)
          }}
        />
      ) : null}

      {hasLegacy ? (
        <Section testId="project-outline-earlier">
          <PageHeader
            level={2}
            size="panel"
            title={t('projects.structure.earlier')}
            lede={t('projects.structure.earlierHint')}
          />
          {legacy}
        </Section>
      ) : null}
    </>
  )
}
