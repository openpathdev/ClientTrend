/**
 * `Env` (Cloudflare Worker bindings/secrets) is declared globally by
 * `worker-configuration.d.ts`, generated via `npm run generate-types`
 * (wrangler reads wrangler.jsonc + .dev.vars). See PRD §40.
 */
export type CloudflareBindings = Env;

/**
 * What's actually passed as Hono's `c.env` — the raw Cloudflare bindings
 * plus the already-verified identity from Astro's auth middleware
 * (src/middleware.ts), so Hono never re-verifies the Access JWT itself.
 */
export type HonoBindings = CloudflareBindings & {
	userEmail: string | null;
};

export type Variables = {
	userEmail: string;
};

export type AppEnv = {
	Bindings: HonoBindings;
	Variables: Variables;
};
