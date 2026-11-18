/** What is chosen on a board: one card, one line, or nothing. */
export type BoardSelection = { kind: 'card'; id: string } | { kind: 'line'; id: string } | null
