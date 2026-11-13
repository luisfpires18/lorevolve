import type { ImageCrop } from '../lib/imageCrop'
import { t } from '../i18n'
import type publishing from '../i18n/en/publishing'

/** Mirrors `UniverseVisibility`. Private until its owner publishes it (ADR 0036). */
export const Visibility = {
  Private: 0,
  Public: 1,
} as const

export type VisibilityValue = (typeof Visibility)[keyof typeof Visibility]

/** Mirrors `UniverseCategory`: what kind of creative property a universe belongs to. Numbered from 1. */
export const Category = {
  Original: 1,
  MoviesAndTv: 2,
  Games: 3,
  Books: 4,
  Comics: 5,
  TabletopAndRpg: 6,
  Audio: 7,
  Other: 8,
} as const

export type CategoryValue = (typeof Category)[keyof typeof Category]

/**
 * The categories in the order they are offered, with the words they are shown in. No enum name is ever shown.
 * `key` is how Explore's address and the public API name one - the API derives the same keys from its enum.
 */
export const CATEGORIES: { value: CategoryValue; key: keyof typeof publishing.categories }[] = [
  { value: Category.Original, key: 'original' },
  { value: Category.MoviesAndTv, key: 'movies-and-tv' },
  { value: Category.Games, key: 'games' },
  { value: Category.Books, key: 'books' },
  { value: Category.Comics, key: 'comics' },
  { value: Category.TabletopAndRpg, key: 'tabletop-and-rpg' },
  { value: Category.Audio, key: 'audio' },
  { value: Category.Other, key: 'other' },
]

/** Mirrors `UniverseGenres`: one bit each, and the one order they are always listed in. */
export const Genre = {
  Fantasy: 1,
  ScienceFiction: 2,
  Adventure: 4,
  Horror: 8,
  Mystery: 16,
  Historical: 32,
  Romance: 64,
  Thriller: 128,
  Supernatural: 256,
  PostApocalyptic: 512,
  Contemporary: 1024,
  Other: 2048,
} as const

export type GenreValue = (typeof Genre)[keyof typeof Genre]

export const GENRES: { value: GenreValue; key: keyof typeof publishing.genres }[] = [
  { value: Genre.Fantasy, key: 'fantasy' },
  { value: Genre.ScienceFiction, key: 'science-fiction' },
  { value: Genre.Adventure, key: 'adventure' },
  { value: Genre.Horror, key: 'horror' },
  { value: Genre.Mystery, key: 'mystery' },
  { value: Genre.Historical, key: 'historical' },
  { value: Genre.Romance, key: 'romance' },
  { value: Genre.Thriller, key: 'thriller' },
  { value: Genre.Supernatural, key: 'supernatural' },
  { value: Genre.PostApocalyptic, key: 'post-apocalyptic' },
  { value: Genre.Contemporary, key: 'contemporary' },
  { value: Genre.Other, key: 'other' },
]

export function categoryLabel(value: CategoryValue) {
  const key = CATEGORIES.find((category) => category.value === value)?.key
  return key ? t(`publishing.categories.${key}`) : ''
}

/** A genre's address key, which is also what its chip is tinted by. */
export function genreKey(value: GenreValue) {
  return GENRES.find((genre) => genre.value === value)?.key
}

export function genreLabel(value: GenreValue) {
  const key = GENRES.find((genre) => genre.value === value)?.key
  return key ? t(`publishing.genres.${key}`) : ''
}

/** Mirrors `PublicationLimits`. */
export const PUBLIC_SUMMARY_MAX = 300
export const MAX_GENRES = 3
export const PUBLIC_NAME_MAX = 60
export const ORIGINAL_CREATOR_MAX = 120
export const ORIGINAL_WORK_MAX = 200

/**
 * What publishing needs, in the order Settings lists it, keyed as the API reports a missing one. The words
 * are the checklist's, read with `requirementLabel`; the API's own sentence is what a refusal shows.
 */
export const REQUIREMENTS = [
  { key: 'publicSummary' },
  { key: 'category' },
  { key: 'genres' },
  { key: 'artwork' },
  { key: 'publicDisplayName' },
] as const

export function requirementLabel(key: (typeof REQUIREMENTS)[number]['key']) {
  return t(`universe.requirements.${key}`)
}

export interface UniverseArtworkRef {
  assetId: string
  cardId: string
  width: number
  height: number
  contentType: string
  fileName: string | null
  byteSize: number
  uploadedAt: string
  crop: ImageCrop
}

/** One universe's public face, as its owner sees it in Settings. */
export interface PublicationState {
  name: string
  visibility: VisibilityValue
  publicSummary: string | null
  category: CategoryValue | null
  genres: GenreValue[]
  publicSlug: string | null
  publishedAt: string | null
  authorDisplayName: string | null
  artwork: UniverseArtworkRef | null
  /** What publishing still needs, keyed as `REQUIREMENTS`. Empty when it may be published. */
  missing: Record<string, string[]>
  /**
   * Who created the work this universe is based on (ADR 0039), or null for a world of the author's own. The author is
   * then its curator on LorEvolve, never its creator.
   */
  originalCreator: string | null
  originalWork: string | null
}

/**
 * The lore entries publishing a universe would make public, read fresh for its owner's confirmation (Issue #47): a private
 * universe's entry pages do not show that choice, so this is where the owner reviews it. `items` are by name, at most 100;
 * `totalCount` counts them all.
 */
export interface SelectedLore {
  totalCount: number
  items: { id: string; name: string; typeName: string }[]
}

/** What Publish everything would select now: Canon lore, Complete stories with their scenes, and stories it skips. */
export interface PublishEverythingPreview {
  lore: { id: string; name: string; typeName: string }[]
  stories: { id: string; title: string; scenes: number }[]
  skippedStories: { id: string; title: string }[]
}

export interface PublishEverythingResult {
  lore: number
  stories: number
  scenes: number
}

export interface PublicationDetails {
  publicSummary: string | null
  category: CategoryValue | null
  genres: GenreValue[]
  /** True: based on someone else's work, and `originalCreator` is required. False: the author's own; both cleared. */
  basedOnExternalWork: boolean
  originalCreator: string | null
  originalWork: string | null
}

/** The ratio the card is framed at, 16:10 - the server's `ImageFrame.Card`. */
export const CARD_ASPECT = 16 / 10

/**
 * One lore entry's or story's publication, as its owner sees it (Task 010). `visibility` is the author's selection
 * (the same numbers as `Visibility`); the item is public to anyone exactly when it is `Public` and
 * `universeIsPublic` is true - a private universe hides everything in it without clearing the selection.
 */
export interface ContentPublicationState {
  visibility: VisibilityValue
  publicSlug: string | null
  publishedAt: string | null
  universeIsPublic: boolean
  /**
   * A story's public summary (Task 011), written for readers and never taken from its premise; a story needs one to be
   * published, and one selected without it stays hidden. Always null for a lore entry.
   */
  publicSummary: string | null
}

/** Which kind of item a publication control is for - they share one control and one set of routes. */
export type ContentKind = 'entry' | 'story'

/**
 * One part of a story - a scene's outline, a scene's prose, a plot arc - as its owner sees its publication (ADR 0039). It
 * is public to anyone exactly when `visibility` is `Public` and its story is public (selected, summarised, in a public
 * universe). A part has no address: it is read on its story's page.
 */
export interface StoryPartPublicationState {
  visibility: VisibilityValue
  storyIsPublic: boolean
}

export type StoryPartKind = 'scene' | 'manuscript' | 'arc'

/** The signed-in account's public author page, as its owner manages it (ADR 0037). */
export interface PublicAuthorSettings {
  /** The page's address once the first universe is published; null before. */
  authorSlug: string | null
  /** Whether the page resolves now: it does only while one of the account's universes is public. */
  hasPublicWorld: boolean
  hasPhoto: boolean
  /** Whether the owner chose to show their photo there. Replacing the photo turns this off again. */
  photoIsPublic: boolean
}
