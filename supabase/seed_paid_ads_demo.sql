-- THROWAWAY demo data — Paid Ads values + settings for Northgate Health,
-- same status as the other seed_*.sql files: not a migration, delete once
-- real data exists. All Paid Ads metrics are text-typed (PRD §20 decision),
-- so values are stored exactly as a CSM would type them ("$8.40", "7.1%"),
-- not coerced to numbers.

update clients
set ad_spend_per_month = 2400, paid_ads_go_live_date = '2026-01-22'
where name = 'Northgate Health';

with target_client as (
	select id from clients where name = 'Northgate Health'
),
metric_text_values (metric_key, month, val_text) as (
	values
		('initiation_rate', '2026-03-01', '7.4%'), ('initiation_rate', '2026-04-01', '8.2%'), ('initiation_rate', '2026-05-01', '8.5%'), ('initiation_rate', '2026-06-01', '8.9%'), ('initiation_rate', '2026-07-01', '9.0%'), ('initiation_rate', '2026-08-01', '9.2%'),
		('lead_rate', '2026-03-01', '3.4%'), ('lead_rate', '2026-04-01', '3.8%'), ('lead_rate', '2026-05-01', '4.0%'), ('lead_rate', '2026-06-01', '4.2%'), ('lead_rate', '2026-07-01', '4.3%'), ('lead_rate', '2026-08-01', '4.5%'),
		('leads_text', '2026-03-01', '45'), ('leads_text', '2026-04-01', '55'), ('leads_text', '2026-05-01', '59'), ('leads_text', '2026-06-01', '63'), ('leads_text', '2026-07-01', '65'), ('leads_text', '2026-08-01', '68'),
		('sessions_clicks', '2026-03-01', '1,388'), ('sessions_clicks', '2026-04-01', '1,502'), ('sessions_clicks', '2026-05-01', '1,566'), ('sessions_clicks', '2026-06-01', '1,611'), ('sessions_clicks', '2026-07-01', '1,640'), ('sessions_clicks', '2026-08-01', '1,672'),
		('cpc', '2026-03-01', '$10.60'), ('cpc', '2026-04-01', '$9.10'), ('cpc', '2026-05-01', '$8.70'), ('cpc', '2026-06-01', '$8.20'), ('cpc', '2026-07-01', '$8.05'), ('cpc', '2026-08-01', '$7.90'),
		('ctr', '2026-03-01', '4.6%'), ('ctr', '2026-04-01', '5.9%'), ('ctr', '2026-05-01', '6.2%'), ('ctr', '2026-06-01', '6.5%'), ('ctr', '2026-07-01', '6.6%'), ('ctr', '2026-08-01', '6.8%')
)
insert into paid_ads_data_values (client_id, metric_id, month, value_text, updated_by)
select (select id from target_client), m.id, tv.month::date, tv.val_text, 'seed@localhost'
from metric_text_values tv
join paid_ads_metrics m on m.key = tv.metric_key;
