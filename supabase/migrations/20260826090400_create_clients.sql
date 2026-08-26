-- Clients — the root entity (PRD §6/§20). Name, website, population,
-- domain_authority, and csm_id are all HubSpot-owned (read-only in the UI,
-- written only by the Phase 6 sync job — PRD §14/§15); legal_status and
-- status_id are Client-Trends-owned/manual.
--
-- Clients are only ever created via the HubSpot-company import flow
-- (PRD §14/§36) — there is no standalone manual-creation path — so
-- status_id has no default here; the application always supplies one
-- (the seeded "1" status, per the Phase 6 import task) at insert time.

create table clients (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	website text,
	population integer,
	domain_authority numeric,
	legal_status text,
	csm_id uuid references csms (id),
	status_id uuid not null references statuses (id),
	state_code text references states (code),
	hubspot_company_id text unique,
	hubspot_sync_status text check (hubspot_sync_status in ('synced', 'error', 'unmatched')),
	hubspot_synced_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
	before update on clients
	for each row
	execute function set_updated_at();

create index clients_status_id_idx on clients (status_id);
create index clients_csm_id_idx on clients (csm_id);
create index clients_state_code_idx on clients (state_code);
