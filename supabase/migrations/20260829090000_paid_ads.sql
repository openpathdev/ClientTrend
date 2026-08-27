-- Phase 5: Paid Ads (PRD §11/§20).
--
-- Same metric/value shape as monthly_metrics/monthly_data_values, kept as
-- a separate table pair rather than unified (PRD §11 reasoning: Paid Ads
-- is 100% manual today, Monthly Data may become partially HubSpot-sourced,
-- mixing them would force awkward per-row source flags). All 6 metrics
-- are manual/text-typed — "CPC <$10" and "CTR >5%" are literal labels
-- (the threshold is descriptive, not enforced/colored — confirmed
-- 2026-08-29, superseding nothing since the original decision was "plain
-- metric, no enforcement," which still holds; only the label wording
-- changed to include the threshold text).
--
-- ad_spend_per_month / paid_ads_go_live_date are simple manually-entered
-- client fields (not derived from any metric or external source),
-- confirmed 2026-08-29.

create table paid_ads_metrics (
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

create trigger paid_ads_metrics_set_updated_at
	before update on paid_ads_metrics
	for each row
	execute function set_updated_at();

insert into paid_ads_metrics (key, label, value_type, source, sort_order) values
	('initiation_rate', 'Initiation Rate', 'text', 'manual', 1),
	('lead_rate', 'Lead Rate', 'text', 'manual', 2),
	('leads_text', 'Leads, Text', 'text', 'manual', 3),
	('sessions_clicks', 'Sessions / Clicks', 'text', 'manual', 4),
	('cpc', 'CPC <$10', 'text', 'manual', 5),
	('ctr', 'CTR >5%', 'text', 'manual', 6);

create table paid_ads_data_values (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	metric_id uuid not null references paid_ads_metrics (id),
	month date not null,
	value numeric,
	value_text text,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (client_id, metric_id, month)
);

create trigger paid_ads_data_values_set_updated_at
	before update on paid_ads_data_values
	for each row
	execute function set_updated_at();

create index paid_ads_data_values_client_id_month_idx on paid_ads_data_values (client_id, month);

alter table clients
	add column ad_spend_per_month numeric,
	add column paid_ads_go_live_date date;

alter table paid_ads_metrics enable row level security;
alter table paid_ads_data_values enable row level security;
