import { useState } from 'react'
import { Library } from 'lucide-react'
import type { Chronology } from '../chronology/types'
import { useI18n } from '../i18n'
import type { Scene } from '../stories/types'
import type { Mention } from '../lore/mentions'
import { LoreContextDrawer } from './lore/LoreContextDrawer'
import { Button } from './Button'

export interface LoreContextProps {
  universeId: string
  storyId: string
  /** The open scene, as the story page holds it. Its `entities` are the scene's linked lore (`SceneEntityLinks`). */
  scene: Scene
  chronology: Chronology
  /** The @ mentions in the prose as it stands in the editor, saved or not (issue 31), in order. */
  mentions: Mention[]
  /** A link or unlink was saved: the story page shows the scene the API answered with. */
  onSceneSaved: (scene: Scene) => void
  /** The scene changed somewhere else: the story is read again. */
  onSceneChanged: () => void
}

/**
 * Lore Context (task 048): the lore a scene links, a search for more, and a short preview of any of it, in the drawer
 * every LorEvolve form uses, opened beside the manuscript without leaving it. The prose is untouched: the drawer reads and
 * writes only the scene's links, through the scene's own save, so the manuscript's draft, recovery copy and leave
 * question carry on underneath exactly as they were.
 *
 * Since issue 31 it also lists the prose's @ mentions, each once, with its entry's current name and a preview, and its own
 * optional "Add to this scene's Lore": a mention never links anything by itself, and one already linked offers nothing.
 */
export function LoreContext(props: LoreContextProps) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        tone="text"
        icon={Library}
        className="loretrigger"
        aria-haspopup="dialog"
        title={t('lore.context.triggerTitle')}
        onClick={() => setIsOpen(true)}
        data-testid="lore-context-trigger"
      >
        <span className="loretrigger__label">{t('lore.context.triggerLabel')}</span>
      </Button>

      {isOpen ? <LoreContextDrawer {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}
