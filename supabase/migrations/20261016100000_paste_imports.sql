-- One row per spreadsheet paste into the Performance / Paid Ads grids
-- (2026-10-16). `changes` holds each written cell's before and after
-- values, so the paste can be undone, and doubles as a record of who
-- pasted what. Shape: [{ metric_id, month, old_value, old_value_text,
-- old_updated_by, new_value, new_value_text }].
create table paste_imports (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	section text not null check (section in ('monthly_data', 'paid_ads')),
	changes jsonb not null,
	created_by text not null,
	created_at timestamptz not null default now(),
	undone_at timestamptz,
	undone_by text
);

create index paste_imports_client_id_created_at_idx on paste_imports (client_id, created_at desc);

alter table paste_imports enable row level security;
