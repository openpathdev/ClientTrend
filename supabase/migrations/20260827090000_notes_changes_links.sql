-- Phase 3: General Notes, Changes, Links (PRD §13/§20).
--
-- General Notes is a single freeform text block per client (one editable
-- field + one "last updated" timestamp/author), not a list of separate
-- entries — per the actual client-page design reference, which shows one
-- continuous note with a single "Updated <date>" stamp, not per-paragraph
-- attribution. Simplest fit: plain columns on `clients`, same pattern as
-- `legal_status`, rather than a separate one-row-per-client table.
--
-- `changes.category` uses a CHECK constraint rather than a lookup table —
-- same reasoning as `comments.section` in Phase 1: a small, rarely-changing
-- fixed set doesn't need a dedicated config table. `changes.source`
-- defaults to 'manual' and is ready for future automatic entries (PRD §13,
-- still an open decision) without a schema change.

alter table clients
	add column general_notes text,
	add column general_notes_updated_at timestamptz,
	add column general_notes_updated_by text;

create table changes (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	change_date date not null,
	description text not null,
	category text check (category in ('Contract', 'Contact', 'Scope', 'Other')),
	source text not null default 'manual' check (source in ('manual', 'system')),
	created_by text not null,
	created_at timestamptz not null default now()
);

create index changes_client_id_idx on changes (client_id);

create table links (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	title text not null,
	url text not null,
	description text,
	category text,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger links_set_updated_at
	before update on links
	for each row
	execute function set_updated_at();

create index links_client_id_idx on links (client_id);

alter table changes enable row level security;
alter table links enable row level security;
