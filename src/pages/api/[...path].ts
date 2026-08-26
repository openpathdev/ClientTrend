export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import app from "../../server/app";

/**
 * Delegates every /api/* request to the Hono app (PRD §16, §18).
 * Identity is already verified by src/middleware.ts; we just carry it
 * into Hono's `c.env` rather than re-verifying the Access JWT here.
 */
export const ALL: APIRoute = ({ request, locals }) => {
	return app.fetch(request, { ...env, userEmail: locals.userEmail ?? null });
};
