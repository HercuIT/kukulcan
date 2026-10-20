---
name: kukulcan-db-change
description: Make a Supabase database change in Kukulcan — a new migration (tables, columns, RLS, grants, triggers, RPC functions), its PGlite tests, the src/backend wrapper and mapper, and the docs. Use for any change under supabase/migrations/, or when a ticket needs a new table, column, policy or server-side rule.
---

# Kukulcan database change

The database is Supabase Postgres, project `xiidwepvvjcqyhywmdrn`. Every merge to `main` that touches `supabase/` runs `supabase db push` automatically, so a migration that merges reaches production.

## 1. Inspect first

- Read the relevant existing migrations in `supabase/migrations/`, newest last.
- If the read-only `supabase` MCP server is available, check the live schema (`list_tables`, `list_migrations`) and the advisors. Never write through MCP: changes ship only as migration files.

## 2. Write a new migration

- Always add a new file in `supabase/migrations/` (timestamped, with a descriptive name such as `hte_107_profile_on_confirm`). Never edit a migration that has already been applied.
- Make it safe on live data. If it relies on a condition about existing rows, check that condition and `raise exception` when it fails (as HTE-107's migration refuses to run while unconfirmed users exist). Backfill or default new columns, and handle old rows (for example `connections` is `null` on older workflows).
- Turn on RLS on every new table. Write policies per operation (`select`/`insert`/`update`/`delete`) and use `auth.uid()`.

## 3. Follow the project's security model

- Clients may update only a workflow's `name`, `nodes` and `connections`, and only while they are one of its designers (`workflow_designers`) and its status is `draft` or `changes_requested`. Enforce that with RLS and column grants. Don't widen it unless the spec says so.
- Every other state change is a `security definer` RPC that rechecks the rules inside: the caller's session, role (from `profiles`: `designer`, `reviewer`, `deployer`) and the workflow's status. Set `search_path` on these functions, and grant `execute` only to the roles that need it.
- Raise the fixed error codes only: `28000` no session, `42501` no permission, `P0002` not found, `P0001` wrong status. Map any new case to one of these in `src/backend/mappers.js`.
- Clients never change roles. Service-role-only functions (like `migrate_workflow`) revoke `execute` from `anon` and `authenticated`.

## 4. Test it with PGlite (no Docker)

Add tests in `supabase/tests/` and run `npm run test:node`. Cover at least:
- the allowed path for the right role and status;
- each denial: no session, wrong role, not a designer or not the assigned reviewer, wrong status, and editing a column that isn't allowed;
- the error code each denial returns;
- old rows after the migration (nulls, defaults, backfill).

## 5. Wire it into the app

- Add RPC wrappers and queries in `src/backend/workflowsApi.js` or `definitionsApi.js`. Components never call Supabase directly.
- Keep the shape the UI expects (`{ id, name, content: { nodes }, metadata: { … } }`) by mapping in `mappers.js`.
- If the change affects Realtime, check the subscription in the same API module.

## 6. Docs and deploy

- Update the README: Workflow lifecycle, Roles, Glossary, the RPC list.
- The `deploy_supabase.yaml` job doesn't touch Auth settings. List any dashboard step (redirect URLs, email templates, SMTP, Auth toggles) in the PR, in order. Never run `supabase config push`.
- If the job fails with a permission error, the scoped access token needs that permission. Create a new token with it added; scoped tokens can't be edited.
