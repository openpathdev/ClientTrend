import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { verifyAccessRequest } from "./server/access";

/**
 * Single point of Cloudflare Access verification for every request —
 * both full-page Astro routes and anything forwarded to Hono
 * (/api/*, /partials/*). In production Access itself blocks
 * unauthenticated requests before they reach the Worker; this is
 * defense-in-depth plus the mechanism for extracting the verified
 * identity (PRD §23).
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const userEmail = await verifyAccessRequest(context.request, env);
	if (!userEmail) {
		return new Response("Unauthorized", { status: 401 });
	}
	context.locals.userEmail = userEmail;
	return next();
});
