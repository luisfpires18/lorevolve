const entityTypesPage = {
  tabs: {
    lore: 'Lore Types',
    groups: 'Groups',
    relations: 'Relation Kinds',
    events: 'Event Kinds & Methods',
  },
  ledes: {
    lore: 'Every entry is one of these. Add your own, nest one inside another to organise Lore, and give each the fields this world actually needs.',
    groups:
      'Types gathered by what they are, in your priority: the order a scene lists its lore in.',
    relations:
      'How entries connect: each kind’s two readings, its Canon constraints and its family meaning.',
    events: 'The event kinds and methods a moment and a world rule’s check can name.',
    gaming: 'Types of {game}. They belong to this game only.',
    templates:
      'Templates belong to this universe. Changing or deleting one never changes the types in your games.',
  },
  context: { label: 'Types for', lore: 'Lore', gaming: 'Gaming', templates: 'Templates' },
  templates: {
    new: 'New template',
    eyebrow: 'Template',
    nameHint: 'Games that already used this template keep their own copy.',
    chip: 'Universe template',
    empty: 'No templates yet.',
    emptyHint:
      'A template is a type you can reuse across games. Make one, give it fields, and copy it into a game when you need it.',
    emptyHintViewer: 'This universe has no templates yet.',
    delete: 'Delete template',
    deleteTitle: 'Delete this template?',
    deleteMessage: 'Existing game types made from it are kept as they are.',
    deleteConfirm: 'Delete template',
    loadFailed: 'The templates could not be loaded.',
    actionFailed: 'That change could not be saved.',
  },
  game: { label: 'Game', loading: 'Loading games…' },
  loadFailed: 'The types could not be loaded.',
  movedToPlace: 'Moved “{name}” to place {place} of {total}.',
  moveFailed: 'That type could not be moved.',
  lifted:
    'Lifted “{name}”, at place {place} of {total} among its siblings. Up and down arrows move it, Space drops it, Escape puts it back.',
  stays: '“{name}” stays at place {place} of {total} among its siblings.',
  carriedAt: '“{name}”: place {place} of {total} among its siblings.',
  putBack: 'Put back. “{name}” stays at place {place} of {total} among its siblings.',
  putBackWhereItWas: 'Put back. “{name}” stays where it was.',
  movedUp: 'Moved “{name}” up.',
  movedDown: 'Moved “{name}” down.',
  deleteTitle: 'Delete the type “{name}”?',
  deleteMessage: 'No entry uses it. This cannot be undone.',
  deleteConfirm: 'Delete type',
  deleted: 'Deleted the type “{name}”.',
  deleteFailed: 'That type could not be deleted.',
  title: 'Types',
  newType: 'New type',
  createdInside: 'Created “{name}” inside “{parent}”.',
  created: 'Created the type “{name}”.',
  saved: 'Saved the type “{name}”.',
  retry: 'Try again',
  reading: 'Reading the types…',
  dnd: {
    instructions:
      'Press Space or Enter to lift this type, the up and down arrows to move it among its siblings, and Space or Enter again to drop it, or Escape to put it back. It never moves to another parent.',
    pickedUp: 'Picked up {name}.',
    aType: 'a type',
    dropped: 'Dropped {name}.',
    theType: 'the type',
    putBack: 'Put back {name}.',
  },
  inside: ', inside {path}',
  groupSuffix: '(group)',
  count: {
    one: '{n} entry',
    other: '{n} entries',
  },
  trashedOne: ', in the Trash',
  trashedAll: ', all in the Trash',
  trashedSome: ', {n} in the Trash',
  orderOf: 'Order of {name}',
  alreadyFirst: 'Already first among its siblings',
  alreadyLast: 'Already last among its siblings',
  addChildLabel: 'Add child type inside {name}',
  addChild: 'Add child',
  editLabel: 'Edit {name}',
  edit: 'Edit',
  fieldsLabel: 'Fields of {name}',
  fields: 'Fields',
  moreActions: 'More actions for {name}',
  addChildType: 'Add child type',
  deleteType: 'Delete type',
  showEntries: 'Show its entries in Lore',
  openTrash: 'Open the Trash',
  nested: {
    one: '+ {n} nested type',
    other: '+ {n} nested types',
  },
  targetedNone:
    '{name} can\'t be deleted because the field "{field}" on {owner} can only link to it. Change those fields to allow another type first.',
  targetedNoneArchived:
    '{name} can\'t be deleted because the field "{field}" (archived) on {owner} can only link to it. Change those fields to allow another type first.',
  targetedOthers: {
    one: '{name} can\'t be deleted because the field "{field}" on {owner} and 1 other field can only link to it. Change those fields to allow another type first.',
    other:
      '{name} can\'t be deleted because the field "{field}" on {owner} and {n} other fields can only link to it. Change those fields to allow another type first.',
  },
  targetedOthersArchived: {
    one: '{name} can\'t be deleted because the field "{field}" (archived) on {owner} and 1 other field can only link to it. Change those fields to allow another type first.',
    other:
      '{name} can\'t be deleted because the field "{field}" (archived) on {owner} and {n} other fields can only link to it. Change those fields to allow another type first.',
  },
  inUse: {
    onlyNested: {
      one: "{name} can't be deleted because it still contains 1 nested type. Move or delete those types first.",
      other:
        "{name} can't be deleted because it still contains {n} nested types. Move or delete those types first.",
    },
    nested: {
      one: '{n} nested type',
      other: '{n} nested types',
    },
    reasonNone: {
      one: "{name} can't be deleted because 1 entry still uses it.",
      other: "{name} can't be deleted because {n} entries still use it.",
    },
    reasonAll: {
      one: "{name} can't be deleted because 1 entry still uses it, and it is in the Trash.",
      other: "{name} can't be deleted because {n} entries still use it, all of them in the Trash.",
    },
    reasonSome: {
      other:
        "{name} can't be deleted because {n} entries still use it, {trashed} of them in the Trash.",
    },
    reasonNestedNone: {
      one: "{name} can't be deleted because 1 entry still uses it, and it still contains {nested}.",
      other:
        "{name} can't be deleted because {n} entries still use it, and it still contains {nested}.",
    },
    reasonNestedAll: {
      one: "{name} can't be deleted because 1 entry still uses it, and it is in the Trash, and it still contains {nested}.",
      other:
        "{name} can't be deleted because {n} entries still use it, all of them in the Trash, and it still contains {nested}.",
    },
    reasonNestedSome: {
      other:
        "{name} can't be deleted because {n} entries still use it, {trashed} of them in the Trash, and it still contains {nested}.",
    },
    fixOne: 'Move it to another type first.',
    fixOneTrashed: 'Restore it from the Trash, then move it to another type.',
    fixMany: 'Move them to another type first.',
    fixManyTrashed:
      'Move them to another type first; an entry in the Trash has to be restored before it can be moved.',
    tail: {
      one: 'Move or delete that type too.',
      other: 'Move or delete those types too.',
    },
  },
  dialog: {
    leaveEdit: 'Your changes to “{name}” have not been saved. Leave without saving them?',
    leaveNew: 'This type has not been created. Leave without saving it?',
    nameRequired: 'Give the type a name.',
    detailsSave: 'Some details need a change before this can be saved.',
    detailsCreate: 'Some details need a change before this can be created.',
    saveFailed: 'That type could not be saved.',
    createFailed: 'That type could not be created.',
    eyebrow: 'Lore Types',
    editTitle: 'Edit type',
    newChildTitle: 'New child type',
    newTitle: 'New type',
    inside: 'Inside {name}',
    identity: 'Identity',
    name: 'Name',
    namePlaceholder: 'Insert a name',
    iconHint:
      'Optional, and only a picture: it marks the type on the Lore filter. Nothing is chosen for you from the name.',
    hierarchy: 'Hierarchy',
    parent: 'Parent type',
    parentNone: 'None (a top-level type)',
    parentHint:
      'Organises Lore: choosing a type there shows the entries of the types inside it too. A nested type inherits the fields of every type above it; each field is edited on its own type.',
    behaviour: 'Behaviour',
    familyLabel: 'Family Tree',
    familyText: 'Entries of this type can appear in Family Tree',
    saving: 'Saving…',
    saveChanges: 'Save',
    creating: 'Adding…',
    create: 'Add type',
  },
}

export default entityTypesPage
