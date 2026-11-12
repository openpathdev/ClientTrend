-- 2026-11-12: two client-page enhancements under Paid Ads.
--
-- 1. Per-client Paid Ads title. Null means the default "Paid Ads".
alter table clients
	add column paid_ads_title text check (char_length(paid_ads_title) <= 200);

-- 2. Multiple Campaigns sections per client. Each section (group) has its
-- own CSM-editable title and its own campaign rows. Deleting a section
-- deletes its rows, and their values cascade from those (cell comments
-- have no FK and are cleaned up by the app, as for a single campaign).
create table campaign_groups (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients (id),
	name text not null default '' check (char_length(name) <= 200),
	sort_order integer not null,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger campaign_groups_set_updated_at
	before update on campaign_groups
	for each row
	execute function set_updated_at();

create index campaign_groups_client_id_sort_order_idx on campaign_groups (client_id, sort_order);

alter table client_campaigns
	add column group_id uuid references campaign_groups (id) on delete cascade;

-- Existing data: one "Campaigns" section per client that already has
-- campaign rows or has the table switched on, holding all of its rows.
insert into campaign_groups (client_id, name, sort_order, created_by)
select c.id, 'Campaigns', 1, 'migration'
from clients c
where c.campaigns_enabled
	or exists (select 1 from client_campaigns cc where cc.client_id = c.id);

update client_campaigns cc
set group_id = g.id
from campaign_groups g
where g.client_id = cc.client_id;

alter table client_campaigns alter column group_id set not null;

create index client_campaigns_group_id_sort_order_idx on client_campaigns (group_id, sort_order);

alter table campaign_groups enable row level security;
