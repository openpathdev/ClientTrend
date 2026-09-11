-- Manual, per-client toggles shown as checkboxes on the Overview card (not
-- HubSpot-owned, not derived from any metric) — which external systems a
-- given center is on: HS, IW, Acuity, Ekyros.
alter table clients
	add column integration_hs boolean not null default false,
	add column integration_iw boolean not null default false,
	add column integration_acuity boolean not null default false,
	add column integration_ekyros boolean not null default false;
