# TuitionTracker Option A: GitHub Live Database Backend

This is a Render-compatible Node/Express scaffold for the GitHub-backed architecture.
Supabase remains only the identity provider: the backend verifies each bearer token with
Supabase Auth, then reads/writes application records through the GitHub Contents API.

## Storage layout

Each repository in `GITHUB_REPOS` is a storage shard:

```text
.tuition/registry.json        # repository pool, status, measured size
.tuition/manifest.json        # record -> repository/path mapping
records/<table>/<record-id>.json
```

The first registry repository is used as the control plane. New records are placed into
the first repository below `STORAGE_SWITCH_THRESHOLD_BYTES`; when it is full, the next
repository is selected. The manifest keeps old locations available after a switch.

## Required Render environment variables

Copy `.env.example` into Render Environment Variables. Use a fine-grained GitHub token
with **Contents: Read and write** only for the configured private repositories. Never
put that token in the frontend or commit it to Git.

## API scaffold

- `GET /health`
- `GET /v1/storage/status` — repository pool and manifest counts
- `POST /v1/data/:table/query` — `{ filters, order, limit, single }`
- `POST /v1/data/:table/insert` — `{ record }`
- `PATCH /v1/data/:table/update` — `{ filters, changes }`
- `DELETE /v1/data/:table/delete` — `{ filters }`

All `/v1/*` routes require `Authorization: Bearer <Supabase access token>`.

## Important production hardening

This scaffold intentionally makes the repository/sharding layer visible first. Before
real users or sensitive data, add a durable distributed lock/queue, GitHub secondary-rate
limit handling, retryable commits, audit logs, encrypted backups, and a complete table-
level authorization policy. GitHub commit history also means normal file deletion is not
cryptographic erasure; keep this limitation in the product privacy policy.
