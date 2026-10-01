-- New manually-entered "STI" Performance row directly above Walk-Ins in
-- Middle of Funnel (2026-10-01 user request). Walk-Ins and everything after
-- it shift down one sort_order slot to make room.
update monthly_metrics set sort_order = sort_order + 1 where sort_order >= 9;

insert into monthly_metrics (key, label, value_type, source, group_label, sort_order) values
	('sti', 'STI', 'text', 'manual', 'Middle of Funnel', 9);
