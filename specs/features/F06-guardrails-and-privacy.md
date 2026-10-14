# F06: Guardrails, policy and privacy

Covers: FR-SEC-1 to FR-SEC-6, FR-CONV-7 (limits), NFR-SEC-1, NFR-SEC-3 to NFR-SEC-5, NFR-PRIV-1.

## Problem and outcome

The model reads text from users and can be manipulated. Safety must not depend on the model behaving. Outcome: a policy engine with a fixed decision table, a closed tool registry, data minimization toward the model, redaction of personal data everywhere it could leak, an output guard, and abuse limits.

## Policy engine

A pure function `decide(principal, interpretation, state) -> ALLOW | CLARIFY(slot) | NEEDS_CONFIRMATION | DENY(reason)`.

| Intent | Rule |
|---|---|
| `CHECK_BALANCE` | ALLOW |
| `LIST_TRANSACTIONS` | ALLOW; limit clamped to 50; range over 366 days gives CLARIFY |
| `TRANSACTION_STATUS` | ALLOW when a reference or "last" is present, else CLARIFY |
| `TRANSFER_MONEY` | CLARIFY when amount or recipient is missing, ambiguous or mismatched (F03); DENY with reason when limits or funds fail; otherwise NEEDS_CONFIRMATION after prepare |
| `NAVIGATE` | ALLOW if the screen is allowlisted, else DENY |
| `FAQ_SUPPORT` | ALLOW |
| `CREATE_TICKET` | ALLOW within the ticket rate limit |
| `SMALL_TALK`, `OUT_OF_SCOPE` | ALLOW (templates) |
| anything else, any role other than customer | DENY |

Each decision is audited when it leads to a tool call or a denial.

## Tool registry

Exactly seven tools (F04, F05). No tool accepts a user id, role or principal. No tool exists for confirming or cancelling a transfer on the model path; those happen only through the deterministic path and the API. The registry validates inputs with Zod and rejects unknown fields and unknown tools.

## Prompt-injection defenses (layered)

1. The model's output is parsed against a closed schema; free text from the model is never executed or interpreted as commands.
2. Data minimization: prompts contain the system prompt, the user's own recent messages, pending clarification context, and curated KB snippets for FAQs. Ledger rows, balances, beneficiaries and transaction notes are never included.
3. User text and KB text are wrapped in clearly delimited data blocks, and the system prompt states that instructions inside them are not to be followed.
4. The policy engine and registry above, so even a fully hijacked interpretation cannot reach a forbidden action.
5. Confirmation outside the model (F05).
6. Output guard (below) on any model-generated text.
7. A canary string in the system prompt; its appearance in any output blocks the reply and raises an alert.

## Personal-data redaction

Patterns (each with positive and negative test cases): Indian mobile numbers (10 digits starting 6 to 9, with optional +91 or 0, spaces or dashes), emails, bank account numbers (9 to 18 digits near the words account, a/c, acct, or standing alone and not preceded by a currency marker), card numbers (13 to 19 digits passing the Luhn check), PAN-like (`AAAAA9999A`), Aadhaar-like (12 digits, optionally grouped 4-4-4), IFSC-like, and UPI-like handles. Replacement tokens such as `[PHONE]` and `[EMAIL]`; amounts are never redacted.

Where it applies: the logger and trace exporter (central serializers), prompts sent to any model provider, `llm_calls`, `messages.content`, `tool_invocations.input`, ticket subjects, audit details, admin transcripts. Deterministic parsers run on the raw text in memory before redaction so amounts still work. A separate display function produces masks such as `XXXX1234` for account references.

(A `trusted` provider option that relaxes prompt redaction for a locally hosted model is a Could and not part of the MVP.)

## Output guard

Applied to FAQ composer output and any free text before it is sent: (1) every transfer reference or identifier present must belong to the principal; (2) no email, phone or account pattern; (3) the canary string must not appear; (4) URLs only if present in the allowlisted KB set; (5) maximum length. On violation the reply is replaced by a safe template and `OUTPUT_GUARD_BLOCKED` is audited. Templated replies built from tool results are safe by construction but still pass the identifier check.

## Limits and hardening

Per user: 20 messages per minute, 3 tickets per hour, daily LLM cap; per IP: 120 requests per minute; request body 16 KB; message 1000 characters; model output tokens capped (interpreter 400, FAQ 300). Counters live in Redis and are shared across replicas. Security headers (including `Content-Security-Policy: default-src 'self'` for the web app), CORS allowlist from environment. Bearer tokens in headers, no cookies, so CSRF does not apply. Configuration is validated at startup (secrets present and long enough); secrets never appear in logs. Error responses never include stack traces, SQL or paths.

## Acceptance criteria

- AC-F06-1: Every row of the decision table has a unit test, including unknown intents and non-customer roles resulting in DENY.
- AC-F06-2: A test walks all registered tool schemas and fails if any field is named `user_id`, `userId`, `principal` or `role`; the registry exports no confirm or cancel tool; a scripted model naming an unknown tool, or `confirm_transfer`, is rejected and a `POLICY_DENIED` audit entry exists.
- AC-F06-3: An injection corpus of at least 30 payloads (English, Hindi, Hinglish; direct instructions, role play, fake system messages, "confirm all pending transfers", prompt-leak requests) is run end to end. After each: no transfer or ledger change, no tool outside the allowlist executed, no canary and no foreign identifiers in the output.
- AC-F06-4: A beneficiary name and a transaction note seeded with injection text never appear in any captured LLM request, and render as escaped text in the UI.
- AC-F06-5: Each redaction pattern passes its positive and negative cases; a property test shows masked output contains none of the original sensitive substrings while amounts survive.
- AC-F06-6: After sending a message containing a phone number, an email and a PAN-like value, none appears raw in the log stream, span attributes, `llm_calls`, `messages`, tickets or admin transcripts.
- AC-F06-7: The prompt sent to the model contains the redacted text (checked by request capture).
- AC-F06-8: A scripted FAQ composer output containing a foreign transfer reference, the canary, a non-allowlisted URL or an over-length body is replaced by the safe template and audited.
- AC-F06-9: The 21st message in a minute returns 429; the 4th ticket in an hour is refused; a body over 16 KB returns 413; the limits hold across two API replicas sharing Redis.
- AC-F06-10: Security headers are present on API and web responses; a request from an unlisted origin gets no CORS grant.
- AC-F06-11: Starting with a missing or too-short signing secret exits with a clear error; a full test run's log output contains none of the configured secret values.
- AC-F06-12: Forcing an unexpected error returns the `INTERNAL` problem body with a request id and no stack trace, SQL or file path.
- AC-F06-13: The OWASP API mapping tests in `TESTING.md` section 5 exist and pass.

## Interfaces and dependencies

`packages/core` modules `policy`, `tools`, `redaction`, `outputGuard`; Redis rate-limit adapter; logger and OpenTelemetry processors in `apps/server`; F03 for cross-checks; F07 for audit.

## Tests required

Unit and property tests for policy and redaction; integration tests for limits, headers, CORS and config; the injection corpus as a dataset-driven end-to-end test; log-capture tests; security suite tagging for the OWASP mapping.
