import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { verifyAccessRequest } from "./server/access";

const HUBSPOT_SYNC_TRIGGER_PATH = "/api/admin/hubspot-sync/run";
const HUBSPOT_WEBHOOK_PATH = "/api/webhooks/hubspot/company";
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
 * Two deliberate carve-outs, both called by machines rather than a
 * browser and unable to do Cloudflare Access's interactive login, but
 * authenticated differently:
 * - The HubSpot sync-trigger route (`.../hubspot-sync/run`), called by an
 *   external cron — Astro's Cloudflare adapter has no `scheduled()` hook
 *   to attach a native Cron Trigger to instead (see that route's comment
 *   in app.ts). Authenticated via a shared secret header, since there's no
 *   HubSpot-side signing available for an arbitrary external cron caller.
 * - The HubSpot company-auto-import webhook (`.../webhooks/hubspot/company`),
 *   a native HubSpot app-level CRM property-change subscription (Company
 *   `csm`). This one is authenticated INSIDE the route itself, via
 *   `verifyHubspotWebhookSignature` (HubSpot's real HMAC signature, not a
 *   shared secret) — the middleware only needs to skip the Access check
 *   for it, since Access verification would otherwise reject HubSpot's
 *   servers outright (no interactive login possible).
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);

	if (url.pathname === HUBSPOT_SYNC_TRIGGER_PATH) {
		const providedSecret = context.request.headers.get(SYNC_SECRET_HEADER) ?? url.searchParams.get("secret");
		if (!env.HUBSPOT_SYNC_SECRET || providedSecret !== env.HUBSPOT_SYNC_SECRET) {
			return new Response("Unauthorized", { status: 401 });
		}
		context.locals.userEmail = SYNC_SYSTEM_IDENTITY;
		return next();
	}

	if (url.pathname === HUBSPOT_WEBHOOK_PATH) {
		// Real auth happens inside the route (HMAC signature verification) —
		// this only exempts HubSpot's servers from Cloudflare Access's
		// interactive login, which they can't perform.
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
