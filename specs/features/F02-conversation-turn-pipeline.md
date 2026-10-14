# F02: Conversation and turn pipeline

Covers: FR-CONV-1 to FR-CONV-7, FR-NLU-6 (reply locale), FR-UI-2 (fallback behavior), supports FR-OBS-2, NFR-PERF-2, NFR-PERF-3, NFR-REL-2.

## Problem and outcome

A user message must flow through authentication, understanding, policy, tools and response in a predictable order, stream quickly, survive failures, and leave a complete trail. Outcome: a single `POST /v1/conversations/:id/messages` endpoint that runs the pipeline in ARCHITECTURE section 5 and either streams SSE or returns JSON.

## Behavior

**Conversations and history.** A customer creates conversations and reads their own messages (cursor pagination). The interpreter receives the last 10 turns, each truncated to 500 characters and masked.

**Dialog state** (Redis `dlg:{conversationId}`, 30-minute TTL, refreshed on activity): `pendingClarification { intent, missing[], partialEntities, askedCount }`, `pendingTransferId`, `lastLocale`. Losing it only means the assistant asks again.

**Order of work per message:**

1. Validate input (1 to 1000 characters after trim), authenticate, rate limit (20 messages per minute per user), load the conversation (404 if not the user's).
2. If `client_message_id` was seen, return the stored reply and stop.
3. Normalize and redact; detect language; run deterministic parsers.
4. If a transfer is pending and the message is exactly a confirm or cancel phrase (F05), handle it deterministically.
5. Otherwise call the interpreter (F03). One intent per message. If the interpreter flags several intents, ask the user to do them one at a time.
6. Policy engine decides ALLOW, CLARIFY, NEEDS_CONFIRMATION or DENY (F06). Tools run as the user, at most 4 per turn.
7. Render the reply from templates (or the FAQ composer, F04) in the user's locale, emit SSE events, and persist.

**Clarification.** If required details are missing or ambiguous the assistant asks one specific question and stores the partial intent. The next user message is interpreted with that context (PROVIDE_SLOT). After 3 consecutive clarifications without progress it shows the menu card and offers a support ticket.

**Fallback mode.** Triggers: LLM timeout, circuit open, invalid output after one repair, daily LLM cap reached. Result: HTTP 200 with a `menu` card (Check balance, Recent transactions, Send money, Contact support) and a templated apology; metric `assistant_fallback_total{reason}` increments. The wallet APIs are unaffected.

**Streaming.** SSE events `status`, `card`, `delta`, `final`, `error` as defined in `API.md`. First event within 300 ms of request receipt. Templated replies are sent as one `delta`. A client disconnect does not cancel persistence; the turn finishes server-side and the stored reply can be fetched later.

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
- AC-F02-11: Each turn records: message rows, one `tool_invocations` row per tool, one `llm_calls` row per model call, audit entries for actions and denials.
- AC-F02-12: With the scripted model, turn overhead excluding model time has p95 at most 100 ms over 200 runs on the reference machine.
- AC-F02-13: Reply language equals the detected user language (en, hi, hi-Latn) unless `preferred_locale` is set, in which case the preference wins.

## Errors and security

Authentication and ownership checks come before any parsing. Raw user text is never logged; only masked text. All model calls go through the gateway wrappers (timeout, retry, breaker). Unknown tools or intents are never executed. Error events carry `request_id`.

## Interfaces and dependencies

Ports: `DialogStore`, `ConversationRepo`, `LlmClient`, `ToolRegistry`, `PolicyEngine`, `Responder`, `AuditSink`, `Clock`. Redis, Postgres. Depends on F03 (interpretation), F04 and F05 (tools), F06 (policy, redaction), F07 (audit).

## Tests required

Unit: dialog state transitions, clarification counter, fallback decision table. Integration: all acceptance criteria through HTTP with the scripted LLM; SSE ordering test using a real HTTP client; abort test. Benchmark for AC-F02-12. E2E: Playwright journey for clarification and fallback.
