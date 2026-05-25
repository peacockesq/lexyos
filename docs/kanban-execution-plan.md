# LexyOS Full PRD Kanban Execution Plan

Owner directive: every described LexyOS feature goes into the board with implementation and review gates. Clean-room LexyOS core remains the current path. Mike/PIP/Lavern are references only; no upstream code copied.

## Board
- Board: `lexyos`
- Workspace: `/Users/bot/.hermes/hermes-agent/project-artifacts/lexy-legal-os/lexyos-shell`
- Execution rule: implementation cards produce tests/docs/proof; reviewer cards gate final synthesis; no GitHub PR until contract layer, runtime proof, and Otto-style review pass.

## Feature coverage from PRDs and Willie directives

### Foundation / LexyOS Core
- canonical matter schema
- parties/facts/documents/tasks/gates/filings/service/corpus/audit/agent-action primitives
- immutable audit events
- roles, permissions, attorney review gates
- service/API stubs: `/matters`, `/tasks`, `/gates`, `/audit-events`

### Unified Login / B2B SSO
- tenant-aware identity model
- org membership and roles
- SSO provider config contract
- external B2B client/app login boundary
- permission checks around matters, corpus, filing, service, gates, and agents

### Agent Admin OS + Cockpit
- queue task model
- agent run/tool-call audit model
- intake event -> task creation
- gap sweeper/stale matter detection
- cockpit metrics
- matter drilldown timeline/audit stream
- human-gate approval flow
- tests proving gated actions cannot complete without approval

### Practice Packs
- manifest loader
- QDRO/family sample pack
- stages/workflows/forms/facts/documents/gates/filing/service/corpus declarations
- missing facts/documents create tasks automatically
- pack validation tests

### LexyFiling
- packet schema
- validation rules
- API/MCP-style action functions
- human filing approval requirement
- manual connector/status/receipt path
- audit logging

### Lexy Corpus
- source/citation model
- retrieval API
- citation/quote verification
- unsupported-answer refusal
- public/legal-source vs private firm/client corpus boundary
- practice-pack scoped retrieval
- audit logging

### Process Serving
- service requirement rules
- packet generation
- vendor assignment tasks
- proof intake
- failed/stale service escalation
- proof filing handoff gate

### Matter Cockpit UI
- matter selector/search
- cloud files per selected matter
- baseline panel
- document generation/workspace
- Eva/legal research rail
- SSO/session header
- Filing, Corpus, Service, Tasks/Gates panels

## Review stack
1. Unit/contract tests for each module.
2. Integration smoke test for end-to-end matter -> missing task -> gate -> filing packet -> corpus answer -> service event -> audit log.
3. Spec compliance review against every PRD acceptance criterion.
4. Security/auth review focused on B2B tenant boundaries and autonomous-action gates.
5. Otto adversarial review before GitHub PR.
6. GitHub PR only after green tests and review cards complete.
