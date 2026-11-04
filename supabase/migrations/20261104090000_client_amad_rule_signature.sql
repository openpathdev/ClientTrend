-- Automatic status from the manually entered AM/AD total (2026-11-04, see
-- src/server/amadStatusRule.ts). Stores a fingerprint of the inputs the rule
-- last acted on (the 3 months used, their values, the AM/AD baseline), so
-- the rule only re-applies a status when those inputs change — a CSM's
-- manual status choice sticks until then, even across the daily re-check.
alter table clients add column amad_rule_signature text;
