# ADR-003: The model proposes, policy disposes

Status: Proposed (2026-10-14).

## Context

A language model that reads user text can be manipulated by that text, and by any other text it reads (names, notes, knowledge-base articles). In a wallet assistant, a manipulated model must not be able to move money, reveal other users' data or change who it acts for.

## Decision

The model's only output that the system acts on is a schema-validated *interpretation* (intent and entities). A pure policy function decides what happens, using the authenticated principal, never anything from the model about identity. Tools are a closed registry of seven functions, none accepts a user id or role, none can confirm or cancel a transfer. Facts shown to the user come from tool results rendered by templates. Free model text exists in exactly one place (the FAQ composer) and passes an output guard.

## Alternatives considered

- Native function calling with broad tools: faster to build, larger blast radius, behavior varies by model.
- Prompt-only guardrails ("never do X"): not enforceable.
- A second model as judge: adds cost and its own failure modes; kept as a possible addition, not a control.

## Consequences

- Safety is testable without any model: the policy table, the registry and the output guard are plain code with unit tests, and the injection corpus runs with a scripted model that obeys the attack (worst case).
- Some flexibility is lost (the assistant cannot "improvise" actions). That is intended.

## Revisit when

New intents or tools are added: each needs a policy row, a registry entry, tests and an update to the threat model.
