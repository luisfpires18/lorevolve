import { t } from '../i18n'

/**
 * The words for each structure level (#290). The only part of the outline a later format issue grows: #291 adds
 * season and episode, #292 segment and shot, #294 issue, chapter, page and panel. An unknown level shows its own word.
 */
const LEVEL_WORDS: Record<string, () => string> = {
  season: () => t('projects.structure.levels.season'),
  episode: () => t('projects.structure.levels.episode'),
  act: () => t('projects.structure.levels.act'),
  sequence: () => t('projects.structure.levels.sequence'),
  scene: () => t('projects.structure.levels.scene'),
  beat: () => t('projects.structure.levels.beat'),
  issue: () => t('projects.structure.levels.issue'),
  chapter: () => t('projects.structure.levels.chapter'),
  page: () => t('projects.structure.levels.page'),
  panel: () => t('projects.structure.levels.panel'),
}

export const levelWord = (level: string) => LEVEL_WORDS[level]?.() ?? level

export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const nameOf = (node: { level: string; title: string | null }) =>
  node.title ?? capital(t('projects.structure.untitled', { level: levelWord(node.level) }))
