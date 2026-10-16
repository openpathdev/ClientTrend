-- "Campaigns" table under Paid Ads on the client page (2026-10-17). Unlike
-- Performance and Paid Ads, whose rows come from a shared metric catalog,
-- each client has its own campaign rows, named by the CSM. Every value is
-- entered by hand. Hidden per client until a CSM switches it on;
-- switching it off only hides it, and the data is kept.
alter table clients
	add column campaigns_enabled boolean not null default false;

create table client_campaigns (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	name text not null default '' check (char_length(name) <= 200),
	sort_order integer not null,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger client_campaigns_set_updated_at
	before update on client_campaigns
	for each row
	execute function set_updated_at();

create index client_campaigns_client_id_sort_order_idx on client_campaigns (client_id, sort_order);

-- Same cell shape as monthly_data_values / paid_ads_data_values; deleting a
-- campaign deletes its values.
create table campaign_data_values (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	campaign_id uuid not null references client_campaigns (id) on delete cascade,
	month date not null,
	value numeric,
	value_text text,
	status_id uuid references statuses (id) on delete set null,
	updated_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (client_id, campaign_id, month)
);

create trigger campaign_data_values_set_updated_at
	before update on campaign_data_values
	for each row
	execute function set_updated_at();

create index campaign_data_values_client_id_month_idx on campaign_data_values (client_id, month);

-- Cell comments and paste undo records can now belong to Campaigns too.
-- comments.metric_id holds the campaign id for these, still with no FK,
-- the same as for the catalog sections.
alter table comments drop constraint comments_section_check;
alter table comments add constraint comments_section_check
	check (section in ('monthly_data', 'paid_ads', 'campaigns'));

alter table paste_imports drop constraint paste_imports_section_check;
alter table paste_imports add constraint paste_imports_section_check
	check (section in ('monthly_data', 'paid_ads', 'campaigns'));

alter table client_campaigns enable row level security;
alter table campaign_data_values enable row level security;
