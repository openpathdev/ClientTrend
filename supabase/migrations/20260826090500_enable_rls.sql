-- Enable RLS on every table, intentionally with zero policies.
--
-- This app has no Supabase Auth and no legitimate use of the `anon` /
-- `authenticated` roles — the only Supabase client is the Hono server
-- (Cloudflare Worker), which connects with the service_role key and
-- therefore always bypasses RLS regardless of policies present.
--
-- With RLS enabled and no policies, `anon`/`authenticated` get zero access
-- via the public PostgREST API (/rest/v1/*), while service_role continues
-- to work exactly as before. This is defense-in-depth against the
-- anon key ever being exposed, and it silences Supabase's RLS-disabled
-- security advisories, which flag every public-schema table without it.

alter table csms enable row level security;
alter table statuses enable row level security;
alter table states enable row level security;
alter table clients enable row level security;
