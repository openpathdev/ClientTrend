-- Manual, per-client Go-live Date shown under the CSM chip in the client
-- detail header. Not HubSpot-owned, and distinct from paid_ads_go_live_date
-- (which is specific to the Paid Ads program).
alter table clients
	add column go_live_date date;
