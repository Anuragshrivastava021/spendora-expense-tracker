# Database migrations

`schema.sql` is the idempotent initial schema and seed for this project. Apply it with
`npm run migrate` from the workspace root (or `npm run migrate` in `backend/`).
The script uses `CREATE TABLE/INDEX IF NOT EXISTS` and safe seed upserts, so it can
be re-run during development without replacing user records.

For future schema changes, add a numbered SQL migration in this folder, keep
`schema.sql` as the clean-install schema, and update `src/migrate.js` to apply the
new migration in order inside a database transaction. Never rewrite an already
applied production migration; add a new forward-only migration instead. Back up
production data before applying schema changes.
