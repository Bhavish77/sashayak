# ADR-013: Facts from templates, language handling and locale catalogs

Status: Proposed (2026-10-14).

## Context

Users write in English, Devanagari Hindi and romanized Hindi, often mixing them. Numbers and names in replies must be exactly the stored values. A model asked to write the reply may round, invent or leak.

## Decision

- Replies that state facts (balances, amounts, statuses, recipients, dates, fees) are rendered from locale catalogs (`en`, `hi`, `hi-Latn`) with typed parameters. The model does not write them.
- Deterministic language detection decides the reply locale; a profile preference overrides it.
- Numbers use Indian digit grouping and Latin digits in every locale for consistency with banking apps; dates use `DD Mon YYYY`.
- Deterministic parsers for amounts, dates and recipients run beside the model and cross-check it.
- Free model text is allowed only for FAQ answers grounded in curated articles, validated and guarded.
- A test fails if any message key lacks a locale.

## Alternatives considered

- Model-generated replies in the user's language: more natural, less safe and untestable.
- Machine-translated catalogs: acceptable as a first draft, but wording for money must be reviewed by a human fluent in Hindi (listed as an open item for the owner).

## Consequences

Replies feel more formulaic than free text. Correctness and testability win. Catalog wording needs human review before any real use.

## Revisit when

More locales are added, or a vetted generation approach with verifiers is available.
