-- Extensions and shared helpers used by every later migration.

create extension if not exists pgcrypto;

-- Generic trigger to keep `updated_at` current on every UPDATE, so
-- individual tables don't each need their own copy of this logic.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;
