# LexyOS Shell Implementation Notes

## Scope locked
- Clean-room LexyOS shell. No Mike/PIP source copied.
- Google Drive is the first storage backend.
- One folder per matter is a core invariant.
- No-code DB and intake system compatibility is via adapters, not hard coupling.

## Matter contract
Required stable field:
- `matter_id` or `id`

Preferred fields:
- `client_display_name` first; fallback to `client_name` / `name`
- `matter_type` / `type`
- `stage` / `status`
- `drive_folder_id` / `folderId`
- `baseline_data` / `data`

Unknown scalar fields are preserved into `baseline` so NocoDB/Airtable/Lawmatics/intake shape drift does not destroy useful document-population data.

## NoCoDB canonical alignment
- Peacock's Cases table now exposes Lexy snake_case titles for shared fields where possible.
- Reusable firm-agnostic legal fields live in `lexy_core`.
- Reusable QDRO/family-law fields live in `qdro_pack`.
- Peacock-only operational residue stays in place and is not dropped.
- Downstream Peacock scripts must read canonical-first, legacy-second, e.g. `field(row, 'case_number', 'Case Number')`.
- When Slack status changes are propagated to NoCoDB, write both canonical `stage`/`stage_updated_at` and legacy `Current Status`/`Status Updated Date` until old automations are retired.

## Storage contract
- `src/storage.mjs` now exposes a provider interface with `listMatterFiles`, `folderStatus`, `ensureMatterFolder`, `requestDownload`, and `requestUpload` primitives.
- Providers are interchangeable: `local` reads/writes the LexyOS JSON document store, `mock` is safe no-op OSS mode, and `google_drive` scopes live operations through a GOG Drive boundary.
- UI/API file reads are scoped only to the selected matter's `driveFolderId` / `drive_folder_id`; the adapter never falls back to the Drive root for matter file list/download operations.
- If a matter has no folder, the storage adapter returns `needsFolder: true` and can call `ensureMatterFolder` only if a creation adapter is configured.
- OSS/local mode does not require Peacock-specific Drive IDs. `config/integrations.json` and `.env.example` reference `LEXYOS_DRIVE_ROOT_FOLDER_ID` as a deployment env var instead of committing live IDs.

## Legal safety
- Eva document edits are proposals using tracked-change mode by default.
- Silent mutation of legal documents is blocked at the model layer (`requiresApproval: true`).

## B2B SSO / unified login
- `src/auth.mjs` models the shared LexyOS login boundary: tenant, SSO provider, user membership, role, permission, and matter access.
- Attorney sessions can prepare/submit approved filings; agent sessions can prepare work but cannot submit filings or bypass gates.
- Matter access is tenant-scoped by default and can be narrowed to explicit matter IDs for B2B/client-facing roles.
- API stubs filter `/matters`, `/tasks`, `/gates`, and `/audit-events` by session-accessible matter IDs.
- Gate approval now requires an authorized session with `gate:decide`; task completion validates gate status, type/action, and same-matter scope.
- Filing submission requires `filing:submit`, a valid approved filing gate for the same matter, and a passing validation result.
- Private Corpus retrieval requires an explicit matching matter ID; caller-set `allowPrivate` alone is not enough.

## PRD feature contracts now represented in code
- Foundation: durable JSON/in-memory store facade, canonical PRD collections, hash-chained audit events, gates, task queue, API stubs, canonical matter schema.
- B2B SSO: OIDC claim validation/session creation contract with issuer, audience, expiry, verified email, domain, and membership checks.
- Agent Admin OS/Cockpit: durable agent run lifecycle, tool allowlists, tool-call audit contracts, intake task creation, gate-aware completion, cockpit metrics, UI status panels, and operational view model.
- Intake/Admin: web/email/fax/call/text classification, matter draft creation, conflict/representation gates, payment/work authorization task, and missing-info workflow.
- Practice Packs: QDRO/family manifest plus estate planning, probate, bankruptcy, and DUI starter packs with fact schema, templates, deadline rules, corpus scopes, and stage criteria.
- LexyFiling: packet creation, validation, approval gate, manual submit connector, receipt/status ingestion, and tool registry for prepare/validate/request approval/submit/status/receipt.
- Lexy Corpus: source model, scoped retrieval, quote verification, unsupported-answer refusal, public/private boundary, and LexyOS search bridge. Full all-cases/statutes ingestion/annotation is intentionally deferred and not a launch blocker.
- Process Serving: service requirement model, packet assembly, service approval gate, vendor task, sent/proof lifecycle, proof review gate, proof-to-filing handoff, stale/failed escalation.
- Document generation: template data validation, generation request payload, document rendering artifact, attorney-review gate, Adeu tracked-change application primitive.
- Threat/license: clean-room license-boundary memo and security threat model contracts.

## Kanban execution state
- Board `lexyos` contains implementation cards for every PRD feature plus dependency-gated integration, spec, security, Otto, and GitHub PR cards.
- Packaging card `t_e32d1c81` supersedes the earlier “do not publish” note after Willie explicitly authorized standalone GitHub staging/live deployment. Publication remains clean-room and excludes Mike/PIP/Lawvable code and live Peacock Drive IDs/secrets.

## Runtime product backend decisions and receipts
- `npm start` now runs `node src/server.mjs`, a local Node HTTP server that serves the cockpit UI and same-origin JSON APIs. It binds to `127.0.0.1:5174` by default and does not call external services.
- Persistence is JSON-file backed through the existing store facade. Default mutable state is `data/lexyos.json`; `npm run reset:data` rebuilds it from `data/seed.json`; tests override `LEXYOS_DATA_PATH`/constructor data paths with temp files.
- API workflows now cover matters, matter files, document generation requests/artifacts, gates approve/reject, tasks, hash-chained audit events, filing packet/status/submission, corpus search with explicit unsupported refusal, and service packet/send/proof lifecycle.
- Browser cockpit is now API-only: it no longer imports `src/*`, embeds demo matters/files, or shows fake success when the backend is unavailable. API errors render in `#error-panel`.
- Gate decisions update matching task state as persistent API state: approved gates mark matching gate-bound tasks `approved`, rejected gates mark them `blocked`, and audit metadata records affected task IDs.
- UI workflows wired to live endpoints: matter selection from `/api/matters`, drilldown files from `/api/matters/:id/files`, document generation + artifact persistence, gate approve/reject, filing prepare/submit, corpus search, service prepare/send/proof, task panels, and visible audit trail.
- Receipt: strict RED test `node --test tests/product-ui-workflows.test.mjs` failed before UI implementation because the browser app imported server modules/static demo data and lacked workflow controls; it passes after implementation.
- Receipt: `npm test` passes 55/55 after adding `tests/product-ui-workflows.test.mjs` and extending `tests/product-backend.test.mjs` for gate-to-task persistence.
- Runtime smoke receipt on temp `LEXYOS_DATA_PATH`, port 5198: health=ok, `/`=200, `/public/app.mjs`=200, matter_count=2, generated artifact rendered, task_status=approved after gate approval, filing=submitted, corpus=True, service=sent, audit_events=11.

## Runtime proof hardening — 2026-05-25
- Product decision: workflow buttons now promote the gate they just created into `state.selectedGate` before refresh. This prevents stale/pending gates from hijacking the next Approve action and gives the local cockpit a deterministic document -> approve, filing -> approve -> submit, and service -> approve -> send flow.
- RED receipt: `node --test tests/product-ui-workflows.test.mjs` failed on `workflow actions promote their newly created approval gate to the selected gate` before the UI fix.
- GREEN receipt: `node --test tests/product-ui-workflows.test.mjs` passes 4/4 after the fix.
- Full suite receipt: `npm test` passes 56/56.
- Local server receipt: `PORT=5199 LEXYOS_DATA_PATH=$(mktemp -d)/lexyos.json npm start` served `http://127.0.0.1:5199` with seed-backed persistent JSON at `/var/folders/fb/n0drdntn5d15lmxd1h1zn7w00000gn/T/tmp.5BA0jEBULI/lexyos.json` during curl proof.
- Curl proof receipts: `GET /api/health` returned `status=ok`; `GET /` returned HTTP 200 with 2876 bytes; `GET /public/app.mjs` returned HTTP 200 with 17977 bytes; `GET /api/matters` returned two matters (`Q-2026-001`, `INTAKE-2026-002`).
- API workflow receipts: document request `docgen_Q-2026-001_runtime-qdro` created pending gate `gate_docgen_Q-2026-001_runtime-qdro`; artifact `artifact_docgen_Q-2026-001_runtime-qdro` rendered; approving the gate persisted task `runtime-review-task` from `ready` to `approved`; filing packet `runtime-filing` validated and submitted with receipt `manual-runtime-filing`; corpus search returned `supported=True` with one citation; service packet `runtime-service` was prepared, approved, and sent with tracking `TRACK-RUNTIME-001`; audit trail reached 11 events.
- Playwright UI smoke receipt: `/opt/homebrew/opt/python@3.14/bin/python3.14 scripts/ui-smoke-proof.py` drove the browser through matter load, document artifact generation, gate approval, filing prepare/approve/submit, service prepare/approve/send/proof, corpus search, and Eva tracked-change proposal with an empty `#error-panel`. Screenshot captured at `proof/lexyos-ui-smoke.png`.
## Final product gate hardening — 2026-05-25
- Otto blocker status: resolved locally after gap cards `t_9c53fd7a` and `t_d27c52f4` completed. The product HTTP surface no longer uses a hardcoded `systemSession`; protected endpoints resolve an Authorization bearer token or `x-lexyos-session-id` against the JSON-backed `sessions` collection and return 401/403 for missing, invalid, unauthorized, or cross-matter access.
- Product decision: `createLexyProductServer` / `createLexyProductApp` accept an injectable `sessionResolver` for tests and future OIDC/JWT adapters. The default local resolver uses seed-backed session `local-dev-owner`, and the browser cockpit sends `x-lexyos-session-id` from `localStorage` with a `local-dev-owner` default so the local app remains runnable without external identity services.
- Product decision: tasks can now carry explicit `gateId`; gate-decision propagation and existing-decision lookup match `gateId` first and retain type/action fallback only for backward compatibility.
- Receipt: targeted HTTP/security/backend test run `node --test tests/security-boundaries.test.mjs tests/security-hardening.test.mjs tests/product-backend.test.mjs` passes 14/14.
- Receipt: full local suite `npm test` passes 60/60.
- Runtime receipt: `PORT=5203 LEXYOS_DATA_PATH=$(mktemp -d)/lexyos.json npm start` served `http://127.0.0.1:5203` from seed-backed persistent JSON at `/var/folders/fb/n0drdntn5d15lmxd1h1zn7w00000gn/T/tmp.OS0teeyplj/lexyos.json` during final proof.
- Runtime proof receipts: `GET /api/health` returned `status=ok`; `GET /` and `/public/app.mjs` returned HTTP 200; unauthenticated `GET /api/matters` returned HTTP 401; authenticated `GET /api/matters` returned two matters (`Q-2026-001`, `INTAKE-2026-002`).
- API workflow receipts with authenticated local session: document request `docgen_Q-2026-001_final-qdro-1779727158` created gate `gate_docgen_Q-2026-001_final-qdro-1779727158`; artifact `artifact_docgen_Q-2026-001_final-qdro-1779727158` rendered; explicit-gate task `final-gate-task-1779727158` moved `ready` -> `approved`; filing `final-filing-1779727158` submitted with receipt `manual-final-filing-1779727158`; service `final-service-1779727199` sent with tracking `TRACK-FINAL-001`; corpus search returned `supported=True` with one citation; audit trail reached 13 events.

## Remaining product gaps
- Live Google Drive/no-code DB credentials are deployment-time env values, not OSS defaults. The storage provider boundary is implemented and tested; a hosted deployment still needs `LEXYOS_DRIVE_ROOT_FOLDER_ID` injected on Hetzner and a GOG-compatible Drive command surface available at runtime.

## Google Drive universal storage adapter — 2026-05-25
- Product decision: Google Drive is now treated as a universal storage adapter, not a local-build blocker. `createMatterStorageAdapter` can select `mock`, `local`, or `google_drive` providers; `createLexyProductServer` accepts an injectable `storageAdapter` and defaults to local JSON-backed files for runnable OSS/product dev.
- Scope guard: selected-matter-only file scoping is enforced at the adapter and HTTP API boundary. Drive list/download/upload calls use the matter folder ID and do not fall back to the root folder; missing folders return explicit blocked/no-op responses.
- Live adapter boundary: Google Drive mode uses a GOG command wrapper (`--account team drive ...`) behind request primitives. No Peacock-specific folder IDs are required or committed for OSS mode; `.env.example` and `config/integrations.json` document env-driven live configuration.
- RED receipts: `npm test -- tests/storage.test.mjs` failed before implementation because `createLocalMatterStorage`/`createMatterStorageAdapter` did not exist; `node --test tests/product-backend.test.mjs` failed before server wiring because `/api/matters/:id/files` bypassed the injected adapter.
- GREEN receipts: targeted run `node --test tests/product-backend.test.mjs tests/storage.test.mjs` passes 9/9; full suite `npm test` passes 64/64.
- Runtime receipt: local server on `PORT=5207` returned `health_status=ok`, `matter_count=2`, listed Q1 files `file-jane-q1` and `file-jane-judgment`, accepted local upload `runtime-storage-proof` with `source=local` and `matterId=Q-2026-001`, then listed the uploaded file only under the selected Q1 endpoint.

## Standalone GitHub packaging and CI — 2026-05-25
- Product decision: LexyOS is now packageable as a standalone repository/product (`peacockesq/lexyos`) instead of only living as a local artifact under Hermes project artifacts. `package.json` is publishable metadata (`private:false`, MIT license, Node >=22), while `.gitignore`/`.dockerignore` prevent `.env`, mutable state, proof screenshots, and local dependencies from shipping.
- Runtime packaging: added `Dockerfile` and `compose.yaml` for the existing VPS/Docker Compose path. The container binds `HOST=0.0.0.0`, exposes `PORT=5174`, persists `/app/data`, resets seed data at build time, and includes a healthcheck against `/api/health`.
- CI/release automation: added `.github/workflows/ci.yml` with Node tests, HTTP smoke, Docker build/container smoke, and Playwright cockpit smoke artifact upload. Added `.github/workflows/deploy-hetzner.yml` as a manual deployment workflow for lexy-hetzner-01 (`37.27.49.209`) requiring GitHub SSH secrets instead of committed credentials.
- Receipts added to docs: README now documents OSS/local vs hosted product mode, Docker Compose, storage adapter env vars, GitHub Actions, and Hetzner deployment prerequisites. `scripts/http-smoke.mjs` verifies health, auth boundary, seeded matters, and selected-matter file listing against a temp JSON data path.
- Safety: no client contacts, no law-firm legal file mutation, no live Drive folder IDs/tokens committed.

## Open integration decisions
- Confirm exact no-code DB: NocoDB vs Airtable vs Twenty/Apiary table.
- Confirm whether folder IDs should be written back to the DB by LexyOS or remain owned by the existing automation.
- Confirm whether production should call `gog --account team drive ...` directly on Hetzner or an n8n webhook facade.
