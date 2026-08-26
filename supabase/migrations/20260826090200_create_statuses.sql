-- Client statuses. Decided model (PRD §6/§8, §20): labels are the literal
-- values "1"-"4", not a health scale, not ordered good-to-bad — all four
-- share one uniform pill color rather than being color-coded individually.
-- Remains fully configurable/renamable via this table.

create table statuses (
	id uuid primary key default gen_random_uuid(),
	name text not null unique,
	color text not null,
	description text,
	sort_order int not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger statuses_set_updated_at
	before update on statuses
	for each row
	execute function set_updated_at();

-- Seed: uniform slate color across all four — swap freely, it's just data.
insert into statuses (name, color, sort_order) values
	('1', '#64748b', 1),
	('2', '#64748b', 2),
	('3', '#64748b', 3),
	('4', '#64748b', 4);
