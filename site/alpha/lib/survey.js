// Shared by POST /api/survey and its check (survey.test.mjs). The anonymous survey: no name, no email, nothing that
// says who sent it. Every answer is optional; anything not listed here is refused rather than stored. The dialog
// (public/app.js) asks the same questions.

// The features the survey names, by key: the page's feature list, in the same order.
export const FEATURES = [
  'lore',
  'massCreate',
  'types',
  'canonStatus',
  'history',
  'privateNotes',
  'relations',
  'familyTree',
  'progression',
  'knowledge',
  'maps',
  'worldRules',
  'canonIntegrity',
  'calendar',
  'stories',
  'plot',
  'timeline',
  'review',
  'ideas',
  'collaboration',
  'assistant',
  'mcp',
  'backup',
  'search',
  'installApp',
  'publishing',
  'explore',
]

const one = (...values) => ({ kind: 'one', values })
const free = (max = 2000) => ({ kind: 'text', max })

export const QUESTIONS = {
  useCase: free(1000),
  interests: { kind: 'pick', values: FEATURES, max: FEATURES.length },
  wished: free(),
  publish: one('all', 'parts', 'no'),
  browse: one('often', 'sometimes', 'no'),
  votes: one('updown', 'up', 'none'),
  brainstorm: one('text', 'board', 'both', 'none'),
  ideasLive: one('universe', 'loose', 'both'),
  invite: one('cowriters', 'reviewers', 'no'),
  ai: one('never', 'search', 'propose'),
  mcpKnew: one('yes', 'no'),
  mcpConnect: one('yes', 'maybe', 'no'),
  appKind: one('web', 'desktop', 'both'),
  storage: one('cloud', 'local', 'both'),
  payPreference: one('subscription', 'usage', 'one-time', 'other'),
  payOther: free(200),
  priceTooCheap: { kind: 'price' },
  priceTooExpensive: { kind: 'price' },
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
    case 'price': {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(number) || number < 0 || number > 10000) return { error: 'invalid' }
      return { value: Math.round(number * 100) / 100 }
    }
  }
}

/** `{ answers }` holding only what was answered, or `{ field, error }` for the first thing wrong. */
export function readSurvey(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { field: 'answers', error: 'invalid' }

  const answers = {}
  for (const [field, value] of Object.entries(body)) {
    const question = QUESTIONS[field]
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
