import { createClient } from "@supabase/supabase-js";
import type { CloudflareBindings } from "./bindings";

/**
 * Server-only Supabase client using the service_role key (PRD §24) —
 * never constructed anywhere reachable from the browser. RLS is enabled
 * with zero policies on every table (PRD §20); service_role bypasses it,
 * which is exactly the access this client is meant to have.
 */
export function createSupabaseClient(env: CloudflareBindings) {
	return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
	});
}
