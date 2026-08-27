-- Correction (2026-08-30): the HubSpot metric names from the "Performance"
-- design reference (Sessions, Initiations, etc.) were wrong — the actual
-- correct names are the original Phase 0 ones. Renaming the 8 existing
-- HubSpot-sourced metrics in place (UPDATE, not delete+reinsert) so any
-- existing monthly_data_values — which reference metric_id, not key/label —
-- keep working under their new names with no data loss.
--
-- Also adds three named row-header sections (Top/Middle/Bottom of Funnel)
-- via a plain nullable `group_label` column, same "small config value, not
-- a lookup table" reasoning used elsewhere (comments.section,
-- changes.category) — the table renderer inserts a header row whenever
-- group_label changes between consecutive metrics (by sort_order).
--
-- One new HubSpot-sourced metric added: Hubspot Submission Clients.

alter table monthly_metrics add column group_label text;
alter table paid_ads_metrics add column group_label text; -- schema parity; stays null/unused for Paid Ads today

-- Top of Funnel
update monthly_metrics set key = 'unique_visitors', label = 'Unique Visitors', group_label = 'Top of Funnel', sort_order = 1 where key = 'sessions';
update monthly_metrics set key = 'widget_clicks', label = 'Widget Clicks', group_label = 'Top of Funnel', sort_order = 2 where key = 'initiations';
update monthly_metrics set key = 'widget_click_pct', label = 'Widget Click %', group_label = 'Top of Funnel', sort_order = 3 where key = 'organic_initiation_rate';
update monthly_metrics set key = 'unique_clients', label = 'Unique Clients', group_label = 'Top of Funnel', sort_order = 4 where key = 'conversations';
update monthly_metrics set key = 'click_to_convo_pct', label = 'Click to Convo %', group_label = 'Top of Funnel', sort_order = 5 where key = 'convo_rate';

-- Middle of Funnel
update monthly_metrics set key = 'appointment_pct', label = 'Appointment %', group_label = 'Middle of Funnel', sort_order = 6 where key = 'scheduled_pct';
update monthly_metrics set key = 'am_ad', label = 'AM/AD', group_label = 'Middle of Funnel', sort_order = 7 where key = 'am_ad_conversations';
update monthly_metrics set key = 'av_am_ad', label = 'AV/AM/AD', group_label = 'Middle of Funnel', sort_order = 8 where key = 'av_am_ad_conversations';
update monthly_metrics set group_label = 'Middle of Funnel', sort_order = 9 where key = 'walk_ins';
update monthly_metrics set group_label = 'Middle of Funnel', sort_order = 10 where key = 'phone_calls';
update monthly_metrics set group_label = 'Middle of Funnel', sort_order = 11 where key = 'form_fills';

-- Bottom of Funnel
update monthly_metrics set group_label = 'Bottom of Funnel', sort_order = 12 where key = 'center_feedback_new_clients';
update monthly_metrics set group_label = 'Bottom of Funnel', sort_order = 13 where key = 'pregnancy_tests';
update monthly_metrics set group_label = 'Bottom of Funnel', sort_order = 14 where key = 'ultrasounds';
update monthly_metrics set group_label = 'Bottom of Funnel', sort_order = 15 where key = 'center_feedback_am_ad';

insert into monthly_metrics (key, label, value_type, source, group_label, sort_order) values
	('hubspot_submission_clients', 'Hubspot Submission Clients', 'integer', 'hubspot', 'Bottom of Funnel', 16);
