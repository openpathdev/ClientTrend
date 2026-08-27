-- Per-cell highlight color + per-cell comments, superseding the month-level
-- comment model from 20260828090000_monthly_data_and_comments.sql (PRD §12).
--
-- Highlight: nullable FK straight to the existing `statuses` table
-- (Healthy/Watch/Needs Attention) — a pure per-cell annotation, NOT the
-- client's own status_id on `clients`. Real FK is safe here since
-- `statuses` is a single shared table, no polymorphism.
alter table monthly_data_values
	add column status_id uuid references statuses (id) on delete set null;

alter table paid_ads_data_values
	add column status_id uuid references statuses (id) on delete set null;

-- Comments now belong to (client, section, metric, month) — a specific
-- cell — not just (client, section, month). `metric_id` has NO foreign key
-- constraint: it references either monthly_metrics.id or
-- paid_ads_metrics.id depending on `section`, and Postgres can't express a
-- single FK across two tables. This mirrors the existing
-- `comments.section` / `changes.category` pattern of a plain,
-- app-enforced column instead of a lookup table — every write path
-- validates metricId against the correct catalog in the route handler,
-- the same way the existing monthly-data/paid-ads PUT routes already
-- validate metricId today.
--
-- Confirmed live (2026-08-31): comments table has 0 rows, so this is a
-- no-op against real data, not a data-loss step.
delete from comments;

alter table comments
	add column metric_id uuid not null;

drop index if exists comments_client_id_section_month_idx;
create index comments_client_id_section_metric_month_idx
	on comments (client_id, section, metric_id, month);
