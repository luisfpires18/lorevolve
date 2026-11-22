/** The message a field shows: the drawer's own check first, then what the last refused save said about it. */
export function errorOf(
  local: Record<string, string>,
  saved: Record<string, string> | undefined,
  prop: string,
) {
  return local[prop] ?? saved?.[prop]
}
