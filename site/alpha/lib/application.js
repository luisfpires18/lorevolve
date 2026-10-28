// Shared by the Pages Function and its check (application.test.mjs). Turns the posted JSON into the row to store, or says
// which field is wrong. The dialog enforces the same limits; this is the one that counts.

// Bump when the consent wording or privacy.html changes in substance, so every row says what its sender agreed to.
export const PRIVACY_VERSION = '1'

export const PAY_PREFERENCES = ['subscription', 'usage', 'one-time', 'other']

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value, max, required) {
  if (value == null || value === '') return required ? { error: 'required' } : { value: null }
  if (typeof value !== 'string') return { error: 'invalid' }
  const trimmed = value.trim()
  if (!trimmed) return required ? { error: 'required' } : { value: null }
  if (trimmed.length > max) return { error: 'too_long' }
  return { value: trimmed }
}

function price(value) {
  if (value == null || value === '') return { value: null }
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 10000) return { error: 'invalid' }
  return { value: Math.round(number * 100) / 100 }
}

/** `{ row }` ready for the insert, or `{ field, error }` for the first thing wrong. */
export function readApplication(body) {
  if (!body || typeof body !== 'object') return { field: 'body', error: 'invalid' }

  const checks = {
    email: text(body.email, 254, true),
    name: text(body.name, 100, true),
    useCase: text(body.useCase, 1000, true),
    payOther: text(body.payOther, 200, false),
    suggestion: text(body.suggestion, 2000, false),
    priceTooCheap: price(body.priceTooCheap),
    priceTooExpensive: price(body.priceTooExpensive),
  }
  for (const [field, result] of Object.entries(checks)) {
    if (result.error) return { field, error: result.error }
  }
  if (!EMAIL.test(checks.email.value)) return { field: 'email', error: 'invalid' }
  if (body.consent !== true) return { field: 'consent', error: 'required' }

  const pay = body.payPreference ?? null
  if (pay !== null && pay !== '' && !PAY_PREFERENCES.includes(pay)) return { field: 'payPreference', error: 'invalid' }
  const payPreference = pay || null

  return {
    row: {
      email: checks.email.value.toLowerCase(),
      name: checks.name.value,
      useCase: checks.useCase.value,
      payPreference,
      // Only kept when it explains "Something else".
      payOther: payPreference === 'other' ? checks.payOther.value : null,
      priceTooCheap: checks.priceTooCheap.value,
      priceTooExpensive: checks.priceTooExpensive.value,
      suggestion: checks.suggestion.value,
    },
  }
}
