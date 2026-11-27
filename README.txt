TUITION TRACKER - OPTION A ONLY

The application now uses GitHub private repositories as the live application-data store.
Supabase is retained only for Auth: registration, login, email verification, password
reset and access-token identity verification at the Render backend.

Website files:
  index.html              the whole app (all 7 languages are inside)
  github-adapter.js       Supabase Auth + Render/GitHub data adapter
  manifest.webmanifest    lets the phone install it like an app
  sw.js                   service worker (offline shell)
  privacy.html            privacy policy (replace CONTACT_EMAIL_HERE with your email)
  icon-192.png, icon-512.png, apple-touch-icon.png, favicon.png   app icons

Backend:
  github-live-backend/    Render-compatible Node backend
  OPTION-A-ARCHITECTURE.md  architecture and limitations

GitHub storage layout:
  .tuition/manifest.json
  records/<table>/<record-id>.json
  __files__ records for homework uploads

Setup:
  1. Deploy github-live-backend to Render using render.yaml.
  2. Configure all variables in github-live-backend/.env.example.
  3. Put the Supabase public anon key and Render backend URL in github-adapter.js.
  4. Give the GitHub fine-grained token Contents: Read and write access only to the
     configured private repositories.
  5. Keep SUPABASE_SERVICE_ROLE_KEY only in Render server environment variables. Never
     put it in the frontend or GitHub repository.
  6. Configure Supabase Auth Site URL/redirect URL for the static website URL.
  7. Upload the frontend files to the static host.

Option B removed:
  Supabase PostgreSQL, Supabase Storage and the old SQL setup files are not part of this
  package. The application data path is Render backend -> GitHub repositories.

Important limitations:
  GitHub commits are not database transactions. Before production traffic, add a
  distributed lock/queue, SHA conflict retries, rate-limit backoff, audit logging,
  encrypted backups and a documented data-erasure process. Deleting a file does not
  remove its old Git history.

User isolation requirement:
  Do not deploy the earlier global-record scaffold for real users. The required final
  model is documented in USER-FILE-ISOLATION.md: users/<user-uuid>.json files plus
  backend-controlled class projections/ACLs. GitHub cannot enforce per-file permissions
  itself, so users must never receive the GitHub token or raw repository URLs.
