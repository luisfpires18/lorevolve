import { CANON_LABELS, CANON_ORDER, type CanonStatusValue, type EntityType } from './types'

/**
 * The most entries one mass create writes. Mirrors `EntityEndpoints.MassCreateMaxEntries` on the API, which refuses a
 * longer batch whole; checked here first so a paste that is too long is never half taken.
 */
export const MASS_CREATE_MAX = 100

/** Mirrors `LoreLimits.NameMaxLength`. */
export const NAME_MAX_LENGTH = 160

/**
 * One row waiting to be created. `typeId` is null when a pasted type named none of this universe's types, and `status`
 * when a pasted status was not Idea, Draft or Canon: the words the author pasted are kept beside them, so the row can say
 * exactly what needs fixing instead of guessing.
 */
export interface MassRow {
  key: number
  typeId: string | null
  typeText: string
  name: string
  status: CanonStatusValue | null
  statusText: string
  /** Whether a missing name is worth saying yet: always for a pasted row, after the author has been in it for one added by hand. */
  touched: boolean
}

export type MassRowInput = Omit<MassRow, 'key'>

export interface MassDefaults {
  typeId: string
  status: CanonStatusValue
}

export type PasteResult =
  { kind: 'rows'; rows: MassRowInput[] } | { kind: 'refused'; message: string }

const ACCEPTED_SHAPES =
  'Paste one name per line, or three columns separated by tabs, in the order Type, Name, Status.'

/** Whether a type can take a name-only entry: a required field is something a mass create cannot fill. */
export const hasRequiredFields = (type: EntityType) => type.fields.some((field) => field.isRequired)

const folded = (text: string) => text.trim().toLocaleLowerCase()

const columns = (count: number) => (count === 1 ? 'one column' : `${count} columns`)

/**
 * Reads what was pasted - one name per line, or a spreadsheet's Type, Name, Status separated by tabs - into rows.
 *
 * Deterministic on purpose. A paste is one shape or it is refused whole: one column is names and takes the defaults;
 * three columns are Type, Name, Status in that order, each matched exactly, ignoring case, and never guessed. Two
 * columns cannot be told apart - a type and a name, or a name and a status - so they are refused rather than read the
 * wrong way. Commas are part of a name. Blank lines are skipped, and every cell is trimmed and otherwise kept exactly as
 * written. A first line that reads Type, Name, Status is a spreadsheet's own header, and is skipped.
 */
export function readPaste(text: string, types: EntityType[], defaults: MassDefaults): PasteResult {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((line, index) => ({ number: index + 1, cells: line.split('\t') }))
    .filter((line) => line.cells.some((cell) => cell.trim() !== ''))

  if (lines.length === 0) return { kind: 'rows', rows: [] }

  const width = lines[0].cells.length
  const odd = lines.find((line) => line.cells.length !== width || (width !== 1 && width !== 3))
  if (odd) {
    const count = odd.cells.length
    return {
      kind: 'refused',
      message:
        count === 2
          ? `Line ${odd.number} has two columns, which could be read more than one way. ${ACCEPTED_SHAPES}`
          : count === width
            ? `Line ${odd.number} has ${columns(count)}. ${ACCEPTED_SHAPES}`
            : `Line ${odd.number} has ${columns(count)} but line ${lines[0].number} has ${columns(width)}. ${ACCEPTED_SHAPES}`,
    }
  }

  if (width === 1) {
    return {
      kind: 'rows',
      rows: lines.map((line) => ({
        typeId: defaults.typeId,
        typeText: '',
        name: line.cells[0].trim(),
        status: defaults.status,
        statusText: '',
        touched: true,
      })),
    }
  }

  const [first] = lines
  const isHeader =
    folded(first.cells[0]) === 'type' &&
    folded(first.cells[1]) === 'name' &&
    folded(first.cells[2]) === 'status'

  return {
    kind: 'rows',
    rows: (isHeader ? lines.slice(1) : lines).map(({ cells: [type, name, status] }) => ({
      typeId: types.find((candidate) => folded(candidate.name) === folded(type))?.id ?? null,
      typeText: type.trim(),
      name: name.trim(),
      status:
        CANON_ORDER.find((candidate) => folded(CANON_LABELS[candidate]) === folded(status)) ?? null,
      statusText: status.trim(),
      touched: true,
    })),
  }
}

export type RowField = 'name' | 'type' | 'status'

/**
 * One thing wrong with a row, as a sentence of LorEvolve's own. `subject` is words an author wrote - a pasted type or
 * status, a type's name - drawn quoted and isolated between `before` and `after`.
 */
export interface RowProblem {
  field: RowField
  before: string
  subject?: string
  after: string
}

/** What stops this row from being created, in the order the row reads. Empty when it is ready. */
export function rowProblems(row: MassRow, typesById: Map<string, EntityType>): RowProblem[] {
  const problems: RowProblem[] = []
  const type = row.typeId === null ? undefined : typesById.get(row.typeId)

  const name = row.name.trim()
  if (name === '') {
    problems.push({ field: 'name', before: 'Name is required.', after: '' })
  } else if (name.length > NAME_MAX_LENGTH) {
    problems.push({
      field: 'name',
      before: `Keep the name under ${NAME_MAX_LENGTH} characters.`,
      after: '',
    })
  }

  if (!type) {
    problems.push(
      row.typeText
        ? {
            field: 'type',
            before: 'Unknown type ',
            subject: row.typeText,
            after: '. Choose one of this world’s types.',
          }
        : { field: 'type', before: 'Choose a type.', after: '' },
    )
  } else if (hasRequiredFields(type)) {
    problems.push({
      field: 'type',
      before: 'The type ',
      subject: type.name,
      after: ' has required fields. Create this entry on its own.',
    })
  }

  if (row.status === null) {
    problems.push(
      row.statusText
        ? {
            field: 'status',
            before: 'Unknown status ',
            subject: row.statusText,
            after: '. Use Idea, Draft or Canon.',
          }
        : { field: 'status', before: 'Choose a status.', after: '' },
    )
  }

  return problems
}

/** The row field a server problem key names: `entries[3].name`, `entries[3].entitytypeid`, `entries[3].canonstatus`. */
export function fieldOfKey(key: string): RowField {
  return key.endsWith('.entitytypeid') ? 'type' : key.endsWith('.canonstatus') ? 'status' : 'name'
}

/**
 * For each row repeating an earlier row's type and name, the earlier row's number. A warning, never a refusal: names
 * are not unique in LorEvolve and two entries may share one, but the same row twice in one paste is usually a paste made
 * twice. Only this batch is compared - the universe's own entries are not a uniqueness rule.
 */
export function repeatedRows(rows: MassRow[]): Map<number, number> {
  const firstAt = new Map<string, number>()
  const repeats = new Map<number, number>()

  rows.forEach((row, index) => {
    const name = folded(row.name).replace(/\s+/g, ' ')
    if (row.typeId === null || name === '') return
    const key = `${row.typeId}\u0000${name}`
    const earlier = firstAt.get(key)
    if (earlier === undefined) firstAt.set(key, index)
    else repeats.set(row.key, earlier + 1)
  })

  return repeats
}
