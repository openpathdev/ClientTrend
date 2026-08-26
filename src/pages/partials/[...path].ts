export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import app from "../../server/app";

/**
 * Delegates every /partials/* request (HTMX fragment responses) to the
 * same Hono app as /api/* (PRD §16, §18) — one Hono instance, one place
 * routes/business logic live, regardless of which path prefix a given
 * interaction uses.
 */
export const ALL: APIRoute = ({ request, locals }) => {
	return app.fetch(request, { ...env, userEmail: locals.userEmail ?? null });
};
