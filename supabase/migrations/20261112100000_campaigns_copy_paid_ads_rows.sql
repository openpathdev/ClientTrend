-- 2026-11-12: each Campaigns section is now one campaign — a blank copy of
-- the Paid Ads table with the same rows (Initiation Rate, Lead Rate, ...).
-- A client_campaigns row is now one (campaign section, Paid Ads metric)
-- pair; its label, value type and order come from the metric. Values,
-- comments and paste history stay keyed by the client_campaigns row id, so
-- nothing about cells changes.
--
-- metric_id stays nullable here so the earlier free-form rows can be
-- converted by scripts/convert_campaign_rows.mjs; the app ignores rows
-- without one.
alter table client_campaigns
	add column metric_id uuid references paid_ads_metrics (id) on delete cascade;

create unique index client_campaigns_group_id_metric_id_key on client_campaigns (group_id, metric_id);
