-- Phase 4: Monthly Data + Comments (PRD §10/§12/§20).
--
-- Metric/value model, not one column per metric (PRD §52): new metrics are
-- a catalog insert, never a schema change. `monthly_metrics` is core
-- application data (like statuses/states), so its seed rows live in this
-- migration rather than a throwaway seed script.
--
-- Metric names renamed 2026-08-27 to match the actual "Performance" design
-- reference — see PRD §20 for the full mapping from the original Phase 0
-- names. Every metric not sourced from HubSpot is `text`-typed (PRD §20
-- decision): manual entry must stay flexible, no numeric coercion/rejection.

create table monthly_metrics (
	id uuid primary key default gen_random_uuid(),
	key text not null unique,
	label text not null,
	value_type text not null check (value_type in ('integer', 'percent', 'text')),
	min_value numeric,
	max_value numeric,
	source text not null default 'manual' check (source in ('manual', 'hubspot')),
	sort_order int not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger monthly_metrics_set_updated_at
	before update on monthly_metrics
	for each row
	execute function set_updated_at();

insert into monthly_metrics (key, label, value_type, source, sort_order) values
	('sessions', 'Sessions', 'integer', 'hubspot', 1),
	('initiations', 'Initiations', 'integer', 'hubspot', 2),
	('organic_initiation_rate', 'Organic Initation Rate', 'percent', 'hubspot', 3),
	('conversations', 'Conversations', 'integer', 'hubspot', 4),
	('convo_rate', 'Convo. Rate', 'percent', 'hubspot', 5),
	('scheduled_pct', 'Scheduled %', 'percent', 'hubspot', 6),
	('am_ad_conversations', 'AM/AD Conversations', 'integer', 'hubspot', 7),
	('av_am_ad_conversations', 'AV/AM/AD Conversations', 'integer', 'hubspot', 8),
	('walk_ins', 'Walk-Ins (AV/AM/AD only)', 'text', 'manual', 9),
	('phone_calls', 'Phone Calls (AV/AM/AD only)', 'text', 'manual', 10),
	('form_fills', 'Form Fills (if separate system)', 'text', 'manual', 11),
	('center_feedback_new_clients', 'Center feedback new clients', 'text', 'manual', 12),
	('pregnancy_tests', 'Pregnancy Tests', 'text', 'manual', 13),
	('ultrasounds', 'Ultrasounds', 'text', 'manual', 14),
	('center_feedback_am_ad', 'Center feedback AM/AD', 'text', 'manual', 15);

create table monthly_data_values (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	metric_id uuid not null references monthly_metrics (id),
	month date not null,
	value numeric,
	value_text text,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (client_id, metric_id, month)
);

create trigger monthly_data_values_set_updated_at
	before update on monthly_data_values
	for each row
	execute function set_updated_at();

create index monthly_data_values_client_id_month_idx on monthly_data_values (client_id, month);

-- Comments are month+section scoped, not per metric cell (PRD §12) —
-- 'monthly_data' now, 'paid_ads' reuses the same table in Phase 5.
create table comments (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	section text not null check (section in ('monthly_data', 'paid_ads')),
	month date not null,
	body text not null,
	created_by text not null,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger comments_set_updated_at
	before update on comments
	for each row
	execute function set_updated_at();

create index comments_client_id_section_month_idx on comments (client_id, section, month);

alter table monthly_metrics enable row level security;
alter table monthly_data_values enable row level security;
alter table comments enable row level security;
