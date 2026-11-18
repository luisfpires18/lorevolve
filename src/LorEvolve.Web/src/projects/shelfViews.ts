import { CinemaSagas } from '../components/CinemaSagas'
import { ComicCollections } from '../components/ComicCollections'

/**
 * A second view a shelf can switch to: Sagas and Phases on Cinema (#289), Story Arcs and Events on Comic (#296).
 */
export const VIEWS = {
  sagas: {
    words: 'sagas',
    second: 'sagasView',
    testId: 'cinema',
    secondTestId: 'cinema-view-sagas',
    Body: CinemaSagas,
  },
  arcs: {
    words: 'comics',
    second: 'collectionsView',
    testId: 'comic',
    secondTestId: 'comic-view-collections',
    Body: ComicCollections,
  },
} as const
