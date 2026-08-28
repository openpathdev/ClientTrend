import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { verifyAccessRequest } from "./server/access";

const HUBSPOT_SYNC_TRIGGER_PATH = "/api/admin/hubspot-sync/run";
const SYNC_SECRET_HEADER = "X-Sync-Secret";
const SYNC_SYSTEM_IDENTITY = "hubspot-sync@system";

/**
 * Single point of Cloudflare Access verification for every request —
 * both full-page Astro routes and anything forwarded to Hono
 * (/api/*, /partials/*). In production Access itself blocks
 * unauthenticated requests before they reach the Worker; this is
 * defense-in-depth plus the mechanism for extracting the verified
 * identity (PRD §23).
 *
 * One deliberate carve-out: the HubSpot sync-trigger route is called by an
 * external cron (a machine, not a browser), which can't participate in
 * Cloudflare Access's interactive login flow — Astro's Cloudflare adapter
 * has no `scheduled()` hook to attach a native Cron Trigger to instead
 * (see that route's comment in app.ts for the full reasoning). It's
 * authenticated separately, via a shared secret header checked against
 * `HUBSPOT_SYNC_SECRET`, rather than an Access JWT.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);
	if (url.pathname === HUBSPOT_SYNC_TRIGGER_PATH) {
		const providedSecret = context.request.headers.get(SYNC_SECRET_HEADER);
		if (!env.HUBSPOT_SYNC_SECRET || providedSecret !== env.HUBSPOT_SYNC_SECRET) {
			return new Response("Unauthorized", { status: 401 });
		}
		context.locals.userEmail = SYNC_SYSTEM_IDENTITY;
		return next();
	}

	const userEmail = await verifyAccessRequest(context.request, env);
	if (!userEmail) {
		return new Response("Unauthorized", { status: 401 });
	}
	context.locals.userEmail = userEmail;
	return next();
});
