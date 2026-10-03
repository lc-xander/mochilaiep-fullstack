# Supabase migration infrastructure

This directory is an isolated migration workspace. It does not replace or modify the application at the repository root. It contains only Supabase schema, seed data, Edge Functions, tests, migration utilities, and design notes.

## Current legacy contracts

- MySQL tables: `groups`, `subjects`, `schedule`, `users`, `access_codes`, and a MySQL-backed session store.
- Students authenticate with username/password; the application hashes passwords with Argon2 and keeps roles/groups in `users`.
- A student's schedule is derived from the authenticated profile's `group_id`; the client must never select another group's schedule.
- Activation codes are one-use, normalized before SHA-256 hashing, and associated to a group.
- The legacy seeder is destructive: it deletes users, codes, schedules, subjects, and groups before reseeding. It must not be used as a production export/import tool.
- The tracked legacy seed contains sample activation codes and local default account settings. Neither is imported here.

## Layout

- `supabase/migrations/`: PostgreSQL schema, RLS, grants, and security-definer RPCs.
- `supabase/seed.sql`: idempotent public reference groups, subjects, and timetables only.
- `supabase/functions/`: server-side activation, username login, and admin code operations.
- `supabase/tests/`: pgTAP authorization and RPC tests, run against local Supabase/PostgreSQL.
- `scripts/`: read-only migration/export utilities. Export output belongs outside Git and must be handled as sensitive.
- `test/`: Node tests for migration assets that do not need a database.

## Database model and access rules

- `school_groups` stores the ten source group codes (`1A` through `3C`) with stable natural names; foreign keys use generated IDs, so imports map by group name, never assume MySQL IDs survive.
- `subjects` stores the normalized subject dictionary.
- `schedule` preserves the existing `group + day + subject` model and prevents duplicate triples. The current comparison logic compares sets, so source subject order is not represented.
- `profiles.id` references `auth.users.id`; it stores username, role, active status, and server-assigned group membership. It never stores an Auth password hash.
- `activation_codes` stores only a SHA-256 hash, status timestamps, group, and consuming profile. RLS exposes safe status columns to admins, not `code_hash`.
- RLS gives active students schedule rows only for their own profile group. Admin-only changes are enforced in policies/RPCs as well as in Edge Functions.
- The service-role key is used only by the unauthenticated activation Edge Function to create an Auth identity and call the restricted activation RPC. It must never be in a browser bundle or client-visible variable.

The activation function creates the Auth user first, then calls a service-role-only RPC that locks the code row, checks it is still available, creates the student profile, and marks the code used in one PostgreSQL transaction. If that RPC fails, the function deletes the newly created Auth user as compensation. An interrupted function can leave an Auth identity without a profile; login must reject identities without an active profile, and a maintenance query should report these orphans for cleanup.

Admin code generation uses cryptographic randomness in an Edge Function. The hash is inserted through an authenticated RPC that independently checks `auth.uid()` against an active admin profile. Revocation uses a separate admin-checked RPC. The raw code is returned once in the generation response and never logged or persisted.

## Local validation

From this directory, with Supabase CLI and Docker installed:

```sh
supabase start
supabase db reset
supabase test db
supabase functions serve --env-file .env.local
```

The current environment did not have Supabase CLI, Docker, Deno, or `psql`, so the SQL cannot yet be truthfully reported as executed against PostgreSQL. Node-only asset tests can run with:

```sh
node --test test/*.test.js
```

Before applying migrations to a hosted project, validate on a disposable local project, review the generated diff, and confirm the RLS tests pass. Do not apply `seed.sql` to production: it contains reference timetable data, not an import of live account or code state.

## Safe legacy-data strategy

1. Take a read-only, encrypted backup of the actual MySQL database and record source row counts. Never run the legacy `npm run db`/seed path as an export operation.
2. Export groups, subjects, schedule, user metadata (`username`, role, group name, active state, timestamps), and code status. Exclude all `password_hash` values. Code hashes are sensitive and must stay in a protected temporary export, never in a committed migration or terminal transcript.
3. Import in dependency order: groups mapped by code/name, subjects, schedule, then profile metadata and activation-code hashes/status. Reconcile counts and foreign keys after each phase.
4. Do not import the sample codes embedded in the old seeder. Decide whether actual unused/used/revoked code states should be imported or whether all legacy unused codes should be revoked and replaced with newly generated codes.
5. Create Supabase Auth identities separately from public profile metadata. Existing Argon2 hashes are not assumed importable. The password migration method remains a decision pending; options include a forced password reset/re-activation or another explicitly tested migration path.
6. Create at least one admin using a controlled, one-time bootstrap procedure. The public signup/activation path must always create `student` profiles and must not accept role/group assignment from client metadata.
7. Compare ten group codes, subject totals, per-group/per-day schedule triples, student metadata counts, and code-state counts before any application cutover. The current app remains untouched during this phase.

## Variables for a future local Supabase environment

Use an untracked local env file; do not copy values from the root `.env` or `.env.example`.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or the project's publishable key)
- `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions only; secret)
- `AUTH_EMAIL_DOMAIN` (synthetic Auth identity domain for username-based accounts; validate Supabase Auth acceptance before deciding)
- `APP_ORIGIN` (CORS allowlist for the future browser integration)
- `LEGACY_DB_HOST`, `LEGACY_DB_PORT`, `LEGACY_DB_USER`, `LEGACY_DB_PASSWORD`, `LEGACY_DB_NAME` (migration utility only)

No secret values are included in this directory. The username-to-Auth-identity mapping is intentionally a design decision to validate before changing any existing form or client call.

## Decisions required before application cutover

- Password transition for existing Argon2 accounts: forced reset/re-activation or a separately proven import route.
- Whether to preserve live activation-code states/hashes or revoke outstanding legacy codes and regenerate them.
- Whether username login will use an internal synthetic email domain (tested with Supabase Auth) or change to real email login.
- Production CORS origins, email confirmation settings, Auth rate limits, and code-generation rate limits.
- The hosted project and cutover/rollback window. No deployment or application cutover is part of this phase.
