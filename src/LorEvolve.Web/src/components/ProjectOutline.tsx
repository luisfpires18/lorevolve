import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { childrenOf } from '../projectEntities/structure'
import { t, useI18n } from '../i18n'
import { useProjectOutline } from '../projectEntities/useProjectOutline'
import { OutlineAddButtons } from './projectEntities/OutlineAddButtons'
import { OutlineBranch } from './projectEntities/OutlineBranch'
import { NodeEditor } from './projectEntities/NodeEditor'

/**
 * A project's outline, shaped by the rules its format has (#290): nested ordered lists, an Add button per level the
 * rules allow, order moved one place at a time like the seasons list, and one node edited at a time in a drawer. It is
 * drawn in the Stories look (#377): top nodes as arcs, nested groups as chapters, and a level with nothing under it as
 * scene cards.
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
      <p role="alert" data-testid="project-outline-failed">
        {failed}
      </p>
    ) : (
      <p className="projectcard__meta">{t('projects.common.loading')}</p>
    )
  }
  return (
    <>
      <section className="projects" data-testid="project-outline">
        <header className="projects__head">
          <div className="projects__headtext">
            <h2 className="sectionrule">{t('projects.structure.title')}</h2>
            <p className="projects__lede">{t('projects.structure.lede')}</p>
          </div>
          <OutlineAddButtons parent={null} tree={tree} busy={busy} add={add} />
        </header>

        {failed ? (
          <p role="alert" data-testid="project-outline-failed">
            {failed}
          </p>
        ) : null}

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
      </section>

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
        <section className="projects" data-testid="project-outline-earlier">
          <header className="projects__head">
            <div className="projects__headtext">
              <h2 className="sectionrule">{t('projects.structure.earlier')}</h2>
              <p className="projects__lede">{t('projects.structure.earlierHint')}</p>
            </div>
          </header>
          {legacy}
        </section>
      ) : null}
    </>
  )
}
