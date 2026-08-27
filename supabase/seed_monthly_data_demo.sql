-- THROWAWAY demo data — Monthly Data values for Northgate Health, trailing
-- 6 of the last 12 months, so the Performance table has something to show
-- for Phase 4 visual verification. Same status as seed_demo_data.sql: not
-- a migration, delete once Phase 6 HubSpot import provides real data.
--
-- Adjust the month values below if today's date has moved on since this
-- was written (2026-08-27) — they're meant to land within the trailing
-- 12-month window the app actually queries.
--
-- Each statement repeats its own WITH prologue — a WITH clause only
-- attaches to the single statement immediately following it, not to every
-- statement in the script (that's what caused the first attempt to fail).

with target_client as (
	select id from clients where name = 'Northgate Health'
),
metric_values (metric_key, month, val) as (
	values
		('sessions', '2026-03-01', 4390), ('sessions', '2026-04-01', 4712), ('sessions', '2026-05-01', 4980), ('sessions', '2026-06-01', 5104), ('sessions', '2026-07-01', 5210), ('sessions', '2026-08-01', 5340),
		('initiations', '2026-03-01', 275), ('initiations', '2026-04-01', 312), ('initiations', '2026-05-01', 336), ('initiations', '2026-06-01', 348), ('initiations', '2026-07-01', 355), ('initiations', '2026-08-01', 362),
		('organic_initiation_rate', '2026-03-01', 6.3), ('organic_initiation_rate', '2026-04-01', 6.6), ('organic_initiation_rate', '2026-05-01', 6.7), ('organic_initiation_rate', '2026-06-01', 6.8), ('organic_initiation_rate', '2026-07-01', 6.8), ('organic_initiation_rate', '2026-08-01', 6.9),
		('conversations', '2026-03-01', 149), ('conversations', '2026-04-01', 171), ('conversations', '2026-05-01', 186), ('conversations', '2026-06-01', 194), ('conversations', '2026-07-01', 199), ('conversations', '2026-08-01', 205),
		('convo_rate', '2026-03-01', 54.2), ('convo_rate', '2026-04-01', 54.8), ('convo_rate', '2026-05-01', 55.4), ('convo_rate', '2026-06-01', 55.7), ('convo_rate', '2026-07-01', 56.1), ('convo_rate', '2026-08-01', 56.3),
		('scheduled_pct', '2026-03-01', 39.2), ('scheduled_pct', '2026-04-01', 41.8), ('scheduled_pct', '2026-05-01', 43.9), ('scheduled_pct', '2026-06-01', 44.2), ('scheduled_pct', '2026-07-01', 45.0), ('scheduled_pct', '2026-08-01', 45.6),
		('am_ad_conversations', '2026-03-01', 61), ('am_ad_conversations', '2026-04-01', 68), ('am_ad_conversations', '2026-05-01', 72), ('am_ad_conversations', '2026-06-01', 75), ('am_ad_conversations', '2026-07-01', 77), ('am_ad_conversations', '2026-08-01', 79),
		('av_am_ad_conversations', '2026-03-01', 88), ('av_am_ad_conversations', '2026-04-01', 96), ('av_am_ad_conversations', '2026-05-01', 101), ('av_am_ad_conversations', '2026-06-01', 105), ('av_am_ad_conversations', '2026-07-01', 108), ('av_am_ad_conversations', '2026-08-01', 111)
)
insert into monthly_data_values (client_id, metric_id, month, value, updated_by)
select (select id from target_client), m.id, mv.month::date, mv.val, 'seed@localhost'
from metric_values mv
join monthly_metrics m on m.key = mv.metric_key;

with target_client as (
	select id from clients where name = 'Northgate Health'
),
metric_text_values (metric_key, month, val_text) as (
	values
		('pregnancy_tests', '2026-03-01', '23'), ('pregnancy_tests', '2026-04-01', '29'), ('pregnancy_tests', '2026-05-01', '32'), ('pregnancy_tests', '2026-06-01', '35'), ('pregnancy_tests', '2026-07-01', '33'), ('pregnancy_tests', '2026-08-01', '37'),
		('ultrasounds', '2026-03-01', '15'), ('ultrasounds', '2026-04-01', '21'), ('ultrasounds', '2026-05-01', '23'), ('ultrasounds', '2026-06-01', '25'), ('ultrasounds', '2026-07-01', '24'), ('ultrasounds', '2026-08-01', '27'),
		('center_feedback_am_ad', '2026-03-01', '13'), ('center_feedback_am_ad', '2026-04-01', '17'), ('center_feedback_am_ad', '2026-05-01', '19'), ('center_feedback_am_ad', '2026-06-01', '21'), ('center_feedback_am_ad', '2026-07-01', '20'), ('center_feedback_am_ad', '2026-08-01', '22'),
		('walk_ins', '2026-05-01', '8'), ('walk_ins', '2026-06-01', '11'), ('walk_ins', '2026-07-01', '9'), ('walk_ins', '2026-08-01', '12'),
		('form_fills', '2026-06-01', '14'), ('form_fills', '2026-07-01', '16'), ('form_fills', '2026-08-01', '18')
)
insert into monthly_data_values (client_id, metric_id, month, value_text, updated_by)
select (select id from target_client), m.id, tv.month::date, tv.val_text, 'seed@localhost'
from metric_text_values tv
join monthly_metrics m on m.key = tv.metric_key;
