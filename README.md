# Client Trends

Internal dashboard for managing and monitoring company clients — see `PRD.md`
(product spec) and `tasks.md` (implementation checklist) for the full
requirements and build plan. Both files are gitignored; they're working docs,
not shipped product.

## Stack

Astro (pages/layouts) + Hono (all `/api/*` and `/partials/*` logic, mounted
into Astro via catch-all endpoints) + HTMX + Alpine.js + Tailwind CSS,
deployed as a single Cloudflare Worker, with Supabase (Postgres) as the
database and HubSpot as the external CRM data source. See PRD §16–§19 for the
full architecture rationale.

## Local setup

1. `npm install`
2. Copy `.dev.vars.example` to `.dev.vars` and fill in real values (Supabase,
   HubSpot, Cloudflare Access). Leave the `CF_ACCESS_*` vars blank locally —
   auth falls back to a fixed dev identity (`dev@localhost`) when they're
   unset (see `src/server/access.ts`).
3. `npm run generate-types` — regenerates `worker-configuration.d.ts` from
   `wrangler.jsonc` + `.dev.vars` (gitignored, environment-dependent; run
   this after every clone and after changing either file).
4. `npm run dev`

## Database

SQL migrations live in `supabase/migrations/`, following the Supabase CLI's
naming convention. To apply them against a real project:

```sh
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

(Creating the actual Supabase project is a manual step in the Supabase
dashboard/CLI — not something run from this repo.)

## Performance metrics sync

The HubSpot-sourced Performance metrics are computed from each company's
`her_journey_org_data` file by `scripts/sync_org_data.py`, not by the Worker.
It runs daily for every client via `.github/workflows/org-data-sync.yml`
(trailing 3 months), which needs the `HUBSPOT_API_TOKEN`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` repository secrets. To run it by hand:

```sh
python3 scripts/sync_org_data.py --all              # every client, 12 months
python3 scripts/sync_org_data.py --client-id <uuid> --dry-run
```

## Commands

| Command                | Action                                              |
| :---------------------- | :--------------------------------------------------- |
| `npm run dev`            | Local dev server at `localhost:4321`                  |
| `npm run build`          | Production build to `./dist/`                        |
| `npm run preview`        | Preview the production build locally                  |
| `npm run astro check`   | Type-check the project                                |
| `npm run generate-types` | Regenerate `worker-configuration.d.ts`                |
