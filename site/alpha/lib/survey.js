// Shared by POST /api/survey and its check (survey.test.mjs). The two optional surveys tied to an application: 'signup',
// offered right after it is sent, and 'end', opened from the personal link sent at the end of the alpha. Every answer is
// optional; anything not listed here is refused rather than stored. The dialog (public/app.js) asks the same questions.

// The features both surveys name, by key. Order is the order they are shown in.
export const FEATURES = [
  'lore',
  'types',
  'relations',
  'progression',
  'canonStatus',
  'history',
  'privateNotes',
  'review',
  'knowledge',
  'familyTree',
  'maps',
  'worldRules',
  'canonIntegrity',
  'calendar',
  'stories',
  'plot',
  'timeline',
  'ideas',
  'collaboration',
  'assistant',
  'mcp',
  'publishing',
  'backup',
  'search',
]

const one = (...values) => ({ kind: 'one', values })
const free = (max = 2000) => ({ kind: 'text', max })

export const QUESTIONS = {
  signup: {
    publish: one('all', 'parts', 'no'),
    browse: one('often', 'sometimes', 'no'),
    votes: one('updown', 'up', 'none'),
    brainstorm: one('text', 'board', 'both', 'none'),
    ideasLive: one('universe', 'loose', 'both'),
    invite: one('cowriters', 'reviewers', 'no'),
    ai: one('never', 'search', 'propose'),
    mcpKnew: one('yes', 'no'),
    mcpConnect: one('yes', 'maybe', 'no'),
    interests: { kind: 'pick', values: FEATURES, max: 5 },
    wished: free(),
  },
  end: {
    usefulness: { kind: 'grid', rows: FEATURES, values: ['must', 'nice', 'no', 'untried'] },
    typesEffort: one('freeing', 'right', 'toomuch'),
    progressionMissing: free(),
    timelineAuto: one('birthsDeaths', 'characterEvents', 'everyDate', 'none'),
    mapsWish: free(),
    missMost: free(),
    confused: free(),
    wished: free(),
    payPreference: one('subscription', 'usage', 'one-time', 'other'),
    payOther: free(200),
    priceTooCheap: { kind: 'price' },
    priceTooExpensive: { kind: 'price' },
  },
}

function readAnswer(question, value) {
  switch (question.kind) {
    case 'one':
      return typeof value === 'string' && question.values.includes(value) ? { value } : { error: 'invalid' }
    case 'text': {
      if (typeof value !== 'string') return { error: 'invalid' }
      const trimmed = value.trim()
      if (trimmed.length > question.max) return { error: 'too_long' }
      return { value: trimmed || null }
    }
    case 'pick': {
      if (!Array.isArray(value) || value.length > question.max) return { error: 'invalid' }
      if (!value.every((key) => question.values.includes(key))) return { error: 'invalid' }
      return { value: [...new Set(value)] }
    }
    case 'grid': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'invalid' }
      const kept = {}
      for (const [row, answer] of Object.entries(value)) {
        if (!question.rows.includes(row) || !question.values.includes(answer)) return { error: 'invalid' }
        kept[row] = answer
      }
      return { value: kept }
    }
    case 'price': {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(number) || number < 0 || number > 10000) return { error: 'invalid' }
      return { value: Math.round(number * 100) / 100 }
    }
  }
}

/** `{ answers }` holding only what was answered, or `{ field, error }` for the first thing wrong. */
export function readSurvey(part, body) {
  const questions = QUESTIONS[part]
  if (!questions) return { field: 'part', error: 'invalid' }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { field: 'answers', error: 'invalid' }

  const answers = {}
  for (const [field, value] of Object.entries(body)) {
    const question = questions[field]
    if (!question) return { field, error: 'invalid' }
    if (value == null || value === '') continue
    const result = readAnswer(question, value)
    if (result.error) return { field, error: result.error }
    if (result.value != null) answers[field] = result.value
  }
  // Only kept when it explains "Something else".
  if (answers.payPreference !== 'other') delete answers.payOther
  return { answers }
}
