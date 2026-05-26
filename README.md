# LexyOS

Clean-room matter-centered legal document cockpit packaged as a standalone GitHub-ready product.

Repository target: `peacockesq/lexyos`.

LexyOS can run in two modes:

- **OSS/local mode** — Node + JSON persistence, local matter files, no external services required.
- **Hosted product mode** — the same HTTP/UI surface can be deployed with Docker Compose and switched to deployment-time adapters such as Google Drive/GOG and shared Supabase SSO without committing Peacock-specific IDs or secrets.


No Mike/PIP code is copied. This is a separate shell designed around Peacock's actual matter workflow:

- one Google Drive folder per matter;
- adapters for no-code DB/intake sources;
- baseline matter data preserved for document population;
- document workspace centered on the selected matter;
- Eva/research rail produces tracked-change proposals, not silent edits.

## Run locally

```bash
npm ci
npm run reset:data
npm test
npm run test:e2e:local
npm run smoke:http
npm start
# open http://localhost:5174/
```

`npm start` runs the local Node HTTP product backend, not a static-only file server. It serves the UI and JSON API from the same origin, with durable state in `data/lexyos.json` by default. Override the state file for isolated test/dev runs:

```bash
LEXYOS_DATA_PATH=/tmp/lexyos-dev.json npm run reset:data
LEXYOS_DATA_PATH=/tmp/lexyos-dev.json npm start
```

## Docker / hosted product packaging

LexyOS ships with a production container and Compose file. The image binds to `0.0.0.0:5174` inside the container, persists mutable JSON state in `/app/data`, and exposes `/api/health` for container and proxy checks.

```bash
cp .env.example .env
# optional: set LEXYOS_PUBLIC_PORT=5174 or LEXYOS_STORAGE_PROVIDER=mock/google_drive
docker compose up -d --build
curl -s http://127.0.0.1:5174/api/health
```

The Compose file defaults to the local storage adapter. Hosted deployments can set `LEXYOS_STORAGE_PROVIDER=google_drive`, `LEXYOS_GOG_ACCOUNT=team`, and `LEXYOS_DRIVE_ROOT_FOLDER_ID` through server or GitHub environment secrets/vars. Do not commit live IDs, tokens, or client files.

## GitHub automation

Workflows are included under `.github/workflows/`:

- `ci.yml` runs Node tests, the HTTP smoke test, Docker build/container smoke, and the Playwright matter cockpit E2E with proof artifact upload.
- `deploy-hetzner.yml` is a manual `workflow_dispatch` deploy to lexy-hetzner-01 (`37.27.49.209`) using the existing VPS + Docker Compose path. It requires `HETZNER_SSH_KEY` and optionally `HETZNER_SSH_USER` as GitHub environment/repository configuration; it does not store secrets in the repo.

## Playwright E2E proof

Matter cockpit E2E (`tests/e2e/matter-cockpit.spec.mjs`) covers: app load, matter selection, Drive/local file listing, generated document artifact, approve/reject gate flow, filing packet submit lifecycle, service send/proof lifecycle, supported/refused Lexy Corpus answers, and audit trail assertions. The test intentionally uses semantic locators and JSON-state polling; no `waitForTimeout` hacks.

Latest verification receipt (2026-05-25): local, staging, and live all passed after deploy to lexy-hetzner-01.

```bash
npm run test:e2e:local    # 1/1 passed; proof/matter-cockpit-local.png
npm run test:e2e:staging  # 1/1 passed against http://37.27.49.209:5174; proof/matter-cockpit-staging.png
npm run test:e2e:live     # 1/1 passed against http://37.27.49.209:5175; proof/matter-cockpit-live.png
```

## Hetzner staging/live runtime

Current lexy-hetzner-01 deployment receipt (2026-05-25):

- Host: `lexy-hetzner-01` / `37.27.49.209`.
- Deployed source: `peacockesq/lexyos` `main` at `1bed282ba77ecc61559c07775319f1d5af58e35d`.
- Staging: `/opt/lexyos-staging`, Compose project `lexyos-staging`, data volume `lexyos-staging_lexyos-data`, UI `http://37.27.49.209:5174/`, health `http://37.27.49.209:5174/api/health`, API `http://37.27.49.209:5174/api/matters`.
- Live: `/opt/lexyos-live`, Compose project `lexyos-live`, data volume `lexyos-live_lexyos-data`, UI `http://37.27.49.209:5175/`, health `http://37.27.49.209:5175/api/health`, API `http://37.27.49.209:5175/api/matters`.
- Health proof: both deployments returned `{ "status": "ok", "dataPath": "/app/data/lexyos.json", "product": "LexyOS local backend" }`; UI title is `LexyOS Matter Cockpit`; authenticated `/api/matters` returned HTTP 200.
- Persistence proof: proof matters `PROOF-staging-20260525T192344Z` and `PROOF-live-20260525T192344Z` were created through the API, each remained visible after `docker compose -p <project> restart lexyos`.
- Rollback pattern: `ssh root@37.27.49.209 'cd /opt/lexyos-staging && git reset --hard <previous_sha> && docker compose -p lexyos-staging up -d --build --force-recreate lexyos'` and the same command under `/opt/lexyos-live` with `-p lexyos-live`.

DNS/proxy gap: no LexyOS-specific Caddy/DNS hostname was present during this deploy pass, so the verified routes are direct HTTP port routes. Add DNS/Caddy hostnames later without changing the app/container contract.

## Storage providers

LexyOS storage is adapter-driven so the same matter/file workflow can run as OSS/local software or as a hosted product.

Providers:

- `local` — default product backend provider. Matter files are stored in the JSON data store through `src/storage.mjs`; no external services are contacted.
- `mock` — safe no-op provider for OSS/demo mode. Listing returns an empty array and upload/download requests return explicit no-op errors instead of touching Drive.
- `google_drive` — live product adapter boundary through GOG/team Google Workspace. Matter file operations are scoped to the selected matter folder (`driveFolderId` / `drive_folder_id`) and never fall back to the Drive root for file listing or downloads.

Environment sample:

```bash
cp .env.example .env
LEXYOS_STORAGE_PROVIDER=local npm start

# Safe OSS/no-op mode
LEXYOS_STORAGE_PROVIDER=mock npm start

# Live Drive product mode; do not commit real folder IDs or tokens
LEXYOS_STORAGE_PROVIDER=google_drive \
LEXYOS_GOG_ACCOUNT=team \
LEXYOS_DRIVE_ROOT_FOLDER_ID=<deployment-root-folder-id> \
npm start
```

`config/integrations.json` intentionally references env var names, not Peacock-specific Drive IDs. Hosted deployments inject `LEXYOS_DRIVE_ROOT_FOLDER_ID`; OSS/local clones do not need it.

## Shared Supabase SSO

LexyOS can run behind the shared LexyAlgo B2B Supabase identity layer. The browser fetches `GET /api/auth/config`, redirects Google Workspace or Microsoft 365 buttons to Supabase `/auth/v1/authorize`, stores the returned OAuth access token from `/auth/callback#access_token=...`, and sends protected API calls as `Authorization: Bearer <token>`. The backend validates the token against Supabase `/auth/v1/user`, maps it to an approved tenant/domain, and keeps all matter permissions tenant-bound.

Required hosted env, supplied through the deployment manager and never committed:

```bash
LEXYOS_AUTH_MODE=supabase
LEXYOS_SITE_URL=https://os.lexyalgo.com
LEXYOS_SUPABASE_URL=https://<project>.supabase.co
LEXYOS_SUPABASE_ANON_KEY=<public-anon-key>
LEXYOS_AUTH_TENANTS_JSON='[{"id":"peacock","name":"Peacock Law Firm","allowedDomains":["williepeacock.com","peacockesq.com"]}]'
LEXYOS_B2B_PRODUCTS_JSON='[{"id":"lexyfile","name":"LexyFile","url":"https://file.lexyalgo.com","role":"filing and file workspace"}]'
```

Supabase project settings must allow `https://os.lexyalgo.com/auth/callback` as a redirect URL and enable the Google and Microsoft/Azure providers with production OAuth client credentials.

## Local API surface

All endpoints are local-only unless you deliberately bind the server differently. No external services are contacted by the default local provider.

- `GET /api/health`
- `GET /api/auth/config`
- `GET /api/matters`, `POST /api/matters`
- `GET /api/matters/:matterId/files`, `POST /api/matters/:matterId/files`, `GET /api/matters/:matterId/files/download?fileId=...`
- `GET /api/document-requests`, `POST /api/document-requests`, `POST /api/document-requests/:requestId/artifacts`
- `GET /api/gates`, `POST /api/gates/:gateId/approve`, `POST /api/gates/:gateId/reject`
- `GET /api/tasks`, `POST /api/tasks`
- `GET /api/audit-events`
- `GET /api/filing-packets`, `POST /api/filing-packets`, `GET /api/filing-packets/:packetId/status`, `POST /api/filing-packets/:packetId/submit`
- `POST /api/corpus/search` (returns cited support or an explicit unsupported/refusal answer)
- `POST /api/service-packets`, `POST /api/service-packets/:packetId/send`, `POST /api/service-packets/:packetId/proof`

Example smoke call after `npm start`:

```bash
curl -s http://127.0.0.1:5174/api/health
curl -s http://127.0.0.1:5174/api/matters
```

## Current modules

- `src/matters.mjs` — normalizes matter rows and searches baseline data.
- `src/repository.mjs` — source adapter pattern for no-code DB and intake systems.
- `src/storage.mjs` — interchangeable local/mock/Google Drive matter storage adapters plus GOG Drive boundary.
- `src/eva.mjs` — Eva context and tracked-change proposal primitives.
- `src/auth.mjs` — tenant-aware B2B SSO/session/role/permission contract for unified LexyOS login.
- `src/supabaseAuth.mjs` — Supabase SSO config, OAuth authorize URL builder, Bearer-token validation, tenant/domain mapping, and LexyAlgo B2B product link contract.
- `src/oidc.mjs` — OIDC claim validation/session creation contract with issuer/audience/domain/member checks.
- `src/persistence.mjs` — durable JSON/in-memory store facade, canonical PRD collections, and hash-chained audit events.
- `src/audit.mjs` — immutable audit event log primitives.
- `src/gates.mjs` — human approval/rejection gates for filing, documents, external communications, and proof review.
- `src/tasks.mjs` — queue/task primitives, intake task creation, and cockpit metrics.
- `src/runner.mjs` — durable agent run lifecycle, tool allowlist enforcement, and tool-call audit contracts.
- `src/intake.mjs` — web/email/fax/call/text intake classification, matter draft, conflict/representation gates, and missing-info workflow.
- `src/documents.mjs` — document template, data validation, generation request, rendering artifact, attorney-review gate, and Adeu tracked-change application primitives.
- `src/filing.mjs` — LexyFiling packet validation, approval, manual connector, status, receipt, and tool-registry primitives.
- `src/corpus.mjs` — Lexy Corpus source/citation retrieval, quote verification, unsupported-answer refusal, privacy boundary, and search bridge.
- `src/practicePacks.mjs` — practice-pack manifest validation plus QDRO/family, estate planning, probate, bankruptcy, and DUI starter packs.
- `src/service.mjs` — service requirement, packet, vendor task, approval gate, sent/proof lifecycle, proof filing handoff, and failed-service escalation primitives.
- `src/cockpit.mjs` — operational cockpit view model with task/gate/filing/service/deadline/audit cards and matter drilldowns.
- `src/risk.mjs` — threat model and clean-room/license-boundary memo contracts.
- `src/api.mjs` — service stub for `/matters`, `/tasks`, `/gates`, and `/audit-events`.
- `src/server.mjs` — runnable local Node HTTP product backend for the UI plus persistent JSON API workflows.
- `data/seed.json` — resettable local seed data for matters, files, tasks, corpus sources, and empty workflow collections.
- `scripts/reset-data.mjs` — copies seed data into the active JSON data file (`data/lexyos.json` by default).
- `src/schema.mjs` — Lexy canonical matter schema split into `lexy_core`, `qdro_pack`, and `peacock_ops` classifications.
- `scripts/align_nocodb_schema.py` — idempotent NoCoDB schema alignment/backfill tool for making firm tables conform to Lexy titles.
- `public/` — Seven-design matter cockpit UI with SSO/session, filing, corpus, service, task/gate, Drive, document, and Eva panels. It hydrates matters, files, workflow receipts, and corpus answers from the local API and surfaces API errors instead of using demo/static fallback data.
- `docs/kanban-execution-plan.md` — full PRD feature coverage and review-gate plan mirrored into Hermes Kanban.
- `config/integrations.json` — first-pass Peacock integration assumptions.

## Compatibility strategy

Adapters accept multiple common field names:

| Canonical | Accepted aliases |
|---|---|
| Matter ID | `matter_id`, `id` |
| Client display name | `client_display_name`, `client_name`, `name` |
| Matter type | `matter_type`, `type` |
| Stage | `stage`, `status` |
| Drive folder | `drive_folder_id`, `folderId` |
| Baseline data | `baseline_data`, `data`, plus unknown scalar fields |

Peacock's live NoCoDB Cases table is intentionally bent toward the Lexy contract. Shared fields use snake_case titles. QDRO-specific reusable fields live in `qdro_pack`; Peacock-only routing/status residue remains as legacy operational fields and is read through canonical-first fallback helpers where needed.

This keeps the shell compatible with NocoDB/Airtable/Twenty/intake webhook exports without making the UI care which system currently owns the record.

## Next production wiring

1. Inject the selected no-code DB adapter env values (`LEXY_NOCODB_*` or a future adapter) in hosted environments.
2. For live Drive product mode, set `LEXYOS_STORAGE_PROVIDER=google_drive`, `LEXYOS_GOG_ACCOUNT=team`, and `LEXYOS_DRIVE_ROOT_FOLDER_ID` through server/GitHub secrets or environment vars.
3. Decide whether LexyOS writes `drive_folder_id` back to the DB or only reads folders created by the existing automation.
4. Add Adeu-backed tracked-change application behind the existing attorney-review gate boundary.
