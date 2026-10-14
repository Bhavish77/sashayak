# F04: Informational, navigation and support workflows

Covers: FR-INFO-1 to FR-INFO-4, FR-NAV-1, FR-SUP-1, FR-SUP-2, supports FR-XFER-9.

## Problem and outcome

Users ask for balances, history, transfer status, where to find things, and help. Answers must come from the system of record, in the user's language, and never from model-invented numbers. Outcome: seven typed tools backed by the authoritative wallet APIs, rendered through locale templates, plus a grounded FAQ path.

## Tools (all run as the authenticated user, none accepts a user id)

| Tool | Input | Result |
|---|---|---|
| `get_balance` | none | `{ available_minor, held_minor, currency }` |
| `list_transactions` | `from?`, `to?`, `direction?`, `counterparty?`, `limit?` (default 5, max 50) | up to `limit` items from `v_transactions`, newest first, with `next_cursor` |
| `get_transfer_status` | `reference?` or `last: true` | transfer status object, or not found |
| `prepare_transfer` | `beneficiary_id`, `amount_minor` | defined in F05 |
| `navigate` | `screen` | `{ screen }` if allowlisted |
| `search_kb` | `query` | up to 3 article snippets with ids |
| `create_ticket` | `subject?` | ticket id |

## Behavior

**Balance.** Reply states available balance and, only when held is above zero, the held amount. Indian digit grouping with the rupee sign and Latin digits in every locale (for example `₹1,24,500.00`).

**History.** Date phrases resolve through F03. With no filters, the five newest items. The text lists up to five items; the `transactions` card carries all returned items. Empty result uses a "no transactions found for that period" template. Date ranges longer than 366 days trigger a clarification.

**Status.** Looks up by public reference or "my last transfer". Another user's reference behaves exactly like an unknown one. User-facing wording by status (the same meaning in all three locales; strings live in the catalogs):

| Status | Meaning shown to the user |
|---|---|
| PREPARED | Waiting for your confirmation (with expiry time) |
| CONFIRMED, SUBMITTED | Processing; the amount is on hold |
| COMPLETED | Completed |
| FAILED | Failed, with a reason mapped from `failure_code`; amount returned to available balance |
| PENDING_UNKNOWN | Being verified; the amount is on hold; will update automatically |
| NEEDS_REVIEW | Under review by our team; the amount is on hold |
| CANCELLED, EXPIRED | Cancelled or expired; no money moved |

While a transfer is not in a terminal state the card includes `poll_after_ms: 5000`; the UI polls `GET /v1/transfers/:id` (FR-INFO-4).

**Navigation.** Allowlisted screen ids: `home`, `transactions`, `send_money`, `beneficiaries`, `add_beneficiary`, `profile`, `limits`, `support`. The reply is a `navigation` card with the id and a short templated sentence. The client maps ids to routes. A screen outside the allowlist yields a refusal template listing what is available. The model never supplies a URL.

**FAQ.** `search_kb` runs Postgres full-text search over `kb_articles` using the user's masked text and each article's tags (which include Hinglish keywords because stemming is weak for Hindi). Up to 3 articles above a rank threshold are passed, delimited as data, to the FAQ composer (second LLM call). The composer must answer only from them, in the user's language, at most 600 characters, and return the ids used. Output must have ids that are a subset of those retrieved; it then goes through the output guard (F06). If nothing matches, or composition fails, the assistant shows the best article's title and first paragraph verbatim, or offers a ticket.

**Tickets.** `create_ticket` creates a ticket linked to the conversation. Subject defaults to the user's last message, masked and truncated to 200 characters. At most 3 tickets per hour per user. Support and admin roles list tickets via the admin API. The assistant confirms with the ticket id.

**Small talk and out of scope.** Greetings, thanks and "what can you do" get fixed templates (including a capabilities list); requests outside scope get a polite refusal with the capabilities list. No extra LLM call.

## Acceptance criteria

- AC-F04-1: Balance reply equals the database value in all three locales, with Indian grouping and Latin digits; held shown only when above zero.
- AC-F04-2: History supports date range, direction, counterparty and limit filters, newest first, stable cursor pagination, and a hard maximum of 50; each filter is covered by a test against seeded data.
- AC-F04-3: Empty history returns the empty-state template; a range over 366 days triggers a clarification.
- AC-F04-4: Status by reference and by "last transfer" works; another user's reference gives the same not-found reply as an unknown one.
- AC-F04-5: Every status in the table maps to a template in all three locales; PENDING_UNKNOWN never produces words meaning failed or completed.
- AC-F04-6: A non-terminal status card has `poll_after_ms`; in the e2e test the card updates to the new status within 5 seconds of the change.
- AC-F04-7: A scripted model returning an unlisted screen or a URL produces the refusal template and no navigation card; an allowlisted screen produces the card.
- AC-F04-8: FAQ with a matching article cites an id that was retrieved; with no match it offers a ticket; with an invalid composer output (ids not retrieved, over-length) it falls back to the verbatim snippet.
- AC-F04-9: Ticket creation stores a masked subject, writes an audit entry and replies with the id; the 4th ticket within an hour is refused with a template; support and admin can list all tickets; a customer cannot see others'.
- AC-F04-10: Small talk and out-of-scope replies exist in en, hi and hi-Latn and trigger no tool and no second LLM call.
- AC-F04-11: A transaction note containing HTML or script is returned as plain text by the API and displayed literally by the UI (checked in the e2e test).

## Errors and security

All reads go through application services that take the principal and filter by user. Tool inputs are validated by Zod schemas; unknown fields rejected. Not-found and not-owned are indistinguishable. KB content is curated, versioned in the repository seed, and treated as data in prompts.

## Interfaces and dependencies

Wallet and transfer APIs in `API.md`; `v_transactions`, `kb_articles`, `support_tickets`; ports `WalletRepo`, `TransferRepo`, `KbRepo`, `TicketRepo`, `LlmClient` (FAQ only); templates and catalogs in `shared`.

## Tests required

Unit: formatters, status-to-template mapping, filter building. Integration: each tool and API against seeded Postgres, pagination, authorization, ticket rate limit. Scripted-model tests for navigation and FAQ composer validation. E2E: status polling and XSS display.
