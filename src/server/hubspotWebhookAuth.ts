import type { CloudflareBindings } from "./bindings";

const SIGNATURE_HEADER = "X-HubSpot-Signature-v3";
const TIMESTAMP_HEADER = "X-HubSpot-Request-Timestamp";
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Verifies a HubSpot v3 webhook signature (PRD §14) — the native app-level
 * CRM property-change webhook (Company `csm`), NOT the Workflow "Send a
 * webhook" action (which can't sign requests, hence that path used a
 * shared secret instead — see the sync-trigger route). HubSpot signs with
 * HMAC-SHA256 over `${method}${fullRequestUrl}${rawBody}${timestamp}`
 * using the app's Client Secret, base64-encoded — confirmed empirically
 * against 3 real production webhook deliveries (2026-08-29): the request's
 * *full absolute URL* (`request.url`, e.g.
 * `https://.../api/webhooks/hubspot/company`), not just the path+query,
 * is what HubSpot actually signs over — a path-only source string never
 * matched a single real delivery. The timestamp is also checked for
 * staleness to reject replayed requests.
 */
export async function verifyHubspotWebhookSignature(
	request: Request,
	rawBody: string,
	env: CloudflareBindings,
): Promise<boolean> {
	const signature = request.headers.get(SIGNATURE_HEADER);
	const timestamp = request.headers.get(TIMESTAMP_HEADER);
	if (!signature || !timestamp || !env.HUBSPOT_WEBHOOK_CLIENT_SECRET) return false;

	const age = Date.now() - Number(timestamp);
	if (!Number.isFinite(age) || age < 0 || age > MAX_TIMESTAMP_AGE_MS) return false;

	const sourceString = `${request.method}${request.url}${rawBody}${timestamp}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(env.HUBSPOT_WEBHOOK_CLIENT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sourceString));
	const computed = btoa(String.fromCharCode(...new Uint8Array(digest)));

	return computed === signature;
}
