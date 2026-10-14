# ADR-004: Structured output with validation and repair, behind an LLM gateway

Status: Proposed (2026-10-14).

## Context

The assistant must work with a free hosted model and with small self-hosted models (for example Qwen3 4B or 8B through Ollama). Native tool-calling reliability and formats differ across providers and model sizes, and some small models need special handling of reasoning output. The system must also survive provider outages and bad output.

## Decision

- One OpenAI-compatible HTTP client interface (`LlmClient`) with adapters selected by configuration (base URL, model, key).
- The interpreter asks for JSON that matches a Zod schema, validates it, and on failure makes exactly one repair call that includes the validation errors. A second failure triggers fallback mode.
- A gateway wrapper adds timeout (15 s), retries with jitter on 429 and 5xx (2), a circuit breaker (opens after 5 consecutive failures for 30 s, state in Redis), token caps, PII redaction for untrusted providers, and writes every call to `llm_calls`.
- A scripted fake implements the same interface for tests and CI.
- Deterministic cross-checks (amount parser, date resolver, recipient resolver) run beside the model and override or challenge it.

## Alternatives considered

- Vendor SDKs and native tool calling: ties the design to one provider, less portable to local models.
- Constrained decoding/grammar: provider-specific; may be added behind the same interface.
- LangChain or similar frameworks: more abstraction than the problem needs and less visible control over failure modes.

## Consequences

- Provider switching is a configuration change; evaluation can compare models fairly (F08).
- Quality of small models is reported honestly and is not a CI gate.
- Two LLM calls are possible per turn (interpret, then FAQ compose), bounded by caps.

## Revisit when

A provider offers reliable schema-constrained output that all targeted models support.
