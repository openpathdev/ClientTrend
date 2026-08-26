-- CSMs (Client Success Managers). Roster is HubSpot-owned, synced from
-- HubSpot Owners (PRD §14, §20) — hubspot_owner_id is the sync key.

create table csms (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	email text unique,
	hubspot_owner_id text unique,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger csms_set_updated_at
	before update on csms
	for each row
	execute function set_updated_at();
