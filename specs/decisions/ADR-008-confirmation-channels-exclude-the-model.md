# ADR-008: Confirmation channels never include the model

Status: Proposed (2026-10-14).

## Context

A conversational interface tempts designers to let the assistant "understand" confirmations. That makes confirmation a model decision, which can be manipulated or can misread "haan lekin 800 bhejo" as consent.

## Decision

A transfer is confirmed only by (a) the authenticated confirm endpoint (UI button, with PIN above the threshold) or (b) a typed message whose entire normalized text equals a phrase from a fixed lexicon, when exactly one unexpired transfer is pending and no PIN is required. The lexicon is data in `shared`, tested as data. Any other message is processed as a new request. The summary shown for confirmation is rendered from the immutable snapshot by templates, and the confirm request must carry the snapshot hash.

## Alternatives considered

- Model-classified confirmation: flexible, not defensible.
- Button only: safest, but loses the natural conversational flow that a chat interface implies.
- Always require PIN: safer but poor experience for small amounts.

## Consequences

Slightly stricter typed confirmation (an exact phrase, up to four tokens). The lexicon needs maintenance per language. The policy engine rejects any model-proposed confirm intent, with an audit entry.

## Revisit when

A second factor (OTP or biometric) is added, or voice input is introduced.
