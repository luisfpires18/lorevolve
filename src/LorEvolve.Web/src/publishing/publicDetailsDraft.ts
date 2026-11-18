import {
  GENRES,
  type CategoryValue,
  type GenreValue,
  type PublicationDetails,
  type PublicationState,
} from './types'

/** Whether a universe says it is based on someone else's work, and whose (ADR 0039), as the form holds it. */
export interface Attribution {
  based: boolean
  creator: string
  work: string
}

export function attributionOf(state: PublicationState): Attribution {
  return {
    based: state.originalCreator !== null,
    creator: state.originalCreator ?? '',
    work: state.originalWork ?? '',
  }
}

/**
 * The details as a save sends them: trimmed, blank as none, genres in their one order. A world of the author's own sends
 * no attribution at all, so nothing typed before the box was unticked is stored or published.
 */
export function detailsOf(
  summary: string,
  category: string,
  genres: GenreValue[],
  attribution: Attribution,
): PublicationDetails {
  return {
    publicSummary: summary.trim() || null,
    category: category === '' ? null : (Number(category) as CategoryValue),
    genres: GENRES.map((genre) => genre.value).filter((value) => genres.includes(value)),
    basedOnExternalWork: attribution.based,
    originalCreator: attribution.based ? attribution.creator.trim() || null : null,
    originalWork: attribution.based ? attribution.work.trim() || null : null,
  }
}
