-- Tracks the 2 website-product purchase flags from HubSpot (PRD §14) so the
-- Overview page can filter to real clients without a live HubSpot call per
-- page render. `purchased_website` (the generic/legacy import-eligibility
-- flag) is deliberately NOT tracked here — only the two actual product
-- tiers matter for this filter (2026-08-28 user decision).
alter table clients
	add column hubspot_purchased_pro_website boolean not null default false,
	add column hubspot_purchased_base_website boolean not null default false;
