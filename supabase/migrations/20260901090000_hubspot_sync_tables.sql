-- Phase 6 (HubSpot Integration) — sync bookkeeping tables (PRD §14/§20).
-- `clients.hubspot_company_id`/`hubspot_sync_status`/`hubspot_synced_at`
-- and `csms.hubspot_owner_id` already exist (Phase 1 foundation), so this
-- migration only adds the mapping/logging tables.

-- Declarative mapping of "which HubSpot property feeds which Supabase
-- column/metric" — lets the sync job (and this migration's seed data) stay
-- data-driven rather than hardcoding property names in application code.
-- `her_journey_org_data` is intentionally NOT represented here: it isn't a
-- simple property->column mapping (it's a file property requiring session-
-- level aggregation per month, done by a separate offline script — see
-- scripts/sync_org_data.py) — this table only covers direct property syncs.
create table hubspot_field_mappings (
	id uuid primary key default gen_random_uuid(),
	hubspot_object text not null check (hubspot_object in ('company', 'owner')),
	hubspot_property text not null,
	target_table text not null,
	target_column text not null,
	notes text,
	created_at timestamptz not null default now()
);

create unique index hubspot_field_mappings_object_property_idx
	on hubspot_field_mappings (hubspot_object, hubspot_property);

insert into hubspot_field_mappings (hubspot_object, hubspot_property, target_table, target_column, notes) values
	('company', 'name', 'clients', 'name', null),
	('company', 'domain', 'clients', 'website', null),
	('company', 'service_area_population', 'clients', 'population', null),
	('company', 'domain_authority', 'clients', 'domain_authority', null),
	('company', 'csm', 'clients', 'csm_id', 'Value is a HubSpot Owner ID; resolved against csms.hubspot_owner_id, not written directly'),
	('owner', 'id', 'csms', 'hubspot_owner_id', 'Owners API sync, run before Companies each cycle so csm resolution above has fresh data');

-- One row per scheduled/manual sync execution — lets the UI show "last
-- sync: succeeded/failed, N clients processed" without scanning the
-- per-client log table.
create table hubspot_sync_runs (
	id uuid primary key default gen_random_uuid(),
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
	clients_processed integer not null default 0,
	clients_failed integer not null default 0,
	error_summary text
);

-- Per-client, per-run outcome — the detail behind hubspot_sync_runs, and
-- what `clients.hubspot_sync_status`/`hubspot_synced_at` summarize.
create table hubspot_sync_log (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid not null references hubspot_sync_runs (id) on delete cascade,
	client_id uuid not null references clients (id) on delete cascade,
	status text not null check (status in ('synced', 'error', 'unmatched')),
	detail text,
	created_at timestamptz not null default now()
);

create index hubspot_sync_log_sync_run_id_idx on hubspot_sync_log (sync_run_id);
create index hubspot_sync_log_client_id_idx on hubspot_sync_log (client_id);
