-- Supersedes the original Phase 0 status decision (numeric "1"-"4", single
-- uniform color) with the Cool Slate 3-tier named model from
-- ClientTrends-StyleGuide.pdf: Healthy / Watch / Needs attention, each
-- carrying four color values (line/text/tint/halo) plus an icon key.
--
-- Safe to `delete from statuses` here because `clients` is still empty at
-- this point in the project (Phase 6 HubSpot import, the only way clients
-- get created, doesn't exist yet) — this statement would need to change to
-- an UPDATE-based remap if run after real clients exist.

alter table statuses
	add column icon text,
	add column color_line text,
	add column color_text text,
	add column color_tint text,
	add column color_halo text,
	drop column color;

delete from statuses;

insert into statuses (name, description, icon, color_line, color_text, color_tint, color_halo, sort_order) values
	('Healthy', 'On plan, no action needed', 'like', '#599291', '#1B575A', '#E0F5F6', '#CFEDEF', 1),
	('Watch', 'Drifting, check next cycle', 'search', '#A99F74', '#5E5531', '#F5F3E0', '#EFEBD0', 2),
	('Needs attention', 'Off plan, act now', 'error-circle', '#A4666E', '#753C44', '#FFEAEC', '#FDE0E2', 3);

alter table statuses
	alter column icon set not null,
	alter column color_line set not null,
	alter column color_text set not null,
	alter column color_tint set not null,
	alter column color_halo set not null;
