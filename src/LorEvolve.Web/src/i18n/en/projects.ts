import projectsComics from './projects/comics'
import projectsSagas from './projects/sagas'
import projectsSchema from './projects/schema'
import projectsSeasons from './projects/seasons'
import projectsScript from './projects/script'
import projectsStructure from './projects/structure'
import projectsPages from './projects/pages'
import projectsEntries from './projects/entries'

/** Creative projects: the novels, games, series, films and comics an author is making (#138, #139). */
const projects = {
  cover: {
    tooBig: 'Pictures must be {mb} MB or smaller.',
    removeFailed: 'The cover could not be removed.',
    cardAlt: 'The cover as the game card shows it',
    empty: 'No cover yet',
    replace: 'Replace cover',
    upload: 'Upload cover',
    editFraming: 'Edit framing',
    editFramingTitle: 'Edit framing',
    frameTitle: 'Frame the cover',
    saveFraming: 'Save',
    confirmUpload: 'Upload',
    updatingCard: 'Updating cover',
    processing: 'Processing picture',
    cropHint:
      'Drag the picture to place the frame, or select it and use the arrow keys. The whole picture is kept; the frame is what the card shows.',
    removing: 'Removing…',
    remove: 'Remove cover',
    hint: 'One wide picture, framed 16:10 for the game card. JPEG, PNG or WebP, up to 8 MB.',
    hintPublic: 'One wide picture, framed 16:10 for the game card. JPEG, PNG or WebP, up to 8 MB.',
  },
  /*
   * The words every project panel shares (#184). One "Loading" rather than four sentences that say the same thing
   * about four different panels, one name for cancelling a form, and one name for a row's menu and its move items.
   */
  common: {
    loading: 'Loading',
    cancel: 'Cancel',
    more: 'More actions for {name}',
    moveUp: 'Move up',
    moveDown: 'Move down',
    done: 'Done',
    addPicture: 'Add picture',
    changePicture: 'Change picture',
  },
  shelf: {
    moved: '“{name}” is now {n} of {total}.',
    moveFailed: 'That project could not be moved. Try again.',
  },
  comics: projectsComics,
  sagas: projectsSagas,
  nav: {
    all: 'All projects',
    new: 'New project',
  },
  sections: {
    structure: 'Structure',
    manuscript: 'Manuscript',
    entities: 'Entities',
    types: 'Types',
    systems: 'Systems',
    ideas: 'Ideas',
  },
  tabs: {
    label: 'Project views',
  },
  view: {
    empty: 'Nothing in this view yet.',
    emptyHint: 'This view will fill as the project gains what belongs here.',
  },
  ideas: {
    ownerOnly: "Ideas here are the universe owner's.",
    ownerOnlyHint:
      'An idea belongs to the account that keeps it, so only the owner of this universe keeps ideas for its projects.',
  },
  kind: {
    writing: 'Writing',
    game: 'Game',
    series: 'Series',
    film: 'Film',
    comic: 'Comic',
  },
  format: {
    'feature-film': 'Feature Film / Movie',
    'short-film': 'Short Film',
    special: 'Special',
    trailer: 'Trailer',
    'tv-show': 'TV Show',
    'limited-series': 'Limited Series',
    'western-comic': 'Western Comic',
    manga: 'Manga',
    'graphic-novel': 'Graphic Novel',
    'one-shot': 'One-shot',
    webcomic: 'Webcomic / Webtoon',
    unset: 'Format not set',
  },
  lifecycle: {
    planning: 'Planning',
    active: 'Active',
    complete: 'Complete',
    archived: 'Archived',
  },
  list: {
    title: 'Projects',
    lede: 'What you are making in this universe.',
    loading: 'Reading your projects.',
    failed: 'Your projects could not be read.',
    empty: 'No projects yet.',
    emptyHint: 'A project is what you are making: a novel, a game, a series, a film or a comic.',
    emptyWriting: 'No writing projects yet.',
    emptyGame: 'No game projects yet.',
    emptyCinema: 'No film or series projects yet.',
    emptyComic: 'No comic projects yet.',
    emptyCategoryHint: 'Use New project to start one in this universe.',
  },
  gameEntities: {
    lede: 'The categories of this game, each with the entries it holds.',
    back: 'Game Entities',
    notFound: 'This game is not in this universe.',
    notFoundHint: 'Go back to Game Entities and pick one of its games.',
    entity: {
      loading: 'Reading this entity.',
      failed: 'This entity could not be read.',
      notFound: 'This entity could not be found.',
      notFoundHint: 'It may have been deleted, or it is not part of this game.',
      backToGame: 'Back to the game',
      noImage: 'No image yet',
      noDescription: 'No description yet.',
      imageAlt: 'Picture of {name}',
      fields: 'Fields',
      edit: 'Edit',
      editTitle: 'Edit this entity',
      noValue: 'No value yet',
      noFields: 'This type has no fields yet.',
      fieldImageAlt: 'Picture for {name}',
    },
  },
  directory: {
    lede: 'Pick a kind of project to see what you are making in this universe.',
    none: 'No projects yet',
    count: { one: '1 project', other: '{n} projects' },
    loadFailed: 'Your projects could not be counted.',
  },
  one: {
    title: 'Project',
    loading: 'Reading this project.',
    failed: 'This project could not be read.',
    missing: 'This project is not here.',
    missingHint: 'It may have been removed, or it belongs to another account.',
  },
  schema: projectsSchema,
  seasons: projectsSeasons,
  sequences: {
    title: 'Sequences',
    lede: 'The stretches this film is cut into, and the scenes in them.',
    empty: 'No sequences yet.',
    emptyHint: 'A sequence groups scenes, such as an act or a set piece.',
    add: 'Add sequence',
    delete: 'Delete sequence',
    noEpisodes: 'No scenes yet.',
    episodeCount: {
      one: '1 scene',
      other: '{count} scenes',
    },
    addEpisode: 'Add scene',
    deleteEpisode: 'Delete scene',
    moveToSeason: 'Move to',
  },
  script: projectsScript,
  structure: projectsStructure,
  volumes: {
    title: 'Volumes',
    lede: 'The volumes this comic is collected in, and the chapters in them.',
    empty: 'No volumes yet.',
    emptyHint: 'A volume collects chapters, such as a book or an arc.',
    add: 'Add volume',
    delete: 'Delete volume',
    noEpisodes: 'No chapters yet.',
    episodeCount: {
      one: '1 chapter',
      other: '{count} chapters',
    },
    addEpisode: 'Add chapter',
    deleteEpisode: 'Delete chapter',
    moveToSeason: 'Move to',
  },
  pages: projectsPages,
  entities: {
    title: 'Entities',
    lede: 'What this project holds, by type. Open a type to see its entries.',
    manage: 'Manage types',
  },
  entries: projectsEntries,
  new: {
    cinema: 'Cinema',
    title: 'New project',
    name: 'Name',
    kind: 'What kind of work is it?',
    format: 'Format',
    summary: 'Summary',
    save: 'Create project',
    saving: 'Creating…',
    failed: 'The project could not be created.',
    needsUniverse: 'A project belongs to a universe.',
    needsUniverseHint:
      'Open the universe this work belongs to and make the project there. A universe can hold very little worldbuilding and still be the place a project lives.',
    chooseUniverse: 'Choose a universe',
  },
}

export default projects
