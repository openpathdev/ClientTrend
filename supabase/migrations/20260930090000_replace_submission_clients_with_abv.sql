-- Replace "Hubspot Submission Clients" with a manually-entered "ABV" row in
-- the same Bottom of Funnel slot (2026-09-30 user request). The old metric
-- is deactivated rather than renamed or deleted: its existing values are
-- HubSpot submission counts, not ABV, so they must not show up under the
-- new label, but are kept rather than destroyed. scripts/sync_org_data.py
-- no longer computes it.
update monthly_metrics set active = false where key = 'hubspot_submission_clients';

insert into monthly_metrics (key, label, value_type, source, group_label, sort_order) values
	('abv', 'ABV', 'text', 'manual', 'Bottom of Funnel', 16);
