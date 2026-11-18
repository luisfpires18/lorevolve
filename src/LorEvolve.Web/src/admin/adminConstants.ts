// A cell with nothing to show. These stay symbols so the check never depends on the words, which change with the language.
export const NOT_TRACKED = Symbol('not tracked')
export const NOT_RECORDED = Symbol('not recorded')

// Wire values from the server, mapped to the words they show as.
export const ROLE_KEYS = {
  Member: 'admin.role.member',
  Admin: 'admin.role.admin',
} as const
