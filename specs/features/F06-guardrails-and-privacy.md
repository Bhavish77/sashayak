# F06: Guardrails, policy and privacy

Covers: FR-SEC-1 to FR-SEC-6, FR-CONV-7 (limits), NFR-SEC-1, NFR-SEC-3 to NFR-SEC-5, NFR-PRIV-1, NFR-ARCH-3 (header and exposure checks).

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

Each decision is audited (as an event in `assistant`'s outbox) when it leads to a tool call or a denial. The engine lives in `packages/assistant-core` and runs in `assistant`; it is a defence for the model path only. Authorization of the user, role and ownership is enforced again by every service that owns the data (F01), so the policy engine is never the only barrier.

## Tool registry

Exactly seven tools (F04, F05). No tool accepts a user id, role or principal. No tool exists for confirming or cancelling a transfer on the model path; those happen only through the deterministic path and the API. The registry validates inputs with Zod and rejects unknown fields and unknown tools.

## Prompt-injection defenses (layered)

1. The model's output is parsed against a closed schema; free text from the model is never executed or interpreted as commands.
2. Data minimization: prompts contain the system prompt, the user's own recent messages, one-line summaries of the assistant's earlier turns taken from a closed catalog (static text and an integer count only, F02), pending clarification context, and curated KB snippets for FAQs. Ledger rows, balances, beneficiaries and transaction notes are never included.
3. User text and KB text are wrapped in clearly delimited data blocks, and the system prompt states that instructions inside them are not to be followed.
4. The policy engine and registry above, so even a fully hijacked interpretation cannot reach a forbidden action.
5. Confirmation outside the model (F05).
6. Output guard (below) on any model-generated text.
7. A canary string in the system prompt; its appearance in any output blocks the reply and raises an alert.

## Personal-data redaction

Patterns (each with positive and negative test cases): Indian mobile numbers (10 digits starting 6 to 9, with optional +91 or 0, spaces or dashes), emails, bank account numbers (9 to 18 digits near the words account, a/c, acct, or standing alone and not preceded by a currency marker), card numbers (13 to 19 digits passing the Luhn check), PAN-like (`AAAAA9999A`), Aadhaar-like (12 digits, optionally grouped 4-4-4), IFSC-like, and UPI-like handles. Replacement tokens such as `[PHONE]` and `[EMAIL]`; amounts are never redacted.

Number shapes people really type: a phone number may have one space or dash inside it (`98765 43210`, `987-654-3210`, `+91 98765-43210`), and a card number may be written in groups separated by single spaces or dashes (`4111 1111 1111 1111`); the whole number is detected, never half of it. American Express style 4-6-5 grouping is accepted for cards. A grouped number that fails the Luhn check is treated like a plain digit run of the same length (`[ACCOUNT]` for 9 to 18 digits), so a mistyped card number does not escape. Devanagari digits are converted to ASCII digits before matching, so a number typed in Devanagari is detected (the rest of the text is unchanged). A UUID is never altered, because identifiers in logs and audit details must stay usable. A run of 9 to 18 digits directly after the words account, a/c or acct (optionally followed by number, no or a colon) is tagged `[ACCOUNT]`, also when it has exactly 12 digits; shorter numbers are never touched by this rule, so amounts survive.

Deep redaction (objects that are logged, traced or stored): a value is replaced by `[REDACTED]` when its key, split into words on underscores, hyphens and capital letters, contains one of password, passwd, pin, token, secret, otp, authorization, cookie, credential, assertion, passcode, passphrase, pwd, cvv, cvc, or the word key right after api, private or secret (so `api_key`, `apiKey`, `x-api-key`, `new_pin`, `step_up_assertion` and `Set-Cookie` all match, while `shipping` and `monkey` do not). A `Date` becomes its ISO string (an invalid date becomes `null`), an `Error` becomes `{ name, message }` with the message redacted, a circular reference becomes `[Circular]`, nesting deeper than 20 levels becomes `[Truncated]`, a key named `__proto__` is kept as ordinary data, and redaction never throws: if something unexpected still fails (for example a property getter that throws), the result is the string `[REDACTION_FAILED]`, never the original value.

Logger: redaction covers every part of a log call, not only the first argument: the message, printf-style values (`%s`), the merge object, and the bindings of a child logger (`logger.child({...})`). An error logged as the first argument or under `err` keeps its `name`, its redacted `message` and its redacted `stack`, so a failure can still be diagnosed. A merge object that cannot be redacted is replaced by the single field `redaction_failed: true`, never by garbage fields and never by the original.

Where it applies: the logger and trace exporter (central serializers), prompts sent to any model provider, `llm_calls`, `messages.content`, `tool_invocations.input`, ticket subjects, audit details, admin transcripts. Deterministic parsers run on the raw text in memory before redaction so amounts still work. A separate display function produces masks such as `XXXX1234` for account references.

(A `trusted` provider option that relaxes prompt redaction for a locally hosted model is a Could and not part of the MVP.)

## Output guard

Applied to FAQ composer output and any free text before it is sent: (1) every transfer reference or identifier present must belong to the principal; (2) no email, phone or account pattern; (3) the canary string must not appear; (4) URLs only if present in the allowlisted KB set; (5) maximum length. On violation the reply is replaced by a safe template and `output_guard.blocked` is audited. Templated replies built from tool results are safe by construction but still pass the identifier check.

## Limits and hardening

Per user (counted in `assistant`): 20 messages per minute, 3 tickets per hour, daily LLM cap; per IP (counted in `edge`): 120 requests per minute; request body 16 KB (enforced at `edge` and again in each service); message 1000 characters; model output tokens capped (interpreter 400, FAQ 300). Counters live in Redis (key prefix per service) and are shared across replicas. Security headers (including `Content-Security-Policy: default-src 'self'` for the web app) and the CORS allowlist from environment are applied at `edge` and by the web server; internal listeners set no CORS headers. Bearer tokens in headers, no cookies, so CSRF does not apply. Configuration is validated at startup (secrets present and long enough); secrets never appear in logs. Error responses never include stack traces, SQL or paths.

## Acceptance criteria

- AC-F06-1: Every row of the decision table has a unit test, including unknown intents and non-customer roles resulting in DENY.
- AC-F06-2: A test walks all registered tool schemas and fails if any field is named `user_id`, `userId`, `principal` or `role`; the registry exports no confirm or cancel tool; a scripted model naming an unknown tool, or `confirm_transfer`, is rejected and a `policy.denied` audit entry exists.
- AC-F06-3: An injection corpus of at least 30 payloads (English, Hindi, Hinglish; direct instructions, role play, fake system messages, "confirm all pending transfers", prompt-leak requests) is run end to end. After each: no transfer or ledger change, no tool outside the allowlist executed, no canary and no foreign identifiers in the output.
- AC-F06-4: A beneficiary name and a transaction note seeded with injection text never appear in any captured LLM request, and render as escaped text in the UI.
- AC-F06-5: Each redaction pattern passes its positive and negative cases; a property test shows masked output contains none of the original sensitive substrings while amounts survive. The property test generates phone and card numbers with and without inner spaces or dashes, and in Devanagari digits.
- AC-F06-6: After sending a message containing a phone number, an email and a PAN-like value, none appears raw in the log stream, span attributes, `llm_calls`, `messages`, tickets or admin transcripts.
- AC-F06-7: The prompt sent to the model contains the redacted text (checked by request capture).
- AC-F06-8: A scripted FAQ composer output containing a foreign transfer reference, the canary, a non-allowlisted URL or an over-length body is replaced by the safe template and audited.
- AC-F06-9: The 21st message in a minute returns 429; the 4th ticket in an hour is refused; a body over 16 KB returns 413; the 121st request from one IP in a minute returns 429 at `edge`; the limits hold across two replicas of the counting service sharing Redis.
- AC-F06-10: Security headers are present on `edge` and web responses; a request from an unlisted origin gets no CORS grant; the internal listeners of all services send no CORS headers.
- AC-F06-11: Starting any service with a missing or malformed key or secret it needs exits with a clear error naming the variable (never the value); a full test run's log output across all services contains none of the configured secret values.
- AC-F06-12: Forcing an unexpected error returns the `INTERNAL` problem body with a request id and no stack trace, SQL or file path.
- AC-F06-13: The OWASP API mapping tests in `TESTING.md` section 5 exist and pass.
- AC-F06-14: Redaction keeps identifiers and structure usable: 100,000 random UUIDs pass through `redactText` unchanged; `redactObject` turns a `Date` into its ISO string, an `Error` into `{ name, message }` with the message redacted, a circular object into a result containing `[Circular]` without throwing, keeps a `__proto__` key, turns an invalid `Date` into `null`, and returns `[REDACTION_FAILED]` rather than throwing when a property getter throws; values under `api_key`, `apiKey`, `x-api-key`, `new_pin`, `step_up_assertion` and `Cookie` are `[REDACTED]` while a key such as `shipping_address_label` is not.
- AC-F06-15: A logger test with an in-memory sink shows that a phone number is absent from the logged line in every call style: message only, printf value, merge object plus message, merge object plus printf value, child-logger binding, and `err` holding an error whose message and stack contain it; an unredactable merge object yields `redaction_failed: true`; a logged error keeps a non-empty redacted `stack`.

## Interfaces and dependencies

`packages/assistant-core` modules `policy`, `tools`, `outputGuard`; `packages/shared` module `redaction` (used by every service); `packages/platform` rate-limit adapter, logger and OpenTelemetry processors (F10); F03 for cross-checks; F07 for audit.

## Tests required

Unit and property tests for policy and redaction; integration tests for limits, headers, CORS and config; the injection corpus as a dataset-driven end-to-end test; log-capture tests; security suite tagging for the OWASP mapping.
