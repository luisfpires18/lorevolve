# Assistant limits and cost

How the AI assistant's usage limits work, what Groq allows, and how to raise both. Decisions: ADR 0045 (amendments of
2026-10-28), ADR 0047. Checked 2026-10-28; prices and limits are Groq's and can change, so recheck before acting.

## Two layers of limits

1. **Groq's limits** apply to the whole host, shared by every user.
2. **LorEvolve's allowance** applies to each account, so one user cannot spend everyone's share.

## LorEvolve's allowance (per account)

| Kind | Limit | Window |
| --- | --- | --- |
| Questions (normal ask) | 10 | 1 hour |
| Change requests (Propose changes ticked) | 5 | 1 hour |

- Counted per account, across every universe. Each kind has its own window.
- The window starts with the account's first message of that kind. When it ends, all of them come back at once.
- A message counts once it reaches the model, even if the answer fails or times out.
- Not counted: a blank question, a body that is not JSON, a universe the user cannot see, "assistant not set up", a
  message refused for the allowance (429), MCP reads, and a question the line turned away as busy.
- Users see both counts in Profile > Usage > AI Assistant: two meters, what is left, and when a used-up kind comes back.
- Held in the API process's memory: a restart or redeploy resets every count, and a second instance would count on its
  own.

## What happens when a user sends a message

1. Allowance check. Used up: 429 with `Retry-After` and "You've used your N ... for this hour".
2. Counted.
3. **The line (Groq only):** one question goes to Groq at a time for the whole host. The rest wait up to 40 s, then see
   "The assistant is busy right now" and the question is given back.
4. Groq call. A 429 from Groq is retried once after Groq's `Retry-After`, if that is 60 s or less. A daily limit asks for
   longer and is answered busy at once.
5. The whole question may take 180 s. With the 40 s line that stays under App Service's 230 s request limit.

## Groq plans

| | Free | Developer |
| --- | --- | --- |
| `openai/gpt-oss-120b` tokens per minute | 8K | 250K |
| Requests per minute | 30 | 1K |
| Tokens per day | 200K | higher (see the console's limits page) |
| Cost | none | pay per use, no monthly fee listed |

Free tier in practice: about **10 change requests or 25 questions a day for the whole host**. Once the daily tokens are
spent, every user sees "busy" until the next day, even with allowance left.

Your organization's exact limits: console.groq.com > Settings > Limits.

## Cost on the Developer plan

`openai/gpt-oss-120b`: **$0.15 per 1M input tokens, $0.60 per 1M output tokens**. (`gpt-oss-20b` is half that, same
limits, but less reliable with tools: stay on 120b.)

Estimates, from the token counts DEV logged, at about EUR 1 = USD 1.08:

| Unit | Tokens (approx.) | Cost |
| --- | --- | --- |
| One question | 8K in, 1K out | about EUR 0.002 |
| One change request | 20K in, 3K out | about EUR 0.005 |
| 1,000 change requests | | about EUR 5 |
| One user maxing the allowance for an hour (10 + 5) | | about EUR 0.05 |
| Busy user, 50 messages a day, for a month | | about EUR 3 |

## How to raise the limits

### 1. Upgrade Groq (owner only)

1. console.groq.com > Settings > Billing > upgrade to the Developer plan and add a card.
2. Set a monthly spend limit there if the console offers one (for example EUR 10).
3. Nothing changes in Azure: the same key and `Assistant__Groq__Model` keep working.

### 2. Raise LorEvolve's numbers (code change and redeploy)

All in `src/LorEvolve.Api/Features/Assistant/AssistantSetup.cs`:

| Setting | Where | Now | Suggested on Developer |
| --- | --- | --- | --- |
| Questions per window | `AskQuestionsPerWindow` | 10 | 30 |
| Change requests per window | `ProposeQuestionsPerWindow` | 5 | 15 |
| Window length | `QuestionWindow` | 1 hour | 1 hour |
| Groq questions at once (host) | `new AssistantLine(1)` | 1 | 5 |

At the suggested numbers, one user maxing everything costs about EUR 0.14 an hour.

The API tests read these constants and follow them. The Playwright usage spec writes the limits out (10 and 5 in
`usageBody` and `expectUsage`, and the percentages and "left" texts): update
`tests/LorEvolve.E2E/specs/account-usage.spec.ts` to match.

Not built yet: reading these from App Service settings (for example `Assistant__AskPerHour`) so they change without a
redeploy, and a per-user daily cap on top of the hourly one.
