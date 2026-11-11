-- Ad Changes (2026-11-11): CSMs log ad-specific changes separately from the
-- general "List of changes". Same shape as a general change, so it lives in
-- the same table with a `kind` discriminator rather than a parallel table;
-- every existing row is a general change.
alter table changes
	add column kind text not null default 'general' check (kind in ('general', 'ad'));
drop index if exists changes_client_id_idx;
create index changes_client_id_kind_idx on changes (client_id, kind);
