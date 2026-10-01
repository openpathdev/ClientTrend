import { createClient } from "@supabase/supabase-js";
import type { CloudflareBindings } from "./bindings";

const CLOCK_SKEW_MESSAGE = "JWT issued at future";
const CLOCK_SKEW_RETRY_DELAYS_MS = [400, 1000];

/**
 * Retries a Supabase request that was rejected with "JWT issued at future".
 * With the new `sb_secret_` API keys, Supabase's gateway mints a short-lived
 * JWT stamped with its own clock; when the database API's clock lags it by a
 * fraction of a second, the request is rejected outright (seen live
 * 2026-10-01 as an intermittent 500 on the Overview page). A rejected request
 * never executed, so retrying is safe for writes too. Only a 401 whose body
 * carries that exact message is retried — everything else passes straight
 * through untouched.
 */
export function withClockSkewRetry(
	fetchImpl: typeof fetch,
	sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): typeof fetch {
	return async (input, init) => {
		let res = await fetchImpl(input, init);
		for (const delay of CLOCK_SKEW_RETRY_DELAYS_MS) {
			if (res.status !== 401) return res;
			const body = await res.clone().text();
			if (!body.includes(CLOCK_SKEW_MESSAGE)) return res;
			await sleep(delay);
			res = await fetchImpl(input, init);
		}
		return res;
	};
}

/**
 * Server-only Supabase client using the service_role key (PRD §24) —
 * never constructed anywhere reachable from the browser. RLS is enabled
 * with zero policies on every table (PRD §20); service_role bypasses it,
 * which is exactly the access this client is meant to have.
 */
export function createSupabaseClient(env: CloudflareBindings) {
	return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
		global: { fetch: withClockSkewRetry((input, init) => fetch(input, init)) },
	});
}
