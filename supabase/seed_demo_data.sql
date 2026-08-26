-- THROWAWAY demo data for visually verifying the Phase 2 Overview page.
-- Not a migration, not part of supabase/migrations/ — real clients only
-- ever come from the Phase 6 HubSpot import (PRD §14/§36), which doesn't
-- exist yet. Safe to delete this data (or the rows it creates) once that
-- exists. Run this AFTER 20260826140000_status_model_healthy_watch_attention.sql.

insert into csms (name, email) values
	('Priya Raman', 'priya.raman@example.com'),
	('Marcus Ellery', 'marcus.ellery@example.com'),
	('Dana Whitfield', 'dana.whitfield@example.com'),
	('Jonah Baptiste', 'jonah.baptiste@example.com');

insert into clients (name, website, population, domain_authority, legal_status, csm_id, status_id, state_code) values
	('Northgate Health', 'northgatehealth.org', 412000, 64, 'LLC',
		(select id from csms where name = 'Priya Raman'),
		(select id from statuses where name = 'Healthy'), 'OH'),
	('Cedar Ridge Dental', 'cedarridgedental.com', 88400, 31, 'PLLC',
		(select id from csms where name = 'Marcus Ellery'),
		(select id from statuses where name = 'Watch'), 'CO'),
	('Bluestem Legal', 'bluestemlegal.com', 1240000, 58, 'LLP',
		(select id from csms where name = 'Priya Raman'),
		(select id from statuses where name = 'Healthy'), 'TX'),
	('Harbor Point Realty', 'harborpointrealty.com', 203500, 22, 'S-Corp',
		(select id from csms where name = 'Dana Whitfield'),
		(select id from statuses where name = 'Needs attention'), 'FL'),
	('Fairview Orthopedics', 'fairviewortho.com', 655000, 47, 'LLC',
		(select id from csms where name = 'Marcus Ellery'),
		(select id from statuses where name = 'Healthy'), 'TN'),
	('Lakeside Veterinary', 'lakesidevet.net', 54200, 18, 'LLC',
		(select id from csms where name = 'Dana Whitfield'),
		(select id from statuses where name = 'Needs attention'), 'MI'),
	('Summit Financial', 'summitfin.com', 930000, 71, 'Corporation',
		(select id from csms where name = 'Priya Raman'),
		(select id from statuses where name = 'Healthy'), 'TX'),
	('Willow Creek Spa', 'willowcreekspa.com', 37800, 26, 'LLC',
		(select id from csms where name = 'Jonah Baptiste'),
		(select id from statuses where name = 'Watch'), 'CO'),
	('Ironworks Manufacturing', 'ironworksmfg.com', 148900, 39, 'LLC',
		(select id from csms where name = 'Jonah Baptiste'),
		(select id from statuses where name = 'Healthy'), 'OH'),
	('Prairie Wind Insurance', 'prairiewindins.com', 76200, 34, 'LLC',
		(select id from csms where name = 'Marcus Ellery'),
		(select id from statuses where name = 'Watch'), 'KS'),
	('Redstone Physical Therapy', 'redstonept.com', 61500, 29, 'PLLC',
		(select id from csms where name = 'Dana Whitfield'),
		(select id from statuses where name = 'Healthy'), 'CO'),
	('Maple & Vine Events', 'mapleandvine.co', 22300, 19, 'LLC',
		(select id from csms where name = 'Jonah Baptiste'),
		(select id from statuses where name = 'Needs attention'), 'MI');
