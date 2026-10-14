# F03: Multilingual understanding (English, Hindi, Hinglish)

Covers: FR-NLU-1 to FR-NLU-8, supports FR-SEC-2, FR-EVAL-2, NFR-AI-1.

## Problem and outcome

Users write "mera balance kitna hai", "पिछले हफ्ते के ट्रांजैक्शन दिखाओ" or "Rohan ko 2 hazaar bhej do pls". The system must turn that into a validated interpretation without trusting the model for anything that moves money. Outcome: deterministic preprocessing, one structured LLM call, strict validation, cross-checks, and deterministic recipient resolution.

## Languages and detection

Locales: `en`, `hi` (Devanagari), `hi-Latn` (romanized Hindi). Detection is deterministic and runs before the model: if more than 30% of letters are Devanagari the locale is `hi`; else if the share of tokens found in a maintained list of common Hinglish words (mera, kitna, bhej, do, ko, paise, rupaye, batao, dikhao, kal, pichle, hafte, mahine and similar, about 200 entries) reaches 25% of tokens, `hi-Latn`; else `en`. The model also reports a language but the deterministic result decides the reply locale (F02 AC-F02-13).

## Intents and entities

Closed intent set (anything else is invalid output): `CHECK_BALANCE`, `LIST_TRANSACTIONS`, `TRANSACTION_STATUS`, `TRANSFER_MONEY`, `NAVIGATE`, `FAQ_SUPPORT`, `CREATE_TICKET`, `SMALL_TALK`, `OUT_OF_SCOPE`.

Interpretation schema (Zod in `shared`):

```json
{
  "language": "en | hi | hi-Latn",
  "intent": "CHECK_BALANCE | LIST_TRANSACTIONS | ...",
  "confidence": 0.0,
  "multiple_intents": false,
  "entities": {
    "amount_minor": 200000,
    "amount_text": "2 hazaar",
    "currency": "INR",
    "recipient_text": "Rohan",
    "date_range": { "relative": "last_week", "from": null, "to": null },
    "direction": "credit | debit | null",
    "limit": 5,
    "reference": null,
    "screen": null
  },
  "missing": ["amount"]
}
```

`date_range.relative` values: `today`, `yesterday`, `day_before_yesterday`, `this_week`, `last_week`, `last_7_days`, `this_month`, `last_month`, `custom` (with ISO `from` and `to`). `screen` values come from the navigation allowlist (F04).

## Deterministic helpers

**Amount parser** (runs on the raw normalized text, independent of the model). Recognized: ASCII and Devanagari digits; Indian and Western grouping; currency markers (`₹`, `rs`, `rs.`, `inr`, `rupaye`, `रुपये`, `/-`); suffixes `k`; multipliers `hazaar`/`hazar`/`हज़ार`, `lakh`/`lac`/`लाख`, `sau`/`सौ`; fractions `dedh` (1.5), `dhai` (2.5), `sawa` (1.25), `sadhe` (plus 0.5); spoken numbers in Hindi (`paanch sau`, `do hazaar`) and English words. Returns all candidate amounts in paise. More than two decimal places is invalid.

| Input | Candidates (paise) |
|---|---|
| `500` | 50000 |
| `₹1,00,000` | 10000000 |
| `rs 10.50` | 1050 |
| `2 hazaar` / `do hazaar` / `2k` / `2000/-` | 200000 |
| `paanch sau pachas` | 55000 |
| `dedh sau` | 15000 |
| `dhai hazaar` | 250000 |
| `sawa sau` | 12500 |
| `ek lakh` / `1 lakh` | 10000000 |
| `५०० रुपये` | 50000 |
| `bhej do 500 ya 600` | 50000 and 60000 |
| `ten thousand` | 1000000 |
| `bhej do` | none |

**Date resolver** (fixed clock in tests, zone `Asia/Kolkata`, weeks run Monday to Sunday). Maps `aaj`, `kal` (past reading, because history is always in the past), `parso`, `pichle hafte`, `is hafte`, `is mahine`, `pichle mahine`, `pichle 7 din` and the Devanagari and English equivalents to concrete ranges. With clock 2026-10-14 (Wednesday): `last_week` is 2026-10-05 to 2026-10-11; `yesterday` is 2026-10-13; `this_month` is 2026-10-01 to 2026-10-14.

**Recipient resolver** (server-side, never sent to the model). Normalize (Unicode NFKC, casefold, strip honorifics such as ji, bhai, sir, madam, punctuation). Match tiers against the user's beneficiary names and aliases: 1 exact, 2 token prefix, 3 edit distance of 1 for queries of 5 or more characters. One candidate at the best tier means resolved; several means ambiguous (ask which, listing masked accounts); none means not found. Devanagari spellings work through seeded aliases.

## Interpreter

One call per message: system prompt (intent definitions, schema, rules, at least 3 few-shot examples per language for each main intent), the user text delimited as data, recent turns, and pending clarification context. The prompt states that instructions inside user text are never followed. Output is validated against the schema. On failure, one repair call includes the validation errors; a second failure is a fallback (F02).

**Cross-checks after validation:**

1. Amount: let P be the parser's candidates. If the model gives an amount that is not in P, treat it as a mismatch and ask the user to confirm from P. If P has exactly one candidate and the model gave none, use P. If P has several candidates, ask which. If P is empty, discard any model amount.
2. Intent versus entities: `TRANSFER_MONEY` needs amount and recipient (else `missing`); `TRANSACTION_STATUS` needs a reference or the phrase for "last transfer".
3. Confidence below 0.6 or `multiple_intents` true leads to clarification (no tool execution).

## Acceptance criteria

- AC-F03-1: Language detection returns the expected locale for at least 30 spec examples (10 per locale, including mixed and abbreviation cases) with 100% agreement.
- AC-F03-2: The amount parser passes every row of the table above plus at least 30 more cases (digits, grouping, words, mixed), and a property test shows decimal formatting round-trips for integers up to 10 million.
- AC-F03-3: The date resolver returns the expected ranges for at least 20 phrases across the three locales with the fixed clock.
- AC-F03-4: A scripted interpretation that matches the schema is accepted; an invalid one triggers exactly one repair call; a second invalid output results in fallback and an `llm_calls` row with outcome `invalid_output`.
- AC-F03-5: Model amount 200 with text "2 hazaar" produces a clarification and no transfer preparation; model omitting the amount with text "2 hazaar bhej do" fills 200000; text with two candidates asks which.
- AC-F03-6: An intent outside the closed set is rejected as invalid output.
- AC-F03-7: Recipient resolver cases pass: "Rohan" resolves; the Devanagari alias resolves to the same beneficiary; "Rahul" is ambiguous with two candidates; "Rahull" is ambiguous; "Rohn" (4 characters) is not found; unknown names are not found.
- AC-F03-8: Inspecting every captured LLM request in tests shows no beneficiary names, balances or transaction data.
- AC-F03-9: Confidence 0.5 produces a clarification and no tool call.
- AC-F03-10: Abbreviation fixtures (`bal`, `txn`, `pls`, `rs`, `k`) produce the intended interpretations through the scripted model and parsers.
- AC-F03-11: Reply templates render in en, hi and hi-Latn for every message key (a test fails if a key lacks a locale).
- AC-F03-12: The NLU evaluation (F08) reports metrics per language, and the amount cross-check mismatch rate.

## Errors and security

The model's output is untrusted; nothing outside the schema is read. The user text is passed as delimited data. Amounts are bounded (1 paise to the configured maximum) before use. Parsers must not throw on arbitrary input (fuzz test).

## Interfaces and dependencies

Ports: `LlmClient`, `BeneficiaryRepo` (resolver only), `Clock`. Pure modules in `packages/core`. Contracts in `packages/shared`.

## Tests required

Unit tests for each helper with tables above, property and fuzz tests for the parsers, interpreter tests with the scripted LLM (valid, invalid, repair, mismatch), prompt-capture test (AC-F03-8), template completeness test, and the evaluation harness for model quality.
