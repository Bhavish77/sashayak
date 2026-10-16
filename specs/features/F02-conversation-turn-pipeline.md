# F02: Conversation and turn pipeline

Covers: FR-CONV-1 to FR-CONV-7, FR-NLU-6 (reply locale), FR-UI-2 (fallback behavior), FR-XFER-14 (transfer notices), supports FR-OBS-2, NFR-PERF-2, NFR-PERF-3, NFR-REL-2, NFR-REL-7, NFR-REL-8.

## Problem and outcome

A user message must flow through authentication, understanding, policy, tools and response in a predictable order, stream quickly, survive failures, and leave a complete trail. Outcome: a single `POST /v1/conversations/:id/messages` endpoint, owned by the `assistant` service and reached through `edge`, that runs the pipeline in ARCHITECTURE section 5 and either streams SSE or returns JSON. The assistant never touches money data directly: it reads and acts through `wallet` and `transfers` **as the user** (forwarding the user's token), so those services apply their own authorization.

## Behavior

**Conversations and history.** A customer creates conversations and reads their own messages (cursor pagination). The interpreter receives the last 10 turns in their real alternating order, built by a pure function in `assistant-core`. A user turn is the user's own message, truncated to 500 characters and masked. An assistant turn is **never the rendered reply**: it is a one-line summary taken from a closed catalog keyed by the reply's `template_key`, which is stored in `messages.meta`. For example `clarify.amount` becomes "asked the user for the amount", `clarify.recipient_ambiguous` becomes "asked which of 2 saved recipients was meant" and `transfer.confirm_card` becomes "showed a transfer confirmation and is waiting for confirm or cancel". The only value a summary may contain is an integer count. A system notice becomes "told the user a transfer reached a final state". Rendered replies contain recipient names, masked accounts and amounts, and a beneficiary name is text an attacker can choose, so rendered replies must never reach the prompt (F06 data minimization, AC-F06-4). The summaries give the model what it needs to read a short follow-up such as "and last week?" or "make it 600". (Answers to a clarification question are handled in code before the model, see below.)

**Dialog state** (Redis `assistant:dlg:{conversationId}`, 30-minute TTL, refreshed on activity): `pendingClarification { intent, slot, partialEntities, candidates, askedCount }`, `pendingTransferId`, `lastLocale`. Losing it only means the assistant asks again.

**Order of work per message:**

1. Validate input (1 to 1000 characters after trim), verify the user token, rate limit (20 messages per minute per user, counted in `assistant`; the per-IP limit is applied earlier at `edge`), load the conversation (404 if not the user's).
2. If `client_message_id` was seen, return the stored reply and stop.
3. Normalize and redact; detect language; run deterministic parsers.
4. If a transfer is pending and the message is exactly a confirm or cancel phrase (F05), handle it deterministically: confirm calls the internal `confirm-typed` route of `transfers` (refused when a PIN is required, in which case the reply tells the user to use the button), cancel calls the public cancel route as the user.
5. Otherwise call the interpreter (F03). One intent per message. If the interpreter flags several intents, ask the user to do them one at a time.
6. Policy engine decides ALLOW, CLARIFY, NEEDS_CONFIRMATION or DENY (F06). Tools run as the user through `WalletClient` (timeout 3 s) and `TransfersClient` (timeout 5 s), one breaker per callee, reads retried once (NFR-REL-8), at most 4 per turn.
7. Render the reply from templates (or the FAQ composer, F04) in the user's locale, emit SSE events, and persist.

**Clarification and slot answers.** If required details are missing or ambiguous the assistant asks one specific question and stores in the dialog state what it is waiting for: `pendingClarification { intent, slot, partialEntities, candidates, askedCount }`. For the recipient slot, `candidates` is the ordered list of beneficiary ids it offered (ids only). While a clarification is pending, the next message goes first to a **deterministic slot-answer handler** in `assistant-core`, before any model call. For the recipient slot it accepts a position (`1`, `2`, `first`, `second`, `pehla`, `doosra`, `पहला`, `दूसरा`, with filler such as "the second one"), the last four digits of a masked account shown in the question (optionally with "ending" or "wala"), or a name that the recipient resolver (F03) narrows to exactly one of the offered candidates. For the amount slot it accepts a message in which the amount parser finds exactly one candidate. If the handler resolves the slot, it merges the value into `partialEntities` and the turn continues to the policy engine with no model call. If it matches zero or several candidates, the assistant asks again (counted in `askedCount`). If the message does not look like an answer at all, the pending clarification is dropped and the message goes to the interpreter as a new request. After 3 consecutive clarifications without progress it shows the menu card and offers a support ticket.

**Fallback mode.** Triggers: LLM timeout, circuit open, invalid output after one repair, daily LLM cap reached, concurrency limit reached (reason `overloaded`: at most 20 model calls in flight per `assistant` replica, a turn waits at most 2 s for a slot). Result: HTTP 200 with a `menu` card (Check balance, Recent transactions, Send money, Contact support) and a templated apology; metric `assistant_fallback_total{reason}` increments. The wallet and transfer APIs are unaffected, because they do not depend on `assistant`.

**Streaming.** SSE events `status`, `card`, `delta`, `final`, `error` as defined in `API.md`. First event within 300 ms of request receipt. Templated replies are sent as one `delta`. A client disconnect does not cancel persistence; the turn finishes server-side and the stored reply can be fetched later.

**Dependency failure.** If a tool needs `wallet` or `transfers` and the call fails (timeout, breaker open, 5xx), the turn does not fail: the reply is a templated message ("I can't reach that service right now, please try again in a moment" in the user's locale) plus the `menu` card; the error is logged with the callee name; `assistant_dependency_failure_total{callee}` increments. A failed *prepare* creates nothing and says so. The assistant never guesses balances or statuses.

**Transfer notices (FR-XFER-14).** A consumer in `assistant` reads `transfer.status_changed` events (queue `assistant.transfer_notices`; EVENTS.md). For `completed`, `failed` and `needs_review` events whose `origin_conversation_id` is set and belongs to the event's `user_id`, it inserts one message with `role = system_notice` into that conversation, rendered from a locale template with the amount and reference (and, for `failed`, the failure-code wording from F04); no model call. At most one notice exists per transfer and status (unique key in message metadata), so redelivery adds nothing. Events with no origin conversation, an unknown conversation or a user mismatch are acknowledged and logged without a message. The web client shows the new message on its next fetch of the message list (it polls the list while a transfer started in that conversation is not terminal).

**Limits.** Daily per-user LLM call cap (default 200, resets at midnight IST). Tool cap 4 per turn. Message size cap 1000 characters. Request body cap 16 KB.

## Acceptance criteria

- AC-F02-1: SSE mode emits `status` first, then zero or more `card`, then `delta`, then exactly one `final`; JSON mode returns `{ "message": ... }`; both persist one user message and one assistant message.
- AC-F02-2: An empty or over-1000-character message returns `VALIDATION_FAILED`; the 21st message within one minute returns 429.
- AC-F02-3: Re-sending the same `client_message_id` makes zero additional LLM calls and returns an identical reply.
- AC-F02-4: "Rohan ko bhejo" (no amount) yields one clarification asking the amount in Hinglish; replying "500" completes the transfer preparation without re-asking the recipient; `askedCount` increments per clarification; the third consecutive unresolved clarification yields the `menu` card.
- AC-F02-5: With the scripted LLM set to time out, return invalid JSON twice, or hold the circuit open, the response is 200 with a `menu` card within the configured timeout, and the fallback metric increments.
- AC-F02-6: A scripted multi-intent interpretation produces a "one at a time" clarification and no tool execution.
- AC-F02-7: Posting to another user's conversation returns 404.
- AC-F02-8: With a fake clock advanced 31 minutes, a pending clarification is gone and the assistant restarts the question politely.
- AC-F02-9: Aborting the SSE connection mid-turn still results in exactly one stored user message and one stored assistant message.
- AC-F02-10: After the daily LLM cap is reached, the next message returns the `menu` card with a limit notice and makes no LLM call; the cap resets after midnight IST (fake clock).
- AC-F02-11: Each turn records, in `assistant_db`: message rows, one `tool_invocations` row per tool, one `llm_calls` row per model call, and one `audit.recorded` outbox row per action or denial, in the same transaction as the record it describes.
- AC-F02-12: With the scripted model, turn overhead excluding model time has p95 at most 100 ms over 200 runs on the reference machine.
- AC-F02-13: Reply language equals the detected user language (en, hi, hi-Latn) unless `preferred_locale` is set, in which case the preference wins.
- AC-F02-14: With the scripted LLM delaying every call, once 20 calls are in flight the next turn waits at most 2 s and then returns the `menu` card with fallback reason `overloaded` and no LLM call; while the model is saturated, balance, history and transfer endpoints keep latency within the NFR-PERF-1 budget; slots are released on success, error and timeout.

- AC-F02-15: A `transfer.status_changed` event for `completed`, `failed` or `needs_review` with a valid origin conversation creates exactly one `system_notice` message with the golden template text for en, hi and hi-Latn and zero LLM calls; the same event delivered five times, or arriving before a duplicate of another status, creates no second notice for that transfer and status; events for `prepared`, `confirmed` and other intermediate statuses create none.
- AC-F02-16: A notice event whose user does not own the named conversation, whose conversation does not exist, or whose payload is invalid creates no message; invalid payloads go to the dead-letter queue (EVENTS.md), the others are acknowledged and logged.
- AC-F02-17: With `wallet` stopped, "balance kitna hai" returns 200 with the templated dependency message and the `menu` card within the 3 s callee timeout plus rendering time, and increments `assistant_dependency_failure_total{callee="wallet"}`; after 5 consecutive failures the breaker opens and the next turn fails fast without a network call; with `transfers` stopped, a prepare request creates nothing and says so.
- AC-F02-18: The tool calls of a turn use the caller's token: a test that gives the assistant a token for user A and a model proposal naming user B's beneficiary or transfer id results in 404 from the owning service and no data about B in the reply (ownership is enforced by `wallet` and `transfers`, not trusted to `assistant`).
- AC-F02-19: A turn produces one trace that includes spans in `edge`, `assistant` and the called service, and the `traceparent` is stored on the outbox rows the turn writes (NFR-OBS-3).
- AC-F02-20: With two saved beneficiaries named Rahul (Sharma and Verma), "Rahul ko 500 bhejo" asks which one (template key `clarify.recipient_ambiguous`, count 2) and the dialog state holds both candidate ids in the order shown. The replies "the second one", "2", "doosra", "दूसरा", "ending 5678" and "Verma" each select the second candidate with zero further model calls; "Sharma" selects the first; "Rahul" again or "3" asks again and increments `askedCount`; "mera balance kitna hai" drops the clarification and is interpreted as a new request; after 31 minutes on the fake clock the candidates are gone (AC-F02-8). A selected candidate continues to prepare with amount 50000 and the chosen beneficiary.

## Errors and security

Authentication and ownership checks come before any parsing. Raw user text is never logged; only masked text. All model calls go through the gateway wrappers (timeout, retry, breaker). Unknown tools or intents are never executed. Error events carry `request_id`.

## Interfaces and dependencies

Ports in `assistant`: `DialogStore`, `ConversationRepo`, `LlmClient`, `ToolRegistry`, `PolicyEngine`, `Responder`, `WalletClient`, `TransfersClient`, `AuditEvents`, `Clock`; consumer `TransferNoticeConsumer`. Tables in `assistant_db` (`conversations`, `messages`, `tool_invocations`, `llm_calls`, `support_tickets`, `kb_articles`, `eval_runs`, `eval_results`, `event_outbox`, `inbox`), Redis prefix `assistant:`. Domain code lives in `packages/assistant-core`. Depends on F03 (interpretation), F04 and F05 (tools), F06 (policy, redaction), F07 (audit), F10 (platform kit).

## Tests required

Unit: dialog state transitions, clarification counter, fallback decision table, notice template selection. Integration (real Postgres, Redis and RabbitMQ; `wallet` and `transfers` replaced by contract fakes): all acceptance criteria through HTTP with the scripted LLM; SSE ordering test using a real HTTP client; abort test. Benchmark for AC-F02-12. E2E: Playwright journey for clarification and fallback.
