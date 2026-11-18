import { t, tn } from '../i18n'

/**
 * The words a kind of project uses for the same structure. A film is cut into sequences of scenes and a series into
 * seasons of episodes; the rows are the same, so the component is too and only the labels differ (#146).
 *
 * Every key that differs is listed here rather than chosen with a conditional at each use: a label that only one of
 * the two kinds has would otherwise be easy to miss, and `satisfies` makes the two sets provably the same shape.
 */
export const WORDS = {
  seasons: {
    title: () => t('projects.seasons.title'),
    lede: () => t('projects.seasons.lede'),
    empty: () => t('projects.seasons.empty'),
    emptyHint: () => t('projects.seasons.emptyHint'),
    add: () => t('projects.seasons.add'),
    delete: () => t('projects.seasons.delete'),
    noEpisodes: () => t('projects.seasons.noEpisodes'),
    episodeCount: (count: number) => tn('projects.seasons.episodeCount', count),
    addEpisode: () => t('projects.seasons.addEpisode'),
    deleteEpisode: () => t('projects.seasons.deleteEpisode'),
    moveToSeason: () => t('projects.seasons.moveToSeason'),
  },
  volumes: {
    title: () => t('projects.volumes.title'),
    lede: () => t('projects.volumes.lede'),
    empty: () => t('projects.volumes.empty'),
    emptyHint: () => t('projects.volumes.emptyHint'),
    add: () => t('projects.volumes.add'),
    delete: () => t('projects.volumes.delete'),
    noEpisodes: () => t('projects.volumes.noEpisodes'),
    episodeCount: (count: number) => tn('projects.volumes.episodeCount', count),
    addEpisode: () => t('projects.volumes.addEpisode'),
    deleteEpisode: () => t('projects.volumes.deleteEpisode'),
    moveToSeason: () => t('projects.volumes.moveToSeason'),
  },
  sequences: {
    title: () => t('projects.sequences.title'),
    lede: () => t('projects.sequences.lede'),
    empty: () => t('projects.sequences.empty'),
    emptyHint: () => t('projects.sequences.emptyHint'),
    add: () => t('projects.sequences.add'),
    delete: () => t('projects.sequences.delete'),
    noEpisodes: () => t('projects.sequences.noEpisodes'),
    episodeCount: (count: number) => tn('projects.sequences.episodeCount', count),
    addEpisode: () => t('projects.sequences.addEpisode'),
    deleteEpisode: () => t('projects.sequences.deleteEpisode'),
    moveToSeason: () => t('projects.sequences.moveToSeason'),
  },
} as const

export type ProjectStructureWords = keyof typeof WORDS
