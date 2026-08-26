/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

declare namespace App {
	interface Locals {
		/** Set by src/middleware.ts after verifying Cloudflare Access (PRD §23). */
		userEmail: string;
	}
}
