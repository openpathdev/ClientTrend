-- Two more Overview card integration checkboxes (see
-- 20260911090000_integration_flags.sql): Clara and CoolFocus.
alter table clients
	add column integration_clara boolean not null default false,
	add column integration_coolfocus boolean not null default false;
