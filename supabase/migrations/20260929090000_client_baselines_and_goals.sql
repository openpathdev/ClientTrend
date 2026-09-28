-- Client header Baseline vs. Goal pairs for Clients and AM/AD. Baselines are
-- manually entered; goals are HubSpot-owned (synced from the company
-- properties hj_new_client_goal / hj_amad_goal) — the hubspot_ prefix marks
-- them as sync-owned, never hand-edited.
alter table clients
	add column baseline_clients integer check (baseline_clients >= 0),
	add column baseline_amad integer check (baseline_amad >= 0),
	add column hubspot_new_client_goal integer,
	add column hubspot_amad_goal integer;

insert into hubspot_field_mappings (hubspot_object, hubspot_property, target_table, target_column, notes) values
	('company', 'hj_new_client_goal', 'clients', 'hubspot_new_client_goal', null),
	('company', 'hj_amad_goal', 'clients', 'hubspot_amad_goal', null);
