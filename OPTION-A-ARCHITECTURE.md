# Option A — GitHub repositories as live database

## Request flow

```text
TuitionTracker UI
      |
      | Supabase access token
      v
Render Node backend
      |
      +--> Supabase Auth /auth/v1/user  (identity only)
      |
      +--> GitHub Contents API
             |
             +--> Database-01 / records + manifest
             +--> Database-02 / records + manifest
             +--> Database-03 / records + manifest
```

The backend scaffold is in `github-live-backend/`. It uses a repository pool and selects
the first repository below the configured threshold. The central manifest preserves the
location of records after a repository switch. A user ID is used as the ownership key;
email addresses are never used as filenames.

## What is already scaffolded

- Render `render.yaml`, Node package and `.env.example`.
- Supabase bearer-token verification without exposing GitHub credentials.
- GitHub repository size-based shard selection.
- `records/<table>/<id>.json` record layout.
- Central manifest with repository/path locations.
- Authenticated query/insert/update/delete endpoints.
- Storage status endpoint and health endpoint.

## Before connecting the app

Fill the Render environment variables from `github-live-backend/.env.example` with the
GitHub owner, private repository names and a fine-grained token. Then deploy the backend
on Render. The browser package now uses `github-adapter.js`: Supabase is used for Auth only
and application-data reads/writes go to the Render backend. Configure its URL and public
anon key before deploying the frontend.

## Known limitations to resolve for production

GitHub commits are not a transactional database, repository file writes can race across
multiple backend instances, API rate limits apply, and deleting a file leaves Git history.
For a real rollout, use a queue/distributed lock, optimistic SHA retries, durable audit
records, table-specific authorization, and an independent backup/erasure process.
